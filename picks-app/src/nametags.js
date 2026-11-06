// How a name shows on the boards: a color and an icon, picked on your own
// profile. Both are stored as keys from the lists here (users.name_color,
// users.name_icon), never as free text, and checked again every time a name
// is drawn: a key that's no longer on a list, an earned icon whose badge the
// player doesn't hold, or a team that's left the catalog all draw nothing.
// The official account has neither: it keeps its gold Official tag.

/**
 * Name colors. Each is a CSS class (.name-c-gold) reading a variable that has
 * a dark-page and a light-page value, so the name reads on whatever look the
 * viewer has. The values live in public/style.css (and must match these); a
 * test checks every one at 4.5:1 on every look's cards, rows and tiles.
 */
export const NAME_COLORS = [
  { key: 'default', label: 'Default' },
  { key: 'gold', label: 'Gold', dark: '#fcd34d', light: '#854d0e' },
  { key: 'red', label: 'Red', dark: '#fdb4b4', light: '#b91c1c' },
  { key: 'orange', label: 'Orange', dark: '#fdbd7a', light: '#9a3412' },
  { key: 'lime', label: 'Lime', dark: '#bef264', light: '#3f6212' },
  { key: 'green', label: 'Green', dark: '#86efac', light: '#166534' },
  { key: 'teal', label: 'Teal', dark: '#5eead4', light: '#115e59' },
  { key: 'sky', label: 'Sky', dark: '#7dd3fc', light: '#075985' },
  { key: 'blue', label: 'Blue', dark: '#b3c5fd', light: '#1d4ed8' },
  { key: 'purple', label: 'Purple', dark: '#ddbffe', light: '#7e22ce' },
  { key: 'pink', label: 'Pink', dark: '#fbb2da', light: '#a3154f' },
  { key: 'silver', label: 'Silver', dark: '#e2e8f0', light: '#475569' },
];
export const NAME_COLOR = Object.fromEntries(NAME_COLORS.map((c) => [c.key, c]));

/**
 * Icons: anyone can pick the first ones; the last four need a badge. Keys
 * are stored; never rename one. `hint` is what a locked one says.
 */
export const ICONS = [
  { key: 'bull', emoji: '🐂', label: 'Bull' },
  { key: 'fire', emoji: '🔥', label: 'Fire' },
  { key: 'money', emoji: '💰', label: 'Money bag' },
  { key: 'target', emoji: '🎯', label: 'Target' },
  { key: 'bolt', emoji: '⚡', label: 'Lightning' },
  { key: 'shark', emoji: '🦈', label: 'Shark' },
  { key: 'goat', emoji: '🐐', label: 'Goat' },
  { key: 'rocket', emoji: '🚀', label: 'Rocket' },
  { key: 'football', emoji: '🏈', label: 'Football' },
  { key: 'basketball', emoji: '🏀', label: 'Basketball' },
  { key: 'baseball', emoji: '⚾', label: 'Baseball' },
  { key: 'hockey', emoji: '🏒', label: 'Hockey' },
  { key: 'soccer', emoji: '⚽', label: 'Soccer ball' },
  { key: 'dice', emoji: '🎲', label: 'Dice' },
  { key: 'joker', emoji: '🃏', label: 'Joker' },
  { key: 'brain', emoji: '🧠', label: 'Brain' },
  { key: 'eyes', emoji: '👀', label: 'Eyes' },
  { key: 'wolf', emoji: '🐺', label: 'Wolf' },
  { key: 'eagle', emoji: '🦅', label: 'Eagle' },
  { key: 'snake', emoji: '🐍', label: 'Snake' },
  { key: 'clover', emoji: '🍀', label: 'Four-leaf clover' },
  { key: 'muscle', emoji: '💪', label: 'Muscle' },
  { key: 'cash', emoji: '🤑', label: 'Money face' },
  { key: 'ice', emoji: '🧊', label: 'Ice cube' },
  { key: 'cactus', emoji: '🌵', label: 'Cactus' },
  { key: 'crown', emoji: '👑', label: 'Crown', badge: 'weekly_winner', hint: 'Earn it: win a weekly contest' },
  { key: 'trophy', emoji: '🏆', label: 'Trophy', badge: 'tournament_champion', hint: 'Earn it: win a tournament' },
  { key: 'double_fire', emoji: '🔥🔥', label: 'Double fire', badge: 'streak_10', hint: 'Earn it: win 10 Streak picks in a row' },
  { key: 'gem', emoji: '💎', label: 'Diamond', badge: 'bets_100', hint: 'Earn it: 100 graded bets' },
];
export const ICON = Object.fromEntries(ICONS.map((i) => [i.key, i]));
const EARNED_BADGES = ICONS.filter((i) => i.badge).map((i) => i.badge);

