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

export function leaderboard(store, scope, now, limit = 100) {
  const { where, params } = filters(scope, now);
  return store
    .all(
      `SELECT u.id, u.screen_name, ${TOTALS}
         FROM picks p JOIN users u ON u.id = p.user_id
        WHERE ${where} AND u.screen_name IS NOT NULL AND u.email_verified_at IS NOT NULL
        GROUP BY u.id
        ORDER BY units DESC, wins DESC, u.screen_name
        LIMIT ?`,
      ...params, limit,
    )
    .map(withRates);
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
