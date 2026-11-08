import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { loadConfig, SITE_URL } from '../src/config.js';
import { ensureOfficial } from '../src/official.js';
import { makePick } from '../src/picks.js';
import { siteHost, siteLink } from '../src/site.js';
import { clock, event, startApp, visible } from './helpers.js';

// Thursday Nov 5, 10am Eastern. Two games tip tonight, one tomorrow night.
const MORNING = '2026-11-05T15:00:00.000Z';
const TONIGHT = '2026-11-06T00:00:00.000Z';
const TOMORROW = '2026-11-07T00:30:00.000Z';

let time;
let app;

beforeEach(async () => {
  time = clock(MORNING);
  app = await startApp({ time });
  app.espn.events.nba.push(
    event({ id: '1', start: TONIGHT, home: ['Lakers', 'LAL'], away: ['Kings', 'SAC'], spread: -4.5, total: 228.5, ml: { home: -190, away: 160 } }),
    event({ id: '2', start: TONIGHT, home: ['Grizzlies', 'MEM'], away: ['Heat', 'MIA'], spread: -2.5, total: 223 }),
    event({ id: '3', start: TOMORROW, home: ['Knicks', 'NY'], away: ['Celtics', 'BOS'], spread: 1.5, total: 219.5 }),
  );
  app.espn.events.ncaab.push(event({ id: '9', start: TONIGHT, home: ['Duke', 'DUKE'], away: ['UConn', 'CONN'], spread: -6.5, total: 145.5 }));
});

afterEach(() => app.close());

/** An official pick, made the normal way, with the site's lock flag and confidence. */
async function officialPick(gameId, market, side, { lock = false, conf = 4, units = 1 } = {}) {
  const userId = ensureOfficial(app.store, time.now());
  // The sport's board first, the way the importer does, so the game is known.
  await app.games.upcoming(gameId.split(':')[0]);
  const { game } = await app.games.current(gameId);
  const made = makePick(app.store, { userId, game, market, side, units, now: time.now() });
  assert.ok(!made.error, made.error);
  app.store.run(
    'INSERT INTO official_picks (source_id, pick_id, is_lock, conf, imported_at) VALUES (?, ?, ?, ?, ?)',
    `test:${gameId}:${market}`, made.id, lock ? 1 : 0, conf, time.now().toISOString(),
  );
  return made.id;
}

/** Tonight: a Lock on the Lakers spread and a pick on their moneyline, Duke's spread; tomorrow: the Knicks game Over. */
async function slate() {
  await officialPick('nba:1', 'spread', 'home', { lock: true, conf: 5 });
  await officialPick('nba:1', 'ml', 'home', { conf: 3 });
  await officialPick('ncaab:9', 'spread', 'away', { conf: 4 });
  await officialPick('nba:3', 'total', 'over', { conf: 4 });
}

async function player(name = 'Ann') {
  const b = app.browser();
  await b.join(`${name.toLowerCase()}@example.com`, name);
  return b;
}

/** One game's card on a board page. */
const card = (page, id) => page.match(new RegExp(`<article class="event gc" id="g-${id.replace(':', '-')}"[\\s\\S]*?</article>`))?.[0] ?? '';

/** Every link to the site on a page. */
const siteHrefs = (page) => [...page.matchAll(/href="(https:\/\/www\.bookiebullies\.com[^"]*)"/g)].map((m) => m[1].replaceAll('&amp;', '&'));

