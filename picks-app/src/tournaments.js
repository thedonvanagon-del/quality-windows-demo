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
//
// Joining is free and one tap, any time before the end. Only bets made after
// joining count, on games that start inside the window and match its sports
// (a parlay only when every leg does). You can leave until the start. The
// standings and closing are the weekly contest's, for any window: units on
// graded bets, a minimum to place, ties to the better ROI and then to whose
// last counted bet started first. A tournament closes once, after its end,
// when every counted bet is graded or 30 hours after the end at the latest;
// its top 3 are written once, told, and get badges.

import { checkBadges } from './badges.js';
import { CONTEST_MIN, closeWindow, dueToClose, results, timeLeft, windowStandings } from './contest.js';
import { formatUnits } from './picks.js';
import { SPORT } from './sports.js';
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
  const base = `${slugify(name)}-${dashed(etDay(start))}`;
  let slug = base;
  for (let i = 2; store.get('SELECT 1 AS x FROM tournaments WHERE slug = ?', slug); i++) slug = `${base}-${i}`;
  store.run(
    `INSERT INTO tournaments (slug, name, sports, starts_at, ends_at, min_bets, prize, kind, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'custom', ?, ?)`,
    slug, name, keys.length ? keys.join(',') : null, start.toISOString(), end.toISOString(), min, prize || PRIZE, userId, now.toISOString(),
  );
  return { slug };
}

/** Cancel a tournament before it starts, and tell whoever joined. The Weekly Open can't be canceled. */
export function cancelTournament(store, t, now, notifier = null) {
  if (t.kind === 'weekly') return { error: "The Weekly Open can't be canceled." };
  const { changes } = store.run(
    'UPDATE tournaments SET canceled_at = ? WHERE id = ? AND canceled_at IS NULL AND starts_at > ?',
    now.toISOString(), t.id, now.toISOString(),
  );
  if (!changes) return { error: "It's already started, so it can't be canceled." };
  for (const e of store.all('SELECT user_id FROM tournament_entries WHERE tournament_id = ?', t.id)) {
    notifier?.tell(e.user_id, { kind: 'tournament', text: `${t.name} was canceled before it started.`, url: '/tournaments' }, now);
  }
  return { ok: true };
}

// ---- joining ---------------------------------------------------------------

/** Join, free, any time before the end. Only bets made from now on count. */
export function joinTournament(store, t, userId, now) {
  if (t.kind === 'weekly') return { error: "Everyone's in this one. No need to join." };
  if (store.get('SELECT official FROM users WHERE id = ?', userId)?.official) return { error: "The official account doesn't play in tournaments." };
  if (phase(t, now) === 'finished') return { error: 'This one is over.' };
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

/** A tournament with what its card needs. */
export function cardOf(store, t, userId, now) {
  return {
    ...t,
    phase: phase(t, now),
    sportList: sportsOf(t),
    window: windowLabel(t),
    clock: clockText(t, now),
    entrants: t.kind === 'weekly' ? null : entrantCount(store, t),
    me: userId ? statusIn(store, t, userId, now) : null,
    podium: phase(t, now) === 'finished' ? podiumOf(store, t) : null,
  };
}

/** The hub: live now (ending soonest first), starting soon, and the last few finished. */
export function hub(store, now, userId = null) {
  const at = now.toISOString();
  const live = store.all('SELECT * FROM tournaments WHERE canceled_at IS NULL AND starts_at <= ? AND ends_at > ? ORDER BY ends_at, starts_at, id', at, at);
  const soon = store.all('SELECT * FROM tournaments WHERE canceled_at IS NULL AND starts_at > ? ORDER BY starts_at, id', at);
  const finished = store.all('SELECT * FROM tournaments WHERE canceled_at IS NULL AND ends_at <= ? ORDER BY ends_at DESC, id DESC LIMIT ?', at, FINISHED_SHOWN);
  const card = (t) => cardOf(store, t, userId, now);
  return { live: live.map(card), soon: soon.map(card), finished: finished.map(card) };
}

/** For the winners wall: every closed tournament but the weekly ones (those have their own wall), newest first, and the most wins. */
export function tournamentWinners(store, limit = 50) {
  const list = store.all(
    "SELECT * FROM tournaments WHERE kind != 'weekly' AND closed_at IS NOT NULL ORDER BY ends_at DESC, id DESC LIMIT ?",
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
    .map((t) => ({ ...t, phase: phase(t, now), window: windowLabel(t), sportList: sportsOf(t), entrants: entrantCount(store, t) }));
}
