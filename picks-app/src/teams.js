// Team logos a player can pick as their scoreboard icon. The list comes from
// ESPN's team lists (one per league), fetched once a day in the background and
// kept in the team_catalog table, so a restart has it at once. A page never
// waits on ESPN: until a league's list has loaded, it falls back to the teams
// the games table has already seen. Logos load straight from ESPN's image
// server, the only outside host the page's security policy allows.

import { LOGO_HOST } from './espn.js';
import { SPORT } from './sports.js';
import { cleanHex } from './themes.js';

const BASE = 'https://site.api.espn.com/apis/site/v2/sports';
export const REFRESH_EVERY = 24 * 60 * 60_000;
// After a failed refresh, leave ESPN alone this long.
const RETRY_AFTER = 30 * 60_000;
// How long the games-table fallback is reused before it's read again.
const FALLBACK_FOR = 5 * 60_000;

/** The leagues in the picker. College is one list: a school's logo is the same in football and basketball. */
export const LEAGUES = [
  { key: 'nfl', name: 'NFL' },
  { key: 'nba', name: 'NBA' },
  { key: 'mlb', name: 'MLB' },
  { key: 'nhl', name: 'NHL' },
  { key: 'ncaa', name: 'College' },
];
const LEAGUE_KEYS = new Set(LEAGUES.map((l) => l.key));

/** Where each list comes from: the app's sport (for ESPN's path) and the picker league it fills. */
export const SOURCES = [
  { key: 'nfl', league: 'nfl' },
  { key: 'nba', league: 'nba' },
  { key: 'mlb', league: 'mlb' },
  { key: 'nhl', league: 'nhl' },
  { key: 'ncaaf', league: 'ncaa' },
  { key: 'ncaab', league: 'ncaa' },
];

/**
 * The college programs on offer: ESPN lists hundreds of schools, and a grid
 * of every one is no use on a phone. Matched to ESPN by the school's name
 * (its "location", like "Ohio State"), never by a prefix, so Miami (OH) and
 * Kansas State don't sneak in as Miami and Kansas.
 */
export const COLLEGE_PROGRAMS = [
  'Alabama', 'Ohio State', 'Michigan', 'Georgia', 'Texas', 'LSU', 'USC', 'Notre Dame', 'Oklahoma', 'Florida',
  'Penn State', 'Clemson', 'Oregon', 'Tennessee', 'Auburn', 'Texas A&M', 'Florida State', 'Miami', 'Wisconsin', 'Iowa',
  'Michigan State', 'Nebraska', 'UCLA', 'Washington', 'Arkansas', 'Ole Miss', 'Kentucky', 'Duke', 'North Carolina', 'Kansas',
  'UConn', 'Gonzaga', 'Villanova', 'Arizona', 'Indiana', 'Louisville', 'Syracuse', 'Baylor', 'Houston', 'Purdue',
  'Virginia', 'Marquette', 'Creighton', 'Texas Tech', 'Colorado', 'Utah', 'Boise State', 'BYU', 'Iowa State', 'Missouri',
  'South Carolina',
];
const norm = (s) => String(s ?? '').trim().toLowerCase();
const PROGRAMS = new Set(COLLEGE_PROGRAMS.map(norm));

/** Is this one of the curated college programs? Exact names only. */
export function isCuratedProgram(...names) {
  return names.some((n) => PROGRAMS.has(norm(n)));
}

/** A team icon's key: "team:nfl:KC" (pro, by abbreviation) or "team:ncaa:333" (college, by ESPN id). */
export const TEAM_KEY = /^team:(nfl|nba|mlb|nhl|ncaa):([A-Za-z0-9]{1,8})$/;

/** The logo's address if it's https on ESPN's image server, else null. */
export function cleanLogo(url) {
  if (typeof url !== 'string' || url.length > 300) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname === LOGO_HOST && !u.username && !u.password && !u.port ? u.href : null;
  } catch {
    return null;
  }
}

const cleanName = (s) => (typeof s === 'string' && s.trim() && s.trim().length <= 60 ? s.trim() : null);

