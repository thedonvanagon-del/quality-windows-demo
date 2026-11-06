// Private groups for friends. A group is just a list of members and,
// optionally, one sport: everyone's picks still live on one record, and the
// group's board reads from it. Nobody can keep a separate record per group.
//
// A local room is a group too (kind 'local'): one per city on the list in
// cities.js, open to anyone signed in, with no owner and no invite code.
// Admins moderate it. Private-group rules (the 20-group limit, owner powers,
// handing over or deleting on the way out) never touch one.

import crypto from 'node:crypto';
import { CITY } from './cities.js';
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
  const owned = store.get("SELECT COUNT(*) AS n FROM friend_groups WHERE owner_id = ? AND kind = 'private'", ownerId).n;
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

/**
 * Leave a group. When the owner leaves, the longest-standing member takes
 * over; the last one out deletes it. A local room just loses a member (and
 * stops being their home city); it stays when it's empty.
 */
export function leaveGroup(store, { groupId, userId }) {
  store.tx(() => {
    store.run('DELETE FROM group_members WHERE group_id = ? AND user_id = ?', groupId, userId);
    const group = store.get('SELECT owner_id, kind, city_slug FROM friend_groups WHERE id = ?', groupId);
    if (group?.kind === 'local') {
      store.run('UPDATE users SET home_city = NULL WHERE id = ? AND home_city = ?', userId, group.city_slug);
      return;
    }
    if (!group || group.owner_id !== userId) return;
    const heir = store.get('SELECT user_id FROM group_members WHERE group_id = ? ORDER BY joined_at, user_id LIMIT 1', groupId);
    if (heir) store.run('UPDATE friend_groups SET owner_id = ? WHERE id = ?', heir.user_id, groupId);
    else store.run('DELETE FROM friend_groups WHERE id = ?', groupId);
  });
}

