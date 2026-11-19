// Web Push with no packages: VAPID (RFC 8292) to say who's sending, and the
// aes128gcm payload encryption of RFC 8291 so only the phone can read it.
// Works for the browser install on Android and desktop, and on iPhone once
// the app is on the Home Screen (iOS 16.4 and newer).

import crypto from 'node:crypto';

const b64url = (buf) => Buffer.from(buf).toString('base64url');
const unb64url = (text) => Buffer.from(text, 'base64url');

// Only the browser makers' push services. A subscription naming any other host
// is turned away, so nobody can point the server at an address of their choice.
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^android\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^(.+\.)?push\.apple\.com$/,
  /^(.+\.)?notify\.windows\.com$/,
];

export function validSubscription(sub) {
  try {
    const url = new URL(sub.endpoint);
    if (url.protocol !== 'https:' || url.port || !PUSH_HOSTS.some((re) => re.test(url.hostname))) return false;
    return unb64url(sub.p256dh).length === 65 && unb64url(sub.auth).length === 16 && sub.endpoint.length <= 1000;
  } catch {
    return false;
  }
}

/** The server's VAPID key pair, made once and kept in the settings table. */
export function vapidKeys(store) {
  const saved = store.get("SELECT value FROM settings WHERE key = 'vapid'");
  if (saved) return keysFrom(JSON.parse(saved.value));
  const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = privateKey.export({ format: 'jwk' });
  store.run("INSERT INTO settings (key, value) VALUES ('vapid', ?)", JSON.stringify(jwk));
  return keysFrom(jwk);
}

function keysFrom(jwk) {
  return {
    privateKey: crypto.createPrivateKey({ key: jwk, format: 'jwk' }),
    publicKey: b64url(Buffer.concat([Buffer.from([4]), unb64url(jwk.x), unb64url(jwk.y)])),
  };
}

/** RFC 8291: the encrypted body for one subscription. `as` and `salt` are for tests. */
export function encrypt(payload, { p256dh, auth }, { as = null, salt = crypto.randomBytes(16) } = {}) {
  const uaPublic = unb64url(p256dh);
  const authSecret = unb64url(auth);
  const ecdh = crypto.createECDH('prime256v1');
  if (as) ecdh.setPrivateKey(unb64url(as));
  else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(uaPublic);
  const hkdf = (ikm, salt_, info, length) => Buffer.from(crypto.hkdfSync('sha256', ikm, salt_, info, length));
  const ikm = hkdf(shared, authSecret, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]), 32);
  const cek = hkdf(ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12);
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(4096, 16);
  header[20] = asPublic.length;
  return Buffer.concat([header, asPublic, body]);
}

/** RFC 8292: the Authorization header for one push service. */
export function vapidHeader(endpoint, keys, subject, now = new Date()) {
  const aud = new URL(endpoint).origin;
  const exp = Math.floor(now.getTime() / 1000) + 12 * 3600;
  const unsigned = `${b64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))}.${b64url(JSON.stringify({ aud, exp, sub: subject }))}`;
  const signature = crypto.sign('sha256', Buffer.from(unsigned), { key: keys.privateKey, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${unsigned}.${b64url(signature)}, k=${keys.publicKey}`;
}

/**
 * Sends notifications to every phone a player turned them on for. Push
 * services that say a subscription is gone (404, 410) get it deleted.
 */
export function createPush({ store, subject, fetch = globalThis.fetch, log = console, enabled = true }) {
  let keys = null;
  const key = () => (keys ??= vapidKeys(store));
  return {
    publicKey: () => key().publicKey,
    async send(userId, message) {
      if (!enabled) return 0;
      const subs = store.all('SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?', userId);
      let sent = 0;
      await Promise.all(subs.map(async (sub) => {
        try {
          const res = await fetch(sub.endpoint, {
            method: 'POST',
            headers: {
              Authorization: vapidHeader(sub.endpoint, key(), subject),
              'Content-Encoding': 'aes128gcm',
              'Content-Type': 'application/octet-stream',
              TTL: '86400',
              Urgency: 'normal',
            },
            body: encrypt(JSON.stringify(message), sub),
            signal: AbortSignal.timeout(10_000),
          });
          if (res.status === 404 || res.status === 410) store.run('DELETE FROM push_subscriptions WHERE id = ?', sub.id);
          else if (res.ok) sent += 1;
          else log.warn(`push to ${new URL(sub.endpoint).hostname} answered ${res.status}`);
        } catch (err) {
          log.warn(`push failed: ${err.message}`);
        }
      }));
      return sent;
    },
  };
}
