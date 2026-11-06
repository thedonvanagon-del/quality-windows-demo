// Head-to-head leagues. Free, like every tournament: 4 to 16 players, a
// regular season of weekly matchups, then a single-elimination playoff.
//
// - Any confirmed player makes one (two going at once; admins no limit):
//   public (listed, with a Join button) or private (an invite link), and
//   optionally for one group or local room's members, like player-made
//   tournaments. It picks its sports (or all), 3 to 10 regular-season
//   weeks, a playoff of 2, 4 or 8, and the week it starts. A week is the
//   weekly contest's: Monday to Sunday, Eastern.
// - Joining closes when week 1 starts. Then the league starts: under 4
//   players it's canceled and everyone hears why; otherwise a round-robin
//   schedule is made once, from the members in the order they joined, and
//   stored. With an odd count, one player has a bye each week.
// - A matchup is units won on graded bets (picks and parlays, through BETS)
//   on games in the league's sports that started that week. More units wins;
//   the same units is a tie. No graded bets is 0.
// - Standings: win share (a tie is half a win), then total units, then who
//   joined first. After the regular season the top N are seeded 1 to N into
//   a bracket, 1 against N; one round a week; a tied playoff matchup goes to
//   the higher seed. The champion gets a badge and Cup points.
//
// Weeks settle once, the same way the weekly contest closes: after the week
// ends, when every counted bet is graded, by Tuesday 6 AM ET at the latest.
// Nothing provisional is written; the live view grades games in progress at
// the current score, like a tournament's "As it stands".

import crypto from 'node:crypto';

import { checkBadges } from './badges.js';
import { dueToClose, openBetsIn, weekBounds, windowStandings } from './contest.js';
import { cupYear, PLAYER_MADE_MIN, recordCup } from './cup.js';
import { formatUnits } from './picks.js';
import { SPORT } from './sports.js';
import { addDays, mondayOf, weekLabel } from './time.js';
import { cleanTournamentName, groupChoices, provisional } from './tournaments.js';

