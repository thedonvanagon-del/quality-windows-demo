// Notifications: an inbox in the app (the bell), and the same message pushed
// to any phone the player turned notifications on for.

import { formatUnits, selection } from './picks.js';
import { followersToNotify } from './follows.js';
import { toGame } from './games.js';

// One "they made a pick" note per followed player per half hour, so a player
// filling out a whole slate doesn't send twenty.
const FOLLOW_QUIET_MS = 30 * 60_000;
const KEEP = 100;

export function createNotifier({ store, push = null, log = console }) {
  function add(userId, { kind, title, text, url }, now) {
    store.run(
      'INSERT INTO notifications (user_id, kind, text, url, created_at) VALUES (?, ?, ?, ?, ?)',
      userId, kind, text, url, now.toISOString(),
    );
    // Keep the inbox short.
    store.run(
      `DELETE FROM notifications WHERE user_id = ? AND id NOT IN
         (SELECT id FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT ?)`,
      userId, userId, KEEP,
    );
    push?.send(userId, { title, body: text, url }).catch((err) => log.warn(`push: ${err.message}`));
  }

  return {
    /** Tell each bettor how their graded picks went. */
    settled(pickIds, now = new Date()) {
      const rows = store.all(
        `SELECT p.user_id, p.market, p.side, p.line, p.result, p.profit, g.*
           FROM picks p JOIN games g ON g.id = p.game_id JOIN users u ON u.id = p.user_id
          WHERE p.id IN (${pickIds.map(() => '?').join(',')}) AND u.notify_settled = 1`,
        ...pickIds,
      );
      for (const r of rows) {
        const game = toGame(r);
        const pick = selection(r.market, r.side, r.line, game);
        const score = `${game.away.abbr} ${game.away.score ?? 0}, ${game.home.abbr} ${game.home.score ?? 0}`;
        const head = { win: `Won ${formatUnits(r.profit, { sign: true })}`, loss: `Lost ${formatUnits(r.profit)}`, push: 'Push', void: 'Void' }[r.result];
        add(r.user_id, {
          kind: 'settled',
          title: `${head}: ${pick}`,
          text: `${head}: ${pick}${r.result === 'void' ? '. The game was called off.' : ` (${score})`}`,
          url: '/picks?tab=settled',
        }, now);
      }
    },

    /** Tell a player's followers they made a pick (not which side: that waits for the start). */
    pickMade({ player, game, now = new Date() }) {
      const url = `/u/${encodeURIComponent(player.screenName)}`;
      const since = new Date(now.getTime() - FOLLOW_QUIET_MS).toISOString();
      for (const id of followersToNotify(store, player.id)) {
        const recent = store.get("SELECT 1 AS x FROM notifications WHERE user_id = ? AND kind = 'follow' AND url = ? AND created_at > ?", id, url, since);
        if (recent) continue;
        add(id, {
          kind: 'follow',
          title: `${player.screenName} locked a pick`,
          text: `${player.screenName} locked a pick on ${game.away.short} @ ${game.home.short}. It shows when the game starts.`,
          url,
        }, now);
      }
    },

    unread: (userId) => store.get('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL', userId).n,
    list: (userId, limit = 50) => store.all('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT ?', userId, limit),
    markRead(userId, now = new Date()) {
      store.run('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL', now.toISOString(), userId);
    },
  };
}
