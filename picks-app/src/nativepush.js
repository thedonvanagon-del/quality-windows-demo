// Push to the App Store and Google Play apps, with no packages: Apple's APNs
// over HTTP/2 with a signed token (the .p8 key), and Google's FCM HTTP v1
// API with an OAuth token from a service account. Each is off until its keys
// are set; the web push in push.js doesn't change.
//
// The app (mobile/) hands the server its device token through
// POST /push/native, kept in device_tokens. A service that says a token is
// dead (APNs 410 or BadDeviceToken, FCM UNREGISTERED) gets it deleted.

import crypto from 'node:crypto';
import fs from 'node:fs';
import http2 from 'node:http2';

export const APNS_ORIGIN = 'https://api.push.apple.com';
export const APNS_SANDBOX_ORIGIN = 'https://api.sandbox.push.apple.com';
export const DEFAULT_BUNDLE_ID = 'com.bookiebullies.lockbox';
export const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
export const FCM_TOKEN_URI = 'https://oauth2.googleapis.com/token';
// The Android notification channel the app makes on first launch (MainActivity).
export const ANDROID_CHANNEL = 'game_alerts';
// Devices kept per player. A new one past this drops the one seen longest ago.
export const MAX_DEVICES = 10;
// Apple wants a fresh token at most every 20 minutes and refuses one older than an hour.
const APNS_JWT_MS = 50 * 60_000;
const TIMEOUT_MS = 10_000;

const b64url = (data) => Buffer.from(data).toString('base64url');

// ---- device tokens ----------------------------------------------------------

// An APNs token is 32 bytes, sent as 64 hex characters. An FCM token is a
// long string of letters, digits, "-", "_" and ":" (about 150 to 200 today).
const TOKEN_SHAPE = {
  ios: /^[0-9a-f]{64}$/,
  android: /^[A-Za-z0-9_:-]{32,4096}$/,
};

export const PLATFORMS = Object.keys(TOKEN_SHAPE);

/** The token as stored ("ios" tokens in lower case), or null if it doesn't look right. */
export function cleanDeviceToken(platform, token) {
  if (!Object.hasOwn(TOKEN_SHAPE, platform) || typeof token !== 'string') return null;
  const value = platform === 'ios' ? token.trim().toLowerCase() : token.trim();
  return TOKEN_SHAPE[platform].test(value) ? value : null;
}

/**
 * Keep a device's token for a player. A token already on file moves to this
 * player (the phone signed in as someone else). Past MAX_DEVICES, the ones
 * seen longest ago go.
 */
export function saveDeviceToken(store, userId, platform, token, now = new Date()) {
  const at = now.toISOString();
  store.tx(() => {
    store.run(
      `INSERT INTO device_tokens (user_id, platform, token, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (token) DO UPDATE SET user_id = excluded.user_id, platform = excluded.platform, last_seen_at = excluded.last_seen_at`,
      userId, platform, token, at, at,
    );
    store.run(
      `DELETE FROM device_tokens WHERE user_id = ? AND id NOT IN
         (SELECT id FROM device_tokens WHERE user_id = ? ORDER BY last_seen_at DESC, id DESC LIMIT ?)`,
      userId, userId, MAX_DEVICES,
    );
  });
}

/**
 * Signing out on a phone: forget its token, whoever it was for. Only the
 * phone itself knows its token, so knowing it is enough.
 */
export function removeDeviceToken(store, token) {
  const value = String(token ?? '').trim();
  return Number(store.run('DELETE FROM device_tokens WHERE token = ? OR token = ?', value, value.toLowerCase()).changes);
}

export const deviceTokenCount = (store, userId) => store.get('SELECT COUNT(*) AS n FROM device_tokens WHERE user_id = ?', userId).n;

// ---- APNs -------------------------------------------------------------------