export function deleteGroup(store, { groupId, userId }) {
  return store.run("DELETE FROM friend_groups WHERE id = ? AND owner_id = ? AND kind = 'private'", groupId, userId).changes > 0;
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

/** The private groups a player is in. Local rooms are listed apart, by roomsOf. */
export function groupsOf(store, userId) {
  return store.all(
    `SELECT g.*, (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) AS members
       FROM friend_groups g JOIN group_members m ON m.group_id = g.id
      WHERE m.user_id = ? AND g.kind = 'private' ORDER BY g.name COLLATE NOCASE`,
    userId,
  );
}

// ---- local rooms --------------------------------------------------------------

/** How many rooms one player can start in a day. Admins have no limit. */
export const ROOMS_PER_DAY = 3;

const withCity = (room) => room && { ...room, city: CITY[room.city_slug] ?? null };

/** A city's room, archived or not, or null. */
export function roomFor(store, citySlug) {
  return withCity(store.get("SELECT * FROM friend_groups WHERE kind = 'local' AND city_slug = ?", String(citySlug ?? '')) ?? null);
}

/** Every open room, with its member count and whether `userId` is in it. */
export function localRooms(store, userId) {
  return store
    .all(
      `SELECT g.*, (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) AS members,
              EXISTS (SELECT 1 FROM group_members WHERE group_id = g.id AND user_id = ?) AS joined
         FROM friend_groups g WHERE g.kind = 'local' AND g.archived_at IS NULL`,
      userId ?? 0,
    )
    .map(withCity);
}

/** The open rooms a player is in. */
export function roomsOf(store, userId) {
  return localRooms(store, userId).filter((r) => r.joined);
}

/**
 * Start the room for a city on the list, with its starter as the first
 * member. Never a second room for a city: `existing` comes back instead.
 * `limit` false is for admins.
 */
export function startRoom(store, { citySlug, userId, now, limit = true }) {
  const city = CITY[citySlug];
  if (!city) return { error: 'Pick a city from the list.' };
  const existing = roomFor(store, city.slug);
  if (existing?.archived_at) return { error: `The ${city.name} room is closed for now.` };
  if (existing) return { error: `There's already a ${city.name} room.`, existing };
  if (limit) {
    const since = new Date(now.getTime() - 86_400_000).toISOString();
    const started = store.get("SELECT COUNT(*) AS n FROM friend_groups WHERE kind = 'local' AND created_by = ? AND created_at > ?", userId, since).n;
    if (started >= ROOMS_PER_DAY) return { error: `You can start ${ROOMS_PER_DAY} rooms a day. Try again tomorrow.` };
  }
  return store.tx(() => {
    const { lastInsertRowid } = store.run(
      "INSERT INTO friend_groups (kind, name, city_slug, created_by, created_at) VALUES ('local', ?, ?, ?, ?)",
      city.label, city.slug, userId, now.toISOString(),
    );
    const id = Number(lastInsertRowid);
    joinGroup(store, { groupId: id, userId, now });
    return { id };
  });
}

/** One tap into an open room. No code. */
export function joinRoom(store, { groupId, userId, now }) {
  const room = store.get("SELECT * FROM friend_groups WHERE id = ? AND kind = 'local'", groupId);
  if (!room) return { error: 'No such room.' };
  if (room.archived_at) return { error: `The ${room.name} room is closed.` };
  joinGroup(store, { groupId: room.id, userId, now });
  return { room };
}

/**
 * A player's home city: one pick from the list, or '' for none. It joins
 * that city's room, and starts it when there isn't one yet and `canStart`
 * (a confirmed email). Without one, the room waits for the confirmation
 * (see settleHomeCity). One home; any number of rooms.
 */
export function setHomeCity(store, { userId, citySlug, now, canStart, limit = true }) {
  if (!citySlug) {
    store.run('UPDATE users SET home_city = NULL WHERE id = ?', userId);
    return {};
  }
  const city = CITY[citySlug];
  if (!city) return { error: 'Pick a city from the list.' };
  let room = roomFor(store, city.slug);
  if (room?.archived_at) return { error: `The ${city.name} room is closed for now. Pick another city.` };
  if (room) {
    joinGroup(store, { groupId: room.id, userId, now });
  } else if (canStart) {
    const started = startRoom(store, { citySlug: city.slug, userId, now, limit });
    if (started.error) return started;
    room = { id: started.id, started: true };
  }
  store.run('UPDATE users SET home_city = ? WHERE id = ?', city.slug, userId);
  return { city, room: room ?? null };
}

/** Once a player's email is confirmed: into their home city's room, starting it if it still isn't there. */
export function settleHomeCity(store, userId, now) {
  const home = store.get('SELECT home_city FROM users WHERE id = ?', userId)?.home_city;
  if (!home || !CITY[home]) return;
  const room = roomFor(store, home);
  if (room && !room.archived_at) joinGroup(store, { groupId: room.id, userId, now });
  else if (!room) startRoom(store, { citySlug: home, userId, now });
}

/** For admins: every room, archived ones too, with members and messages. */
export function allRooms(store) {
  return store
    .all(
      `SELECT g.*, u.screen_name AS started_by,
              (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) AS members,
              (SELECT COUNT(*) FROM chat_messages WHERE group_id = g.id AND deleted_at IS NULL) AS messages
         FROM friend_groups g LEFT JOIN users u ON u.id = g.created_by
        WHERE g.kind = 'local' ORDER BY g.archived_at IS NOT NULL, g.name COLLATE NOCASE`,
    )
    .map(withCity);
}

/** An admin renaming a room. Only the name it shows: the city stays. */
export function renameRoom(store, { groupId, name }) {
  name = String(name ?? '').trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 40) return { error: 'Give the room a name of 2 to 40 characters.' };
  const { changes } = store.run("UPDATE friend_groups SET name = ? WHERE id = ? AND kind = 'local'", name, groupId);
  return changes ? { name } : { error: 'No such room.' };
}

/** Archived: off the directory, no new posts or members, history kept. Restore undoes it. */
export function archiveRoom(store, { groupId, now, archived = true }) {
  return store.run("UPDATE friend_groups SET archived_at = ? WHERE id = ? AND kind = 'local'", archived ? now.toISOString() : null, groupId).changes > 0;
}

export function membersOf(store, groupId) {
  return store.all(
    `SELECT u.id, u.screen_name, m.joined_at FROM group_members m JOIN users u ON u.id = m.user_id
      WHERE m.group_id = ? ORDER BY u.screen_name COLLATE NOCASE`,
    groupId,
  );
}
