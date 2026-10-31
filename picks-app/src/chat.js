// Game chat: one thread per game, short plain-text messages signed by screen
// name. People delete their own; three reports from different players hide a
// message until someone looks at it.

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

export function postMessage(store, { gameId, userId, text, now }) {
  const clean = cleanMessage(text);
  if (clean.error) return clean;
  const { lastInsertRowid } = store.run(
    'INSERT INTO chat_messages (game_id, user_id, body, created_at) VALUES (?, ?, ?, ?)',
    gameId, userId, clean.body, now.toISOString(),
  );
  return { id: Number(lastInsertRowid) };
}

/** The newest `limit` messages on a game, oldest first. Reported ones come back with `hidden`. */
export function messages(store, gameId, limit = 150) {
  return store
    .all(
      `SELECT m.id, m.user_id, m.body, m.created_at, u.screen_name,
              (SELECT COUNT(*) FROM chat_reports r WHERE r.message_id = m.id) AS reports
         FROM chat_messages m JOIN users u ON u.id = m.user_id
        WHERE m.game_id = ? AND m.deleted_at IS NULL
        ORDER BY m.id DESC LIMIT ?`,
      gameId, limit,
    )
    .reverse()
    .map((m) => ({ ...m, hidden: m.reports >= HIDE_AFTER_REPORTS }));
}

export function deleteMessage(store, { id, userId, now }) {
  const { changes } = store.run(
    'UPDATE chat_messages SET deleted_at = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
    now.toISOString(), id, userId,
  );
  return changes ? {} : { error: "That message is gone or isn't yours." };
}

export function reportMessage(store, { id, userId, now }) {
  const msg = store.get('SELECT user_id, game_id FROM chat_messages WHERE id = ? AND deleted_at IS NULL', id);
  if (!msg) return { error: 'That message is gone.' };
  if (msg.user_id === userId) return { error: "You can delete your own message instead.", gameId: msg.game_id };
  store.run('INSERT OR IGNORE INTO chat_reports (message_id, user_id, created_at) VALUES (?, ?, ?)', id, userId, now.toISOString());
  return { gameId: msg.game_id };
}

export function gameOfMessage(store, id) {
  return store.get('SELECT game_id FROM chat_messages WHERE id = ?', id)?.game_id ?? null;
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
