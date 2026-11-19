// The March Madness bracket challenge: one free challenge a year for the
// NCAA men's tournament. A player fills all 63 games after the field is set
// and before the first Round of 64 tip. The First Four isn't picked: each
// of its four slots is a seed in a region, and a pick names the slot, so
// whoever wins the First Four game fills it.
//
// The bracket is a fixed tree. Games are numbered 0 to 62: the Round of 64
// is 0-31 (8 per region, in the usual 1-16, 8-9, 5-12, 4-13, 6-11, 3-14,
// 7-10, 2-15 order), the Round of 32 32-47, the Sweet 16 48-55, the Elite
// Eight 56-59, the Final Four 60-61 (region 1 against region 2, 3 against
// 4) and the title game 62. Every later game is fed by two before it.
//
// Scoring is ESPN's: 10, 20, 40, 80, 160, 320 a right pick by round. Ties
// go to the guess closest to the title game's total points, then to
// whoever saved first. "Possible max" is the points so far plus every
// undecided pick whose team is still alive.
//
// The field comes from ESPN's scoreboard (games whose notes read "Men's
// Basketball Championship - South Region - 1st Round", with seeds on the
// teams) as a draft, or from an admin at /admin/bracket, who can paste it
// or pick each team. Either way an admin confirms it (with the Final Four
// pairings, which the Round of 64 can't tell) before anyone fills a
// bracket. Results come from ESPN's finals, or an admin enters them; the
// admin path works with ESPN down.

import { checkBadges } from './badges.js';
import { cupYear, recordCup } from './cup.js';
import { SPORT } from './sports.js';
import { addDays, etDay, etToUtc } from './time.js';

export const ROUND_POINTS = [10, 20, 40, 80, 160, 320];
export const ROUND_NAMES = ['Round of 64', 'Round of 32', 'Sweet 16', 'Elite Eight', 'Final Four', 'Championship'];
export const GAMES = 63;
const COUNTS = [32, 16, 8, 4, 2, 1];
const OFFSETS = [0, 32, 48, 56, 60, 62];
/** Seeds that meet in the Round of 64, top of a region to the bottom. */
export const PAIRS = [[1, 16], [8, 9], [5, 12], [4, 13], [6, 11], [3, 14], [7, 10], [2, 15]];
export const MAX_POINTS = ROUND_POINTS.reduce((sum, p, r) => sum + p * COUNTS[r], 0);
export const TIEBREAK_MIN = 60;
export const TIEBREAK_MAX = 300;
export const TEAM_NAME_MAX = 40;
const NAME_MAX = 40;

/** The round a game is in, 0 (Round of 64) to 5 (the title game). */
export function roundOf(g) {
  for (let r = 5; r >= 0; r--) if (g >= OFFSETS[r]) return r;
  throw new Error(`no game ${g}`);
}

/** The games in a round, and in a region for rounds 0-3. */
export function gamesIn(round, region = null) {
  const list = Array.from({ length: COUNTS[round] }, (_, i) => OFFSETS[round] + i);
  if (region == null || round > 3) return list;
  const per = COUNTS[round] / 4;
  return list.slice(region * per, region * per + per);
}

/** The region a game is in (rounds 0-3), or null for the Final Four and the title game. */
export function regionOf(g) {
  const r = roundOf(g);
  return r > 3 ? null : Math.floor((g - OFFSETS[r]) / (COUNTS[r] / 4));
}

/** The two games whose winners meet in game g, or null in the Round of 64. */
export function feeders(g) {
  const r = roundOf(g);
  if (r === 0) return null;
  const i = g - OFFSETS[r];
  return [OFFSETS[r - 1] + 2 * i, OFFSETS[r - 1] + 2 * i + 1];
}

/** "2-11": a region (0-3) and a seed. */
export const slotKey = (region, seed) => `${region}-${seed}`;
const SLOT = /^([0-3])-(1[0-6]|[1-9])$/;
export const parseSlot = (key) => {
  const m = SLOT.exec(String(key ?? ''));
  return m ? { region: +m[1], seed: +m[2] } : null;
};

/** The two slots in a Round of 64 game. */
export function firstRoundSlots(g) {
  const region = regionOf(g);
  const [a, b] = PAIRS[(g - OFFSETS[0]) % 8];
  return [slotKey(region, a), slotKey(region, b)];
}

/**
 * Who's in game g, by `winners` (game -> slot: a player's picks, or the
 * results): two slots, either undefined when the game before isn't settled.
 */
