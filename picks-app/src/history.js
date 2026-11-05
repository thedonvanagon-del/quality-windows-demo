// Lists of picks with their games. Anyone's open pick stays hidden from
// everyone else until its game starts, so nobody can tail or fade it early.
// Parlays ride along in the same lists (kind: 'parlay', with their legs), and
// stay hidden until their first leg starts.

import { toGame } from './games.js';

const COLUMNS = `p.id AS pick_id, p.user_id, p.market, p.side, p.line, p.odds, p.units, p.made_at,
                 p.result, p.profit, p.streak_day, p.clv_points, p.clv_pct, u.screen_name, u.official,
                 (SELECT o.is_lock FROM official_picks o WHERE o.pick_id = p.id) AS is_lock, g.*`;

function toPick(row) {
  return {
    id: row.pick_id,
    userId: row.user_id,
    screenName: row.screen_name,
    official: Boolean(row.official),
    // An official pick the site marked as a lock.
    lock: Boolean(row.is_lock),
    // The player's Streak pick for that day (the streak game).
    streakDay: row.streak_day ?? null,
    market: row.market,
    side: row.side,
    line: row.line,
    odds: row.odds,
    units: row.units,
    madeAt: row.made_at,
    result: row.result,
    profit: row.profit,
    // Closing line value, once the game has started (straight picks only).
    clvPoints: row.clv_points ?? null,
    clvPct: row.clv_pct ?? null,
    game: toGame(row),
  };
}

/** One of the owner's own picks, with its game, or null. */
export function ownPick(store, userId, pickId) {
  const row = store.get(
    `SELECT ${COLUMNS} FROM picks p JOIN games g ON g.id = p.game_id JOIN users u ON u.id = p.user_id WHERE p.id = ? AND p.user_id = ?`,
    pickId, userId,
  );
  return row ? toPick(row) : null;
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
  const parlays = (where, order, ...params) => parlayList(store, `x.user_id = ? AND ${where} ORDER BY ${order}`, userId, ...params);
  return {
    open: merge(open.map(toPick), parlays('x.result IS NULL', 'x.first_start, x.id', 1000), { newest: false }),
    graded: merge(graded.map(toPick), parlays('x.result IS NOT NULL', 'x.first_start DESC, x.id DESC', limit)).slice(0, limit),
  };
}

/**
 * A player's picks as someone else sees them: only games that have started.
 * The owner sees their open ones too, and the official account's picks are
 * public from the moment they're made (they're the site's published picks).
 * `hidden` counts what was held back.
 */
export function publicPicks(store, userId, { viewerId, now, limit = 100 }) {
  const official = store.get('SELECT official FROM users WHERE id = ?', userId)?.official === 1;
  const cutoff = viewerId === userId || official ? '9999' : now.toISOString();
  const picks = store.all(
    `SELECT ${COLUMNS} FROM picks p JOIN games g ON g.id = p.game_id JOIN users u ON u.id = p.user_id
      WHERE p.user_id = ? AND (g.start_time <= ? OR g.state != 'pre') ORDER BY p.game_start DESC, p.id DESC LIMIT ?`,
    userId, cutoff, limit,
  );
  const parlays = parlayList(store, `x.user_id = ? AND ${STARTED} ORDER BY x.first_start DESC, x.id DESC`, userId, cutoff, limit);
  const hidden =
    viewerId === userId || official
      ? 0
      : store.get(
          `SELECT COUNT(*) AS n FROM picks p JOIN games g ON g.id = p.game_id
            WHERE p.user_id = ? AND g.start_time > ? AND g.state = 'pre'`,
          userId, now.toISOString(),
        ).n +
        store.get(`SELECT COUNT(*) AS n FROM parlays x WHERE x.user_id = ? AND NOT ${STARTED}`, userId, now.toISOString()).n;
  return { picks: merge(picks.map(toPick), parlays).slice(0, limit), hidden };
}

