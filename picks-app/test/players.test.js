import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { changeScreenName } from '../src/names.js';
import { ensureOfficial } from '../src/official.js';
import { clock, event, startApp, visible } from './helpers.js';

// Sunday 8am Eastern; Bills at Chiefs kicks off at 1pm.
const MORNING = '2026-10-25T12:00:00.000Z';
const KICKOFF = '2026-10-25T17:00:00.000Z';
const DAY = 86_400_000;

let time;
let app;

beforeEach(async () => {
  time = clock(MORNING);
  app = await startApp({ time, config: { adminEmails: ['boss@example.com'] } });
  app.espn.events.nfl.push(event({ id: '1', start: KICKOFF }));
  app.espn.events.nba.push(event({ id: '2', start: '2026-10-25T23:30:00.000Z', home: ['Celtics', 'BOS'], away: ['Lakers', 'LAL'], spread: -5.5, total: 224.5 }));
});

afterEach(() => app.close());

async function player(email, name) {
  const b = app.browser();
  await b.join(email, name);
  await b.get('/games');
  return b;
}

/** A fresh login, for after sessions run out. */
async function login(email) {
  const b = app.browser();
  await b.post('/login', { email, password: 'correct horse' });
  return b;
}

const userId = (name) => app.store.get('SELECT id FROM users WHERE screen_name = ?', name)?.id;

/** Five graded picks for a player, straight into the database, so they have a rank. */
async function record(name, profit) {
  await app.games.upcoming('nfl');
  await app.games.upcoming('nba');
  ['nfl:1', 'nba:2'].flatMap((g) => ['spread', 'total', 'ml'].map((m) => [g, m])).slice(0, 5).forEach(([gameId, market]) => {
    app.store.run(
      `INSERT INTO picks (user_id, game_id, sport, market, side, line, odds, units, game_start, made_at, result, profit, graded_at)
       VALUES (?, ?, ?, ?, 'home', 1, -110, 1, '2026-10-20T00:00:00.000Z', ?, 'win', ?, ?)`,
      userId(name), gameId, gameId.split(':')[0], market, MORNING, profit, MORNING,
    );
  });
}

