// Blocking: a player can block anyone but themselves (Apple's guideline 1.2
// asks for it in apps with chat and profiles). For the blocker, the blocked
// player's chat messages, picks in feeds and notes about them go away, and
// their profile shows a banner instead of their photos. Neither can follow
// the other: blocking ends both follows. The blocked player isn't told.
// Leaderboards keep everyone: a record is public and ranks shouldn't move.

export function block(store, { blockerId, blockedId, now }) {
  if (blockerId === blockedId) return { error: "You can't block yourself." };
  store.tx(() => {
    store.run('INSERT OR IGNORE INTO user_blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)', blockerId, blockedId, now.toISOString());
    store.run(
      'DELETE FROM follows WHERE (follower_id = ? AND followee_id = ?) OR (follower_id = ? AND followee_id = ?)',
      blockerId, blockedId, blockedId, blockerId,
    );
  });
  return {};
}

/** Take a block back. Follows that blocking ended stay ended. */
export function unblock(store, { blockerId, blockedId }) {
  return store.run('DELETE FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?', blockerId, blockedId).changes > 0;
}

/** Whether `blockerId` blocked `blockedId`. */
export function isBlocked(store, blockerId, blockedId) {
  return Boolean(blockerId && blockedId && store.get('SELECT 1 AS x FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?', blockerId, blockedId));
}

/** Whether either of the two blocked the other. */
export function eitherBlocked(store, a, b) {
  return Boolean(a && b && store.get(
    'SELECT 1 AS x FROM user_blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)',
    a, b, b, a,
  ));
}

/** Everyone this player blocked, as a Set of ids (empty for a visitor). */
export function blockedIds(store, userId) {
  if (!userId) return new Set();
  return new Set(store.all('SELECT blocked_id FROM user_blocks WHERE blocker_id = ?', userId).map((r) => r.blocked_id));
}

/** The rows whose player (the id in `key`) this viewer hasn't blocked. */
export function withoutBlocked(store, userId, rows, key = 'id') {
  const blocked = blockedIds(store, userId);
  return blocked.size ? rows.filter((r) => !blocked.has(r[key])) : rows;
}

/** The blocked list for settings, newest first. */
export function blockedList(store, userId) {
  return store.all(
    `SELECT u.id, u.screen_name, b.created_at FROM user_blocks b JOIN users u ON u.id = b.blocked_id
      WHERE b.blocker_id = ? ORDER BY b.created_at DESC, b.rowid DESC`,
    userId,
  );
}
