// www.bookiebullies.com inside the app: links to the site (with UTM tags, so
// the site can tell what the app sends), the official account's picks on the
// games board, and the "Today's Locks" card. The site's address is one
// setting, SITE_URL in config.js.

import { SITE_URL } from './config.js';
import { addDays, etDay, etToUtc } from './time.js';

/**
 * A link to the site with UTM tags: utm_source=app and utm_medium naming the
 * spot in the app ("bb_chip", "locks_card", "more_menu", "ticket", ...).
 * `path` is a page on the site, "/" by default.
 */
export function siteLink(base, medium, path = '/') {
  const url = new URL(path, `${String(base || SITE_URL).replace(/\/+$/, '')}/`);
  url.searchParams.set('utm_source', 'app');
  url.searchParams.set('utm_medium', medium);
  return url.href;
}

/** "bookiebullies.com": the site's host to show people, without the www. */
export function siteHost(base) {
  try {
    return new URL(base || SITE_URL).host.replace(/^www\./, '');
  } catch {
    return 'bookiebullies.com';
  }
}

/** Whether the player wants the official account's picks on the board (on unless they turned it off). */
export const showsSitePicks = (user) => Boolean(user) && user.showBb !== false;

/**
 * The official account's open picks on these games, in one query: game id ->
 * picks, the lock first, then the most confident. Each has market, side,
 * line, odds, units, lock, conf and the account's screen name.
 */
export function officialOnGames(store, gameIds) {
  const out = new Map();
  if (!gameIds.length) return out;
  const rows = store.all(
    `SELECT p.id, p.game_id, p.market, p.side, p.line, p.odds, p.units, o.is_lock, o.conf, u.screen_name
       FROM picks p JOIN users u ON u.id = p.user_id AND u.official = 1
       LEFT JOIN official_picks o ON o.pick_id = p.id
      WHERE p.result IS NULL AND p.game_id IN (SELECT value FROM json_each(?))
      ORDER BY p.game_id, COALESCE(o.is_lock, 0) DESC, COALESCE(o.conf, 0) DESC, p.id`,
    JSON.stringify(gameIds),
  );
  for (const r of rows) {
    if (!out.has(r.game_id)) out.set(r.game_id, []);
    out.get(r.game_id).push({
      id: r.id, market: r.market, side: r.side, line: r.line, odds: r.odds, units: r.units,
      lock: Boolean(r.is_lock), conf: r.conf ?? null, name: r.screen_name,
    });
  }
  return out;
}

/**
 * Today's (ET) official picks, every sport, by the game's start: how many,
 * how many are Locks, and the account's screen name. Null when there are none.
 */
export function todaysSitePicks(store, now) {
  const today = etDay(now);
  const row = store.get(
    `SELECT COUNT(*) AS picks, COALESCE(SUM(o.is_lock), 0) AS locks, MIN(u.screen_name) AS name
       FROM picks p JOIN users u ON u.id = p.user_id AND u.official = 1
       LEFT JOIN official_picks o ON o.pick_id = p.id
      WHERE p.game_start >= ? AND p.game_start < ?`,
    etToUtc(today, 0).toISOString(), etToUtc(addDays(today, 1), 0).toISOString(),
  );
  return row.picks ? { picks: row.picks, locks: row.locks, name: row.name } : null;
}

/** Whether the player closed the Locks card today (ET). It comes back the next ET day. */
export const locksCardHidden = (user, now) => user?.bbHiddenDay === etDay(now);

/** Hide the Locks card until the next ET day. */
export function hideLocksCard(store, userId, now) {
  store.run('UPDATE users SET bb_card_hidden_day = ? WHERE id = ?', etDay(now), userId);
}

/** Turn the official account's picks on the board (chips, the Locks card, the ticket line) on or off. */
export function setShowSitePicks(store, userId, on) {
  store.run('UPDATE users SET show_bb = ? WHERE id = ?', on ? 1 : 0, userId);
}
