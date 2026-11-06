// The rules that make a record worth something: a pick only goes in before
// kickoff, at the line ESPN shows right then, and gets graded off the final.

import { fillClv, freezeLate } from './clv.js';
import { VOID_STATUSES } from './espn.js';
import { etDay } from './time.js';

export const MARKETS = {
  spread: ['away', 'home'],
  total: ['over', 'under'],
  ml: ['away', 'home'],
};
// Players size a pick in units, the way cappers post them: 1u is a normal
// play, 5u is a max play. No dollars, so there's no unit size to game.
export const UNITS_MIN = 0.1;
export const MAX_UNITS = 5;
export const UNIT_CHIPS = [1, 2, 3, 4, 5];

/**
 * The most a pick can be at this price. No pick risks more than 5 units or
 * wins more than 5, so a long underdog can't turn one hit into the leaderboard.
 */
export function maxUnits(odds) {
  return odds > 0 ? Math.min(MAX_UNITS, Math.floor((MAX_UNITS * 100 * 100) / odds) / 100) : MAX_UNITS;
}

/** The line and price on one side of a market right now, or null if it's not up. */
export function price(game, market, side) {
  const lines = game.lines ?? {};
  if (!MARKETS[market]?.includes(side)) return null;
  if (market === 'spread' && lines.spread) {
    return side === 'home'
      ? { line: lines.spread.home, odds: lines.spread.homeOdds }
      : { line: -lines.spread.home || 0, odds: lines.spread.awayOdds };
  }
  if (market === 'total' && lines.total) {
    return { line: lines.total.points, odds: side === 'over' ? lines.total.overOdds : lines.total.underOdds };
  }
  if (market === 'ml' && lines.ml) return { line: null, odds: lines.ml[side] };
  return null;
}

/** Units won on a win at American `odds`, risking `units`. */
export function toWin(odds, units) {
  return round2(odds > 0 ? (units * odds) / 100 : (units * 100) / -odds);
}

export function profit(result, odds, units) {
  if (result === 'win') return toWin(odds, units);
  if (result === 'loss') return -units;
  return 0;
}

/** win, loss or push for a pick on a game with a final score. */
export function grade(pick, homeScore, awayScore) {
  const margin = pick.side === 'home' ? homeScore - awayScore : awayScore - homeScore;
  let diff;
  if (pick.market === 'spread') diff = margin + pick.line;
  else if (pick.market === 'total') diff = pick.side === 'over' ? homeScore + awayScore - pick.line : pick.line - homeScore - awayScore;
  else diff = margin;
  return diff > 0 ? 'win' : diff < 0 ? 'loss' : 'push';
}

export function isLocked(game, now) {
  return game.state !== 'pre' || new Date(game.start) <= now;
}

/**
 * Write a pick, or say why not. `seen` is the line and price the player was
 * shown; if the number moved since, they get the new one to confirm instead.
 * With `streak`, it's also the player's Streak pick for the game's Eastern
 * day, unless they already have one for that day (then `streakTaken`).
 */
