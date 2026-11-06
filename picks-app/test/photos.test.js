import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { ensureOfficial } from '../src/official.js';
import { cleanImage, PHOTO_MAX, sniff, stripJpeg, stripPng, stripWebp } from '../src/photos.js';
import { avatar } from '../src/views/avatar.js';
import { clock, event, startApp, visible } from './helpers.js';

const MORNING = '2026-10-25T12:00:00.000Z';
const KICKOFF = '2026-10-25T17:00:00.000Z';
const DAY = 86_400_000;

// ---- images built by hand -----------------------------------------------------

/** A JPEG segment: FF, the marker, a two-byte length, the body. */
function seg(marker, body) {
  const head = Buffer.from([0xff, marker, 0, 0]);
  head.writeUInt16BE(body.length + 2, 2);
  return Buffer.concat([head, Buffer.from(body)]);
}

const SOI = Buffer.from([0xff, 0xd8]);
const APP0 = seg(0xe0, Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0', 'latin1'));
const EXIF = seg(0xe1, Buffer.from('Exif\0\0MM\0*\0\0\0\x08GPSLatitude 40.7128 N GPSLongitude 74.0060 W', 'latin1'));
const XMP = seg(0xe1, Buffer.from('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>Pixel 9, home</x:xmpmeta>', 'latin1'));
const ICC = seg(0xe2, Buffer.from('ICC_PROFILE\0\x01\x01 profile bytes', 'latin1'));
const IPTC = seg(0xed, Buffer.from('Photoshop 3.0\0 caption: my house', 'latin1'));
const COM = seg(0xfe, Buffer.from('taken at 12 Elm St', 'latin1'));
const DQT = seg(0xdb, Buffer.alloc(65, 1));
const SOF0 = seg(0xc0, Buffer.from([8, 0, 1, 0, 1, 1, 1, 0x11, 0]));
const DHT = seg(0xc4, Buffer.alloc(20, 2));
// The scan: its header, then picture data (a stuffed FF 00 and a restart marker inside), then EOI.
const SCAN = Buffer.concat([seg(0xda, Buffer.from([1, 1, 0, 0, 0x3f, 0])), Buffer.from([0x12, 0x34, 0xff, 0x00, 0x56, 0xff, 0xd0, 0x78]), Buffer.from([0xff, 0xd9])]);

/** A JPEG with EXIF and GPS, XMP, an ICC profile, IPTC and a comment, the way phones write them. */
const phoneJpeg = () => Buffer.concat([SOI, APP0, EXIF, XMP, ICC, IPTC, COM, DQT, SOF0, DHT, SCAN]);
/** The same picture as it should come out: no metadata, nothing else touched. */
const cleanJpeg = () => Buffer.concat([SOI, APP0, DQT, SOF0, DHT, SCAN]);

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** A 1×1 PNG, with a text chunk and an EXIF chunk to strip. */
function png({ meta = true } = {}) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    ...(meta ? [pngChunk('tEXt', Buffer.from('Comment\0at home', 'latin1')), pngChunk('eXIf', Buffer.from('MM\0*GPS', 'latin1'))] : []),
    pngChunk('IDAT', zlib.deflateSync(Buffer.from([0, 255, 0, 0]))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/** A WebP with VP8X flags saying EXIF and XMP, and both chunks. */
function webp() {
  const chunk = (type, data) => {
    const head = Buffer.alloc(8);
    head.write(type, 0, 'latin1');
    head.writeUInt32LE(data.length, 4);
    return Buffer.concat([head, data, data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
  };
  const vp8x = Buffer.alloc(10);
  vp8x[0] = 0x0c;
  const body = Buffer.concat([chunk('VP8X', vp8x), chunk('VP8 ', Buffer.from('picture')), chunk('EXIF', Buffer.from('MM\0*GPS')), chunk('XMP ', Buffer.from('<x/>'))]);
  const head = Buffer.alloc(12);
  head.write('RIFF', 0, 'latin1');
  head.writeUInt32LE(body.length + 4, 4);
  head.write('WEBP', 8, 'latin1');
  return Buffer.concat([head, body]);
}

describe('checking and cleaning images', () => {
  test('only JPEG, PNG and WebP, by their first bytes', () => {
    assert.equal(sniff(phoneJpeg()), 'jpg');
    assert.equal(sniff(png()), 'png');
    assert.equal(sniff(webp()), 'webp');
    for (const bad of [Buffer.from('GIF89a......'), Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), Buffer.from('<!doctype html><script>'), Buffer.from('%PDF-1.7'), Buffer.from([0xff, 0xd8])]) {
      assert.equal(sniff(bad), null);
      assert.match(cleanImage(bad).error, /isn't a photo we can use/);
    }
  });

  test('a JPEG loses EXIF, GPS, XMP, ICC, IPTC and comments, and nothing else', () => {
    const out = stripJpeg(phoneJpeg());
    assert.deepEqual(out, cleanJpeg());
    for (const secret of ['Exif', 'GPS', 'xmpmeta', 'ICC_PROFILE', 'Photoshop', 'Elm St']) assert.ok(!out.includes(secret), secret);
    // Fill bytes before a marker are allowed; a clean JPEG comes back the same.
    assert.deepEqual(stripJpeg(Buffer.concat([SOI, Buffer.from([0xff]), EXIF, APP0, DQT, SOF0, DHT, SCAN])), cleanJpeg());
    assert.deepEqual(stripJpeg(cleanJpeg()), cleanJpeg());
    // Markers that don't add up are turned away, not half-copied.
    assert.equal(stripJpeg(Buffer.concat([SOI, APP0, EXIF.subarray(0, 10)])), null);
    assert.equal(stripJpeg(Buffer.concat([SOI, Buffer.from([0x00, 0x11])])), null);
    assert.match(cleanImage(Buffer.concat([SOI, Buffer.from([0xff]), Buffer.from([0xe1, 0xff, 0xff])])).error, /damaged/);
  });

  test('PNG and WebP lose their metadata too', () => {
    const p = stripPng(png());
    assert.deepEqual(p, png({ meta: false }));
    const w = stripWebp(webp());
    assert.ok(!w.includes('EXIF') && !w.includes('XMP'));
    assert.equal(w[20] & 0x0c, 0, 'VP8X no longer claims EXIF or XMP');
    assert.equal(w.readUInt32LE(4), w.length - 8, 'RIFF size matches');
    assert.ok(w.includes('picture'));
  });

  test('the photo limit is 1 MB', () => {
    const exact = Buffer.concat([cleanJpeg(), Buffer.alloc(PHOTO_MAX - cleanJpeg().length)]);
    assert.equal(cleanImage(exact).ext, 'jpg');
    assert.match(cleanImage(Buffer.concat([exact, Buffer.from([0])])).error, /over 1 MB/);
  });

  test('no photo: the same initials circle as always', () => {
    assert.equal(String(avatar({ screen_name: 'ann' })), '<span class="avatar">a</span>');
    assert.equal(String(avatar({ screenName: 'Bob' }, 'big')), '<span class="avatar big">B</span>');
    assert.equal(String(avatar({ screen_name: 'Ann', photo: 'ab'.repeat(16) + '.jpg' })),
      `<img class="avatar photo" src="/media/${'ab'.repeat(16)}.jpg" alt="" width="26" height="26" loading="lazy" decoding="async">`);
  });
});

describe('profile photos', () => {
  let time;
  let app;

  beforeEach(async () => {
    time = clock(MORNING);
    app = await startApp({ time, config: { adminEmails: ['boss@example.com'] } });
    app.espn.events.nfl.push(event({ id: '1', start: KICKOFF }));
  });

  afterEach(() => app.close());

  async function player(email, name) {
    const b = app.browser();
    await b.join(email, name);
    await b.get('/games');
    return b;
  }

  const photoOf = (name) => app.store.get('SELECT photo FROM users WHERE screen_name = ?', name)?.photo ?? null;
  const onDisk = () => fs.readdirSync(app.media).sort();
  const flashOn = async (b, page) => visible((await b.get(page)).text);

  test('upload: checked, stripped, stored under a random name, served with the right headers', async () => {
    const ann = await player('ann@example.com', 'Ann');
    const form = (await ann.get('/u/Ann')).text;
    assert.match(form, /<form class="form photo-form" method="post" action="\/photo" enctype="multipart\/form-data" data-photo-form>/);
    assert.match(form, /<input type="file" name="photo" accept="image\/jpeg,image\/png,image\/webp" required data-photo-input>/);

    const sent = await ann.upload('/photo', { data: phoneJpeg() });
    assert.equal(sent.status, 303);
    assert.equal(sent.location, '/u/Ann#photo');
    const name = photoOf('Ann');
    assert.match(name, /^[0-9a-f]{32}\.jpg$/);
    assert.deepEqual(onDisk(), [name]);
    assert.deepEqual(fs.readFileSync(path.join(app.media, name)), cleanJpeg(), 'metadata gone on disk');
    assert.match(await flashOn(ann, '/u/Ann'), /Photo saved/);

    const res = await fetch(`${app.base}/media/${name}`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/jpeg');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    assert.match(res.headers.get('content-security-policy'), /img-src 'self'/);
    assert.deepEqual(Buffer.from(await res.arrayBuffer()), cleanJpeg());

    // It shows on the profile (large), in the header chip, and wherever the player is listed.
    const page = (await app.browser().get('/u/Ann')).text;
    assert.match(page, new RegExp(`<img class="avatar huge photo" src="/media/${name}"`));
    assert.match(page, new RegExp(`data-photo="/media/${name}"`), 'for the share image');
    assert.match((await ann.get('/games')).text, new RegExp(`<a class="user-chip [^"]*" href="/u/Ann"><img class="avatar photo" src="/media/${name}"`));
    assert.match((await ann.get('/search?q=An')).text, new RegExp(`<span class="player"><img class="avatar photo" src="/media/${name}"`));
    await ann.post('/games/nfl%3A1/chat', { body: 'nice day for it' });
    assert.match((await ann.get('/games/nfl%3A1')).text, new RegExp(`<div class="msg-head">\\s*<img class="avatar xs photo" src="/media/${name}"`));

    // PNG keeps its type.
    await ann.get('/u/Ann');
    await ann.upload('/photo', { name: 'me.png', type: 'image/png', data: png() });
    assert.match(photoOf('Ann'), /\.png$/);
    assert.equal((await fetch(`${app.base}/media/${photoOf('Ann')}`)).headers.get('content-type'), 'image/png');
  });

  test('a new photo deletes the old file, and removing one deletes it too', async () => {
    const ann = await player('ann@example.com', 'Ann');
    await ann.get('/u/Ann');
    await ann.upload('/photo', { data: phoneJpeg() });
    const first = photoOf('Ann');
    await ann.get('/u/Ann');
    await ann.upload('/photo', { data: cleanJpeg() });
    const second = photoOf('Ann');
    assert.notEqual(first, second);
    assert.deepEqual(onDisk(), [second]);
    assert.equal((await fetch(`${app.base}/media/${first}`)).status, 404);

    await ann.get('/u/Ann');
    assert.equal((await ann.post('/photo/delete')).location, '/u/Ann#photo');
    assert.equal(photoOf('Ann'), null);
    assert.deepEqual(onDisk(), []);
    assert.match((await app.browser().get('/u/Ann')).text, /<div class="profile-face"><span class="avatar big">A<\/span><\/div>/);
  });

  test('too big, not a photo, or no form token: nothing is stored', async () => {
    const ann = await player('ann@example.com', 'Ann');
    await ann.get('/u/Ann');
    const over = Buffer.concat([cleanJpeg(), Buffer.alloc(PHOTO_MAX + 1 - cleanJpeg().length)]);
    assert.equal((await ann.upload('/photo', { data: over })).location, '/u/Ann#photo');
    assert.match(await flashOn(ann, '/u/Ann'), /That photo is over 1 MB/);
    // Far past the limit, the body is read and dropped, and the answer still gets back.
    assert.equal((await ann.upload('/photo', { data: Buffer.alloc(3 * PHOTO_MAX, 0xff) })).location, '/u/Ann#photo');
    assert.match(await flashOn(ann, '/u/Ann'), /That photo is over 1 MB/);

    for (const [data, type] of [[Buffer.from('GIF89a\x01\x00\x01\x00'), 'image/gif'], [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'image/svg+xml'], [Buffer.from('<html><script>alert(1)</script>'), 'image/jpeg']]) {
      await ann.upload('/photo', { data, type });
      assert.match(await flashOn(ann, '/u/Ann'), /That isn't a photo we can use/);
    }
    await ann.upload('/photo', { data: Buffer.alloc(0) });
    assert.match(await flashOn(ann, '/u/Ann'), /Pick a photo first/);

    assert.equal((await ann.upload('/photo', { data: cleanJpeg() }, {}, { csrf: false })).status, 403);
    assert.equal((await ann.upload('/photo', { data: cleanJpeg() }, {}, { origin: 'https://evil.example' })).status, 403);
    // Ordinary forms still stop at 16 KB.
    assert.equal((await ann.post('/bio', { bio: 'x'.repeat(20_000) })).status, 413);
    assert.equal(photoOf('Ann'), null);
    assert.deepEqual(onDisk(), []);
  });

  test('the photo address takes our random names only: no other files, no way out of the folder', async () => {
    const ann = await player('ann@example.com', 'Ann');
    await ann.get('/u/Ann');
    await ann.upload('/photo', { data: cleanJpeg() });
    const name = photoOf('Ann');
    // A file in the folder that nobody has as a photo isn't served either.
    fs.writeFileSync(path.join(app.media, `${'0'.repeat(32)}.jpg`), cleanJpeg());
    for (const bad of [
      '..%2F..%2Fpackage.json', '%2e%2e%2fsrc%2fapp.js', '..%5C..%5Cpackage.json', `${name}%00.html`, `${name}.html`,
      name.toUpperCase(), `${'0'.repeat(32)}.jpg`, `${name.slice(0, -4)}.svg`, 'x.jpg', '%2Fetc%2Fpasswd',
    ]) {
      const res = await fetch(`${app.base}/media/${bad}`);
      assert.equal(res.status, 404, bad);
      assert.match(res.headers.get('content-type'), /text\/html/, bad);
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff', bad);
    }
    assert.equal((await fetch(`${app.base}/media/${name}`)).status, 200);
  });

  test('three reports hide a photo; an admin removes it; no new photo for 7 days', async () => {
    const ann = await player('ann@example.com', 'Ann');
    await ann.get('/u/Ann');
    await ann.upload('/photo', { data: cleanJpeg() });
    const name = photoOf('Ann');
    const reporters = [];
    for (const who of ['Bob', 'Cat', 'Dan']) reporters.push(await player(`${who.toLowerCase()}@example.com`, who));
    const [bob] = reporters;

    assert.match((await bob.get('/u/Ann')).text, /action="\/u\/Ann\/photo\/report"/);
    assert.equal((await bob.post('/u/Ann/photo/report')).location, '/u/Ann');
    assert.match(visible((await bob.get('/u/Ann')).text), /Thanks\. An admin will look at it\. 3 reports hide a photo until then\. .*Photo reported/);
    await bob.post('/u/Ann/photo/report');
    assert.equal(app.store.get('SELECT COUNT(*) AS n FROM photo_reports').n, 1, 'once per player');
    assert.equal((await app.browser().post('/u/Ann/photo/report')).location, '/login');
    await ann.get('/u/Ann');
    await ann.post('/u/Ann/photo/report');
    assert.match(await flashOn(ann, '/u/Ann'), /You can't report your own photo/);

    for (const b of reporters.slice(1)) {
      await b.get('/u/Ann');
      await b.post('/u/Ann/photo/report');
    }
    // Hidden everywhere until an admin looks; the owner is told why.
    const seen = (await app.browser().get('/u/Ann')).text;
    assert.doesNotMatch(seen, /\/media\//);
    assert.match(seen, /<span class="avatar big">A<\/span>/);
    assert.doesNotMatch((await bob.get('/search?q=Ann')).text, /\/media\//);
    assert.match(visible((await ann.get('/u/Ann')).text), /Your photo is hidden after reports until an admin looks at it/);
    assert.equal((await fetch(`${app.base}/media/${name}`)).status, 404, 'hidden from everyone');

    const boss = await player('boss@example.com', 'Boss');
    assert.match(visible((await boss.get('/more')).text), /Admin Reported chat and photos 1/);
    const shot = await fetch(`${app.base}/media/${name}`, { headers: { cookie: [...boss.jar].map(([k, v]) => `${k}=${v}`).join('; ') } });
    assert.equal(shot.status, 200, 'admins can still see it');
    assert.equal(shot.headers.get('cache-control'), 'private, no-store');
    const admin = await boss.get('/admin/reports');
    assert.match(visible(admin.text), /Reported photos .* Ann 3 reports · Hidden Last report .* Dismiss Remove photo/);
    assert.match(admin.text, new RegExp(`<img class="report-photo" src="/media/${name}"`));
    // Everyone else gets a plain 404 for the admin buttons.
    assert.equal((await bob.post(`/admin/photos/${app.store.get("SELECT id FROM users WHERE screen_name = 'Ann'").id}/remove`, { photo: name })).status, 404);

    const annId = app.store.get("SELECT id FROM users WHERE screen_name = 'Ann'").id;
    await boss.get('/admin/reports');
    await boss.post(`/admin/photos/${annId}/remove`, { photo: 'f'.repeat(32) + '.jpg' });
    assert.match(await flashOn(boss, '/admin/reports'), /already changed or removed/);
    assert.equal(photoOf('Ann'), name);
    assert.equal((await boss.post(`/admin/photos/${annId}/remove`, { photo: name })).location, '/admin/reports#photos');
    assert.equal(photoOf('Ann'), null);
    assert.deepEqual(onDisk(), []);
    assert.equal(app.store.get('SELECT COUNT(*) AS n FROM photo_reports').n, 0);
    assert.match(visible((await boss.get('/admin/reports')).text), /No reported photos right now/);
    const note = app.store.get("SELECT text, url FROM notifications WHERE user_id = ? AND kind = 'photo'", annId);
    assert.deepEqual({ ...note }, { text: 'Your profile photo was removed for breaking the rules', url: '/u/Ann#photo' });

    // A week without uploads.
    const own = visible((await ann.get('/u/Ann')).text);
    assert.match(own, /An admin removed your last photo\. You can add a new one after Nov 1, 2026\./);
    await ann.upload('/photo', { data: cleanJpeg() });
    assert.match(await flashOn(ann, '/u/Ann'), /An admin removed your last photo/);
    assert.equal(photoOf('Ann'), null);
    time.advance(7 * DAY + 60_000);
    await ann.get('/u/Ann');
    await ann.upload('/photo', { data: cleanJpeg() });
    assert.match(photoOf('Ann'), /\.jpg$/);
  });

  test('an admin can keep a reported photo', async () => {
    const ann = await player('ann@example.com', 'Ann');
    await ann.get('/u/Ann');
    await ann.upload('/photo', { data: cleanJpeg() });
    const name = photoOf('Ann');
    for (const who of ['Bob', 'Cat', 'Dan']) {
      const b = await player(`${who.toLowerCase()}@example.com`, who);
      await b.get('/u/Ann');
      await b.post('/u/Ann/photo/report');
    }
    assert.equal(app.store.get('SELECT photo_hidden FROM users WHERE photo = ?', name).photo_hidden, 1);
    const boss = await player('boss@example.com', 'Boss');
    await boss.get('/admin/reports');
    const annId = app.store.get("SELECT id FROM users WHERE screen_name = 'Ann'").id;
    assert.equal((await boss.post(`/admin/photos/${annId}/dismiss`, { photo: name })).location, '/admin/reports#photos');
    assert.equal(app.store.get('SELECT photo_hidden FROM users WHERE photo = ?', name).photo_hidden, 0);
    assert.equal(app.store.get('SELECT COUNT(*) AS n FROM photo_reports').n, 0);
    assert.match((await app.browser().get('/u/Ann')).text, new RegExp(`/media/${name}`));
    assert.deepEqual(onDisk(), [name]);
  });

  test('deleting the account deletes the photo file', async () => {
    const ann = await player('ann@example.com', 'Ann');
    await ann.get('/u/Ann');
    await ann.upload('/photo', { data: cleanJpeg() });
    const name = photoOf('Ann');
    assert.deepEqual(onDisk(), [name]);
    await ann.get('/u/Ann');
    await ann.post('/account/delete', { password: 'correct horse' });
    assert.equal(app.store.get("SELECT COUNT(*) AS n FROM users WHERE screen_name = 'Ann'").n, 0);
    assert.deepEqual(onDisk(), []);
    assert.equal((await fetch(`${app.base}/media/${name}`)).status, 404);
  });

  test('only an admin can give the official account a photo', async () => {
    const officialId = ensureOfficial(app.store, new Date(MORNING));
    const official = app.store.get('SELECT screen_name FROM users WHERE id = ?', officialId).screen_name;
    const ann = await player('ann@example.com', 'Ann');
    assert.doesNotMatch((await ann.get(`/u/${official}`)).text, /admin\/official\/photo/);
    assert.equal((await ann.upload('/admin/official/photo', { data: cleanJpeg() })).status, 404);
    const boss = await player('boss@example.com', 'Boss');
    assert.match((await boss.get(`/u/${official}`)).text, /action="\/admin\/official\/photo"/);
    assert.equal((await boss.upload('/admin/official/photo', { data: cleanJpeg() })).location, `/u/${official}#photo`);
    assert.match(app.store.get('SELECT photo FROM users WHERE id = ?', officialId).photo, /\.jpg$/);
    await boss.get(`/u/${official}`);
    await boss.post('/admin/official/photo/delete');
    assert.equal(app.store.get('SELECT photo FROM users WHERE id = ?', officialId).photo, null);
  });

  test('players with no photo keep the initials everywhere', async () => {
    const ann = await player('ann@example.com', 'Ann');
    await player('bob@example.com', 'Bob');
    await ann.get('/u/Ann');
    await ann.upload('/photo', { data: cleanJpeg() });
    const list = (await ann.get('/search?q=')).text + (await ann.get('/search?q=B')).text;
    assert.match(list, /<span class="player"><span class="avatar">B<\/span><a class="who" href="\/u\/Bob">Bob<\/a>/);
    assert.match((await ann.get('/u/Bob')).text, /<div class="profile-face"><span class="avatar big">B<\/span><\/div>/);
  });
});
