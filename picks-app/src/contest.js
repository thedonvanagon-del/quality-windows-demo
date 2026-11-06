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
//
// The standings and closing here work for any window, sport list and
// entrant list: tournaments (src/tournaments.js) use the same code, and the
// weekly contest shows there as The Weekly Open.

import { checkBadges } from './badges.js';
import { cupYear, recordCup } from './cup.js';
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

/**
 * Which bets count in a window, as SQL on BETS (aliased p). `sports`, when
 * given, limits it to those sports: a straight pick by its own sport, a
 * parlay only when every leg is in the list (the same rule as a sport's
 * board, where a mixed parlay counts overall only). With `tournamentId`,
 * only entrants' bets made after they joined count (the entry is aliased e).
 */
function counted({ start, end, sports = null, tournamentId = null }) {
  let sql = 'p.game_start >= ? AND p.game_start < ?';
  const params = [start.toISOString(), end.toISOString()];
  if (sports?.length) {
    const marks = sports.map(() => '?').join(', ');
    sql += ` AND CASE p.kind WHEN 'pick' THEN p.sport IN (${marks})
      ELSE NOT EXISTS (SELECT 1 FROM parlay_legs l WHERE l.parlay_id = p.id AND l.sport NOT IN (${marks})) END`;
    params.push(...sports, ...sports);
  }
  if (tournamentId != null) sql += ' AND p.made_at >= e.joined_at';
  return { sql, params };
}

/**
 * Standings for any window: the weekly contest, or a tournament. Units won on
 * graded bets that count (see counted), numbered; `min` graded bets to place.
 * Ties go to the better ROI, then to whoever got there first (their last
 * counted bet started earlier). Confirmed players only, like the boards; the
 * official account shows but never places. With `tournamentId` every
 * confirmed entrant is listed, bets or not; without it (the weekly contest,
 * where everyone's in) everyone with a graded bet in the window is.
 */
export function windowStandings(store, window, limit = 100) {
  const { sql, params } = counted(window);
  const graded = "p.result IN ('win', 'loss', 'push')";
  const confirmed = 'u.screen_name IS NOT NULL AND u.email_verified_at IS NOT NULL';
  const rows = (window.tournamentId != null
    ? store.all(
      `SELECT u.id, u.screen_name, u.official, ${TOTALS}, MAX(p.game_start) AS last_start
         FROM tournament_entries e JOIN users u ON u.id = e.user_id
         LEFT JOIN ${BETS} p ON p.user_id = e.user_id AND ${graded} AND ${sql}
        WHERE e.tournament_id = ? AND ${confirmed}
        GROUP BY u.id`,
      ...params, window.tournamentId,
    )
    : store.all(
      `SELECT u.id, u.screen_name, u.official, ${TOTALS}, MAX(p.game_start) AS last_start
         FROM ${BETS} p JOIN users u ON u.id = p.user_id
        WHERE ${graded} AND ${sql} AND ${confirmed}
        GROUP BY u.id`,
      ...params,
    ))
    .map(withRates);
  return rankStandings(rows, window.min ?? CONTEST_MIN).slice(0, limit);
}

/**
 * Put standings rows in order and number them: placed players (`min` graded
 * bets) first, then units, ROI, and whose last counted bet started first.
 * The live "As it stands" view ranks with this too, so both orders follow
 * the same rules.
 */
export function rankStandings(rows, min) {
  const placed = (r) => r.graded >= min;
  rows.sort((a, b) =>
    placed(b) - placed(a) || b.units - a.units || (b.roi ?? -Infinity) - (a.roi ?? -Infinity)
    || (a.last_start ?? '').localeCompare(b.last_start ?? '') || a.id - b.id);
  return rows.map(numbered(placed));
}

/**
 * Bets that would count in a window but have no grade yet: { id, kind,
 * user_id, units, game_start }, a kind of 'pick' or 'parlay'. Same rules as
 * the standings (see counted). For the live view; nothing here is written.
 */
export function openBetsIn(store, window) {
  const { sql, params } = counted(window);
  return window.tournamentId != null
    ? store.all(
      `SELECT p.id, p.kind, p.user_id, p.units, p.game_start FROM tournament_entries e JOIN ${BETS} p ON p.user_id = e.user_id
        WHERE e.tournament_id = ? AND p.result IS NULL AND ${sql}`,
      window.tournamentId, ...params,
    )
    : store.all(`SELECT p.id, p.kind, p.user_id, p.units, p.game_start FROM ${BETS} p WHERE p.result IS NULL AND ${sql}`, ...params);
}