export function makePick(store, { userId, game, market, side, units, seen, now, streak = false }) {
  if (isLocked(game, now)) return { error: 'That game has started. Picks lock at kickoff.' };
  const current = price(game, market, side);
  if (!current) return { error: 'That line is off the board right now.' };
  const most = maxUnits(current.odds);
  if (!Number.isFinite(units) || units < UNITS_MIN || round2(units) > most) {
    return {
      error: most < MAX_UNITS
        ? `At ${formatOdds(current.odds)}, ${formatUnits(most)} is the most you can play. No pick can win more than ${MAX_UNITS} units.`
        : `Play between ${formatUnits(UNITS_MIN)} and ${formatUnits(MAX_UNITS)}.`,
    };
  }
  units = round2(units);
  if (seen && (seen.line !== current.line || seen.odds !== current.odds)) {
    return { moved: current, error: `The line moved to ${formatLine(market, side, current, game)}. Still want it?` };
  }
  const taken = store.get('SELECT side FROM picks WHERE user_id = ? AND game_id = ? AND market = ?', userId, game.id, market);
  if (taken) return { error: `You already have a ${MARKET_NAME[market].toLowerCase()} pick on this game.` };

  const day = etDay(game.start);
  const streakTaken = streak && Boolean(store.get('SELECT 1 AS x FROM picks WHERE user_id = ? AND streak_day = ?', userId, day));
  const { lastInsertRowid } = store.run(
    `INSERT INTO picks (user_id, game_id, sport, market, side, line, odds, units, game_start, made_at, streak_day)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    userId, game.id, game.sport, market, side, current.line, current.odds, units, game.start, now.toISOString(),
    streak && !streakTaken ? day : null,
  );
  return { id: Number(lastInsertRowid), units, streak: streak && !streakTaken, streakTaken };
}

/** Delete a pick before its game starts. After that it stays on the record. */
export function deletePick(store, { userId, pickId, game, now }) {
  if (!game || isLocked(game, now)) return { error: 'That game has started, so the pick stays on the record.' };
  const { changes } = store.run('DELETE FROM picks WHERE id = ? AND user_id = ? AND result IS NULL', pickId, userId);
  return changes ? {} : { error: 'No pick to delete.' };
}

/**
 * Grade every open pick whose game is final, and void the ones whose game was
 * called off. A game ESPN still shows unfinished three days after its start
 * gets voided too, but only on ESPN's word: if the app just couldn't reach
 * ESPN for a while, the pick waits. Parlay legs grade the same way, and a
 * parlay settles as soon as its legs say how it went. Returns how many bets
 * it settled; `onGraded` gets the pick ids and the parlay ids.
 */
export function gradeFinished(store, now, { staleAfterMs = 3 * 86_400_000, onGraded = null } = {}) {
  const at = now.toISOString();
  const open = store.all(
    `SELECT p.id, p.game_id, p.market, p.side, p.line, p.odds, p.units,
            g.state, g.status, g.completed, g.home_score, g.away_score, g.start_time, g.updated_at, g.closing_at
       FROM picks p JOIN games g ON g.id = p.game_id
      WHERE p.result IS NULL AND g.start_time <= ?`,
    at,
  );
  const openLegs = store.all(
    `SELECT l.parlay_id, l.game_id, l.market, l.side, l.line,
            g.state, g.status, g.completed, g.home_score, g.away_score, g.start_time, g.updated_at
       FROM parlay_legs l JOIN parlays x ON x.id = l.parlay_id JOIN games g ON g.id = l.game_id
      WHERE x.result IS NULL AND l.result IS NULL AND g.start_time <= ?`,
    at,
  );
  const done = [];
  const parlaysDone = [];
  store.tx(() => {
    // Every started game with an open pick has its close by now: frozen when
    // it started, or here from the last lines seen if the app missed that.
    for (const p of open) if (!p.closing_at) freezeLate(store, p.game_id, at);
    fillClv(store, open.map((p) => p.game_id));
    for (const p of open) {
      const result = outcome(p, staleAfterMs);
      if (!result) continue;
      const { changes } = store.run(
        'UPDATE picks SET result = ?, profit = ?, graded_at = ? WHERE id = ? AND result IS NULL',
        result, profit(result, p.odds, p.units), at, p.id,
      );
      if (changes) done.push(p.id);
    }
    for (const leg of openLegs) {
      const result = outcome(leg, staleAfterMs);
      if (result) store.run('UPDATE parlay_legs SET result = ? WHERE parlay_id = ? AND game_id = ? AND result IS NULL', result, leg.parlay_id, leg.game_id);
    }
    // Every open parlay with a graded leg: settle it if the legs say how it went.
    const due = store.all(
      `SELECT DISTINCT x.id, x.units FROM parlays x JOIN parlay_legs l ON l.parlay_id = x.id
        WHERE x.result IS NULL AND l.result IS NOT NULL`,
    );
    for (const x of due) {
      const legs = store.all('SELECT odds, result FROM parlay_legs WHERE parlay_id = ?', x.id);
      const settled = settleParlay(legs, x.units);
      if (!settled) continue;
      const { changes } = store.run(
        'UPDATE parlays SET result = ?, profit = ?, graded_at = ? WHERE id = ? AND result IS NULL',
        settled.result, settled.profit, at, x.id,
      );
      if (changes) parlaysDone.push(x.id);
    }
  });
  if ((done.length || parlaysDone.length) && onGraded) onGraded(done, parlaysDone);
  return done.length + parlaysDone.length;
}

/**
 * win, loss, push or void for one bet on a game that's over, or null while
 * it's still to be decided. Survivor and Pick'em grade with this too.
 */
export function outcome(row, staleAfterMs = 3 * 86_400_000) {
  const checkedLate = new Date(row.updated_at) - new Date(row.start_time) >= staleAfterMs;
  if (row.state === 'post' && row.completed && row.home_score != null && row.away_score != null) {
    return grade(row, row.home_score, row.away_score);
  }
  if (VOID_STATUSES.has(row.status) || (checkedLate && row.state !== 'in')) return 'void';
  return null;
}

// ---- Parlays ---------------------------------------------------------------
// The price of a parlay is every leg's decimal odds multiplied together.

export const PARLAY_MIN_LEGS = 2;
export const PARLAY_MAX_LEGS = 6;

/** -110 -> 1.909..., +150 -> 2.5 */
export function decimalOdds(american) {
  return american > 0 ? 1 + american / 100 : 1 + 100 / -american;
}

/** 6.958 -> +596, 1.44 -> -227 */
export function americanOdds(decimal) {
  return decimal >= 2 ? Math.round((decimal - 1) * 100) : -Math.round(100 / (decimal - 1));
}

/** The combined price of these legs (each with American `odds`): exact decimal, and American for show. */
export function parlayPrice(legs) {
  const decimal = legs.reduce((d, leg) => d * decimalOdds(leg.odds), 1);
  return { decimal, american: americanOdds(decimal) };
}

/**
 * The most a parlay can be at this decimal price, the same cap as a straight
 * pick: never risk more than 5u, never win more than 5u. Worked from the exact
 * price rather than the rounded American one, so rounding can't let a parlay
 * win 5.01u. At +596 it's 0.83u.
 */
export function parlayMaxUnits(decimal) {
  return Math.min(MAX_UNITS, Math.floor((MAX_UNITS * 100) / (decimal - 1) + 1e-9) / 100);
}

/** Units a parlay wins at this decimal price. */
export function parlayToWin(decimal, units) {
  return round2(units * (decimal - 1));
}

/**
 * How a parlay stands from its legs' results, or null while it's undecided.
 * A losing leg loses it at once. Pushed and voided legs drop out and the
 * price is worked again from the legs left. If every leg wins (or drops out)
 * it's settled; with nothing left it's a push (void if every leg was voided).
 */
export function settleParlay(legs, units) {
  if (legs.some((l) => l.result === 'loss')) return { result: 'loss', profit: -units };
  if (legs.some((l) => !l.result)) return null;
  const won = legs.filter((l) => l.result === 'win');
  if (!won.length) return { result: legs.every((l) => l.result === 'void') ? 'void' : 'push', profit: 0 };
  // The stake cap already keeps this at 5u or less (dropping legs only shortens
  // the price). Capped here too rather than thrown, so one bad row can never
  // stop grading for everyone else.
  const paid = Math.min(MAX_UNITS, parlayToWin(parlayPrice(won).decimal, units));
  return { result: 'win', profit: paid };
}

export const MARKET_NAME = { spread: 'Spread', total: 'Total', ml: 'Moneyline' };

/** "Bills +3.5 (-110)", "Over 47.5 (-110)", "Chiefs ML (-170)" */
export function formatLine(market, side, { line, odds }, game) {
  return `${selection(market, side, line, game)} (${formatOdds(odds)})`;
}

export function selection(market, side, line, game) {
  if (market === 'total') return `${side === 'over' ? 'Over' : 'Under'} ${line}`;
  const team = side === 'home' ? game.home.short : game.away.short;
  if (market === 'ml') return `${team} ML`;
  return `${team} ${formatSpread(line)}`;
}

export function formatSpread(line) {
  if (line === 0) return 'PK';
  return line > 0 ? `+${line}` : `${line}`;
}

export function formatOdds(odds) {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

export function formatUnits(units, { sign = false } = {}) {
  const text = `${Number.isInteger(units) ? units : units.toFixed(2).replace(/0$/, '')}u`;
  return sign && units > 0 ? `+${text}` : text;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
