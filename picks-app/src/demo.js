// Demo mode: a made-up ESPN with three weeks of finals and a week of games
// ahead, plus six players with records and two groups. Every game is built in
// ESPN's own JSON and read through the real parser, so the demo exercises the
// same code as production. Log in as demo@example.com / letmein123.

import zlib from 'node:zlib';

import { hashPassword } from './auth.js';
import { checkAllBadges } from './badges.js';
import { closeWeek } from './contest.js';
import { seasonOfDate } from './nflweeks.js';
import { closePickemWeeks, gradePickem } from './pickem.js';
import { ensurePool, gradeSurvivor, survivorState } from './survivor.js';
import { parseScoreboard, parseSummary } from './espn.js';
import { postMessage } from './chat.js';
import { createGroup, joinGroup, setHomeCity, startRoom } from './groups.js';
import { inviteCodeOf } from './invites.js';
import { saveNametag } from './nametags.js';
import { createOfficialImporter, ensureOfficial } from './official.js';
import { cleanImage, mediaDir, savePhoto } from './photos.js';
import { grade, gradeFinished, MARKETS, maxUnits, parlayMaxUnits, parlayPrice, price } from './picks.js';
import { SPORTS } from './sports.js';
import { createTeamCatalog } from './teams.js';
import { teamAccent, teamsBySport } from './themes.js';
import { addDays, DAY, etDay, etToUtc, HOUR, mondayOf, weekday } from './time.js';
import { createNotifier } from './notify.js';
import { ensureChallenge, GAMES, openChallenge, participants, saveField, savePicks } from './bracket.js';
import { createLeague, joinLeague, leagueById, runLeagues } from './leagues.js';
import { publishPrize, savePrize, setReviewed } from './prizes.js';
import {
  AUTO, backfillCup, closeTournament, createCustom, createPlayerTournament, ensureAutoTournaments, joinTournament, reportTournament, sendMoveAlerts, standingsOf,
} from './tournaments.js';

export const DEMO_LOGIN = { email: 'demo@example.com', password: 'letmein123' };

const TEAMS = {
  nfl: ['Chiefs KC', 'Bills BUF', 'Eagles PHI', 'Ravens BAL', 'Lions DET', '49ers SF', 'Cowboys DAL', 'Packers GB', 'Bengals CIN', 'Dolphins MIA', 'Jets NYJ', 'Rams LAR'],
  ncaaf: ['Georgia UGA', 'Texas TEX', 'Ohio State OSU', 'Michigan MICH', 'Alabama ALA', 'Oregon ORE', 'LSU LSU', 'Penn State PSU', 'Notre Dame ND', 'Clemson CLEM', 'Tennessee TENN', 'USC USC'],
  nba: ['Celtics BOS', 'Lakers LAL', 'Nuggets DEN', 'Knicks NY', 'Bucks MIL', 'Warriors GS', 'Suns PHX', 'Heat MIA', 'Thunder OKC', 'Mavericks DAL'],
  ncaab: ['Duke DUKE', 'UConn CONN', 'Kansas KU', 'Kentucky UK', 'Houston HOU', 'Purdue PUR', 'Gonzaga GONZ', 'North Carolina UNC'],
  mlb: ['Dodgers LAD', 'Yankees NYY', 'Braves ATL', 'Astros HOU', 'Phillies PHI', 'Orioles BAL', 'Mets NYM', 'Padres SD'],
  nhl: ['Rangers NYR', 'Bruins BOS', 'Oilers EDM', 'Panthers FLA', 'Avalanche COL', 'Stars DAL', 'Maple Leafs TOR', 'Golden Knights VGK'],
};

// Weekdays (Sunday 0) and Eastern start times for each sport.
const SLATE = {
  nfl: { days: [0, 1, 4], times: [[13, 0], [16, 25], [20, 20]] },
  ncaaf: { days: [6], times: [[12, 0], [15, 30], [19, 30]] },
  nba: { times: [[19, 30], [22, 0]] },
  ncaab: { times: [[19, 0], [21, 0]] },
  mlb: { times: [[13, 5], [19, 10]] },
  nhl: { times: [[19, 0], [22, 0]] },
};

// Spread and total ranges, final-score noise, and whether games can tie.
const SHAPE = {
  nfl: { spread: 10, total: [38, 52], sd: 13, totalSd: 10, ties: true },
  ncaaf: { spread: 17, total: [44, 66], sd: 15, totalSd: 12, ties: false },
  nba: { spread: 11, total: [212, 240], sd: 11, totalSd: 15, ties: false },
  ncaab: { spread: 13, total: [130, 155], sd: 10, totalSd: 13, ties: false },
  mlb: { spread: 0, total: [7, 10], sd: 3, totalSd: 3, ties: false },
  nhl: { spread: 0, total: [5.5, 6.5], sd: 2, totalSd: 2, ties: false },
};

const PAST_DAYS = 21;

/** `now` is the clock the feed reports at; `anchor` fixes which games exist. */
export function createDemoEspn({ now = () => new Date(), anchor = now() } = {}) {
  const rand = prng(20261019);
  const bySport = new Map();
  const today = etDay(anchor);
  let nextId = 900000;
  for (const sport of SPORTS) {
    const specs = [];
    for (let d = -PAST_DAYS; d <= sport.days; d++) {
      const day = addDays(today, d);
      const weekday = new Date(Date.UTC(+day.slice(0, 4), +day.slice(4, 6) - 1, +day.slice(6, 8))).getUTCDay();
      const slate = SLATE[sport.key];
      if (slate.days && !slate.days.includes(weekday)) continue;
      const teams = shuffle([...TEAMS[sport.key]], rand);
      slate.times.forEach(([h, m], i) => {
        specs.push(game(sport.key, String(nextId++), etToUtc(day, h, m), teams[2 * i], teams[2 * i + 1], rand));
      });
    }
    bySport.set(sport.key, specs);
  }
  // NFL games carry ESPN's season and week, like the real feed.
  for (const g of bySport.get('nfl')) Object.assign(g, demoWeek(g.start, anchor));
  // A few games already under way when the demo starts, whatever the hour,
  // so live scores and a live tournament's "As it stands" have something to
  // show. Their own random numbers, so the rest of the schedule stays the same.
  const liveRand = prng(5150);
  const liveStart = new Date(Math.floor((anchor.getTime() - 75 * 60_000) / (5 * 60_000)) * 5 * 60_000);
  for (const key of ['nba', 'ncaab', 'nhl']) {
    const specs = bySport.get(key);
    const busy = new Set(specs.filter((g) => etDay(g.start) === etDay(liveStart)).flatMap((g) => [g.home.abbr, g.away.abbr]));
    const free = shuffle(TEAMS[key].filter((entry) => !busy.has(team(entry).abbr)), liveRand);
    if (free.length >= 2) specs.push(game(key, String(nextId++), liveStart, free[0], free[1], liveRand));
  }
  return {
    async scoreboard(sport, from, to = from) {
      const at = now();
      const events = bySport
        .get(sport.key)
        .filter((g) => etDay(g.start) >= from && etDay(g.start) <= to)
        .map((g) => espnEvent(g, at));
      return parseScoreboard(sport, { events });
    },
    /** Made-up injuries, and each team's real last five from the demo's own finals, in ESPN's summary JSON. */
    async summary(sport, eventId) {
      const list = bySport.get(sport.key) ?? [];
      const g = list.find((x) => x.id === String(eventId));
      return parseSummary(g ? espnSummary(g, list, now()) : {});
    },
  };
}

