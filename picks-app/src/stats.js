// Records and leaderboards. Only graded picks count; voids count for nothing.
// Ranked by units won, so a big record at short odds and a small one at long
// odds compare honestly.

export const PERIODS = [
  { key: '7', label: '7 days', days: 7 },
  { key: '30', label: '30 days', days: 30 },
  { key: 'all', label: 'All time', days: null },
];

const TOTALS = `
  SUM(p.result = 'win') AS wins,
  SUM(p.result = 'loss') AS losses,
  SUM(p.result = 'push') AS pushes,
  ROUND(COALESCE(SUM(p.profit), 0), 2) AS units,
  SUM(CASE WHEN p.result IN ('win', 'loss') THEN p.units ELSE 0 END) AS risked`;

function filters({ sport, period, groupId, userId }, now) {
  const where = ["p.result IN ('win', 'loss', 'push')"];
  const params = [];
  if (sport) {
    where.push('p.sport = ?');
    params.push(sport);
  }
  const days = PERIODS.find((p) => p.key === period)?.days;
  if (days) {
    where.push('p.game_start >= ?');
    params.push(new Date(now.getTime() - days * 86_400_000).toISOString());
  }
  if (groupId) {
    where.push('p.user_id IN (SELECT user_id FROM group_members WHERE group_id = ?)');
    params.push(groupId);
  }
  if (userId) {
    where.push('p.user_id = ?');
    params.push(userId);
  }
  return { where: where.join(' AND '), params };
}

// A player needs this many graded picks in the window to get a rank, so one
// lucky max play can't sit on top of the board. Everyone still shows, below.
export const MIN_RANKED = 5;

export function leaderboard(store, scope, now, limit = 100) {
  const { where, params } = filters(scope, now);
  return store
    .all(
      `SELECT u.id, u.screen_name, ${TOTALS}
         FROM picks p JOIN users u ON u.id = p.user_id
        WHERE ${where} AND u.screen_name IS NOT NULL AND u.email_verified_at IS NOT NULL
        GROUP BY u.id
        ORDER BY COUNT(*) >= ? DESC, units DESC, wins DESC, u.screen_name
        LIMIT ?`,
      ...params, MIN_RANKED, limit,
    )
    .map(withRates)
    .map((row) => ({ ...row, ranked: row.graded >= MIN_RANKED }));
}

export function record(store, userId, scope = {}, now = new Date()) {
  const { where, params } = filters({ ...scope, userId }, now);
  return withRates(store.get(`SELECT ${TOTALS} FROM picks p WHERE ${where}`, ...params));
}

export function recordBySport(store, userId) {
  const { where, params } = filters({ userId }, new Date());
  return store
    .all(`SELECT p.sport, ${TOTALS} FROM picks p WHERE ${where} GROUP BY p.sport ORDER BY units DESC`, ...params)
    .map(withRates);
}

/** Running units total at the end of each of the last `days` days (Eastern), oldest first. */
export function unitsSeries(store, userId, now, days = 30) {
  const start = new Date(now.getTime() - days * 86_400_000);
  const before = store.get(
    "SELECT COALESCE(SUM(profit), 0) AS u FROM picks WHERE user_id = ? AND result IN ('win', 'loss', 'push') AND game_start < ?",
    userId, start.toISOString(),
  ).u;
  const rows = store.all(
    `SELECT game_start, profit FROM picks
      WHERE user_id = ? AND result IN ('win', 'loss', 'push') AND game_start >= ?
      ORDER BY game_start`,
    userId, start.toISOString(),
  );
  const out = [];
  let total = before;
  let i = 0;
  for (let d = 1; d <= days; d++) {
    const end = new Date(start.getTime() + d * 86_400_000).toISOString();
    while (i < rows.length && rows[i].game_start < end) total += rows[i++].profit ?? 0;
    out.push(Math.round(total * 100) / 100);
  }
  return out;
}