/** The ESPN URL for one source's team list. College lists are long, so ask for all of them at once. */
export function teamsUrl(source) {
  const sport = SPORT[source];
  return `${BASE}/${sport.espnPath}/teams${source.startsWith('ncaa') ? '?limit=1000' : ''}`;
}

/**
 * Teams from one ESPN team list (`sports[0].leagues[0].teams[].team`), in
 * the picker's shape. Anything that doesn't fit is dropped: no name, an id or
 * abbreviation that isn't plain, or a logo that isn't https on ESPN's image
 * server. College lists keep only the curated programs.
 */
export function parseTeams(source, data) {
  const src = SOURCES.find((s) => s.key === source);
  const list = data?.sports?.[0]?.leagues?.[0]?.teams;
  if (!src || !Array.isArray(list)) return [];
  const out = new Map();
  for (const entry of list) {
    const t = entry?.team;
    if (!t || typeof t !== 'object' || t.isActive === false) continue;
    const name = cleanName(t.displayName);
    const abbr = typeof t.abbreviation === 'string' && /^[A-Za-z0-9]{1,8}$/.test(t.abbreviation) ? t.abbreviation : null;
    const id = /^\d{1,8}$/.test(String(t.id ?? '')) ? String(t.id) : null;
    const logo = (Array.isArray(t.logos) ? t.logos : []).map((l) => cleanLogo(l?.href)).find(Boolean) ?? null;
    if (!name || !abbr || !logo) continue;
    if (src.league === 'ncaa' && (!id || !isCuratedProgram(t.location, t.shortDisplayName))) continue;
    const key = `team:${src.league}:${src.league === 'ncaa' ? id : abbr}`;
    if (!TEAM_KEY.test(key) || out.has(key)) continue;
    out.set(key, { key, league: src.league, name, abbr, logo, color: cleanHex(t.color) });
  }
  return [...out.values()];
}

const byName = (a, b) => a.name.localeCompare(b.name);

/**
 * The catalog. `fetch` is ESPN's (null means never fetch: the tests and the
 * demo, which use the stored list or the games table). `refreshIfDue()` starts
 * a refresh in the background when a list is a day old and returns at once.
 */
