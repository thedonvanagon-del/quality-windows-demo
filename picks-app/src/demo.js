// Demo mode: a made-up ESPN with three weeks of finals and a week of games
// ahead, plus six players with records and two groups. Every game is built in
// ESPN's own JSON and read through the real parser, so the demo exercises the
// same code as production. Log in as demo@example.com / letmein123.

import { hashPassword } from './auth.js';
import { parseScoreboard } from './espn.js';
import { createGroup, joinGroup } from './groups.js';
import { grade, gradeFinished, MARKETS, price } from './picks.js';
import { SPORTS } from './sports.js';
import { addDays, etDay, etToUtc, HOUR } from './time.js';

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
  };
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
    },
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
export async function seedDemo({ store, games, espn, now = () => new Date() }) {
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
  const ids = {};
  for (const [name] of PLAYERS) {
    const email = name === 'SharpShooter' ? DEMO_LOGIN.email : `${name.toLowerCase()}@example.com`;
    const hash = await hashPassword(name === 'SharpShooter' ? DEMO_LOGIN.password : `${name}-demo`);
    const created = new Date(at.getTime() - (PAST_DAYS + 3) * 86_400_000).toISOString();
    ids[name] = Number(store.run('INSERT INTO users (email, password_hash, screen_name, created_at, bio) VALUES (?, ?, ?, ?, ?)', email, hash, name, created, BIOS[name] ?? null).lastInsertRowid);
  }

  const all = store.all('SELECT * FROM games').map((row) => ({
    id: row.id, sport: row.sport, start: row.start_time, state: row.state,
    homeScore: row.home_score, awayScore: row.away_score,
    lines: JSON.parse(row.lines), home: { short: row.home_short }, away: { short: row.away_short },
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
        const chosen = price(g, market, side);
        const start = new Date(g.start).getTime();
        const madeAt = open ? at.getTime() - rand() * 6 * HOUR : start - (1 + rand() * 30) * HOUR;
        if (open && madeAt >= start) continue;
        const units = [1, 1, 1, 2, 0.5, 3][Math.floor(rand() * 6)];
        store.run(
          `INSERT OR IGNORE INTO picks (user_id, game_id, sport, market, side, line, odds, units, wager, game_start, made_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ids[name], g.id, g.sport, market, side, chosen.line, chosen.odds, units, units * 100, g.start, new Date(madeAt).toISOString(),
        );
      }
    }
  });
  gradeFinished(store, at);

  const crew = createGroup(store, { ownerId: ids.SharpShooter, name: 'Saturday Crew', sport: 'ncaaf', now: at });
  for (const n of ['BackdoorCover', 'ChalkEater', 'FadeMe']) joinGroup(store, { groupId: crew.id, userId: ids[n], now: at });
  const office = createGroup(store, { ownerId: ids.FadeMe, name: 'Office League', sport: '', now: at });
  for (const n of ['SharpShooter', 'DogLover', 'OverOverOver']) joinGroup(store, { groupId: office.id, userId: ids[n], now: at });
}

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
