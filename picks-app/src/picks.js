// The rules that make a record worth something: a pick only goes in before
// kickoff, at the line ESPN shows right then, and gets graded off the final.

import { VOID_STATUSES } from './espn.js';

export const MARKETS = {
  spread: ['away', 'home'],
  total: ['over', 'under'],
  ml: ['away', 'home'],
};
// A player types a dollar wager; their record counts it in units, at their
// own unit size, so a $10 bettor and a $1,000 bettor compete on skill.
export const DEFAULT_UNIT = 100;
export const WAGER_MIN = 1;
export const WAGER_MAX = 100_000;
export const WAGER_CHIPS = [10, 25, 50, 100, 250];
// The biggest play a pick can be, in units: a capper's "max play". Without it,
// a $1 unit and a big wager would turn one pick into hundreds of units.
export const MAX_UNITS = 5;

/** Units for a dollar wager at a unit size, never below a hundredth. */
export function unitsFor(wager, unitSize = DEFAULT_UNIT) {
  return Math.max(0.01, round2(wager / unitSize));
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
 */
export function makePick(store, { userId, game, market, side, wager, unitSize = DEFAULT_UNIT, seen, now }) {
  if (!Number.isFinite(wager) || wager < WAGER_MIN || wager > WAGER_MAX) {
    return { error: `Wager between $${WAGER_MIN} and $${WAGER_MAX.toLocaleString('en-US')}.` };
  }
  wager = round2(wager);
  const units = unitsFor(wager, unitSize);
  if (units > MAX_UNITS) {
    return { error: `${MAX_UNITS} units is the max on one pick. At ${formatMoney(unitSize)} a unit, that's ${formatMoney(MAX_UNITS * unitSize)}.` };
  }
  if (isLocked(game, now)) return { error: 'That game has started. Picks lock at kickoff.' };
  const current = price(game, market, side);
  if (!current) return { error: 'That line is off the board right now.' };
  if (seen && (seen.line !== current.line || seen.odds !== current.odds)) {
    return { moved: current, error: `The line moved to ${formatLine(market, side, current, game)}. Still want it?` };
  }
  const taken = store.get('SELECT side FROM picks WHERE user_id = ? AND game_id = ? AND market = ?', userId, game.id, market);
  if (taken) return { error: `You already have a ${MARKET_NAME[market].toLowerCase()} pick on this game.` };

  const { lastInsertRowid } = store.run(
    `INSERT INTO picks (user_id, game_id, sport, market, side, line, odds, units, wager, game_start, made_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    userId, game.id, game.sport, market, side, current.line, current.odds, units, wager, game.start, now.toISOString(),
  );
  return { id: Number(lastInsertRowid), wager, units };
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
 * ESPN for a while, the pick waits. Returns how many it graded.
 */
export function gradeFinished(store, now, { staleAfterMs = 3 * 86_400_000 } = {}) {
  const open = store.all(
    `SELECT p.id, p.market, p.side, p.line, p.odds, p.units,
            g.state, g.status, g.completed, g.home_score, g.away_score, g.start_time, g.updated_at
       FROM picks p JOIN games g ON g.id = p.game_id
      WHERE p.result IS NULL AND g.start_time <= ?`,
    now.toISOString(),
  );
  let graded = 0;
  store.tx(() => {
    for (const p of open) {
      let result = null;
      const checkedLate = new Date(p.updated_at) - new Date(p.start_time) >= staleAfterMs;
      if (p.state === 'post' && p.completed && p.home_score != null && p.away_score != null) {
        result = grade(p, p.home_score, p.away_score);
      } else if (VOID_STATUSES.has(p.status) || (checkedLate && p.state !== 'in')) {
        result = 'void';
      }
      if (!result) continue;
      store.run(
        'UPDATE picks SET result = ?, profit = ?, graded_at = ? WHERE id = ? AND result IS NULL',
        result, profit(result, p.odds, p.units), now.toISOString(), p.id,
      );
      graded += 1;
    }
  });
  return graded;
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

/** "$1,250", "$90.91", "+$181.82", "-$200" */
export function formatMoney(n, { sign = false } = {}) {
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(Math.abs(n)) ? 0 : 2, maximumFractionDigits: 2 });
  return `${n < 0 ? '-' : sign && n > 0 ? '+' : ''}$${abs}`;
}

export function formatUnits(units, { sign = false } = {}) {
  const text = `${Number.isInteger(units) ? units : units.toFixed(2).replace(/0$/, '')}u`;
  return sign && units > 0 ? `+${text}` : text;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
