// Invite links: every player gets a personal link, /i/<code>, that sends a
// friend to signup with the inviter remembered (users.invited_by). The invite
// counts once the friend has confirmed their email and picked a screen name:
// the inviter hears about it, and three count for the Recruiter badge. The
// new player follows whoever invited them.
//
// These are separate from group invite links (/join/<code>), which still
// work the same way.

import crypto from 'node:crypto';

import { checkBadges, RECRUITER_GOAL } from './badges.js';
import { follow } from './follows.js';

// The same letters as group codes: no 0/O or 1/I/L, so a code read out loud comes through.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const INVITE_LENGTH = 8;

const newCode = () => Array.from(crypto.randomBytes(INVITE_LENGTH), (b) => ALPHABET[b % ALPHABET.length]).join('');

/** The player's invite code, made the first time it's asked for. */
export function inviteCodeOf(store, userId) {
  const found = store.get('SELECT invite_code FROM users WHERE id = ?', userId)?.invite_code;
  if (found) return found;
  for (let tries = 0; tries < 5; tries++) {
    const code = newCode();
    try {
      store.run('UPDATE users SET invite_code = ? WHERE id = ? AND invite_code IS NULL', code, userId);
    } catch (err) {
      if (/UNIQUE/.test(err.message)) continue;
      throw err;
    }
    return store.get('SELECT invite_code FROM users WHERE id = ?', userId).invite_code;
  }
  throw new Error('no free invite code');
}

/** Who an invite code belongs to: a player with a screen name (never the official account), or null. */
export function findInviter(store, code) {
  const clean = String(code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.length !== INVITE_LENGTH) return null;
  return store.get('SELECT id, screen_name, invite_code AS code FROM users WHERE invite_code = ? AND screen_name IS NOT NULL AND official = 0', clean) ?? null;
}

/** Once the new player has a screen name: follow whoever invited them. */
export function followInviter(store, userId, now) {
  const row = store.get('SELECT invited_by FROM users WHERE id = ?', userId);
  if (row?.invited_by) follow(store, { followerId: userId, followeeId: row.invited_by, now });
}

/**
 * Count the invite once the new player has confirmed their email and has a
 * screen name, whichever came last. Tells the inviter, once. Returns whether
 * it counted just now.
 */
export function countInvite(store, userId, now, notifier = null) {
  const u = store.get('SELECT screen_name, invited_by, invite_counted_at, email_verified_at FROM users WHERE id = ?', userId);
  if (!u?.invited_by || u.invite_counted_at || !u.screen_name || !u.email_verified_at) return false;
  const { changes } = store.run('UPDATE users SET invite_counted_at = ? WHERE id = ? AND invite_counted_at IS NULL', now.toISOString(), userId);
  if (!changes) return false;
  notifier?.tell(u.invited_by, {
    kind: 'invite',
    text: `${u.screen_name} joined from your invite.`,
    url: `/u/${encodeURIComponent(u.screen_name)}`,
  }, now);
  checkBadges(store, [u.invited_by], now, notifier);
  return true;
}

/** For the invite page: who joined (counted), and how many signed up but haven't finished. */
export function inviteStats(store, userId) {
  const joined = store.all(
    'SELECT screen_name FROM users WHERE invited_by = ? AND invite_counted_at IS NOT NULL ORDER BY invite_counted_at',
    userId,
  ).map((r) => r.screen_name);
  const waiting = store.get('SELECT COUNT(*) AS n FROM users WHERE invited_by = ? AND invite_counted_at IS NULL', userId).n;
  return { joined, waiting, goal: RECRUITER_GOAL };
}
