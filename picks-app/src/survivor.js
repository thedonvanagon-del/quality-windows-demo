// Survivor, the NFL's last-one-standing game. Free, one pool per season,
// made on its own once the season's games are on the board.
//
// - Each week a player picks one team to win outright. A team can be used
//   once a season. A loss or a tie ends their run, and so does a week with
//   no pick. A postponed or canceled game doesn't count: the player
//   survives and the team isn't used.
// - Anyone can join while the current week's first game hasn't started;
//   they're alive from that week on, and only weeks from then count.
// - A pick can change until that team's game starts. Other players' picks
//   stay hidden until each game starts, the same rule as bets.
// - When a week is over (every pick graded), missed weeks are knocked out.
//   If one player is left, they win; if everyone left went out that week,
//   they share it; after week 18, whoever is still alive shares it.
//
// A Survivor pick is only "does this team win". It never touches units or
// records. The pick slip offers one alongside a spread or moneyline bet on
// a team, but the bet and the Survivor pick are graded apart.

import { checkBadges } from './badges.js';
import { cupYear, recordCup } from './cup.js';
import { toGame } from './games.js';
import { closesAt, nflSeason, REGULAR_WEEKS, seasonWeeks, weekOf } from './nflweeks.js';
import { isLocked, outcome } from './picks.js';
import { HOUR } from './time.js';

export const REMIND_HOURS = 3;

/** The season's pool, or null. */
export function poolFor(store, season) {
  return season == null ? null : store.get('SELECT * FROM survivor_pools WHERE season = ?', season) ?? null;
}

/**
 * Where Survivor stands right now: { season, weeks, current, pool }. `pool`
 * is null before one is made (see ensurePool); `current` is null between
 * seasons.
 */
export function survivorState(store, now) {
  const s = nflSeason(store, now);
  return { season: s?.season ?? null, weeks: s?.weeks ?? [], current: s?.current ?? null, pool: poolFor(store, s?.season) };
}

/** Make this season's pool ("Survivor 2026") once the season's on the board. Safe to run as often as you like. */
export function ensurePool(store, now) {
  const s = nflSeason(store, now);
  if (!s?.current) return poolFor(store, s?.season);
  store.run('INSERT OR IGNORE INTO survivor_pools (season, name, created_at) VALUES (?, ?, ?)', s.season, `Survivor ${s.season}`, now.toISOString());
  return poolFor(store, s.season);
}

/** A player's entry, or null. */
export function entryOf(store, pool, userId) {
  if (!pool || userId == null) return null;
  return store.get('SELECT * FROM survivor_entries WHERE pool_id = ? AND user_id = ?', pool.id, userId) ?? null;
}

/** Whether new players can come in right now: the pool is open and this week's first game hasn't started. */
export function canJoin(state, now) {
  const { pool, current } = state;
  return Boolean(pool && !pool.closed_at && current && (!current.first || now < new Date(current.first)));
}

/** Join, free, for the current week. Only while that week's first game hasn't started. */
export function joinSurvivor(store, state, userId, now) {
  const { pool, current } = state;
  if (!pool) return { error: "Survivor isn't open right now. It returns for the NFL season." };
  if (store.get('SELECT official FROM users WHERE id = ?', userId)?.official) return { error: "The official account doesn't play Survivor." };
  if (entryOf(store, pool, userId)) return { ok: true, joined: false };
  if (pool.closed_at) return { error: `${pool.name} is over.` };
  if (!canJoin(state, now)) return { error: current ? `Week ${current.week} has started. You can join before next week's first game.` : "Survivor isn't open right now." };
  store.run(
    'INSERT OR IGNORE INTO survivor_entries (pool_id, user_id, joined_at, start_week) VALUES (?, ?, ?, ?)',
    pool.id, userId, now.toISOString(), current.week,
  );
  return { ok: true, joined: true, week: current.week };
}

