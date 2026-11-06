// Profile photos. The browser crops and shrinks a photo to a 400×400 JPEG
// before sending it (which also drops its EXIF and GPS), but the server
// trusts none of that: it checks the size and the file's first bytes, strips
// metadata itself, and stores the file under a random name in MEDIA_DIR.
// No image library: the formats are walked by hand, segment by segment.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const PHOTO_MAX = 1024 * 1024;
/** Reports that hide a photo until an admin looks, the same as chat. */
export const PHOTO_HIDE_AFTER = 3;
/** How long a player can't upload after an admin removes their photo. */
export const PHOTO_BLOCK_DAYS = 7;

export const MEDIA_NAME = /^[0-9a-f]{32}\.(jpg|png|webp)$/;
export const MEDIA_TYPES = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** What the first bytes say the file is: jpg, png, webp, or null for anything else. */
export function sniff(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(PNG_SIGNATURE)) return 'png';
  if (buf.length >= 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}

/**
 * A JPEG without its APP1–APP15 and COM segments (EXIF, GPS, XMP, ICC,
 * comments). APP0 (JFIF) and everything needed to draw the picture stay.
 * Returns null if the markers don't add up.
 */
export function stripJpeg(buf) {
  const out = [buf.subarray(0, 2)];
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) return null;
    // Any number of 0xFF fill bytes may come before a marker.
    let j = i;
    while (j < buf.length && buf[j] === 0xff) j++;
    if (j >= buf.length) return null;
    const marker = buf[j];
    if (marker === 0xd9) {
      out.push(Buffer.from([0xff, 0xd9]));
      return Buffer.concat(out);
    }
    // Markers with no length: TEM and the restart markers.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      out.push(Buffer.from([0xff, marker]));
      i = j + 1;
      continue;
    }
    if (j + 3 > buf.length) return null;
    const length = buf.readUInt16BE(j + 1);
    const end = j + 1 + length;
    if (length < 2 || end > buf.length) return null;
    // Start of scan: the picture data runs from here to the end of the file.
    if (marker === 0xda) {
      out.push(Buffer.from([0xff]), buf.subarray(j, buf.length));
      return Buffer.concat(out);
    }
    const metadata = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;
    if (!metadata) out.push(Buffer.from([0xff]), buf.subarray(j, end));
    i = end;
  }
  return null;
}

// PNG chunks a picture needs to draw right. Text, EXIF and timestamps go.
const PNG_KEEP = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'gAMA', 'cHRM', 'sRGB', 'iCCP', 'sBIT', 'pHYs', 'acTL', 'fcTL', 'fdAT']);

/** A PNG with only the chunks it needs to draw, or null if the chunks don't add up. */
export function stripPng(buf) {
  const out = [PNG_SIGNATURE];
  let i = 8;
  while (i + 12 <= buf.length) {
    const length = buf.readUInt32BE(i);
    const type = buf.toString('latin1', i + 4, i + 8);
    const end = i + 12 + length;
    if (end > buf.length) return null;
    if (PNG_KEEP.has(type)) out.push(buf.subarray(i, end));
    i = end;
    if (type === 'IEND') return Buffer.concat(out);
  }
  return null;
}

/** A WebP without its EXIF and XMP chunks (and their flags), or null if the chunks don't add up. */
export function stripWebp(buf) {
  const chunks = [];
  let i = 12;
  while (i + 8 <= buf.length) {
    const type = buf.toString('latin1', i, i + 4);
    const length = buf.readUInt32LE(i + 4);
    const end = i + 8 + length + (length % 2);
    if (i + 8 + length > buf.length) return null;
    if (type !== 'EXIF' && type !== 'XMP ') {
      const chunk = Buffer.from(buf.subarray(i, Math.min(end, buf.length)));
      // VP8X flags: EXIF is 0x08, XMP is 0x04.
      if (type === 'VP8X' && chunk.length > 8) chunk[8] &= ~0x0c;
      chunks.push(chunk);
    }
    i = end;
  }
  if (!chunks.length) return null;
  const body = Buffer.concat(chunks);
  const head = Buffer.alloc(12);
  head.write('RIFF', 0, 'latin1');
  head.writeUInt32LE(body.length + 4, 4);
  head.write('WEBP', 8, 'latin1');
  return Buffer.concat([head, body]);
}

