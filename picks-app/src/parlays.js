// Parlays: 2 to 6 legs, each a spread, total or moneyline on a different
// game. Legs collect in a draft, kept on the server per player, so building
// one works without JavaScript and across page loads. Locking re-checks every
// leg against the live line, the same way a straight pick is checked, and the
// parlay goes on the record as one bet.

import { toGame } from './games.js';
import {
  formatOdds, formatUnits, isLocked, MAX_UNITS, PARLAY_MAX_LEGS, PARLAY_MIN_LEGS,
  parlayMaxUnits, parlayPrice, parlayToWin, price, selection, UNITS_MIN,
} from './picks.js';

/** The player's draft legs, each with its game as last stored, earliest game first. */
export function draftLegs(store, userId) {
  return store
    .all(
      `SELECT d.game_id, d.market, d.side, d.line, d.odds, d.added_at, g.*
         FROM parlay_draft_legs d JOIN games g ON g.id = d.game_id
        WHERE d.user_id = ? ORDER BY g.start_time, d.game_id`,
      userId,
    )
    .map(toLeg);
}

function toLeg(row) {
  return { gameId: row.game_id, market: row.market, side: row.side, line: row.line, odds: row.odds, game: toGame(row) };
}

/** What the parlay bar shows: how many legs are still open and their combined price. */
export function draftSummary(store, userId, now) {
  const rows = store.all(
    `SELECT d.odds FROM parlay_draft_legs d JOIN games g ON g.id = d.game_id
      WHERE d.user_id = ? AND g.start_time > ? AND g.state = 'pre'`,
    userId, now.toISOString(),
  );
  return { legs: rows.length, odds: rows.length ? parlayPrice(rows).american : null };
}

/** game id -> { market, side } for the draft legs on these games, for the board. */
export function draftOnGames(store, userId, gameIds) {
  const out = new Map();
  if (!userId || !gameIds.length) return out;
  const rows = store.all(
    `SELECT game_id, market, side FROM parlay_draft_legs WHERE user_id = ? AND game_id IN (${gameIds.map(() => '?').join(',')})`,
    userId, ...gameIds,
  );
  for (const r of rows) out.set(r.game_id, { market: r.market, side: r.side });
  return out;
}

const legName = (leg) => selection(leg.market, leg.side, leg.line, leg.game);
const matchup = (game) => `${game.away.short} @ ${game.home.short}`;

/**
 * Add a leg at the line on the board right now. A leg on a game that's
 * already in the draft replaces it: one leg per game, since legs on the same
 * game move together.
 */
export function addLeg(store, { userId, game, market, side, now }) {
  if (isLocked(game, now)) return { error: 'That game has started. Picks lock at kickoff.' };
  const current = price(game, market, side);
  if (!current) return { error: 'That line is off the board right now.' };
  const leg = { market, side, line: current.line, odds: current.odds, game };
  const old = store.get('SELECT market, side, line FROM parlay_draft_legs WHERE user_id = ? AND game_id = ?', userId, game.id);
  if (old?.market === market && old.side === side) return { error: `${legName(leg)} is already in your parlay.` };
  const count = store.get('SELECT COUNT(*) AS n FROM parlay_draft_legs WHERE user_id = ?', userId).n;
  if (!old && count >= PARLAY_MAX_LEGS) return { error: `A parlay can have ${PARLAY_MAX_LEGS} legs at most. Remove one to add this.` };
  store.run(
    `INSERT INTO parlay_draft_legs (user_id, game_id, market, side, line, odds, added_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id, game_id) DO UPDATE SET market = excluded.market, side = excluded.side,
       line = excluded.line, odds = excluded.odds, added_at = excluded.added_at`,
    userId, game.id, market, side, current.line, current.odds, now.toISOString(),
  );
  const legs = old ? count : count + 1;
  return {
    legs,
    added: legName(leg),
    replaced: old ? selection(old.market, old.side, old.line, game) : null,
  };
}

export function removeLeg(store, { userId, gameId }) {
  return store.run('DELETE FROM parlay_draft_legs WHERE user_id = ? AND game_id = ?', userId, gameId).changes > 0;
}

/** Take legs whose game has started out of the draft. Returns a note for each. */
export function pruneDraft(store, userId, now) {
  const notes = [];
  for (const leg of draftLegs(store, userId)) {
    if (!isLocked(leg.game, now)) continue;
    removeLeg(store, { userId, gameId: leg.gameId });
    notes.push(startedNote(leg));
  }
  return notes;
}

const startedNote = (leg) => `${matchup(leg.game)} has started, so ${legName(leg)} is out.`;

