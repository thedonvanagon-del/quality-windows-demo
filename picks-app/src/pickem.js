// NFL Pick'em: each NFL week, pick every game against the spread. Free, one
// pool per week, and no joining: anyone who saves a pick is in.
//
// - A pick takes the app's spread for that side when it's saved. Changing
//   sides before kickoff takes the line as it is then; saving the same side
//   again keeps the old line. Each game locks at its own kickoff.
// - A correct pick is 1 point, a push half a point. One pick a week can be
//   the Best Bet, which doubles its own points (2 for a win, 1 for a push).
// - These are their own picks, in their own table. They never touch units,
//   records or the boards.
// - A week closes once its picks are graded (30 hours after its last game at
//   the latest). Its winner gets the Pick'em winner badge, and the top 3 a note.

import { checkBadges } from './badges.js';
import { recordOf } from './contest.js';
import { cupYear, recordCup } from './cup.js';
import { toGame } from './games.js';
import { closesAt, nflSeason, seasonWeeks } from './nflweeks.js';
import { isLocked, outcome, price } from './picks.js';
import { HOUR } from './time.js';

// Graded picks to place in a week (and for the Cup).
export const PICKEM_MIN = 5;
export const CLOSE_AFTER_HOURS = 30;
const PODIUM = 3;

/** Points for a graded pick: 1 for a win, a half for a push, doubled for the Best Bet. */
export function pointsFor(result, best = false) {
  const base = result === 'win' ? 1 : result === 'push' ? 0.5 : 0;
  return base * (best ? 2 : 1);
}

/** The week being played or next up: { season, week, games, first, last }, or null between seasons. */
export function pickemWeek(store, now) {
  const s = nflSeason(store, now);
  return s?.current ? { season: s.season, ...s.current } : null;
}

/** A player's picks for a week: game id -> { side, line, best, result, points }. */
export function picksOf(store, userId, season, week) {
  if (userId == null) return new Map();
  return new Map(store.all(
    'SELECT game_id, side, line, best, result, points, made_at FROM pickem_picks WHERE user_id = ? AND season = ? AND week = ?',
    userId, season, week,
  ).map((r) => [r.game_id, r]));
}

/**
 * Save a player's picks for the week: `picks` [{ game, side }] and `best`
 * (a game id, or null to leave it). Games that have started keep what they
 * had. Returns { saved, notes } where notes say what didn't change and why.
 */
export function savePickem(store, { userId, week, picks, best = null, now }) {
  const notes = [];
  let saved = 0;
  const at = now.toISOString();
  const mine = picksOf(store, userId, week.season, week.week);
  const games = new Map(week.games.map((row) => [row.id, toGame(row)]));
  store.tx(() => {
    for (const { game: id, side } of picks) {
      const game = games.get(id);
      if (!game || !['home', 'away'].includes(side)) continue;
      const had = mine.get(id);
      if (had?.side === side) continue;
      if (isLocked(game, now)) {
        notes.push(`${game.away.short} @ ${game.home.short} has started, so that pick stays.`);
        continue;
      }
      const p = price(game, 'spread', side);
      if (!p) {
        notes.push(`${game.away.short} @ ${game.home.short} has no spread yet.`);
        continue;
      }
      store.run(
        `INSERT INTO pickem_picks (user_id, game_id, season, week, side, line, made_at) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (user_id, game_id) DO UPDATE SET side = excluded.side, line = excluded.line, made_at = excluded.made_at`,
        userId, id, week.season, week.week, side, p.line, at,
      );
      saved += 1;
    }
    if (best) {
      const after = picksOf(store, userId, week.season, week.week);
      const current = [...after].find(([, r]) => r.best)?.[0] ?? null;
      const target = games.get(best);
      const held = current ? games.get(current) : null;
      if (best !== current) {
        if (!target || !after.has(best)) notes.push('Pick a side on a game to make it your Best Bet.');
        else if (isLocked(target, now)) notes.push("That game has started, so it can't be your Best Bet.");
        else if (held && isLocked(held, now)) notes.push("Your Best Bet's game has started, so it stays.");
        else {
          store.run('UPDATE pickem_picks SET best = 0 WHERE user_id = ? AND season = ? AND week = ? AND best = 1', userId, week.season, week.week);
          store.run('UPDATE pickem_picks SET best = 1 WHERE user_id = ? AND game_id = ?', userId, best);
          saved += 1;
        }
      }
    }
  });
  return { saved, notes };
}

