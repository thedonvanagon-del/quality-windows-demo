// The Bookie Bullies Cup: a season-long points race over every tournament.
// Every close (auto, admin-made and player-made tournaments, the Weekly Open,
// Survivor and each week of NFL Pick'em) gives points by finish, plus one
// for placing at all, so playing a lot is worth something. Player-made
// tournaments count only with 8 or more placed players, so nobody farms
// points with tiny private ones. A season is a calendar year (Eastern).
//
// Points are written per player per event (cup_points), once, so the
// standings are a sum and the backfill can run any number of times. After a
// year ends its top 3 are written once (cup_results) and get badges.

import { checkBadges } from './badges.js';
import { etDay } from './time.js';

export const CUP_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
export const PLACED_POINT = 1;
export const PLAYER_MADE_MIN = 8;
const PODIUM = 3;

/** Points for a finish: by place (1st to 10th), plus one for placing. */
export const cupPointsFor = (place) => (CUP_POINTS[place - 1] ?? 0) + PLACED_POINT;

/** The Cup season (an Eastern calendar year) an instant falls in. */
export const cupYear = (at) => +etDay(at).slice(0, 4);

/**
 * Write one finished event's points, once per player: `rows` are the placed
 * players as { id, place } (a shared place is the same number twice).
 * `minPlaced` leaves out an event with too few placed players. Returns how
 * many rows were new.
 */
export function recordCup(store, { source, ref, year, label, rows, now, minPlaced = 0 }) {
  const placed = rows.filter((r) => r.place && !r.official);
  if (placed.length < minPlaced) return 0;
  let added = 0;
  for (const r of placed) {
    added += store.run(
      `INSERT OR IGNORE INTO cup_points (year, source, ref, label, user_id, place, points, awarded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      year, source, String(ref), label, r.id, r.place, cupPointsFor(r.place), now.toISOString(),
    ).changes;
  }
  return added;
}

/**
 * A year's standings: { id, screen_name, points, wins, podiums, events,
 * rank }, most points first, then wins, podiums and events. Confirmed
 * players only, like the boards.
 */
export function cupStandings(store, year, limit = 200) {
  return store.all(
    `SELECT u.id, u.screen_name, u.official, SUM(c.points) AS points, SUM(c.place = 1) AS wins, SUM(c.place <= 3) AS podiums, COUNT(*) AS events
       FROM cup_points c JOIN users u ON u.id = c.user_id
      WHERE c.year = ? AND u.screen_name IS NOT NULL AND u.email_verified_at IS NOT NULL AND u.official = 0
      GROUP BY u.id
      ORDER BY points DESC, wins DESC, podiums DESC, events DESC, lower(u.screen_name)
      LIMIT ?`,
    year, limit,
  ).map((r, i) => ({ ...r, official: false, rank: i + 1 }));
}

/** "Cup: #12 · 84 pts" for a profile: { rank, points } this year, or null with none. */
export function cupLine(store, userId, year) {
  const mine = store.get('SELECT SUM(points) AS points FROM cup_points WHERE year = ? AND user_id = ?', year, userId);
  if (!mine?.points) return null;
  const row = cupStandings(store, year, 100_000).find((r) => r.id === userId);
  return { rank: row?.rank ?? null, points: mine.points };
}

/** A player's Cup finishes for a year, newest first: { label, place, points }. */
export function cupHistory(store, userId, year, limit = 20) {
  return store.all(
    'SELECT label, place, points, awarded_at FROM cup_points WHERE year = ? AND user_id = ? ORDER BY awarded_at DESC, label LIMIT ?',
    year, userId, limit,
  );
}

/** Every year with points, newest first, for the year tabs. */
export const cupYears = (store) => store.all('SELECT DISTINCT year FROM cup_points ORDER BY year DESC').map((r) => r.year);

/**
 * After a year ends: write its top 3 once, tell them, and check badges (Cup
 * champion for 1st, Cup podium for the top 3). Run on the timer; safe to run
 * as often as you like. Returns [{ year, podium }] for the years it closed.
 */
export function closeCupYears(store, now, notifier = null) {
  const current = cupYear(now);
  const closed = [];
  for (const { year } of store.all('SELECT DISTINCT year FROM cup_points WHERE year < ? AND year NOT IN (SELECT year FROM cup_years) ORDER BY year', current)) {
    const podium = store.tx(() => {
      if (!store.run('INSERT OR IGNORE INTO cup_years (year, closed_at) VALUES (?, ?)', year, now.toISOString()).changes) return null;
      const top = cupStandings(store, year, PODIUM);
      for (const r of top) store.run('INSERT INTO cup_results (year, place, user_id, points) VALUES (?, ?, ?, ?)', year, r.rank, r.id, r.points);
      return top;
    });
    if (!podium) continue;
    for (const r of podium) {
      notifier?.tell(r.id, { kind: 'cup', text: `You finished #${r.rank} in the ${year} Bookie Bullies Cup (${r.points} pts).`, url: `/cup?year=${year}` }, now);
    }
    checkBadges(store, podium.map((r) => r.id), now, notifier);
    closed.push({ year, podium });
  }
  return closed;
}

/** Closed years' top 3, newest first, for the winners wall. */
export function cupWinners(store) {
  const years = store.all('SELECT year FROM cup_years ORDER BY year DESC').map((r) => ({ year: r.year, podium: [] }));
  const byYear = new Map(years.map((y) => [y.year, y]));
  for (const r of store.all(
    `SELECT r.year, r.place, r.points, u.id, u.screen_name FROM cup_results r JOIN users u ON u.id = r.user_id ORDER BY r.year DESC, r.place`,
  )) byYear.get(r.year)?.podium.push(r);
  return years;
}
