import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { createApp } from '../src/app.js';
import { badgesAfterGrading } from '../src/badges.js';
import { openStore } from '../src/db.js';
import { parseScoreboard, parseSummary } from '../src/espn.js';
import { createGames } from '../src/games.js';
import { createNotifier } from '../src/notify.js';
import { createPush } from '../src/push.js';
import { SPORTS } from '../src/sports.js';
import { createSummaries } from '../src/summaries.js';
import { etDay } from '../src/time.js';

export const quiet = { warn() {}, error() {}, log() {} };

export function clock(iso) {
  let t = new Date(iso).getTime();
  return {
    now: () => new Date(t),
    set: (at) => (t = new Date(at).getTime()),
    advance: (ms) => (t += ms),
  };
}

/** A stand-in for ESPN that serves whatever events a test puts in it. */
export function fakeEspn() {
  return {
    events: Object.fromEntries(SPORTS.map((s) => [s.key, []])),
    down: false,
    calls: 0,
    async scoreboard(sport, from, to = from) {
      this.calls += 1;
      if (this.down) throw new Error('ESPN is down');
      const events = this.events[sport.key].filter((e) => etDay(e.date) >= from && etDay(e.date) <= to);
      return parseScoreboard(sport, { events: structuredClone(events) });
    },
    // Game summaries (injuries, last five) by ESPN event id, in ESPN's own JSON.
    // `summaryGate`, when set, is a promise every summary call waits on first.
    summaries: {},
    summaryCalls: 0,
    summaryDown: false,
    summaryGate: null,
    async summary(sport, eventId) {
      this.summaryCalls += 1;
      if (this.summaryGate) await this.summaryGate;
      if (this.summaryDown) throw new Error('ESPN summary is down');
      return parseSummary(structuredClone(this.summaries[eventId] ?? {}));
    },
  };
}

/** An ESPN scoreboard event in the nested DraftKings shape. `spread` is the home team's number. */
export function event({ id, start, home = ['Chiefs', 'KC'], away = ['Bills', 'BUF'], spread = -3.5, total = 47.5, ml = { home: -170, away: 150 } }) {
  const team = ([short, abbr]) => ({ abbreviation: abbr, displayName: short, shortDisplayName: short });
  const signed = (n) => (n > 0 ? `+${n}` : `${n}`);
  return {
    id,
    date: start,
    competitions: [{
      competitors: [
        { homeAway: 'home', score: '0', team: team(home) },
        { homeAway: 'away', score: '0', team: team(away) },
      ],
      status: { type: { state: 'pre', completed: false, name: 'STATUS_SCHEDULED', shortDetail: '' } },
      odds: [{
        provider: { displayName: 'DraftKings' },
        details: `${spread < 0 ? home[1] : away[1]} -${Math.abs(spread)}`,
        spread,
        overUnder: total,
        moneyline: { home: { close: { odds: signed(ml.home) } }, away: { close: { odds: signed(ml.away) } } },
        pointSpread: {
          home: { close: { line: signed(spread), odds: '-110' } },
          away: { close: { line: signed(-spread), odds: '-110' } },
        },
        total: { over: { close: { line: `o${total}`, odds: '-110' } }, under: { close: { line: `u${total}`, odds: '-110' } } },
      }],
    }],
  };
}

export function setLine(e, { spread, total }) {
  const odds = e.competitions[0].odds[0];
  const signed = (n) => (n > 0 ? `+${n}` : `${n}`);
  if (spread != null) {
    odds.spread = spread;
    odds.details = '';
    odds.pointSpread.home.close.line = signed(spread);
    odds.pointSpread.away.close.line = signed(-spread);
  }
  if (total != null) {
    odds.overUnder = total;
    odds.total.over.close.line = `o${total}`;
    odds.total.under.close.line = `u${total}`;
  }
}

export function setLive(e) {
  e.competitions[0].status.type = { state: 'in', completed: false, name: 'STATUS_IN_PROGRESS', shortDetail: '2nd Qtr' };
  e.competitions[0].odds = [];
}

