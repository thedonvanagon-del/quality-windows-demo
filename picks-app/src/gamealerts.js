// "Follow a game": a player taps the bell on a game and hears about it in the
// inbox and on their phone. Five alerts, each one a setting (all on to start)
// that applies to every game they follow: the start, lead changes, a close
// finish, the score at the break, and the final.
//
// A timer in server.js runs checkGameAlerts about once a minute. It compares
// each followed game with the last state it saw (game_watch) and writes the
// new state, and which alerts went, before anything is sent, so a restart
// never sends one twice.

import { VOID_STATUSES } from './espn.js';
import { toGame } from './games.js';
import { settledHead } from './notify.js';
import { formatUnits, selection } from './picks.js';

/** The most open games (not final) a player can follow at once. */
export const FOLLOW_CAP = 30;
// A game that started more than this long ago, that the check wasn't already
// tracking (the feature's first run, or a long restart), sends nothing.
const STALE_AFTER = 6 * 60 * 60_000;
// "Tracking" means the check looked at the game this recently.
const TRACKED_WITHIN = 10 * 60_000;
// The check looks at a followed game from this long before its start.
const LOOK_AHEAD = 5 * 60_000;
// The timer reads ESPN for followed games on now or starting this soon.
const REFRESH_AHEAD = 2 * 60_000;
// A game ESPN still calls in progress this long after its start is stuck (games.js LIVE_WINDOW).
const LIVE_WINDOW = 12 * 60 * 60_000;

/** The five alerts, in the order the settings show them. `column` is on users. */
export const GAME_ALERTS = [
  { key: 'start', column: 'alert_start', label: 'Game starts' },
  { key: 'lead', column: 'alert_lead', label: 'Lead changes' },
  { key: 'close', column: 'alert_close', label: 'Close finish', sub: 'Within one score late in the game' },
  { key: 'break', column: 'alert_break', label: 'Score at the break', sub: 'Halftime and end of periods' },
  { key: 'final', column: 'alert_final', label: 'Final score' },
];
const COLUMN = Object.fromEntries(GAME_ALERTS.map((a) => [a.key, a.column]));

// ---- following ----------------------------------------------------------------

/** Which of these games the player follows. */
export function followedGameIds(store, userId, gameIds) {
  const ids = [...new Set(gameIds)];
  if (!userId || !ids.length) return new Set();
  const out = new Set();
  // SQLite caps bound values; a board never comes close, but chunk anyway.
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    for (const r of store.all(`SELECT game_id FROM game_follows WHERE user_id = ? AND game_id IN (${chunk.map(() => '?').join(',')})`, userId, ...chunk)) {
      out.add(r.game_id);
    }
  }
  return out;
}

export const isFollowingGame = (store, userId, gameId) => Boolean(store.get('SELECT 1 AS x FROM game_follows WHERE user_id = ? AND game_id = ?', userId, gameId));

/** How many open games (not final, not stuck) the player follows. */
export function openFollowCount(store, userId, now = new Date()) {
  return store.get(
    `SELECT COUNT(*) AS n FROM game_follows f JOIN games g ON g.id = f.game_id
      WHERE f.user_id = ? AND g.state != 'post' AND g.start_time >= ?`,
    userId, new Date(now.getTime() - LIVE_WINDOW).toISOString(),
  ).n;
}

/**
 * Follow a game. Finished games can't be followed, and a player follows at
 * most FOLLOW_CAP open games. Returns { ok } or { error }.
 */
export function followGame(store, { userId, game, now = new Date() }) {
  if (isFollowingGame(store, userId, game.id)) return { ok: true, already: true };
  if (game.state === 'post' || game.completed) return { error: "That game is over, so there's nothing left to follow." };
  if (openFollowCount(store, userId, now) >= FOLLOW_CAP) {
    return { error: `You're following ${FOLLOW_CAP} games, the most at once. Unfollow one first.` };
  }
  store.tx(() => {
    store.run('INSERT OR IGNORE INTO game_follows (user_id, game_id, created_at) VALUES (?, ?, ?)', userId, game.id, now.toISOString());
    watchFrom(store, game, now);
  });
  return { ok: true };
}

export function unfollowGame(store, { userId, gameId }) {
  store.run('DELETE FROM game_follows WHERE user_id = ? AND game_id = ?', userId, gameId);
  return { ok: true };
}

/**
 * Start watching a game from where it stands, so following a game already
 * under way doesn't send "it's on" or a lead change from before. A watch the
 * check hasn't looked at lately (nobody followed the game for a while) moves
 * up to now too; the alerts already sent stay sent.
 */
