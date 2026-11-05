// The streak game: one Streak pick a day (Eastern, by the game's day), any
// straight pick. Wins in a row make the streak; a loss sets it back to 0.
// Pushes and voids are skipped, and so are days without a Streak pick, so
// missing a day never breaks it. Parlays can't be Streak picks.
//
// The flag lives on the pick (picks.streak_day), so deleting the pick before
// the start takes the flag with it, and a unique index keeps it to one a day.

import { isLocked } from './picks.js';
import { addDays, etDay } from './time.js';

/** The player's Streak pick for this Eastern day, or null. */
export function streakPickOn(store, userId, day) {
  if (!userId) return null;
  return store.get('SELECT id, game_id, result FROM picks WHERE user_id = ? AND streak_day = ?', userId, day) ?? null;
}

/**
 * Make a pick the player's Streak pick for its day (`on`), or take that
 * back. Only before its game starts, and only one a day.
 */
export function setStreak(store, { userId, pickId, game, on, now }) {
  const pick = store.get('SELECT id, game_start, streak_day, result FROM picks WHERE id = ? AND user_id = ?', pickId, userId);
  if (!pick) return { error: 'No pick to change.' };
  if (!game || pick.result || isLocked(game, now)) return { error: "That game has started, so its Streak pick can't change." };
  const day = etDay(pick.game_start);
  if (!on) {
    store.run('UPDATE picks SET streak_day = NULL WHERE id = ?', pick.id);
    return { day };
  }
  if (pick.streak_day) return { day };
  if (streakPickOn(store, userId, day)) return { error: 'You already have a Streak pick for that day.' };
  store.run('UPDATE picks SET streak_day = ? WHERE id = ?', day, pick.id);
  return { day };
}

/**
 * The current and best streak from graded results, oldest first. Wins add
 * one, a loss resets the current run, pushes and voids are skipped.
 */
export function runOf(results) {
  let current = 0;
  let best = 0;
  for (const result of results) {
    if (result === 'win') best = Math.max(best, ++current);
    else if (result === 'loss') current = 0;
  }
  return { current, best };
}

/** A player's streak: { current, best, played } where played counts Streak picks ever made. */
export function streakOf(store, userId) {
  const rows = store.all(
    'SELECT result FROM picks WHERE user_id = ? AND streak_day IS NOT NULL ORDER BY game_start, id',
    userId,
  );
  return { ...runOf(rows.map((r) => r.result)), played: rows.length };
}

/** Whether the player has made a Streak pick for any of the last `days` days, today included. */
export function playedRecently(store, userId, today, days = 7) {
  return Boolean(store.get(
    'SELECT 1 AS x FROM picks WHERE user_id = ? AND streak_day > ? AND streak_day <= ? LIMIT 1',
    userId, addDays(today, -days), today,
  ));
}

/**
 * The streak boards: the longest current streaks (1 or more) and the best
 * streaks ever, top `limit` each. Confirmed players only, never the official
 * account, same as the leaderboards.
 */
export function streakBoards(store, limit = 20) {
  const rows = store.all(
    `SELECT p.user_id, u.screen_name, p.result FROM picks p JOIN users u ON u.id = p.user_id
      WHERE p.streak_day IS NOT NULL AND p.result IS NOT NULL
        AND u.official = 0 AND u.screen_name IS NOT NULL AND u.email_verified_at IS NOT NULL
      ORDER BY p.user_id, p.game_start, p.id`,
  );
  const players = new Map();
  for (const r of rows) {
    const p = players.get(r.user_id) ?? players.set(r.user_id, { id: r.user_id, screen_name: r.screen_name, results: [] }).get(r.user_id);
    p.results.push(r.result);
  }
  const all = [...players.values()].map((p) => ({ id: p.id, screen_name: p.screen_name, ...runOf(p.results) }));
  const byName = (a, b) => a.screen_name.localeCompare(b.screen_name);
  const ranked = (list) => list.slice(0, limit).map((r, i) => ({ ...r, rank: i + 1 }));
  return {
    current: ranked(all.filter((p) => p.current >= 1).sort((a, b) => b.current - a.current || b.best - a.best || byName(a, b))),
    best: ranked(all.filter((p) => p.best >= 1).sort((a, b) => b.best - a.best || b.current - a.current || byName(a, b))),
  };
}
