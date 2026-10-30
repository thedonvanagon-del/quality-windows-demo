// Following: a player can follow anyone, and gets a feed of their picks once
// each game starts (open picks stay hidden, same as everywhere else).

export function follow(store, { followerId, followeeId, now }) {
  if (followerId === followeeId) return { error: "You can't follow yourself." };
  store.run('INSERT OR IGNORE INTO follows (follower_id, followee_id, created_at) VALUES (?, ?, ?)', followerId, followeeId, now.toISOString());
  return {};
}

export function unfollow(store, { followerId, followeeId }) {
  store.run('DELETE FROM follows WHERE follower_id = ? AND followee_id = ?', followerId, followeeId);
}

export function isFollowing(store, followerId, followeeId) {
  return Boolean(followerId && store.get('SELECT 1 AS x FROM follows WHERE follower_id = ? AND followee_id = ?', followerId, followeeId));
}

export function followCounts(store, userId) {
  return {
    followers: store.get('SELECT COUNT(*) AS n FROM follows WHERE followee_id = ?', userId).n,
    following: store.get('SELECT COUNT(*) AS n FROM follows WHERE follower_id = ?', userId).n,
  };
}

/** The ids the player follows, out of these. */
export function followingAmong(store, followerId, userIds) {
  if (!followerId || !userIds.length) return new Set();
  const rows = store.all(
    `SELECT followee_id FROM follows WHERE follower_id = ? AND followee_id IN (${userIds.map(() => '?').join(',')})`,
    followerId, ...userIds,
  );
  return new Set(rows.map((r) => r.followee_id));
}

/** Everyone the player follows, by name. */
export function followingList(store, followerId) {
  return store.all(
    `SELECT u.id, u.screen_name FROM follows f JOIN users u ON u.id = f.followee_id
      WHERE f.follower_id = ? ORDER BY lower(u.screen_name)`,
    followerId,
  );
}

/** Who to tell when this player makes a pick: followers who want to hear. */
export function followersToNotify(store, followeeId) {
  return store.all(
    `SELECT f.follower_id AS id FROM follows f JOIN users u ON u.id = f.follower_id
      WHERE f.followee_id = ? AND u.notify_follows = 1`,
    followeeId,
  ).map((r) => r.id);
}