function watchFrom(store, game, now) {
  const prior = store.get('SELECT checked_at FROM game_watch WHERE game_id = ?', game.id);
  const base = baseline(game, now);
  if (!prior) {
    store.run(
      `INSERT INTO game_watch (game_id, state, period, home_score, away_score, leader, lead_period, break_period, start_sent, close_sent, final_sent, checked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      game.id, base.state, base.period, base.home_score, base.away_score, base.leader, base.lead_period, base.break_period,
      base.start_sent, base.close_sent, base.final_sent, base.checked_at,
    );
  } else if (now.getTime() - new Date(prior.checked_at).getTime() > 3 * 60_000) {
    store.run(
      `UPDATE game_watch SET state = ?, period = ?, home_score = ?, away_score = ?, leader = COALESCE(?, leader),
              break_period = MAX(COALESCE(break_period, 0), COALESCE(?, 0)), start_sent = MAX(start_sent, ?), checked_at = ?
        WHERE game_id = ?`,
      base.state, base.period, base.home_score, base.away_score, base.leader, base.break_period, base.start_sent, base.checked_at, game.id,
    );
  }
}

// ---- settings -----------------------------------------------------------------

/** { start: true, lead: true, close: true, break: true, final: true } for a player. */
export function alertPrefs(store, userId) {
  const row = store.get(`SELECT ${GAME_ALERTS.map((a) => a.column).join(', ')} FROM users WHERE id = ?`, userId) ?? {};
  return Object.fromEntries(GAME_ALERTS.map((a) => [a.key, row[a.column] !== 0]));
}

/** Save the five settings; anything missing is off (an unchecked box). */
export function saveAlertPrefs(store, userId, prefs) {
  store.run(
    `UPDATE users SET ${GAME_ALERTS.map((a) => `${a.column} = ?`).join(', ')} WHERE id = ?`,
    ...GAME_ALERTS.map((a) => (prefs[a.key] ? 1 : 0)), userId,
  );
}

// ---- reading a game -------------------------------------------------------------

// Regulation periods: quarters, halves (college hoops), periods (hockey), innings.
const REGULATION = { nfl: 4, ncaaf: 4, nba: 4, ncaab: 2, nhl: 3, mlb: 9 };
// When a finish counts as close: from the last period (or any overtime),
// within `margin`, with at most `seconds` on the clock. Baseball: the 8th on.
const CLOSE = {
  nfl: { last: 4, margin: 8, seconds: 300 },
  ncaaf: { last: 4, margin: 8, seconds: 300 },
  nba: { last: 4, margin: 5, seconds: 180 },
  ncaab: { last: 2, margin: 5, seconds: 180 },
  nhl: { last: 3, margin: 1, seconds: 300 },
  mlb: { last: 8, margin: 1, seconds: null },
};
const BASKETBALL = new Set(['nba', 'ncaab']);
// Halftime is a break in these; hockey's breaks are the ends of periods; baseball has none.
const HALF = { nfl: 2, ncaaf: 2, nba: 2, ncaab: 1 };

const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

/** "Q4", "H2", "P3", "OT", "2OT" (null for baseball, which reads ESPN's own "Top 7th"). */
export function periodLabel(sport, period) {
  if (!period || sport === 'mlb') return null;
  const reg = REGULATION[sport] ?? 4;
  if (period > reg) return period - reg === 1 ? 'OT' : `${period - reg}OT`;
  if (sport === 'ncaab') return `H${period}`;
  if (sport === 'nhl') return `P${period}`;
  return `Q${period}`;
}

/** "6:10" -> 370, "45.2" -> 45; null if there's no clock. */
export function clockSeconds(clock) {
  const m = /^(\d{1,2})(?::(\d{2}))?(?:\.\d)?$/.exec(String(clock ?? '').trim());
  if (!m) return null;
  return m[2] == null ? Number(m[1]) : Number(m[1]) * 60 + Number(m[2]);
}

/** Who's ahead: 'home', 'away', or null for a tie (or no score yet). */
function leaderOf(game) {
  const h = game.home.score;
  const a = game.away.score;
  if (h == null || a == null || h === a) return null;
  return h > a ? 'home' : 'away';
}

/** The period of the break the game is at (halftime, the end of a hockey period), else null. */
function breakOf(game) {
  if (game.state !== 'in') return null;
  if (HALF[game.sport]) {
    return game.status === 'STATUS_HALFTIME' || /^half/i.test(game.detail ?? '') ? HALF[game.sport] : null;
  }
  if (game.sport === 'nhl' && game.period && (game.status === 'STATUS_END_PERIOD' || /^end of/i.test(game.detail ?? ''))) return game.period;
  return null;
}

/** Within one score late in the game, by the sport's rule. */
export function isCloseFinish(game) {
  const rule = CLOSE[game.sport];
  if (!rule || game.state !== 'in' || !game.period) return false;
  const h = game.home.score;
  const a = game.away.score;
  if (h == null || a == null || Math.abs(h - a) > rule.margin) return false;
  if (game.period < rule.last) return false;
  if (rule.seconds == null || game.period > rule.last) return true;
  const left = clockSeconds(game.clock);
  return left != null && left <= rule.seconds;
}

const abbr = (t) => t.abbr || t.short;
/** "BOS 88–GS 90", away first. */
const scoreLine = (game) => `${abbr(game.away)} ${game.away.score ?? 0}–${abbr(game.home)} ${game.home.score ?? 0}`;
const matchup = (game) => `${game.away.short} @ ${game.home.short}`;

/** Where the game is: "Q4 6:10", "H2 1:48", "OT 2:00", or ESPN's "Top 7th" for baseball. */
function whereText(game) {
  if (game.sport === 'mlb' || !game.period) return game.detail || '';
  return [periodLabel(game.sport, game.period), game.clock].filter(Boolean).join(' ');
}

// ---- the check --------------------------------------------------------------------

/** The watch row for a game seen for the first time: where it stands, nothing to send. */
function baseline(game, now) {
  return {
    state: game.state,
    period: game.period ?? null,
    home_score: game.home.score ?? null,
    away_score: game.away.score ?? null,
    leader: leaderOf(game),
    lead_period: null,
    break_period: breakOf(game),
    start_sent: game.state === 'pre' ? 0 : 1,
    close_sent: 0,
    final_sent: game.state === 'post' ? 1 : 0,
    checked_at: now.toISOString(),
  };
}

/**
 * One game's next watch row and the alerts due, from the last row (`prior`,
 * null the first time) and the game as it stands. Pure: nothing is read or
 * written. Alerts are { type, title, text }, in the order they happened.
 */
export function step(game, prior, now = new Date()) {
  const startedAgo = now.getTime() - new Date(game.start).getTime();
  const tracked = prior && now.getTime() - new Date(prior.checked_at).getTime() <= TRACKED_WITHIN;
  if (!prior) return { watch: baseline(game, now), alerts: [] };
  // Too old and not being tracked: the feature's first run, or the app was
  // down a long time. Nothing goes out for it, ever.
  if (startedAgo > STALE_AFTER && !tracked) {
    return { watch: { ...baseline(game, now), start_sent: 1, close_sent: 1, final_sent: 1 }, alerts: [] };
  }
  const watch = { ...prior, state: game.state, period: game.period ?? prior.period, home_score: game.home.score, away_score: game.away.score, checked_at: now.toISOString() };
  const alerts = [];
  const title = matchup(game);

  if (game.state === 'in') {
    if (!prior.start_sent) {
      alerts.push({ type: 'start', title, text: `${title} is on${game.tv ? ` · ${game.tv}` : ''}` });
    }
    watch.start_sent = 1;

    // Lead changes: from one team ahead to the other (a tie in between keeps
    // the last leader). One a period at most, none in basketball's first.
    const lead = leaderOf(game);
    if (lead) {
      const changed = prior.leader && prior.leader !== lead;
      const quietPeriod = BASKETBALL.has(game.sport) && (game.period ?? 1) <= 1;
      if (changed && !quietPeriod && game.period !== prior.lead_period) {
        const by = Math.abs(game.home.score - game.away.score);
        const where = whereText(game);
        alerts.push({ type: 'lead', title, text: `Lead change: ${game[lead].short} up ${by} · ${scoreLine(game)}${where ? ` · ${where}` : ''}` });
        watch.lead_period = game.period ?? null;
      }
      watch.leader = lead;
    }

    const brk = breakOf(game);
    if (brk && brk > (prior.break_period ?? 0)) {
      const label = HALF[game.sport] ? 'Halftime' : `End of ${ordinal(brk)}`;
      alerts.push({ type: 'break', title, text: `${label}: ${scoreLine(game)}` });
      watch.break_period = brk;
    }

    if (!prior.close_sent && isCloseFinish(game)) {
      const reg = REGULATION[game.sport];
      const left = game.sport === 'mlb'
        ? game.detail || ordinal(game.period)
        : game.period > reg
          ? `${game.clock ? `${game.clock} left in ` : ''}${periodLabel(game.sport, game.period)}`
          : `${game.clock ?? '0:00'} left`;
      alerts.push({ type: 'close', title, text: `Close finish: ${scoreLine(game)}, ${left}. Turn it on.` });
      watch.close_sent = 1;
    }
  } else if (game.state === 'post') {
    watch.start_sent = 1;
    watch.close_sent = 1;
    if (!prior.final_sent && game.completed && !VOID_STATUSES.has(game.status) && game.home.score != null && game.away.score != null) {
      alerts.push({ type: 'final', title, text: `Final: ${game.away.short} ${game.away.score}, ${game.home.short} ${game.home.score}` });
    }
    // A postponed or canceled game ends the watch quietly; graded picks say so on their own.
    watch.final_sent = 1;
  }
  return { watch, alerts };
}

/**
 * Followed games the timer should read ESPN for: on now, or starting within
 * a couple of minutes, and not yet told final. Empty means no ESPN call.
 */
export function alertsDue(store, now = new Date()) {
  return store.all(
    `SELECT DISTINCT g.sport, g.start_time FROM games g
       JOIN game_follows f ON f.game_id = g.id
       LEFT JOIN game_watch w ON w.game_id = g.id
      WHERE COALESCE(w.final_sent, 0) = 0 AND g.start_time >= ?
        AND (g.state = 'in' OR (g.state = 'pre' AND g.start_time <= ?))`,
    new Date(now.getTime() - LIVE_WINDOW).toISOString(), new Date(now.getTime() + REFRESH_AHEAD).toISOString(),
  );
}

/**
 * Compare every followed game with what was last seen, save the new state,
 * then send what's due to each follower who has that alert on. Returns how
 * many notes went out.
 */
export function checkGameAlerts(store, notifier, now = new Date()) {
  const rows = store.all(
    `SELECT g.* FROM games g
      WHERE g.id IN (SELECT game_id FROM game_follows) AND g.start_time <= ?
        AND NOT EXISTS (SELECT 1 FROM game_watch w WHERE w.game_id = g.id AND w.final_sent = 1)
      ORDER BY g.start_time`,
    new Date(now.getTime() + LOOK_AHEAD).toISOString(),
  );
  let sent = 0;
  for (const row of rows) {
    const game = toGame(row);
    const prior = store.get('SELECT * FROM game_watch WHERE game_id = ?', game.id) ?? null;
    const { watch, alerts } = step(game, prior, now);
    // Written before anything is sent: a crash after this loses an alert, never doubles one.
    store.run(
      `INSERT INTO game_watch (game_id, state, period, home_score, away_score, leader, lead_period, break_period, start_sent, close_sent, final_sent, checked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (game_id) DO UPDATE SET state = excluded.state, period = excluded.period, home_score = excluded.home_score,
         away_score = excluded.away_score, leader = excluded.leader, lead_period = excluded.lead_period, break_period = excluded.break_period,
         start_sent = excluded.start_sent, close_sent = excluded.close_sent, final_sent = excluded.final_sent, checked_at = excluded.checked_at`,
      game.id, watch.state, watch.period ?? null, watch.home_score ?? null, watch.away_score ?? null, watch.leader ?? null,
      watch.lead_period ?? null, watch.break_period ?? null, watch.start_sent, watch.close_sent, watch.final_sent, watch.checked_at,
    );
    for (const alert of alerts) sent += deliver(store, notifier, game, alert, now);
  }
  return sent;
}

/** Send one alert to each follower with it on. The final adds the player's own picks. */
function deliver(store, notifier, game, alert, now) {
  const followers = store.all(
    `SELECT u.id, u.notify_settled FROM game_follows f JOIN users u ON u.id = f.user_id
      WHERE f.game_id = ? AND u.official = 0 AND u.${COLUMN[alert.type]} = 1`,
    game.id,
  );
  let sent = 0;
  for (const user of followers) {
    let text = alert.text;
    if (alert.type === 'final') {
      const picks = store.all('SELECT market, side, line, result, profit FROM picks WHERE user_id = ? AND game_id = ? AND result IS NOT NULL ORDER BY id', user.id, game.id);
      // "Your bet settled" already told them the score with the result: one note, not two.
      if (picks.length && user.notify_settled) continue;
      if (picks.length) {
        text += ` · Your ${picks.length === 1 ? 'pick' : 'picks'}: ${picks.map((p) => `${resultText(p)} ${selection(p.market, p.side, p.line, game)}`).join('; ')}`;
      }
    }
    notifier.gameAlert(user.id, { gameId: game.id, title: alert.title, text }, now);
    sent += 1;
  }
  return sent;
}

/** "Won +0.91u on", "Lost 1u on", "Push on", "Void on". */
function resultText(p) {
  return `${p.result === 'loss' ? `Lost ${formatUnits(Math.abs(p.profit))}` : settledHead(p)} on`;
}