/** The provider token: an ES256 JWT, header {alg, kid}, claims {iss: team, iat}. */
export function apnsJwt({ keyId, teamId, privateKey }, now = new Date()) {
  const unsigned = `${b64url(JSON.stringify({ alg: 'ES256', kid: keyId }))}.${b64url(JSON.stringify({ iss: teamId, iat: Math.floor(now.getTime() / 1000) }))}`;
  const signature = crypto.sign('sha256', Buffer.from(unsigned), { key: privateKey, dsaEncoding: 'ieee-p1363' });
  return `${unsigned}.${b64url(signature)}`;
}

/** What the phone gets: the alert, the default sound, and the page to open. */
export function apnsPayload({ title, body, url }) {
  return { aps: { alert: { title: title ?? '', body: body ?? '' }, sound: 'default' }, ...(url ? { url } : {}) };
}

/**
 * POSTs over HTTP/2, one connection per origin, reused. `connect` is for
 * tests. Sessions are unref'd so they never hold the process open.
 */
export function http2Transport({ connect = http2.connect } = {}) {
  const sessions = new Map();
  function session(origin) {
    const open = sessions.get(origin);
    if (open && !open.closed && !open.destroyed) return open;
    const s = connect(origin);
    const forget = () => {
      if (sessions.get(origin) === s) sessions.delete(origin);
    };
    s.on('error', forget);
    s.on('close', forget);
    s.on('goaway', forget);
    s.unref?.();
    sessions.set(origin, s);
    return s;
  }
  return {
    request(origin, { path, headers = {}, body = '', timeoutMs = TIMEOUT_MS }) {
      return new Promise((resolve, reject) => {
        let req;
        try {
          req = session(origin).request({ ':method': 'POST', ':path': path, ...headers });
        } catch (err) {
          sessions.delete(origin);
          return reject(err);
        }
        let status = 0;
        const chunks = [];
        req.setTimeout(timeoutMs, () => {
          req.close(http2.constants.NGHTTP2_CANCEL);
          reject(new Error(`no answer from ${origin} in ${timeoutMs / 1000}s`));
        });
        req.on('response', (h) => {
          status = Number(h[':status']);
        });
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => resolve({ status, body: Buffer.concat(chunks).toString('utf8') }));
        req.on('error', reject);
        req.end(body);
      });
    },
    close() {
      for (const s of sessions.values()) s.close();
      sessions.clear();
    },
  };
}

// Answers that mean the token will never work again.
const APNS_DEAD = new Set(['BadDeviceToken', 'DeviceTokenNotForTopic', 'Unregistered', 'ExpiredToken']);

/**
 * Sends to one iPhone. `request(origin, {path, headers, body})` answers
 * {status, body}; the default speaks HTTP/2 to Apple.
 */
export function createApnsSender({ keyId, teamId, privateKey, bundleId = DEFAULT_BUNDLE_ID, sandbox = false, origin = null, request = null, now = () => new Date(), log = console }) {
  const key = typeof privateKey === 'string' ? crypto.createPrivateKey(privateKey) : privateKey;
  const host = origin ?? (sandbox ? APNS_SANDBOX_ORIGIN : APNS_ORIGIN);
  const transport = request ? null : http2Transport();
  const post = request ?? transport.request;
  let jwt = null;
  let madeAt = 0;
  const token = () => {
    const t = now().getTime();
    if (!jwt || t - madeAt >= APNS_JWT_MS) {
      jwt = apnsJwt({ keyId, teamId, privateKey: key }, now());
      madeAt = t;
    }
    return jwt;
  };
  return {
    platform: 'ios',
    host,
    /** Closes the HTTP/2 connection (tests; the server keeps it for good). */
    close: () => transport?.close(),
    async send(deviceToken, message) {
      const res = await post(host, {
        path: `/3/device/${deviceToken}`,
        headers: {
          authorization: `bearer ${token()}`,
          'apns-topic': bundleId,
          'apns-push-type': 'alert',
          'apns-priority': '10',
          'apns-expiration': String(Math.floor(now().getTime() / 1000) + 86_400),
          'content-type': 'application/json',
        },
        body: JSON.stringify(apnsPayload(message)),
      });
      if (res.status === 200) return { ok: true, status: 200 };
      let reason = '';
      try {
        reason = JSON.parse(res.body || '{}').reason ?? '';
      } catch {
        reason = '';
      }
      // Apple turned the provider token down: make a new one next time.
      if (res.status === 403 && /ProviderToken/.test(reason)) jwt = null;
      const gone = res.status === 410 || APNS_DEAD.has(reason);
      if (!gone) log.warn(`APNs answered ${res.status}${reason ? ` ${reason}` : ''}`);
      return { ok: false, gone, status: res.status, reason };
    },
  };
}

