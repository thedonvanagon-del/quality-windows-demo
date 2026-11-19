// NFL weeks, for Survivor and NFL Pick'em. ESPN files each NFL game under a
// season, a season type (2 is the regular season) and a week, and the app
// keeps those on the game. When ESPN sends none, the week comes from the
// date: Tuesday-to-Monday Eastern windows, week 1 starting the Tuesday after
// Labor Day (the regular season opens the Thursday after it). Regular
// season only: preseason and playoff games have no week here.

import { addDays, DAY, etDay, etToUtc, HOUR, weekday } from './time.js';

export const REGULAR_WEEKS = 18;
// A week is over this long after its last game starts.
export const WEEK_DONE_HOURS = 4;
// Between weeks, before the next week's games are on the board, the next week still counts as coming up for this long.
const GAP_DAYS = 8;

const utcOf = (day) => Date.UTC(+day.slice(0, 4), +day.slice(4, 6) - 1, +day.slice(6, 8));

/** The NFL season a date belongs to: September to February is one season, named for its first year. */
export function seasonOfDate(iso) {
  const day = etDay(iso);
  const year = +day.slice(0, 4);
  return +day.slice(4, 6) >= 3 ? year : year - 1;
}

/** Labor Day, the first Monday of September, as "20260907". */
function laborDay(year) {
  for (let d = 1; d <= 7; d++) {
    const day = `${year}090${d}`;
    if (weekday(day) === 1) return day;
  }
  throw new Error(`no Labor Day in ${year}`);
}

/** The Tuesday week 1 starts on, as "20260908". */
export const weekOneTuesday = (season) => addDays(laborDay(season), 1);

/** { season, week } from the date alone, or null outside the regular season's 18 weeks. */
export function weekFromDate(iso) {
  const season = seasonOfDate(iso);
  const days = Math.round((utcOf(etDay(iso)) - utcOf(weekOneTuesday(season))) / DAY);
  const week = Math.floor(days / 7) + 1;
  return week >= 1 && week <= REGULAR_WEEKS ? { season, week } : null;
}

/**
 * A game's { season, week }: ESPN's when it sent them, else from the date.
 * Null for anything but a regular-season game. Takes a games row or a game
 * from toGame.
 */
export function weekOf(game) {
  const start = game.start_time ?? game.start;
  const week = game.week ?? null;
  const type = game.season_type ?? game.seasonType ?? null;
  if (week != null && type != null) {
    if (type !== 2 || week > REGULAR_WEEKS) return null;
    return { season: game.season ?? seasonOfDate(start), week };
  }
  return weekFromDate(start);
}

/** When a week counts as over: a few hours after its last game starts. */
export const closesAt = (w) => new Date(new Date(w.last).getTime() + WEEK_DONE_HOURS * HOUR);

/**
 * Every regular-season NFL game the app has seen for a season, by week:
 * [{ week, first, last, games }] in order, `games` being games rows.
 */
export function seasonWeeks(store, season) {
  const rows = store.all(
    "SELECT * FROM games WHERE sport = 'nfl' AND start_time >= ? AND start_time < ? ORDER BY start_time, id",
    etToUtc(`${season}0301`, 0).toISOString(), etToUtc(`${season + 1}0301`, 0).toISOString(),
  );
  const weeks = new Map();
  for (const row of rows) {
    const w = weekOf(row);
    if (!w || w.season !== season) continue;
    const entry = weeks.get(w.week) ?? weeks.set(w.week, { week: w.week, first: row.start_time, last: row.start_time, games: [] }).get(w.week);
    entry.games.push(row);
    if (row.start_time < entry.first) entry.first = row.start_time;
    if (row.start_time > entry.last) entry.last = row.start_time;
  }
  return [...weeks.values()].sort((a, b) => a.week - b.week);
}

/** The newest season with regular-season NFL games from the last four months or the next month, or null. */
export function activeSeason(store, now) {
  const rows = store.all(
    "SELECT start_time, week, season, season_type FROM games WHERE sport = 'nfl' AND start_time >= ? AND start_time <= ?",
    new Date(now.getTime() - 120 * DAY).toISOString(), new Date(now.getTime() + 30 * DAY).toISOString(),
  );
  let season = null;
  for (const row of rows) {
    const w = weekOf(row);
    if (w && (season == null || w.season > season)) season = w.season;
  }
  return season;
}

/**
 * Where the NFL season stands: { season, weeks, current }. `current` is the
 * week being played or next up ({ week, first, last, games }), or null once
 * the regular season is over. Between weeks, before the next week's games
 * are on the board, it's that week with no games yet (`pending`). Null when
 * there's no season on the board at all.
 */
export function nflSeason(store, now) {
  const season = activeSeason(store, now);
  if (season == null) return null;
  const weeks = seasonWeeks(store, season);
  let current = weeks.find((w) => closesAt(w) > now) ?? null;
  const last = weeks.at(-1);
  if (!current && last && last.week < REGULAR_WEEKS && now - closesAt(last) < GAP_DAYS * DAY) {
    current = { week: last.week + 1, first: null, last: null, games: [], pending: true };
  }
  return { season, weeks, current };
}

/** "Sun 1:00 PM" style deadlines need the week's first start; null when it isn't known yet. */
export const firstStart = (w) => (w?.first ? new Date(w.first) : null);