/** Teams this player has used in other weeks: abbreviation -> week. A voided pick doesn't use its team. */
export function usedTeams(store, pool, userId, exceptWeek = null) {
  if (!pool) return new Map();
  return new Map(store.all(
    `SELECT team, week FROM survivor_picks WHERE pool_id = ? AND user_id = ? AND (result IS NULL OR result != 'void') AND week IS NOT ?
      ORDER BY week`,
    pool.id, userId, exceptWeek,
  ).map((r) => [r.team, r.week]));
}

/** A player's pick for a week, with its game, or null. */
export function pickFor(store, pool, userId, week) {
  if (!pool || userId == null) return null;
  const row = store.get(
    `SELECT g.*, s.side, s.team, s.game_id, s.made_at, s.result AS pick_result FROM survivor_picks s JOIN games g ON g.id = s.game_id
      WHERE s.pool_id = ? AND s.user_id = ? AND s.week = ?`,
    pool.id, userId, week,
  );
  if (!row) return null;
  const game = toGame(row);
  return { week, team: row.team, side: row.side, game, gameId: row.game_id, result: row.pick_result, name: game[row.side].short, madeAt: row.made_at };
}

/** Whether a game is one of the current week's. */
function inWeek(state, game) {
  const w = weekOf(game);
  return Boolean(state.pool && state.current && game.sport === 'nfl' && w && w.season === state.pool.season && w.week === state.current.week);
}

/**
 * Pick `side` of `game` as this week's team, or switch to it. Only for an
 * alive player, a game this week that hasn't started, a team not used in
 * another week, and while their current pick's game hasn't started (or its
 * game was called off). Returns { ok, switched, prev, same } or { error }.
 */
export function setSurvivorPick(store, { state, userId, game, side, now }) {
  const { pool, current } = state;
  if (!['home', 'away'].includes(side) || !game) return { error: 'Pick a team.' };
  if (!pool) return { error: "Survivor isn't open right now." };
  if (pool.closed_at) return { error: `${pool.name} is over.` };
  const entry = entryOf(store, pool, userId);
  if (!entry) return { error: 'Join Survivor first.' };
  if (entry.out_week) return { error: `You're out. Your run ended in Week ${entry.out_week}.` };
  if (!inWeek(state, game)) return { error: current ? `Pick from Week ${current.week} games.` : 'There are no games to pick right now.' };
  const name = game[side].short;
  if (isLocked(game, now)) return { error: `${name} has kicked off. Survivor picks lock at kickoff.` };
  const used = usedTeams(store, pool, userId, current.week).get(game[side].abbr);
  if (used) return { error: `${name}: used in Week ${used}. A team counts once a season.` };
  const prev = pickFor(store, pool, userId, current.week);
  const at = now.toISOString();
  if (prev) {
    if (prev.gameId === game.id && prev.side === side && prev.result !== 'void') return { ok: true, same: true, name, week: current.week };
    if (prev.result !== 'void' && isLocked(prev.game, now)) return { error: `Your Week ${current.week} pick, ${prev.name}, has kicked off. It's locked.` };
    store.run(
      `UPDATE survivor_picks SET game_id = ?, side = ?, team = ?, made_at = ?, result = NULL, graded_at = NULL
        WHERE pool_id = ? AND user_id = ? AND week = ?`,
      game.id, side, game[side].abbr, at, pool.id, userId, current.week,
    );
    return { ok: true, switched: true, prev: prev.name, name, week: current.week };
  }
  store.run(
    'INSERT INTO survivor_picks (pool_id, user_id, week, game_id, side, team, made_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    pool.id, userId, current.week, game.id, side, game[side].abbr, at,
  );
  return { ok: true, name, week: current.week };
}

/**
 * What the pick slip offers for a bet on `side` of `game`, or null:
 * { week, team } ("Use Chiefs as my Survivor pick for Week 10"), with `now`
 * when it would switch from another team, or `usedIn` when the team was
 * used in an earlier week (shown, but off).
 */