// ---- FCM --------------------------------------------------------------------

/** The service account's signed request for an access token (RS256, an hour). */
export function fcmAssertion(account, now = new Date()) {
  const iat = Math.floor(now.getTime() / 1000);
  const claims = { iss: account.client_email, scope: FCM_SCOPE, aud: account.token_uri || FCM_TOKEN_URI, iat, exp: iat + 3600 };
  const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', ...(account.private_key_id ? { kid: account.private_key_id } : {}) }))}.${b64url(JSON.stringify(claims))}`;
  const signature = crypto.sign('sha256', Buffer.from(unsigned), account.private_key);
  return `${unsigned}.${b64url(signature)}`;
}

/** One FCM v1 message: the notification, the page to open, and the Game alerts channel. */
export function fcmMessage(deviceToken, { title, body, url }) {
  return {
    message: {
      token: deviceToken,
      notification: { title: title ?? '', body: body ?? '' },
      data: url ? { url } : {},
      android: { priority: 'HIGH', notification: { channel_id: ANDROID_CHANNEL, sound: 'default' } },
    },
  };
}

/** Whether an FCM error means this token is dead (not that our message was bad). */
function fcmTokenDead(status, error) {
  const codes = (error?.details ?? []).map((d) => d?.errorCode).filter(Boolean);
  if (codes.includes('UNREGISTERED') || codes.includes('SENDER_ID_MISMATCH')) return true;
  if (status === 404 || error?.status === 'NOT_FOUND') return true;
  // INVALID_ARGUMENT also covers a bad message; only a bad token counts here.
  return error?.status === 'INVALID_ARGUMENT' && /registration token/i.test(error?.message ?? '');
}

/**
 * Sends to one Android phone through FCM HTTP v1. The access token is kept
 * until a minute before it runs out, and fetched once for any number of
 * sends waiting on it.
 */