const INJURY_NAMES = ['Marcus Reed', 'Tyler Banks', 'Jalen Price', 'Devin Holt', 'Chris Moreno', 'Andre Wells', 'Luke Garrison', 'Isaiah Cole', 'Nate Fuller', 'Omar Haynes', 'Ryan Pierce', 'Darius Lowe'];
const POSITIONS = {
  nfl: ['QB', 'WR', 'RB', 'TE', 'LB', 'CB', 'S', 'OT'], ncaaf: ['QB', 'WR', 'RB', 'TE', 'LB', 'CB', 'S', 'DE'],
  nba: ['PG', 'SG', 'SF', 'PF', 'C'], ncaab: ['G', 'F', 'C'],
  mlb: ['SP', 'RP', '1B', 'SS', 'CF', 'C'], nhl: ['C', 'LW', 'RW', 'D', 'G'],
};
const INJURY_STATUSES = ['Out', 'Questionable', 'Day-To-Day', 'Doubtful', 'Out', 'Questionable'];
const INJURY_TYPES = ['Ankle', 'Knee', 'Hamstring', 'Shoulder', 'Back', 'Illness', 'Concussion'];

function espnSummary(g, list, at) {
  const sides = ['home', 'away'];
  const injuries = sides.map((side) => {
    const t = g[side];
    const n = seed(g.id + side) % 5;
    return {
      team: { abbreviation: t.abbr, displayName: t.name },
      injuries: Array.from({ length: n }, (_, i) => {
        const k = seed(`${g.id}${side}${i}`);
        return {
          athlete: { displayName: INJURY_NAMES[k % INJURY_NAMES.length], position: { abbreviation: POSITIONS[g.sport][k % POSITIONS[g.sport].length] } },
          status: INJURY_STATUSES[(k >> 3) % INJURY_STATUSES.length],
          details: { type: INJURY_TYPES[seed(`${g.id}${side}${i}type`) % INJURY_TYPES.length] },
        };
      }),
    };
  });
  const lastFiveGames = sides.map((side) => {
    const abbr = g[side].abbr;
    const done = list
      .filter((x) => x.start < g.start && new Date(x.start).getTime() + 3.5 * HOUR <= at.getTime() && (x.home.abbr === abbr || x.away.abbr === abbr))
      .sort((a, b) => b.start.localeCompare(a.start))
      .slice(0, 5);
    return {
      team: { abbreviation: abbr },
      events: done.map((x) => {
        const mine = x.home.abbr === abbr ? 'home' : 'away';
        const theirs = mine === 'home' ? 'away' : 'home';
        const [us, them] = [x.final[mine], x.final[theirs]];
        return {
          gameResult: us > them ? 'W' : us < them ? 'L' : 'T',
          score: `${Math.max(us, them)}-${Math.min(us, them)}`,
          atVs: mine === 'home' ? 'vs' : '@',
          opponent: { abbreviation: x[theirs].abbr, displayName: x[theirs].name },
          gameDate: x.start,
        };
      }),
    };
  });
  return { injuries, lastFiveGames };
}

function game(sport, id, start, homeTeam, awayTeam, rand) {
  const shape = SHAPE[sport];
  const [home, away] = [team(homeTeam), team(awayTeam)];
  const total = half(shape.total[0] + rand() * (shape.total[1] - shape.total[0]));
  let homeSpread;
  let favorite;
  if (shape.spread) {
    homeSpread = half((rand() * 2 - 1) * shape.spread);
    favorite = homeSpread < 0 ? 'home' : 'away';
  } else {
    favorite = rand() < 0.55 ? 'home' : 'away';
    homeSpread = favorite === 'home' ? -1.5 : 1.5;
  }
  const strength = shape.spread ? Math.abs(homeSpread) : 1 + rand() * 3;
  const favMl = -Math.round((112 + strength * (shape.spread ? 24 : 30)) / 5) * 5;
  const dogMl = Math.round((Math.abs(favMl) - 20) / 5) * 5;
  const ml = favorite === 'home' ? { home: favMl, away: dogMl } : { home: dogMl, away: favMl };

  const margin = (shape.spread ? -homeSpread : favorite === 'home' ? 0.6 : -0.6) + normal(rand) * shape.sd;
  const points = Math.max(margin + 2, total + normal(rand) * shape.totalSd);
  let h = Math.max(0, Math.round((points + margin) / 2));
  let a = Math.max(0, Math.round((points - margin) / 2));
  if (h === a && !shape.ties) margin >= 0 ? (h += 1) : (a += 1);
  return { sport, id, start: start.toISOString(), home, away, homeSpread, total, ml, final: { home: h, away: a } };
}

// The demo's NFL calendar: the anchor's Tuesday-to-Monday week is Week 10,
// whatever the date, so Survivor and NFL Pick'em always have a season to show.
const DEMO_WEEK = 10;
const tuesdayOf = (day) => addDays(day, -((weekday(day) + 5) % 7));
const dayUtc = (day) => Date.UTC(+day.slice(0, 4), +day.slice(4, 6) - 1, +day.slice(6, 8));

function demoWeek(start, anchor) {
  const week = DEMO_WEEK + Math.round((dayUtc(tuesdayOf(etDay(start))) - dayUtc(tuesdayOf(etDay(anchor)))) / (7 * DAY));
  return week >= 1 && week <= 18 ? { week, season: seasonOfDate(anchor) } : {};
}

/** The game as ESPN's scoreboard would show it at `at`. */
// Made-up team colors, records and channels, so demo cards look like the real ones.
// Each is [color, alternateColor], the way ESPN sends them; a few are light, a few too dark to read on the page.
const DEMO_COLORS = [
  ['c8102e', 'ffffff'], ['00338d', 'c60c30'], ['004c54', 'a5acaf'], ['241773', '9e7c0c'], ['0076b6', 'b0b7bc'], ['aa0000', 'b3995d'],
  ['041e42', 'a5acaf'], ['203731', 'ffb612'], ['fb4f14', '000000'], ['008e97', 'fc4c02'], ['125740', 'ffffff'], ['ffb612', '101820'],
  ['fdb927', '552583'], ['f2f2f2', '13274f'],
];
const DEMO_TV = { nfl: ['CBS', 'FOX', 'NBC', 'ESPN', 'Prime Video'], ncaaf: ['ESPN', 'ABC', 'FOX', 'CBS'], nba: ['ESPN', 'TNT', 'NBA TV'], ncaab: ['ESPN2', 'FS1', 'CBS'], mlb: ['FOX', 'TBS', 'ESPN'], nhl: ['ESPN+', 'TNT', 'NHL Net'] };
const seed = (text) => [...String(text)].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 9973, 7);