export function slipChoice(store, { userId, game, market, side, now }) {
  if (game?.sport !== 'nfl' || !['spread', 'ml'].includes(market) || !['home', 'away'].includes(side)) return null;
  const state = survivorState(store, now);
  const { pool, current } = state;
  if (!pool || pool.closed_at || !inWeek(state, game) || isLocked(game, now)) return null;
  const entry = entryOf(store, pool, userId);
  if (!entry || entry.out_week) return null;
  const team = game[side].short;
  const used = usedTeams(store, pool, userId, current.week).get(game[side].abbr);
  if (used) return { week: current.week, team, usedIn: used };
  const prev = pickFor(store, pool, userId, current.week);
  if (prev && prev.result !== 'void') {
    if (prev.gameId === game.id && prev.side === side) return null;
    if (isLocked(prev.game, now)) return null;
    return { week: current.week, team, now: prev.name };
  }
  return { week: current.week, team };
}

// ---- grading and closing ------------------------------------------------------

/**
 * Grade Survivor picks on games that are over: the team won, lost, tied, or
 * the game was called off (void: the player survives, the team isn't used).
 * A loss or a tie ends the run at once, with a note. Then settle any week
 * that's over. Returns how many picks it graded.
 */
export function gradeSurvivor(store, now, notifier = null) {
  const at = now.toISOString();
  const open = store.all(
    `SELECT s.pool_id, s.user_id, s.week, s.side, s.team, g.state, g.status, g.completed, g.home_score, g.away_score,
            g.start_time, g.updated_at, g.home_short, g.away_short
       FROM survivor_picks s JOIN games g ON g.id = s.game_id JOIN survivor_pools p ON p.id = s.pool_id
      WHERE s.result IS NULL AND g.start_time <= ? AND p.closed_at IS NULL`,
    at,
  );
  let graded = 0;
  for (const p of open) {
    const raw = outcome({ ...p, market: 'ml', line: null });
    if (!raw) continue;
    const result = raw === 'push' ? 'tie' : raw;
    const { changes } = store.run(
      'UPDATE survivor_picks SET result = ?, graded_at = ? WHERE pool_id = ? AND user_id = ? AND week = ? AND result IS NULL',
      result, at, p.pool_id, p.user_id, p.week,
    );
    if (!changes) continue;
    graded += 1;
    if (result !== 'loss' && result !== 'tie') continue;
    const name = p.side === 'home' ? p.home_short : p.away_short;
    const out = store.run(
      `UPDATE survivor_entries SET out_week = ?, out_reason = ?, out_team = ? WHERE pool_id = ? AND user_id = ? AND out_week IS NULL`,
      p.week, result, name, p.pool_id, p.user_id,
    ).changes;
    if (out) {
      notifier?.tell(p.user_id, {
        kind: 'survivor',
        text: `Your Survivor run ended in Week ${p.week} (${name} ${result === 'tie' ? 'tied' : 'lost'}).`,
        url: '/survivor',
      }, now);
    }
  }
  settleWeeks(store, now, notifier);
  return graded;
}

/**
 * Settle every week that's over, in order, once: knock out whoever had no
 * pick (or no counted one), then close the pool if it's done. A week waits
 * while any of its picks is still ungraded.
 */
export function settleWeeks(store, now, notifier = null) {
  const settled = [];
  for (const pool of store.all('SELECT * FROM survivor_pools WHERE closed_at IS NULL ORDER BY season')) {
    for (const w of seasonWeeks(store, pool.season)) {
      if (closesAt(w) > now) break;
      if (store.get('SELECT 1 AS x FROM survivor_weeks WHERE pool_id = ? AND week = ?', pool.id, w.week)) continue;
      if (store.get('SELECT 1 AS x FROM survivor_picks WHERE pool_id = ? AND week = ? AND result IS NULL', pool.id, w.week)) break;
      const missed = store.tx(() => {
        if (!store.run('INSERT OR IGNORE INTO survivor_weeks (pool_id, week, settled_at) VALUES (?, ?, ?)', pool.id, w.week, now.toISOString()).changes) return null;
        const out = store.all(
          `SELECT e.user_id FROM survivor_entries e
            WHERE e.pool_id = ? AND e.start_week <= ? AND e.out_week IS NULL
              AND NOT EXISTS (SELECT 1 FROM survivor_picks s WHERE s.pool_id = e.pool_id AND s.user_id = e.user_id AND s.week = ?)`,
          pool.id, w.week, w.week,
        ).map((r) => r.user_id);
        for (const id of out) {
          store.run("UPDATE survivor_entries SET out_week = ?, out_reason = 'missed' WHERE pool_id = ? AND user_id = ? AND out_week IS NULL", w.week, pool.id, id);
        }
        return out;
      });
      if (!missed) continue;
      for (const id of missed) {
        notifier?.tell(id, { kind: 'survivor', text: `Your Survivor run ended in Week ${w.week} (no pick).`, url: '/survivor' }, now);
      }
      settled.push(w.week);
      if (closeIfDone(store, pool, w, now, notifier)) break;
    }
  }
  return settled;
}

