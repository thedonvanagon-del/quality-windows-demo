// Closing line value: did a pick get a better number than where the line
// closed? The close is the last pregame line the app saw for each market,
// frozen once when the game starts (games.closing_lines). CLV is worked out
// for straight picks only; parlays skip it for now.

import { price } from './picks.js';

/** The chance a price implies, before taking out the book's cut: -110 -> 0.524, +150 -> 0.4. */
export function impliedProb(odds) {
  return odds > 0 ? 100 / (odds + 100) : -odds / (-odds + 100);
}

const OTHER = { home: 'away', away: 'home', over: 'under', under: 'over' };

/**
 * CLV for one pick against the closing lines, or null when the close for its
 * market isn't known.
 *
 * points: spreads and totals only. Points gained, positive when the pick got
 * the better number: +3.5 that closed +2.5 is +1; Over 44 that closed 45.5 is
 * +1.5; Under the other way round.
 *
 * pct: the gain in win chance, in percentage points, from the price alone.
 * Both sides' closing prices take out the book's cut, and the pick's own
 * price is scaled by the same amount, so a pick at the closing price is 0,
 * not minus the vig. With only one side's closing price, raw chances are used.
 */
export function clvFor(pick, closing) {
  if (!closing) return null;
  const close = price({ lines: closing }, pick.market, pick.side);
  if (!close || !Number.isFinite(close.odds) || !Number.isFinite(pick.odds)) return null;
  let points = null;
  if (pick.market === 'spread' && pick.line != null && close.line != null) points = pick.line - close.line;
  if (pick.market === 'total' && pick.line != null && close.line != null) points = pick.side === 'over' ? close.line - pick.line : pick.line - close.line;
  const other = price({ lines: closing }, pick.market, OTHER[pick.side]);
  const vig = other && Number.isFinite(other.odds) ? impliedProb(close.odds) + impliedProb(other.odds) : 1;
  const pct = ((impliedProb(close.odds) - impliedProb(pick.odds)) / vig) * 100;
  return { points: points == null ? null : round2(points), pct: round2(pct) };
}

/**
 * The number that says whether a pick beat the close: points on a spread or
 * total when the number moved, else the price.
 */
export function clvValue(pick) {
  if (pick.market !== 'ml' && pick.clvPoints != null && pick.clvPoints !== 0) return pick.clvPoints;
  return pick.clvPct ?? pick.clvPoints ?? null;
}

/** "CLV +1.0" (points) or "CLV +2.3%" (price), the same number clvValue reads. */
export function clvLabel(pick) {
  const v = clvValue(pick);
  if (v == null) return null;
  const points = pick.market !== 'ml' && pick.clvPoints != null && pick.clvPoints !== 0;
  const text = `${v > 0 ? '+' : ''}${v.toFixed(1)}`;
  return `CLV ${text.replace(/^-/, '−')}${points ? '' : '%'}`;
}

/**
 * The closing lines to keep for a game, given its stored row (or none) and
 * what ESPN says now: { lines (JSON or null), at }. Before the start, the
 * latest number for each market, keeping a market's last one if the book
 * pulls it, with `at` null. Once the game starts (by ESPN or the clock),
 * `at` is set and the lines are frozen: later calls hand back the same ones.
 */
export function nextClosing(prior, game, now) {
  if (prior?.closing_at) return { lines: prior.closing_lines, at: prior.closing_at };
  const seen = parse(prior?.closing_lines) ?? (prior ? parse(prior.lines) : null);
  const started = game.state !== 'pre' || new Date(game.start) <= now;
  // ESPN drops (or swaps in live) odds once a game is on, so only a pregame
  // board feeds the close.
  const lines = game.state === 'pre' ? merge(seen, game.lines) : seen;
  return { lines: lines ? JSON.stringify(lines) : null, at: started ? now.toISOString() : null };
}

function merge(old, now) {
  const out = { spread: null, total: null, ml: null, book: null, ...old };
  for (const key of ['spread', 'total', 'ml']) if (now?.[key]) out[key] = now[key];
  if (now?.book) out.book = now.book;
  return out.spread || out.total || out.ml ? out : null;
}

function parse(json) {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * Work out CLV for the straight picks on these games that don't have it yet,
 * now that their close is frozen. Picks made before this existed get it too.
 */
export function fillClv(store, gameIds) {
  let filled = 0;
  for (const id of new Set(gameIds)) {
    const game = store.get('SELECT closing_lines, closing_at FROM games WHERE id = ?', id);
    const closing = game?.closing_at ? parse(game.closing_lines) : null;
    if (!closing) continue;
    for (const p of store.all('SELECT id, market, side, line, odds FROM picks WHERE game_id = ? AND clv_pct IS NULL AND clv_points IS NULL', id)) {
      const clv = clvFor(p, closing);
      if (!clv) continue;
      store.run('UPDATE picks SET clv_points = ?, clv_pct = ? WHERE id = ?', clv.points, clv.pct, p.id);
      filled += 1;
    }
  }
  return filled;
}

/**
 * Freeze the close for a started game that never got one (it started while
 * the app wasn't looking): the last lines seen, which ESPN stops changing
 * once a game is on. Used at grading.
 */
export function freezeLate(store, gameId, at) {
  store.run(
    `UPDATE games SET closing_lines = COALESCE(closing_lines, lines), closing_at = ?
      WHERE id = ? AND closing_at IS NULL`,
    at, gameId,
  );
}

/** "Beat the close: 58% · Avg CLV +1.2%" for a profile: every straight pick with a CLV, voids left out. */
export function clvSummary(store, userId) {
  const rows = store.all(
    `SELECT market, clv_points, clv_pct FROM picks
      WHERE user_id = ? AND (clv_pct IS NOT NULL OR clv_points IS NOT NULL) AND (result IS NULL OR result != 'void')`,
    userId,
  );
  if (!rows.length) return null;
  const values = rows.map((r) => clvValue({ market: r.market, clvPoints: r.clv_points, clvPct: r.clv_pct }));
  const pcts = rows.map((r) => r.clv_pct).filter((v) => v != null);
  return {
    picks: rows.length,
    beat: values.filter((v) => v > 0).length / rows.length,
    avgPct: pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null,
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