function espnEvent(g, at) {
  const started = at >= new Date(g.start);
  const done = at >= new Date(new Date(g.start).getTime() + 3.5 * HOUR);
  const share = done ? 1 : started ? Math.min(0.9, (at - new Date(g.start)) / (3.5 * HOUR)) : 0;
  const state = done ? 'post' : started ? 'in' : 'pre';
  const pro = ['nfl', 'nba', 'mlb', 'nhl'].includes(g.sport);
  const competitor = (side) => ({
    homeAway: side,
    score: started ? String(Math.round(g.final[side] * share)) : '0',
    team: {
      abbreviation: g[side].abbr,
      displayName: g[side].name,
      shortDisplayName: g[side].short,
      logo: pro ? `https://a.espncdn.com/i/teamlogos/${g.sport}/500/${g[side].abbr.toLowerCase()}.png` : undefined,
      color: DEMO_COLORS[seed(g[side].abbr) % DEMO_COLORS.length][0],
      alternateColor: DEMO_COLORS[seed(g[side].abbr) % DEMO_COLORS.length][1],
    },
    records: [{ type: 'total', summary: `${3 + (seed(g[side].abbr) % 6)}-${1 + (seed(g[side].abbr + 'l') % 5)}` }],
  });
  const legacy = g.sport === 'mlb' || g.sport === 'nhl';
  const fav = g.ml.home < 0 ? 'home' : 'away';
  const odds = legacy
    ? {
        provider: { name: 'ESPN BET', displayName: 'ESPN BET' },
        details: `${g[fav].abbr} ${g.ml[fav]}`,
        spread: 1.5,
        overUnder: g.total,
        homeTeamOdds: { favorite: fav === 'home', moneyLine: g.ml.home, spreadOdds: fav === 'home' ? 135 : -155 },
        awayTeamOdds: { favorite: fav === 'away', moneyLine: g.ml.away, spreadOdds: fav === 'away' ? 135 : -155 },
      }
    : {
        provider: { name: 'DraftKings', displayName: 'DraftKings' },
        details: g.homeSpread === 0 ? 'EVEN' : `${g.homeSpread < 0 ? g.home.abbr : g.away.abbr} -${Math.abs(g.homeSpread)}`,
        spread: g.homeSpread,
        overUnder: g.total,
        moneyline: { home: { close: { odds: signed(g.ml.home) } }, away: { close: { odds: signed(g.ml.away) } } },
        pointSpread: {
          home: { close: { line: signed(g.homeSpread), odds: '-110' } },
          away: { close: { line: signed(-g.homeSpread), odds: '-110' } },
        },
        total: { over: { close: { line: `o${g.total}`, odds: '-110' } }, under: { close: { line: `u${g.total}`, odds: '-110' } } },
      };
  return {
    id: g.id,
    date: g.start,
    ...(g.week ? { season: { year: g.season, type: 2, slug: 'regular-season' }, week: { number: g.week } } : {}),
    competitions: [{
      broadcasts: [{ names: [DEMO_TV[g.sport][seed(g.id) % DEMO_TV[g.sport].length]] }],
      competitors: [competitor('home'), competitor('away')],
      status: {
        type: {
          state,
          completed: done,
          name: done ? 'STATUS_FINAL' : started ? 'STATUS_IN_PROGRESS' : 'STATUS_SCHEDULED',
          shortDetail: done ? 'Final' : started ? 'In progress' : '',
        },
      },
      odds: state === 'pre' ? [odds] : [],
    }],
  };
}

const BIOS = {
  SharpShooter: 'Sides and totals, mostly NBA and NHL. I shop the number and I post every pick before the game.',
  FadeMe: 'You know what to do.',
  DogLover: 'Plus money or nothing.',
};

const PLAYERS = [
  // name, how often they're right, how many games they play
  ['SharpShooter', 0.6, 0.45],
  ['BackdoorCover', 0.55, 0.35],
  ['ChalkEater', 0.5, 0.4],
  ['DogLover', 0.53, 0.3],
  ['OverOverOver', 0.49, 0.3],
  ['FadeMe', 0.41, 0.4],
];

