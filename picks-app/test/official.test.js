import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { loadConfig, OFFICIAL_PICKS_URL } from '../src/config.js';
import { createOfficialImporter, eligibleRows, ensureOfficial, OFFICIAL_NAME } from '../src/official.js';
import { leaderboard, rankOf } from '../src/stats.js';
import { clock, event, quiet, setFinal, startApp, visible } from './helpers.js';

// Thursday Nov 5, 10am Eastern. Kings at Grizzlies tips at 7pm.
const MORNING = '2026-11-05T15:00:00.000Z';
const TIP = '2026-11-06T00:00:00.000Z';

let time;
let app;
let grizzlies;
let early;
let college;
let feed;

const row = (fields) => ({
  date: '2026-11-05', sport: 'NBA', away: 'SAC', home: 'MEM', odds: '-110', conf: 4, is_lock: false, unit: 1, result: null, ...fields,
});

function importer({ fetch } = {}) {
  return createOfficialImporter({
    store: app.store, games: app.games, url: 'https://picks.example.test/picks_log.jsonl', now: time.now, log: quiet,
    fetch: fetch ?? (async (url) => {
      feed.calls.push(url);
      return new Response(feed.lines.join('\n'));
    }),
  });
}

const officialPicks = () => app.store.all(
  `SELECT p.*, o.source_id, o.is_lock, o.conf FROM official_picks o JOIN picks p ON p.id = o.pick_id ORDER BY p.id`,
);

beforeEach(async () => {
  time = clock(MORNING);
  app = await startApp({ time });
  grizzlies = event({ id: '401909899', start: TIP, home: ['Grizzlies', 'MEM'], away: ['Kings', 'SAC'], spread: -3.5, total: 228.5, ml: { home: -170, away: 150 } });
  // Tipped at 9am, an hour ago.
  early = event({ id: '401909800', start: '2026-11-05T14:00:00.000Z', home: ['Knicks', 'NY'], away: ['Heat', 'MIA'] });
  // A college game with no moneyline posted.
  college = event({ id: '401800001', start: TIP, home: ['Duke', 'DUKE'], away: ['UConn', 'CONN'], spread: -6.5, total: 145.5 });
  delete college.competitions[0].odds[0].moneyline;
  app.espn.events.nba.push(grizzlies, early);
  app.espn.events.ncaab.push(college);
  feed = {
    calls: [],
    lines: [
      JSON.stringify(row({ id: 'n1-rl', event_id: '401909899', type: 'RL', pick: 'MEM', conf: 5, is_lock: true, unit: 3.3 })),
      // +150 on a 5u play: capped at what wins 5u.
      JSON.stringify(row({ id: 'n1-ml', event_id: '401909899', type: 'ML', pick: 'SAC', unit: 5 })),
      // Totals don't say over or under.
      JSON.stringify(row({ id: 'n1-ou', event_id: '401909899', type: 'OU', pick: 'MEM' })),
      JSON.stringify(row({ id: 'n2-ml', event_id: '401909800', type: 'ML', pick: 'NY', away: 'MIA', home: 'NY' })),
      JSON.stringify(row({ id: 'c1-ml', sport: 'CBB', event_id: '401800001', type: 'ML', pick: 'DUKE', away: 'CONN', home: 'DUKE', line: null, start: TIP })),
      JSON.stringify(row({ id: 'c1-rl', sport: 'CBB', event_id: '401800001', type: 'RL', pick: 'CONN', away: 'CONN', home: 'DUKE', line: 6.5, start: TIP, unit: 1.5 })),
      // Not sure enough, no stake, yesterday's, a game that doesn't exist, the same market twice.
      JSON.stringify(row({ id: 'n3-ml', event_id: '401909899', type: 'ML', pick: 'MEM', conf: 2 })),
      JSON.stringify(row({ id: 'n4-ml', event_id: '401909899', type: 'ML', pick: 'MEM', odds: '—', unit: 0 })),
      JSON.stringify(row({ id: 'n5-ml', date: '2026-11-04', event_id: '401909899', type: 'ML', pick: 'MEM' })),
      JSON.stringify(row({ id: 'n6-ml', event_id: '999', type: 'ML', pick: 'MEM' })),
      JSON.stringify(row({ id: 'n7-rl', event_id: '401909899', type: 'RL', pick: 'SAC' })),
      'not json {',
      '',
      '[1, 2, 3]',
      'null',
    ],
  };
});

afterEach(() => app.close());