/** The last ten graded picks as a record: { wins, losses, pushes }. */
export function lastTen(store, userId) {
  const rows = store.all(
    `SELECT result FROM picks WHERE user_id = ? AND result IN ('win', 'loss', 'push')
      ORDER BY game_start DESC, id DESC LIMIT 10`,
    userId,
  );
  const count = (r) => rows.filter((x) => x.result === r).length;
  return { wins: count('win'), losses: count('loss'), pushes: count('push'), graded: rows.length };
}

/**
 * Who's hot: players with ten graded picks in the last 30 days, ranked by
 * the units those last ten won. `streak` is the run of wins (or losses) the
 * newest results end on, pushes skipped.
 */
export function hotStreaks(store, now, limit = 25) {
  const since = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const rows = store.all(
    `SELECT p.user_id, u.screen_name, p.result, p.profit FROM picks p JOIN users u ON u.id = p.user_id
      WHERE p.result IN ('win', 'loss', 'push') AND p.game_start >= ?
        AND u.screen_name IS NOT NULL AND u.email_verified_at IS NOT NULL
      ORDER BY p.user_id, p.game_start DESC, p.id DESC`,
    since,
  );
  const players = new Map();
  for (const r of rows) {
    const p = players.get(r.user_id) ?? players.set(r.user_id, { id: r.user_id, screen_name: r.screen_name, picks: [] }).get(r.user_id);
    if (p.picks.length < 10) p.picks.push(r);
  }
  return [...players.values()]
    .filter((p) => p.picks.length === 10)
    .map((p) => {
      const count = (res) => p.picks.filter((x) => x.result === res).length;
      const decided = p.picks.filter((x) => x.result !== 'push');
      let streak = 0;
      while (streak < decided.length && decided[streak].result === decided[0]?.result) streak += 1;
      return {
        id: p.id,
        screen_name: p.screen_name,
        wins: count('win'),
        losses: count('loss'),
        pushes: count('push'),
        units: Math.round(p.picks.reduce((sum, x) => sum + (x.profit ?? 0), 0) * 100) / 100,
        streak: decided.length ? `${decided[0].result === 'win' ? 'W' : 'L'}${streak}` : '',
      };
    })
    .filter((p) => p.units > 0)
    .sort((a, b) => b.units - a.units || b.wins - a.wins || a.screen_name.localeCompare(b.screen_name))
    .slice(0, limit);
}

// A split only shows once a market has this many picks, so it never points
// at one or two players' open picks.
export const SPLIT_MIN = 5;

/** game id -> { market: { side: count, total } } for markets with enough picks to show. */
export function splits(store, gameIds) {
  const out = new Map();
  if (!gameIds.length) return out;
  const rows = store.all(
    `SELECT game_id, market, side, COUNT(*) AS n FROM picks
      WHERE game_id IN (${gameIds.map(() => '?').join(',')}) GROUP BY game_id, market, side`,
    ...gameIds,
  );
  for (const r of rows) {
    const game = out.get(r.game_id) ?? out.set(r.game_id, {}).get(r.game_id);
    const market = (game[r.market] ??= { total: 0 });
    market[r.side] = r.n;
    market.total += r.n;
  }
  for (const [id, game] of out) {
    for (const market of Object.keys(game)) if (game[market].total < SPLIT_MIN) delete game[market];
    if (!Object.keys(game).length) out.delete(id);
  }
  return out;
}

/** Where the player sits on the all-time board, or null without a rank yet. */
export function rankOf(store, userId, now) {
  const rows = leaderboard(store, {}, now, 100_000);
  const i = rows.findIndex((r) => r.id === userId);
  return i >= 0 && rows[i].ranked ? i + 1 : null;
}

function withRates(row) {
  const wins = row?.wins ?? 0;
  const losses = row?.losses ?? 0;
  const risked = row?.risked ?? 0;
  return {
    ...row,
    wins,
    losses,
    pushes: row?.pushes ?? 0,
    units: row?.units ?? 0,
    graded: wins + losses + (row?.pushes ?? 0),
    winPct: wins + losses ? wins / (wins + losses) : null,
    roi: risked ? (row.units ?? 0) / risked : null,
  };
}