/** Fill an empty database with players, picks and groups. */
export async function seedDemo({ store, games, espn, now = () => new Date(), mediaDir: dir = null }) {
  const at = now();
  const today = etDay(at);
  // Load games as they stood a day before each one, so past games carry
  // their pregame lines, then bring everything up to now.
  const pregame = createDemoEspn({ anchor: at, now: () => new Date(at.getTime() - (PAST_DAYS + 1) * 86_400_000) });
  for (const sport of SPORTS) {
    games.save(await pregame.scoreboard(sport, addDays(today, -PAST_DAYS), addDays(today, sport.days)));
    games.save(await espn.scoreboard(sport, addDays(today, -PAST_DAYS), addDays(today, sport.days)));
  }

  const rand = prng(7);
  const clvRand = prng(11);
  const ids = {};
  for (const [name] of PLAYERS) {
    const email = name === 'SharpShooter' ? DEMO_LOGIN.email : `${name.toLowerCase()}@example.com`;
    const hash = await hashPassword(name === 'SharpShooter' ? DEMO_LOGIN.password : `${name}-demo`);
    const created = new Date(at.getTime() - (PAST_DAYS + 3) * 86_400_000).toISOString();
    ids[name] = Number(store.run(
      `INSERT INTO users (email, password_hash, screen_name, created_at, bio, age_confirmed_at, terms_accepted_at, email_verified_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      email, hash, name, created, BIOS[name] ?? null, created, created, created,
    ).lastInsertRowid);
    if (name === 'SharpShooter') store.run("UPDATE users SET link_url = 'https://t.me/example', link_label = 'Get my picks' WHERE id = ?", ids[name]);
  }

  const all = store.all('SELECT * FROM games').map((row) => ({
    id: row.id, sport: row.sport, start: row.start_time, state: row.state,
    homeScore: row.home_score, awayScore: row.away_score,
    lines: JSON.parse(row.lines), home: { short: row.home_short, abbr: row.home_abbr }, away: { short: row.away_short, abbr: row.away_abbr },
  }));
  store.tx(() => {
    for (const [name, skill, activity] of PLAYERS) {
      for (const g of all) {
        if (rand() > activity) continue;
        const open = g.state === 'pre';
        const market = ['spread', 'spread', 'total', 'ml'][Math.floor(rand() * 4)];
        let side = MARKETS[market][Math.floor(rand() * 2)];
        const p = price(g, market, side);
        if (!p) continue;
        if (!open) {
          // A sharper player lands on the right side more often.
          const wins = grade({ market, side, line: p.line }, g.homeScore, g.awayScore) === 'win';
          if (wins !== rand() < skill) side = MARKETS[market].find((s) => s !== side);
        }
        // A past pick went in hours before the close, so its number often
        // differs from the closing one: more often in a sharp player's favor.
        // Its own random numbers, and never a different result, so the
        // records come out the same as without it.
        const close = price(g, market, side);
        let chosen = close;
        if (!open) {
          const early = earlyNumber(close, g.sport, market, side, skill, clvRand);
          if (grade({ market, side, line: early.line }, g.homeScore, g.awayScore) === grade({ market, side, line: close.line }, g.homeScore, g.awayScore)) chosen = early;
        }
        const start = new Date(g.start).getTime();
        const madeAt = open ? at.getTime() - rand() * 6 * HOUR : start - (1 + rand() * 30) * HOUR;
        if (open && madeAt >= start) continue;
        const units = Math.min([1, 1, 1, 2, 0.5, 3][Math.floor(rand() * 6)], maxUnits(chosen.odds));
        store.run(
          `INSERT OR IGNORE INTO picks (user_id, game_id, sport, market, side, line, odds, units, game_start, made_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ids[name], g.id, g.sport, market, side, chosen.line, chosen.odds, units, g.start, new Date(madeAt).toISOString(),
        );
      }
    }
  });
  // The official account: a record on past games, like the site's would be.
  const officialId = ensureOfficial(store, at);
  store.run('UPDATE users SET created_at = ? WHERE id = ?', new Date(at.getTime() - (PAST_DAYS + 3) * 86_400_000).toISOString(), officialId);
  store.tx(() => {
    for (const g of all) {
      if (!OFFICIAL_SPORTS[g.sport] || g.state === 'pre' || rand() > 0.4) continue;
      const market = rand() < 0.6 ? 'spread' : 'ml';
      let side = MARKETS[market][Math.floor(rand() * 2)];
      const p = price(g, market, side);
      if (!p) continue;
      const wins = grade({ market, side, line: p.line }, g.homeScore, g.awayScore) === 'win';
      if (wins !== rand() < 0.57) side = MARKETS[market].find((s) => s !== side);
      const chosen = price(g, market, side);
      const units = [1, 1.5, 2, 3.3][Math.floor(rand() * 4)];
      const madeAt = new Date(new Date(g.start).getTime() - (2 + rand() * 10) * HOUR).toISOString();
      const pickId = Number(store.run(
        `INSERT INTO picks (user_id, game_id, sport, market, side, line, odds, units, game_start, made_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        officialId, g.id, g.sport, market, side, chosen.line, chosen.odds, units, g.start, madeAt,
      ).lastInsertRowid);
      store.run(
        'INSERT INTO official_picks (source_id, pick_id, is_lock, conf, imported_at) VALUES (?, ?, ?, ?, ?)',
        `demo:${g.id}:${market}`, pickId, rand() < 0.25 ? 1 : 0, 3 + Math.floor(rand() * 3), madeAt,
      );
    }
  });
  // A few parlays per player on past games, so records, profiles and feeds show them.
  store.tx(() => {
    const past = all.filter((g) => g.state !== 'pre');
    for (const [name] of PLAYERS) {
      for (let n = 0; n < 3; n++) {
        const size = 2 + Math.floor(rand() * 3);
        const from = Math.floor(rand() * Math.max(1, past.length - 40));
        const legs = [];
        for (const g of shuffle(past.slice(from, from + 40), rand)) {
          if (legs.length === size) break;
          const market = ['spread', 'total', 'ml'][Math.floor(rand() * 3)];
          const side = MARKETS[market][Math.floor(rand() * 2)];
          const p = price(g, market, side);
          if (p) legs.push({ g, market, side, ...p });
        }
        if (legs.length < 2) continue;
        legs.sort((a, b) => a.g.start.localeCompare(b.g.start));
        const { decimal, american } = parlayPrice(legs);
        const units = Math.min(1, parlayMaxUnits(decimal));
        if (units < 0.1) continue;
        const sports = new Set(legs.map((l) => l.g.sport));
        const madeAt = new Date(new Date(legs[0].g.start).getTime() - (1 + rand() * 20) * HOUR).toISOString();
        const id = Number(store.run(
          'INSERT INTO parlays (user_id, sport, units, odds, made_at, first_start) VALUES (?, ?, ?, ?, ?, ?)',
          ids[name], sports.size === 1 ? [...sports][0] : null, units, american, madeAt, legs[0].g.start,
        ).lastInsertRowid);
        for (const l of legs) {
          store.run(
            'INSERT INTO parlay_legs (parlay_id, game_id, sport, market, side, line, odds) VALUES (?, ?, ?, ?, ?, ?, ?)',
            id, l.g.id, l.g.sport, l.market, l.side, l.line, l.odds,
          );
        }
      }
    }
  });
  gradeFinished(store, at);

  const crew = createGroup(store, { ownerId: ids.SharpShooter, name: 'Saturday Crew', sport: 'ncaaf', now: at });
  for (const n of ['BackdoorCover', 'ChalkEater', 'FadeMe']) joinGroup(store, { groupId: crew.id, userId: ids[n], now: at });
  const office = createGroup(store, { ownerId: ids.FadeMe, name: 'Office League', sport: '', now: at });
  for (const n of ['SharpShooter', 'DogLover', 'OverOverOver']) joinGroup(store, { groupId: office.id, userId: ids[n], now: at });
  seedRooms(store, ids, at);

  // Today's and tomorrow's official picks go in through the real importer, from a made-up picks log.
  const soon = new Set([today, addDays(today, 1)]);
  const log = all
    .filter((g) => OFFICIAL_SPORTS[g.sport] && g.state === 'pre' && soon.has(etDay(g.start)) && rand() < 0.5)
    .map((g, i) => {
      const conf = 3 + Math.floor(rand() * 3);
      const day = etDay(g.start);
      return {
        date: `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6)}`, id: `demo${i}`, event_id: g.id.split(':')[1],
        sport: OFFICIAL_SPORTS[g.sport], type: rand() < 0.5 ? 'ML' : 'RL', pick: rand() < 0.5 ? g.home.abbr : g.away.abbr,
        away: g.away.abbr, home: g.home.abbr, odds: '-110', conf, is_lock: conf === 5, unit: [1, 1.5, 2, 3.3][Math.floor(rand() * 4)], result: null,
      };
    });
  const quiet = { warn() {}, error() {}, log() {} };
  const fakeFetch = async () => new Response(log.map((row) => JSON.stringify(row)).join('\n'));
  await createOfficialImporter({ store, games, url: 'demo', fetch: fakeFetch, now, log: quiet }).run();

  seedStreaks(store, ids, today, rand);
  // The weeks already over get their contest closed, so the winners wall has history.
  const week = mondayOf(at);
  for (const back of [3, 2, 1]) closeWeek(store, addDays(week, -7 * back), at, { lastWeek: back === 1 });
  store.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('contest_since', ?)", addDays(week, -7));
  // Two friends joined from the demo player's invite link: one more for Recruiter.
  inviteCodeOf(store, ids.SharpShooter);
  for (const name of ['DogLover', 'OverOverOver']) {
    store.run('UPDATE users SET invited_by = ?, invite_counted_at = created_at WHERE id = ?', ids.SharpShooter, ids[name]);
  }
  await seedTournaments(store, ids, at);
  seedPlayerTournaments(store, ids, at);
  await seedFormats(store, ids, at);
  seedLeagues(store, at);
  seedBracket(store, at);
  seedPrizes(store, ids, at);
  checkAllBadges(store, at);
  seedNametags(store, ids);
  if (dir) seedLooks(store, ids, dir);
}

// More NFL players for Survivor and Pick'em, so the standings look like a
// real pool. They have no bets and can't log in.
const NFL_PLAYERS = ['BlitzKing', 'RedZoneRay', 'HailMaryHank', 'PickSixPete', 'CoverQueen', 'MondayNightMo', 'TwoMinuteTina', 'GoalLineGus',
  'SundaySweat', 'FourthAndLong', 'PuntGod', 'TurnoverTom', 'SnapCount', 'NickelPackage'];

/**
 * Survivor and NFL Pick'em: this season's pool with past weeks graded (some
 * players out by a loss, one by a missed week, two who joined late), this
 * week partly picked (the demo player hasn't picked yet, so the slip and the
 * hub offer it), Pick'em picks for every week so far with the past weeks
 * closed, and Cup points from everything that's closed.
 */
async function seedFormats(store, ids, at) {
  const rand = prng(1010);
  const created = new Date(at.getTime() - (PAST_DAYS + 3) * DAY).toISOString();
  const everyone = { ...ids };
  for (const name of NFL_PLAYERS) {
    everyone[name] = Number(store.run(
      `INSERT INTO users (email, password_hash, screen_name, created_at, age_confirmed_at, terms_accepted_at, email_verified_at)
       VALUES (?, '!', ?, ?, ?, ?, ?)`,
      `${name.toLowerCase()}@example.com`, name, created, created, created, created,
    ).lastInsertRowid);
  }
  const pool = ensurePool(store, at);
  const state = survivorState(store, at);
  if (!pool || !state.current) return;
  const current = state.current.week;
  const past = state.weeks.filter((w) => w.week < current);
  const firstWeek = state.weeks[0]?.week ?? current;
  const final = (row) => row.state === 'post' && row.home_score != null;
  const winner = (row) => (row.home_score > row.away_score ? 'home' : row.away_score > row.home_score ? 'away' : null);
  const late = new Set(['TurnoverTom', 'SnapCount']);

  // Survivor: everyone in from the first week on the board, two from last week.
  const alive = new Map();
  for (const [name, id] of Object.entries(everyone)) {
    const start = late.has(name) ? current - 1 : firstWeek;
    const w = state.weeks.find((x) => x.week === start) ?? state.current;
    store.run(
      'INSERT INTO survivor_entries (pool_id, user_id, joined_at, start_week) VALUES (?, ?, ?, ?)',
      pool.id, id, new Date(new Date(w.first ?? at).getTime() - 2 * DAY).toISOString(), start,
    );
    alive.set(name, { id, start, used: new Set() });
  }
  const pick = (name, row, side, week) => {
    const p = alive.get(name);
    const team = side === 'home' ? row.home_abbr : row.away_abbr;
    p.used.add(team);
    store.run(
      'INSERT INTO survivor_picks (pool_id, user_id, week, game_id, side, team, made_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      pool.id, p.id, week, row.id, side, team, new Date(new Date(row.start_time).getTime() - (4 + rand() * 40) * HOUR).toISOString(),
    );
  };
  const sides = (row) => ['home', 'away'].map((side) => ({ row, side }));
  for (const w of past) {
    for (const [name, p] of [...alive]) {
      if (p.start > w.week) continue;
      if (name === 'MondayNightMo' && w.week === current - 2) { alive.delete(name); continue; }
      const open = w.games.filter(final).flatMap(sides).filter((c) => !p.used.has(c.side === 'home' ? c.row.home_abbr : c.row.away_abbr));
      const winners = open.filter((c) => winner(c.row) === c.side);
      // The demo player always survives; everyone else picks a winner most weeks.
      const list = name === 'SharpShooter' || rand() < 0.6 ? winners : open;
      const c = list[Math.floor(rand() * list.length)];
      if (!c) continue;
      pick(name, c.row, c.side, w.week);
      if (winner(c.row) !== c.side) alive.delete(name);
    }
  }
  // This week: a few picked the game already played, most picked a later one, a few haven't picked. The demo player hasn't.
  const thisWeek = state.current.games;
  const played = thisWeek.filter((row) => new Date(row.start_time) <= at);
  const later = thisWeek.filter((row) => new Date(row.start_time) > at);
  for (const [name, p] of alive) {
    if (name === 'SharpShooter' || rand() < 0.2) continue;
    const from = played.length && rand() < 0.3 ? played : later;
    const open = from.flatMap(sides).filter((c) => !p.used.has(c.side === 'home' ? c.row.home_abbr : c.row.away_abbr));
    const c = open[Math.floor(rand() * open.length)];
    if (c) pick(name, c.row, c.side, current);
  }
  gradeSurvivor(store, at);

  // NFL Pick'em: every week so far. Past weeks are full; this week has the played game and some of the rest.
  const skill = new Map(Object.keys(everyone).map((name) => [name, name === 'SharpShooter' ? 0.62 : 0.42 + rand() * 0.2]));
  for (const w of [...past, state.current]) {
    for (const [name, id] of Object.entries(everyone)) {
      if (name !== 'SharpShooter' && rand() < 0.2) continue;
      const rows = w.week === current
        ? w.games.filter((row) => new Date(row.start_time) <= at || rand() < (name === 'SharpShooter' ? 0.45 : 0.6))
        : w.games;
      const made = [];
      for (const row of rows) {
        const lines = JSON.parse(row.lines);
        const game = { lines };
        let side = rand() < 0.5 ? 'home' : 'away';
        const p = price(game, 'spread', side);
        if (!p) continue;
        if (final(row)) {
          const right = grade({ market: 'spread', side, line: p.line }, row.home_score, row.away_score) === 'win';
          if (right !== rand() < skill.get(name)) side = side === 'home' ? 'away' : 'home';
        }
        const madeAt = new Date(Math.min(new Date(row.start_time).getTime() - (2 + rand() * 30) * HOUR, at.getTime() - rand() * 20 * HOUR)).toISOString();
        store.run(
          'INSERT INTO pickem_picks (user_id, game_id, season, week, side, line, made_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          id, row.id, pool.season, w.week, side, price(game, 'spread', side).line, madeAt,
        );
        made.push(row);
      }
      // A Best Bet: a game still to come this week, or any game in a past one.
      const choices = w.week === current ? made.filter((row) => new Date(row.start_time) > at) : made;
      const best = choices[Math.floor(rand() * choices.length)];
      if (best) store.run('UPDATE pickem_picks SET best = 1 WHERE user_id = ? AND game_id = ?', id, best.id);
    }
  }
  gradePickem(store, at);
  closePickemWeeks(store, at);
  // Cup points for the tournaments and weekly contests that already closed.
  backfillCup(store, at);
}

/**
 * Name colors and icons for most of the players: two earned icons (a weekly
 * winner's crown, a tournament champion's trophy), a team logo from the
 * board, and a few plain emoji. Saved the way the profile form saves them.
 */
function seedNametags(store, ids) {
  const teams = createTeamCatalog({ store });
  const nfl = teams.leagues().find((l) => l.key === 'nfl')?.teams ?? [];
  const tags = [
    ['BackdoorCover', 'gold', 'crown'],
    ['ChalkEater', 'purple', 'trophy'],
    ['DogLover', 'teal', nfl.find((t) => t.abbr === 'PHI')?.key ?? nfl[0]?.key ?? 'goat'],
    ['OverOverOver', 'red', 'fire'],
    ['SharpShooter', 'sky', 'shark'],
    ['FadeMe', 'default', 'joker'],
  ];
  for (const [name, color, icon] of tags) {
    const result = saveNametag(store, { userId: ids[name], color, icon, teams });
    if (result.error) console.error(`demo name tag for ${name}: ${result.error}`);
  }
}

/**
 * A few players get photos (made here: a figure on a colored square), two
 * get cover photos (a colored gradient with stripes), and three get team
 * looks: one on a team too dark for the page, one on a light team with the
 * light background, so both sides of the readability guard show.
 */
function seedLooks(store, ids, dir) {
  const faces = { BackdoorCover: ['#1d4ed8', '#fde68a'], ChalkEater: ['#b91c1c', '#fecaca'], DogLover: ['#047857', '#a7f3d0'], FadeMe: ['#6d28d9', '#ddd6fe'] };
  mediaDir(dir);
  for (const [name, [bg, fg]] of Object.entries(faces)) {
    const image = cleanImage(demoFace(bg, fg));
    if (!image.error) savePhoto(store, dir, ids[name], image);
  }
  const covers = { BackdoorCover: ['#0b1f4d', '#2563eb', '#f59e0b'], DogLover: ['#022c22', '#059669', '#a7f3d0'] };
  for (const [name, colors] of Object.entries(covers)) {
    const image = cleanImage(demoCover(...colors), 'cover');
    if (!image.error) savePhoto(store, dir, ids[name], image, 'cover');
  }
  const teams = teamsBySport(store).flatMap((g) => g.teams);
  const pick = (test) => teams.find(test);
  const looks = [
    ['BackdoorCover', pick((t) => t.color === '#041e42'), 'dark'],
    ['ChalkEater', pick((t) => t.color === '#ffb612'), 'light'],
    ['DogLover', pick((t) => t.color === '#004c54'), 'dark'],
  ];
  for (const [name, team, mode] of looks) {
    if (!team) continue;
    const { accent } = teamAccent({ primary: team.color, alternate: team.alt }, mode);
    store.run("UPDATE users SET theme = 'custom', theme_team = ?, theme_mode = ?, theme_accent = ?, theme_tint = ? WHERE id = ?", team.key, mode, accent, team.color, ids[name]);
  }
  store.run("UPDATE users SET theme = 'royal' WHERE id = ?", ids.FadeMe);
}

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** A 96×96 PNG: a head and shoulders in `fg` on a `bg` square. */
function demoFace(bg, fg) {
  const [b, f] = [bg, fg].map(rgb);
  return demoPng(96, 96, (x, y) => {
    const head = (x - 48) ** 2 + (y - 38) ** 2 < 17 ** 2;
    const body = (x - 48) ** 2 / 34 ** 2 + (y - 96) ** 2 / 34 ** 2 < 1;
    return head || body ? f : b;
  });
}

/** A 1200×400 PNG cover: a diagonal gradient from `from` to `to`, with stripes in `stripe`. */
function demoCover(from, to, stripe) {
  const [a, b, s] = [from, to, stripe].map(rgb);
  return demoPng(1200, 400, (x, y) => {
    const t = Math.min(1, Math.max(0, (x + y * 1.5) / 1800));
    const base = a.map((c, i) => c + (b[i] - c) * t);
    // Soft stripes leaning right, fading in from the left.
    const d = (((x - y * 0.6) % 260) + 260) % 260;
    const fade = Math.min(1, Math.max(0, (x - 300) / 500));
    const on = d > 150 && d < 190 ? 0.35 * fade * Math.sin(((d - 150) / 40) * Math.PI) : 0;
    return base.map((c, i) => Math.round(c + (s[i] - c) * on));
  });
}

/** A PNG of `width`×`height`, each pixel's [r, g, b] from `pixel(x, y)`. */
function demoPng(width, height, pixel) {
  const rows = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 3);
    for (let x = 0; x < width; x++) pixel(x, y).forEach((c, i) => (row[1 + x * 3 + i] = c));
    rows.push(row);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Tournaments: the timer's own (this week's Weekly Open, and whatever NFL
 * Sunday, College Saturday and Hoops Night fall in the next two days), a
 * custom one that's live with everyone in it (the demo player too, with bets
 * on the games under way, so "As it stands" moves), and last week's auto ones
 * finished and closed.
 */
async function seedTournaments(store, ids, at) {
  const today = etDay(at);
  await ensureAutoTournaments(store, at);
  const others = Object.keys(ids).filter((n) => n !== 'SharpShooter');
  const enter = (t, names, joinedAt) => {
    for (const n of names) {
      store.run('INSERT OR IGNORE INTO tournament_entries (tournament_id, user_id, joined_at) VALUES (?, ?, ?)', t.id, ids[n], joinedAt);
    }
  };

  // Finished: the auto ones from the last week, everyone in from the day before.
  for (let d = 7; d >= 1; d--) {
    const day = addDays(today, -d);
    for (const a of AUTO) {
      if (a.weekday != null && weekday(day) !== a.weekday) continue;
      if (a.weekday == null && d > 2) continue;
      const first = store.get(
        `SELECT MIN(start_time) AS first FROM games WHERE sport IN (${a.sports.map(() => '?').join(', ')}) AND start_time >= ? AND start_time < ?`,
        ...a.sports, etToUtc(day, 0).toISOString(), etToUtc(addDays(day, 1), 0).toISOString(),
      ).first;
      if (!first) continue;
      const slug = `${a.key}-${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6)}`;
      store.run(
        `INSERT OR IGNORE INTO tournaments (slug, name, sports, starts_at, ends_at, min_bets, prize, kind, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'Tournament champion badge and a spot on the winners wall', 'auto', ?)`,
        slug, a.name, a.sports.join(','), first, etToUtc(addDays(day, 1), 0).toISOString(), a.min, etToUtc(addDays(day, -2), 12).toISOString(),
      );
      const t = store.get('SELECT * FROM tournaments WHERE slug = ?', slug);
      enter(t, Object.keys(ids), etToUtc(addDays(day, -2), 12).toISOString());
      closeTournament(store, t, at);
    }
  }

  // Live: a custom one, all sports, started three days ago.
  const admin = ids.SharpShooter;
  const date = (day) => `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6)}`;
  const cup = createCustom(store, {
    name: 'Bullies Fall Classic', sports: [], startDate: date(addDays(today, -3)), startTime: '00:00',
    endDate: date(addDays(today, 3)), endTime: '23:59', minBets: 5, prize: 'Champion badge and the top spot on the winners wall',
    userId: admin, now: new Date(etToUtc(addDays(today, -4), 9)),
  });
  enter(store.get('SELECT * FROM tournaments WHERE slug = ?', cup.slug), Object.keys(ids), etToUtc(addDays(today, -4), 12).toISOString());
  // Today's Hoops Night is live too (the games under way are hoops): everyone was in from two days back.
  for (const t of store.all("SELECT * FROM tournaments WHERE kind = 'auto' AND starts_at <= ? AND ends_at > ?", at.toISOString(), at.toISOString())) {
    enter(t, Object.keys(ids), new Date(at.getTime() - 2 * 86_400_000).toISOString());
  }

  // Coming up: most players are in early; the demo player is in NFL Sunday.
  for (const t of store.all("SELECT * FROM tournaments WHERE kind = 'auto' AND starts_at > ?", at.toISOString())) {
    enter(t, others.slice(0, 2 + (t.id % 3)), at.toISOString());
    if (t.slug.startsWith('nfl-sunday')) joinTournament(store, t, admin, at);
  }
}

/**
 * Player-made tournaments and the rest of round two: bets on the games under
 * way (some winning, some losing, so the live standings move), chat in the
 * live one, a public player-made one the demo player can join, a private one
 * for the Los Angeles room (opened from its invite link), a reported one for
 * the admin page, a finished one the demo player won (Share), and the
 * "where you stand" notes the graded standings call for.
 */
function seedPlayerTournaments(store, ids, at) {
  const notifier = createNotifier({ store });
  const today = etDay(at);
  const date = (day) => `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6)}`;
  const earlier = new Date(at.getTime() - 2 * HOUR);

  // Bets on the games under way: the demo player and two others on the side
  // that's ahead, two on the side that's behind.
  const live = store.all("SELECT * FROM games WHERE state = 'in'");
  const leaders = ['SharpShooter', 'DogLover', 'OverOverOver'];
  const trailers = ['FadeMe', 'ChalkEater'];
  for (const g of live) {
    const lines = JSON.parse(g.lines);
    const ahead = g.home_score >= g.away_score ? 'home' : 'away';
    const behind = ahead === 'home' ? 'away' : 'home';
    for (const [names, side, units] of [[leaders, ahead, 3], [trailers, behind, 2]]) {
      for (const name of names) {
        const p = price({ lines }, 'ml', side);
        if (!p) continue;
        store.run(
          `INSERT OR IGNORE INTO picks (user_id, game_id, sport, market, side, line, odds, units, game_start, made_at)
           VALUES (?, ?, ?, 'ml', ?, NULL, ?, ?, ?, ?)`,
          ids[name], g.id, g.sport, side, p.odds, Math.min(units, maxUnits(p.odds)), g.start_time,
          new Date(new Date(g.start_time).getTime() - 3 * HOUR).toISOString(),
        );
      }
    }
  }

  // Chat in the live custom one.
  const classic = store.get("SELECT * FROM tournaments WHERE name = 'Bullies Fall Classic'");
  if (classic) {
    let t = at.getTime() - 50 * 60_000;
    for (const [name, text] of [
      ['FadeMe', 'Down bad tonight. Somebody fade me harder.'],
      ['DogLover', 'Dogs are barking. Watch the board move.'],
      ['SharpShooter', 'Three days left. Sitting on the number.'],
      ['ChalkEater', 'Chalk always comes home. Ask me Sunday.'],
    ]) postMessage(store, { tournamentId: classic.id, userId: ids[name], text, now: new Date((t += 7 * 60_000)) });
  }

  // A public player-made one tomorrow night, with room for the demo player to join.
  const tomorrow = date(addDays(today, 1));
  const hoops = createPlayerTournament(store, {
    name: 'Late Night Hoops', sports: ['nba', 'ncaab'], startDate: tomorrow, startTime: '19:00', endDate: tomorrow, endTime: '23:59',
    minBets: 2, visibility: 'public', userId: ids.DogLover, now: earlier, limit: false,
  });
  const join = (slug, names, code = null) => {
    const t = store.get('SELECT * FROM tournaments WHERE slug = ?', slug);
    for (const n of names) joinTournament(store, t, ids[n], earlier, { code });
    return t;
  };
  if (hoops.slug) join(hoops.slug, ['OverOverOver', 'ChalkEater', 'BackdoorCover']);

  // A private one for the Los Angeles room, opened from its invite link. The demo player's in the room, not in this yet.
  const la = store.get("SELECT id FROM friend_groups WHERE city_slug = 'los-angeles-ca'");
  const sunday = date(addDays(today, 2));
  const laCup = la && createPlayerTournament(store, {
    name: 'LA Weekend Sweat', sports: ['nfl', 'nba'], startDate: sunday, startTime: '13:00', endDate: sunday, endTime: '23:59',
    minBets: 3, visibility: 'private', groupId: la.id, userId: ids.ChalkEater, now: earlier, limit: false,
  });
  if (laCup?.slug) join(laCup.slug, ['DogLover', 'OverOverOver'], laCup.code);

  // Reported: one hidden by three reports, one with a single report.
  const fade = createPlayerTournament(store, {
    name: 'Fade Me Freeroll', sports: ['nba'], startDate: tomorrow, startTime: '20:00', endDate: tomorrow, endTime: '23:59',
    minBets: 1, visibility: 'public', userId: ids.FadeMe, now: earlier, limit: false,
  });
  if (fade.slug) {
    const t = store.get('SELECT * FROM tournaments WHERE slug = ?', fade.slug);
    for (const n of ['BackdoorCover', 'ChalkEater', 'OverOverOver']) reportTournament(store, t, ids[n], earlier);
  }
  const degens = createPlayerTournament(store, {
    name: 'Sunday Degens', sports: ['nfl'], startDate: sunday, startTime: '13:00', endDate: sunday, endTime: '23:59',
    minBets: 3, visibility: 'public', userId: ids.OverOverOver, now: earlier, limit: false,
  });
  if (degens.slug) reportTournament(store, store.get('SELECT * FROM tournaments WHERE slug = ?', degens.slug), ids.FadeMe, earlier);

  // Finished: a player-made one on a past day the demo player won.
  for (let d = 2; d <= 10; d++) {
    const day = addDays(today, -d);
    const made = createPlayerTournament(store, {
      name: 'Midweek Madness', sports: SPORTS.map((s) => s.key), startDate: date(day), startTime: '00:00', endDate: date(day), endTime: '23:59',
      minBets: 2, visibility: 'public', userId: ids.BackdoorCover, now: new Date(etToUtc(addDays(day, -2), 12)), limit: false,
    });
    const t = store.get('SELECT * FROM tournaments WHERE slug = ?', made.slug);
    for (const n of Object.keys(ids)) {
      store.run('INSERT OR REPLACE INTO tournament_entries (tournament_id, user_id, joined_at) VALUES (?, ?, ?)', t.id, ids[n], etToUtc(addDays(day, -2), 12).toISOString());
    }
    const top = standingsOf(store, t)[0];
    if (top?.rank === 1 && top.id === ids.SharpShooter) {
      closeTournament(store, t, at, notifier);
      break;
    }
    store.run('DELETE FROM tournaments WHERE id = ?', t.id);
  }

  // "You moved into 1st in ...": from the graded standings, as after any grading.
  sendMoveAlerts(store, at, notifier);
}

/**
 * Local rooms with members and some chat. The demo player is in Los Angeles,
 * with messages waiting, and not yet in San Diego, so joining shows off.
 */
function seedRooms(store, ids, at) {
  const rooms = [
    ['los-angeles-ca', ['SharpShooter', 'DogLover', 'OverOverOver', 'ChalkEater'], [
      ['DogLover', 'Anyone else riding the Clippers dog tonight?'],
      ['ChalkEater', 'Laying the points. Always.'],
      ['OverOverOver', 'Over in the Kings game. Book it.'],
    ]],
    ['san-diego-ca', ['BackdoorCover', 'FadeMe', 'DogLover'], [
      ['BackdoorCover', 'SD crew, what are we on this weekend?'],
      ['FadeMe', 'Whatever I pick, take the other side.'],
      ['DogLover', 'Chargers +3. Home dog, easy.'],
      ['BackdoorCover', 'Tailing that. Backdoor cover incoming.'],
    ]],
    ['san-luis-obispo-ca', ['ChalkEater', 'OverOverOver'], [['ChalkEater', 'SLO checking in. Who has the late slate?']]],
    ['santa-barbara-ca', ['FadeMe'], []],
  ];
  let t = at.getTime() - 3 * HOUR;
  for (const [slug, members, chat] of rooms) {
    const { id } = startRoom(store, { citySlug: slug, userId: ids[members[0]], now: new Date(t - 2 * 86_400_000), limit: false });
    for (const name of members.slice(1)) joinGroup(store, { groupId: id, userId: ids[name], now: new Date(t - 86_400_000) });
    for (const [name, text] of chat) postMessage(store, { groupId: id, userId: ids[name], text, now: new Date((t += 9 * 60_000)) });
  }
  // The demo player has seen nothing in Los Angeles yet, so it shows "3 new".
  for (const [name, slug] of [['DogLover', 'san-diego-ca'], ['BackdoorCover', 'san-diego-ca'], ['ChalkEater', 'los-angeles-ca'], ['FadeMe', 'santa-barbara-ca']]) {
    setHomeCity(store, { userId: ids[name], citySlug: slug, now: at, canStart: false });
  }
}

/**
 * Streak picks on past days: one graded straight pick a day, most days. The
 * demo player's are chosen to read as a run: nine wins, a loss, then six
 * wins going now (a day with no fitting pick is skipped, which never breaks
 * a streak). Nobody has today's yet, so the slip offers it.
 */
function seedStreaks(store, ids, today, rand) {
  const plan = ['win', 'win', 'win', 'win', 'win', 'win', 'win', 'win', 'win', 'loss', 'win', 'win', 'win', 'win', 'win', 'win'];
  for (const [name] of PLAYERS) {
    const userId = ids[name];
    const mine = name === 'SharpShooter';
    let step = 0;
    for (let d = -PAST_DAYS; d < 0; d++) {
      const day = addDays(today, d);
      if (mine && d < -plan.length - 3) continue;
      if (!mine && rand() < 0.35) continue;
      const picks = store.all(
        "SELECT id, result, game_start FROM picks WHERE user_id = ? AND result IN ('win', 'loss', 'push') ORDER BY game_start, id",
        userId,
      ).filter((p) => etDay(p.game_start) === day);
      const chosen = mine ? picks.find((p) => p.result === plan[step]) : picks[Math.floor(rand() * picks.length)];
      if (!chosen) continue;
      store.run('UPDATE picks SET streak_day = ? WHERE id = ?', day, chosen.id);
      if (mine && ++step === plan.length) break;
    }
  }
}

/**
 * The number a pick got before the line settled at its close: up to a point
 * either way on a spread or total, up to 15 cents on a moneyline (or a run
 * line or puck line, which stay at 1.5). A sharper player's moves lean their way.
 */
function earlyNumber(close, sport, market, side, skill, rand) {
  const size = [0, 0, 0.5, 0.5, 1][Math.floor(rand() * 5)];
  const good = rand() < 0.5 + (skill - 0.5) * 3 ? 1 : -1;
  if (market === 'ml' || (market === 'spread' && SHAPE[sport].spread === 0)) {
    const cents = size * 15 * good;
    let odds = close.odds + cents;
    if (close.odds < 0 && odds > -100) odds += 200;
    if (close.odds > 0 && odds < 100) odds -= 200;
    return { line: close.line, odds: Math.round(odds) };
  }
  // A higher spread is better for its side; a total is better lower for an over, higher for an under.
  const better = market === 'total' && side === 'over' ? -1 : 1;
  return { line: close.line + size * good * better, odds: close.odds };
}

// The site's sport names for the sports it posts picks in.
const OFFICIAL_SPORTS = { mlb: 'MLB', nba: 'NBA', ncaab: 'CBB' };

function team(entry) {
  const parts = entry.split(' ');
  const abbr = parts.pop();
  const short = parts.join(' ');
  return { short, abbr, name: short };
}

const half = (n) => Math.round(n * 2) / 2;
const signed = (n) => (n > 0 ? `+${n}` : `${n}`);

function normal(rand) {
  return Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
}

function shuffle(list, rand) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function prng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- leagues, the bracket challenge, prize tournaments ---------------------------

const userId = (store, name) => store.get('SELECT id FROM users WHERE screen_name = ?', name)?.id;

/**
 * Three leagues: one in its playoffs (a 3-week season that started three
 * Mondays ago, semifinals this week), one in the middle of its season (6
 * weeks, started two Mondays ago, 7 players so someone has a bye), and a
 * public one starting next Monday with room to join. The seasons are played
 * through the real timer job, on the demo's graded bets.
 */
function seedLeagues(store, at) {
  const monday = mondayOf(at);
  const make = (name, weeksBack, extra, members) => {
    const start = addDays(monday, -7 * weeksBack);
    const madeAt = etToUtc(addDays(start, -3), 12);
    const made = createLeague(store, { name, startWeek: start, visibility: 'public', userId: userId(store, members[0]), now: madeAt, limit: false, ...extra });
    if (!made.id) return null;
    const l = leagueById(store, made.id);
    members.slice(1).forEach((n, i) => joinLeague(store, l, userId(store, n), new Date(madeAt.getTime() + (i + 1) * 60_000)));
    // Play it forward a week at a time, as the timer would have.
    for (let w = weeksBack; w >= 1; w--) runLeagues(store, etToUtc(addDays(monday, -7 * w), 0, 5));
    runLeagues(store, at);
    return l;
  };
  make('Bully Bowl League', 3, { regularWeeks: 3, playoffSize: 4 },
    ['ChalkEater', 'SharpShooter', 'BackdoorCover', 'DogLover', 'OverOverOver', 'FadeMe', 'BlitzKing', 'CoverQueen']);
  make('Sunday Crew League', 2, { regularWeeks: 6, playoffSize: 4, sports: ['nba', 'ncaab', 'nhl', 'mlb', 'nfl', 'ncaaf'] },
    ['SharpShooter', 'DogLover', 'FadeMe', 'BackdoorCover', 'OverOverOver', 'ChalkEater', 'RedZoneRay']);
  make('Hoops Heads', 0, { regularWeeks: 4, playoffSize: 2, sports: ['nba', 'ncaab'], startWeek: addDays(monday, 7) },
    ['BackdoorCover', 'DogLover', 'HailMaryHank']);
}

// A made-up 68-team field: 64 slots, four of them First Four pairs.
const FIELD = {
  East: ['Duke', 'Tennessee', 'Kentucky', 'Arizona', 'Michigan State', 'BYU', 'Saint Mary\'s', 'Mississippi State', 'Baylor', 'Vanderbilt', 'Drake / Xavier', 'McNeese', 'High Point', 'Troy', 'Wofford', 'American / Mount St. Mary\'s'],
  West: ['Florida', 'St. John\'s', 'Texas Tech', 'Maryland', 'Memphis', 'Missouri', 'Kansas', 'UConn', 'Oklahoma', 'Arkansas', 'Colorado State', 'Grand Canyon', 'UNC Wilmington', 'Lipscomb', 'Omaha', 'Norfolk State'],
  South: ['Auburn', 'Michigan', 'Iowa State', 'Texas A&M', 'Clemson', 'Ole Miss', 'Marquette', 'Louisville', 'Creighton', 'New Mexico', 'North Carolina / San Diego State', 'UC San Diego', 'Yale', 'Bryant', 'Robert Morris', 'Alabama State / Saint Francis'],
  Midwest: ['Houston', 'Alabama', 'Wisconsin', 'Purdue', 'Oregon', 'Illinois', 'UCLA', 'Gonzaga', 'Georgia', 'Utah State', 'VCU', 'Liberty', 'Akron', 'Montana', 'Wichita State', 'SIU Edwardsville'],
};

/**
 * The bracket challenge, next March's, open now with a made-up field so the
 * page can be tried: it locks three days from now. Eight players have
 * brackets (mostly favorites, some upsets); the demo player is part way
 * through theirs.
 */
function seedBracket(store, at) {
  const year = +etDay(at).slice(0, 4) + 1;
  const regions = Object.keys(FIELD);
  let c = ensureChallenge(store, year, at, { source: 'demo', regions });
  const slots = regions.flatMap((region, r) => FIELD[region].map((team, i) => {
    const [name, name2] = team.split(' / ');
    return { region: r, seed: i + 1, name, name2: name2 ?? null };
  }));
  if (saveField(store, c, slots, at).error) return;
  const lock = new Date(Math.ceil((at.getTime() + 3 * DAY) / HOUR) * HOUR);
  openChallenge(store, c, { regions, locksAt: lock, userId: userId(store, 'SharpShooter'), now: at });
  c = { ...c, opened_at: at.toISOString(), locks_at: lock.toISOString() };
  const rand = prng(2027);
  const fill = (name, upsetRate, games = GAMES, tiebreak = null) => {
    const updates = {};
    for (let g = 0; g < games; g++) {
      const [a, b] = participants(g, updates);
      const seed = (k) => Number(k.split('-')[1]);
      const [fav, dog] = seed(a) <= seed(b) ? [a, b] : [b, a];
      updates[g] = rand() < upsetRate ? dog : fav;
    }
    savePicks(store, c, { userId: userId(store, name), updates, tiebreak, now: new Date(at.getTime() - Math.floor(rand() * 36) * HOUR) });
  };
  for (const [name, rate, tb] of [['ChalkEater', 0.05, 141], ['DogLover', 0.4, 152], ['BackdoorCover', 0.2, 139], ['OverOverOver', 0.25, 160],
    ['FadeMe', 0.35, 128], ['BlitzKing', 0.15, 145], ['CoverQueen', 0.2, 137]]) fill(name, rate, GAMES, tb);
  // The demo player: the Round of 64 and most of the Round of 32 done.
  fill('SharpShooter', 0.2, 44);
}

/**
 * Prize tournaments: one draft (an admin still has to record the lawyer's
 * review and publish it) and a published copy, both starting tomorrow
 * evening, the published one with a few players in.
 */
function seedPrizes(store, ids, at) {
  const day = addDays(etDay(at), 1);
  const dash = `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}`;
  const admin = ids.SharpShooter;
  const prize = {
    prize: 'A bag of Buddha Beans coffee', value: '24', sponsor: 'Buddha Beans Coffee Co.', eligibility: '',
    delivery: 'Shipped by the Sponsor to the winner\'s US address within 30 days of the close.',
  };
  const make = (name) => {
    const made = createCustom(store, { name, sports: ['nba', 'ncaab'], startDate: dash, startTime: '18:00', endDate: dash, endTime: '23:59', minBets: '2', prize: '', userId: admin, now: at });
    const t = store.get('SELECT * FROM tournaments WHERE slug = ?', made.slug);
    savePrize(store, t, prize, { userId: admin, now: at });
    return t;
  };
  make('Buddha Beans Hoops Draft');
  const live = make('Buddha Beans Hoops Night');
  setReviewed(store, live, { reviewed: true, userId: admin, now: at });
  publishPrize(store, live, { userId: admin, now: at });
  for (const name of ['DogLover', 'ChalkEater', 'FadeMe']) {
    joinTournament(store, live, ids[name], at, { rulesAccepted: true });
  }
}
