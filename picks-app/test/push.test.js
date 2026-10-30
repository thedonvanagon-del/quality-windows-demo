import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { test } from 'node:test';

import { openStore } from '../src/db.js';
import { createPush, encrypt, validSubscription, vapidHeader, vapidKeys } from '../src/push.js';

// RFC 8291, section 5: the worked example, byte for byte.
test('encrypts a push body exactly as RFC 8291 does', () => {
  const body = encrypt('When I grow up, I want to be a watermelon', {
    p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
    auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  }, { as: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw', salt: Buffer.from('DGv6ra1nlYgDCS1FRnbzlw', 'base64url') });
  assert.equal(
    body.toString('base64url'),
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
  );
});

test('signs a VAPID token the public key verifies, and keeps the key pair', () => {
  const store = openStore(':memory:');
  const keys = vapidKeys(store);
  assert.equal(vapidKeys(store).publicKey, keys.publicKey, 'made once, then reused');
  const header = vapidHeader('https://fcm.googleapis.com/fcm/send/abc', keys, 'mailto:hello@bookiebullies.com', new Date('2026-10-30T00:00Z'));
  const [, token, k] = /^vapid t=([^,]+), k=(.+)$/.exec(header);
  assert.equal(k, keys.publicKey);
  const [h, c, sig] = token.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(c, 'base64url')), { aud: 'https://fcm.googleapis.com', exp: 1793361600, sub: 'mailto:hello@bookiebullies.com' });
  const raw = Buffer.from(keys.publicKey, 'base64url');
  const pub = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: raw.subarray(1, 33).toString('base64url'), y: raw.subarray(33).toString('base64url') }, format: 'jwk' });
  assert.ok(crypto.verify('sha256', Buffer.from(`${h}.${c}`), { key: pub, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url')));
});

test('takes subscriptions only from the real push services', () => {
  const ok = { p256dh: Buffer.alloc(65, 4).toString('base64url'), auth: Buffer.alloc(16, 1).toString('base64url') };
  assert.ok(validSubscription({ ...ok, endpoint: 'https://fcm.googleapis.com/fcm/send/xyz' }));
  assert.ok(validSubscription({ ...ok, endpoint: 'https://web.push.apple.com/QGh' }));
  assert.ok(!validSubscription({ ...ok, endpoint: 'http://fcm.googleapis.com/x' }));
  assert.ok(!validSubscription({ ...ok, endpoint: 'https://169.254.169.254/latest' }));
  assert.ok(!validSubscription({ ...ok, endpoint: 'https://evil.example/push.apple.com' }));
  assert.ok(!validSubscription({ ...ok, endpoint: 'https://fcm.googleapis.com:8443/x' }));
  assert.ok(!validSubscription({ endpoint: 'https://fcm.googleapis.com/x', p256dh: 'short', auth: ok.auth }));
});

test('drops a subscription the push service says is gone', async () => {
  const store = openStore(':memory:');
  store.run("INSERT INTO users (email, password_hash, screen_name, created_at) VALUES ('a@b.co', 'x', 'Ann', '2026-01-01')");
  const sub = crypto.createECDH('prime256v1');
  sub.generateKeys();
  const add = (endpoint) => store.run(
    'INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, created_at) VALUES (1, ?, ?, ?, ?)',
    endpoint, sub.getPublicKey().toString('base64url'), crypto.randomBytes(16).toString('base64url'), '2026-10-30',
  );
  add('https://fcm.googleapis.com/fcm/send/live');
  add('https://fcm.googleapis.com/fcm/send/gone');
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response(null, { status: url.endsWith('gone') ? 410 : 201 });
  };
  const push = createPush({ store, subject: 'mailto:x@y.z', fetch, log: { warn() {} } });
  assert.equal(await push.send(1, { title: 'Won', body: '+1.82u' }), 1);
  assert.equal(calls[0].init.headers['Content-Encoding'], 'aes128gcm');
  assert.deepEqual(store.all('SELECT endpoint FROM push_subscriptions').map((r) => r.endpoint), ['https://fcm.googleapis.com/fcm/send/live']);
});