/** Grade Pick'em picks on games that are over, against the line each was saved at. Returns how many. */
export function gradePickem(store, now) {
  const at = now.toISOString();
  const open = store.all(
    `SELECT k.user_id, k.game_id, k.side, k.line, k.best, g.state, g.status, g.completed, g.home_score, g.away_score, g.start_time, g.updated_at
       FROM pickem_picks k JOIN games g ON g.id = k.game_id WHERE k.result IS NULL AND g.start_time <= ?`,
    at,
  );
  let graded = 0;
  for (const p of open) {
    const result = outcome({ ...p, market: 'spread' });
    if (!result) continue;
    graded += store.run(
      'UPDATE pickem_picks SET result = ?, points = ?, graded_at = ? WHERE user_id = ? AND game_id = ? AND result IS NULL',
      result, pointsFor(result, Boolean(p.best)), at, p.user_id, p.game_id,
    ).changes;
  }
  return graded;
}

const TOTALS = `SUM(k.result = 'win') AS wins, SUM(k.result = 'loss') AS losses, SUM(k.result = 'push') AS pushes,
  SUM(k.result IN ('win', 'loss', 'push')) AS graded, COUNT(*) AS picks, COALESCE(SUM(k.points), 0) AS points, MAX(k.made_at) AS last_made`;

/** Placed players first (5 graded picks), then points, wins, and whoever finished saving first. */
function rank(rows, min) {
  const placed = (r) => r.graded >= min;
  rows.sort((a, b) => placed(b) - placed(a) || b.points - a.points || b.wins - a.wins || (a.last_made ?? '').localeCompare(b.last_made ?? '') || a.id - b.id);
  let n = 0;
  return rows.map((r) => ({ ...r, official: false, ranked: placed(r), rank: placed(r) ? ++n : null }));
}

/** A week's standings: { id, screen_name, wins, losses, pushes, graded, picks, points, rank }. Confirmed players only. */
export function weekStandings(store, season, week, limit = 100) {
  return rank(store.all(
    `SELECT u.id, u.screen_name, ${TOTALS} FROM pickem_picks k JOIN users u ON u.id = k.user_id
      WHERE k.season = ? AND k.week = ? AND u.screen_name IS NOT NULL AND u.email_verified_at IS NOT NULL AND u.official = 0
      GROUP BY u.id`,
    season, week,
  ), PICKEM_MIN).slice(0, limit);
}

/** The season so far: every week's points added up, and how many weeks each player won. */
export function seasonStandings(store, season, limit = 100) {
  const rows = store.all(
    `SELECT u.id, u.screen_name, ${TOTALS}, COUNT(DISTINCT k.week) AS weeks,
            (SELECT COUNT(*) FROM pickem_results r WHERE r.season = k.season AND r.user_id = u.id AND r.place = 1) AS won
       FROM pickem_picks k JOIN users u ON u.id = k.user_id
      WHERE k.season = ? AND u.screen_name IS NOT NULL AND u.email_verified_at IS NOT NULL AND u.official = 0
      GROUP BY u.id`,
    season,
  );
  return rank(rows, 1).slice(0, limit);
}

/** A closed week's top 3, or null while it's open. */
export function weekResults(store, season, week) {
  if (!store.get('SELECT 1 AS x FROM pickem_weeks WHERE season = ? AND week = ?', season, week)) return null;
  return store.all(
    `SELECT r.place, r.points, r.record, u.id, u.screen_name FROM pickem_results r JOIN users u ON u.id = r.user_id
      WHERE r.season = ? AND r.week = ? ORDER BY r.place`,
    season, week,
  );
}

