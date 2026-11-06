// Color looks. Eight presets live in public/style.css as complete token sets.
// "Match my team" and "Custom" build the same tokens from two colors (an
// accent and a background tint) on a dark or light base, after a guard that
// keeps the accent readable. Those tokens reach the page as a stylesheet at
// /theme/<colors>.css, never as inline styles, and every color in it has
// passed HEX below, so nothing a player sends can turn into CSS.

import { THEMES } from './config.js';
import { SPORT, SPORTS } from './sports.js';

export const HEX = /^#[0-9a-f]{6}$/;

/** What the swatches and the profile banner show for each preset: its name, background and accent. Must match style.css. */
export const PRESETS = {
  scoreboard: { label: 'Scoreboard', bg: '#0e1a3a', accent: '#ffb020' },
  market: { label: 'Bull Market', bg: '#070908', accent: '#22c55e' },
  ember: { label: 'Ember', bg: '#141b24', accent: '#ff8f45' },
  ice: { label: 'Ice', bg: '#0b1a2e', accent: '#38bdf8' },
  royal: { label: 'Royal', bg: '#1a0f33', accent: '#fbbf24' },
  crimson: { label: 'Crimson', bg: '#210a0f', accent: '#e11d48' },
  forest: { label: 'Forest', bg: '#0f1b14', accent: '#ecd28c' },
  light: { label: 'Light', bg: '#ffffff', accent: '#b45309' },
};

/** The browser bar color for each preset (meta theme-color). */
export const PRESET_BAR = {
  scoreboard: '#0e1a3a', market: '#0c100e', ember: '#0f141b', ice: '#0b1a2e',
  royal: '#1a0f33', crimson: '#210a0f', forest: '#0f1b14', light: '#ffffff',
};

/** About 3:1 against the tiles the odds sit on. */
export const ACCENT_MIN = 3;

// ---- color math ------------------------------------------------------------

/** "#FF8800", "ff8800" or " #ff8800 " -> "#ff8800"; anything else -> null. */
export function cleanHex(value) {
  const s = String(value ?? '').trim().toLowerCase();
  const withHash = /^[0-9a-f]{6}$/.test(s) ? `#${s}` : s;
  return HEX.test(withHash) ? withHash : null;
}

