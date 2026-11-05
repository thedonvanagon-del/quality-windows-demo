// Screen names: who can take one, and changing your own. A change is allowed
// once every 30 days. The old name sends people to the new one, and nobody
// else can take it, for 90 days, so shared profile links keep working.

import { screenNameProblem } from './auth.js';
import { DAY } from './time.js';

export const CHANGE_EVERY_DAYS = 30;
export const HOLD_DAYS = 90;

const TAKEN = 'Someone already has that name. Try another.';

/** Why `name` can't be this player's (or a new player's) screen name, or null. */
export function nameProblem(store, name, { userId = null, now }) {
  const problem = screenNameProblem(name);
  if (problem) return problem;
  if (store.get('SELECT 1 AS x FROM users WHERE screen_name = ? AND id IS NOT ?', name, userId)) return TAKEN;
  const since = new Date(now.getTime() - HOLD_DAYS * DAY).toISOString();
  if (store.get('SELECT 1 AS x FROM name_history WHERE old_name = ? AND changed_at > ? AND user_id IS NOT ?', name, since, userId)) return TAKEN;
  return null;
}

/** When this player can next change their name, or null if they can now. */
export function nextNameChange(changedAt, now) {
  if (!changedAt) return null;
  const next = new Date(new Date(changedAt).getTime() + CHANGE_EVERY_DAYS * DAY);
  return next > now ? next : null;
}

/** Change a player's screen name, keeping the old one pointed at them. */
export function changeScreenName(store, { userId, name, now }) {
  const user = store.get('SELECT screen_name, official, name_changed_at FROM users WHERE id = ?', userId);
  if (!user?.screen_name) return { error: 'Pick a screen name first.' };
  if (user.official) return { error: "The official account's name can't change." };
  if (name === user.screen_name) return { error: "That's already your name." };
  if (nextNameChange(user.name_changed_at, now)) return { error: `You can change your name once every ${CHANGE_EVERY_DAYS} days.` };
  const problem = nameProblem(store, name, { userId, now });
  if (problem) return { error: problem };
  const at = now.toISOString();
  try {
    store.tx(() => {
      // A change in capitals only keeps the same name, so there's nothing to point back.
      if (name.toLowerCase() !== user.screen_name.toLowerCase()) {
        store.run('INSERT INTO name_history (user_id, old_name, changed_at) VALUES (?, ?, ?)', userId, user.screen_name, at);
      }
      // Taking back your own old name ends its redirect.
      store.run('DELETE FROM name_history WHERE user_id = ? AND old_name = ?', userId, name);
      store.run('UPDATE users SET screen_name = ?, name_changed_at = ? WHERE id = ?', name, at, userId);
    });
  } catch (err) {
    if (/UNIQUE/.test(err.message)) return { error: TAKEN };
    throw err;
  }
  return { old: user.screen_name, name };
}

/** The current name of whoever gave up `name` in the last 90 days, or null. */
export function renamedTo(store, name, now) {
  const since = new Date(now.getTime() - HOLD_DAYS * DAY).toISOString();
  return store.get(
    `SELECT u.screen_name FROM name_history h JOIN users u ON u.id = h.user_id
      WHERE h.old_name = ? AND h.changed_at > ? AND u.screen_name IS NOT NULL
      ORDER BY h.changed_at DESC, h.id DESC LIMIT 1`,
    name, since,
  )?.screen_name ?? null;
}
