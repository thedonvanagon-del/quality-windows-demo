import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http2 from 'node:http2';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { openStore } from '../src/db.js';
import {
  ANDROID_CHANNEL, APNS_ORIGIN, APNS_SANDBOX_ORIGIN, apnsJwt, apnsPayload, cleanDeviceToken, combinePush, createApnsSender, createFcmSender,
  createNativePush, FCM_SCOPE, fcmMessage, MAX_DEVICES, nativeSendersFrom, removeDeviceToken, saveDeviceToken,
} from '../src/nativepush.js';
import { clock, quiet, startApp, visible } from './helpers.js';

const IOS = 'a1'.repeat(32);
const ANDROID = `fcm${'x'.repeat(40)}:APA91b${'Q_-z9'.repeat(25)}`;
const MESSAGE = { title: 'Won +1.82u: Bills +3.5', body: 'Won +1.82u: Bills +3.5 (BUF 24, KC 27)', url: '/picks?tab=settled' };

const ec = () => crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
const decode = (part) => JSON.parse(Buffer.from(part, 'base64url'));

function serviceAccount() {
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    type: 'service_account',
    project_id: 'lockbox-1234',
    private_key_id: 'abc123',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    client_email: 'push@lockbox-1234.iam.gserviceaccount.com',
    token_uri: 'https://oauth2.googleapis.com/token',
  };
}

function storeWithPlayers(...names) {
  const store = openStore(':memory:');
  for (const name of names) {
    store.run("INSERT INTO users (email, password_hash, screen_name, created_at) VALUES (?, 'x', ?, '2026-01-01')", `${name.toLowerCase()}@example.com`, name);
  }
  return store;
}

describe('device tokens', () => {
  test('takes APNs and FCM tokens that look right, nothing else', () => {
    assert.equal(cleanDeviceToken('ios', IOS), IOS);
    assert.equal(cleanDeviceToken('ios', IOS.toUpperCase()), IOS, 'kept in lower case');
    assert.equal(cleanDeviceToken('ios', IOS.slice(1)), null, '63 characters');
    assert.equal(cleanDeviceToken('ios', `${IOS.slice(2)}zz`), null, 'not hex');
    assert.equal(cleanDeviceToken('android', ANDROID), ANDROID);
    assert.equal(cleanDeviceToken('android', 'short'), null);
    assert.equal(cleanDeviceToken('android', `${ANDROID}<script>`), null);
    assert.equal(cleanDeviceToken('android', 'a'.repeat(5000)), null, 'too long');
    assert.equal(cleanDeviceToken('web', IOS), null);
    assert.equal(cleanDeviceToken('__proto__', IOS), null);
    assert.equal(cleanDeviceToken('ios', null), null);
  });

  test(`keeps ${MAX_DEVICES} per player, newest first, and moves a token to whoever signs in`, () => {
    const store = storeWithPlayers('Ann', 'Bob');
    for (let i = 0; i < MAX_DEVICES + 2; i += 1) {
      saveDeviceToken(store, 1, 'ios', i.toString(16).padStart(64, '0'), new Date(Date.UTC(2026, 10, 1, 0, i)));
    }
    const left = store.all('SELECT token FROM device_tokens WHERE user_id = 1 ORDER BY last_seen_at').map((r) => parseInt(r.token, 16));
    assert.deepEqual(left, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 'the two seen longest ago are gone');
    saveDeviceToken(store, 2, 'ios', (5).toString(16).padStart(64, '0'), new Date('2026-11-02'));
    assert.equal(store.get('SELECT user_id FROM device_tokens WHERE token = ?', (5).toString(16).padStart(64, '0')).user_id, 2);
    assert.equal(store.get('SELECT COUNT(*) AS n FROM device_tokens').n, 10, 'one row per token');
    assert.equal(removeDeviceToken(store, (5).toString(16).padStart(64, '0').toUpperCase()), 1);
    assert.equal(removeDeviceToken(store, (5).toString(16).padStart(64, '0')), 0, 'already gone');
    store.run('DELETE FROM users WHERE id = 1');
    assert.equal(store.get('SELECT COUNT(*) AS n FROM device_tokens').n, 0, 'deleting the account deletes its tokens');
  });
});