/** Check an upload and strip its metadata: { ext, data } or { error } in plain words. */
export function cleanImage(buf) {
  if (!buf?.length) return { error: 'Pick a photo first.' };
  if (buf.length > PHOTO_MAX) return { error: 'That photo is over 1 MB. Pick a smaller one.' };
  const ext = sniff(buf);
  if (!ext) return { error: 'That isn\'t a photo we can use. Use a JPEG, PNG or WebP.' };
  const data = { jpg: stripJpeg, png: stripPng, webp: stripWebp }[ext](buf);
  if (!data) return { error: 'That photo looks damaged. Try another.' };
  return { ext, data };
}

/** Make the folder the photos live in, if it isn't there. */
export function mediaDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Delete a photo's file. A name that isn't one of ours, or a file already gone, is ignored. */
export function deleteFile(dir, name) {
  if (!name || !MEDIA_NAME.test(name)) return;
  fs.rmSync(path.join(dir, name), { force: true });
}

/** Write a cleaned image as this player's photo. The old file and its reports go. */
export function savePhoto(store, dir, userId, { ext, data }) {
  const name = `${crypto.randomBytes(16).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(dir, name), data, { flag: 'wx' });
  const old = store.get('SELECT photo FROM users WHERE id = ?', userId)?.photo ?? null;
  store.tx(() => {
    store.run('UPDATE users SET photo = ?, photo_hidden = 0 WHERE id = ?', name, userId);
    store.run('DELETE FROM photo_reports WHERE user_id = ?', userId);
  });
  deleteFile(dir, old);
  return name;
}

/** Take a player's photo down (their own choice, or an admin's), file and all. */
export function clearPhoto(store, dir, userId) {
  const old = store.get('SELECT photo FROM users WHERE id = ?', userId)?.photo ?? null;
  store.tx(() => {
    store.run('UPDATE users SET photo = NULL, photo_hidden = 0 WHERE id = ?', userId);
    store.run('DELETE FROM photo_reports WHERE user_id = ?', userId);
  });
  deleteFile(dir, old);
  return old;
}

/** When a player may upload again, if an admin removed their photo in the last week. */
export function uploadBlockedUntil(store, userId, now) {
  const until = store.get('SELECT photo_blocked_until FROM users WHERE id = ?', userId)?.photo_blocked_until ?? null;
  return until && until > now.toISOString() ? until : null;
}

/** One player reporting another's photo, once. Three reports hide it. */
export function reportPhoto(store, { ownerId, reporterId, now }) {
  const owner = store.get('SELECT photo, photo_hidden FROM users WHERE id = ?', ownerId);
  if (!owner?.photo) return { error: 'That photo is already gone.' };
  if (ownerId === reporterId) return { error: "You can't report your own photo." };
  store.run('INSERT OR IGNORE INTO photo_reports (user_id, photo, reporter_id, created_at) VALUES (?, ?, ?, ?)', ownerId, owner.photo, reporterId, now.toISOString());
  const { n } = store.get('SELECT COUNT(*) AS n FROM photo_reports WHERE user_id = ? AND photo = ?', ownerId, owner.photo);
  if (n >= PHOTO_HIDE_AFTER && !owner.photo_hidden) store.run('UPDATE users SET photo_hidden = 1 WHERE id = ?', ownerId);
  return { reports: n, hidden: n >= PHOTO_HIDE_AFTER };
}

/** Whether this player already reported this photo. */
export function reportedBy(store, ownerId, photo, reporterId) {
  return Boolean(reporterId && photo && store.get('SELECT 1 AS x FROM photo_reports WHERE user_id = ? AND photo = ? AND reporter_id = ?', ownerId, photo, reporterId));
}

/** Photos with reports on them, most reported first, for the admin page. */
export function reportedPhotos(store) {
  return store.all(
    `SELECT u.id, u.screen_name, u.photo, u.photo_hidden AS hidden, COUNT(*) AS reports, MAX(r.created_at) AS last_report
       FROM photo_reports r JOIN users u ON u.id = r.user_id AND u.photo = r.photo
      GROUP BY u.id ORDER BY reports DESC, last_report DESC`,
  ).map((r) => ({ ...r, hidden: Boolean(r.hidden) }));
}

/** An admin keeping the photo: reports cleared, shown again. `photo` must still be the current one. */
export function dismissPhoto(store, { userId, photo }) {
  const current = store.get('SELECT photo FROM users WHERE id = ?', userId)?.photo;
  if (!current || current !== photo) return { error: 'That photo was already changed or removed.' };
  store.tx(() => {
    store.run('DELETE FROM photo_reports WHERE user_id = ?', userId);
    store.run('UPDATE users SET photo_hidden = 0 WHERE id = ?', userId);
  });
  return {};
}

/**
 * An admin removing a photo: the file goes, the owner is told, and they
 * can't upload another for a week. `photo` must still be the current one.
 */
export function removeReportedPhoto(store, dir, { userId, photo, now, notifier }) {
  const current = store.get('SELECT photo FROM users WHERE id = ?', userId)?.photo;
  if (!current || current !== photo) return { error: 'That photo was already changed or removed.' };
  clearPhoto(store, dir, userId);
  const until = new Date(now.getTime() + PHOTO_BLOCK_DAYS * 86_400_000).toISOString();
  store.run('UPDATE users SET photo_blocked_until = ? WHERE id = ?', until, userId);
  const owner = store.get('SELECT screen_name FROM users WHERE id = ?', userId);
  notifier?.tell(userId, {
    kind: 'photo',
    text: 'Your profile photo was removed for breaking the rules',
    url: owner?.screen_name ? `/u/${encodeURIComponent(owner.screen_name)}#photo` : '/notifications',
  }, now);
  return { until };
}

