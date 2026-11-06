// Chat: short plain-text messages signed by screen name, in a thread that's
// either a game (public to everyone signed in) or a group (members only; the
// app checks membership). People delete their own, a group's owner can delete
// any message in it, and three reports from different players hide a message
// until someone looks at it.

export const CHAT_MAX = 280;
export const HIDE_AFTER_REPORTS = 3;

/** Tidy a message: no control characters, at most one blank line in a row. */
export function cleanMessage(text) {
  const body = String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!body) return { error: 'Type something first.' };
  if ([...body].length > CHAT_MAX) return { error: `Keep it under ${CHAT_MAX} characters.` };
  return { body };
}

/** The thread's column and value: { gameId } or { groupId }. */
function thread({ gameId = null, groupId = null }) {
  if ((gameId == null) === (groupId == null)) throw new Error('a chat thread is a game or a group');
  return gameId != null ? ['game_id', gameId] : ['group_id', groupId];
}

export function postMessage(store, { gameId = null, groupId = null, userId, text, now }) {
  thread({ gameId, groupId });
  const clean = cleanMessage(text);
  if (clean.error) return clean;
  const { lastInsertRowid } = store.run(
    'INSERT INTO chat_messages (game_id, group_id, user_id, body, created_at) VALUES (?, ?, ?, ?, ?)',
    gameId, groupId, userId, clean.body, now.toISOString(),
  );
  return { id: Number(lastInsertRowid) };
}

/** The newest `limit` messages in a thread ({ gameId } or { groupId }), oldest first. Reported ones come back with `hidden`. */
export function messages(store, where, limit = 150) {
  const [column, value] = thread(where);
  return store
    .all(
      `SELECT m.id, m.user_id, m.body, m.created_at, u.screen_name,
              (SELECT COUNT(*) FROM chat_reports r WHERE r.message_id = m.id) AS reports
         FROM chat_messages m JOIN users u ON u.id = m.user_id
        WHERE m.${column} = ? AND m.deleted_at IS NULL
        ORDER BY m.id DESC LIMIT ?`,
      value, limit,
    )
    .reverse()
    .map((m) => ({ ...m, hidden: m.reports >= HIDE_AFTER_REPORTS }));
}

/** Delete a message: your own, or any in a group you own. */
export function deleteMessage(store, { id, userId, now }) {
  const { changes } = store.run(
    `UPDATE chat_messages SET deleted_at = ?
      WHERE id = ? AND deleted_at IS NULL
        AND (user_id = ? OR group_id IN (SELECT id FROM friend_groups WHERE owner_id = ?))`,
    now.toISOString(), id, userId, userId,
  );
  return changes ? {} : { error: "That message is gone or isn't yours." };
}

export function reportMessage(store, { id, userId, now }) {
  const msg = store.get('SELECT user_id, game_id, group_id FROM chat_messages WHERE id = ? AND deleted_at IS NULL', id);
  if (!msg) return { error: 'That message is gone.' };
  const where = { gameId: msg.game_id, groupId: msg.group_id };
  if (msg.user_id === userId) return { error: "You can delete your own message instead.", ...where };
  store.run('INSERT OR IGNORE INTO chat_reports (message_id, user_id, created_at) VALUES (?, ?, ?)', id, userId, now.toISOString());
  return where;
}

/** Which thread a message is in: { gameId, groupId } (one of them null), or null if there's no such message. */
export function threadOfMessage(store, id) {
  const row = store.get('SELECT game_id, group_id FROM chat_messages WHERE id = ?', id);
  return row ? { gameId: row.game_id, groupId: row.group_id } : null;
}

/** A member opened the group's chat: everything in it up to now is read. */
export function markGroupRead(store, { groupId, userId, now }) {
  store.run('UPDATE group_members SET chat_read_at = ? WHERE group_id = ? AND user_id = ?', now.toISOString(), groupId, userId);
}

/**
 * group id -> messages the player hasn't seen, for the Groups list: other
 * people's messages since they last opened the chat (or since they joined),
 * leaving out deleted and hidden ones.
 */
export function unreadCounts(store, userId) {
  const rows = store.all(
    `SELECT gm.group_id, COUNT(m.id) AS n
       FROM group_members gm
       JOIN chat_messages m ON m.group_id = gm.group_id
      WHERE gm.user_id = ? AND m.user_id != ? AND m.deleted_at IS NULL
        AND m.created_at > COALESCE(gm.chat_read_at, gm.joined_at)
        AND (SELECT COUNT(*) FROM chat_reports r WHERE r.message_id = m.id) < ?
      GROUP BY gm.group_id`,
    userId, userId, HIDE_AFTER_REPORTS,
  );
  return new Map(rows.map((r) => [r.group_id, r.n]));
}

/** Message counts per game, for the "Chat" links on the board. */
export function chatCounts(store, gameIds) {
  if (!gameIds.length) return new Map();
  const rows = store.all(
    `SELECT game_id, COUNT(*) AS n FROM chat_messages
      WHERE deleted_at IS NULL AND game_id IN (${gameIds.map(() => '?').join(',')})
      GROUP BY game_id`,
    ...gameIds,
  );
  return new Map(rows.map((r) => [r.game_id, r.n]));
}

/** Games worth talking about: live now, starting in the next day, or finished in the last six hours. */
export function chatGames(store, now) {
  const t = now.getTime();
  return store.all(
    `SELECT g.*, (SELECT COUNT(*) FROM chat_messages m WHERE m.game_id = g.id AND m.deleted_at IS NULL) AS chat_count,
            (SELECT MAX(m.id) FROM chat_messages m WHERE m.game_id = g.id AND m.deleted_at IS NULL) AS last_message
       FROM games g
      WHERE g.state = 'in'
         OR (g.state = 'pre' AND g.start_time BETWEEN ? AND ?)
         OR (g.state = 'post' AND g.start_time >= ?)
      ORDER BY g.state = 'in' DESC, last_message IS NULL, last_message DESC, g.start_time
      LIMIT 60`,
    new Date(t - 3_600_000).toISOString(), new Date(t + 86_400_000).toISOString(), new Date(t - 10 * 3_600_000).toISOString(),
  );
}

/** Every message someone has reported and nobody has deleted, in games and groups: hidden ones first, then the latest reported. For admins. */
export function reportedMessages(store, limit = 200) {
  return store
    .all(
      `SELECT m.id, m.body, m.created_at, m.game_id, m.group_id, u.screen_name, g.sport, g.home_short, g.away_short,
              fg.name AS group_name, fg.kind AS group_kind, COUNT(r.user_id) AS reports, MAX(r.created_at) AS last_report
         FROM chat_messages m
         JOIN chat_reports r ON r.message_id = m.id
         JOIN users u ON u.id = m.user_id
         LEFT JOIN games g ON g.id = m.game_id
         LEFT JOIN friend_groups fg ON fg.id = m.group_id
        WHERE m.deleted_at IS NULL
        GROUP BY m.id
        ORDER BY COUNT(r.user_id) >= ? DESC, last_report DESC
        LIMIT ?`,
      HIDE_AFTER_REPORTS, limit,
    )
    .map((m) => ({ ...m, hidden: m.reports >= HIDE_AFTER_REPORTS }));
}

/** An admin putting a message back: its reports are cleared, so it shows again. */
export function restoreMessage(store, id) {
  return store.run('DELETE FROM chat_reports WHERE message_id = ?', id).changes;
}

/** An admin taking a message down for everyone. */
export function removeMessage(store, { id, now }) {
  const { changes } = store.run('UPDATE chat_messages SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL', now.toISOString(), id);
  return changes ? {} : { error: 'That message is already gone.' };
}