export function setFinal(e, homeScore, awayScore) {
  const comp = e.competitions[0];
  comp.competitors[0].score = String(homeScore);
  comp.competitors[1].score = String(awayScore);
  comp.status.type = { state: 'post', completed: true, name: 'STATUS_FINAL', shortDetail: 'Final' };
  comp.odds = [];
}

export function setStatus(e, state, name) {
  e.competitions[0].status.type = { state, completed: false, name, shortDetail: name };
}

export async function startApp({ time, espn = fakeEspn(), config = {} }) {
  const store = openStore(':memory:');
  // Pushes go to a fake push service that only records them.
  const pushed = [];
  const push = createPush({ store, subject: 'mailto:test@example.test', log: quiet, fetch: async (url, init) => (pushed.push({ url, init }), new Response(null, { status: 201 })) });
  const notifier = createNotifier({ store, push, log: quiet });
  const games = createGames({
    store, espn, now: time.now, log: quiet,
    onGraded: (ids, parlayIds) => {
      notifier.settled(ids, time.now(), parlayIds);
      badgesAfterGrading(store, { pickIds: ids, parlayIds, now: time.now(), notifier });
    },
  });
  // Collects mail instead of sending it.
  const outbox = [];
  const mailer = { configured: true, send: async (message) => void outbox.push(message) };
  const logged = [];
  const summaries = createSummaries({ espn, now: time.now, log: { ...quiet, warn: (text) => logged.push(text) } });
  // Profile photos go in a folder of their own per test, cleared at the end.
  const media = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-media-'));
  const handler = createApp({
    store, games, mailer, notifier, push, summaries, now: time.now, log: quiet,
    config: { appName: 'Bookie Bullies', trustProxy: false, appUrl: 'https://app.example.test', mediaDir: media, ...config },
  });
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    base,
    store,
    games,
    espn,
    notifier,
    outbox,
    pushed,
    summaries,
    logged,
    media,
    browser: () => new Browser(base, outbox),
    async close() {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      store.close();
      fs.rmSync(media, { recursive: true, force: true });
    },
  };
}

/** Enough of a browser for these tests: a cookie jar and the page's form token. */
export class Browser {
  constructor(base, outbox = []) {
    this.base = base;
    this.outbox = outbox;
    this.jar = new Map();
    this.csrf = null;
  }

  async request(path, init = {}) {
    const res = await fetch(this.base + path, {
      redirect: 'manual',
      ...init,
      headers: { cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join('; '), ...init.headers },
    });
    for (const line of res.headers.getSetCookie()) {
      const [pair, ...attrs] = line.split(';');
      const i = pair.indexOf('=');
      const name = pair.slice(0, i).trim();
      const gone = attrs.some((a) => /^\s*max-age=0\s*$/i.test(a));
      if (gone) this.jar.delete(name);
      else this.jar.set(name, pair.slice(i + 1));
    }
    const text = await res.text();
    const token = /name="_csrf" value="([^"]+)"/.exec(text);
    if (token) this.csrf = token[1];
    return { status: res.status, location: res.headers.get('location'), text };
  }

  get(path) {
    return this.request(path);
  }

  post(path, form = {}, { origin = this.base, csrf = true, headers = {} } = {}) {
    const body = new URLSearchParams({ ...(csrf && this.csrf ? { _csrf: this.csrf } : {}), ...form });
    return this.request(path, {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/x-www-form-urlencoded', ...(origin ? { origin } : {}), ...headers },
    });
  }

  /** Send a file the way a browser's file input does (multipart), with the form token. */
  upload(path, { name = 'photo.jpg', type = 'image/jpeg', data }, fields = {}, { origin = this.base, csrf = true } = {}) {
    const form = new FormData();
    if (csrf && this.csrf) form.append('_csrf', this.csrf);
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    form.append('photo', new Blob([data], { type }), name);
    return this.request(path, { method: 'POST', body: form, headers: origin ? { origin } : {} });
  }

  /** Sign up, pick a screen name, confirm the email, and end up on the games page. */
  async join(email, name, password = 'correct horse', { confirm = true } = {}) {
    const signup = await this.post('/signup', { email, password, adult: 'on', terms: 'on' });
    if (signup.status !== 303) throw new Error(`signup answered ${signup.status}: ${signup.text.slice(0, 300)}`);
    await this.get(signup.location);
    const welcome = await this.post('/welcome', { screen_name: name });
    if (welcome.status !== 303) throw new Error(`welcome answered ${welcome.status}`);
    if (confirm) await this.get(this.verifyLink(email));
    return welcome;
  }

  /** The path of the newest confirm-email link sent to this address. */
  verifyLink(email) {
    const mail = [...this.outbox].reverse().find((m) => m.to === email.toLowerCase() && /\/verify\?token=/.test(m.text));
    if (!mail) throw new Error(`no confirm email for ${email}`);
    return /\/verify\?token=[\w-]+/.exec(mail.text)[0];
  }
}