describe('first-time setup', () => {
  test('pick sports and players once, right after the screen name', async () => {
    await player('bob@example.com', 'Bob');
    await player('cal@example.com', 'Cal');
    await record('Bob', 1);
    await record('Cal', 0.5);

    const ann = app.browser();
    await ann.post('/signup', { email: 'ann@example.com', password: 'correct horse', adult: 'on', terms: 'on' });
    await ann.get('/welcome');
    assert.equal((await ann.post('/welcome', { screen_name: 'Ann' })).location, '/setup');
    const page = await ann.get('/setup');
    assert.equal(page.status, 200);
    assert.match(page.text, /name="sport" value="nba"/);
    const officialId = userId('BookieBullies');
    assert.ok(officialId, 'the official account is there to follow');
    assert.match(page.text, new RegExp(`name="follow" value="${officialId}" checked`), 'and comes checked');
    assert.match(page.text, /<b>BookieBullies<\/b><span class="official-tag"/);
    const offered = [...page.text.matchAll(/class="check follow-pick">[^<]*<input[^>]*>\s*<span><b>(\w+)<\/b>/g)].map((m) => m[1]);
    assert.deepEqual(offered, ['BookieBullies', 'Bob', 'Cal'], 'top players by units, not Ann herself');

    const done = await ann.request('/setup', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', origin: app.base },
      body: `_csrf=${ann.csrf}&sport=nba&sport=ncaab&sport=bogus&follow=${officialId}&follow=${userId('Cal')}`,
    });
    assert.equal(done.location, '/games?sport=nba');
    assert.match(visible((await ann.get(done.location)).text), /You're on the board, Ann/);
    const me = app.store.get("SELECT fav_sports, setup_done FROM users WHERE screen_name = 'Ann'");
    assert.deepEqual({ ...me }, { fav_sports: 'nba,ncaab', setup_done: 1 });
    const follows = app.store.all('SELECT followee_id FROM follows WHERE follower_id = ? ORDER BY followee_id', userId('Ann')).map((r) => r.followee_id);
    assert.deepEqual(follows, [userId('Cal'), officialId].sort((a, b) => a - b));

    const games = await ann.get('/games');
    assert.match(games.text, /href="\/games\?sport=nba" class="on"/, 'the games page opens on the first favorite');
    assert.match(visible(games.text), /Lakers.*Celtics/);
    assert.match((await ann.get('/games?sport=nfl')).text, /href="\/games\?sport=nfl" class="on"/, 'a sport in the address still wins');
    assert.equal((await ann.get('/setup')).location, '/games', 'never again');
  });

  test('skip, and still follow the official account', async () => {
    const ann = app.browser();
    await ann.post('/signup', { email: 'ann@example.com', password: 'correct horse', adult: 'on', terms: 'on' });
    await ann.get('/welcome');
    await ann.post('/welcome', { screen_name: 'Ann' });
    await ann.get('/setup');
    assert.equal((await ann.post('/setup/skip')).location, '/games');
    assert.deepEqual(app.store.all('SELECT followee_id FROM follows').map((r) => r.followee_id), [userId('BookieBullies')]);
    assert.match((await ann.get('/games')).text, /href="\/games\?sport=nfl" class="on"/, 'no favorites: the default sport');
    assert.equal((await ann.get('/setup')).location, '/games');
  });

  test('keep an invite link through setup', async () => {
    const ann = app.browser();
    await ann.post('/signup', { email: 'ann@example.com', password: 'correct horse', adult: 'on', terms: 'on', next: '/join/ABCD2345' });
    await ann.get('/welcome?next=%2Fjoin%2FABCD2345');
    const welcome = await ann.post('/welcome', { screen_name: 'Ann', next: '/join/ABCD2345' });
    assert.equal(welcome.location, '/setup?next=%2Fjoin%2FABCD2345');
    await ann.get(welcome.location);
    assert.equal((await ann.post('/setup', { next: '/join/ABCD2345', sport: 'nba' })).location, '/join/ABCD2345');
  });

  test("players who were here before setup existed don't see it", async () => {
    const ann = await player('ann@example.com', 'Ann');
    // What the migration does for everyone with a screen name.
    app.store.run('UPDATE users SET setup_done = 1');
    assert.equal((await ann.get('/setup')).location, '/games');
  });
});

