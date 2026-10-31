// Lists of picks with their games. Anyone's open pick stays hidden from
// everyone else until its game starts, so nobody can tail or fade it early.

import { toGame } from './games.js';

const COLUMNS = `p.id AS pick_id, p.user_id, p.market, p.side, p.line, p.odds, p.units, p.made_at,
                 p.result, p.profit, u.screen_name, g.*`;

function toPick(row) {
  return {
    id: row.pick_id,
    userId: row.user_id,
    screenName: row.screen_name,
    market: row.market,
    side: row.side,
    line: row.line,
    odds: row.odds,
    units: row.units,
    madeAt: row.made_at,
    result: row.result,
    profit: row.profit,
    game: toGame(row),
  };
}

/** The owner's own picks: every open one, and the latest graded ones. */
export function ownPicks(store, userId, limit = 200) {
  const open = store.all(
    `SELECT ${COLUMNS} FROM picks p JOIN games g ON g.id = p.game_id JOIN users u ON u.id = p.user_id
      WHERE p.user_id = ? AND p.result IS NULL ORDER BY p.game_start, p.id`,
    userId,
  );
  const graded = store.all(
    `SELECT ${COLUMNS} FROM picks p JOIN games g ON g.id = p.game_id JOIN users u ON u.id = p.user_id
      WHERE p.user_id = ? AND p.result IS NOT NULL ORDER BY p.game_start DESC, p.id DESC LIMIT ?`,
    userId, limit,
  );
  return { open: open.map(toPick), graded: graded.map(toPick) };
}

/**
 * A player's picks as someone else sees them: only games that have started.
 * The owner sees their open ones too. `hidden` counts what was held back.
 */
export function publicPicks(store, userId, { viewerId, now, limit = 100 }) {
  const cutoff = viewerId === userId ? '9999' : now.toISOString();
  const picks = store.all(
    `SELECT ${COLUMNS} FROM picks p JOIN games g ON g.id = p.game_id JOIN users u ON u.id = p.user_id
      WHERE p.user_id = ? AND (g.start_time <= ? OR g.state != 'pre') ORDER BY p.game_start DESC, p.id DESC LIMIT ?`,
    userId, cutoff, limit,
  );
  const hidden =
    viewerId === userId
      ? 0
      : store.get(
          `SELECT COUNT(*) AS n FROM picks p JOIN games g ON g.id = p.game_id
            WHERE p.user_id = ? AND g.start_time > ? AND g.state = 'pre'`,
          userId, now.toISOString(),
        ).n;
  return { picks: picks.map(toPick), hidden };
}

/** A group's members' picks on games that have started, newest first. */
export function groupFeed(store, group, now, limit = 30) {
  return store
    .all(
      `SELECT ${COLUMNS} FROM picks p JOIN games g ON g.id = p.game_id JOIN users u ON u.id = p.user_id
        WHERE p.user_id IN (SELECT user_id FROM group_members WHERE group_id = ?)
          AND (g.start_time <= ? OR g.state != 'pre') AND (? IS NULL OR p.sport = ?)
        ORDER BY g.start_time DESC, p.id DESC LIMIT ?`,
      group.id, now.toISOString(), group.sport, group.sport, limit,
    )
    .map(toPick);
}

/** Picks from the players someone follows, on games that have started, newest first. */
export function followFeed(store, followerId, now, limit = 60) {
  return store
    .all(
      `SELECT ${COLUMNS} FROM picks p JOIN games g ON g.id = p.game_id JOIN users u ON u.id = p.user_id
        WHERE p.user_id IN (SELECT followee_id FROM follows WHERE follower_id = ?)
          AND (g.start_time <= ? OR g.state != 'pre')
        ORDER BY g.start_time DESC, p.id DESC LIMIT ?`,
      followerId, now.toISOString(), limit,
    )
    .map(toPick);
}

/** game id -> { market: side } for one player's picks on these games. */
export function picksOnGames(store, userId, gameIds) {
  const mine = new Map();
  if (!userId || !gameIds.length) return mine;
  const rows = store.all(
    `SELECT game_id, market, side FROM picks WHERE user_id = ? AND game_id IN (${gameIds.map(() => '?').join(',')})`,
    userId, ...gameIds,
  );
  for (const r of rows) mine.set(r.game_id, { ...mine.get(r.game_id), [r.market]: r.side });
  return mine;
}
