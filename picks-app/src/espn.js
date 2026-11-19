// Games, lines and final scores from ESPN's public scoreboard: the same feed
// Bookie Bullies and cfb-bot read. It needs no key, but ESPN doesn't document
// it, so everything here reads it defensively.

import { addDays } from './time.js';

const BASE = 'https://site.api.espn.com/apis/site/v2/sports';

// Statuses that end a game without a result. Sportsbooks void these, so the
// app does too.
export const VOID_STATUSES = new Set(['STATUS_POSTPONED', 'STATUS_CANCELED', 'STATUS_FORFEIT', 'STATUS_ABANDONED']);

export function createEspn({ fetch = globalThis.fetch, timeoutMs = 8000 } = {}) {
  async function get(sport, what, query) {
    const res = await fetch(`${BASE}/${sport.espnPath}/${what}?${query}`, {
      headers: { accept: 'application/json', 'user-agent': 'bookiebullies-app/0.1' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`ESPN ${sport.key} ${what} answered ${res.status}`);
    return res.json();
  }

  async function day(sport, date) {
    // One day per request, with the same limit cfb-bot uses: ESPN answers 400
    // to the date-range and limit=1000 form.
    const query = new URLSearchParams({ dates: date, limit: '400', ...sport.params });
    return parseScoreboard(sport, await get(sport, 'scoreboard', query));
  }

  return {
    /** Every game on the Eastern days `from` to `to` ("20261019"). */
    async scoreboard(sport, from, to = from) {
      const dates = [];
      for (let d = from; d <= to; d = addDays(d, 1)) dates.push(d);
      const days = await Promise.all(dates.map((date) => day(sport, date)));
      // A game can show on two days' boards (late starts, ESPN's own day cutoff).
      return [...new Map(days.flat().map((g) => [g.id, g])).values()];
    },

    /** One game's injuries and each team's last five results ("401772712" is the part of the app's id after the colon). */
    async summary(sport, eventId) {
      return parseSummary(await get(sport, 'summary', new URLSearchParams({ event: String(eventId) })));
    },
  };
}

// ---- Game summary: injuries and recent form ---------------------------------
// ESPN's summary endpoint isn't documented and its shape varies by sport, so
// anything that doesn't fit is dropped, and a game with nothing usable shows
// nothing.

export const INJURIES_PER_TEAM = 6;
export const FORM_GAMES = 5;

// Worst first. Anything not listed sorts after these; Active isn't an injury.
const STATUS_RANK = ['injured reserve', 'out', 'suspension', 'doubtful', 'questionable', 'day-to-day', 'probable'];

/**
 * { injuries: [{ abbr, name, players: [{ name, pos, status, detail }] }],
 *   form: [{ abbr, name, games: [{ result, score, atVs, opp, date }] }] }
 * Teams with nothing usable are left out.
 */
export function parseSummary(data) {
  const out = { injuries: [], form: [] };
  if (!data || typeof data !== 'object') return out;
  for (const entry of Array.isArray(data.injuries) ? data.injuries : []) {
    const team = teamKey(entry?.team);
    if (!team) continue;
    const players = (Array.isArray(entry.injuries) ? entry.injuries : []).map(injury).filter(Boolean);
    players.sort((a, b) => rank(a.status) - rank(b.status));
    if (players.length) out.injuries.push({ ...team, players: players.slice(0, INJURIES_PER_TEAM) });
  }
  for (const entry of Array.isArray(data.lastFiveGames) ? data.lastFiveGames : []) {
    const team = teamKey(entry?.team);
    if (!team) continue;
    let games = (Array.isArray(entry.events) ? entry.events : []).map(formGame).filter(Boolean);
    // Newest first, when every game has a date to sort by.
    if (games.every((g) => g.date)) games = games.sort((a, b) => b.date.localeCompare(a.date));
    if (games.length) out.form.push({ ...team, games: games.slice(0, FORM_GAMES) });
  }
  return out;
}

function teamKey(team) {
  const abbr = text(team?.abbreviation, 8);
  const name = text(team?.displayName ?? team?.shortDisplayName ?? team?.name, 60);
  return abbr || name ? { abbr: abbr?.toUpperCase() ?? null, name } : null;
}

function injury(item) {
  const name = text(item?.athlete?.displayName ?? item?.athlete?.fullName, 40);
  const raw = typeof item?.status === 'string' ? item.status : item?.type?.description ?? item?.details?.fantasyStatus?.description;
  const status = statusName(raw);
  if (!name || !status) return null;
  const pos = text(item.athlete.position?.abbreviation, 5);
  const detail = text(item.details?.type, 24);
  return { name, pos: pos && /^[A-Za-z0-9-]+$/.test(pos) ? pos.toUpperCase() : null, status, detail };
}

/** "OUT", "day-to-day" -> "Out", "Day-To-Day". Active and blank are no injury. */
function statusName(raw) {
  const s = text(raw, 24);
  if (!s || /^active$/i.test(s)) return null;
  return s.toLowerCase().replace(/(^|[\s-])([a-z])/g, (_, sep, c) => sep + c.toUpperCase());
}

function rank(status) {
  const i = STATUS_RANK.indexOf(status.toLowerCase());
  return i < 0 ? STATUS_RANK.length : i;
}

function formGame(e) {
  const result = String(e?.gameResult ?? '').toUpperCase();
  if (!['W', 'L', 'T'].includes(result)) return null;
  const score = /^\s*(\d{1,3})\s*-\s*(\d{1,3})\s*$/.exec(String(e.score ?? ''));
  const opp = text(e.opponent?.abbreviation, 8)?.toUpperCase() ?? null;
  if (!score || !opp) return null;
  const atVs = e.atVs === '@' ? '@' : 'vs';
  const when = new Date(e.gameDate ?? '');
  return { result, score: `${score[1]}-${score[2]}`, atVs, opp, date: Number.isNaN(+when) ? null : when.toISOString() };
}

/** A trimmed string of at most `max` characters, or null. */
function text(value, max) {
  if (typeof value !== 'string') return null;
  const t = value.replace(/\s+/g, ' ').trim();
  return t && t.length <= max ? t : null;
}

/**
 * The summary's teams lined up with the game's: { away: { injuries, form },
 * home: { ... } }, matched by abbreviation, then by name. Null when nothing matched.
 */
export function summaryForGame(summary, game) {
  if (!summary) return null;
  const find = (list, side) => {
    const t = game[side];
    return list.find((e) => e.abbr && e.abbr === t.abbr?.toUpperCase()) ?? list.find((e) => e.name && e.name === t.name) ?? null;
  };
  const side = (s) => ({ injuries: find(summary.injuries, s)?.players ?? [], form: find(summary.form, s)?.games ?? [] });
  const out = { away: side('away'), home: side('home') };
  const any = (key) => out.away[key].length + out.home[key].length > 0;
  return any('injuries') || any('form') ? out : null;
}

export function parseScoreboard(sport, data) {
  const games = [];
  for (const event of data?.events ?? []) {
    const comp = event.competitions?.[0] ?? {};
    const sides = Object.fromEntries((comp.competitors ?? []).map((c) => [c.homeAway, c]));
    const start = new Date(event.date ?? comp.date);
    if (!sides.home || !sides.away || !event.id || Number.isNaN(+start)) continue;
    const status = comp.status ?? event.status ?? {};
    const type = status.type ?? {};
    const state = ['pre', 'in', 'post'].includes(type.state) ? type.state : 'pre';
    const home = team(sides.home, state, sport);
    const away = team(sides.away, state, sport);
    games.push({
      id: `${sport.key}:${event.id}`,
      sport: sport.key,
      start: start.toISOString(),
      state,
      status: type.name ?? '',
      detail: type.shortDetail ?? type.detail ?? '',
      completed: Boolean(type.completed),
      // The quarter, half, period or inning, and the game clock ("6:10"), for game alerts.
      period: state === 'pre' ? null : periodOf(status.period),
      clock: state === 'pre' ? null : clockOf(status.displayClock),
      tv: broadcast(comp),
      home,
      away,
      lines: parseLines(sport, firstOdds(comp.odds), home, away),
      ...seasonWeek(event, data),
      // "Men's Basketball Championship - South Region - 1st Round": how the
      // bracket challenge (src/bracket.js) finds tournament games.
      note: gameNote(comp, event),
    });
  }
  return games;
}

/** ESPN's status.period: a whole number from 1 to 30, else null. */
function periodOf(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 30 ? n : null;
}

/** ESPN's status.displayClock ("6:10", "45.2", "0:00"), else null. */
function clockOf(value) {
  const t = typeof value === 'string' ? value.trim() : '';
  return /^\d{1,2}(:\d{2})?(\.\d)?$/.test(t) ? t : null;
}

/**
 * The season and week ESPN files a game under: { season: 2026, seasonType:
 * 2, week: 10 } (type 1 is the preseason, 2 the regular season, 3 the
 * playoffs). The event's own fields first, then the scoreboard's. Anything
 * missing or odd is null, and src/nflweeks.js works the week out from the date.
 */
function seasonWeek(event, data) {
  const whole = (value, min, max) => {
    const n = Number(value);
    return Number.isInteger(n) && n >= min && n <= max ? n : null;
  };
  const season = event.season ?? data?.season ?? {};
  return {
    season: whole(season.year, 2000, 2100),
    seasonType: whole(season.type, 1, 4),
    week: whole(event.week?.number ?? data?.week?.number, 1, 30),
  };
}

function team(competitor, state, sport) {
  const t = competitor.team ?? {};
  const score = Number.parseInt(competitor.score?.value ?? competitor.score, 10);
  return {
    name: t.displayName ?? t.shortDisplayName ?? t.abbreviation ?? '?',
    short: t.shortDisplayName ?? t.name ?? t.abbreviation ?? '?',
    abbr: t.abbreviation ?? '',
    logo: espnLogo(t.logo ?? t.logos?.[0]?.href) ?? fallbackLogo(sport, t),
    score: state === 'pre' || Number.isNaN(score) ? null : score,
    record: teamRecord(competitor.records),
    color: teamColor(t.color),
    // The second color, for "Match my team" when the first doesn't read on the page.
    alt: teamColor(t.alternateColor),
    // ESPN's team id, and a tournament seed when it sends one: the
    // competitor's own seed, else its curated rank (which ESPN fills with the
    // seed in the NCAA tournament; during the season it's the AP rank, so
    // only the bracket challenge reads it, and only on tournament games).
    espnId: /^\d{1,8}$/.test(String(t.id ?? '')) ? String(t.id) : null,
    seed: seedOf(competitor),
  };
}

/** A whole number from 1 to 16 from competitor.seed or curatedRank.current, else null (99 is ESPN's "unranked"). */
function seedOf(competitor) {
  for (const value of [competitor.seed, competitor.curatedRank?.current]) {
    const n = Number(value);
    if (Number.isInteger(n) && n >= 1 && n <= 16) return n;
  }
  return null;
}

/** The game's headline note, if any: competitions[0].notes[0].headline, else the event's. */
function gameNote(comp, event) {
  const notes = [...(Array.isArray(comp.notes) ? comp.notes : []), ...(Array.isArray(event.notes) ? event.notes : [])];
  const text = notes.map((n) => n?.headline ?? n?.text).find((h) => typeof h === 'string' && h.trim());
  return text ? text.trim().slice(0, 160) : null;
}

/** "e31837" -> "#e31837"; anything else -> null. */
function teamColor(value) {
  return /^[0-9a-f]{6}$/i.test(value ?? '') ? `#${value.toLowerCase()}` : null;
}

/** "6-2", "10-5-1": the team's overall record, if ESPN sends one. */
function teamRecord(records) {
  const all = Array.isArray(records) ? records.find((r) => r?.type === 'total' || r?.name === 'overall') ?? records[0] : null;
  return /^\d{1,3}-\d{1,3}(-\d{1,3})?$/.test(all?.summary ?? '') ? all.summary : null;
}

/** The TV channel or stream ("CBS", "ESPN+"), if ESPN lists one. */
function broadcast(comp) {
  const name = comp.broadcasts?.[0]?.names?.[0] ?? comp.geoBroadcasts?.[0]?.media?.shortName;
  return typeof name === 'string' && name.trim() ? name.trim().slice(0, 20) : null;
}

// Team logos load straight from ESPN's image server, the way Bookie Bullies
// shows them. Only that host: the page's security policy allows nothing else.
export const LOGO_HOST = 'a.espncdn.com';

/** ESPN's standard logo address, for a team the feed sent without one. */
function fallbackLogo(sport, t) {
  const league = sport.espnPath.split('/')[1];
  if (league.startsWith('college') || league.startsWith('mens-college')) {
    return /^\d{1,6}$/.test(String(t.id ?? '')) ? `https://${LOGO_HOST}/i/teamlogos/ncaa/500/${t.id}.png` : null;
  }
  return /^[A-Za-z]{2,4}$/.test(t.abbreviation ?? '') ? `https://${LOGO_HOST}/i/teamlogos/${league}/500/${t.abbreviation.toLowerCase()}.png` : null;
}

function espnLogo(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname === LOGO_HOST ? u.href : null;
  } catch {
    return null;
  }
}

function firstOdds(list) {
  return (list ?? []).find((o) => o && (o.details || o.spread != null || o.overUnder != null || o.moneyline)) ?? null;
}

/**
 * The game's current lines from one ESPN odds entry. ESPN has carried two
 * shapes: the older flat one (details "UGA -7.5", spread, overUnder,
 * homeTeamOdds.moneyLine) and DraftKings' nested one (moneyline.home.close.odds,
 * pointSpread.home.close.line, total.over.close.line). Read both.
 *
 * Returns { spread: {home, homeOdds, awayOdds}, total: {points, overOdds,
 * underOdds}, ml: {home, away}, book } with null for a market that isn't up.
 */
export function parseLines(sport, odds, home, away) {
  const lines = { spread: null, total: null, ml: null, book: null };
  if (!odds) return lines;
  lines.book = odds.provider?.displayName ?? odds.provider?.name ?? null;

  let mlHome = american(pick(odds.moneyline?.home) ?? odds.homeTeamOdds?.moneyLine);
  let mlAway = american(pick(odds.moneyline?.away) ?? odds.awayTeamOdds?.moneyLine);

  let homeSpread = number(pick(odds.pointSpread?.home, 'line'));
  const details = String(odds.details ?? '').trim();
  const match = /^(\S+)\s+([+-]?\d+(?:\.\d+)?)$/.exec(details);
  if (/^(EVEN|PK|PICK)$/i.test(details)) {
    homeSpread ??= 0;
  } else if (match) {
    const abbr = match[1].toUpperCase();
    const value = Number(match[2]);
    const isHome = abbr === home.abbr.toUpperCase();
    const isAway = abbr === away.abbr.toUpperCase();
    // MLB and NHL put the favorite's moneyline here ("NYY -149"), not a spread.
    if (Math.abs(value) >= 100) {
      if (isHome) mlHome ??= american(value);
      if (isAway) mlAway ??= american(value);
    } else if (isHome) {
      homeSpread ??= value;
    } else if (isAway) {
      homeSpread ??= -value;
    }
  }
  if (homeSpread == null && number(odds.spread) != null) {
    // Signed from the home side: negative means home is favored. When ESPN
    // marks the favorite, trust that for the sign.
    const size = Math.abs(number(odds.spread));
    if (odds.homeTeamOdds?.favorite === true) homeSpread = -size;
    else if (odds.awayTeamOdds?.favorite === true) homeSpread = size;
    else homeSpread = number(odds.spread);
  }

  const homeSpreadOdds = american(pick(odds.pointSpread?.home) ?? odds.homeTeamOdds?.spreadOdds);
  const awaySpreadOdds = american(pick(odds.pointSpread?.away) ?? odds.awayTeamOdds?.spreadOdds);
  const spreadPriced = homeSpreadOdds != null && awaySpreadOdds != null;
  if (homeSpread != null && (spreadPriced || !sport.spreadNeedsPrice)) {
    lines.spread = { home: homeSpread, homeOdds: homeSpreadOdds ?? -110, awayOdds: awaySpreadOdds ?? -110 };
  }

  const total = number(odds.overUnder) ?? number(pick(odds.total?.over, 'line'));
  if (total != null && total > 0) {
    lines.total = {
      points: total,
      overOdds: american(pick(odds.total?.over) ?? odds.overOdds) ?? -110,
      underOdds: american(pick(odds.total?.under) ?? odds.underOdds) ?? -110,
    };
  }

  if (mlHome != null && mlAway != null) lines.ml = { home: mlHome, away: mlAway };
  return lines;
}

// The nested shape has open and close prices. Close is the current number
// until the game starts.
function pick(side, field = 'odds') {
  return side?.close?.[field] ?? side?.current?.[field] ?? side?.open?.[field] ?? null;
}

/** "+150", "-110", "EVEN", 150 -> an American price, or null. */
export function american(value) {
  if (value == null) return null;
  const text = String(value).trim().toUpperCase();
  if (text === 'EVEN' || text === 'EV') return 100;
  const n = Math.round(Number(text.replace(/^\+/, '')));
  return Number.isFinite(n) && Math.abs(n) >= 100 ? n : null;
}

// "o47.5", "u47.5", "-3.5", 47.5 -> a number.
function number(value) {
  if (value == null || value === '') return null;
  const n = Number(String(value).trim().replace(/^[ou]/i, ''));
  return Number.isFinite(n) ? n : null;
}
