// Private groups for friends. A group is just a list of members and,
// optionally, one sport: everyone's picks still live on one record, and the
// group's board reads from it. Nobody can keep a separate record per group.

import crypto from 'node:crypto';
import { SPORT } from './sports.js';

// No 0/O or 1/I/L, so a code read out loud comes through.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function inviteCode() {
  return Array.from(crypto.randomBytes(8), (b) => ALPHABET[b % ALPHABET.length]).join('');
}

export function createGroup(store, { ownerId, name, sport, now }) {
  name = String(name ?? '').trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 40) return { error: 'Give the group a name of 2 to 40 characters.' };
  if (sport && !SPORT[sport]) return { error: 'Pick a sport from the list.' };
  const owned = store.get('SELECT COUNT(*) AS n FROM friend_groups WHERE owner_id = ?', ownerId).n;
  if (owned >= 20) return { error: 'You can run up to 20 groups.' };
  return store.tx(() => {
    const { lastInsertRowid } = store.run(
      'INSERT INTO friend_groups (name, sport, invite_code, owner_id, created_at) VALUES (?, ?, ?, ?, ?)',
      name, sport || null, inviteCode(), ownerId, now.toISOString(),
    );
    const id = Number(lastInsertRowid);
    store.run('INSERT INTO group_members (group_id, user_id, joined_at) VALUES (?, ?, ?)', id, ownerId, now.toISOString());
    return { id };
  });
}

export function findByCode(store, code) {
  const clean = String(code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return clean ? store.get('SELECT * FROM friend_groups WHERE invite_code = ?', clean) ?? null : null;
}

export function joinGroup(store, { groupId, userId, now }) {
  store.run('INSERT OR IGNORE INTO group_members (group_id, user_id, joined_at) VALUES (?, ?, ?)', groupId, userId, now.toISOString());
}

/** Leave a group. When the owner leaves, the longest-standing member takes over; the last one out deletes it. */
export function leaveGroup(store, { groupId, userId }) {
  store.tx(() => {
    store.run('DELETE FROM group_members WHERE group_id = ? AND user_id = ?', groupId, userId);
    const group = store.get('SELECT owner_id FROM friend_groups WHERE id = ?', groupId);
    if (!group || group.owner_id !== userId) return;
    const heir = store.get('SELECT user_id FROM group_members WHERE group_id = ? ORDER BY joined_at, user_id LIMIT 1', groupId);
    if (heir) store.run('UPDATE friend_groups SET owner_id = ? WHERE id = ?', heir.user_id, groupId);
    else store.run('DELETE FROM friend_groups WHERE id = ?', groupId);
  });
}

export function deleteGroup(store, { groupId, userId }) {
  return store.run('DELETE FROM friend_groups WHERE id = ? AND owner_id = ?', groupId, userId).changes > 0;
}

/** The group, if `userId` is in it. Groups are invisible to everyone else. */
export function groupFor(store, groupId, userId) {
  return (
    store.get(
      `SELECT g.* FROM friend_groups g JOIN group_members m ON m.group_id = g.id
        WHERE g.id = ? AND m.user_id = ?`,
      groupId, userId,
    ) ?? null
  );
}

export function groupsOf(store, userId) {
  return store.all(
    `SELECT g.*, (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) AS members
       FROM friend_groups g JOIN group_members m ON m.group_id = g.id
      WHERE m.user_id = ? ORDER BY g.name COLLATE NOCASE`,
    userId,
  );
}

export function membersOf(store, groupId) {
  return store.all(
    `SELECT u.id, u.screen_name, m.joined_at FROM group_members m JOIN users u ON u.id = m.user_id
      WHERE m.group_id = ? ORDER BY u.screen_name COLLATE NOCASE`,
    groupId,
  );
}