/** user id -> the badges they hold that unlock an icon. */
function earnedBadges(store, ids) {
  const out = new Map();
  if (!ids.length) return out;
  const rows = store.all(
    `SELECT DISTINCT user_id, key FROM badges WHERE key IN (${EARNED_BADGES.map(() => '?').join(',')})
       AND user_id IN (${ids.map(() => '?').join(',')})`,
    ...EARNED_BADGES, ...ids,
  );
  for (const r of rows) (out.get(r.user_id) ?? out.set(r.user_id, new Set()).get(r.user_id)).add(r.key);
  return out;
}

/** The badges this player holds that unlock an icon. */
export function earnedOf(store, userId) {
  return earnedBadges(store, [userId]).get(userId) ?? new Set();
}

/**
 * What an icon key draws, or null: an emoji ({ kind: 'emoji', emoji, label })
 * or a team's logo ({ kind: 'team', name, logo }). An earned emoji needs its
 * badge in `badges`; a team needs to be in the catalog.
 */
export function resolveIcon(key, { badges = new Set(), teams = null } = {}) {
  if (!key) return null;
  const icon = ICON[key];
  if (icon) return icon.badge && !badges.has(icon.badge) ? null : { kind: 'emoji', key, emoji: icon.emoji, label: icon.label };
  const team = teams?.get(key);
  return team ? { kind: 'team', key, name: team.name, logo: team.logo } : null;
}

/** A color key that draws something, or null for the default and anything not on the list. */
export function resolveColor(key) {
  return key && key !== 'default' && NAME_COLOR[key] ? key : null;
}

/**
 * user id -> { color, icon } for everyone in `ids` who has either, ready to
 * draw. The official account and anything that no longer checks out are left out.
 */
export function nametagsFor(store, ids, teams = null) {
  const out = new Map();
  const unique = [...new Set(ids.filter((id) => Number.isInteger(id)))];
  for (let i = 0; i < unique.length; i += 400) {
    const chunk = unique.slice(i, i + 400);
    const rows = store.all(
      `SELECT id, name_color, name_icon FROM users WHERE id IN (${chunk.map(() => '?').join(',')})
         AND official = 0 AND (name_color IS NOT NULL OR name_icon IS NOT NULL)`,
      ...chunk,
    );
    const needBadges = rows.filter((r) => ICON[r.name_icon]?.badge).map((r) => r.id);
    const badges = earnedBadges(store, needBadges);
    for (const r of rows) {
      const color = resolveColor(r.name_color);
      const icon = resolveIcon(r.name_icon, { badges: badges.get(r.id), teams });
      if (color || icon) out.set(r.id, { color, icon });
    }
  }
  return out;
}

/**
 * Save a player's color and icon, after checking both against the lists.
 * `color` is a key ('default' or empty for none); `icon` is an emoji key, a
 * team key, or 'none'/empty. Returns { error } or { color, icon } as stored.
 */
export function saveNametag(store, { userId, color, icon, teams = null }) {
  const user = store.get('SELECT official FROM users WHERE id = ?', userId);
  if (!user) return { error: 'No such player.' };
  if (user.official) return { error: 'The official account keeps its Official tag.' };
  const c = color == null || color === '' || color === 'default' ? null : String(color);
  if (c && !NAME_COLOR[c]) return { error: 'Pick a color from the list.' };
  const i = icon == null || icon === '' || icon === 'none' ? null : String(icon);
  if (i) {
    const emoji = ICON[i];
    if (emoji?.badge && !earnedOf(store, userId).has(emoji.badge)) return { error: `That icon is locked. ${emoji.hint}.` };
    if (!emoji && !String(i).startsWith('team:')) return { error: 'Pick an icon from the list.' };
    if (!emoji && !teams?.get(i)) return { error: 'Pick a team from the list.' };
  }
  store.run('UPDATE users SET name_color = ?, name_icon = ? WHERE id = ?', c, i, userId);
  return { color: c, icon: i };
}