export const LEAGUE_MIN = 4;
export const LEAGUE_MAX = 16;
export const LEAGUE_ACTIVE_MAX = 2;
export const WEEKS_MIN = 3;
export const WEEKS_MAX = 10;
export const PLAYOFF_SIZES = [2, 4, 8];
// How many Mondays ahead the form offers as a start.
export const START_CHOICES = 8;

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from(crypto.randomBytes(8), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
const round2 = (n) => Math.round(n * 100) / 100;
const signed = (n) => formatUnits(round2(n), { sign: true }).replace(/^-/, '−');
const ordinal = (n) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;

/** A league's sport keys, or null for all of them. */
export const leagueSports = (l) => (l.sports ? l.sports.split(',').filter((k) => SPORT[k]) : null);

/** How many playoff rounds: 1 for 2 players, 2 for 4, 3 for 8. */
export const playoffRounds = (size) => Math.log2(size);

/** The Monday a league week starts (week 1 is start_week). */
export const weekMonday = (l, week) => addDays(l.start_week, 7 * (week - 1));

/** The instant week 1 starts: joining closes then. */
export const startsAt = (l) => weekBounds(l.start_week).start;

/** The last week of the season: the regular weeks, then one week per playoff round. */
export const lastWeek = (l) => l.regular_weeks + playoffRounds(l.playoff_size);

/** A league week as a standings window for its members. */
function weekWindow(l, week, userIds) {
  const { start, end } = weekBounds(weekMonday(l, week));
  return { start, end, sports: leagueSports(l), userIds, min: 1 };
}

/** The league week `now` falls in (1-based; 0 or less before it starts), whatever the league's length. */
export function weekAt(l, now) {
  const monday = mondayOf(now);
  let k = 1;
  for (let m = l.start_week; m < monday; m = addDays(m, 7)) k += 1;
  if (monday < l.start_week) {
    k = 1;
    for (let m = monday; m < l.start_week; m = addDays(m, 7)) k -= 1;
  }
  return k;
}

/** 'open' (joining), 'regular', 'playoffs', 'final', or 'canceled'. */
export function leaguePhase(l, now) {
  if (l.canceled_at) return 'canceled';
  if (l.closed_at) return 'final';
  if (!l.started_at && now < startsAt(l)) return 'open';
  return weekAt(l, now) > l.regular_weeks ? 'playoffs' : 'regular';
}

export const leagueById = (store, id) => store.get('SELECT * FROM leagues WHERE id = ?', Number(id) || 0) ?? null;

export function leagueByCode(store, code) {
  const clean = String(code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return clean ? store.get('SELECT * FROM leagues WHERE invite_code = ? AND canceled_at IS NULL', clean) ?? null : null;
}

/** Members in the order they joined: { id, screen_name, joined_at, seed }. */
export function membersOf(store, l) {
  return store.all(
    `SELECT u.id, u.screen_name, u.official, m.joined_at, m.seed FROM league_members m JOIN users u ON u.id = m.user_id
      WHERE m.league_id = ? ORDER BY m.joined_at, u.id`,
    l.id,
  );
}

export const memberCount = (store, l) => store.get('SELECT COUNT(*) AS n FROM league_members WHERE league_id = ?', l.id).n;
export const isMemberOf = (store, l, userId) => userId != null && Boolean(store.get('SELECT 1 AS x FROM league_members WHERE league_id = ? AND user_id = ?', l.id, userId));

const inGroup = (store, groupId, userId) => groupId != null && userId != null
  && Boolean(store.get('SELECT 1 AS x FROM group_members WHERE group_id = ? AND user_id = ?', groupId, userId));

/** The next Mondays a new league can start on: { monday, label }, next week first. */
export function startChoices(now) {
  const next = addDays(mondayOf(now), 7);
  return Array.from({ length: START_CHOICES }, (_, i) => {
    const monday = addDays(next, 7 * i);
    return { monday, label: weekLabel(monday) };
  });
}

/**
 * Make a league. The maker is in it. Two going at once (not canceled or
 * final) unless `limit` is false (admins). Returns { id, code } or { error }.
 */
export function createLeague(store, { name, sports = [], startWeek, regularWeeks, playoffSize, visibility, groupId = null, userId, now, limit = true }) {
  const clean = cleanTournamentName(name);
  if (clean.error) return clean;
  const keys = [...new Set(sports)].filter(Boolean);
  if (keys.some((k) => !SPORT[k])) return { error: 'Pick sports from the list.' };
  const weeks = Number(regularWeeks);
  if (!Number.isInteger(weeks) || weeks < WEEKS_MIN || weeks > WEEKS_MAX) return { error: `Pick ${WEEKS_MIN} to ${WEEKS_MAX} regular-season weeks.` };
  const size = Number(playoffSize);
  if (!PLAYOFF_SIZES.includes(size)) return { error: 'Pick a playoff of 2, 4 or 8.' };
  if (!startChoices(now).some((c) => c.monday === startWeek)) return { error: 'Pick a start week from the list.' };
  if (!['public', 'private'].includes(visibility)) return { error: 'Pick Public or Private.' };
  let group = null;
  if (groupId != null && groupId !== '') {
    group = groupChoices(store, userId).find((g) => g.id === Number(groupId)) ?? null;
    if (!group) return { error: "Pick a group or room you're in." };
  }
  if (limit) {
    const going = store.get('SELECT COUNT(*) AS n FROM leagues WHERE created_by = ? AND canceled_at IS NULL AND closed_at IS NULL', userId).n;
    if (going >= LEAGUE_ACTIVE_MAX) return { error: `You can have ${LEAGUE_ACTIVE_MAX} leagues going at once. Start another when one ends.` };
  }
  const at = now.toISOString();
  return store.tx(() => {
    let code = newCode();
    while (store.get('SELECT 1 AS x FROM leagues WHERE invite_code = ?', code)) code = newCode();
    const id = Number(store.run(
      `INSERT INTO leagues (name, sports, start_week, regular_weeks, playoff_size, visibility, invite_code, group_id, members_only, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      clean.name, keys.length ? keys.join(',') : null, startWeek, weeks, size, visibility, code, group?.id ?? null, group ? 1 : 0, userId, at,
    ).lastInsertRowid);
    store.run('INSERT INTO league_members (league_id, user_id, joined_at) VALUES (?, ?, ?)', id, userId, at);
    return { id, code };
  });
}

/** Why this player can't join, or null. */
function joinProblem(store, l, userId, now, code) {
  const user = store.get('SELECT official, email_verified_at FROM users WHERE id = ?', userId);
  if (user?.official) return "The official account doesn't play in leagues.";
  if (!user?.email_verified_at) return 'Confirm your email to join a league. The link is in your inbox.';
  if (l.canceled_at) return 'This league was canceled.';
  if (l.started_at || now >= startsAt(l)) return 'Joining closed when Week 1 started.';
  if (memberCount(store, l) >= LEAGUE_MAX) return `This league is full (${LEAGUE_MAX} players).`;
  if (l.members_only && !inGroup(store, l.group_id, userId)) return 'Only members of its group can join this league.';
  if (l.visibility === 'private' && String(code ?? '').toUpperCase() !== l.invite_code) return 'Use the invite link to join this league.';
  return null;
}

export function joinLeague(store, l, userId, now, { code = null } = {}) {
  if (isMemberOf(store, l, userId)) return { ok: true, joined: false };
  const problem = joinProblem(store, l, userId, now, code);
  if (problem) return { error: problem };
  store.run('INSERT OR IGNORE INTO league_members (league_id, user_id, joined_at) VALUES (?, ?, ?)', l.id, userId, now.toISOString());
  return { ok: true, joined: true };
}

/** Leave before week 1 starts. The maker stays. */
export function leaveLeague(store, l, userId, now) {
  if (l.created_by === userId) return { error: 'You made this league, so you stay in it.' };
  if (l.started_at || now >= startsAt(l)) return { error: "It's started, so you're in until the end." };
  store.run('DELETE FROM league_members WHERE league_id = ? AND user_id = ?', l.id, userId);
  return { ok: true };
}

/**
 * Who may see a league: admins, members, and its maker always; otherwise not
 * a canceled one, a private one without its code, or one for a private group
 * the viewer isn't in.
 */
export function canSeeLeague(store, l, { userId = null, admin = false, code = null } = {}) {
  if (admin || isMemberOf(store, l, userId) || (userId != null && l.created_by === userId)) return true;
  if (l.canceled_at) return false;
  const viaCode = code != null && String(code).toUpperCase() === l.invite_code;
  if (l.visibility === 'private' && !viaCode) return false;
  if (l.group_id != null && !viaCode) {
    const kind = store.get('SELECT kind FROM friend_groups WHERE id = ?', l.group_id)?.kind;
    if (kind !== 'local' && !inGroup(store, l.group_id, userId)) return false;
  }
  return true;
}

// ---- the schedule ----------------------------------------------------------------

/**
 * A round-robin for `weeks` weeks: [[a, b], ...] per week, b null for a bye.
 * The circle method: the first player stays put and the rest turn one place
 * a week, so in n-1 weeks everyone meets everyone once (n even; an odd count
 * gets a bye seat). Past n-1 weeks it starts over. Same input, same schedule.
 */
export function roundRobin(ids, weeks) {
  const seats = ids.length % 2 ? [...ids, null] : [...ids];
  const n = seats.length;
  const rounds = n - 1;
  const out = [];
  for (let w = 0; w < weeks; w++) {
    const r = w % rounds;
    const rest = seats.slice(1);
    const turned = [...rest.slice(rest.length - r), ...rest.slice(0, rest.length - r)];
    const order = [seats[0], ...turned];
    const pairs = [];
    for (let i = 0; i < n / 2; i++) {
      const a = order[i];
      const b = order[n - 1 - i];
      pairs.push(a == null ? [b, null] : [a, b]);
    }
    // Byes last, so the matchups people play come first.
    out.push(pairs.sort((x, y) => (x[1] == null) - (y[1] == null)));
  }
  return out;
}

/** Seed pairs for a playoff's first round, so 1 and 2 can only meet in the final: 8 -> [1,8],[4,5],[3,6],[2,7]. */
export function bracketPairs(size) {
  let order = [1];
  while (order.length < size) {
    const n = order.length * 2;
    order = order.flatMap((s) => [s, n + 1 - s]);
  }
  const pairs = [];
  for (let i = 0; i < order.length; i += 2) pairs.push([order[i], order[i + 1]]);
  return pairs;
}

/**
 * Start every league whose week 1 has begun, once: under 4 players it's
 * canceled (everyone hears); otherwise the schedule is written. The playoff
 * shrinks to fit the players (8 with 6 players becomes 4). Returns
 * { started, canceled } as lists of league ids.
 */
export function startDueLeagues(store, now, notifier = null) {
  const started = [];
  const canceled = [];
  for (const l of store.all('SELECT * FROM leagues WHERE started_at IS NULL AND canceled_at IS NULL')) {
    if (now < startsAt(l)) continue;
    const members = membersOf(store, l);
    if (members.length < LEAGUE_MIN) {
      const reason = `Only ${members.length} ${members.length === 1 ? 'player' : 'players'} joined before Week 1. A league needs ${LEAGUE_MIN}.`;
      const claimed = store.run('UPDATE leagues SET canceled_at = ?, cancel_reason = ? WHERE id = ? AND canceled_at IS NULL AND started_at IS NULL', now.toISOString(), reason, l.id).changes;
      if (!claimed) continue;
      for (const m of members) notifier?.tell(m.id, { kind: 'league', text: `${l.name} was canceled. ${reason}`, url: `/leagues/${l.id}` }, now);
      canceled.push(l.id);
      continue;
    }
    const size = Math.max(...PLAYOFF_SIZES.filter((s) => s <= Math.min(l.playoff_size, members.length)));
    const ok = store.tx(() => {
      if (!store.run('UPDATE leagues SET started_at = ?, playoff_size = ? WHERE id = ? AND started_at IS NULL AND canceled_at IS NULL', now.toISOString(), size, l.id).changes) return false;
      roundRobin(members.map((m) => m.id), l.regular_weeks).forEach((pairs, w) => {
        pairs.forEach(([a, b], slot) => {
          store.run(
            'INSERT INTO league_matchups (league_id, week, slot, a_id, b_id) VALUES (?, ?, ?, ?, ?)',
            l.id, w + 1, slot, a, b,
          );
        });
      });
      return true;
    });
    if (ok) started.push(l.id);
  }
  return { started, canceled };
}

// ---- scoring -------------------------------------------------------------------

/** Each member's graded units in a league week: user id -> units. */
function gradedUnits(store, l, week, ids) {
  const rows = windowStandings(store, weekWindow(l, week, ids), 1000);
  return new Map(rows.map((r) => [r.id, r.units]));
}

/**
 * Live scores for a week still being played: graded units plus bets on
 * games in progress at the current score (the tournaments' provisional
 * grading). user id -> { units, live } with `live` the count of provisional
 * bets. Nothing is written.
 */
export function liveUnits(store, l, week, ids) {
  const window = weekWindow(l, week, ids);
  const out = new Map(ids.map((id) => [id, { units: 0, live: 0 }]));
  for (const [id, units] of gradedUnits(store, l, week, ids)) out.get(id).units = units;
  for (const b of provisional(store, openBetsIn(store, window))) {
    const row = out.get(b.user_id);
    if (!row) continue;
    row.units = round2(row.units + b.profit);
    row.live += 1;
  }
  return out;
}

/** Matchups of a league, by week: [{ week, playoff, ... }] with screen names. */
export function matchupsOf(store, l) {
  return store.all(
    `SELECT m.*, a.screen_name AS a_name, b.screen_name AS b_name FROM league_matchups m
       LEFT JOIN users a ON a.id = m.a_id LEFT JOIN users b ON b.id = m.b_id
      WHERE m.league_id = ? ORDER BY m.week, m.slot`,
    l.id,
  );
}

/**
 * Regular-season standings: { id, screen_name, wins, losses, ties, units,
 * played, rank }. Win share first (a tie is half), then total units (bye
 * weeks' units count too), then who joined first.
 */
export function leagueStandings(store, l) {
  const members = membersOf(store, l);
  const rows = new Map(members.map((m, i) => [m.id, { ...m, order: i, wins: 0, losses: 0, ties: 0, units: 0, played: 0 }]));
  for (const m of store.all('SELECT * FROM league_matchups WHERE league_id = ? AND playoff = 0 AND settled_at IS NOT NULL', l.id)) {
    const a = rows.get(m.a_id);
    const b = rows.get(m.b_id);
    if (a) a.units = round2(a.units + (m.a_units ?? 0));
    if (b) b.units = round2(b.units + (m.b_units ?? 0));
    if (m.result === 'bye') continue;
    for (const [me, mine] of [[a, 'a'], [b, 'b']]) {
      if (!me) continue;
      me.played += 1;
      if (m.result === 'tie') me.ties += 1;
      else if (m.result === mine) me.wins += 1;
      else me.losses += 1;
    }
  }
  const share = (r) => (r.played ? (r.wins + r.ties / 2) / r.played : 0);
  return [...rows.values()]
    .sort((x, y) => share(y) - share(x) || y.units - x.units || x.order - y.order)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

/** The result of a settled matchup: 'a', 'b' or 'tie'. In the playoffs a tie goes to the higher seed. */
export function decide(m, aUnits, bUnits) {
  if (aUnits > bUnits) return 'a';
  if (bUnits > aUnits) return 'b';
  if (m.playoff) return (m.a_seed ?? 99) <= (m.b_seed ?? 99) ? 'a' : 'b';
  return 'tie';
}

const wants = (store, userId) => Boolean(store.get('SELECT notify_tournament_updates AS on_ FROM users WHERE id = ?', userId)?.on_);

/** A note behind the Tournament updates setting. */
function update(store, notifier, userId, text, l, now) {
  if (!notifier || userId == null || !wants(store, userId)) return false;
  return notifier.tell(userId, { kind: 'league', text, url: `/leagues/${l.id}` }, now);
}

/**
 * Settle one league week, once: score every matchup, write the results and
 * tell the players ("You beat DogLover +3.2u to +1.1u."). Returns whether it
 * settled.
 */
function settleWeek(store, l, week, now, notifier) {
  const rows = store.all('SELECT * FROM league_matchups WHERE league_id = ? AND week = ? AND settled_at IS NULL ORDER BY slot', l.id, week);
  if (!rows.length) return false;
  const ids = rows.flatMap((m) => [m.a_id, m.b_id]).filter((id) => id != null);
  const units = gradedUnits(store, l, week, ids);
  const at = now.toISOString();
  const done = store.tx(() => {
    const out = [];
    for (const m of rows) {
      const a = round2(units.get(m.a_id) ?? 0);
      const b = m.b_id == null ? null : round2(units.get(m.b_id) ?? 0);
      const result = m.b_id == null ? 'bye' : decide(m, a, b);
      const winner = result === 'a' || result === 'bye' ? m.a_id : result === 'b' ? m.b_id : null;
      const { changes } = store.run(
        `UPDATE league_matchups SET a_units = ?, b_units = ?, result = ?, winner_id = ?, settled_at = ?
          WHERE league_id = ? AND week = ? AND slot = ? AND settled_at IS NULL`,
        a, b, result, winner, at, l.id, week, m.slot,
      );
      if (changes) out.push({ ...m, a_units: a, b_units: b, result, winner_id: winner });
    }
    return out;
  });
  if (!done.length) return false;
  const name = (id) => store.get('SELECT screen_name FROM users WHERE id = ?', id)?.screen_name ?? 'a player';
  for (const m of done) {
    if (m.result === 'bye') continue;
    const [aName, bName] = [name(m.a_id), name(m.b_id)];
    const suffix = m.playoff ? (week === lastWeek(l) ? '' : ' On to the next round.') : '';
    if (m.result === 'tie') {
      update(store, notifier, m.a_id, `You tied ${bName} at ${signed(m.a_units)} in ${l.name}.`, l, now);
      update(store, notifier, m.b_id, `You tied ${aName} at ${signed(m.b_units)} in ${l.name}.`, l, now);
      continue;
    }
    const [w, lose, wu, lu, wName, lName] = m.result === 'a'
      ? [m.a_id, m.b_id, m.a_units, m.b_units, aName, bName]
      : [m.b_id, m.a_id, m.b_units, m.a_units, bName, aName];
    const onSeed = wu === lu ? ' (the higher seed wins a tie)' : '';
    update(store, notifier, w, `You beat ${lName} ${signed(wu)} to ${signed(lu)}${onSeed}.${suffix}`, l, now);
    update(store, notifier, lose, `${wName} beat you ${signed(wu)} to ${signed(lu)}${onSeed}.${m.playoff ? ' Your playoff run is over.' : ''}`, l, now);
  }
  return true;
}

/** After the regular season: seed the top N, tell them, and write the first playoff round. */
function seedPlayoffs(store, l, now, notifier) {
  const table = leagueStandings(store, l);
  const size = l.playoff_size;
  const seeded = table.slice(0, size);
  const week = l.regular_weeks + 1;
  const made = store.tx(() => {
    if (store.get('SELECT 1 AS x FROM league_matchups WHERE league_id = ? AND week = ?', l.id, week)) return false;
    seeded.forEach((r, i) => store.run('UPDATE league_members SET seed = ? WHERE league_id = ? AND user_id = ?', i + 1, l.id, r.id));
    bracketPairs(size).forEach(([sa, sb], slot) => {
      store.run(
        'INSERT INTO league_matchups (league_id, week, slot, playoff, a_id, b_id, a_seed, b_seed) VALUES (?, ?, ?, 1, ?, ?, ?, ?)',
        l.id, week, slot, seeded[sa - 1].id, seeded[sb - 1].id, sa, sb,
      );
    });
    return true;
  });
  if (!made) return;
  seeded.forEach((r, i) => update(store, notifier, r.id, `You made the playoffs in ${l.name} as the ${i + 1} seed.`, l, now));
}

/** After a playoff round: the next round from its winners, in bracket order. */
function nextRound(store, l, week) {
  const winners = store.all('SELECT winner_id, a_id, a_seed, b_seed FROM league_matchups WHERE league_id = ? AND week = ? ORDER BY slot', l.id, week);
  store.tx(() => {
    if (store.get('SELECT 1 AS x FROM league_matchups WHERE league_id = ? AND week = ?', l.id, week + 1)) return;
    for (let i = 0; i < winners.length; i += 2) {
      const [x, y] = [winners[i], winners[i + 1]];
      const seedOf = (m) => (m.winner_id === m.a_id ? m.a_seed : m.b_seed);
      store.run(
        'INSERT INTO league_matchups (league_id, week, slot, playoff, a_id, b_id, a_seed, b_seed) VALUES (?, ?, ?, 1, ?, ?, ?, ?)',
        l.id, week + 1, i / 2, x.winner_id, y.winner_id, seedOf(x), seedOf(y),
      );
    }
  });
}

/**
 * The finish order for the Cup: champion 1st, runner-up 2nd, semifinal
 * losers 3rd (a shared place), then everyone else by the regular-season
 * standings. Returns [{ id, place }].
 */
export function finishOrder(store, l) {
  const playoff = store.all('SELECT * FROM league_matchups WHERE league_id = ? AND playoff = 1 AND settled_at IS NOT NULL ORDER BY week DESC, slot', l.id);
  const final = playoff.find((m) => m.week === lastWeek(l));
  if (!final) return [];
  const loser = (m) => (m.winner_id === m.a_id ? m.b_id : m.a_id);
  const out = [{ id: final.winner_id, place: 1 }, { id: loser(final), place: 2 }];
  if (l.playoff_size >= 4) for (const m of playoff.filter((x) => x.week === lastWeek(l) - 1)) out.push({ id: loser(m), place: 3 });
  const placed = new Set(out.map((r) => r.id));
  for (const r of leagueStandings(store, l)) if (!placed.has(r.id)) out.push({ id: r.id, place: out.length + 1 });
  return out.filter((r) => r.id != null);
}

/** Close a league after its final, once: the champion, Cup points, badges and notes. */
function closeLeague(store, l, now, notifier) {
  const final = store.get('SELECT winner_id FROM league_matchups WHERE league_id = ? AND week = ? AND settled_at IS NOT NULL', l.id, lastWeek(l));
  if (!final) return false;
  const claimed = store.run('UPDATE leagues SET closed_at = ?, champion_id = ? WHERE id = ? AND closed_at IS NULL', now.toISOString(), final.winner_id, l.id).changes;
  if (!claimed) return false;
  const order = finishOrder(store, l);
  const end = weekBounds(weekMonday(l, lastWeek(l))).end;
  recordCup(store, {
    source: 'league', ref: l.id, year: cupYear(new Date(end.getTime() - 60_000)), label: l.name,
    rows: order, now, minPlaced: PLAYER_MADE_MIN,
  });
  const champ = store.get('SELECT screen_name FROM users WHERE id = ?', final.winner_id)?.screen_name ?? 'Someone';
  for (const m of membersOf(store, l)) {
    const text = m.id === final.winner_id
      ? `You won ${l.name}. League champion.`
      : `${l.name} is final: ${champ} won it. You finished ${ordinal(order.find((r) => r.id === m.id)?.place ?? order.length)}.`;
    notifier?.tell(m.id, { kind: 'league', text, url: `/leagues/${l.id}` }, now);
  }
  checkBadges(store, [final.winner_id], now, notifier);
  return true;
}

/**
 * The timer job, every few minutes: start leagues whose week 1 began, settle
 * every finished week that's due (in order, so a server that was down
 * catches up), seed the playoffs and write each round, close a league after
 * its final, and send "This week you play DogLover" once per matchup. Safe
 * to run as often as you like.
 */
export function runLeagues(store, now, notifier = null) {
  const out = startDueLeagues(store, now, notifier);
  out.settled = 0;
  out.closed = [];
  for (const l of store.all('SELECT * FROM leagues WHERE started_at IS NOT NULL AND canceled_at IS NULL AND closed_at IS NULL')) {
    for (;;) {
      const next = store.get('SELECT MIN(week) AS week FROM league_matchups WHERE league_id = ? AND settled_at IS NULL', l.id).week;
      if (next == null) break;
      const ids = membersOf(store, l).map((m) => m.id);
      const window = weekWindow(l, next, ids);
      if (!dueToClose(store, window, weekBounds(weekMonday(l, next)).deadline, now)) break;
      if (!settleWeek(store, l, next, now, notifier)) break;
      out.settled += 1;
      if (next === l.regular_weeks) seedPlayoffs(store, l, now, notifier);
      else if (next > l.regular_weeks && next < lastWeek(l)) nextRound(store, l, next);
      else if (next === lastWeek(l) && closeLeague(store, l, now, notifier)) out.closed.push(l.id);
    }
    tellWeek(store, l, now, notifier);
  }
  return out;
}

/** "This week you play DogLover in Sunday Crew.": once per matchup, while its week is on. */
function tellWeek(store, l, now, notifier) {
  const week = weekAt(l, now);
  for (const m of store.all('SELECT * FROM league_matchups WHERE league_id = ? AND week = ? AND told_at IS NULL', l.id, week)) {
    const claimed = store.run('UPDATE league_matchups SET told_at = ? WHERE league_id = ? AND week = ? AND slot = ? AND told_at IS NULL', now.toISOString(), l.id, week, m.slot).changes;
    if (!claimed) continue;
    const name = (id) => store.get('SELECT screen_name FROM users WHERE id = ?', id)?.screen_name ?? 'a player';
    if (m.b_id == null) {
      update(store, notifier, m.a_id, `You have a bye this week in ${l.name}. Your units still count toward the standings.`, l, now);
      continue;
    }
    const what = m.playoff ? (week === lastWeek(l) ? 'In the final, this week you play' : 'Playoffs: this week you play') : 'This week you play';
    update(store, notifier, m.a_id, `${what} ${name(m.b_id)} in ${l.name}.`, l, now);
    update(store, notifier, m.b_id, `${what} ${name(m.a_id)} in ${l.name}.`, l, now);
  }
}

// ---- pages ---------------------------------------------------------------------

const ROUND_NAMES = { 1: ['Final'], 2: ['Semifinals', 'Final'], 3: ['Quarterfinals', 'Semifinals', 'Final'] };

/** The playoff bracket: rounds of matchups, with TBD where a round isn't set yet. */
export function bracketOf(store, l, rows = matchupsOf(store, l)) {
  const rounds = playoffRounds(l.playoff_size);
  const seeds = new Map(store.all('SELECT user_id, seed FROM league_members WHERE league_id = ? AND seed IS NOT NULL', l.id).map((r) => [r.seed, r.user_id]));
  const out = [];
  for (let r = 0; r < rounds; r++) {
    const week = l.regular_weeks + 1 + r;
    const count = l.playoff_size / 2 ** (r + 1);
    const games = rows.filter((m) => m.week === week);
    out.push({
      name: ROUND_NAMES[rounds][r],
      week,
      monday: weekMonday(l, week),
      games: Array.from({ length: count }, (_, i) => games.find((m) => m.slot === i)
        ?? (r === 0 && seeds.size ? { slot: i, week, a_seed: bracketPairs(l.playoff_size)[i][0], b_seed: bracketPairs(l.playoff_size)[i][1], tbd: true } : { slot: i, week, tbd: true })),
    });
  }
  return out;
}

/**
 * Everything a league's page needs: phase, members, standings, the weeks
 * with their matchups (the current one with live scores), and the bracket.
 */
export function leagueView(store, l, userId, now) {
  const phase = leaguePhase(l, now);
  const members = membersOf(store, l);
  const rows = matchupsOf(store, l);
  const current = Math.min(Math.max(weekAt(l, now), 1), lastWeek(l));
  const liveWeek = phase === 'regular' || phase === 'playoffs' ? current : null;
  let live = null;
  if (liveWeek != null && rows.some((m) => m.week === liveWeek && !m.settled_at)) {
    live = liveUnits(store, l, liveWeek, members.map((m) => m.id));
  }
  const weeks = [];
  for (let w = 1; w <= lastWeek(l); w++) {
    const list = rows.filter((m) => m.week === w).map((m) => {
      const a = live && m.week === liveWeek && !m.settled_at ? live.get(m.a_id) : null;
      const b = live && m.week === liveWeek && !m.settled_at ? live.get(m.b_id) : null;
      return { ...m, liveA: a, liveB: b, mine: userId != null && (m.a_id === userId || m.b_id === userId) };
    });
    // Yours first.
    list.sort((x, y) => y.mine - x.mine || x.slot - y.slot);
    weeks.push({ week: w, monday: weekMonday(l, w), label: weekLabel(weekMonday(l, w)), playoff: w > l.regular_weeks, matchups: list });
  }
  return {
    phase,
    members,
    standings: leagueStandings(store, l),
    weeks,
    current,
    liveWeek,
    // The bracket's matchups carry this week's live scores too.
    bracket: phase === 'playoffs' || phase === 'final' ? bracketOf(store, l, weeks.flatMap((w) => w.matchups)) : null,
    champion: l.champion_id ? members.find((m) => m.id === l.champion_id) ?? null : null,
    sports: leagueSports(l),
    membersOnly: Boolean(l.members_only && !inGroup(store, l.group_id, userId)),
    group: l.group_id ? store.get('SELECT id, name, kind FROM friend_groups WHERE id = ?', l.group_id) : null,
    creator: l.created_by ? store.get('SELECT screen_name FROM users WHERE id = ?', l.created_by)?.screen_name ?? null : null,
  };
}

/** A league as a list card: its phase, members, and the viewer's record. */
export function leagueCard(store, l, userId, now) {
  const phase = leaguePhase(l, now);
  const count = memberCount(store, l);
  const mine = isMemberOf(store, l, userId);
  const me = mine && l.started_at ? leagueStandings(store, l).find((r) => r.id === userId) ?? null : null;
  return {
    ...l,
    phase,
    count,
    mine,
    me,
    sportList: leagueSports(l),
    href: l.visibility === 'private' ? `/l/${l.invite_code}` : `/leagues/${l.id}`,
    startLabel: weekLabel(l.start_week),
    week: phase === 'regular' || phase === 'playoffs' ? Math.min(weekAt(l, now), lastWeek(l)) : null,
    membersOnly: Boolean(l.members_only && !inGroup(store, l.group_id, userId)),
  };
}

/**
 * The lists: the viewer's leagues (going, then the last few finished), and
 * open public ones still taking players (not tied to a private group).
 */
export function leagueLists(store, userId, now) {
  const yours = userId == null ? [] : store.all(
    `SELECT l.* FROM leagues l JOIN league_members m ON m.league_id = l.id
      WHERE m.user_id = ? AND (l.canceled_at IS NULL OR l.canceled_at > ?)
      ORDER BY l.closed_at IS NOT NULL, l.canceled_at IS NOT NULL, l.start_week, l.id LIMIT 20`,
    userId, new Date(now.getTime() - 14 * 86_400_000).toISOString(),
  );
  const open = store.all(
    `SELECT l.* FROM leagues l LEFT JOIN friend_groups g ON g.id = l.group_id
      WHERE l.started_at IS NULL AND l.canceled_at IS NULL AND l.visibility = 'public' AND (l.group_id IS NULL OR g.kind = 'local')
        AND (SELECT COUNT(*) FROM league_members m WHERE m.league_id = l.id) < ?
      ORDER BY l.start_week, l.id LIMIT 30`,
    LEAGUE_MAX,
  ).filter((l) => now < startsAt(l) && !(userId != null && yours.some((y) => y.id === l.id)));
  const card = (l) => leagueCard(store, l, userId, now);
  return { yours: yours.map(card), open: open.map(card) };
}
