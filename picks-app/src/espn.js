// Games, lines and final scores from ESPN's public scoreboard: the same feed
// Bookie Bullies and cfb-bot read. It needs no key, but ESPN doesn't document
// it, so everything here reads it defensively.

const BASE = 'https://site.api.espn.com/apis/site/v2/sports';

// Statuses that end a game without a result. Sportsbooks void these, so the
// app does too.
export const VOID_STATUSES = new Set(['STATUS_POSTPONED', 'STATUS_CANCELED', 'STATUS_FORFEIT', 'STATUS_ABANDONED']);

export function createEspn({ fetch = globalThis.fetch, timeoutMs = 8000 } = {}) {
  return {
    /** Every game on the Eastern days `from` to `to` ("20261019"). */
    async scoreboard(sport, from, to = from) {
      const query = new URLSearchParams({ dates: from === to ? from : `${from}-${to}`, limit: '1000', ...sport.params });
      const res = await fetch(`${BASE}/${sport.espnPath}/scoreboard?${query}`, {
        headers: { accept: 'application/json', 'user-agent': 'bookiebullies-app/0.1' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`ESPN ${sport.key} scoreboard answered ${res.status}`);
      return parseScoreboard(sport, await res.json());
    },
  };
}

export function parseScoreboard(sport, data) {
  const games = [];
  for (const event of data?.events ?? []) {
    const comp = event.competitions?.[0] ?? {};
    const sides = Object.fromEntries((comp.competitors ?? []).map((c) => [c.homeAway, c]));
    const start = new Date(event.date ?? comp.date);
    if (!sides.home || !sides.away || !event.id || Number.isNaN(+start)) continue;
    const type = (comp.status ?? event.status ?? {}).type ?? {};
    const state = ['pre', 'in', 'post'].includes(type.state) ? type.state : 'pre';
    const home = team(sides.home, state);
    const away = team(sides.away, state);
    games.push({
      id: `${sport.key}:${event.id}`,
      sport: sport.key,
      start: start.toISOString(),
      state,
      status: type.name ?? '',
      detail: type.shortDetail ?? type.detail ?? '',
      completed: Boolean(type.completed),
      home,
      away,
      lines: parseLines(sport, firstOdds(comp.odds), home, away),
    });
  }
  return games;
}

function team(competitor, state) {
  const t = competitor.team ?? {};
  const score = Number.parseInt(competitor.score?.value ?? competitor.score, 10);
  return {
    name: t.displayName ?? t.shortDisplayName ?? t.abbreviation ?? '?',
    short: t.shortDisplayName ?? t.name ?? t.abbreviation ?? '?',
    abbr: t.abbreviation ?? '',
    logo: espnLogo(t.logo ?? t.logos?.[0]?.href),
    score: state === 'pre' || Number.isNaN(score) ? null : score,
  };
}

// Team logos load straight from ESPN's image server, the way Bookie Bullies
// shows them. Only that host: the page's security policy allows nothing else.
export const LOGO_HOST = 'a.espncdn.com';

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
