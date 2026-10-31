// The rules that make a record worth something: a pick only goes in before
// kickoff, at the line ESPN shows right then, and gets graded off the final.

import { VOID_STATUSES } from './espn.js';

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
 */
export function makePick(store, { userId, game, market, side, units, seen, now }) {
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

  const { lastInsertRowid } = store.run(
    `INSERT INTO picks (user_id, game_id, sport, market, side, line, odds, units, game_start, made_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    userId, game.id, game.sport, market, side, current.line, current.odds, units, game.start, now.toISOString(),
  );
  return { id: Number(lastInsertRowid), units };
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
export function gradeFinished(store, now, { staleAfterMs = 3 * 86_400_000, onGraded = null } = {}) {
  const open = store.all(
    `SELECT p.id, p.market, p.side, p.line, p.odds, p.units,
            g.state, g.status, g.completed, g.home_score, g.away_score, g.start_time, g.updated_at
       FROM picks p JOIN games g ON g.id = p.game_id
      WHERE p.result IS NULL AND g.start_time <= ?`,
    now.toISOString(),
  );
  const done = [];
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
      const { changes } = store.run(
        'UPDATE picks SET result = ?, profit = ?, graded_at = ? WHERE id = ? AND result IS NULL',
        result, profit(result, p.odds, p.units), now.toISOString(), p.id,
      );
      if (changes) done.push(p.id);
    }
  });
  if (done.length && onGraded) onGraded(done);
  return done.length;
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