/**
 * Close every week that's over, once: when its picks are all graded, or 30
 * hours after it at the latest (anything ungraded doesn't count). The top 3
 * are written once and told; 1st gets the Pick'em winner badge; everyone
 * placed gets Cup points.
 */
export function closePickemWeeks(store, now, notifier = null) {
  const closed = [];
  const due = store.all(
    `SELECT DISTINCT season, week FROM pickem_picks k
      WHERE NOT EXISTS (SELECT 1 FROM pickem_weeks w WHERE w.season = k.season AND w.week = k.week) ORDER BY season, week`,
  );
  const weeksBySeason = new Map();
  for (const { season, week } of due) {
    const weeks = weeksBySeason.get(season) ?? weeksBySeason.set(season, seasonWeeks(store, season)).get(season);
    const w = weeks.find((x) => x.week === week);
    if (!w || closesAt(w) > now) continue;
    const late = now >= new Date(closesAt(w).getTime() + CLOSE_AFTER_HOURS * HOUR);
    if (!late && store.get('SELECT 1 AS x FROM pickem_picks WHERE season = ? AND week = ? AND result IS NULL', season, week)) continue;
    const podium = store.tx(() => {
      if (!store.run('INSERT OR IGNORE INTO pickem_weeks (season, week, closed_at) VALUES (?, ?, ?)', season, week, now.toISOString()).changes) return null;
      const rows = weekStandings(store, season, week, 100_000).filter((r) => r.rank);
      const top = rows.slice(0, PODIUM);
      for (const r of top) {
        store.run('INSERT INTO pickem_results (season, week, place, user_id, points, record) VALUES (?, ?, ?, ?, ?, ?)', season, week, r.rank, r.id, r.points, recordOf(r));
      }
      recordCup(store, { source: 'pickem', ref: `${season}-w${week}`, year: cupYear(w.last), label: `NFL Pick'em, Week ${week}`, rows: rows.map((r) => ({ id: r.id, place: r.rank })), now });
      return top;
    });
    if (!podium) continue;
    for (const r of podium) {
      notifier?.tell(r.id, {
        kind: 'pickem',
        text: r.rank === 1 ? `You won NFL Pick'em for Week ${week} (${r.points} pts).` : `You finished #${r.rank} in NFL Pick'em for Week ${week} (${r.points} pts).`,
        url: `/pickem/nfl?week=${week}`,
      }, now);
    }
    checkBadges(store, podium.map((r) => r.id), now, notifier);
    closed.push({ season, week, podium });
  }
  return closed;
}

/** This week's games for the page, each with your pick and whether it's locked. */
export function weekBoard(store, week, userId, now) {
  const mine = picksOf(store, userId, week.season, week.week);
  return week.games.map((row) => {
    const game = toGame(row);
    const spread = { away: price(game, 'spread', 'away'), home: price(game, 'spread', 'home') };
    return { game, spread, locked: isLocked(game, now), pick: mine.get(game.id) ?? null };
  });
}

/** What the hub's Pick'em card says: the week, how many games, how many you've picked, and your place. */
export function featured(store, now, userId) {
  const week = pickemWeek(store, now);
  if (!week) return null;
  const mine = picksOf(store, userId, week.season, week.week);
  const open = week.games.filter((row) => !isLocked(toGame(row), now));
  const row = userId != null ? weekStandings(store, week.season, week.week, 100_000).find((r) => r.id === userId) : null;
  const players = store.get('SELECT COUNT(DISTINCT user_id) AS n FROM pickem_picks WHERE season = ? AND week = ?', week.season, week.week).n;
  return { season: week.season, week: week.week, games: week.games.length, open: open.length, picked: mine.size, row, players, next: open[0]?.start_time ?? null };
}