/** Text with tags stripped and whitespace squeezed, for matching what a reader sees. */
export function visible(htmlText) {
  return htmlText.replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');
}

let made = 0;

/** A finished game straight into the games table, for records made by hand. */
export function addGame(store, { start, sport = 'nfl', state = 'post', id = `${sport}:x${++made}` }) {
  store.run(
    `INSERT INTO games (id, sport, start_time, state, status, detail, completed, home_name, home_short, home_abbr, home_score,
                        away_name, away_short, away_abbr, away_score, lines, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'Chiefs', 'Chiefs', 'KC', ?, 'Bills', 'Bills', 'BUF', ?, '{}', ?)`,
    id, sport, start, state, state === 'post' ? 'STATUS_FINAL' : 'STATUS_SCHEDULED', state === 'post' ? 'Final' : '',
    state === 'post' ? 1 : 0, state === 'post' ? 24 : null, state === 'post' ? 20 : null, start,
  );
  return id;
}

/**
 * A straight bet straight into the record, on a game of its own. `result`
 * null leaves it open. A win at -110 pays 0.91u a unit unless `profit` says.
 */
export function addBet(store, { userId, start, result = 'win', units = 1, odds = -110, profit, sport = 'nfl', streak = false }) {
  const gameId = addGame(store, { start, sport, state: result ? 'post' : 'pre' });
  const paid = profit ?? (result === 'win' ? Math.round((units * 100) / -odds * 100) / 100 : result === 'loss' ? -units : result ? 0 : null);
  return Number(store.run(
    `INSERT INTO picks (user_id, game_id, sport, market, side, line, odds, units, game_start, made_at, result, profit, graded_at, streak_day)
     VALUES (?, ?, ?, 'ml', 'home', NULL, ?, ?, ?, ?, ?, ?, ?, ?)`,
    userId, gameId, sport, odds, units, start, start, result, paid, result ? start : null, streak ? etDay(start) : null,
  ).lastInsertRowid);
}

/** A parlay straight into the record, with `legs` legs on games of their own. */
export function addParlay(store, { userId, start, legs = 2, result = 'win', units = 0.5, odds = 264, profit }) {
  const id = Number(store.run(
    'INSERT INTO parlays (user_id, sport, units, odds, made_at, first_start, result, profit, graded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    userId, 'nfl', units, odds, start, start, result, profit ?? (result === 'win' ? Math.round(units * odds) / 100 : result === 'loss' ? -units : 0), result ? start : null,
  ).lastInsertRowid);
  for (let i = 0; i < legs; i++) {
    store.run(
      "INSERT INTO parlay_legs (parlay_id, game_id, sport, market, side, line, odds, result) VALUES (?, ?, 'nfl', 'ml', 'home', NULL, -110, ?)",
      id, addGame(store, { start }), result === 'loss' && i === 0 ? 'loss' : result ? 'win' : null,
    );
  }
  return id;
}

/** A confirmed player with a screen name, straight into the database. */
export function addPlayer(store, name, { official = false, favSports = null } = {}) {
  const at = '2026-10-01T00:00:00.000Z';
  return Number(store.run(
    `INSERT INTO users (email, password_hash, screen_name, created_at, email_verified_at, official, setup_done, fav_sports)
     VALUES (?, '!', ?, ?, ?, ?, 1, ?)`,
    `${name.toLowerCase()}@example.com`, name, at, at, official ? 1 : 0, favSports,
  ).lastInsertRowid);
}
