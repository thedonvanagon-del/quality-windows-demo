// Email and password accounts. Passwords are hashed with scrypt; sessions are
// random tokens kept in an HttpOnly cookie, stored here only as a hash.

import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);

// One of OWASP's scrypt settings: as much work as N=2^17, p=1, in 16 MB of
// memory instead of 128, which suits a small server.
const N = 2 ** 14;
const R = 8;
const P = 5;
const KEYLEN = 32;

export const SESSION_DAYS = 30;
export const MIN_PASSWORD = 8;
export const SCREEN_NAME = /^[A-Za-z0-9_]{3,20}$/;
const RESERVED = new Set(['admin', 'administrator', 'support', 'staff', 'mod', 'moderator', 'system', 'bookiebullies', 'bookie_bullies', 'null', 'undefined', 'me']);

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password.normalize('NFKC'), salt, KEYLEN, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 });
  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password, stored) {
  const [kind, n, r, p, salt, key] = String(stored).split('$');
  if (kind !== 'scrypt') return false;
  const expected = Buffer.from(key, 'base64');
  const actual = await scrypt(password.normalize('NFKC'), Buffer.from(salt, 'base64'), expected.length, {
    N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024,
  });
  return crypto.timingSafeEqual(actual, expected);
}

// Checked against when the email doesn't exist, so a wrong email takes as
// long as a wrong password.
let decoy;
export async function decoyCheck(password) {
  decoy ??= await hashPassword(crypto.randomBytes(12).toString('hex'));
  await verifyPassword(password, decoy);
  return false;
}

export function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

export function validEmail(email) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function screenNameProblem(name) {
  if (!SCREEN_NAME.test(name)) return 'Use 3 to 20 letters, numbers or underscores.';
  if (RESERVED.has(name.toLowerCase())) return 'That one is reserved. Try another.';
  return null;
}

const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');

export function createSession(store, userId, now) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(now.getTime() + SESSION_DAYS * 86_400_000);
  store.run(
    'INSERT INTO sessions (token_hash, user_id, csrf, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
    sha256(token), userId, crypto.randomBytes(24).toString('base64url'), now.toISOString(), expires.toISOString(),
  );
  return token;
}

export function readSession(store, token, now) {
  if (!token) return null;
  const row = store.get(
    `SELECT s.token_hash, s.csrf, s.expires_at, u.id, u.email, u.screen_name, u.created_at, u.theme, u.unit_size
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`,
    sha256(token),
  );
  if (!row) return null;
  if (row.expires_at <= now.toISOString()) {
    store.run('DELETE FROM sessions WHERE token_hash = ?', row.token_hash);
    return null;
  }
  return {
    tokenHash: row.token_hash,
    csrf: row.csrf,
    user: { id: row.id, email: row.email, screenName: row.screen_name, createdAt: row.created_at, theme: row.theme, unitSize: row.unit_size ?? 100 },
  };
}

export function endSession(store, tokenHash) {
  store.run('DELETE FROM sessions WHERE token_hash = ?', tokenHash);
}

export function pruneSessions(store, now) {
  store.run('DELETE FROM sessions WHERE expires_at <= ?', now.toISOString());
}

/** Fixed-window counter: `limit` tries per key per window. */
export function rateLimiter({ limit, windowMs }) {
  const hits = new Map();
  return {
    allow(key, now) {
      const t = now.getTime();
      const entry = hits.get(key);
      if (!entry || t - entry.start >= windowMs) {
        hits.set(key, { start: t, count: 1 });
        if (hits.size > 10_000) {
          for (const [k, v] of hits) if (t - v.start >= windowMs) hits.delete(k);
        }
        return true;
      }
      entry.count += 1;
      return entry.count <= limit;
    },
  };
}