/**
 * After week `w` is settled: one player left wins; everyone left out the
 * same week share it; after the last regular-season week, whoever is alive
 * shares it. Needs at least two players in it. Returns the winners, or null.
 */
function closeIfDone(store, pool, w, now, notifier) {
  const entries = store.all('SELECT * FROM survivor_entries WHERE pool_id = ? AND start_week <= ?', pool.id, w.week);
  if (entries.length < 2) return null;
  const alive = entries.filter((e) => e.out_week == null);
  const outNow = entries.filter((e) => e.out_week === w.week);
  let winners = null;
  if (alive.length === 1) winners = alive;
  else if (!alive.length && outNow.length) winners = outNow;
  else if (w.week >= REGULAR_WEEKS && alive.length) winners = alive;
  if (!winners) return null;
  const at = now.toISOString();
  const claimed = store.tx(() => {
    if (!store.run('UPDATE survivor_pools SET closed_at = ?, closed_week = ? WHERE id = ? AND closed_at IS NULL', at, w.week, pool.id).changes) return false;
    for (const e of winners) store.run('UPDATE survivor_entries SET won_at = ? WHERE pool_id = ? AND user_id = ?', at, pool.id, e.user_id);
    recordCup(store, { source: 'survivor', ref: pool.season, year: cupYear(w.last), label: pool.name, rows: finishOrder(store, pool), now });
    return true;
  });
  if (!claimed) return null;
  const names = store.all(
    `SELECT id, screen_name FROM users WHERE id IN (${winners.map(() => '?').join(',')}) ORDER BY lower(screen_name)`,
    ...winners.map((e) => e.user_id),
  );
  const ids = new Set(names.map((u) => u.id));
  const others = names.length - 1;
  for (const u of names) {
    const text = others ? `You won ${pool.name}, shared with ${others} ${others === 1 ? 'other player' : 'other players'}.` : `You won ${pool.name}. Last one standing.`;
    notifier?.tell(u.id, { kind: 'survivor', text, url: '/survivor' }, now);
  }
  const who = names.length === 1 ? `${names[0].screen_name} won it` : `${names.map((u) => u.screen_name).join(', ')} share the win`;
  for (const e of store.all('SELECT user_id FROM survivor_entries WHERE pool_id = ?', pool.id)) {
    if (!ids.has(e.user_id)) notifier?.tell(e.user_id, { kind: 'survivor', text: `${pool.name} is over: ${who}.`, url: '/survivor' }, now);
  }
  checkBadges(store, [...ids], now, notifier);
  return winners;
}

/**
 * A closed pool's finish for the Cup: winners 1st, then by how late each
 * run ended (players out the same week share a place). Placed means they
 * made at least one pick. [{ id, place }]
 */
export function finishOrder(store, pool) {
  const rows = store.all(
    `SELECT e.user_id AS id, e.out_week, e.won_at FROM survivor_entries e JOIN users u ON u.id = e.user_id
      WHERE e.pool_id = ? AND u.official = 0 AND EXISTS (SELECT 1 FROM survivor_picks s WHERE s.pool_id = e.pool_id AND s.user_id = e.user_id)`,
    pool.id,
  );
  const key = (r) => (r.won_at ? Infinity : r.out_week ?? Infinity);
  rows.sort((a, b) => key(b) - key(a));
  return rows.map((r) => ({ id: r.id, place: 1 + rows.filter((o) => key(o) > key(r)).length }));
}