describe('screen names', () => {
  test('change it once a month, with the old name pointing to the new one', async () => {
    const ann = await player('ann@example.com', 'Ann');
    await ann.get('/u/Ann');
    const changed = await ann.post('/screen-name', { screen_name: 'AnnPicks' });
    assert.equal(changed.location, '/u/AnnPicks');
    assert.match(visible((await ann.get(changed.location)).text), /You're AnnPicks now\. Links to Ann keep working for 90 days\./);

    const old = await app.browser().get('/u/ann');
    assert.equal(old.status, 302);
    assert.equal(old.location, '/u/AnnPicks');

    const page = visible((await ann.get('/u/AnnPicks')).text);
    assert.match(page, /You changed it recently\. You can change it again Nov 24/);
    await ann.post('/screen-name', { screen_name: 'AnnAgain' });
    assert.match(visible((await ann.get('/u/AnnPicks')).text), /once every 30 days/);
    assert.equal(userId('AnnAgain'), undefined);

    time.advance(31 * DAY);
    const back = await login('ann@example.com');
    await back.get('/u/AnnPicks');
    assert.equal((await back.post('/screen-name', { screen_name: 'Ann' })).location, '/u/Ann', 'taking your own old name back is fine');
    assert.equal((await app.browser().get('/u/AnnPicks')).location, '/u/Ann');
  });

  test("hold an old name for 90 days so nobody else can take it", async () => {
    const ann = await player('ann@example.com', 'Ann');
    await ann.get('/u/Ann');
    await ann.post('/screen-name', { screen_name: 'AnnPicks' });

    const bob = app.browser();
    await bob.post('/signup', { email: 'bob@example.com', password: 'correct horse', adult: 'on', terms: 'on' });
    await bob.get('/welcome');
    assert.match((await bob.post('/welcome', { screen_name: 'ANN' })).text, /already has that name/);
    await bob.post('/welcome', { screen_name: 'Bob' });
    await bob.get('/u/Bob');
    await bob.post('/screen-name', { screen_name: 'ann' });
    assert.match(visible((await bob.get('/u/Bob')).text), /already has that name/);
    await bob.post('/screen-name', { screen_name: 'annpicks' });
    assert.match(visible((await bob.get('/u/Bob')).text), /already has that name/);
    await bob.post('/screen-name', { screen_name: 'B00kie_Bu11ies' });
    assert.match(visible((await bob.get('/u/Bob')).text), /reserved/);
    await bob.post('/screen-name', { screen_name: 'no spaces' });
    assert.match(visible((await bob.get('/u/Bob')).text), /3 to 20 letters/);

    time.advance(91 * DAY);
    assert.equal((await app.browser().get('/u/Ann')).status, 404, 'the redirect runs out');
    const later = await login('bob@example.com');
    await later.get('/u/Bob');
    assert.equal((await later.post('/screen-name', { screen_name: 'Ann' })).location, '/u/Ann');
  });

  test("the official account can't be renamed and nobody can pass for it", async () => {
    const id = ensureOfficial(app.store, time.now());
    assert.match(changeScreenName(app.store, { userId: id, name: 'SomethingElse', now: time.now() }).error, /can't change/);
    const ann = await player('ann@example.com', 'Ann');
    for (const name of ['BookieBullies', 'bookie_bullies', 'TheBookieBully', 'B00kieBu11ies', 'official']) {
      await ann.get('/u/Ann');
      await ann.post('/screen-name', { screen_name: name });
      assert.match(visible((await ann.get('/u/Ann')).text), /reserved/, name);
    }
  });
});

describe('player search', () => {
  test('find players by the start of their name, any case', async () => {
    for (const [email, name] of [['a@example.com', 'Ann'], ['b@example.com', 'annie'], ['c@example.com', 'Bob'], ['d@example.com', 'x_y'], ['e@example.com', 'x1y']]) {
      await player(email, name);
    }
    const quiet = app.browser();
    await quiet.join('f@example.com', 'AnnUnconfirmed', 'correct horse', { confirm: false });
    await record('Ann', 1);

    const found = (await app.browser().get('/search?q=AN')).text;
    const names = [...found.matchAll(/class="who" href="\/u\/(\w+)"/g)].map((m) => m[1]);
    assert.deepEqual(names, ['Ann', 'annie'], 'unconfirmed players stay off, like the boards');
    assert.match(visible(found), /Ann 5-0 100% \+5u/);
    assert.doesNotMatch(found, /<th>#<\/th>/, 'no ranks in search results');

    const underscore = (await app.browser().get('/search?q=x_')).text;
    assert.deepEqual([...underscore.matchAll(/class="who" href="\/u\/(\w+)"/g)].map((m) => m[1]), ['x_y'], '_ is a plain underscore');
    for (const q of ['%', '%25', "'", 'a%', '\\']) {
      const res = await app.browser().get(`/search?q=${encodeURIComponent(q)}`);
      assert.equal(res.status, 200);
      assert.doesNotMatch(res.text, /class="who" href="\/u\/(Bob|x1y)"/, q);
    }
    const nothing = (await app.browser().get('/search?q=%3Cb%3Ezz')).text;
    assert.match(nothing, /Nobody's name starts with “&lt;b&gt;zz”/);
  });

  test('a search box on the leaderboard and Find players in More', async () => {
    const ann = await player('ann@example.com', 'Ann');
    assert.match((await app.browser().get('/leaderboard')).text, /<form class="search" method="get" action="\/search"/);
    assert.match(visible((await ann.get('/more')).text), /Find players/);
    assert.match((await app.browser().get('/search')).text, /<input type="search" name="q"/);
  });
});

describe('admin', () => {
  const page = '/games/nfl%3A1';

  async function reported() {
    const ann = await player('ann@example.com', 'Ann');
    await ann.get(page);
    await ann.post(`${page}/chat`, { body: 'buy my picks at scam.example' });
    await ann.post(`${page}/chat`, { body: 'a fine message' });
    const [spam, fine] = app.store.all('SELECT id FROM chat_messages ORDER BY id').map((r) => r.id);
    for (const [email, name] of [['bob@example.com', 'Bob'], ['cal@example.com', 'Cal'], ['dee@example.com', 'Dee']]) {
      const b = await player(email, name);
      await b.get(page);
      await b.post(`/chat/${spam}/report`);
      if (name === 'Bob') await b.post(`/chat/${fine}/report`);
    }
    return { ann, spam, fine };
  }

  test('nobody but an admin can see or touch the reports', async () => {
    const { ann, spam } = await reported();
    assert.equal((await app.browser().get('/admin/reports')).status, 404);
    assert.equal((await ann.get('/admin/reports')).status, 404);
    assert.doesNotMatch(visible((await ann.get('/more')).text), /Admin/);
    await ann.get('/more');
    assert.equal((await ann.post(`/admin/reports/${spam}/restore`)).status, 404);
    assert.equal((await ann.post(`/admin/reports/${spam}/delete`)).status, 404);
    assert.equal(app.store.get('SELECT COUNT(*) AS n FROM chat_reports WHERE message_id = ?', spam).n, 3);

    // Signing up with the admin's address isn't enough without confirming it.
    const faker = app.browser();
    await faker.join('BOSS@example.com', 'Boss', 'correct horse', { confirm: false });
    assert.equal((await faker.get('/admin/reports')).status, 404);
  });

  test('restore or delete reported messages', async () => {
    const { spam, fine } = await reported();
    const boss = await player('Boss@Example.com', 'Boss');
    assert.match(visible((await boss.get('/more')).text), /Admin Reported chat and photos 2/);
    const list = await boss.get('/admin/reports');
    assert.equal(list.status, 200);
    const text = visible(list.text);
    assert.match(text, /Ann · Bills @ Chiefs · NFL 3 reports · Hidden buy my picks at scam\.example/);
    assert.match(text, /1 report a fine message/);
    assert.ok(text.indexOf('scam.example') < text.indexOf('a fine message'), 'hidden ones first');

    assert.equal((await boss.post(`/admin/reports/${fine}/restore`)).location, '/admin/reports');
    assert.equal(app.store.get('SELECT COUNT(*) AS n FROM chat_reports WHERE message_id = ?', fine).n, 0);
    assert.match(visible((await boss.get('/admin/reports')).text), /Restored/);

    await boss.post(`/admin/reports/${spam}/delete`);
    assert.ok(app.store.get('SELECT deleted_at FROM chat_messages WHERE id = ?', spam).deleted_at);
    const after = visible((await boss.get('/admin/reports')).text);
    assert.match(after, /Nothing reported right now/);
    const chat = visible((await boss.get(page)).text);
    assert.doesNotMatch(chat, /scam\.example/);
    assert.match(chat, /a fine message/);
  });

  test('admin forms need the form token', async () => {
    const { spam } = await reported();
    const boss = await player('boss@example.com', 'Boss');
    await boss.get('/admin/reports');
    assert.equal((await boss.post(`/admin/reports/${spam}/delete`, {}, { csrf: false })).status, 403);
    assert.equal(app.store.get('SELECT deleted_at FROM chat_messages WHERE id = ?', spam).deleted_at, null);
  });
});