describe('BB Pick chips', () => {
  test('a chip on each game the official account picked: a gold Lock, else a Pick', async () => {
    await slate();
    const ann = await player();
    const board = await ann.get('/games?sport=nba');
    const lakers = card(board.text, 'nba:1');
    // The Lock comes first when the model has two picks on a game.
    assert.match(lakers, /<a class="bb-chip lock" href="\/games\/nba%3A1\/bb"[^>]*><span aria-hidden="true">🔒<\/span> BB Lock · Lakers −4\.5<\/a>/);
    assert.equal((lakers.match(/bb-chip/g) ?? []).length, 1, 'one chip per game');
    assert.match(card(board.text, 'nba:3'), /<a class="bb-chip" [^>]*>BB Pick · Over 219\.5<\/a>/);
    assert.doesNotMatch(card(board.text, 'nba:2'), /bb-chip/, 'no chip without an official pick');
    // College hoops has its own board.
    assert.match(card((await ann.get('/games?sport=ncaab')).text, 'ncaab:9'), /BB Pick · UConn \+6\.5/);
  });

  test('a graded pick shows no chip', async () => {
    const id = await officialPick('nba:2', 'spread', 'home');
    app.store.run("UPDATE picks SET result = 'win', profit = 0.91 WHERE id = ?", id);
    const ann = await player();
    assert.doesNotMatch((await ann.get('/games?sport=nba')).text, /bb-chip/);
  });

  test("the board loads every game's official picks in one query", async () => {
    await slate();
    await officialPick('nba:2', 'spread', 'away');
    const ann = await player();
    const all = app.store.all;
    const queries = [];
    app.store.all = (sql, ...params) => {
      if (/official_picks/.test(sql)) queries.push(sql);
      return all(sql, ...params);
    };
    try {
      const board = await ann.get('/games?sport=nba');
      assert.equal((board.text.match(/class="bb-chip/g) ?? []).length, 3);
    } finally {
      app.store.all = all;
    }
    assert.equal(queries.length, 1);
  });

  test('a chip opens the pick, line, odds and stars, and links to the site and the profile', async () => {
    await slate();
    const ann = await player();
    const res = await ann.get('/games/nba%3A1/bb');
    assert.equal(res.status, 200);
    const text = visible(res.text);
    assert.match(text, /Bookie Bullies model Kings @ Lakers/);
    assert.match(text, /Lock Lakers −4\.5 Spread · 1u · ★★★★★ −110/);
    assert.match(text, /Lakers ML Moneyline · 1u · ★★★ ★★ −190/);
    assert.match(res.text, /role="img" aria-label="Confidence 5 of 5"/);
    assert.match(text, /Locked at the app's line before the game/);
    assert.match(res.text, /<a class="btn block gold" href="https:\/\/www\.bookiebullies\.com\/\?utm_source=app&amp;utm_medium=bb_chip" target="_blank" rel="noopener">See all today's picks on bookiebullies\.com<\/a>/);
    assert.match(res.text, /<a class="bb-profile" href="\/u\/BookieBullies">BookieBullies's record in the app →<\/a>/);
    assert.equal((await ann.get('/games/nba%3A404/bb')).status, 404);
  });

  test('turning the setting off hides the chips and the Locks card', async () => {
    await slate();
    const ann = await player();
    const profile = await ann.get('/u/Ann');
    assert.match(profile.text, /<input type="checkbox" name="show" checked><span>Show Bookie Bullies picks on the board<\/span>/, 'on by default');

    const off = await ann.post('/bb/settings', {});
    assert.equal(off.status, 303);
    assert.equal(off.location, '/u/Ann#bb-picks');
    assert.equal(app.store.get("SELECT show_bb FROM users WHERE screen_name = 'Ann'").show_bb, 0);
    assert.match((await ann.get('/u/Ann')).text, /<input type="checkbox" name="show" ><span>Show Bookie Bullies picks/);
    const board = await ann.get('/games?sport=nba');
    assert.doesNotMatch(board.text, /bb-chip|bb-locks/);

    await ann.post('/bb/settings', { show: 'on' });
    assert.match((await ann.get('/games?sport=nba')).text, /bb-chip lock/);
    // Saved on the player.
    assert.equal(app.store.get("SELECT show_bb FROM users WHERE screen_name = 'Ann'").show_bb, 1);
  });

  test('the setting needs the form token', async () => {
    const ann = await player();
    assert.equal((await ann.post('/bb/settings', {}, { csrf: false })).status, 403);
    assert.equal(app.store.get("SELECT show_bb FROM users WHERE screen_name = 'Ann'").show_bb, 1);
  });
});

describe("Today's Locks card", () => {
  test("counts today's official picks (ET) in every sport, and the Locks among them", async () => {
    await slate();
    const ann = await player();
    const board = await ann.get('/games?sport=nba');
    const box = board.text.match(/<aside class="bb-locks"[\s\S]*?<\/aside>/)?.[0];
    assert.ok(box, 'shown');
    // Under the sport tabs, above the games.
    assert.ok(board.text.indexOf('<aside class="bb-locks"') > board.text.indexOf('aria-label="sport"'));
    assert.ok(board.text.indexOf('<aside class="bb-locks"') < board.text.indexOf('<article class="event gc"'));
    // Tonight: two NBA picks and one college pick. Tomorrow's doesn't count yet.
    assert.match(visible(box), /🔒 1 Bookie Bullies Lock today · 3 picks · See them Their record in the app/);
    assert.match(box, /href="https:\/\/www\.bookiebullies\.com\/\?utm_source=app&amp;utm_medium=locks_card" target="_blank" rel="noopener"/);
    assert.match(box, /<a class="bb-locks-profile" href="\/u\/BookieBullies">/);
    assert.match(box, /<form method="post" action="\/bb\/locks\/dismiss" data-bb-dismiss>\s*<input type="hidden" name="_csrf"/);
    // The same card on every sport's board.
    assert.match(visible((await ann.get('/games?sport=nfl')).text), /1 Bookie Bullies Lock today · 3 picks/);
  });

  test('no Locks today reads as picks; no picks, no card', async () => {
    const ann = await player();
    assert.doesNotMatch((await ann.get('/games?sport=nba')).text, /bb-locks/, 'nothing today');
    await officialPick('nba:3', 'total', 'over');
    assert.doesNotMatch((await ann.get('/games?sport=nba')).text, /bb-locks/, "tomorrow's picks don't count today");
    await officialPick('nba:2', 'ml', 'home');
    const box = (await ann.get('/games?sport=nba')).text.match(/<aside class="bb-locks"[\s\S]*?<\/aside>/)?.[0] ?? '';
    assert.match(visible(box), /^ 1 Bookie Bullies pick today · See them/);
    assert.doesNotMatch(box, /🔒/);
  });

  test('the × hides it until the next ET day, not the next UTC day', async () => {
    await slate();
    const ann = await player();
    await ann.get('/games?sport=nba');
    // 11pm Eastern, already Nov 6 in UTC.
    time.set('2026-11-06T04:00:00.000Z');
    const res = await ann.post('/bb/locks/dismiss', { next: '/games?sport=nba' });
    assert.equal(res.status, 303);
    assert.equal(res.location, '/games?sport=nba');
    assert.equal(app.store.get("SELECT bb_card_hidden_day FROM users WHERE screen_name = 'Ann'").bb_card_hidden_day, '20261105');
    assert.doesNotMatch((await ann.get('/games?sport=nba')).text, /bb-locks/);
    // Still Nov 5 in the East at 11:50pm.
    time.set('2026-11-06T04:50:00.000Z');
    const late = await ann.get('/games?sport=nba');
    assert.doesNotMatch(late.text, /bb-locks/);
    assert.match(late.text, /bb-chip/, 'the chips stay');
    // Just after midnight Eastern: a new day, and tomorrow's pick is today's.
    time.set('2026-11-06T05:10:00.000Z');
    assert.match(visible((await ann.get('/games?sport=nba')).text), /1 Bookie Bullies pick today · See them/);
  });

  test('the × needs the form token, and only hides it for that player', async () => {
    await slate();
    const ann = await player('Ann');
    const bob = await player('Bob');
    await ann.get('/games?sport=nba');
    assert.equal((await ann.post('/bb/locks/dismiss', {}, { csrf: false })).status, 403);
    assert.match((await ann.get('/games?sport=nba')).text, /bb-locks/);
    const res = await ann.post('/bb/locks/dismiss', { next: 'https://evil.example/' });
    assert.equal(res.location, '/games', 'never another site');
    assert.doesNotMatch((await ann.get('/games?sport=nba')).text, /bb-locks/);
    assert.match((await bob.get('/games?sport=nba')).text, /bb-locks/);
  });
});

describe('the site elsewhere in the app', () => {
  test('More starts with the site', async () => {
    const ann = await player();
    const more = await ann.get('/more');
    const first = more.text.match(/<ul class="menu">\s*<li[^>]*>([\s\S]*?)<\/li>/)[1];
    assert.match(first, /<a href="https:\/\/www\.bookiebullies\.com\/\?utm_source=app&amp;utm_medium=more_menu" target="_blank" rel="noopener">/);
    assert.match(first, /<img src="\/static\/logo\.png\?v=\w+" alt=""/);
    assert.match(visible(first), /Free picks: bookiebullies\.com The Bookie Bullies model's daily picks and Locks/);
  });

  test('the LOCKED ticket points to the model, unless the setting is off', async () => {
    const ann = await player();
    await ann.get('/games?sport=nba');
    const pick = { game: 'nba:2', market: 'spread', side: 'home', line: '-2.5', odds: '-110', units: '1' };
    const board = await ann.get((await ann.post('/picks', pick)).location);
    const ticket = board.text.match(/<div class="locked-ticket"[\s\S]*?<\/div>\s*<\/div>/)[0];
    assert.match(ticket, /<a class="lt-site" href="https:\/\/www\.bookiebullies\.com\/\?utm_source=app&amp;utm_medium=ticket" target="_blank" rel="noopener">Want a second opinion\? See the model's picks →<\/a>/);

    await ann.post('/bb/settings', {});
    await ann.get('/games?sport=nba');
    const again = await ann.get((await ann.post('/picks', { ...pick, market: 'total', side: 'over', line: '223' })).location);
    assert.match(again.text, /<div class="locked-ticket"/);
    assert.doesNotMatch(again.text, /lt-site/);
  });

  test('the record card carries the site for the share image', async () => {
    const ann = await player();
    assert.match((await ann.get('/u/Ann')).text, /data-site="bookiebullies\.com"/);
  });
});

describe('links to the site', () => {
  test('one helper builds them, with utm_source=app and the spot in the app', () => {
    assert.equal(SITE_URL, 'https://www.bookiebullies.com');
    assert.equal(siteLink(SITE_URL, 'bb_chip'), 'https://www.bookiebullies.com/?utm_source=app&utm_medium=bb_chip');
    assert.equal(siteLink('https://www.bookiebullies.com/', 'more_menu'), 'https://www.bookiebullies.com/?utm_source=app&utm_medium=more_menu');
    assert.equal(siteLink(SITE_URL, 'ticket', '/cbb.html'), 'https://www.bookiebullies.com/cbb.html?utm_source=app&utm_medium=ticket');
    assert.equal(siteLink(null, 'x'), 'https://www.bookiebullies.com/?utm_source=app&utm_medium=x');
    assert.equal(siteHost(SITE_URL), 'bookiebullies.com');
    assert.equal(loadConfig({}).siteUrl, SITE_URL);
    assert.equal(loadConfig({ SITE_URL: 'https://picks.example.test/' }).siteUrl, 'https://picks.example.test');
  });

  test('every link to the site on the board, a chip, More and a ticket is well formed', async () => {
    await slate();
    const ann = await player();
    const board = await ann.get('/games?sport=nba');
    const pages = [board.text, (await ann.get('/games/nba%3A1/bb')).text, (await ann.get('/more')).text];
    const pick = { game: 'nba:2', market: 'spread', side: 'home', line: '-2.5', odds: '-110', units: '1' };
    pages.push((await ann.get((await ann.post('/picks', pick)).location)).text);
    const hrefs = pages.flatMap(siteHrefs);
    assert.deepEqual([...new Set(hrefs.map((h) => new URL(h).searchParams.get('utm_medium')))].sort(), ['bb_chip', 'locks_card', 'more_menu', 'ticket']);
    for (const href of hrefs) {
      const url = new URL(href);
      assert.equal(url.origin, 'https://www.bookiebullies.com');
      assert.deepEqual([...url.searchParams.keys()], ['utm_source', 'utm_medium'], href);
      assert.equal(url.searchParams.get('utm_source'), 'app');
    }
  });

  test('SITE_URL moves every link', async () => {
    await app.close();
    app = await startApp({ time, config: { siteUrl: 'https://picks.example.test' } });
    const ann = await player();
    const more = await ann.get('/more');
    assert.match(more.text, /href="https:\/\/picks\.example\.test\/\?utm_source=app&amp;utm_medium=more_menu"/);
    assert.match(visible(more.text), /Free picks: picks\.example\.test/);
  });
});