export function participants(g, winners) {
  const f = feeders(g);
  return f ? [winners[f[0]], winners[f[1]]] : firstRoundSlots(g);
}

// ---- the challenge and its field ------------------------------------------------

/** "March Madness 2027" for a season year. */
export const defaultName = (year) => `March Madness ${year}`;

export function challengeFor(store, year) {
  const row = store.get('SELECT * FROM bracket_challenges WHERE year = ?', year);
  return row ? { ...row, regionNames: JSON.parse(row.regions) } : null;
}

/**
 * The challenge players see now: this year's (or next year's, from
 * November on) once it's opened. Null between seasons. With `drafts`
 * (admins), one not opened yet counts too.
 */
export function currentChallenge(store, now, { drafts = false } = {}) {
  const year = +etDay(now).slice(0, 4);
  for (const y of [year + 1, year]) {
    const c = challengeFor(store, y);
    if (c && (drafts || c.opened_at)) return c;
  }
  return null;
}

/** Make a year's challenge (an admin, or ESPN's field turning up). Safe to run again. */
export function ensureChallenge(store, year, now, { source = 'admin', regions = ['East', 'West', 'South', 'Midwest'] } = {}) {
  store.run(
    'INSERT OR IGNORE INTO bracket_challenges (year, name, regions, source, created_at) VALUES (?, ?, ?, ?, ?)',
    year, defaultName(year), JSON.stringify(regions), source, now.toISOString(),
  );
  return challengeFor(store, year);
}

/** The field: slot key -> { region, seed, name, abbr, logo, name2, ..., ff_winner, label }. */
export function fieldOf(store, year) {
  const out = new Map();
  for (const s of store.all('SELECT * FROM bracket_slots WHERE year = ? ORDER BY region, seed', year)) {
    out.set(slotKey(s.region, s.seed), { ...s, label: slotLabel(s) });
  }
  return out;
}

/** A slot's team as shown: its team, a decided First Four's winner, or "Texas / Xavier" until then. */
export function slotLabel(s) {
  if (!s) return 'TBD';
  if (!s.name2) return s.name;
  if (s.ff_winner === 1) return s.name;
  if (s.ff_winner === 2) return s.name2;
  return `${s.name} / ${s.name2}`;
}