describe('APNs', () => {
  test('signs an ES256 provider token Apple can check: kid in the header, team and time in the claims', () => {
    const { privateKey, publicKey } = ec();
    const jwt = apnsJwt({ keyId: 'ABC123DEFG', teamId: 'TEAM123456', privateKey }, new Date('2026-11-27T12:00:00Z'));
    const [h, c, sig] = jwt.split('.');
    assert.deepEqual(decode(h), { alg: 'ES256', kid: 'ABC123DEFG' });
    assert.deepEqual(decode(c), { iss: 'TEAM123456', iat: 1795780800 });
    assert.equal(Buffer.from(sig, 'base64url').length, 64, 'raw r||s, not DER');
    assert.ok(crypto.verify('sha256', Buffer.from(`${h}.${c}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url')));
  });

  test('sends the alert, the sound and the page, and reuses the token for 50 minutes', async () => {
    const time = clock('2026-11-27T12:00:00Z');
    const calls = [];
    const request = async (origin, req) => (calls.push({ origin, ...req }), { status: 200, body: '' });
    const pem = ec().privateKey.export({ type: 'pkcs8', format: 'pem' });
    const apns = createApnsSender({ keyId: 'K1', teamId: 'T1', privateKey: pem, request, now: time.now, log: quiet });
    assert.deepEqual(await apns.send(IOS, MESSAGE), { ok: true, status: 200 });
    const [first] = calls;
    assert.equal(first.origin, APNS_ORIGIN);
    assert.equal(first.path, `/3/device/${IOS}`);
    assert.equal(first.headers['apns-topic'], 'com.bookiebullies.lockbox');
    assert.equal(first.headers['apns-push-type'], 'alert');
    assert.equal(first.headers['apns-priority'], '10');
    assert.match(first.headers.authorization, /^bearer [\w-]+\.[\w-]+\.[\w-]+$/);
    assert.deepEqual(JSON.parse(first.body), { aps: { alert: { title: MESSAGE.title, body: MESSAGE.body }, sound: 'default' }, url: '/picks?tab=settled' });
    assert.deepEqual(apnsPayload({ title: 'Hi', body: 'There' }), { aps: { alert: { title: 'Hi', body: 'There' }, sound: 'default' } }, 'no url, no url key');

    time.advance(49 * 60_000);
    await apns.send(IOS, MESSAGE);
    assert.equal(calls[1].headers.authorization, first.headers.authorization, 'same token inside 50 minutes');
    time.advance(2 * 60_000);
    await apns.send(IOS, MESSAGE);
    assert.notEqual(calls[2].headers.authorization, first.headers.authorization, 'a new one after');

    const sandbox = createApnsSender({ keyId: 'K1', teamId: 'T1', privateKey: pem, sandbox: true, bundleId: 'com.example.dev', request, log: quiet });
    await sandbox.send(IOS, MESSAGE);
    assert.equal(calls[3].origin, APNS_SANDBOX_ORIGIN);
    assert.equal(calls[3].headers['apns-topic'], 'com.example.dev');
  });

  test('says a token is gone on 410 and BadDeviceToken, and remakes the provider token Apple turned down', async () => {
    const answers = [
      { status: 410, body: '{"reason":"Unregistered"}' },
      { status: 400, body: '{"reason":"BadDeviceToken"}' },
      { status: 400, body: '{"reason":"PayloadEmpty"}' },
      { status: 403, body: '{"reason":"ExpiredProviderToken"}' },
      { status: 200, body: '' },
    ];
    const auths = [];
    const request = async (origin, req) => (auths.push(req.headers.authorization), answers.shift());
    const warned = [];
    const time = clock('2026-11-27T12:00:00Z');
    const apns = createApnsSender({ keyId: 'K1', teamId: 'T1', privateKey: ec().privateKey, request, now: time.now, log: { warn: (t) => warned.push(t) } });
    assert.equal((await apns.send(IOS, MESSAGE)).gone, true);
    assert.equal((await apns.send(IOS, MESSAGE)).gone, true);
    assert.equal((await apns.send(IOS, MESSAGE)).gone, false, 'our mistake, not the token');
    assert.equal((await apns.send(IOS, MESSAGE)).gone, false);
    time.advance(1000);
    assert.equal((await apns.send(IOS, MESSAGE)).ok, true);
    assert.notEqual(auths[4], auths[3], 'a fresh provider token after ExpiredProviderToken');
    assert.deepEqual(warned, ['APNs answered 400 PayloadEmpty', 'APNs answered 403 ExpiredProviderToken']);
  });

  test('speaks HTTP/2 (against a local server standing in for Apple)', async () => {
    const seen = [];
    const server = http2.createServer();
    server.on('stream', (stream, headers) => {
      let body = '';
      stream.on('data', (c) => (body += c));
      stream.on('end', () => {
        seen.push({ headers, body });
        const gone = headers[':path'].endsWith('dead'.padStart(64, '0'));
        stream.respond({ ':status': gone ? 410 : 200, 'content-type': 'application/json' });
        stream.end(gone ? '{"reason":"Unregistered","timestamp":1795780800000}' : '');
      });
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const apns = createApnsSender({ keyId: 'K1', teamId: 'T1', privateKey: ec().privateKey, origin: `http://127.0.0.1:${server.address().port}`, log: quiet });
    try {
      assert.equal((await apns.send(IOS, MESSAGE)).ok, true);
      const dead = await apns.send('dead'.padStart(64, '0'), MESSAGE);
      assert.deepEqual([dead.status, dead.gone, dead.reason], [410, true, 'Unregistered']);
      assert.equal(seen.length, 2);
      assert.equal(seen[0].headers[':method'], 'POST');
      assert.equal(seen[0].headers[':path'], `/3/device/${IOS}`);
      assert.equal(JSON.parse(seen[0].body).aps.alert.title, MESSAGE.title);
    } finally {
      apns.close();
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

describe('FCM', () => {
  function fakeGoogle({ sends = [] } = {}) {
    const calls = { token: [], send: [] };
    let n = 0;
    const fetch = async (url, init) => {
      if (url === 'https://oauth2.googleapis.com/token') {
        calls.token.push(new URLSearchParams(init.body));
        n += 1;
        return Response.json({ access_token: `ya29.token${n}`, expires_in: 3599, token_type: 'Bearer' });
      }
      calls.send.push({ url, headers: init.headers, body: JSON.parse(init.body) });
      const answer = sends.shift() ?? { status: 200, json: { name: 'projects/lockbox-1234/messages/1' } };
      return Response.json(answer.json, { status: answer.status });
    };
    return { fetch, calls };
  }

  test('gets an access token with an RS256 assertion, keeps it, and sends the notification to the Game alerts channel', async () => {
    const account = serviceAccount();
    const time = clock('2026-11-27T12:00:00Z');
    const google = fakeGoogle();
    const fcm = createFcmSender({ serviceAccount: account, fetch: google.fetch, now: time.now, log: quiet });
    assert.deepEqual(await fcm.send(ANDROID, MESSAGE), { ok: true, status: 200 });
    await fcm.send(ANDROID, MESSAGE);
    assert.equal(google.calls.token.length, 1, 'one access token for both');

    const form = google.calls.token[0];
    assert.equal(form.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
    const [h, c, sig] = form.get('assertion').split('.');
    assert.deepEqual(decode(h), { alg: 'RS256', typ: 'JWT', kid: 'abc123' });
    assert.deepEqual(decode(c), { iss: account.client_email, scope: FCM_SCOPE, aud: 'https://oauth2.googleapis.com/token', iat: 1795780800, exp: 1795784400 });
    assert.ok(crypto.verify('sha256', Buffer.from(`${h}.${c}`), crypto.createPublicKey(account.private_key), Buffer.from(sig, 'base64url')));

    const sent = google.calls.send[0];
    assert.equal(sent.url, 'https://fcm.googleapis.com/v1/projects/lockbox-1234/messages:send');
    assert.equal(sent.headers.authorization, 'Bearer ya29.token1');
    assert.deepEqual(sent.body, fcmMessage(ANDROID, MESSAGE));
    assert.deepEqual(sent.body.message, {
      token: ANDROID,
      notification: { title: MESSAGE.title, body: MESSAGE.body },
      data: { url: '/picks?tab=settled' },
      android: { priority: 'HIGH', notification: { channel_id: ANDROID_CHANNEL, sound: 'default' } },
    });

    time.advance(60 * 60_000);
    await fcm.send(ANDROID, MESSAGE);
    assert.equal(google.calls.token.length, 2, 'a new access token once the old one runs out');
  });

  test('says a token is gone on UNREGISTERED and a bad registration token, not on a bad message', async () => {
    const fcmError = (code, status, errorCode, message) => ({ status: code, json: { error: { code, status, message, details: [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode }] } } });
    const google = fakeGoogle({
      sends: [
        fcmError(404, 'NOT_FOUND', 'UNREGISTERED', 'Requested entity was not found.'),
        fcmError(400, 'INVALID_ARGUMENT', 'INVALID_ARGUMENT', 'The registration token is not a valid FCM registration token'),
        fcmError(400, 'INVALID_ARGUMENT', 'INVALID_ARGUMENT', 'Invalid value at \'message.android.notification.channel_id\''),
        { status: 401, json: { error: { code: 401, status: 'UNAUTHENTICATED', message: 'Request had invalid authentication credentials.' } } },
        { status: 200, json: {} },
      ],
    });
    const warned = [];
    const fcm = createFcmSender({ serviceAccount: serviceAccount(), fetch: google.fetch, log: { warn: (t) => warned.push(t) } });
    assert.equal((await fcm.send(ANDROID, MESSAGE)).gone, true);
    assert.equal((await fcm.send(ANDROID, MESSAGE)).gone, true);
    assert.equal((await fcm.send(ANDROID, MESSAGE)).gone, false, 'a bad message keeps the token');
    assert.equal((await fcm.send(ANDROID, MESSAGE)).gone, false);
    assert.equal((await fcm.send(ANDROID, MESSAGE)).ok, true);
    assert.equal(google.calls.token.length, 2, 'a 401 fetches a new access token');
    assert.deepEqual(warned, ['FCM answered 400 INVALID_ARGUMENT', 'FCM answered 401 UNAUTHENTICATED']);
  });
});

describe('sending to a player', () => {
  test('goes to every app install, skips a platform with no keys, and deletes dead tokens', async () => {
    const store = storeWithPlayers('Ann');
    const iosDead = 'de'.repeat(32);
    saveDeviceToken(store, 1, 'ios', IOS);
    saveDeviceToken(store, 1, 'ios', iosDead);
    saveDeviceToken(store, 1, 'android', ANDROID);
    const got = [];
    const apns = { send: async (token, message) => (got.push({ token, message }), token === iosDead ? { ok: false, gone: true, status: 410 } : { ok: true }) };
    const iosOnly = createNativePush({ store, apns, log: quiet });
    assert.deepEqual(iosOnly.configured, { ios: true, android: false });
    assert.equal(await iosOnly.send(1, MESSAGE), 1);
    assert.equal(got.length, 2, 'Android waits for its keys');
    assert.deepEqual(got[0].message, MESSAGE);
    assert.deepEqual(store.all('SELECT token FROM device_tokens ORDER BY id').map((r) => r.token), [IOS, ANDROID], 'the dead one is gone, the Android one kept');

    const broken = createNativePush({ store, fcm: { send: async () => { throw new Error('socket hang up'); } }, log: quiet });
    assert.equal(await broken.send(1, MESSAGE), 0, 'a network error never throws');
    assert.equal(await createNativePush({ store }).send(1, MESSAGE), 0, 'off with no keys');
  });

  test('web push and app push go out together, with the web push key', async () => {
    const web = { publicKey: () => 'BKey', send: async () => 2 };
    const native = { send: async () => 1 };
    const both = combinePush(web, native);
    assert.equal(both.publicKey(), 'BKey');
    assert.equal(await both.send(1, MESSAGE), 3);
    assert.equal(await combinePush(web, { send: async () => { throw new Error('down'); } }).send(1, MESSAGE), 2, 'one failing never stops the other');
    assert.equal(combinePush(web, null), web);
  });

  test('is off, with one line each in the log, until the keys are set', () => {
    const lines = [];
    const log = { log: (t) => lines.push(t), warn() {} };
    assert.deepEqual(nativeSendersFrom({ apns: { keyId: null }, fcm: {} }, { log }), { apns: null, fcm: null });
    assert.deepEqual(lines, [
      'native push off: no APNs key (set APNS_KEY_ID, APNS_TEAM_ID and APNS_KEY_FILE)',
      'native push off: no FCM service account (set FCM_SERVICE_ACCOUNT_FILE)',
    ]);

    lines.length = 0;
    const p8 = ec().privateKey.export({ type: 'pkcs8', format: 'pem' });
    const files = { '/etc/bb/AuthKey.p8': p8, '/etc/bb/fcm.json': JSON.stringify(serviceAccount()) };
    const on = nativeSendersFrom(
      { apns: { keyId: 'K1', teamId: 'T1', keyFile: '/etc/bb/AuthKey.p8', bundleId: 'com.bookiebullies.lockbox' }, fcm: { serviceAccountFile: '/etc/bb/fcm.json' } },
      { log, readFile: (f) => files[f] },
    );
    assert.equal(on.apns.platform, 'ios');
    assert.equal(on.fcm.platform, 'android');
    assert.deepEqual(lines, ['native push on for iPhone (APNs, com.bookiebullies.lockbox)', 'native push on for Android (FCM, project lockbox-1234)']);

    lines.length = 0;
    const inline = nativeSendersFrom({ apns: { keyId: 'K1', teamId: 'T1', key: p8.replace(/\n/g, '\\n'), sandbox: true } }, { log });
    assert.equal(inline.apns.host, APNS_SANDBOX_ORIGIN, 'APNS_KEY with \\n escapes works too');

    lines.length = 0;
    const bad = nativeSendersFrom({ apns: { keyId: 'K1', teamId: 'T1', key: 'not a key' }, fcm: { serviceAccountFile: '/nope.json' } }, { log, readFile: () => { throw new Error('ENOENT'); } });
    assert.deepEqual(bad, { apns: null, fcm: null });
    assert.match(lines[0], /^native push off: the APNs key didn't load/);
    assert.equal(lines[1], "native push off: the FCM service account didn't load (ENOENT)");
  });
});

describe('the app routes', () => {
  let time;
  let app;
  let sent;

  beforeEach(async () => {
    time = clock('2026-11-27T15:00:00.000Z');
    sent = [];
    app = await startApp({
      time,
      nativePush: (store) => createNativePush({ store, apns: { send: async (token, message) => (sent.push({ platform: 'ios', token, message }), { ok: true }) }, log: quiet }),
    });
  });

  afterEach(() => app.close());

  async function player(email, name) {
    const b = app.browser();
    await b.join(email, name);
    await b.get('/games');
    return b;
  }

  const tokens = () => app.store.all('SELECT user_id, platform, token FROM device_tokens ORDER BY id').map((r) => ({ ...r }));

  test('POST /push/native keeps a token checked like any form: signed in, this site, with the form token', async () => {
    const ann = await player('ann@example.com', 'Ann');
    assert.equal((await ann.post('/push/native', { platform: 'ios', token: IOS }, { csrf: false })).status, 403, 'no form token');
    assert.equal((await ann.post('/push/native', { platform: 'ios', token: IOS }, { origin: 'https://evil.example' })).status, 403, 'another site');
    const bad = await ann.post('/push/native', { platform: 'ios', token: 'nope' });
    assert.equal(bad.status, 400);
    assert.deepEqual(JSON.parse(bad.text), { ok: false, error: 'That device token was turned down.' });
    assert.equal((await ann.post('/push/native', { platform: 'web', token: IOS })).status, 400);
    assert.deepEqual(tokens(), []);

    const ok = await ann.post('/push/native', { platform: 'ios', token: IOS.toUpperCase() });
    assert.equal(ok.status, 200);
    assert.deepEqual(JSON.parse(ok.text), { ok: true, devices: 1 });
    assert.equal((await ann.post('/push/native', { platform: 'android', token: ANDROID })).status, 200);
    assert.deepEqual(tokens(), [{ user_id: 1, platform: 'ios', token: IOS }, { user_id: 1, platform: 'android', token: ANDROID }]);
    assert.equal((await ann.post('/push/native', { platform: 'ios', token: IOS })).status, 200, 'again is fine');
    assert.equal(tokens().length, 2);

    const visitor = app.browser();
    const out = await visitor.post('/push/native', { platform: 'ios', token: IOS });
    assert.equal(out.status, 401);
  });

  test(`caps a player at ${MAX_DEVICES} phones, and a phone moves to whoever signs in on it`, async () => {
    const ann = await player('ann@example.com', 'Ann');
    for (let i = 0; i < MAX_DEVICES + 1; i += 1) {
      time.advance(1000);
      assert.equal((await ann.post('/push/native', { platform: 'ios', token: i.toString(16).padStart(64, 'b') })).status, 200);
    }
    assert.equal(tokens().length, MAX_DEVICES);
    assert.ok(!tokens().some((r) => r.token === (0).toString(16).padStart(64, 'b')), 'the oldest went');

    const bob = await player('bob@example.com', 'Bob');
    await bob.post('/push/native', { platform: 'ios', token: (5).toString(16).padStart(64, 'b') });
    assert.equal(app.store.get('SELECT user_id FROM device_tokens WHERE token = ?', (5).toString(16).padStart(64, 'b')).user_id, 2);

    assert.deepEqual(JSON.parse((await ann.post('/push/native/remove', { token: (6).toString(16).padStart(64, 'b') })).text), { ok: true, removed: 1 });
    assert.equal((await ann.post('/push/native/remove', { token: (7).toString(16).padStart(64, 'b') }, { csrf: false })).status, 403, 'signed in, it needs the form token');
    // Signed out (the page right after Log out), the phone still drops its token.
    await bob.post('/logout');
    assert.deepEqual(JSON.parse((await bob.post('/push/native/remove', { token: (5).toString(16).padStart(64, 'b') })).text), { ok: true, removed: 1 });
    assert.equal((await app.browser().post('/push/native/remove', { token: (8).toString(16).padStart(64, 'b') }, { origin: 'https://evil.example' })).status, 403, 'never from another site');
    assert.equal(tokens().length, MAX_DEVICES - 2);
  });

  test('every notification goes to the app too, and Turn off on every device turns it off', async () => {
    const ann = await player('ann@example.com', 'Ann');
    await ann.post('/push/native', { platform: 'ios', token: IOS });
    assert.match(visible((await ann.get('/notifications')).text), /On for 1 device\./);
    const id = app.store.get("SELECT id FROM users WHERE screen_name = 'Ann'").id;
    app.notifier.tell(id, { kind: 'badge', title: 'New badge', text: 'New badge: First win.', url: '/u/Ann' });
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(sent, [{ platform: 'ios', token: IOS, message: { title: 'New badge', body: 'New badge: First win.', url: '/u/Ann' } }]);

    await ann.get('/notifications');
    await ann.post('/push/unsubscribe');
    assert.deepEqual(tokens(), []);
  });

  test('inside the app, the Get the app prompts are gone', async () => {
    const ann = await player('ann@example.com', 'Ann');
    const ua = { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 LockBoxApp LockBoxPush' };
    const web = await ann.get('/more');
    assert.match(web.text, /data-app-banner/);
    assert.match(web.text, /get-app-row/);
    assert.doesNotMatch(web.text, /<html[^>]*class="native"/);

    const inApp = await ann.request('/more', { headers: ua });
    assert.match(inApp.text, /<html[^>]*class="native"/);
    assert.doesNotMatch(inApp.text, /data-app-banner|data-ios-install|get-app-row/);
    assert.match(visible((await ann.request('/install', { headers: ua })).text), /You have the app/);

    const visitor = app.browser();
    assert.match((await visitor.get('/leaderboard')).text, /data-get-app/);
    assert.doesNotMatch((await visitor.request('/leaderboard', { headers: ua })).text, /data-get-app/);
  });
});
