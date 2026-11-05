// Badges, worked out from the record, never handed out by hand. Each one is
// stored once (with the date it was earned), so it can't be won twice and
// never goes away. A check runs after every grading, after the weekly contest
// closes, when an invite counts, and once an hour for everyone as a backstop.
// The official account earns none.

import { BETS, lastTen } from './stats.js';
import { streakOf } from './streak.js';
import { weekLabel } from './time.js';

export const RECRUITER_GOAL = 3;
export const HOT_HAND_WINS = 8;
const BET_COUNTS = [50, 100, 500];

/**
 * Every badge, most notable first: a leaderboard row shows the first one a
 * player has. The keys are stored; never rename one.
 */
export const BADGES = [
  { key: 'weekly_winner', label: 'Weekly winner', short: 'Winner', about: 'Won a weekly contest' },
  { key: 'streak_10', label: 'Streak 10', short: 'Streak 10', about: '10 Streak picks won in a row' },
  { key: 'hot_hand', label: 'Hot hand', short: 'Hot hand', about: `Won ${HOT_HAND_WINS} or more of their last 10 bets` },
  { key: 'podium', label: 'Podium', short: 'Podium', about: 'Finished top 3 in a weekly contest' },
  { key: 'streak_5', label: 'Streak 5', short: 'Streak 5', about: '5 Streak picks won in a row' },
  { key: 'parlay_hitter', label: 'Parlay hitter', short: 'Parlay', about: 'Won a parlay of 4 legs or more' },
  { key: 'bets_500', label: '500 bets', short: '500 bets', about: '500 graded bets' },
  { key: 'recruiter', label: 'Recruiter', short: 'Recruiter', about: `${RECRUITER_GOAL} friends joined from their invite link` },
  { key: 'bets_100', label: '100 bets', short: '100 bets', about: '100 graded bets' },
  { key: 'bets_50', label: '50 bets', short: '50 bets', about: '50 graded bets' },
  // Nearly everyone has this one, so it says nothing on a board: profile only.
  { key: 'first_win', label: 'First win', short: 'First win', about: 'Won their first bet', board: false },
];
export const BADGE = Object.fromEntries(BADGES.map((b, i) => [b.key, { ...b, order: i }]));

/** The badges a player qualifies for right now: [{ key, ref, detail }]. */
function qualifies(store, userId) {
  const out = [];
  const add = (key, ref = '', detail = null) => out.push({ key, ref, detail });
  const counts = store.get(
    `SELECT SUM(result = 'win') AS wins, SUM(result IN ('win', 'loss', 'push')) AS graded FROM ${BETS} WHERE user_id = ?`,
    userId,
  );
  if (counts.wins) add('first_win');
  for (const n of BET_COUNTS) if (counts.graded >= n) add(`bets_${n}`);
  const ten = lastTen(store, userId);
  if (ten.graded === 10 && ten.wins >= HOT_HAND_WINS) add('hot_hand', '', `${ten.wins}-${ten.losses}${ten.pushes ? `-${ten.pushes}` : ''} last 10`);
  const { best } = streakOf(store, userId);
  if (best >= 5) add('streak_5');
  if (best >= 10) add('streak_10');
  const places = store.all('SELECT week, place FROM contest_results WHERE user_id = ? ORDER BY week', userId);
  for (const p of places) if (p.place === 1) add('weekly_winner', p.week, weekLabel(p.week));
  if (places.length) add('podium', '', `#${places[0].place}, ${weekLabel(places[0].week)}`);
  const parlay = store.get(
    `SELECT MAX(n) AS legs FROM (SELECT COUNT(*) AS n FROM parlays x JOIN parlay_legs l ON l.parlay_id = x.id
      WHERE x.user_id = ? AND x.result = 'win' GROUP BY x.id)`,
    userId,
  );
  if (parlay.legs >= 4) add('parlay_hitter', '', `${parlay.legs} legs`);
  const invited = store.get('SELECT COUNT(*) AS n FROM users WHERE invited_by = ? AND invite_counted_at IS NOT NULL', userId).n;
  if (invited >= RECRUITER_GOAL) add('recruiter', '', `${invited} friends`);
  return out;
}

/** "First win", "First win and 50 bets", "First win, 50 bets and Hot hand" */
export function listText(items) {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

/**
 * Award whatever these players have newly earned, and tell them. Returns the
 * new badges as [{ userId, key }].
 */
export function checkBadges(store, userIds, now, notifier = null) {
  const awarded = [];
  for (const userId of new Set(userIds)) {
    const user = store.get('SELECT screen_name, official FROM users WHERE id = ?', userId);
    if (!user || user.official || !user.screen_name) continue;
    const fresh = [];
    for (const b of qualifies(store, userId)) {
      const { changes } = store.run(
        'INSERT OR IGNORE INTO badges (user_id, key, ref, detail, earned_at) VALUES (?, ?, ?, ?, ?)',
        userId, b.key, b.ref, b.detail, now.toISOString(),
      );
      if (changes) fresh.push(b.key);
    }
    if (!fresh.length) continue;
    awarded.push(...fresh.map((key) => ({ userId, key })));
    const names = [...new Set(fresh)].sort((a, b) => BADGE[a].order - BADGE[b].order).map((k) => BADGE[k].label);
    notifier?.tell(userId, {
      kind: 'badge',
      text: `New ${names.length === 1 ? 'badge' : 'badges'}: ${listText(names)}.`,
      url: `/u/${encodeURIComponent(user.screen_name)}#badges`,
    }, now);
  }
  return awarded;
}

/** After grading: check the players whose bets just settled. */
export function badgesAfterGrading(store, { pickIds = [], parlayIds = [], now, notifier = null }) {
  const ids = (table, list) => (list.length
    ? store.all(`SELECT DISTINCT user_id FROM ${table} WHERE id IN (${list.map(() => '?').join(',')})`, ...list).map((r) => r.user_id)
    : []);
  return checkBadges(store, [...ids('picks', pickIds), ...ids('parlays', parlayIds)], now, notifier);
}

/** The hourly backstop: every player with a screen name. */
export function checkAllBadges(store, now, notifier = null) {
  const ids = store.all('SELECT id FROM users WHERE screen_name IS NOT NULL AND official = 0').map((r) => r.id);
  return checkBadges(store, ids, now, notifier);
}

/**
 * A player's badges for their profile, most notable first. A badge won more
 * than once (a weekly win) is one chip with a count.
 */
export function badgesOf(store, userId) {
  const rows = store.all('SELECT key, ref, detail, earned_at FROM badges WHERE user_id = ? ORDER BY earned_at, ref', userId);
  const out = new Map();
  for (const r of rows) {
    if (!BADGE[r.key]) continue;
    const b = out.get(r.key) ?? out.set(r.key, { ...BADGE[r.key], count: 0, earned: [] }).get(r.key);
    b.count += 1;
    b.earned.push({ at: r.earned_at, detail: r.detail });
  }
  return [...out.values()].sort((a, b) => a.order - b.order);
}

/** user id -> their most notable badge, for leaderboard rows. */
export function topBadges(store, userIds) {
  const out = new Map();
  if (!userIds.length) return out;
  const rows = store.all(
    `SELECT DISTINCT user_id, key FROM badges WHERE user_id IN (${userIds.map(() => '?').join(',')})`,
    ...userIds,
  );
  for (const r of rows) {
    const b = BADGE[r.key];
    if (b && b.board !== false && (!out.has(r.user_id) || b.order < out.get(r.user_id).order)) out.set(r.user_id, b);
  }
  return out;
}
