// Tournaments: free contests over a window of time, on one sport, a few, or
// all of them. Nobody pays and nothing is paid out (the database refuses any
// entry fee but 0; see BRAIN.md for what buy-ins would need first).
//
// - The Weekly Open is the weekly contest (src/contest.js) shown as a
//   tournament: everyone's in, no joining, and it closes with the week.
// - Auto tournaments are made by a timer about two days ahead, once each:
//   NFL Sunday, College Saturday and Hoops Night. One whose sports have no
//   games that day isn't made, so the off-season stays empty.
// - Admins make custom ones at /admin/tournaments, and can cancel one before
//   it starts.
// - Players make their own at /tournaments/new (a 'custom' tournament with a
//   player_tournaments row): public (listed under Player tournaments) or
//   private (opened from /t/<code>), optionally for one group or local
//   room's members. The prize is fixed and it's free like every other one.
//   Three reports hide one from the lists until an admin looks.
//
// While a tournament is live its page shows "As it stands": the graded
// standings plus bets on games in progress, graded at the current score
// with the same grading code as finals. Nothing provisional is ever written;
// results, closing and badges use graded bets only.
//
// "Where you stand" alerts tell entrants when they move into the top 3 of
// the graded standings, and once, about two hours before the end, how far
// they are from first.
//
// Joining is free and one tap, any time before the end. Only bets made after
// joining count, on games that start inside the window and match its sports
// (a parlay only when every leg does). You can leave until the start. The
// standings and closing are the weekly contest's, for any window: units on
// graded bets, a minimum to place, ties to the better ROI and then to whose
// last counted bet started first. A tournament closes once, after its end,
// when every counted bet is graded or 30 hours after the end at the latest;
// its top 3 are written once, told, and get badges.

import crypto from 'node:crypto';

import { looksOfficial } from './auth.js';
import { checkBadges } from './badges.js';
import { CONTEST_MIN, closeWindow, dueToClose, openBetsIn, rankStandings, results, timeLeft, windowStandings } from './contest.js';
import { formatUnits, grade, profit, settleParlay } from './picks.js';
import { SPORT } from './sports.js';
import { withRates } from './stats.js';
import { addDays, etDay, etToUtc, HOUR, mondayOf, weekday } from './time.js';

export const AHEAD_DAYS = 2;
export const CLOSE_AFTER_HOURS = 30;
export const REMIND_MINUTES = 60;
export const NAME_MAX = 60;
export const PRIZE_MAX = 140;
export const MAX_DAYS = 31;
export const MIN_BETS_MAX = 50;
const FINISHED_SHOWN = 10;

const PRIZE = 'Tournament champion badge and a spot on the winners wall';

/** The tournaments the timer makes, each on its Eastern day. weekday null is every day. The keys go in slugs; never rename one. */
export const AUTO = [
  { key: 'nfl-sunday', name: 'NFL Sunday', sports: ['nfl'], weekday: 0, min: 3 },
  { key: 'college-saturday', name: 'College Saturday', sports: ['ncaaf'], weekday: 6, min: 3 },
  { key: 'hoops-night', name: 'Hoops Night', sports: ['nba', 'ncaab'], weekday: null, min: 2 },
];
export const WEEKLY = { key: 'weekly-open', name: 'The Weekly Open', prize: 'Weekly winner badge and the top spot on the winners wall' };

/** "20261108" -> "2026-11-08" */
const dashed = (day) => `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}`;

/** A tournament's sport keys, or null for every sport. */
export const sportsOf = (t) => (t.sports ? t.sports.split(',').filter((k) => SPORT[k]) : null);

/** A tournament as a standings window. The Weekly Open has no entrants: everyone's in. */
export function windowOf(t) {
  return {
    start: new Date(t.starts_at),
    end: new Date(t.ends_at),
    sports: sportsOf(t),
    min: t.min_bets,
    tournamentId: t.kind === 'weekly' ? null : t.id,
  };
}

/** 'soon' before the start, 'live' until the end, then 'finished'. */
export function phase(t, now) {
  const at = now.toISOString();
  return at < t.starts_at ? 'soon' : at < t.ends_at ? 'live' : 'finished';
}

/** A tournament by its slug, unless it was canceled. */
export function bySlug(store, slug) {
  return store.get('SELECT * FROM tournaments WHERE slug = ? AND canceled_at IS NULL', String(slug ?? '')) ?? null;
}

/** A tournament by its slug, canceled or not (a canceled one keeps its chat, read-only, for its entrants). */
export function findTournament(store, slug) {
  return store.get('SELECT * FROM tournaments WHERE slug = ?', String(slug ?? '')) ?? null;
}