/**
 * "Make your Survivor pick for Week 10.": once a week, to alive players
 * with no pick yet, when the week's first game is 3 hours away or less.
 * Behind the tournament reminder setting. Written to reminders_sent first.
 */
export function sendSurvivorReminders(store, now, notifier) {
  const { pool, current } = survivorState(store, now);
  if (!pool || pool.closed_at || !current?.first) return 0;
  const first = new Date(current.first);
  if (now >= first || first - now > REMIND_HOURS * HOUR) return 0;
  const key = `${pool.season}-w${current.week}`;
  const rows = store.all(
    `SELECT e.user_id FROM survivor_entries e JOIN users u ON u.id = e.user_id
      WHERE e.pool_id = ? AND e.start_week <= ? AND e.out_week IS NULL AND u.notify_tournaments = 1 AND u.official = 0
        AND NOT EXISTS (SELECT 1 FROM survivor_picks s WHERE s.pool_id = e.pool_id AND s.user_id = e.user_id AND s.week = ?)`,
    pool.id, current.week, current.week,
  );
  let sent = 0;
  const hours = Math.max(1, Math.round((first - now) / HOUR));
  for (const r of rows) {
    const claimed = store.run(
      "INSERT OR IGNORE INTO reminders_sent (user_id, kind, day, sent_at) VALUES (?, 'survivor', ?, ?)",
      r.user_id, key, now.toISOString(),
    ).changes;
    if (!claimed) continue;
    notifier.tell(r.user_id, {
      kind: 'survivor',
      title: `Make your Survivor pick for Week ${current.week}`,
      text: `Make your Survivor pick for Week ${current.week}. The first game starts in ${hours} ${hours === 1 ? 'hour' : 'hours'}.`,
      url: '/survivor',
    }, now);
    sent += 1;
  }
  return sent;
}

// ---- pages ------------------------------------------------------------------

const RESULT_WORD = { win: 'Won', loss: 'Lost', tie: 'Tie', void: 'Void' };

/**
 * The standings: how many are left, who went out each week, and every
 * player's picks. Picks on games that haven't started stay hidden from
 * everyone but their owner.
 */
export function standings(store, pool, viewerId, now) {
  if (!pool) return { entered: 0, left: 0, outByWeek: [], players: [] };
  const players = store.all(
    `SELECT e.*, u.id, u.screen_name FROM survivor_entries e JOIN users u ON u.id = e.user_id
      WHERE e.pool_id = ? AND u.screen_name IS NOT NULL`,
    pool.id,
  );
  const picks = store.all(
    `SELECT g.*, s.user_id, s.week AS pick_week, s.side, s.team, s.result FROM survivor_picks s JOIN games g ON g.id = s.game_id
      WHERE s.pool_id = ? ORDER BY s.week`,
    pool.id,
  );
  const byUser = new Map();
  for (const p of picks) {
    const game = toGame(p);
    const hidden = p.user_id !== viewerId && !isLocked(game, now);
    const list = byUser.get(p.user_id) ?? byUser.set(p.user_id, []).get(p.user_id);
    list.push({
      week: p.pick_week,
      hidden,
      team: hidden ? null : game[p.side].short,
      abbr: hidden ? null : p.team,
      logo: hidden ? null : game[p.side].logo,
      result: p.result,
      word: p.result ? RESULT_WORD[p.result] : null,
    });
  }
  const status = (e) => (e.won_at ? 'won' : e.out_week ? 'out' : 'alive');
  const order = { won: 0, alive: 1, out: 2 };
  const rows = players.map((e) => ({
    id: e.id,
    screen_name: e.screen_name,
    status: status(e),
    startWeek: e.start_week,
    outWeek: e.out_week,
    outReason: e.out_reason,
    outTeam: e.out_team,
    picks: byUser.get(e.id) ?? [],
  })).sort((a, b) => order[a.status] - order[b.status] || (b.outWeek ?? 0) - (a.outWeek ?? 0) || a.screen_name.localeCompare(b.screen_name));
  const outByWeek = new Map();
  for (const r of rows) if (r.outWeek) outByWeek.set(r.outWeek, (outByWeek.get(r.outWeek) ?? 0) + 1);
  return {
    entered: rows.length,
    left: rows.filter((r) => r.status !== 'out').length,
    outByWeek: [...outByWeek].sort((a, b) => a[0] - b[0]).map(([week, n]) => ({ week, n })),
    players: rows,
  };
}

