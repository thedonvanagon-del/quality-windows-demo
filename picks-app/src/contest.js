// The free weekly contest. Everyone is in; nobody pays and nothing is paid
// out. A week runs Monday 12:00 AM to Sunday 11:59 PM Eastern, and the
// standings are units won on graded bets (straight picks and parlays) whose
// games started that week. 5 graded bets to place. Ties go to the better ROI,
// then to whoever got there first (their last counted bet started earlier).
// The official account shows but never places, same as on the leaderboard.
//
// A week closes once every bet in it is graded, or at Tuesday 6 AM Eastern
// at the latest (anything still ungraded just doesn't count). Closing writes
// the top 3 to contest_results exactly once and tells the winners.

import { checkBadges } from './badges.js';
import { formatUnits } from './picks.js';
import { BETS, MIN_RANKED, numbered, TOTALS, withRates } from './stats.js';
import { addDays, etToUtc, mondayOf, weekLabel } from './time.js';

export const CONTEST_MIN = MIN_RANKED;
const PODIUM = 3;

/** The instants a week starts, ends, and must be closed by. */
export function weekBounds(monday) {
  return {
    start: etToUtc(monday, 0),
    end: etToUtc(addDays(monday, 7), 0),
    deadline: etToUtc(addDays(monday, 8), 6),
  };
}

/** This week's (or any week's) standings, numbered. Confirmed players only, like the boards. */
export function standings(store, monday, limit = 100) {
  const { start, end } = weekBounds(monday);
  const rows = store
    .all(
      `SELECT u.id, u.screen_name, u.official, ${TOTALS}, MAX(p.game_start) AS last_start
         FROM ${BETS} p JOIN users u ON u.id = p.user_id
        WHERE p.result IN ('win', 'loss', 'push') AND p.game_start >= ? AND p.game_start < ?
          AND u.screen_name IS NOT NULL AND u.email_verified_at IS NOT NULL
        GROUP BY u.id`,
      start.toISOString(), end.toISOString(),
    )
    .map(withRates);
  const placed = (r) => r.graded >= CONTEST_MIN;
  rows.sort((a, b) =>
    placed(b) - placed(a) || b.units - a.units || (b.roi ?? -Infinity) - (a.roi ?? -Infinity)
    || a.last_start.localeCompare(b.last_start) || a.id - b.id);
  return rows.slice(0, limit).map(numbered(placed));
}

/** "1 day, 4 hours left", "3 hours, 12 minutes left", "8 minutes left" */
export function timeLeft(now, end) {
  const minutes = Math.max(0, Math.floor((end - now) / 60_000));
  const unit = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  if (minutes >= 1440) return `${unit(Math.floor(minutes / 1440), 'day')}, ${unit(Math.floor((minutes % 1440) / 60), 'hour')} left`;
  if (minutes >= 60) return `${unit(Math.floor(minutes / 60), 'hour')}, ${unit(minutes % 60, 'minute')} left`;
  return `${unit(minutes, 'minute')} left`;
}

/** A closed week's top 3, or null if that week isn't closed yet. */
export function results(store, monday) {
  if (!store.get('SELECT 1 AS x FROM contest_weeks WHERE week = ?', monday)) return null;
  return store.all(
    `SELECT r.place, r.units, r.record, u.id, u.screen_name FROM contest_results r JOIN users u ON u.id = r.user_id
      WHERE r.week = ? ORDER BY r.place`,
    monday,
  );
}

/** How many bets in the week still wait on a grade. */
function ungraded(store, monday) {
  const { start, end } = weekBounds(monday);
  return store.get(
    `SELECT COUNT(*) AS n FROM ${BETS} WHERE result IS NULL AND game_start >= ? AND game_start < ?`,
    start.toISOString(), end.toISOString(),
  ).n;
}

/**
 * Close one week: record its top 3 and tell them, once. Returns the podium,
 * or null if the week was already closed.
 */
export function closeWeek(store, monday, now, { notifier = null, lastWeek = true } = {}) {
  const podium = store.tx(() => {
    const { changes } = store.run('INSERT OR IGNORE INTO contest_weeks (week, closed_at) VALUES (?, ?)', monday, now.toISOString());
    if (!changes) return null;
    const top = standings(store, monday).filter((r) => r.ranked).slice(0, PODIUM);
    for (const r of top) {
      const record = `${r.wins}-${r.losses}${r.pushes ? `-${r.pushes}` : ''}`;
      store.run(
        'INSERT INTO contest_results (week, place, user_id, units, record) VALUES (?, ?, ?, ?, ?)',
        monday, r.rank, r.id, r.units, record,
      );
    }
    return top;
  });
  if (!podium) return null;
  const which = lastWeek ? "last week's contest" : `the ${weekLabel(monday)} contest`;
  for (const r of podium) {
    notifier?.tell(r.id, {
      kind: 'contest',
      text: `You finished #${r.rank} in ${which} (${formatUnits(r.units, { sign: true }).replace(/^-/, '−')}).`,
      url: '/winners',
    }, now);
  }
  checkBadges(store, podium.map((r) => r.id), now, notifier);
  return podium;
}

/**
 * The timer job: close every finished week that's due. The first run starts
 * from last week, so no older history is made up, and a week missed while
 * the server was down still closes later. Safe to run as often as you like.
 */
export function closeDueWeeks(store, now, notifier = null) {
  const current = mondayOf(now);
  let since = store.get("SELECT value FROM settings WHERE key = 'contest_since'")?.value;
  if (!since) {
    since = addDays(current, -7);
    store.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('contest_since', ?)", since);
  }
  const closed = [];
  for (let week = since; week < current; week = addDays(week, 7)) {
    if (store.get('SELECT 1 AS x FROM contest_weeks WHERE week = ?', week)) continue;
    const { end, deadline } = weekBounds(week);
    if (now < end) continue;
    if (now < deadline && ungraded(store, week)) continue;
    const podium = closeWeek(store, week, now, { notifier, lastWeek: week === addDays(current, -7) });
    if (podium) closed.push({ week, podium });
  }
  return closed;
}

/** The winners wall: every closed week, newest first, and the all-time count of weekly wins. */
export function winnersWall(store) {
  const weeks = store.all('SELECT week FROM contest_weeks ORDER BY week DESC').map((r) => ({ week: r.week, label: weekLabel(r.week), podium: [] }));
  const byWeek = new Map(weeks.map((w) => [w.week, w]));
  for (const r of store.all(
    `SELECT r.week, r.place, r.units, r.record, u.screen_name FROM contest_results r JOIN users u ON u.id = r.user_id
      ORDER BY r.week DESC, r.place`,
  )) byWeek.get(r.week)?.podium.push(r);
  const champions = store.all(
    `SELECT u.screen_name, COUNT(*) AS wins FROM contest_results r JOIN users u ON u.id = r.user_id
      WHERE r.place = 1 GROUP BY r.user_id ORDER BY wins DESC, MIN(r.week), lower(u.screen_name) LIMIT 10`,
  );
  return { weeks, champions };
}
