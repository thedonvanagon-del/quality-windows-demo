// Demo mode: a made-up ESPN with three weeks of finals and a week of games
// ahead, plus six players with records and two groups. Every game is built in
// ESPN's own JSON and read through the real parser, so the demo exercises the
// same code as production. Log in as demo@example.com / letmein123.

import zlib from 'node:zlib';

import { hashPassword } from './auth.js';
import { checkAllBadges } from './badges.js';
import { closeWeek } from './contest.js';
import { parseScoreboard, parseSummary } from './espn.js';
import { postMessage } from './chat.js';
import { createGroup, joinGroup, setHomeCity, startRoom } from './groups.js';
import { inviteCodeOf } from './invites.js';
import { createOfficialImporter, ensureOfficial } from './official.js';
import { cleanImage, mediaDir, savePhoto } from './photos.js';
import { grade, gradeFinished, MARKETS, maxUnits, parlayMaxUnits, parlayPrice, price } from './picks.js';
import { SPORTS } from './sports.js';
import { teamAccent, teamsBySport } from './themes.js';
import { addDays, etDay, etToUtc, HOUR, mondayOf, weekday } from './time.js';
import { AUTO, closeTournament, createCustom, ensureAutoTournaments, joinTournament } from './tournaments.js';

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
  checkAllBadges(store, at);
  if (dir) seedLooks(store, ids, dir);
}

/**
 * A few players get photos (made here: a figure on a colored square) and
 * team looks: one on a team too dark for the page, one on a light team with
 * the light background, so both sides of the readability guard show.
 */
function seedLooks(store, ids, dir) {
  const faces = { BackdoorCover: ['#1d4ed8', '#fde68a'], ChalkEater: ['#b91c1c', '#fecaca'], DogLover: ['#047857', '#a7f3d0'], FadeMe: ['#6d28d9', '#ddd6fe'] };
  mediaDir(dir);
  for (const [name, [bg, fg]] of Object.entries(faces)) {
    const image = cleanImage(demoFace(bg, fg));
    if (!image.error) savePhoto(store, dir, ids[name], image);
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

/** A 96×96 PNG: a head and shoulders in `fg` on a `bg` square. */
function demoFace(bg, fg) {
  const size = 96;
  const [b, f] = [bg, fg].map((hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)));
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3);
    for (let x = 0; x < size; x++) {
      const head = (x - 48) ** 2 + (y - 38) ** 2 < 17 ** 2;
      const body = (x - 48) ** 2 / 34 ** 2 + (y - 96) ** 2 / 34 ** 2 < 1;
      (head || body ? f : b).forEach((c, i) => (row[1 + x * 3 + i] = c));
    }
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
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
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
 * custom one that's live with entrants (the demo player not in it yet, so
 * Join can be tried), and last week's auto ones finished and closed.
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
  enter(store.get('SELECT * FROM tournaments WHERE slug = ?', cup.slug), others, etToUtc(addDays(today, -4), 12).toISOString());

  // Coming up: most players are in early; the demo player is in NFL Sunday.
  for (const t of store.all("SELECT * FROM tournaments WHERE kind = 'auto' AND starts_at > ?", at.toISOString())) {
    enter(t, others.slice(0, 2 + (t.id % 3)), at.toISOString());
    if (t.slug.startsWith('nfl-sunday')) joinTournament(store, t, admin, at);
  }
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