const cleanTeam = (name) => {
  const t = String(name ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim();
  return t && [...t].length <= TEAM_NAME_MAX ? t : null;
};

/**
 * Check a field: 4 regions × 16 seeds, each slot one team (or two for a
 * First Four), no team twice. `slots` is [{ region, seed, name, name2?, ... }].
 * Returns { slots } tidied, or { error }.
 */
export function checkField(slots) {
  const seen = new Map();
  const names = new Set();
  for (const raw of slots) {
    const region = Number(raw.region);
    const seed = Number(raw.seed);
    if (!Number.isInteger(region) || region < 0 || region > 3 || !Number.isInteger(seed) || seed < 1 || seed > 16) return { error: 'Every team needs a region and a seed from 1 to 16.' };
    const key = slotKey(region, seed);
    if (seen.has(key)) return { error: `Two teams have the same region and seed (${seed}).` };
    const name = cleanTeam(raw.name);
    const name2 = raw.name2 ? cleanTeam(raw.name2) : null;
    if (!name || (raw.name2 && !name2)) return { error: `Give the ${seed} seed a team name of up to ${TEAM_NAME_MAX} characters.` };
    for (const n of [name, name2].filter(Boolean)) {
      if (names.has(n.toLowerCase())) return { error: `${n} is in the field twice.` };
      names.add(n.toLowerCase());
    }
    seen.set(key, { ...raw, region, seed, name, name2 });
  }
  if (seen.size !== 64) return { error: `The field has ${seen.size} of 64 teams. Every region needs seeds 1 to 16.` };
  const firstFour = [...seen.values()].filter((s) => s.name2).length;
  if (firstFour > 4) return { error: 'Only four slots can have a First Four pair.' };
  return { slots: [...seen.values()] };
}

/**
 * Write a year's field, replacing what was there. Picks name slots, so
 * brackets already saved keep their meaning. Not after the lock.
 */
export function saveField(store, c, slots, now) {
  if (c.locks_at && now >= new Date(c.locks_at)) return { error: "The brackets are locked, so the field can't change." };
  const checked = checkField(slots);
  if (checked.error) return checked;
  store.tx(() => {
    store.run('DELETE FROM bracket_slots WHERE year = ?', c.year);
    for (const s of checked.slots) {
      store.run(
        `INSERT INTO bracket_slots (year, region, seed, name, abbr, espn_id, logo, name2, abbr2, espn_id2, logo2)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        c.year, s.region, s.seed, s.name, s.abbr ?? null, s.espnId ?? null, s.logo ?? null,
        s.name2 ?? null, s.abbr2 ?? null, s.espnId2 ?? null, s.logo2 ?? null,
      );
    }
  });
  return { ok: true };
}

/**
 * The field as pasted by an admin, one team a line: "South, 1, Duke" or
 * "South, 16, Howard / Wagner" for a First Four pair. Region names must be
 * the challenge's. Returns { slots } or { error } naming the line.
 */
export function parsePastedField(text, regionNames) {
  const regions = regionNames.map((r) => r.toLowerCase());
  const slots = [];
  const lines = String(text ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const [i, line] of lines.entries()) {
    const parts = line.split(/\t|,/).map((p) => p.trim());
    if (parts.length < 3) return { error: `Line ${i + 1}: write it as Region, Seed, Team.` };
    const region = regions.indexOf(parts[0].replace(/\s+region$/i, '').toLowerCase());
    if (region < 0) return { error: `Line ${i + 1}: "${parts[0]}" isn't one of the regions (${regionNames.join(', ')}).` };
    const seed = Number(parts[1]);
    const [name, name2] = parts.slice(2).join(', ').split('/').map((p) => p.trim());
    slots.push({ region, seed, name, name2: name2 || null });
  }
  return checkField(slots);
}

/**
 * Set the regions (names in Final Four order) and the lock, and open the
 * challenge to players: an admin confirming the field. Needs all 64 slots.
 */
export function openChallenge(store, c, { regions, locksAt, userId, now }) {
  const names = regions.map((r) => String(r ?? '').trim()).filter(Boolean);
  if (names.length !== 4 || new Set(names.map((n) => n.toLowerCase())).size !== 4 || names.some((n) => n.length > 20)) {
    return { error: 'Name four different regions, up to 20 characters each.' };
  }
  if (!locksAt || Number.isNaN(+locksAt)) return { error: 'Set when the brackets lock: the first Round of 64 tip.' };
  if (store.get('SELECT COUNT(*) AS n FROM bracket_slots WHERE year = ?', c.year).n !== 64) return { error: 'Fill all 64 slots first.' };
  store.run(
    'UPDATE bracket_challenges SET regions = ?, locks_at = ?, opened_at = COALESCE(opened_at, ?), opened_by = COALESCE(opened_by, ?) WHERE year = ?',
    JSON.stringify(names), locksAt.toISOString(), now.toISOString(), userId, c.year,
  );
  return { ok: true };
}

/** Whether brackets are locked: the first Round of 64 game has tipped. */
export const isLocked = (c, now) => Boolean(c?.locks_at && now >= new Date(c.locks_at));

// ---- picks --------------------------------------------------------------------------

export function entryOf(store, year, userId) {
  if (userId == null) return null;
  const row = store.get('SELECT * FROM bracket_entries WHERE year = ? AND user_id = ?', year, userId);
  return row ? { ...row, picks: parsePicks(row.picks) } : null;
}

function parsePicks(text) {
  try {
    const raw = JSON.parse(text);
    const out = {};
    for (let g = 0; g < GAMES; g++) if (parseSlot(raw[g])) out[g] = raw[g];
    return out;
  } catch {
    return {};
  }
}

/**
 * Drop any pick that no longer fits: a later pick on a team the player no
 * longer has winning the game before. Runs in game order, so it cascades.
 */
export function consistent(picks) {
  const out = { ...picks };
  for (let g = 0; g < GAMES; g++) {
    if (out[g] == null) continue;
    if (!participants(g, out).includes(out[g])) delete out[g];
  }
  return out;
}

/**
 * Save picks: `updates` is { game: slot } (any number, a round's or all 63),
 * applied in game order; each must be one of that game's two teams by the
 * player's own earlier picks. Changing a pick drops later picks that rode
 * on the old team. `tiebreak` (the title game's total points) is optional.
 * Only once the challenge is open and before the lock. Returns { ok,
 * picked, dropped, notes } or { error }.
 */
export function savePicks(store, c, { userId, updates = {}, tiebreak, now }) {
  if (!c?.opened_at) return { error: "The bracket challenge isn't open yet. It opens on Selection Sunday." };
  if (isLocked(c, now)) return { error: 'Brackets are locked. The Round of 64 has started.' };
  if (store.get('SELECT official FROM users WHERE id = ?', userId)?.official) return { error: "The official account doesn't fill a bracket." };
  const before = entryOf(store, c.year, userId)?.picks ?? {};
  let picks = { ...before };
  const notes = [];
  for (const g of Object.keys(updates).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < GAMES).sort((a, b) => a - b)) {
    const slot = updates[g];
    if (slot === '' || slot == null) continue;
    if (!participants(g, picks).includes(slot)) {
      notes.push(`Some ${ROUND_NAMES[roundOf(g)]} picks need the round before picked first.`);
      continue;
    }
    picks[g] = slot;
    picks = consistent(picks);
  }
  let tb = null;
  if (tiebreak != null && String(tiebreak).trim() !== '') {
    tb = Number(tiebreak);
    if (!Number.isInteger(tb) || tb < TIEBREAK_MIN || tb > TIEBREAK_MAX) return { error: `Guess the title game's total points: a whole number from ${TIEBREAK_MIN} to ${TIEBREAK_MAX}.` };
  }
  const at = now.toISOString();
  store.run(
    `INSERT INTO bracket_entries (year, user_id, picks, tiebreak, created_at, saved_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (year, user_id) DO UPDATE SET picks = excluded.picks, tiebreak = COALESCE(excluded.tiebreak, bracket_entries.tiebreak), saved_at = excluded.saved_at`,
    c.year, userId, JSON.stringify(picks), tb, at, at,
  );
  const dropped = Object.keys(before).filter((g) => picks[g] == null && updates[g] == null).length;
  return { ok: true, picked: Object.keys(picks).length, dropped, notes: [...new Set(notes)] };
}

// ---- results and scoring ---------------------------------------------------------

/** game -> winning slot, for the decided games. */
export function resultsOf(store, year) {
  return Object.fromEntries(store.all('SELECT game, winner FROM bracket_results WHERE year = ?', year).map((r) => [r.game, r.winner]));
}

/** Slots knocked out: the loser of every decided game. */
export function eliminated(results) {
  const out = new Set();
  for (const [g, winner] of Object.entries(results)) {
    for (const s of participants(Number(g), results)) if (s && s !== winner) out.add(s);
  }
  return out;
}

/**
 * A bracket's score: { points, max, correct: [per round], picked }. Max is
 * the points so far plus every undecided pick whose team hasn't lost.
 */
export function scoreBracket(picks, results, out = eliminated(results)) {
  let points = 0;
  let max = 0;
  const correct = [0, 0, 0, 0, 0, 0];
  for (let g = 0; g < GAMES; g++) {
    const r = roundOf(g);
    const pick = picks[g];
    if (!pick) continue;
    if (results[g] != null) {
      if (results[g] === pick) {
        points += ROUND_POINTS[r];
        correct[r] += 1;
      }
    } else if (!out.has(pick)) {
      max += ROUND_POINTS[r];
    }
  }
  return { points, max: points + max, correct, picked: Object.keys(picks).length };
}

/**
 * Record a game's winner (ESPN's final or an admin), once per game unless
 * `replace` (an admin fixing one). The winner must be one of the two teams
 * the results so far put in that game. The title game also takes its total.
 */
export function recordResult(store, c, { game, winner, score = null, total = null, source, now, replace = false }) {
  const g = Number(game);
  if (!Number.isInteger(g) || g < 0 || g >= GAMES) return { error: 'No such game.' };
  const results = resultsOf(store, c.year);
  const teams = participants(g, results);
  if (!teams.includes(winner)) return { error: 'Pick one of the two teams in that game.' };
  // Fixing a game drops any later result that rode on the old winner.
  const sql = replace
    ? 'INSERT INTO bracket_results (year, game, winner, score, source, decided_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (year, game) DO UPDATE SET winner = excluded.winner, score = excluded.score, source = excluded.source, decided_at = excluded.decided_at'
    : 'INSERT OR IGNORE INTO bracket_results (year, game, winner, score, source, decided_at) VALUES (?, ?, ?, ?, ?, ?)';
  const { changes } = store.run(sql, c.year, g, winner, score, source, now.toISOString());
  if (replace && changes) {
    const after = resultsOf(store, c.year);
    for (let later = g + 1; later < GAMES; later++) {
      if (after[later] != null && !participants(later, after).includes(after[later])) {
        store.run('DELETE FROM bracket_results WHERE year = ? AND game = ?', c.year, later);
        delete after[later];
      }
    }
  }
  if (g === GAMES - 1 && total != null && Number.isInteger(Number(total))) {
    store.run('UPDATE bracket_challenges SET title_total = ? WHERE year = ?', Number(total), c.year);
  }
  return { ok: true, changed: changes > 0 };
}

/** A First Four game's winner: 1 or 2 (the slot's first or second team). */
export function recordFirstFour(store, c, { slot, winner }) {
  const s = parseSlot(slot);
  if (!s || ![1, 2].includes(Number(winner))) return { error: 'Pick a First Four winner.' };
  const { changes } = store.run('UPDATE bracket_slots SET ff_winner = ? WHERE year = ? AND region = ? AND seed = ? AND name2 IS NOT NULL', Number(winner), c.year, s.region, s.seed);
  return changes ? { ok: true } : { error: "That slot has no First Four game." };
}

/**
 * The standings: every bracket with picks, { id, screen_name, points, max,
 * correct, picked, tiebreak, champion (slot), rank }. Points first, then the
 * tiebreak (closest to the title game's total, once known), then whoever
 * saved first. Confirmed players only, like the boards.
 */
export function bracketStandings(store, c) {
  const results = resultsOf(store, c.year);
  const out = eliminated(results);
  const rows = store.all(
    `SELECT u.id, u.screen_name, u.official, e.picks, e.tiebreak, e.saved_at, e.place FROM bracket_entries e JOIN users u ON u.id = e.user_id
      WHERE e.year = ? AND u.screen_name IS NOT NULL AND u.email_verified_at IS NOT NULL AND u.official = 0`,
    c.year,
  ).map((r) => {
    const picks = parsePicks(r.picks);
    return { id: r.id, screen_name: r.screen_name, official: false, tiebreak: r.tiebreak, saved_at: r.saved_at, place: r.place, champion: picks[GAMES - 1] ?? null, ...scoreBracket(picks, results, out) };
  }).filter((r) => r.picked > 0);
  const diff = (r) => (c.title_total == null || r.tiebreak == null ? Infinity : Math.abs(r.tiebreak - c.title_total));
  rows.sort((a, b) => b.points - a.points || diff(a) - diff(b) || b.max - a.max || a.saved_at.localeCompare(b.saved_at) || a.id - b.id);
  // Equal points and an equal tiebreak share a place.
  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    r.rank = prev && prev.points === r.points && diff(prev) === diff(r) && diff(r) !== Infinity ? prev.rank : i + 1;
  });
  return rows;
}

/**
 * Close a challenge once the title game is decided and its total known:
 * places written on the entries, Cup points by finish, the Bracket champion
 * badge, and notes. Returns the top 3, or null.
 */
export function closeChallenge(store, c, now, notifier = null) {
  const results = resultsOf(store, c.year);
  if (results[GAMES - 1] == null || c.title_total == null || c.closed_at) return null;
  const rows = bracketStandings(store, c);
  const claimed = store.tx(() => {
    if (!store.run('UPDATE bracket_challenges SET closed_at = ? WHERE year = ? AND closed_at IS NULL', now.toISOString(), c.year).changes) return false;
    for (const r of rows) store.run('UPDATE bracket_entries SET place = ?, points = ? WHERE year = ? AND user_id = ?', r.rank, r.points, c.year, r.id);
    return true;
  });
  if (!claimed) return null;
  recordCup(store, { source: 'bracket', ref: c.year, year: cupYear(now), label: c.name, rows: rows.map((r) => ({ id: r.id, place: r.rank })), now });
  const top = rows.filter((r) => r.rank <= 3);
  const winners = rows.filter((r) => r.rank === 1).map((r) => r.screen_name);
  for (const r of rows) {
    const text = r.rank <= 3
      ? `You finished #${r.rank} in ${c.name} (${r.points} pts).`
      : `${c.name} is final: ${winners.join(' and ')} won it. You finished #${r.rank} (${r.points} pts).`;
    notifier?.tell(r.id, { kind: 'bracket', text, url: '/bracket?view=standings' }, now);
  }
  checkBadges(store, top.map((r) => r.id), now, notifier);
  return top;
}

// ---- ESPN ------------------------------------------------------------------------

const ROUND_WORDS = [
  ['ff', /first four/i],
  [0, /1st round|first round|round of 64/i],
  [1, /2nd round|second round|round of 32/i],
  [2, /sweet 16|sweet sixteen|regional semifinal/i],
  [3, /elite 8|elite eight|regional final/i],
  [4, /final four|national semifinal/i],
  [5, /national championship|championship game|title game/i],
];

/**
 * What a game's note says about the tournament: { round, region } for the
 * men's championship, else null. "Men's Basketball Championship - South
 * Region - 1st Round" -> { round: 0, region: 'South' }. The First Four is
 * round 'ff'. NIT and women's games are left out.
 */
export function tournamentNote(note) {
  const text = String(note ?? '');
  if (!/men's basketball championship/i.test(text) || /women/i.test(text) || /\bNIT\b/.test(text)) return null;
  const found = ROUND_WORDS.find(([, re]) => re.test(text.replace(/men's basketball championship/i, '')));
  if (!found) return null;
  const region = /-\s*([A-Za-z ]{2,20}?)\s+Region\b/i.exec(text)?.[1]?.trim() ?? null;
  return { round: found[0], region };
}

const isTbd = (t) => !t || !t.name || /^tbd$/i.test(t.name) || /^tbd$/i.test(t.abbr ?? '');

/**
 * Assemble the field from ESPN's tournament games (parsed scoreboard games,
 * with `note` and each team's `seed`). Round of 64 games give two slots each;
 * a slot whose team is still "TBD" is filled from its First Four game.
 * Returns { slots, regions, locksAt, problems }: `problems` lists anything
 * that didn't add up (a seed missing, seeds that don't make 17, a region
 * that isn't 16 teams), so an admin knows what to fix.
 */
export function assembleField(games) {
  const problems = [];
  const regions = [];
  const slots = new Map();
  const firstFour = new Map();
  let locksAt = null;
  const teamOf = (t) => ({ name: t.name, abbr: t.abbr || null, espnId: t.espnId ?? null, logo: t.logo ?? null });
  const sorted = [...games].sort((a, b) => a.start.localeCompare(b.start));
  for (const g of sorted) {
    const note = tournamentNote(g.note);
    if (!note || (note.round !== 'ff' && note.round !== 0)) continue;
    if (!note.region) {
      problems.push(`${g.away.name} vs ${g.home.name}: no region in "${g.note}".`);
      continue;
    }
    if (!regions.includes(note.region)) regions.push(note.region);
    const region = regions.indexOf(note.region);
    if (note.round === 'ff') {
      const seed = g.home.seed ?? g.away.seed;
      if (!seed || (g.home.seed && g.away.seed && g.home.seed !== g.away.seed)) {
        problems.push(`First Four ${g.away.name} vs ${g.home.name}: the seeds don't match.`);
        continue;
      }
      firstFour.set(slotKey(region, seed), [teamOf(g.home), teamOf(g.away)]);
      continue;
    }
    if (!locksAt || g.start < locksAt) locksAt = g.start;
    const [a, b] = [g.home, g.away];
    const known = [a, b].filter((t) => !isTbd(t) && t.seed);
    const pairSeeds = a.seed && b.seed ? [a.seed, b.seed] : null;
    if (pairSeeds && pairSeeds[0] + pairSeeds[1] !== 17) {
      problems.push(`${b.name} vs ${a.name}: seeds ${pairSeeds.join(' and ')} don't meet in the Round of 64.`);
      continue;
    }
    for (const t of [a, b]) {
      const seed = t.seed ?? (a === t ? (b.seed ? 17 - b.seed : null) : (a.seed ? 17 - a.seed : null));
      if (!seed) {
        problems.push(`${t.name || 'A team'} in the ${note.region}: no seed.`);
        continue;
      }
      if (!known.includes(t) && isTbd(t)) {
        slots.set(slotKey(region, seed), slots.get(slotKey(region, seed)) ?? { region, seed, tbd: true });
        continue;
      }
      slots.set(slotKey(region, seed), { region, seed, ...teamOf(t) });
    }
  }
  // A First Four game fills its slot: both teams until it's played.
  for (const [key, [x, y]] of firstFour) {
    const s = parseSlot(key);
    const now = slots.get(key);
    if (now && !now.tbd && ![x.name, y.name].includes(now.name)) continue;
    slots.set(key, { region: s.region, seed: s.seed, name: x.name, abbr: x.abbr, espnId: x.espnId, logo: x.logo, name2: y.name, abbr2: y.abbr, espnId2: y.espnId, logo2: y.logo });
  }
  for (const [key, s] of slots) if (s.tbd) problems.push(`The ${s.seed} seed in the ${regions[s.region]}: still TBD and no First Four game found.`);
  if (regions.length !== 4) problems.push(`Found ${regions.length} regions, not 4.`);
  const list = [...slots.values()].filter((s) => !s.tbd);
  if (list.length !== 64) problems.push(`Found ${list.length} of 64 teams.`);
  return { slots: list, regions, locksAt, problems };
}

/** Which slot a team from ESPN is, by ESPN id, then name, then abbreviation: { key, which } or null. */
function slotFinder(field) {
  const index = new Map();
  const norm = (s) => String(s ?? '').trim().toLowerCase();
  for (const [key, s] of field) {
    for (const [which, id, name, abbr] of [[1, s.espn_id, s.name, s.abbr], [2, s.espn_id2, s.name2, s.abbr2]]) {
      if (!name) continue;
      if (id) index.set(`id:${id}`, { key, which });
      index.set(`name:${norm(name)}`, { key, which });
      if (abbr) index.set(`abbr:${norm(abbr)}`, index.get(`abbr:${norm(abbr)}`) ? null : { key, which });
    }
  }
  return (t) => (t.espnId && index.get(`id:${t.espnId}`)) || index.get(`name:${norm(t.name)}`) || index.get(`name:${norm(t.short)}`) || index.get(`abbr:${norm(t.abbr)}`) || null;
}

/**
 * Grade from ESPN's finals: First Four games fill their slot, every other
 * tournament game finds its spot in the tree by its two teams. Games go in
 * start order, so a round is in before the next. Returns how many results
 * were new.
 */
export function gradeFromGames(store, c, games, now) {
  const field = fieldOf(store, c.year);
  const find = slotFinder(field);
  let added = 0;
  for (const g of [...games].sort((a, b) => a.start.localeCompare(b.start))) {
    if (g.state !== 'post' || !g.completed || g.home.score == null || g.away.score == null) continue;
    const note = tournamentNote(g.note);
    if (!note) continue;
    const [h, a] = [find(g.home), find(g.away)];
    if (!h || !a) continue;
    const homeWon = g.home.score > g.away.score;
    if (note.round === 'ff') {
      if (h.key === a.key) {
        const slot = field.get(h.key);
        if (slot.ff_winner == null) {
          recordFirstFour(store, c, { slot: h.key, winner: homeWon ? h.which : a.which });
          added += 1;
        }
      }
      continue;
    }
    const results = resultsOf(store, c.year);
    const game = Array.from({ length: GAMES }, (_, i) => i).find((i) => results[i] == null && (() => {
      const p = participants(i, results);
      return p.includes(h.key) && p.includes(a.key);
    })());
    if (game == null) continue;
    const res = recordResult(store, c, {
      game, winner: homeWon ? h.key : a.key, score: `${Math.max(g.home.score, g.away.score)}-${Math.min(g.home.score, g.away.score)}`,
      total: game === GAMES - 1 ? g.home.score + g.away.score : null, source: 'espn', now,
    });
    if (res.changed) added += 1;
  }
  return added;
}

/**
 * The timer job. In March and early April: look for the field (a draft
 * challenge for an admin to confirm) until the challenge is open, and grade
 * finals once it's locked, from ESPN's men's college basketball scoreboard.
 * ESPN being down just means trying again next time. Then close the
 * challenge if the title game is in. Returns { found, graded, closed }.
 */
export async function syncBracket(store, espn, now, { notifier = null, log = console, days = 3 } = {}) {
  const out = { found: false, graded: 0, closed: null };
  const month = +etDay(now).slice(4, 6);
  const year = +etDay(now).slice(0, 4);
  let c = challengeFor(store, year);
  const season = month === 3 || (month === 4 && +etDay(now).slice(6, 8) <= 15);
  if (espn && season) {
    try {
      const today = etDay(now);
      if (!c?.opened_at) {
        const games = await espn.scoreboard(SPORT.ncaab, today, addDays(today, 5));
        const draft = assembleField(games);
        if (draft.slots.length) {
          c = ensureChallenge(store, year, now, { source: 'espn', regions: draft.regions.length === 4 ? draft.regions : undefined });
          if (!c.opened_at && draft.problems.length === 0) {
            saveField(store, c, draft.slots, now);
            if (draft.locksAt && !c.locks_at) store.run('UPDATE bracket_challenges SET locks_at = ? WHERE year = ?', draft.locksAt, year);
          }
          out.found = true;
        }
      } else if (isLocked(c, now) && !c.closed_at) {
        const games = await espn.scoreboard(SPORT.ncaab, addDays(today, -(days - 1)), today);
        out.graded = gradeFromGames(store, c, games, now);
      }
    } catch (err) {
      log.warn?.(`bracket: ${err.message}`);
    }
  }
  c = c && challengeFor(store, c.year);
  if (c?.opened_at && !c.closed_at) out.closed = closeChallenge(store, c, now, notifier);
  return out;
}

/**
 * An admin's "Look on ESPN": the field from the tournament's first days
 * (Selection Sunday to the Round of 64), saved as a draft unless the
 * challenge is already open. Returns the draft with its problems.
 */
export async function fetchField(store, espn, c, now) {
  const from = c.locks_at ? addDays(etDay(new Date(c.locks_at)), -3) : etDay(now);
  const games = await espn.scoreboard(SPORT.ncaab, from, addDays(from, 6));
  const draft = assembleField(games);
  if (draft.slots.length === 64 && !c.opened_at) {
    if (draft.regions.length === 4) store.run('UPDATE bracket_challenges SET regions = ? WHERE year = ?', JSON.stringify(draft.regions), c.year);
    const saved = saveField(store, c, draft.slots, now);
    if (saved.error) draft.problems.push(saved.error);
    if (draft.locksAt) store.run('UPDATE bracket_challenges SET locks_at = ? WHERE year = ?', draft.locksAt, c.year);
  }
  return draft;
}

/** The Eastern date and time to an instant for the lock: "2027-03-18", "12:15". */
export function lockInstant(date, time) {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date ?? ''));
  const t = /^(\d{1,2}):(\d{2})$/.exec(String(time ?? ''));
  if (!d || !t || +t[1] > 23 || +t[2] > 59) return null;
  try {
    return etToUtc(`${d[1]}${d[2]}${d[3]}`, +t[1], +t[2]);
  } catch {
    return null;
  }
}

/** The hub card: the challenge, your bracket's state and place. Null between seasons. */
export function featured(store, now, userId) {
  const c = currentChallenge(store, now);
  if (!c) return null;
  const entry = entryOf(store, c.year, userId);
  const rows = isLocked(c, now) ? bracketStandings(store, c) : null;
  return {
    c,
    locked: isLocked(c, now),
    picked: entry ? Object.keys(entry.picks).length : 0,
    entries: store.get('SELECT COUNT(*) AS n FROM bracket_entries WHERE year = ?', c.year).n,
    row: rows?.find((r) => r.id === userId) ?? null,
    winner: c.closed_at ? rows?.filter((r) => r.rank === 1).map((r) => r.screen_name) ?? [] : null,
  };
}

/** Team names an admin can pick from: the college programs ESPN's team list has, and every college basketball team the board has seen. */
export function collegeTeams(store) {
  const names = new Set();
  for (const r of store.all("SELECT name FROM team_catalog WHERE source = 'ncaab'")) names.add(r.name);
  for (const r of store.all("SELECT DISTINCT home_name AS n FROM games WHERE sport = 'ncaab' UNION SELECT DISTINCT away_name FROM games WHERE sport = 'ncaab'")) names.add(r.n);
  return [...names].filter(Boolean).sort((a, b) => a.localeCompare(b));
}

/** "Duke" -> its abbreviation and logo, if the catalog or the board knows it. */
export function teamDetails(store, name) {
  const cat = store.get("SELECT abbr, logo FROM team_catalog WHERE source = 'ncaab' AND name = ?", name);
  if (cat) return cat;
  const g = store.get(
    `SELECT CASE WHEN home_name = ? THEN home_abbr ELSE away_abbr END AS abbr, CASE WHEN home_name = ? THEN home_logo ELSE away_logo END AS logo
       FROM games WHERE sport = 'ncaab' AND (home_name = ? OR away_name = ?) LIMIT 1`,
    name, name, name, name,
  );
  return g ?? { abbr: null, logo: null };
}

export { NAME_MAX };
