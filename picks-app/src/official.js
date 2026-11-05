// The official BookieBullies account: the site's model picks, posted into the
// app under one account with a record like everyone else's. A timer reads the
// site's picks log (one JSON object per line) and makes each pick the normal
// way: at the app's current line, before the game starts, one per market.
//
// Only moneylines and spreads (run lines) come over. Totals rows don't say
// over or under, and first-five-innings bets have no market in the app.

import { isLocked, makePick, maxUnits, price, UNITS_MIN } from './picks.js';
import { addDays, etDay } from './time.js';

export const OFFICIAL_NAME = 'BookieBullies';
// Not an email address, so nobody can sign up with it, reset it or log in.
const OFFICIAL_EMAIL = 'official-account';

const SPORT_OF = { MLB: 'mlb', NBA: 'nba', CBB: 'ncaab' };
const MARKET_OF = { ML: 'ml', RL: 'spread' };
export const MIN_CONF = 3;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_BYTES = 5 * 1024 * 1024;

/** The official account's id, made the first time it's needed. Null if its name is somehow taken. */
export function ensureOfficial(store, now) {
  const found = store.get('SELECT id FROM users WHERE official = 1 ORDER BY id LIMIT 1');
  if (found) return found.id;
  if (store.get('SELECT 1 AS x FROM users WHERE screen_name = ?', OFFICIAL_NAME)) return null;
  const at = now.toISOString();
  return Number(store.run(
    `INSERT INTO users (email, password_hash, screen_name, created_at, age_confirmed_at, terms_accepted_at,
                        email_verified_at, official, setup_done, bio, notify_settled, notify_follows)
     VALUES (?, '!', ?, ?, ?, ?, ?, 1, 1, ?, 0, 0)`,
    OFFICIAL_EMAIL, OFFICIAL_NAME, at, at, at, at,
    "The Bookie Bullies model's picks from bookiebullies.com, posted here at the app's line and graded like everyone else's.",
  ).lastInsertRowid);
}

/** The id the picks log row is kept under: its date and its id, since ids repeat day to day. */
export const sourceId = (row) => `${row.date}:${row.id}`;

/** Rows from the log that could be imported today: parsed, the right kind, sure enough, and for today or tomorrow. */
export function eligibleRows(text, now) {
  const today = etDay(now);
  const days = new Set([today, addDays(today, 1)]);
  const out = [];
  for (const line of String(text).split('\n')) {
    if (!line.trim()) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (!row || typeof row !== 'object') continue;
    const sport = SPORT_OF[row.sport];
    const market = MARKET_OF[row.type];
    const units = Number(row.unit);
    if (!sport || !market) continue;
    if (typeof row.date !== 'string' || !days.has(row.date.replaceAll('-', ''))) continue;
    if (!(Number(row.conf) >= MIN_CONF) || !(units >= UNITS_MIN)) continue;
    if (!/^\d+$/.test(String(row.event_id ?? '')) || !row.id || typeof row.pick !== 'string') continue;
    out.push({ row, sport, market, units, gameId: `${sport}:${row.event_id}` });
  }
  return out;
}

/** Which side of the game the row's team is on. */
function sideOf(row, game) {
  const pick = row.pick.trim().toUpperCase();
  if (pick === game.home.abbr.toUpperCase()) return 'home';
  if (pick === game.away.abbr.toUpperCase()) return 'away';
  // The site and ESPN can spell a team differently; the row's own home and away still line up.
  if (pick === String(row.home ?? '').toUpperCase()) return 'home';
  if (pick === String(row.away ?? '').toUpperCase()) return 'away';
  return null;
}

export function createOfficialImporter({ store, games, url, fetch = globalThis.fetch, now = () => new Date(), log = console, notifier = null, timeoutMs = FETCH_TIMEOUT_MS }) {
  let running = null;

  async function load() {
    const res = await fetch(url, { headers: { 'user-agent': 'bookiebullies-app/0.1' }, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw new Error(`answered ${res.status}`);
    const text = await res.text();
    if (text.length > MAX_BYTES) throw new Error('the log is too big');
    return text;
  }

  async function importOnce() {
    const at = now();
    let text;
    try {
      text = await load();
    } catch (err) {
      log.warn(`official picks: ${url}: ${err.message}`);
      return { imported: 0, skipped: [], error: err.message };
    }
    const userId = ensureOfficial(store, at);
    if (!userId) {
      log.error(`official picks: the name ${OFFICIAL_NAME} belongs to someone else`);
      return { imported: 0, skipped: [], error: 'no official account' };
    }
    const player = { id: userId, screenName: store.get('SELECT screen_name FROM users WHERE id = ?', userId).screen_name };
    const done = new Set(store.all('SELECT source_id FROM official_picks').map((r) => r.source_id));
    const boards = new Set();
    const skipped = [];
    let imported = 0;
    for (const { row, sport, market, units, gameId } of eligibleRows(text, at)) {
      const id = sourceId(row);
      if (done.has(id)) continue;
      const skip = (reason) => skipped.push({ id, reason });
      try {
        // The sport's board first, so games nobody has opened yet are there, then this game's latest line.
        if (!boards.has(sport)) {
          boards.add(sport);
          await games.upcoming(sport);
        }
        const { game, stale } = await games.current(gameId);
        const t = now();
        if (!game) skip('no such game');
        else if (isLocked(game, t)) skip('started');
        else if (stale) skip('lines are stale');
        else {
          const side = sideOf(row, game);
          const current = side && price(game, market, side);
          if (!side) skip('team not in the game');
          else if (!current) skip('no price');
          else {
            const size = Math.round(Math.min(units, maxUnits(current.odds)) * 100) / 100;
            const result = store.tx(() => {
              const made = makePick(store, { userId, game, market, side, units: size, now: t });
              if (!made.error) {
                store.run(
                  'INSERT INTO official_picks (source_id, pick_id, is_lock, conf, imported_at) VALUES (?, ?, ?, ?, ?)',
                  id, made.id, row.is_lock === true ? 1 : 0, Number(row.conf) || null, t.toISOString(),
                );
              }
              return made;
            });
            if (result.error) skip(result.error);
            else {
              imported += 1;
              done.add(id);
              notifier?.pickMade({ player, game, now: t });
            }
          }
        }
      } catch (err) {
        log.error(`official picks: ${id}: ${err.message}`);
        skip(err.message);
      }
    }
    return { imported, skipped };
  }

  return {
    /** Read the log and import what's new. Never throws; overlapping calls share one run. */
    run() {
      running ??= importOnce().finally(() => (running = null));
      return running;
    },
  };
}