const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (rgb) => `#${rgb.map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('')}`;

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(hex) {
  const [r, g, b] = channels(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1 to 21. */
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** `t` of the way from a to b. */
export function mix(a, b, t) {
  const x = channels(a);
  const y = channels(b);
  return toHex(x.map((c, i) => c + (y[i] - c) * t));
}

const rgba = (hex, alpha) => `rgba(${channels(hex).join(', ')}, ${alpha})`;

/** Black or white, whichever reads better on this color: the text on accent buttons. */
export function inkOn(hex) {
  return contrast(hex, '#ffffff') >= contrast(hex, '#000000') ? '#ffffff' : '#000000';
}

/**
 * Lighten (on dark) or darken (on light) a color in 5% steps until it reaches
 * `min` against `surface`. Returns the color unchanged when it already does.
 */
export function readable(hex, surface, mode = 'dark', min = ACCENT_MIN) {
  const toward = mode === 'light' ? '#000000' : '#ffffff';
  for (let step = 0; step <= 20; step++) {
    const c = step ? mix(hex, toward, step / 20) : hex;
    if (contrast(c, surface) >= min) return c;
  }
  return toward;
}

// ---- tokens ------------------------------------------------------------------

// Neutral surfaces for each base, and how much of the tint each one takes.
const BASE = {
  dark: {
    bg: ['#090c11', 0.1], bar: ['#0d1117', 0.14], card: ['#12171f', 0.14], raised: ['#181e28', 0.16],
    tile: ['#1b222d', 0.16], 'tile-hover': ['#242c39', 0.18], line: ['#212833', 0.2],
    muted: ['#a3acba', 0.06], faint: ['#838d9b', 0.06],
  },
  light: {
    bg: ['#f3f4f6', 0.08], bar: ['#ffffff', 0.05], card: ['#ffffff', 0.04], raised: ['#eef0f3', 0.08],
    tile: ['#eaedf1', 0.08], 'tile-hover': ['#dfe3e9', 0.1], line: ['#d5dae1', 0.12],
    muted: ['#4b5462', 0.04], faint: ['#5f6875', 0.04],
  },
};

// Colors that don't take the tint: text, results and the gold marks.
const FIXED = {
  dark: {
    ink: '#ffffff', win: '#34d399', 'win-soft': 'rgba(52, 211, 153, 0.14)', loss: '#fb7185', 'loss-soft': 'rgba(251, 113, 133, 0.14)',
    live: '#e63946', gold: '#ffd257', 'gold-ink': '#1a1000',
  },
  light: {
    ink: '#13161b', win: '#15803d', 'win-soft': 'rgba(21, 128, 61, 0.12)', loss: '#be123c', 'loss-soft': 'rgba(190, 18, 60, 0.1)',
    live: '#d62839', gold: '#8a5a00', 'gold-ink': '#ffffff',
  },
};

/** The background surfaces for a base and tint, before any accent. */
export function surfaces(mode, tint) {
  const base = BASE[mode === 'light' ? 'light' : 'dark'];
  return Object.fromEntries(Object.entries(base).map(([key, [color, share]]) => [key, mix(color, tint, share)]));
}

/**
 * Every token for a custom look: the surfaces tinted, the accent run through
 * the readability guard, and black or white text on the accent.
 */
export function customTokens({ mode, accent, tint }) {
  const m = mode === 'light' ? 'light' : 'dark';
  const s = surfaces(m, tint);
  const a = readable(accent, s.tile, m);
  return {
    ...s,
    ...FIXED[m],
    push: s.muted,
    accent: a,
    'accent-ink': inkOn(a),
    'accent-soft': rgba(a, m === 'light' ? 0.12 : 0.14),
  };
}

/**
 * The accent a team's colors give: the primary if it reads against the
 * tiles, else the alternate if that does, else the primary lightened (on
 * dark) or darkened (on light) until it does. `how` says which happened.
 */
export function teamAccent({ primary, alternate = null }, mode = 'dark') {
  const s = surfaces(mode, primary);
  if (contrast(primary, s.tile) >= ACCENT_MIN) return { accent: primary, how: null };
  if (alternate && contrast(alternate, s.tile) >= ACCENT_MIN) return { accent: alternate, how: 'alternate' };
  return { accent: readable(primary, s.tile, mode), how: mode === 'light' ? 'darkened' : 'lightened' };
}

// ---- the stylesheet ------------------------------------------------------------

const FILE = /^t1-([dl])-([0-9a-f]{6})-([0-9a-f]{6})(-preview)?\.css$/;

/** A player's custom colors from their row, or null if anything is off. */
export function styleOf({ theme, theme_mode: mode, theme_accent: accent, theme_tint: tint } = {}) {
  if (theme !== 'custom' || !['dark', 'light'].includes(mode) || !HEX.test(accent ?? '') || !HEX.test(tint ?? '')) return null;
  return { mode, accent, tint };
}

/** Where a custom look's stylesheet lives. The colors are the name, so it never changes and caches forever. */
export function sheetPath({ mode, accent, tint }, { preview = false } = {}) {
  return `/theme/t1-${mode === 'light' ? 'l' : 'd'}-${accent.slice(1)}-${tint.slice(1)}${preview ? '-preview' : ''}.css`;
}

/** The colors in a stylesheet's name, or null if the name isn't exactly one of ours. */
export function parseSheet(name) {
  const m = FILE.exec(String(name));
  return m ? { mode: m[1] === 'l' ? 'light' : 'dark', accent: `#${m[2]}`, tint: `#${m[3]}`, preview: Boolean(m[4]) } : null;
}

/** The stylesheet itself: one rule, hex and rgba() values only. The preview copy colors just the picker's sample card. */
export function themeCss(style, { preview = false } = {}) {
  const tokens = customTokens(style);
  for (const value of Object.values(tokens)) {
    if (!HEX.test(value) && !/^rgba\(\d{1,3}, \d{1,3}, \d{1,3}, 0?\.\d+\)$/.test(value)) throw new Error(`bad token ${value}`);
  }
  const selector = preview ? '[data-theme="preview"]' : ':root[data-theme="custom"], [data-theme="custom"]';
  const body = Object.entries(tokens).map(([key, value]) => `  --${key}: ${value};`).join('\n');
  return `${selector} {\n${body}\n  color-scheme: ${style.mode === 'light' ? 'light' : 'dark'};\n}\n`;
}

/** The browser bar color for a look: a custom one's colors, or a preset's key. */
export function barColor(style, preset) {
  if (style) return customTokens(style).bar;
  return PRESET_BAR[THEMES.includes(preset) ? preset : THEMES[0]];
}

/**
 * Two colors for the band behind a profile's header: the team's colors when
 * the player matched one, else their look's accent and background.
 */
export function bannerColors({ team = null, style = null, preset = null }) {
  if (team) return [team.color, team.alt && team.alt !== team.color ? team.alt : mix(team.color, '#000000', 0.45)];
  if (style) return [style.accent, mix(style.tint, '#000000', 0.55)];
  const p = PRESETS[THEMES.includes(preset) ? preset : THEMES[0]];
  return [p.accent, p.bg];
}

// ---- teams -------------------------------------------------------------------

const TEAM_ROWS = `
  SELECT sport, home_abbr AS abbr, home_name AS name, home_logo AS logo, home_color AS color, home_alt_color AS alt, start_time
    FROM games WHERE home_color IS NOT NULL AND home_abbr != ''
  UNION ALL
  SELECT sport, away_abbr, away_name, away_logo, away_color, away_alt_color, start_time
    FROM games WHERE away_color IS NOT NULL AND away_abbr != ''`;

const toTeam = (r) => ({
  key: `${r.sport}:${r.abbr}`, sport: r.sport, abbr: r.abbr, name: r.name, logo: r.logo,
  color: cleanHex(r.color), alt: cleanHex(r.alt),
});

/** Every team the app has seen with a color, by sport (in the app's sport order), A to Z. Newest game's details win. */
export function teamsBySport(store) {
  const rows = store.all(`SELECT sport, abbr, name, logo, color, alt, MAX(start_time) AS seen FROM (${TEAM_ROWS}) GROUP BY sport, abbr`);
  const teams = rows.map(toTeam).filter((t) => t.color && SPORT[t.sport]);
  return SPORTS.map((s) => ({ sport: s, teams: teams.filter((t) => t.sport === s.key).sort((a, b) => a.name.localeCompare(b.name)) }))
    .filter((group) => group.teams.length);
}

/** One team by its key ("nfl:KC"), or null. */
export function teamByKey(store, key) {
  const m = /^([a-z]+):(.{1,12})$/.exec(String(key ?? ''));
  if (!m || !SPORT[m[1]]) return null;
  const row = store.get(
    `SELECT sport, abbr, name, logo, color, alt, MAX(start_time) AS seen FROM (${TEAM_ROWS}) WHERE sport = ? AND abbr = ? GROUP BY sport, abbr`,
    m[1], m[2],
  );
  const team = row ? toTeam(row) : null;
  return team?.color ? team : null;
}