/** A player's own picks, newest week first: { week, team, logo, result, word }. */
export function historyOf(store, pool, userId) {
  if (!pool || userId == null) return [];
  return store.all(
    `SELECT g.*, s.week AS pick_week, s.side, s.result FROM survivor_picks s JOIN games g ON g.id = s.game_id
      WHERE s.pool_id = ? AND s.user_id = ? ORDER BY s.week DESC`,
    pool.id, userId,
  ).map((r) => {
    const game = toGame(r);
    return { week: r.pick_week, team: game[r.side].short, logo: game[r.side].logo, abbr: game[r.side].abbr, opp: game[r.side === 'home' ? 'away' : 'home'].short, home: r.side === 'home', result: r.result, word: r.result ? RESULT_WORD[r.result] : 'Pending', game };
  });
}

/**
 * This week's games for the Survivor page, each team marked: `mine` (your
 * pick), `used` (the week you used it), and the game `locked` once it starts.
 */
export function weekBoard(store, state, userId, now) {
  const { pool, current } = state;
  if (!current) return [];
  const used = usedTeams(store, pool, userId, current.week);
  const mine = pickFor(store, pool, userId, current.week);
  return current.games.map((row) => {
    const game = toGame(row);
    const side = (s) => ({
      ...game[s],
      side: s,
      used: used.get(game[s].abbr) ?? null,
      mine: Boolean(mine && mine.gameId === game.id && mine.side === s && mine.result !== 'void'),
    });
    return { game, locked: isLocked(game, now), away: side('away'), home: side('home') };
  });
}

/** The week's next game still to start (its first game until that kicks off), or null. */
export function nextKickoff(current, now) {
  const at = now.toISOString();
  return current?.games.map((g) => g.start_time).filter((t) => t > at).sort()[0] ?? null;
}

/** The last closed pool's winners, for the off-season card: { name, season, winners: [screen_name] } or null. */
export function lastWinners(store) {
  const pool = store.get('SELECT * FROM survivor_pools WHERE closed_at IS NOT NULL ORDER BY season DESC LIMIT 1');
  if (!pool) return null;
  const winners = store.all(
    `SELECT u.screen_name FROM survivor_entries e JOIN users u ON u.id = e.user_id WHERE e.pool_id = ? AND e.won_at IS NOT NULL ORDER BY lower(u.screen_name)`,
    pool.id,
  ).map((r) => r.screen_name);
  return { name: pool.name, season: pool.season, week: pool.closed_week, winners };
}

/**
 * Everything the hub's featured card needs: the pool, the week, your status
 * (join, alive, out, won, or watching), your pick this week, how many are
 * left, and the deadline (your team's kickoff, or the week's first game).
 */
export function featured(store, now, userId) {
  const state = survivorState(store, now);
  const { pool, current } = state;
  if (!pool || (!current && !pool.closed_at)) return { offseason: true, last: lastWinners(store) };
  const entry = entryOf(store, pool, userId);
  const { entered, left } = standings(store, pool, userId, now);
  const week = current?.week ?? pool.closed_week;
  const pick = entry && current ? pickFor(store, pool, userId, current.week) : null;
  const status = !entry ? 'none' : entry.won_at ? 'won' : entry.out_week ? 'out' : 'alive';
  const next = nextKickoff(current, now);
  const deadline = status === 'alive' && current
    ? pick && pick.result !== 'void' ? { at: pick.game.start, mine: true } : next ? { at: next, mine: false, first: next === current.first } : null
    : null;
  return {
    pool,
    week,
    current,
    status,
    outWeek: entry?.out_week ?? null,
    pick: pick && pick.result !== 'void' ? pick : null,
    entered,
    left,
    deadline,
    canJoin: canJoin(state, now),
    winners: pool.closed_at ? lastWinners(store)?.winners ?? [] : [],
  };
}