describe('official picks', () => {
  test('import moneylines and spreads at the app line, and skip the rest', async () => {
    const result = await importer().run();
    assert.deepEqual(feed.calls, ['https://picks.example.test/picks_log.jsonl']);
    assert.equal(result.imported, 3);
    const reasons = Object.fromEntries(result.skipped.map((s) => [s.id, s.reason]));
    assert.equal(reasons['2026-11-05:n2-ml'], 'started');
    assert.equal(reasons['2026-11-05:c1-ml'], 'no price');
    assert.equal(reasons['2026-11-05:n6-ml'], 'no such game');
    assert.match(reasons['2026-11-05:n7-rl'], /already have a spread pick/, 'one pick per market');

    const official = app.store.get('SELECT * FROM users WHERE official = 1');
    assert.equal(official.screen_name, OFFICIAL_NAME);
    assert.ok(official.email_verified_at);
    assert.equal(app.store.get("SELECT COUNT(*) AS n FROM users WHERE screen_name = 'BookieBullies'").n, 1);

    const [rl, ml, cbb] = officialPicks();
    assert.deepEqual(
      { game: rl.game_id, market: rl.market, side: rl.side, line: rl.line, odds: rl.odds, units: rl.units, lock: rl.is_lock, conf: rl.conf, source: rl.source_id },
      { game: 'nba:401909899', market: 'spread', side: 'home', line: -3.5, odds: -110, units: 3.3, lock: 1, conf: 5, source: '2026-11-05:n1-rl' },
    );
    assert.deepEqual({ market: ml.market, side: ml.side, odds: ml.odds, units: ml.units, lock: ml.is_lock }, { market: 'ml', side: 'away', odds: 150, units: 3.33, lock: 0 });
    assert.deepEqual({ game: cbb.game_id, market: cbb.market, side: cbb.side, line: cbb.line, units: cbb.units }, { game: 'ncaab:401800001', market: 'spread', side: 'away', line: 6.5, units: 1.5 });
    assert.ok(officialPicks().every((p) => p.user_id === official.id && p.made_at === MORNING));
  });

  test('never import a row twice', async () => {
    await importer().run();
    const again = await importer().run();
    assert.equal(again.imported, 0);
    assert.equal(officialPicks().length, 3);
    assert.equal(app.store.get('SELECT COUNT(*) AS n FROM picks').n, 3);
    assert.equal(app.store.get('SELECT COUNT(*) AS n FROM users WHERE official = 1').n, 1, 'one official account');
  });

  test('take the line as it is now, not the one the site posted', async () => {
    grizzlies.competitions[0].odds[0].pointSpread.home.close.line = '-4.5';
    grizzlies.competitions[0].odds[0].spread = -4.5;
    await importer().run();
    assert.equal(officialPicks()[0].line, -4.5);
  });

  test('pick up a game once its price is posted', async () => {
    await importer().run();
    college.competitions[0].odds[0].moneyline = { home: { close: { odds: '-250' } }, away: { close: { odds: '+200' } } };
    time.advance(15 * 60_000);
    const later = await importer().run();
    assert.equal(later.imported, 1);
    assert.equal(officialPicks().at(-1).source_id, '2026-11-05:c1-ml');
  });

  test('ride out a feed that is down or broken', async () => {
    const down = await importer({ fetch: async () => { throw new Error('timed out'); } }).run();
    assert.equal(down.imported, 0);
    assert.match(down.error, /timed out/);
    const bad = await importer({ fetch: async () => new Response('nope', { status: 500 }) }).run();
    assert.match(bad.error, /500/);
    const junk = await importer({ fetch: async () => new Response('{"date":\n<html>') }).run();
    assert.equal(junk.imported, 0);
    assert.equal(app.store.get('SELECT COUNT(*) AS n FROM picks').n, 0);
  });

  test('only today and tomorrow, Eastern', () => {
    // 11:30pm Eastern on Nov 5 is already Nov 6 in UTC.
    const late = new Date('2026-11-06T04:30:00.000Z');
    const text = ['2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07']
      .map((date) => JSON.stringify(row({ id: date, date, event_id: '1', type: 'ML', pick: 'MEM' })))
      .join('\n');
    assert.deepEqual(eligibleRows(text, late).map((r) => r.row.date), ['2026-11-05', '2026-11-06']);
  });

  test('show the Official tag and LOCK tags, and never rank the official account', async () => {
    await importer().run();
    const officialId = app.store.get('SELECT id FROM users WHERE official = 1').id;
    const ann = app.browser();
    await ann.join('ann@example.com', 'Ann');
    const annId = app.store.get("SELECT id FROM users WHERE screen_name = 'Ann'").id;
    // Ann has five graded picks, up a little. The official account will have five too, up a lot.
    const games = ['nba:401909899', 'nba:401909800', 'ncaab:401800001'];
    let n = 0;
    for (const gameId of games) {
      for (const market of ['total', 'ml']) {
        if (n++ >= 5) break;
        app.store.run(
          `INSERT INTO picks (user_id, game_id, sport, market, side, line, odds, units, game_start, made_at, result, profit, graded_at)
           VALUES (?, ?, ?, ?, 'home', 1, -110, 1, ?, ?, 'win', 0.1, ?)`,
          annId, gameId, gameId.split(':')[0], market, '2026-11-01T00:00:00.000Z', MORNING, MORNING,
        );
      }
    }
    for (const market of ['spread', 'total', 'ml']) {
      app.store.run(
        `INSERT INTO picks (user_id, game_id, sport, market, side, line, odds, units, game_start, made_at, result, profit, graded_at)
         VALUES (?, 'nba:401909800', 'nba', ?, 'home', 1, 100, 1, ?, ?, 'win', 1, ?)`,
        officialId, market, '2026-11-01T00:00:00.000Z', MORNING, MORNING,
      );
    }
    // Picks stay hidden until tip, then the Grizzlies cover.
    const before = visible((await app.browser().get('/u/BookieBullies')).text);
    assert.match(before, /3 open picks, shown once the game starts/);
    setFinal(grizzlies, 110, 100);
    time.set('2026-11-06T03:00:00.000Z');
    await app.games.checkFinals();

    const board = (await app.browser().get('/leaderboard')).text;
    assert.match(board, /<a class="who" href="\/u\/BookieBullies">BookieBullies<\/a><span class="official-tag"[^>]*>Official<\/span>/);
    const rows = [...board.matchAll(/<td class="rank">(.*?)<\/td>\s*<td><span class="player">.*?href="\/u\/(\w+)"/gs)].map((m) => [m[2], visible(m[1]).trim()]);
    assert.deepEqual(rows, [['BookieBullies', '–'], ['Ann', '1']], 'listed first by units, but Ann is #1');
    assert.equal(rankOf(app.store, officialId, time.now()), null);
    assert.equal(rankOf(app.store, annId, time.now()), 1);
    assert.equal(leaderboard(app.store, {}, time.now()).find((r) => r.official).rank, null);

    const profile = (await app.browser().get('/u/BookieBullies')).text;
    assert.match(profile, /<h1>BookieBullies<\/h1><span class="official-tag"/);
    assert.match(visible(profile), /Official account: not ranked/);
    assert.match(profile, /<span class="lock-tag"[^>]*>Lock<\/span>Grizzlies -3\.5/, 'a gold LOCK on the site\'s lock');
    assert.doesNotMatch(profile, /<span class="lock-tag"[^>]*>Lock<\/span>Kings ML/, 'and only there');
    assert.match(visible((await app.browser().get('/u/Ann')).text), /#1 overall/);

    // In a follower's feed too.
    await ann.get('/u/BookieBullies');
    await ann.post('/u/BookieBullies/follow');
    const following = (await ann.get('/following')).text;
    assert.match(following, /href="\/u\/BookieBullies">BookieBullies<\/a><span class="official-tag"/);
    assert.match(following, /class="lock-tag"/);
  });

  test('the official account has no way in', async () => {
    const id = ensureOfficial(app.store, time.now());
    assert.equal(ensureOfficial(app.store, time.now()), id);
    const b = app.browser();
    for (const email of ['official-account', '']) {
      assert.equal((await b.post('/login', { email, password: '!' })).status, 400);
    }
    assert.equal((await b.post('/forgot', { email: 'official-account' })).status, 400);
    assert.equal(app.outbox.length, 0);
  });
});

describe('settings', () => {
  test('read admins and the picks log address from the environment', () => {
    assert.deepEqual(loadConfig({ ADMIN_EMAILS: ' Boss@Example.com, ops@example.com ,,' }).adminEmails, ['boss@example.com', 'ops@example.com']);
    assert.deepEqual(loadConfig({}).adminEmails, []);
    assert.equal(loadConfig({}).officialPicksUrl, OFFICIAL_PICKS_URL);
    assert.equal(loadConfig({ OFFICIAL_PICKS_URL: 'https://example.test/log.jsonl' }).officialPicksUrl, 'https://example.test/log.jsonl');
    assert.equal(loadConfig({ OFFICIAL_PICKS_URL: 'off' }).officialPicksUrl, null);
  });
});