/** A group's members' picks on games that have started, newest first. */
export function groupFeed(store, group, now, limit = 30) {
  const parlays = parlayList(
    store,
    `x.user_id IN (SELECT user_id FROM group_members WHERE group_id = ?) AND (${STARTED} OR u.official = 1)
       AND (? IS NULL OR x.sport = ?) ORDER BY x.first_start DESC, x.id DESC`,
    group.id, now.toISOString(), group.sport, group.sport, limit,
  );
  const picks = store
    .all(
      `SELECT ${COLUMNS} FROM picks p JOIN games g ON g.id = p.game_id JOIN users u ON u.id = p.user_id
        WHERE p.user_id IN (SELECT user_id FROM group_members WHERE group_id = ?)
          AND (g.start_time <= ? OR g.state != 'pre' OR u.official = 1) AND (? IS NULL OR p.sport = ?)
        ORDER BY g.start_time DESC, p.id DESC LIMIT ?`,
      group.id, now.toISOString(), group.sport, group.sport, limit,
    )
    .map(toPick);
  return merge(picks, parlays).slice(0, limit);
}

/** Picks from the players someone follows, on games that have started, newest first. */
export function followFeed(store, followerId, now, limit = 60) {
  const parlays = parlayList(
    store,
    `x.user_id IN (SELECT followee_id FROM follows WHERE follower_id = ?) AND (${STARTED} OR u.official = 1)
       ORDER BY x.first_start DESC, x.id DESC`,
    followerId, now.toISOString(), limit,
  );
  const picks = store
    .all(
      `SELECT ${COLUMNS} FROM picks p JOIN games g ON g.id = p.game_id JOIN users u ON u.id = p.user_id
        WHERE p.user_id IN (SELECT followee_id FROM follows WHERE follower_id = ?)
          AND (g.start_time <= ? OR g.state != 'pre' OR u.official = 1)
        ORDER BY g.start_time DESC, p.id DESC LIMIT ?`,
      followerId, now.toISOString(), limit,
    )
    .map(toPick);
  return merge(picks, parlays).slice(0, limit);
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

// ---- Parlays ----------------------------------------------------------------

/** A parlay counts as started once any leg's game has, by the clock or by ESPN. Takes the cutoff time. */
const STARTED = `EXISTS (SELECT 1 FROM parlay_legs sl JOIN games sg ON sg.id = sl.game_id
  WHERE sl.parlay_id = x.id AND (sg.start_time <= ? OR sg.state != 'pre'))`;

/** Parlays matching `where` (which ends in ORDER BY; the last param is the LIMIT), with their legs. */
function parlayList(store, where, ...params) {
  const rows = store.all(
    `SELECT x.*, u.screen_name, u.official FROM parlays x JOIN users u ON u.id = x.user_id WHERE ${where} LIMIT ?`,
    ...params,
  );
  if (!rows.length) return [];
  const legs = new Map();
  for (const l of store.all(
    `SELECT l.parlay_id, l.market, l.side, l.line, l.odds, l.result AS leg_result, g.*
       FROM parlay_legs l JOIN games g ON g.id = l.game_id
      WHERE l.parlay_id IN (${rows.map(() => '?').join(',')}) ORDER BY g.start_time, g.id`,
    ...rows.map((r) => r.id),
  )) {
    const list = legs.get(l.parlay_id) ?? legs.set(l.parlay_id, []).get(l.parlay_id);
    list.push({ market: l.market, side: l.side, line: l.line, odds: l.odds, result: l.leg_result, game: toGame(l) });
  }
  return rows.map((r) => ({
    kind: 'parlay',
    id: r.id,
    userId: r.user_id,
    screenName: r.screen_name,
    official: Boolean(r.official),
    units: r.units,
    odds: r.odds,
    madeAt: r.made_at,
    firstStart: r.first_start,
    result: r.result,
    profit: r.profit,
    legs: legs.get(r.id) ?? [],
  }));
}

const startOf = (bet) => (bet.kind === 'parlay' ? bet.firstStart : bet.game.start);

/** Picks and parlays in one list by start time: newest first, or soonest first for open bets. */
function merge(picks, parlays, { newest = true } = {}) {
  if (!parlays.length) return picks;
  const list = [...picks, ...parlays];
  return list.sort((a, b) => (newest ? -1 : 1) * (new Date(startOf(a)) - new Date(startOf(b))));
}