/** How many bets that would count in a window still wait on a grade. */
export function ungradedIn(store, window) {
  const { sql, params } = counted(window);
  return window.tournamentId != null
    ? store.get(
      `SELECT COUNT(*) AS n FROM tournament_entries e JOIN ${BETS} p ON p.user_id = e.user_id
        WHERE e.tournament_id = ? AND p.result IS NULL AND ${sql}`,
      window.tournamentId, ...params,
    ).n
    : store.get(`SELECT COUNT(*) AS n FROM ${BETS} p WHERE p.result IS NULL AND ${sql}`, ...params).n;
}

/** Whether a finished window can close: every counted bet graded, or the deadline passed. */
export function dueToClose(store, window, deadline, now) {
  return now >= window.end && (now >= deadline || !ungradedIn(store, window));
}

/** "5-0", "4-1-1" */
export const recordOf = (r) => `${r.wins}-${r.losses}${r.pushes ? `-${r.pushes}` : ''}`;

/**
 * Close a window once: `claim()` marks it closed and says whether this call
 * did it; then the top 3 are worked out and handed to `save(row, record)`,
 * all in one transaction. Returns the top 3, or null if it was already closed.
 */
export function closeWindow(store, window, { claim, save }) {
  return store.tx(() => {
    if (!claim()) return null;
    const top = windowStandings(store, window).filter((r) => r.ranked).slice(0, PODIUM);
    for (const r of top) save(r, recordOf(r));
    return top;
  });
}

/** This week's (or any week's) standings, numbered. Confirmed players only, like the boards. */
export function standings(store, monday, limit = 100) {
  return windowStandings(store, weekWindow(monday), limit);
}

/** A week as a standings window: every sport, everyone in. */
export function weekWindow(monday) {
  const { start, end } = weekBounds(monday);
  return { start, end, min: CONTEST_MIN };
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

/**
 * Close one week: record its top 3 and tell them, once. Returns the podium,
 * or null if the week was already closed. The week's tournament (The Weekly
 * Open, when the timer made one) is marked closed with it.
 */
export function closeWeek(store, monday, now, { notifier = null, lastWeek = true } = {}) {
  const window = weekWindow(monday);
  const podium = closeWindow(store, window, {
    claim: () => {
      const { changes } = store.run('INSERT OR IGNORE INTO contest_weeks (week, closed_at) VALUES (?, ?)', monday, now.toISOString());
      if (changes) {
        store.run(
          "UPDATE tournaments SET closed_at = ? WHERE kind = 'weekly' AND starts_at = ? AND closed_at IS NULL",
          now.toISOString(), window.start.toISOString(),
        );
      }
      return changes > 0;
    },
    save: (r, record) => store.run(
      'INSERT INTO contest_results (week, place, user_id, units, record) VALUES (?, ?, ?, ?, ?)',
      monday, r.rank, r.id, r.units, record,
    ),
  });
  if (!podium) return null;
  cupForWeek(store, monday, now);
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
 * A closed week's Cup points: every placed player, by finish (the Weekly
 * Open is a tournament like the rest). Written once per player, so it's
 * safe to run again.
 */
export function cupForWeek(store, monday, now) {
  const window = weekWindow(monday);
  const rows = windowStandings(store, window, 100_000).filter((r) => r.rank).map((r) => ({ id: r.id, place: r.rank }));
  return recordCup(store, {
    source: 'weekly', ref: monday, year: cupYear(new Date(window.end.getTime() - 60_000)),
    label: `The Weekly Open, ${weekLabel(monday)}`, rows, now,
  });
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
    if (!dueToClose(store, weekWindow(week), weekBounds(week).deadline, now)) continue;
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
    `SELECT r.week, r.place, r.units, r.record, u.id, u.screen_name FROM contest_results r JOIN users u ON u.id = r.user_id
      ORDER BY r.week DESC, r.place`,
  )) byWeek.get(r.week)?.podium.push(r);
  const champions = store.all(
    `SELECT u.screen_name, COUNT(*) AS wins FROM contest_results r JOIN users u ON u.id = r.user_id
      WHERE r.place = 1 GROUP BY r.user_id ORDER BY wins DESC, MIN(r.week), lower(u.screen_name) LIMIT 10`,
  );
  return { weeks, champions };
}
