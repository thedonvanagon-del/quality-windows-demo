// Two daily reminders, through the same notifier as everything else (the
// inbox and phone notifications), each with its own on/off setting:
//
// - "Lines are up", around 11 AM Eastern: how many games are on today in the
//   player's favorite sports. Skipped when there are none.
// - The Streak reminder, around 5 PM Eastern: for players with a streak going
//   (or who played the streak game in the last week) who haven't made
//   today's Streak pick, while games are left today in their sports.
//
// A timer calls run() every few minutes. Each reminder goes out inside a
// two-hour window, at most once per player per day: the send is recorded in
// reminders_sent first, so a restart never sends it twice. The official
// account gets nothing.

import { listText } from './badges.js';
import { SPORT, SPORTS } from './sports.js';
import { playedRecently, streakOf, streakPickOn } from './streak.js';
import { addDays, etDay, etHour, etToUtc } from './time.js';

export const LINES_HOUR = 11;
export const STREAK_HOUR = 17;
const WINDOW_HOURS = 2;

// How the reminders name each sport: "9 NBA and 41 college hoops games today".
const CALLED = { nfl: 'NFL', ncaaf: 'college football', nba: 'NBA', ncaab: 'college hoops', mlb: 'MLB', nhl: 'NHL' };

const sportsOf = (favs) => String(favs ?? '').split(',').filter((key) => SPORT[key]);

export function createReminders({ store, games, notifier, now = () => new Date(), log = console }) {
  let running = null;

  /** Games still to start today, per sport, with the sport's board refreshed first. One look per sport per run. */
  function counter(at) {
    const today = etDay(at);
    const midnight = etToUtc(addDays(today, 1), 0).toISOString();
    const counts = new Map();
    return async (sport) => {
      if (!counts.has(sport)) {
        try {
          await games.upcoming(sport);
        } catch (err) {
          log.warn(`reminders: ${sport}: ${err.message}`);
        }
        counts.set(sport, store.get(
          "SELECT COUNT(*) AS n FROM games WHERE sport = ? AND state = 'pre' AND start_time > ? AND start_time < ?",
          sport, at.toISOString(), midnight,
        ).n);
      }
      return counts.get(sport);
    };
  }

  /** Mark it sent first, so it can only ever go once. */
  const claim = (userId, kind, day, at) =>
    store.run('INSERT OR IGNORE INTO reminders_sent (user_id, kind, day, sent_at) VALUES (?, ?, ?, ?)', userId, kind, day, at.toISOString()).changes > 0;

  async function linesUp(at, left) {
    const today = etDay(at);
    const players = store.all(
      `SELECT id, fav_sports FROM users
        WHERE screen_name IS NOT NULL AND official = 0 AND notify_lines = 1 AND COALESCE(fav_sports, '') != ''
          AND id NOT IN (SELECT user_id FROM reminders_sent WHERE kind = 'lines' AND day = ?)`,
      today,
    );
    let sent = 0;
    for (const p of players) {
      const counts = [];
      for (const sport of sportsOf(p.fav_sports)) {
        const n = await left(sport);
        if (n) counts.push([sport, n]);
      }
      if (!counts.length || !claim(p.id, 'lines', today, at)) continue;
      const total = counts.reduce((sum, [, n]) => sum + n, 0);
      notifier.tell(p.id, {
        kind: 'lines',
        title: 'Lines are up',
        text: `Lines are up: ${listText(counts.map(([sport, n]) => `${n} ${CALLED[sport]}`))} ${total === 1 ? 'game' : 'games'} today.`,
        url: `/games?sport=${counts[0][0]}`,
      }, at);
      sent += 1;
    }
    return sent;
  }

  async function streakReminder(at, left) {
    const today = etDay(at);
    const players = store.all(
      `SELECT id, fav_sports FROM users
        WHERE screen_name IS NOT NULL AND official = 0 AND notify_streak = 1
          AND id IN (SELECT user_id FROM picks WHERE streak_day IS NOT NULL)
          AND id NOT IN (SELECT user_id FROM reminders_sent WHERE kind = 'streak' AND day = ?)`,
      today,
    );
    let sent = 0;
    for (const p of players) {
      if (streakPickOn(store, p.id, today)) continue;
      if (streakOf(store, p.id).current < 1 && !playedRecently(store, p.id, today)) continue;
      // No favorites (players from before setup): any sport counts.
      const sports = sportsOf(p.fav_sports);
      let first = null;
      for (const sport of sports.length ? sports : SPORTS.map((s) => s.key)) {
        if (await left(sport)) {
          first = sport;
          break;
        }
      }
      if (!first || !claim(p.id, 'streak', today, at)) continue;
      notifier.tell(p.id, {
        kind: 'streak',
        title: 'Streak reminder',
        text: "Keep your streak alive: make today's Streak pick.",
        url: `/games?sport=${first}`,
      }, at);
      sent += 1;
    }
    return sent;
  }

  async function runOnce() {
    const at = now();
    const hour = etHour(at);
    const inWindow = (start) => hour >= start && hour < start + WINDOW_HOURS;
    const out = { lines: 0, streak: 0 };
    if (!inWindow(LINES_HOUR) && !inWindow(STREAK_HOUR)) return out;
    const left = counter(at);
    if (inWindow(LINES_HOUR)) out.lines = await linesUp(at, left);
    if (inWindow(STREAK_HOUR)) out.streak = await streakReminder(at, left);
    return out;
  }

  return {
    /** Send whatever reminders are due right now. Overlapping calls share one run. */
    run() {
      running ??= runOnce().finally(() => (running = null));
      return running;
    },
  };
}