const ET = 'America/New_York';
const dayFmt = new Intl.DateTimeFormat('en-US', { timeZone: ET, weekday: 'short', month: 'short', day: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('en-US', { timeZone: ET, hour: 'numeric', minute: '2-digit' });

/**
 * "Sun, Nov 8, 1:00 PM – 11:59 PM ET", or across days "Mon, Nov 2, 12:00 AM –
 * Sun, Nov 8, 11:59 PM ET". The end shown is the last minute in the window.
 */
export function windowLabel(t) {
  const start = new Date(t.starts_at);
  const last = new Date(new Date(t.ends_at).getTime() - 60_000);
  const from = `${dayFmt.format(start)}, ${timeFmt.format(start)}`;
  return etDay(start) === etDay(last)
    ? `${from} – ${timeFmt.format(last)} ET`
    : `${from} – ${dayFmt.format(last)}, ${timeFmt.format(last)} ET`;
}

const endFmt = new Intl.DateTimeFormat('en-US', { timeZone: ET, month: 'short', day: 'numeric', year: 'numeric' });
/** "Nov 8, 2026": the day a tournament ends (its last minute), for share cards. */
export const endLabel = (t) => endFmt.format(new Date(new Date(t.ends_at).getTime() - 60_000));

/** "Starts in 4 hours, 12 minutes", "Ends in 1 day, 3 hours", or null once it's over. */
export function clockText(t, now) {
  const p = phase(t, now);
  if (p === 'finished') return null;
  const left = timeLeft(now, new Date(p === 'soon' ? t.starts_at : t.ends_at)).replace(/ left$/, '');
  return `${p === 'soon' ? 'Starts' : 'Ends'} in ${left}`;
}

// ---- making them -----------------------------------------------------------

/** The first game start, and how many games, for these sports in [start, end). */
function gamesIn(store, sports, start, end) {
  return store.get(
    `SELECT MIN(start_time) AS first, COUNT(*) AS n FROM games
      WHERE sport IN (${sports.map(() => '?').join(', ')}) AND start_time >= ? AND start_time < ?
        AND status NOT IN ('STATUS_POSTPONED', 'STATUS_CANCELED')`,
    ...sports, start.toISOString(), end.toISOString(),
  );
}

/**
 * Make the auto tournaments due in the next AHEAD_DAYS days, and this week's
 * (and, close to Monday, next week's) Weekly Open. Each is made once (by its
 * slug), so this is safe to run as often as you like. A day whose sports have
 * no games isn't made; one that has games later still gets made then. An auto
 * tournament starts at its first game, so "starts in 1 hour" means kickoff;
 * until it starts, that start follows the schedule if a game moves.
 *
 * `games`, when given, refreshes each sport's board from ESPN first.
 */
export async function ensureAutoTournaments(store, now, { games = null, log = console } = {}) {
  if (games) {
    for (const sport of new Set(AUTO.flatMap((a) => a.sports))) {
      try {
        await games.upcoming(sport);
      } catch (err) {
        log.warn?.(`tournaments: ${sport}: ${err.message}`);
      }
    }
  }
  const at = now.toISOString();
  const made = [];
  const insert = (row) => {
    const { changes } = store.run(
      `INSERT OR IGNORE INTO tournaments (slug, name, sports, starts_at, ends_at, min_bets, prize, kind, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row.slug, row.name, row.sports, row.starts_at, row.ends_at, row.min_bets, row.prize, row.kind, at,
    );
    if (changes) made.push(row.slug);
  };

  // The Weekly Open: this week's, and next week's once it's two days off.
  const monday = mondayOf(now);
  for (const week of [monday, addDays(monday, 7)]) {
    const start = etToUtc(week, 0);
    if (start.getTime() - now.getTime() > AHEAD_DAYS * 24 * HOUR) continue;
    insert({
      slug: `${WEEKLY.key}-${dashed(week)}`, name: WEEKLY.name, sports: null,
      starts_at: start.toISOString(), ends_at: etToUtc(addDays(week, 7), 0).toISOString(),
      min_bets: CONTEST_MIN, prize: WEEKLY.prize, kind: 'weekly',
    });
  }

  const today = etDay(now);
  for (let d = 0; d <= AHEAD_DAYS; d++) {
    const day = addDays(today, d);
    const start = etToUtc(day, 0);
    const end = etToUtc(addDays(day, 1), 0);
    for (const a of AUTO) {
      if (a.weekday != null && weekday(day) !== a.weekday) continue;
      const slug = `${a.key}-${dashed(day)}`;
      const { first, n } = gamesIn(store, a.sports, start, end);
      if (!n) continue;
      const existing = store.get('SELECT id, starts_at FROM tournaments WHERE slug = ?', slug);
      if (!existing) {
        insert({ slug, name: a.name, sports: a.sports.join(','), starts_at: first, ends_at: end.toISOString(), min_bets: a.min, prize: PRIZE, kind: 'auto' });
      } else if (existing.starts_at > at && first > at && first !== existing.starts_at) {
        store.run('UPDATE tournaments SET starts_at = ? WHERE id = ?', first, existing.id);
      }
    }
  }
  return made;
}

/** "Bullies Cup!" -> "bullies-cup" */
function slugify(name) {
  return name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '') || 'tournament';
}

/** A slug nobody has yet: "bullies-cup-2026-11-08", then "-2", "-3". */
function freeSlug(store, name, start) {
  const base = `${slugify(name)}-${dashed(etDay(start))}`;
  let slug = base;
  for (let i = 2; store.get('SELECT 1 AS x FROM tournaments WHERE slug = ?', slug); i++) slug = `${base}-${i}`;
  return slug;
}

/** "2026-11-08" and "13:00" (Eastern) to an instant, or null. */
function etInstant(date, time) {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date ?? ''));
  const t = /^(\d{1,2}):(\d{2})$/.exec(String(time ?? ''));
  if (!d || !t || +t[1] > 23 || +t[2] > 59) return null;
  try {
    return etToUtc(`${d[1]}${d[2]}${d[3]}`, +t[1], +t[2]);
  } catch {
    return null;
  }
}

/**
 * An admin's tournament. Start and end are Eastern; the end is the last
 * minute that counts ("11:59 PM" ends at midnight). No sports means all of
 * them. Returns { slug } or { error }.
 */
export function createCustom(store, { name, sports = [], startDate, startTime, endDate, endTime, minBets, prize, userId, now }) {
  name = String(name ?? '').trim().replace(/\s+/g, ' ');
  prize = String(prize ?? '').trim().replace(/\s+/g, ' ');
  const keys = [...new Set(sports)];
  const min = Number(minBets);
  const start = etInstant(startDate, startTime);
  const last = etInstant(endDate, endTime);
  if (name.length < 3 || name.length > NAME_MAX) return { error: `Give it a name of 3 to ${NAME_MAX} characters.` };
  if (keys.some((k) => !SPORT[k])) return { error: 'Pick sports from the list.' };
  if (!start || !last) return { error: 'Enter a start and an end date and time.' };
  const end = new Date(last.getTime() + 60_000);
  if (end <= start) return { error: 'The end has to come after the start.' };
  if (end <= now) return { error: 'That end time has already passed.' };
  if (end - start > MAX_DAYS * 24 * HOUR) return { error: `Keep it to ${MAX_DAYS} days or less.` };
  if (!Number.isInteger(min) || min < 1 || min > MIN_BETS_MAX) return { error: `Set the minimum to a whole number from 1 to ${MIN_BETS_MAX}.` };
  if (prize.length > PRIZE_MAX) return { error: `Keep the prize to ${PRIZE_MAX} characters.` };
  const slug = freeSlug(store, name, start);
  store.run(
    `INSERT INTO tournaments (slug, name, sports, starts_at, ends_at, min_bets, prize, kind, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'custom', ?, ?)`,
    slug, name, keys.length ? keys.join(',') : null, start.toISOString(), end.toISOString(), min, prize || PRIZE, userId, now.toISOString(),
  );
  return { slug };
}

/**
 * Cancel a tournament before it starts, and tell whoever joined. The Weekly
 * Open can't be canceled. `anytime` (admins, on a player-made one) cancels
 * one that's live or finished too, as long as it isn't final yet. Its page
 * and chat stay, read-only, for whoever was in it.
 */
export function cancelTournament(store, t, now, notifier = null, { anytime = false } = {}) {
  if (t.kind === 'weekly') return { error: "The Weekly Open can't be canceled." };
  const at = now.toISOString();
  const { changes } = anytime
    ? store.run('UPDATE tournaments SET canceled_at = ? WHERE id = ? AND canceled_at IS NULL AND closed_at IS NULL', at, t.id)
    : store.run('UPDATE tournaments SET canceled_at = ? WHERE id = ? AND canceled_at IS NULL AND starts_at > ?', at, t.id, at);
  if (!changes) return { error: anytime ? "It's already final, so it can't be canceled." : "It's already started, so it can't be canceled." };
  const text = t.starts_at > at ? `${t.name} was canceled before it started.` : `${t.name} was canceled by an admin.`;
  for (const e of store.all('SELECT user_id FROM tournament_entries WHERE tournament_id = ?', t.id)) {
    notifier?.tell(e.user_id, { kind: 'tournament', text, url: `/tournaments/${t.slug}` }, now);
  }
  return { ok: true };
}

// ---- joining ---------------------------------------------------------------

/**
 * Join, free, any time before the end. Only bets made from now on count. A
 * player-made one may be for one group's members, and a private one needs
 * its invite `code` (the creator's own is already in).
 */
export function joinTournament(store, t, userId, now, { code = null } = {}) {
  if (t.kind === 'weekly') return { error: "Everyone's in this one. No need to join." };
  if (t.canceled_at) return { error: 'This one was canceled.' };
  if (store.get('SELECT official FROM users WHERE id = ?', userId)?.official) return { error: "The official account doesn't play in tournaments." };
  if (phase(t, now) === 'finished') return { error: 'This one is over.' };
  const host = hostOf(store, t);
  if (host) {
    const problem = joinProblem(store, host, userId, code);
    if (problem) return { error: problem };
  }
  const { changes } = store.run(
    'INSERT OR IGNORE INTO tournament_entries (tournament_id, user_id, joined_at) VALUES (?, ?, ?)',
    t.id, userId, now.toISOString(),
  );
  return { ok: true, joined: changes > 0 };
}

/** Leave, but only before the start. After that you're in. */
export function leaveTournament(store, t, userId, now) {
  if (phase(t, now) !== 'soon') return { error: "It's started, so you're in until the end." };
  store.run('DELETE FROM tournament_entries WHERE tournament_id = ? AND user_id = ?', t.id, userId);
  return { ok: true };
}

/** When this player joined, or null. Everyone is in The Weekly Open. */
export function entryOf(store, t, userId) {
  if (!userId) return null;
  if (t.kind === 'weekly') return { joined_at: t.starts_at, everyone: true };
  return store.get('SELECT joined_at FROM tournament_entries WHERE tournament_id = ? AND user_id = ?', t.id, userId) ?? null;
}

export const entrantCount = (store, t) => store.get('SELECT COUNT(*) AS n FROM tournament_entries WHERE tournament_id = ?', t.id).n;

// ---- standings and closing -------------------------------------------------

/** A tournament's standings: the weekly contest's code, for its window, sports and entrants. */
export function standingsOf(store, t, limit = 100) {
  return windowStandings(store, windowOf(t), limit);
}

/** A closed tournament's top 3 ({ place, units, record, id, screen_name }), or null while it's open. */
export function podiumOf(store, t) {
  if (t.kind === 'weekly') return results(store, mondayOf(new Date(t.starts_at)));
  if (!t.closed_at) return null;
  return store.all(
    `SELECT r.place, r.units, r.record, u.id, u.screen_name FROM tournament_results r JOIN users u ON u.id = r.user_id
      WHERE r.tournament_id = ? ORDER BY r.place`,
    t.id,
  );
}

const signedUnits = (n) => formatUnits(n, { sign: true }).replace(/^-/, '−');

/**
 * Close one tournament: write its top 3 once, tell them and everyone else
 * who joined, and check badges. Returns the podium, or null if it was already
 * closed. The Weekly Open closes with its week (contest.closeWeek) instead.
 */
export function closeTournament(store, t, now, notifier = null) {
  if (t.kind === 'weekly') return null;
  const podium = closeWindow(store, windowOf(t), {
    claim: () => store.run(
      'UPDATE tournaments SET closed_at = ? WHERE id = ? AND closed_at IS NULL AND canceled_at IS NULL',
      now.toISOString(), t.id,
    ).changes > 0,
    save: (r, record) => store.run(
      'INSERT INTO tournament_results (tournament_id, place, user_id, units, record) VALUES (?, ?, ?, ?, ?)',
      t.id, r.rank, r.id, r.units, record,
    ),
  });
  if (!podium) return null;
  const url = `/tournaments/${t.slug}`;
  const placed = new Set(podium.map((r) => r.id));
  for (const r of podium) {
    notifier?.tell(r.id, { kind: 'tournament', text: `You finished #${r.rank} in ${t.name} (${signedUnits(r.units)}).`, url }, now);
  }
  const winner = podium[0];
  const final = winner
    ? `${t.name} is final: ${winner.screen_name} won it (${signedUnits(winner.units)}).`
    : `${t.name} is final. Nobody had ${t.min_bets} graded bets to place.`;
  for (const e of store.all('SELECT user_id FROM tournament_entries WHERE tournament_id = ?', t.id)) {
    if (!placed.has(e.user_id)) notifier?.tell(e.user_id, { kind: 'tournament', text: final, url }, now);
  }
  checkBadges(store, [...placed], now, notifier);
  return podium;
}

/**
 * The timer job: close every finished tournament that's due, once. A
 * Weekly Open is marked closed once its week is (by closeDueWeeks).
 */
export function closeDueTournaments(store, now, notifier = null) {
  const closed = [];
  const open = store.all(
    'SELECT * FROM tournaments WHERE closed_at IS NULL AND canceled_at IS NULL AND ends_at <= ? ORDER BY ends_at',
    now.toISOString(),
  );
  for (const t of open) {
    if (t.kind === 'weekly') {
      const week = mondayOf(new Date(t.starts_at));
      const done = store.get('SELECT closed_at FROM contest_weeks WHERE week = ?', week);
      if (done) store.run('UPDATE tournaments SET closed_at = ? WHERE id = ? AND closed_at IS NULL', done.closed_at, t.id);
      continue;
    }
    const deadline = new Date(new Date(t.ends_at).getTime() + CLOSE_AFTER_HOURS * HOUR);
    if (!dueToClose(store, windowOf(t), deadline, now)) continue;
    const podium = closeTournament(store, t, now, notifier);
    if (podium) closed.push({ slug: t.slug, podium });
  }
  return closed;
}

/**
 * "NFL Sunday starts in 1 hour.": once per entrant, within the hour before
 * the start, for players with the setting on. Marked on the entry first, so
 * it never goes twice.
 */
export function sendStartReminders(store, now, notifier) {
  const rows = store.all(
    `SELECT t.id, t.slug, t.name, t.starts_at, e.user_id FROM tournaments t
       JOIN tournament_entries e ON e.tournament_id = t.id JOIN users u ON u.id = e.user_id
      WHERE t.canceled_at IS NULL AND t.kind != 'weekly' AND t.starts_at > ? AND t.starts_at <= ?
        AND e.reminded_at IS NULL AND u.notify_tournaments = 1 AND u.official = 0`,
    now.toISOString(), new Date(now.getTime() + REMIND_MINUTES * 60_000).toISOString(),
  );
  let sent = 0;
  for (const r of rows) {
    const claimed = store.run(
      'UPDATE tournament_entries SET reminded_at = ? WHERE tournament_id = ? AND user_id = ? AND reminded_at IS NULL',
      now.toISOString(), r.id, r.user_id,
    ).changes;
    if (!claimed) continue;
    const minutes = Math.max(1, Math.round((new Date(r.starts_at) - now) / 60_000));
    const when = minutes >= 55 ? '1 hour' : `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
    notifier.tell(r.user_id, { kind: 'tournament', title: `${r.name} starts in ${when}`, text: `${r.name} starts in ${when}.`, url: `/tournaments/${r.slug}` }, now);
    sent += 1;
  }
  return sent;
}

// ---- player-made -------------------------------------------------------------

export const PLAYER_NAME_MAX = 40;
export const PLAYER_PRIZE = 'Bragging rights and a Tournament champion badge';
export const PLAYER_MIN_BETS_MAX = 20;
export const PLAYER_MAX_DAYS = 14;
export const PLAYER_LEAD_MINUTES = 15;
// How many a player can have going at once (live or coming up), and make in a day. Admins have no limit.
export const PLAYER_ACTIVE_MAX = 2;
export const PLAYER_PER_DAY = 5;
export const TOURNAMENT_HIDE_AFTER = 3;

// The same letters as group and invite codes: no 0/O or 1/I/L.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
const newCode = () => Array.from(crypto.randomBytes(CODE_LENGTH), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');

/** Anything that reads as a web address. */
const LINKY = /https?:|www\.|t\.me\/|\b[a-z0-9-]+\.(?:com|net|org|io|gg|co|me|tv|ly|app|bet|us|xyz|info|biz|link|site|club|live|to)\b/i;

/**
 * A player-made tournament's name, tidied, or why it can't be one: 3 to 40
 * characters, no links, no @ mentions, nothing that passes for the official
 * account (the screen-name check, spaces ignored).
 */
export function cleanTournamentName(raw) {
  const name = String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const length = [...name].length;
  if (length < 3 || length > PLAYER_NAME_MAX) return { error: `Give it a name of 3 to ${PLAYER_NAME_MAX} characters.` };
  if (LINKY.test(name)) return { error: 'No links in the name.' };
  if (/@\w/.test(name)) return { error: 'No @ mentions in the name.' };
  if (looksOfficial(name)) return { error: 'That name could pass for the official account. Try another.' };
  return { name };
}

/**
 * A player-made tournament's own details, or null for the timer's and an
 * admin's: visibility, invite code, group, who made it, and `reports` (since
 * an admin last looked) with `hidden` once there are three.
 */
export function hostOf(store, t) {
  const row = store.get(
    `SELECT h.*, u.screen_name AS creator_name, g.name AS group_name, g.kind AS group_kind,
            (SELECT COUNT(*) FROM tournament_reports r WHERE r.tournament_id = h.tournament_id AND r.created_at > COALESCE(h.reviewed_at, '')) AS reports
       FROM player_tournaments h JOIN tournaments t ON t.id = h.tournament_id
       LEFT JOIN users u ON u.id = t.created_by LEFT JOIN friend_groups g ON g.id = h.group_id
      WHERE h.tournament_id = ?`,
    t.id,
  );
  return row ? { ...row, hidden: row.reports >= TOURNAMENT_HIDE_AFTER } : null;
}

/** The tournament a private invite code opens, canceled ones aside, or null. */
export function byCode(store, code) {
  const clean = String(code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!clean) return null;
  return store.get(
    `SELECT t.* FROM tournaments t JOIN player_tournaments h ON h.tournament_id = t.id
      WHERE h.invite_code = ? AND t.canceled_at IS NULL`,
    clean,
  ) ?? null;
}

const isMember = (store, groupId, userId) => groupId != null && userId != null
  && Boolean(store.get('SELECT 1 AS x FROM group_members WHERE group_id = ? AND user_id = ?', groupId, userId));

/** Why this player can't join a player-made tournament, or null. */
function joinProblem(store, host, userId, code) {
  if (host.hidden) return "This one is under review, so it's closed to new players for now.";
  if (host.members_only && !isMember(store, host.group_id, userId)) {
    return host.group_name ? `Only members of ${host.group_name} can join this one.` : "This one is closed to new players.";
  }
  if (host.visibility === 'private' && String(code ?? '').toUpperCase() !== host.invite_code) return 'Use the invite link to join this one.';
  return null;
}

/**
 * Whether a viewer may see a tournament, and what they are to it. Admins,
 * its maker and its entrants always may. Otherwise not a canceled one, a
 * hidden one, a private one without its code, or one for a private group
 * they're not in. A local room is public, so its tournaments are too.
 */
export function accessTo(store, t, { userId = null, admin = false, code = null } = {}) {
  const host = hostOf(store, t);
  const entry = entryOf(store, t, userId);
  const mine = Boolean(host && userId != null && t.created_by === userId);
  if (admin || mine || entry) return { see: true, host, entry, mine };
  if (t.canceled_at) return { see: false };
  if (!host) return { see: true, host, entry };
  if (host.hidden) return { see: false };
  const viaCode = code != null && String(code).toUpperCase() === host.invite_code;
  if (host.visibility === 'private' && !viaCode) return { see: false };
  if (host.group_id != null && host.group_kind !== 'local' && !viaCode && !isMember(store, host.group_id, userId)) return { see: false };
  return { see: true, host, entry, viaCode };
}

/** Who may read and post in a tournament's chat: its entrants, and in the Weekly Open everyone signed in. */
export function canChat(store, t, userId) {
  return userId != null && Boolean(entryOf(store, t, userId));
}

/** Defaults for the new-tournament form, in Eastern: starting at the top of the next hour (at least 15 minutes off), ending 11:59 PM that day or three hours later. */
export function formDefaults(now) {
  const start = new Date(Math.ceil((now.getTime() + PLAYER_LEAD_MINUTES * 60_000) / HOUR) * HOUR);
  const midnight = etToUtc(addDays(etDay(start), 1), 0);
  const end = midnight - start >= 3 * HOUR ? new Date(midnight - 60_000) : new Date(start.getTime() + 3 * HOUR - 60_000);
  const parts = (d) => {
    const day = etDay(d);
    const [h, m] = timeFmt24.format(d).split(':');
    return [dashed(day), `${h === '24' ? '00' : h}:${m}`];
  };
  const [startDate, startTime] = parts(start);
  const [endDate, endTime] = parts(end);
  return { startDate, startTime, endDate, endTime, minBets: '3', visibility: 'public' };
}
const timeFmt24 = new Intl.DateTimeFormat('en-GB', { timeZone: ET, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** The groups and local rooms a player can tie a tournament to: the ones they're in, open ones only. */
export function groupChoices(store, userId) {
  return store.all(
    `SELECT g.id, g.name, g.kind FROM friend_groups g JOIN group_members m ON m.group_id = g.id
      WHERE m.user_id = ? AND g.archived_at IS NULL ORDER BY g.kind = 'local', g.name COLLATE NOCASE`,
    userId,
  );
}

/**
 * A player's own tournament. Start and end are Eastern, the end being the
 * last minute that counts. The start is at least 15 minutes off; it runs an
 * hour to 14 days, in one or more sports, with 1 to 20 graded bets to place.
 * Public or private; a group or room ties it to that group's members (the
 * maker has to be one). Two going at once and five a day, unless `limit` is
 * false (admins). The prize is fixed. The maker is in it from the start.
 * Returns { slug, code } or { error }.
 */
export function createPlayerTournament(store, { name, sports = [], startDate, startTime, endDate, endTime, minBets, visibility, groupId = null, userId, now, limit = true }) {
  const clean = cleanTournamentName(name);
  if (clean.error) return clean;
  const keys = [...new Set(sports)];
  if (!keys.length) return { error: 'Pick at least one sport.' };
  if (keys.some((k) => !SPORT[k])) return { error: 'Pick sports from the list.' };
  const start = etInstant(startDate, startTime);
  const last = etInstant(endDate, endTime);
  if (!start || !last) return { error: 'Enter a start and an end date and time.' };
  const end = new Date(last.getTime() + 60_000);
  if (start < new Date(now.getTime() + PLAYER_LEAD_MINUTES * 60_000)) return { error: `Start it at least ${PLAYER_LEAD_MINUTES} minutes from now.` };
  if (end - start < HOUR) return { error: 'Make it at least an hour long.' };
  if (end - start > PLAYER_MAX_DAYS * 24 * HOUR) return { error: `Keep it to ${PLAYER_MAX_DAYS} days or less.` };
  const min = Number(minBets);
  if (!Number.isInteger(min) || min < 1 || min > PLAYER_MIN_BETS_MAX) return { error: `Set the minimum to a whole number from 1 to ${PLAYER_MIN_BETS_MAX}.` };
  if (!['public', 'private'].includes(visibility)) return { error: 'Pick Public or Private.' };
  let group = null;
  if (groupId != null && groupId !== '') {
    group = groupChoices(store, userId).find((g) => g.id === Number(groupId)) ?? null;
    if (!group) return { error: "Pick a group or room you're in." };
  }
  const at = now.toISOString();
  if (limit) {
    const going = store.get(
      `SELECT COUNT(*) AS n FROM tournaments t JOIN player_tournaments h ON h.tournament_id = t.id
        WHERE t.created_by = ? AND t.canceled_at IS NULL AND t.ends_at > ?`,
      userId, at,
    ).n;
    if (going >= PLAYER_ACTIVE_MAX) return { error: `You can have ${PLAYER_ACTIVE_MAX} tournaments going at once. Make another when one ends.` };
    const today = store.get(
      `SELECT COUNT(*) AS n FROM tournaments t JOIN player_tournaments h ON h.tournament_id = t.id
        WHERE t.created_by = ? AND t.created_at > ?`,
      userId, new Date(now.getTime() - 24 * HOUR).toISOString(),
    ).n;
    if (today >= PLAYER_PER_DAY) return { error: `You can make ${PLAYER_PER_DAY} tournaments a day. Try again tomorrow.` };
  }
  return store.tx(() => {
    const slug = freeSlug(store, clean.name, start);
    const id = Number(store.run(
      `INSERT INTO tournaments (slug, name, sports, starts_at, ends_at, min_bets, prize, kind, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'custom', ?, ?)`,
      slug, clean.name, keys.join(','), start.toISOString(), end.toISOString(), min, PLAYER_PRIZE, userId, at,
    ).lastInsertRowid);
    let code = newCode();
    while (store.get('SELECT 1 AS x FROM player_tournaments WHERE invite_code = ?', code)) code = newCode();
    store.run(
      'INSERT INTO player_tournaments (tournament_id, visibility, invite_code, group_id, members_only) VALUES (?, ?, ?, ?, ?)',
      id, visibility, code, group?.id ?? null, group ? 1 : 0,
    );
    store.run('INSERT INTO tournament_entries (tournament_id, user_id, joined_at) VALUES (?, ?, ?)', id, userId, at);
    return { slug, code };
  });
}

/** Report a player-made tournament, once per player. Its maker can't. */
export function reportTournament(store, t, userId, now) {
  if (!hostOf(store, t)) return { error: 'Only player-made tournaments can be reported.' };
  if (t.created_by === userId) return { error: "You can't report your own tournament." };
  const { changes } = store.run(
    'INSERT OR IGNORE INTO tournament_reports (tournament_id, user_id, created_at) VALUES (?, ?, ?)',
    t.id, userId, now.toISOString(),
  );
  return changes ? { ok: true } : { error: "You've already reported this one." };
}

export const reportedByMe = (store, t, userId) => userId != null
  && Boolean(store.get('SELECT 1 AS x FROM tournament_reports WHERE tournament_id = ? AND user_id = ?', t.id, userId));

/** An admin looked and it's fine: its reports so far stop counting, so it's listed again. */
export function dismissTournamentReports(store, t, now) {
  return store.run('UPDATE player_tournaments SET reviewed_at = ? WHERE tournament_id = ?', now.toISOString(), t.id).changes > 0;
}

/** Player-made tournaments with reports since an admin last looked, hidden ones first. For /admin/tournaments. */
export function reportedTournaments(store) {
  return store.all(
    `SELECT t.*, u.screen_name AS creator_name, h.visibility,
            (SELECT COUNT(*) FROM tournament_reports r WHERE r.tournament_id = t.id AND r.created_at > COALESCE(h.reviewed_at, '')) AS reports,
            (SELECT MAX(r.created_at) FROM tournament_reports r WHERE r.tournament_id = t.id) AS last_report
       FROM tournaments t JOIN player_tournaments h ON h.tournament_id = t.id LEFT JOIN users u ON u.id = t.created_by
      WHERE t.canceled_at IS NULL AND t.closed_at IS NULL
        AND (SELECT COUNT(*) FROM tournament_reports r WHERE r.tournament_id = t.id AND r.created_at > COALESCE(h.reviewed_at, '')) > 0
      ORDER BY reports >= ? DESC, last_report DESC`,
    TOURNAMENT_HIDE_AFTER,
  ).map((t) => ({ ...t, window: windowLabel(t), hidden: t.reports >= TOURNAMENT_HIDE_AFTER }));
}

/** The invite link a maker copies: the code link for a private one, the page for a public one. */
export const invitePath = (t, host) => (host.visibility === 'private' ? `/t/${host.invite_code}` : `/tournaments/${t.slug}`);

// ---- as it stands (live) -------------------------------------------------------

const inPlay = (row) => row.state === 'in' && row.home_score != null && row.away_score != null;
const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Open bets that a game in progress decides for now: each graded at the
 * current score with the same code as a final (grade, then profit or
 * settleParlay). A parlay counts only once its legs say how it stands (a
 * live leg losing loses it; every leg won or pushed, live or final, settles
 * it). Returns { user_id, units, game_start, result, profit }. Never written.
 */
function provisional(store, open) {
  const out = [];
  const marks = (list) => list.map(() => '?').join(',');
  const picks = open.filter((b) => b.kind === 'pick');
  if (picks.length) {
    const byId = new Map(picks.map((b) => [b.id, b]));
    const rows = store.all(
      `SELECT p.id, p.market, p.side, p.line, p.odds, p.units, g.state, g.home_score, g.away_score
         FROM picks p JOIN games g ON g.id = p.game_id WHERE p.id IN (${marks(picks)})`,
      ...picks.map((b) => b.id),
    );
    for (const p of rows) {
      if (!inPlay(p)) continue;
      const result = grade(p, p.home_score, p.away_score);
      out.push({ ...byId.get(p.id), result, profit: profit(result, p.odds, p.units) });
    }
  }
  const parlays = open.filter((b) => b.kind === 'parlay');
  if (parlays.length) {
    const legs = new Map();
    for (const l of store.all(
      `SELECT l.parlay_id, l.market, l.side, l.line, l.odds, l.result, g.state, g.home_score, g.away_score
         FROM parlay_legs l JOIN games g ON g.id = l.game_id WHERE l.parlay_id IN (${marks(parlays)})`,
      ...parlays.map((b) => b.id),
    )) {
      const live = !l.result && inPlay(l);
      const list = legs.get(l.parlay_id) ?? legs.set(l.parlay_id, []).get(l.parlay_id);
      list.push({ odds: l.odds, result: l.result ?? (live ? grade(l, l.home_score, l.away_score) : null), live });
    }
    for (const b of parlays) {
      const list = legs.get(b.id) ?? [];
      if (!list.some((l) => l.live)) continue;
      const settled = settleParlay(list, b.units);
      if (settled) out.push({ ...b, result: settled.result, profit: settled.profit });
    }
  }
  return out;
}

/**
 * "As it stands": a live tournament's standings with bets on games in
 * progress counted at the current score. Each row has `live` (how many of
 * its bets are provisional) and `move`: places up (+) or down (−) against
 * the graded-only order. Ranked by the same rules as the real standings.
 */
export function liveStandingsOf(store, t) {
  const window = windowOf(t);
  const graded = windowStandings(store, window, 100_000);
  const bets = provisional(store, openBetsIn(store, window));
  const rows = new Map(graded.map((r) => [r.id, { ...r, live: 0 }]));
  // The Weekly Open lists everyone with a graded bet; someone whose only bets are live joins it here.
  const missing = [...new Set(bets.map((b) => b.user_id))].filter((id) => !rows.has(id));
  if (missing.length) {
    for (const u of store.all(
      `SELECT id, screen_name, official FROM users
        WHERE id IN (${missing.map(() => '?').join(',')}) AND screen_name IS NOT NULL AND email_verified_at IS NOT NULL`,
      ...missing,
    )) rows.set(u.id, { ...withRates({ id: u.id, screen_name: u.screen_name, official: u.official, risked: 0 }), live: 0, last_start: null });
  }
  for (const b of bets) {
    const r = rows.get(b.user_id);
    if (!r) continue;
    r.wins += b.result === 'win' ? 1 : 0;
    r.losses += b.result === 'loss' ? 1 : 0;
    r.pushes += b.result === 'push' ? 1 : 0;
    r.units = round2(r.units + b.profit);
    r.risked = (r.risked ?? 0) + (b.result === 'push' ? 0 : b.units);
    r.live += 1;
    if (!r.last_start || b.game_start > r.last_start) r.last_start = b.game_start;
  }
  const before = new Map(graded.map((r, i) => [r.id, i]));
  return rankStandings([...rows.values()].map((r) => ({ ...withRates(r), live: r.live })), window.min ?? CONTEST_MIN)
    .map((r, i) => ({ ...r, move: before.has(r.id) ? before.get(r.id) - i : 0 }));
}

// ---- where you stand -----------------------------------------------------------

export const MOVE_QUIET_HOURS = 2;
export const FINAL_ALERT_HOURS = 2;
// "2 hours left" goes out in the first 15 minutes of the last two hours, so a server that was down doesn't send it late.
const FINAL_ALERT_SLACK = 15 * 60_000;
export const FINAL_ALERT_RANKS = 10;
export const FINAL_ALERT_UNITS = 5;

const ordinal = (n) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;
const plainUnits = (n) => formatUnits(round2(Math.abs(n)));

/** Tournaments whose graded standings can still move: started, not final, not canceled. Not the Weekly Open (it's the contest's). */
function moving(store, now) {
  return store.all(
    `SELECT * FROM tournaments WHERE kind != 'weekly' AND canceled_at IS NULL AND closed_at IS NULL AND starts_at <= ? AND ends_at > ?`,
    now.toISOString(), new Date(now.getTime() - CLOSE_AFTER_HOURS * HOUR).toISOString(),
  );
}

/**
 * "You moved into 2nd in Hoops Night (+3.4u).": to an entrant who enters
 * the graded top 3, or moves up to a better place in it. At most one per
 * player per tournament every 2 hours, and only with Tournament updates on.
 * The place seen is kept on the entry, so a restart (or running this again)
 * sends nothing twice. Run after every grading. Returns how many went.
 */
export function sendMoveAlerts(store, now, notifier) {
  let sent = 0;
  const quiet = new Date(now.getTime() - MOVE_QUIET_HOURS * HOUR).toISOString();
  for (const t of moving(store, now)) {
    const rows = standingsOf(store, t, 100_000);
    const entries = new Map(store.all(
      `SELECT e.user_id, e.alert_place, e.moved_at, u.notify_tournament_updates AS on_ FROM tournament_entries e JOIN users u ON u.id = e.user_id
        WHERE e.tournament_id = ?`,
      t.id,
    ).map((e) => [e.user_id, e]));
    for (const e of entries.values()) {
      const row = rows.find((r) => r.id === e.user_id);
      const place = row?.rank && row.rank <= 3 ? row.rank : null;
      if (place === e.alert_place) continue;
      const better = place != null && (e.alert_place == null || place < e.alert_place);
      const tell = better && e.on_ && (!e.moved_at || e.moved_at <= quiet);
      // Claimed on the entry first: only the call that changes the place can send.
      const { changes } = store.run(
        `UPDATE tournament_entries SET alert_place = ?, moved_at = CASE WHEN ? THEN ? ELSE moved_at END
          WHERE tournament_id = ? AND user_id = ? AND alert_place IS ?`,
        place, tell ? 1 : 0, now.toISOString(), t.id, e.user_id, e.alert_place,
      );
      if (!changes || !tell) continue;
      const text = `You moved into ${ordinal(place)} in ${t.name} (${signedUnits(row.units)}).`;
      if (notifier?.tell(e.user_id, { kind: 'tournament', text, url: `/tournaments/${t.slug}` }, now)) sent += 1;
    }
  }
  return sent;
}

/**
 * "2 hours left in NFL Sunday. You're 1.4u out of first.": once, about two
 * hours before the end, to entrants who have placed and sit 2nd to 10th
 * within 5u of first; the leader hears "You're in first by 2.1u." Only with
 * Tournament updates on; marked on the entry first, so it goes once.
 */
export function sendFinalHoursAlerts(store, now, notifier) {
  const at = now.getTime();
  let sent = 0;
  for (const t of moving(store, now)) {
    const end = new Date(t.ends_at).getTime();
    const from = end - FINAL_ALERT_HOURS * HOUR;
    if (at < from || at >= from + FINAL_ALERT_SLACK || at < new Date(t.starts_at).getTime()) continue;
    const ranked = standingsOf(store, t, 100_000).filter((r) => r.rank);
    const [first, second] = ranked;
    if (!first) continue;
    const on = new Set(store.all(
      `SELECT e.user_id FROM tournament_entries e JOIN users u ON u.id = e.user_id
        WHERE e.tournament_id = ? AND e.final_alert_at IS NULL AND u.notify_tournament_updates = 1 AND u.official = 0`,
      t.id,
    ).map((e) => e.user_id));
    for (const r of ranked.slice(0, FINAL_ALERT_RANKS)) {
      if (!on.has(r.id)) continue;
      const gap = round2(first.units - r.units);
      if (r.rank > 1 && gap > FINAL_ALERT_UNITS) continue;
      let where;
      if (r.rank === 1) {
        const lead = second ? round2(first.units - second.units) : null;
        where = lead == null ? "You're in first." : lead > 0 ? `You're in first by ${plainUnits(lead)}.` : "You're in first on the tiebreak.";
      } else {
        where = gap > 0 ? `You're ${plainUnits(gap)} out of first.` : "You're level with first on units.";
      }
      const claimed = store.run(
        'UPDATE tournament_entries SET final_alert_at = ? WHERE tournament_id = ? AND user_id = ? AND final_alert_at IS NULL',
        now.toISOString(), t.id, r.id,
      ).changes;
      if (!claimed) continue;
      const left = `${FINAL_ALERT_HOURS} hours left in ${t.name}.`;
      if (notifier?.tell(r.id, { kind: 'tournament', title: left, text: `${left} ${where}`, url: `/tournaments/${t.slug}` }, now)) sent += 1;
    }
  }
  return sent;
}

// ---- pages -----------------------------------------------------------------

/**
 * Where a player stands in a tournament, for its card: null (not in it),
 * { joined } (in, no rank yet) or { rank } (placed). A closed one reads its
 * frozen podium first.
 */
function statusIn(store, t, userId, now) {
  const entry = entryOf(store, t, userId);
  if (!entry) return null;
  if (phase(t, now) === 'soon') return { joined: true, everyone: Boolean(entry.everyone) };
  const podium = podiumOf(store, t);
  const place = podium?.find((r) => r.id === userId)?.place;
  if (place) return { rank: place, everyone: Boolean(entry.everyone) };
  const row = standingsOf(store, t, 100_000).find((r) => r.id === userId);
  return row?.rank ? { rank: row.rank, everyone: Boolean(entry.everyone) } : { joined: true, everyone: Boolean(entry.everyone) };
}

/**
 * A tournament with what its card needs. A player-made one carries `host`
 * (who made it, public or private, its group), `href` (the invite link for
 * a private one) and `membersOnly` when the viewer isn't in its group.
 */
export function cardOf(store, t, userId, now) {
  const host = hostOf(store, t);
  return {
    ...t,
    phase: phase(t, now),
    sportList: sportsOf(t),
    window: windowLabel(t),
    clock: clockText(t, now),
    entrants: t.kind === 'weekly' ? null : entrantCount(store, t),
    me: userId ? statusIn(store, t, userId, now) : null,
    podium: phase(t, now) === 'finished' ? podiumOf(store, t) : null,
    host,
    href: host?.visibility === 'private' ? `/t/${host.invite_code}` : `/tournaments/${t.slug}`,
    membersOnly: Boolean(host?.members_only && !isMember(store, host.group_id, userId)),
  };
}

/**
 * Which tournaments the public lists show, as SQL on tournaments t: the
 * timer's and admins', and player-made ones that are public, not hidden by
 * reports, and not tied to a private group (a local room is public).
 */
const LISTED = `(NOT EXISTS (SELECT 1 FROM player_tournaments h WHERE h.tournament_id = t.id)
  OR EXISTS (SELECT 1 FROM player_tournaments h LEFT JOIN friend_groups g ON g.id = h.group_id
              WHERE h.tournament_id = t.id AND h.visibility = 'public' AND (h.group_id IS NULL OR g.kind = 'local')
                AND (SELECT COUNT(*) FROM tournament_reports r WHERE r.tournament_id = t.id AND r.created_at > COALESCE(h.reviewed_at, '')) < ${TOURNAMENT_HIDE_AFTER}))`;
const PLAYER_MADE = 'EXISTS (SELECT 1 FROM player_tournaments h WHERE h.tournament_id = t.id)';

/**
 * The hub: live now (ending soonest first), starting soon, player
 * tournaments (public player-made ones, live or coming up), and the last few
 * finished.
 */
export function hub(store, now, userId = null) {
  const at = now.toISOString();
  const live = store.all(`SELECT * FROM tournaments t WHERE canceled_at IS NULL AND starts_at <= ? AND ends_at > ? AND NOT ${PLAYER_MADE} ORDER BY ends_at, starts_at, id`, at, at);
  const soon = store.all(`SELECT * FROM tournaments t WHERE canceled_at IS NULL AND starts_at > ? AND NOT ${PLAYER_MADE} ORDER BY starts_at, id`, at);
  const players = store.all(`SELECT * FROM tournaments t WHERE canceled_at IS NULL AND ends_at > ? AND ${PLAYER_MADE} AND ${LISTED} ORDER BY starts_at, id`, at);
  const finished = store.all(`SELECT * FROM tournaments t WHERE canceled_at IS NULL AND ends_at <= ? AND ${LISTED} ORDER BY ends_at DESC, id DESC LIMIT ?`, at, FINISHED_SHOWN);
  const card = (t) => cardOf(store, t, userId, now);
  return { live: live.map(card), soon: soon.map(card), players: players.map(card), finished: finished.map(card) };
}

/** A group's or local room's own tournaments, for its page: live and coming up first, then the last few finished. */
export function groupTournaments(store, groupId, userId, now) {
  const at = now.toISOString();
  return store.all(
    `SELECT t.* FROM tournaments t JOIN player_tournaments h ON h.tournament_id = t.id
      WHERE h.group_id = ? AND t.canceled_at IS NULL
        AND (SELECT COUNT(*) FROM tournament_reports r WHERE r.tournament_id = t.id AND r.created_at > COALESCE(h.reviewed_at, '')) < ?
      ORDER BY t.ends_at <= ?, CASE WHEN t.ends_at > ? THEN t.starts_at END, t.ends_at DESC LIMIT 10`,
    groupId, TOURNAMENT_HIDE_AFTER, at, at,
  ).map((t) => cardOf(store, t, userId, now));
}

/** For the winners wall: every closed tournament but the weekly ones (those have their own wall) and unlisted player-made ones, newest first, and the most wins. */
export function tournamentWinners(store, limit = 50) {
  const list = store.all(
    `SELECT * FROM tournaments t WHERE kind != 'weekly' AND closed_at IS NOT NULL AND ${LISTED} ORDER BY ends_at DESC, id DESC LIMIT ?`,
    limit,
  ).map((t) => ({ ...t, window: windowLabel(t), sportList: sportsOf(t), podium: podiumOf(store, t) }));
  const champions = store.all(
    `SELECT u.screen_name, COUNT(*) AS wins FROM tournament_results r JOIN users u ON u.id = r.user_id
      WHERE r.place = 1 GROUP BY r.user_id ORDER BY wins DESC, lower(u.screen_name) LIMIT 10`,
  );
  return { list, champions };
}

/** Upcoming and live tournaments, for the admin page. */
export function adminList(store, now) {
  const at = now.toISOString();
  return store.all('SELECT * FROM tournaments WHERE canceled_at IS NULL AND ends_at > ? ORDER BY starts_at, id', at)
    .map((t) => ({ ...t, phase: phase(t, now), window: windowLabel(t), sportList: sportsOf(t), entrants: entrantCount(store, t), host: hostOf(store, t) }));
}