export function createTeamCatalog({ store, fetch = null, now = () => new Date(), log = console, timeoutMs = 8000, refreshEvery = REFRESH_EVERY, retryAfter = RETRY_AFTER }) {
  const lists = new Map(); // source -> { teams, at }
  let byKey = new Map();
  let fallbackCache = null;
  let refreshing = null;
  let lastTry = 0;

  function rebuild() {
    byKey = new Map();
    for (const { teams } of lists.values()) for (const t of teams) if (!byKey.has(t.key)) byKey.set(t.key, t);
  }

  // What the last run stored, so a restart doesn't wait on ESPN.
  for (const src of SOURCES) {
    const rows = store.all('SELECT key, name, abbr, logo, color, fetched_at FROM team_catalog WHERE source = ? ORDER BY name', src.key);
    const teams = rows
      .map((r) => ({ key: r.key, league: src.league, name: r.name, abbr: r.abbr, logo: cleanLogo(r.logo), color: cleanHex(r.color) }))
      .filter((t) => t.logo && TEAM_KEY.test(t.key));
    if (teams.length) lists.set(src.key, { teams, at: Math.min(...rows.map((r) => Date.parse(r.fetched_at) || 0)) });
  }
  rebuild();

  async function fetchSource(src) {
    const res = await fetch(teamsUrl(src.key), {
      headers: { accept: 'application/json', 'user-agent': 'bookiebullies-app/0.1' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`answered ${res.status}`);
    const teams = parseTeams(src.key, await res.json());
    // An empty or broken list never wipes a good one.
    if (!teams.length) throw new Error('no teams in the answer');
    const at = now();
    store.tx(() => {
      store.run('DELETE FROM team_catalog WHERE source = ?', src.key);
      for (const t of teams) {
        store.run('INSERT INTO team_catalog (source, key, name, abbr, logo, color, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          src.key, t.key, t.name, t.abbr, t.logo, t.color, at.toISOString());
      }
    });
    lists.set(src.key, { teams, at: at.getTime() });
    return teams.length;
  }

  /** Fetch every list now. Resolves (never rejects) with how many teams each source gave; a source that failed keeps its old list. */
  function refresh() {
    if (!fetch) return Promise.resolve({});
    if (refreshing) return refreshing;
    lastTry = now().getTime();
    refreshing = (async () => {
      const counts = {};
      await Promise.all(SOURCES.map(async (src) => {
        try {
          counts[src.key] = await fetchSource(src);
        } catch (err) {
          counts[src.key] = 0;
          log.warn(`team list ${src.key}: ${err.message}`);
        }
      }));
      rebuild();
      return counts;
    })().finally(() => {
      refreshing = null;
    });
    return refreshing;
  }

  /** The teams the games table has seen, for a league whose list hasn't loaded. Read at most every few minutes. */
  function fallback() {
    const t = now().getTime();
    if (fallbackCache && t - fallbackCache.at < FALLBACK_FOR) return fallbackCache.byLeague;
    // The newest game's details win (SQLite takes the other columns from the MAX row).
    const rows = store.all(`
      SELECT sport, abbr, name, short, logo, color, MAX(start_time) AS seen FROM (
        SELECT sport, home_abbr AS abbr, home_name AS name, home_short AS short, home_logo AS logo, home_color AS color, start_time FROM games
        UNION ALL
        SELECT sport, away_abbr, away_name, away_short, away_logo, away_color, start_time FROM games
      ) WHERE logo IS NOT NULL GROUP BY sport, abbr`);
    const byLeague = new Map(LEAGUES.map((l) => [l.key, new Map()]));
    for (const r of rows) {
      const logo = cleanLogo(r.logo);
      const name = cleanName(r.name);
      if (!logo || !name || !/^[A-Za-z0-9]{1,8}$/.test(r.abbr ?? '')) continue;
      let key;
      if (r.sport === 'ncaaf' || r.sport === 'ncaab') {
        const id = /\/ncaa\/500\/(\d{1,8})\.png$/.exec(logo)?.[1];
        if (!id || !isCuratedProgram(r.short)) continue;
        key = `team:ncaa:${id}`;
      } else if (LEAGUE_KEYS.has(r.sport)) {
        key = `team:${r.sport}:${r.abbr}`;
      } else continue;
      const league = key.split(':')[1];
      byLeague.get(league).set(key, { key, league, name, abbr: r.abbr, logo, color: cleanHex(r.color) });
    }
    fallbackCache = { at: t, byLeague };
    return byLeague;
  }

  /** A league's teams, A to Z: ESPN's list once it has loaded, else what the games table has seen. */
  function league(key) {
    const loaded = SOURCES.filter((s) => s.league === key && lists.has(s.key));
    if (loaded.length) {
      const seen = new Map();
      for (const s of loaded) for (const t of lists.get(s.key).teams) if (!seen.has(t.key)) seen.set(t.key, t);
      return [...seen.values()].sort(byName);
    }
    return [...(fallback().get(key)?.values() ?? [])].sort(byName);
  }

  return {
    refresh,

    /** Start a refresh in the background if a list is a day old (or missing), unless one just failed. Never waits. */
    refreshIfDue() {
      if (!fetch || refreshing) return refreshing;
      const t = now().getTime();
      const stale = SOURCES.some((s) => !lists.has(s.key) || t - lists.get(s.key).at >= refreshEvery);
      if (!stale || t - lastTry < retryAfter) return null;
      return refresh();
    },

    /** Every league with teams, for the picker. */
    leagues: () => LEAGUES.map((l) => ({ ...l, teams: league(l.key) })).filter((l) => l.teams.length),

    /** One team by its icon key, or null if it isn't in the catalog (or the fallback) now. */
    get(key) {
      const m = TEAM_KEY.exec(String(key ?? ''));
      if (!m) return null;
      const loaded = SOURCES.some((s) => s.league === m[1] && lists.has(s.key));
      return loaded ? byKey.get(key) ?? null : fallback().get(m[1])?.get(key) ?? null;
    },
  };
}
