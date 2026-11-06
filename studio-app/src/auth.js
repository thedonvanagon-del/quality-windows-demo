// Profiles and sign-in. Two ways in, both ending in a cookie session:
//   1. Email a 6-digit code (also how a new profile is confirmed).
//   2. Email + password, for people who prefer it.
// A user row only exists after the person proves they own the address, so
// nobody can register someone else's email. Owner access needs that proof too.

import crypto from 'node:crypto';

export const COOKIE = 'studio_sid';
const DAY = 86_400_000;
const SESSION_DAYS = 30;
const ANON_HOURS = 24;
const CODE_MINUTES = 10;
const CODES_PER_HOUR = 5;
const CODE_TRIES = 5;

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const iso = (d) => d.toISOString();

// ---- passwords ----

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

const DUMMY = hashPassword('not-a-real-password');

export function checkPassword(password, stored) {
  const [scheme, saltB64, hashB64] = String(stored || DUMMY).split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const want = Buffer.from(hashB64, 'base64');
  const got = crypto.scryptSync(String(password), Buffer.from(saltB64, 'base64'), want.length);
  const ok = crypto.timingSafeEqual(got, want);
  return ok && Boolean(stored);
}

export function passwordProblem(password) {
  if (typeof password !== 'string' || password.length < 8) return 'Use at least 8 characters for your password.';
  if (password.length > 200) return 'That password is too long.';
  return null;
}

// ---- emails ----

export function normalizeEmail(raw) {
  const email = String(raw ?? '').trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@<>()"',;:]+@[^\s@<>()"',;:]+\.[^\s@<>()"',;:]{2,}$/.test(email)) return null;
  return email;
}

// ---- sessions ----

/** A fresh session. userId may be null for a visitor who hasn't signed in. */
export function createSession(store, userId, now = new Date()) {
  const token = crypto.randomBytes(32).toString('base64url');
  const csrf = crypto.randomBytes(24).toString('base64url');
  const ttl = userId ? SESSION_DAYS * DAY : ANON_HOURS * 3_600_000;
  store.run(
    'INSERT INTO sessions (token_hash, user_id, csrf, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
    sha256(token), userId, csrf, iso(now), iso(new Date(now.getTime() + ttl)),
  );
  return { token, csrf, maxAgeSeconds: Math.floor(ttl / 1000) };
}

export function findSession(store, token, now = new Date()) {
  if (!token) return null;
  const row = store.get(
    `SELECT s.token_hash, s.csrf, s.user_id, u.id AS uid, u.email, u.name, u.phone, u.email_verified, u.email_reminders, u.password_hash IS NOT NULL AS has_password
       FROM sessions s LEFT JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?`,
    sha256(token), iso(now),
  );
  if (!row) return null;
  const user = row.uid
    ? { id: row.uid, email: row.email, name: row.name, phone: row.phone, emailVerified: Boolean(row.email_verified), emailReminders: Boolean(row.email_reminders), hasPassword: Boolean(row.has_password) }
    : null;
  return { csrf: row.csrf, tokenHash: row.token_hash, user };
}

export function destroySession(store, token) {
  if (token) store.run('DELETE FROM sessions WHERE token_hash = ?', sha256(token));
}

export function deleteExpired(store, now = new Date()) {
  store.run('DELETE FROM sessions WHERE expires_at <= ?', iso(now));
  store.run('DELETE FROM login_codes WHERE expires_at <= ?', iso(new Date(now.getTime() - DAY)));
}

export function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function cookieHeader(token, maxAgeSeconds, secure) {
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure ? '; Secure' : ''}`;
}

export function clearCookieHeader(secure) {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}

export function csrfMatches(session, given) {
  if (!session || typeof given !== 'string') return false;
  const a = Buffer.from(session.csrf);
  const b = Buffer.from(given);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---- emailed codes ----

/**
 * Makes a code for `email`. payload (optional) is a new profile's details,
 * saved only when the code is entered. Returns { code } or { limited: true }.
 */
export function issueCode(store, email, payload = null, now = new Date()) {
  const recent = store.get('SELECT COUNT(*) AS n FROM login_codes WHERE email = ? AND created_at > ?', email, iso(new Date(now.getTime() - 3_600_000)));
  if (recent.n >= CODES_PER_HOUR) return { limited: true };
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  store.tx(() => {
    store.run('UPDATE login_codes SET used = 1 WHERE email = ? AND used = 0', email);
    store.run(
      'INSERT INTO login_codes (email, code_hash, payload, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
      email, sha256(`${email}:${code}`), payload ? JSON.stringify(payload) : null, iso(now), iso(new Date(now.getTime() + CODE_MINUTES * 60_000)),
    );
  });
  return { code, minutes: CODE_MINUTES };
}

/** Checks a typed code. Returns { ok: true, payload } or { ok: false }. Five wrong tries burns the code. */
export function redeemCode(store, email, typed, now = new Date()) {
  const row = store.get('SELECT * FROM login_codes WHERE email = ? AND used = 0 AND expires_at > ? ORDER BY id DESC LIMIT 1', email, iso(now));
  if (!row || row.attempts >= CODE_TRIES) return { ok: false };
  store.run('UPDATE login_codes SET attempts = attempts + 1 WHERE id = ?', row.id);
  const given = Buffer.from(sha256(`${email}:${String(typed).replace(/\s+/g, '')}`));
  const want = Buffer.from(row.code_hash);
  if (!crypto.timingSafeEqual(given, want)) return { ok: false };
  store.run('UPDATE login_codes SET used = 1 WHERE id = ?', row.id);
  return { ok: true, payload: row.payload ? JSON.parse(row.payload) : null };
}

/**
 * The code was right: find or create the person and mark the address verified.
 * A profile's details (from signing up) are applied only the first time.
 */
export function completeSignIn(store, email, payload, now = new Date()) {
  let user = store.get('SELECT * FROM users WHERE email = ?', email);
  if (!user) {
    const r = store.run(
      'INSERT INTO users (email, name, phone, password_hash, email_verified, created_at) VALUES (?, ?, ?, ?, 1, ?)',
      email, payload?.name ?? '', payload?.phone ?? '', payload?.passwordHash ?? null, iso(now),
    );
    user = store.get('SELECT * FROM users WHERE id = ?', r.id);
  } else if (!user.email_verified) {
    store.run('UPDATE users SET email_verified = 1 WHERE id = ?', user.id);
  }
  return user;
}

// ---- who is the owner ----

export function isAdmin(user, config) {
  return Boolean(user && user.emailVerified && config.adminEmails.includes(user.email.toLowerCase()));
}

// ---- a small in-memory rate limiter (per process; fine for one server) ----

export function createLimiter(max, windowMs) {
  const hits = new Map();
  return {
    /** true if this key may go ahead (and counts it). */
    take(key, now = Date.now()) {
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= max) {
        hits.set(key, recent);
        return false;
      }
      recent.push(now);
      hits.set(key, recent);
      if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
      return true;
    },
  };
}