export function createFcmSender({ serviceAccount, fetch = globalThis.fetch, now = () => new Date(), log = console }) {
  const account = serviceAccount;
  let access = null;
  let pending = null;
  async function accessToken() {
    if (access && access.until > now().getTime()) return access.token;
    pending ??= (async () => {
      try {
        const res = await fetch(account.token_uri || FCM_TOKEN_URI, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: fcmAssertion(account, now()) }).toString(),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.access_token) throw new Error(`Google turned the service account down (${res.status}${data.error ? ` ${data.error}` : ''})`);
        access = { token: data.access_token, until: now().getTime() + (Number(data.expires_in) || 3600) * 1000 - 60_000 };
        return access.token;
      } finally {
        pending = null;
      }
    })();
    return pending;
  }
  return {
    platform: 'android',
    async send(deviceToken, message) {
      const res = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(account.project_id)}/messages:send`, {
        method: 'POST',
        headers: { authorization: `Bearer ${await accessToken()}`, 'content-type': 'application/json' },
        body: JSON.stringify(fcmMessage(deviceToken, message)),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.ok) return { ok: true, status: res.status };
      const { error = null } = await res.json().catch(() => ({}));
      // The access token was turned down: fetch a new one next time.
      if (res.status === 401) access = null;
      const gone = fcmTokenDead(res.status, error);
      const reason = error?.details?.find((d) => d?.errorCode)?.errorCode ?? error?.status ?? '';
      if (!gone) log.warn(`FCM answered ${res.status}${reason ? ` ${reason}` : ''}`);
      return { ok: false, gone, status: res.status, reason };
    },
  };
}

// ---- together -----------------------------------------------------------------

/**
 * Sends to every phone a player has the app on. A platform with no sender
 * (no keys yet) is skipped; its tokens wait for the keys.
 */
export function createNativePush({ store, apns = null, fcm = null, log = console }) {
  const senders = { ios: apns, android: fcm };
  return {
    configured: { ios: Boolean(apns), android: Boolean(fcm) },
    async send(userId, message) {
      const rows = store.all('SELECT id, platform, token FROM device_tokens WHERE user_id = ?', userId);
      let sent = 0;
      await Promise.all(rows.map(async (row) => {
        const sender = senders[row.platform];
        if (!sender) return;
        try {
          const result = await sender.send(row.token, message);
          if (result.gone) store.run('DELETE FROM device_tokens WHERE id = ?', row.id);
          else if (result.ok) sent += 1;
        } catch (err) {
          log.warn(`native push to ${row.platform} failed: ${err.message}`);
        }
      }));
      return sent;
    },
  };
}

/**
 * The web push and the app push as one sender, for the notifier: every
 * notification that goes to a browser goes to the apps too. publicKey() is
 * the web push's.
 */
export function combinePush(web, native) {
  if (!native) return web;
  if (!web) return native;
  return {
    publicKey: () => web.publicKey?.() ?? null,
    async send(userId, message) {
      const counts = await Promise.all([web, native].map((p) => p.send(userId, message).catch(() => 0)));
      return counts.reduce((a, b) => a + b, 0);
    },
  };
}

/**
 * The senders the settings allow, each null with one line in the log when
 * its keys aren't there. `readFile` is for tests.
 */
export function nativeSendersFrom(config, { log = console, readFile = (file) => fs.readFileSync(file, 'utf8'), fetch = globalThis.fetch, request = null } = {}) {
  const off = (what) => {
    log.log(`native push off: ${what}`);
    return null;
  };
  let apns = null;
  const a = config.apns ?? {};
  if (!a.keyId || !a.teamId || (!a.key && !a.keyFile)) {
    off('no APNs key (set APNS_KEY_ID, APNS_TEAM_ID and APNS_KEY_FILE)');
  } else {
    try {
      const pem = a.key ? a.key.replace(/\\n/g, '\n') : readFile(a.keyFile);
      apns = createApnsSender({ keyId: a.keyId, teamId: a.teamId, privateKey: pem, bundleId: a.bundleId || DEFAULT_BUNDLE_ID, sandbox: Boolean(a.sandbox), request, log });
      log.log(`native push on for iPhone (${a.sandbox ? 'APNs sandbox' : 'APNs'}, ${a.bundleId || DEFAULT_BUNDLE_ID})`);
    } catch (err) {
      off(`the APNs key didn't load (${err.message})`);
    }
  }
  let fcm = null;
  const f = config.fcm ?? {};
  if (!f.serviceAccountFile) {
    off('no FCM service account (set FCM_SERVICE_ACCOUNT_FILE)');
  } else {
    try {
      const account = JSON.parse(readFile(f.serviceAccountFile));
      if (!account.project_id || !account.client_email || !account.private_key) throw new Error('it has no project_id, client_email or private_key');
      crypto.createPrivateKey(account.private_key);
      fcm = createFcmSender({ serviceAccount: account, fetch, log });
      log.log(`native push on for Android (FCM, project ${account.project_id})`);
    } catch (err) {
      off(`the FCM service account didn't load (${err.message})`);
    }
  }
  return { apns, fcm };
}