/**
 * The draft as the parlay page showed it, so a lock can tell whether anything
 * changed in between (a line, or a leg added in another tab).
 */
export function draftSignature(legs) {
  return legs.map((l) => `${l.gameId}:${l.market}:${l.side}:${l.line ?? ''}:${l.odds}`).sort().join('|');
}

/**
 * Lock the draft as a parlay, or say why not. `live` maps game id to the game
 * as just fetched; `seen` is the signature of the draft the player was shown.
 * Every leg is checked against the live line. A leg whose game started drops
 * out; a leg whose line moved takes the new number. Either way the player sees
 * the parlay again and confirms it, since its price changed.
 */
export function lockParlay(store, { userId, live, units, seen, now }) {
  const notes = [];
  let moved = false;
  store.tx(() => {
    for (const leg of draftLegs(store, userId)) {
      const game = live.get(leg.gameId) ?? leg.game;
      if (isLocked(game, now)) {
        removeLeg(store, { userId, gameId: leg.gameId });
        notes.push(startedNote(leg));
        continue;
      }
      const current = price(game, leg.market, leg.side);
      if (!current) {
        removeLeg(store, { userId, gameId: leg.gameId });
        notes.push(`${legName(leg)} is off the board right now, so it's out.`);
        continue;
      }
      if (current.line !== leg.line || current.odds !== leg.odds) {
        store.run('UPDATE parlay_draft_legs SET line = ?, odds = ? WHERE user_id = ? AND game_id = ?', current.line, current.odds, userId, leg.gameId);
        moved = true;
      }
    }
  });
  const legs = draftLegs(store, userId);
  if (legs.length < PARLAY_MIN_LEGS) {
    return { notes, error: `A parlay needs at least ${PARLAY_MIN_LEGS} legs, each on a different game. Nothing was locked.` };
  }
  if (notes.length || moved) return { notes, changed: true, error: moved ? 'Lines moved. Still want it?' : 'Still want it?' };
  if (seen !== draftSignature(legs)) return { notes, changed: true, error: 'Your parlay changed since you opened it. Check it and lock again.' };

  const { decimal, american } = parlayPrice(legs);
  const most = parlayMaxUnits(decimal);
  if (most < UNITS_MIN) {
    return { notes, error: `At ${formatOdds(american)}, this parlay is too long: it couldn't risk even ${formatUnits(UNITS_MIN)} without winning more than ${MAX_UNITS} units. Take a leg off.` };
  }
  if (!Number.isFinite(units) || units < UNITS_MIN || round2(units) > most) {
    return {
      notes,
      error: most < MAX_UNITS
        ? `At ${formatOdds(american)}, ${formatUnits(most)} is the most you can play. No bet can win more than ${MAX_UNITS} units.`
        : `Play between ${formatUnits(UNITS_MIN)} and ${formatUnits(MAX_UNITS)}.`,
    };
  }
  units = round2(units);
  const sports = new Set(legs.map((l) => l.game.sport));
  const id = store.tx(() => {
    const parlayId = Number(store.run(
      `INSERT INTO parlays (user_id, sport, units, odds, made_at, first_start) VALUES (?, ?, ?, ?, ?, ?)`,
      userId, sports.size === 1 ? [...sports][0] : null, units, american, now.toISOString(), legs[0].game.start,
    ).lastInsertRowid);
    for (const leg of legs) {
      store.run(
        'INSERT INTO parlay_legs (parlay_id, game_id, sport, market, side, line, odds) VALUES (?, ?, ?, ?, ?, ?, ?)',
        parlayId, leg.gameId, leg.game.sport, leg.market, leg.side, leg.line, leg.odds,
      );
    }
    store.run('DELETE FROM parlay_draft_legs WHERE user_id = ?', userId);
    return parlayId;
  });
  return { id, legs: legs.length, odds: american, units, toWin: parlayToWin(decimal, units) };
}

/** The games a parlay's legs are on, for the delete check. */
export function parlayGameIds(store, { userId, parlayId }) {
  return store
    .all('SELECT l.game_id FROM parlay_legs l JOIN parlays x ON x.id = l.parlay_id WHERE x.id = ? AND x.user_id = ?', parlayId, userId)
    .map((r) => r.game_id);
}

/** Delete a parlay before its first leg starts. After that it stays on the record. */
export function deleteParlay(store, { userId, parlayId, games, now }) {
  if (!games.length || games.some((g) => !g || isLocked(g, now))) {
    return { error: 'Its first game has started, so the parlay stays on the record.' };
  }
  const { changes } = store.run('DELETE FROM parlays WHERE id = ? AND user_id = ? AND result IS NULL', parlayId, userId);
  return changes ? {} : { error: 'No parlay to delete.' };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