/** Photos for a list of player ids: id -> file name, leaving out anyone whose photo is hidden. */
export function photosFor(store, ids) {
  const unique = [...new Set(ids.filter((id) => Number.isInteger(id)))];
  const map = new Map();
  for (let i = 0; i < unique.length; i += 400) {
    const chunk = unique.slice(i, i + 400);
    for (const r of store.all(
      `SELECT id, photo FROM users WHERE id IN (${chunk.map(() => '?').join(',')}) AND photo IS NOT NULL AND photo_hidden = 0`,
      ...chunk,
    )) map.set(r.id, r.photo);
  }
  return map;
}

/**
 * The parts of a multipart/form-data body: text fields as URLSearchParams,
 * files by field name as { filename, type, data }. Null if it isn't one.
 */
export function parseMultipart(body, contentType) {
  const m = /boundary=(?:"([^"]{1,70})"|([^;\s]{1,70}))/i.exec(contentType ?? '');
  if (!m) return null;
  const boundary = Buffer.from(`--${m[1] ?? m[2]}`);
  const fields = new URLSearchParams();
  const files = new Map();
  let i = body.indexOf(boundary);
  if (i < 0) return null;
  for (let parts = 0; parts < 20; parts++) {
    i += boundary.length;
    // "--" after a boundary closes the body.
    if (body[i] === 0x2d && body[i + 1] === 0x2d) break;
    if (body[i] === 0x0d && body[i + 1] === 0x0a) i += 2;
    const headEnd = body.indexOf('\r\n\r\n', i);
    if (headEnd < 0) return null;
    const head = body.toString('utf8', i, headEnd);
    const next = body.indexOf(Buffer.concat([Buffer.from('\r\n'), boundary]), headEnd + 4);
    if (next < 0) return null;
    const data = body.subarray(headEnd + 4, next);
    const disposition = /content-disposition:\s*form-data;([^\r\n]*)/i.exec(head)?.[1] ?? '';
    const name = /\bname="([^"]*)"/i.exec(disposition)?.[1];
    const filename = /\bfilename="([^"]*)"/i.exec(disposition)?.[1];
    if (name != null) {
      if (filename != null) files.set(name, { filename, type: /content-type:\s*([^\r\n;]+)/i.exec(head)?.[1]?.trim() ?? '', data });
      else fields.append(name, data.toString('utf8'));
    }
    i = next + 2;
  }
  return { fields, files };
}
