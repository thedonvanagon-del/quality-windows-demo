import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { clock, event, setFinal, setLine, setLive, startApp, visible } from './helpers.js';

// Sunday 8am Eastern; Bills at Chiefs kicks off at 1pm.
const MORNING = '2026-10-25T12:00:00.000Z';
const KICKOFF = '2026-10-25T17:00:00.000Z';
const BILLS_PLUS = { game: 'nfl:1', market: 'spread', side: 'away', line: '3.5', odds: '-110', wager: '100' };

let time;
let app;
let game;

beforeEach(async () => {
  time = clock(MORNING);
  app = await startApp({ time });
  game = event({ id: '1', start: KICKOFF });
  app.espn.events.nfl.push(game);
});

afterEach(() => app.close());

const picks = () => app.store.all('SELECT * FROM picks ORDER BY id');

async function player(email, name) {
  const b = app.browser();
  await b.join(email, name);
  await b.get('/games');
  return b;
}

describe('accounts', () => {
  test('sign up, pick a screen name, land on the games', async () => {
    const b = app.browser();
    const signup = await b.post('/signup', { email: 'Ann@Example.com', password: 'correct horse' });
    assert.equal(signup.status, 303);
    assert.equal(signup.location, '/welcome');
    await b.get('/welcome');
    const welcome = await b.post('/welcome', { screen_name: 'Ann' });
    assert.equal(welcome.location, '/games');
    const games = await b.get('/games');
    assert.equal(games.status, 200);
    assert.match(visible(games.text), /You're on the board, Ann/);
    assert.match(visible(games.text), /Bills.*Chiefs/);
    assert.equal(app.store.get('SELECT email FROM users').email, 'ann@example.com');
  });

  test('turn away bad signups and taken names', async () => {
    const b = app.browser();
    assert.match((await b.post('/signup', { email: 'nope', password: 'correct horse' })).text, /doesn&#39;t look right/);
    assert.match((await b.post('/signup', { email: 'a@b.co', password: 'short' })).text, /at least 8/);
    await b.join('ann@example.com', 'Ann');

    const c = app.browser();
    assert.match((await c.post('/signup', { email: 'ANN@example.com', password: 'correct horse' })).text, /already an account/);
    await c.post('/signup', { email: 'cat@example.com', password: 'correct horse' });
    await c.get('/welcome');
    assert.match((await c.post('/welcome', { screen_name: 'ann' })).text, /already has that name/);
    assert.match((await c.post('/welcome', { screen_name: 'a b' })).text, /3 to 20 letters/);
    assert.match((await c.post('/welcome', { screen_name: 'Admin' })).text, /reserved/);
    assert.equal((await c.get('/games')).location, '/welcome?next=%2Fgames', 'no games until there is a name');
  });

  test('log in, go where you were headed, log out', async () => {
    await app.browser().join('ann@example.com', 'Ann');
    const b = app.browser();
    assert.equal((await b.get('/groups')).location, '/login?next=%2Fgroups');
    assert.match((await b.post('/login', { email: 'ann@example.com', password: 'wrong one' })).text, /don&#39;t match/);
    assert.match((await b.post('/login', { email: 'who@example.com', password: 'wrong one' })).text, /don&#39;t match/);
    const ok = await b.post('/login', { email: 'ann@example.com', password: 'correct horse', next: '/groups' });
    assert.equal(ok.location, '/groups');
    await b.get('/groups');
    assert.equal((await b.post('/logout')).location, '/');
    assert.match((await b.get('/picks')).location, /^\/login/);
  });

  test('write a short bio that everyone can read', async () => {
    const b = await player('ann@example.com', 'Ann');
    await b.get('/u/Ann');
    await b.post('/bio', { bio: 'Big Ten unders.\n\nThat is <b>it</b>.' });
    const mine = await b.get('/u/Ann');
    assert.match(visible(mine.text), /Bio saved\./);
    const theirs = await app.browser().get('/u/Ann');
    assert.match(theirs.text, /<p class="bio">Big Ten unders\. That is &lt;b&gt;it&lt;\/b&gt;\.<\/p>/);
    assert.doesNotMatch(theirs.text, /Save bio/, 'only the owner gets the form');

    await b.post('/bio', { bio: 'x'.repeat(161) });
    assert.match(visible((await b.get('/u/Ann')).text), /Keep your bio to 160 characters/);
    assert.match((await b.get('/u/Ann')).text, /Big Ten unders/, 'a too-long bio leaves the old one');

    await b.post('/bio', { bio: '   ' });
    assert.doesNotMatch((await app.browser().get('/u/Ann')).text, /class="bio"/);
  });

  test('pick an app color that sticks to the account', async () => {
    const b = await player('ann@example.com', 'Ann');
    assert.match((await b.get('/games')).text, /data-theme="ember"/, 'orange by default');
    await b.get('/u/Ann');
    assert.equal((await b.post('/theme', { theme: 'violet' })).location, '/u/Ann');
    assert.match((await b.get('/games')).text, /data-theme="violet"/);
    await b.post('/theme', { theme: 'hotpink' });
    assert.match((await b.get('/games')).text, /data-theme="violet"/, 'unknown colors are ignored');
    assert.match((await app.browser().get('/')).text, /data-theme="ember"/, 'visitors see the default');
  });

  test('reset a forgotten password by email', async () => {
    const old = await player('ann@example.com', 'Ann');
    const b = app.browser();
    await b.get('/forgot');
    const asked = await b.post('/forgot', { email: 'Ann@Example.com' });
    assert.match(visible(asked.text), /a link to set a new password is on its way/);
    assert.equal(app.outbox.length, 1);
    const [mail] = app.outbox;
    assert.equal(mail.to, 'ann@example.com');
    const link = /https:\/\/app\.example\.test\/reset\?token=([\w-]+)/.exec(mail.text);
    assert.ok(link, 'the link uses APP_URL, never the request host');

    await b.get(`/reset?token=${link[1]}`);
    assert.match(visible((await b.post('/reset', { token: link[1], password: 'short' })).text), /at least 8/);
    const done = await b.post('/reset', { token: link[1], password: 'brand new pass' });
    assert.equal(done.location, '/games');
    assert.match(visible((await b.get('/games')).text), /Password changed/);

    assert.match((await old.get('/picks')).location, /^\/login/, 'old sessions are signed out');
    assert.match(visible((await app.browser().post('/login', { email: 'ann@example.com', password: 'correct horse' })).text), /don't match/);
    assert.equal((await app.browser().post('/login', { email: 'ann@example.com', password: 'brand new pass' })).location, '/games');
    assert.match(visible((await app.browser().get(`/reset?token=${link[1]}`)).text), /That link has expired/, 'a link works once');
  });

  test('say the same thing for an email with no account, and send nothing', async () => {
    const b = app.browser();
    await b.get('/forgot');
    assert.match(visible((await b.post('/forgot', { email: 'nobody@example.com' })).text), /If nobody@example\.com has an account/);
    assert.equal(app.outbox.length, 0);
  });

  test('expire a reset link after an hour', async () => {
    await player('ann@example.com', 'Ann');
    const b = app.browser();
    await b.get('/forgot');
    await b.post('/forgot', { email: 'ann@example.com' });
    const token = /token=([\w-]+)/.exec(app.outbox[0].text)[1];
    time.advance(61 * 60_000);
    assert.equal((await b.get(`/reset?token=${token}`)).status, 400);
  });

  test('never send someone off-site after login', async () => {
    await app.browser().join('ann@example.com', 'Ann');
    const b = app.browser();
    const res = await b.post('/login', { email: 'ann@example.com', password: 'correct horse', next: '//evil.example/x' });
    assert.equal(res.location, '/games');
  });
});

describe('picks', () => {
  test('lock at the line on the board, one side per market', async () => {
    const b = await player('ann@example.com', 'Ann');
    const slip = await b.get('/pick?game=nfl:1&market=spread&side=away');
    assert.match(visible(slip.text), /Bills \+3\.5/);

    const res = await b.post('/picks', { ...BILLS_PLUS, wager: '200' });
    assert.equal(res.location, '/games?sport=nfl');
    assert.match(visible((await b.get(res.location)).text), /Locked in: Bills \+3\.5 \(-110\), \$200 to win \$181\.82\./);
    const [p] = picks();
    assert.equal(p.line, 3.5);
    assert.equal(p.odds, -110);
    assert.equal(p.units, 2);
    assert.equal(p.wager, 200);
    assert.equal(p.made_at, MORNING);

    await b.post('/picks', { ...BILLS_PLUS, side: 'home', line: '-3.5' });
    assert.match(visible((await b.get('/games')).text), /already have a spread pick/);
    assert.equal(picks().length, 1);

    await b.post('/picks', { game: 'nfl:1', market: 'total', side: 'over', line: '47.5', odds: '-110', wager: '100' });
    assert.equal(picks().length, 2, 'a total on the same game is its own pick');
    assert.match((await b.get('/games')).text, /cell mine/);
  });

  test('wager dollars, counted in units, private to the bettor', async () => {
    const b = await player('ann@example.com', 'Ann');
    await b.get('/u/Ann');
    await b.post('/unit', { unit_size: '$50' });
    await b.get('/games');
    await b.post('/picks', { ...BILLS_PLUS, wager: '$125' });
    const [p] = picks();
    assert.deepEqual([p.wager, p.units], [125, 2.5]);

    const mine = visible((await b.get('/picks')).text);
    assert.match(mine, /\$125 to win \$113\.64/);
    assert.match(mine, /Starts in 5h 0m/);
    assert.match((await b.get('/games')).text, /class="badge"[^>]*>1</, 'one open bet on the My bets tab');

    const bob = await player('bob@example.com', 'Bob');
    time.set('2026-10-25T17:05:00.000Z');
    const seen = visible((await bob.get('/u/Ann')).text);
    assert.match(seen, /Bills \+3\.5 −110 2\.5u/);
    assert.doesNotMatch(seen, /\$125/, 'nobody else sees dollars');
  });

  test('turn away a wager out of range', async () => {
    const b = await player('ann@example.com', 'Ann');
    for (const wager of ['0', 'lots', '1000000']) {
      const res = await b.post('/picks', { ...BILLS_PLUS, wager });
      assert.equal(res.status, 400, wager);
      assert.match(visible(res.text), /Wager between \$1 and \$100,000/);
    }
    assert.equal(picks().length, 0);
  });

  test('ask again when the line moves', async () => {
    const b = await player('ann@example.com', 'Ann');
    setLine(game, { spread: -4.5 });
    time.advance(2 * 60_000);
    const res = await b.post('/picks', BILLS_PLUS);
    assert.equal(res.status, 409);
    assert.match(visible(res.text), /The line moved to Bills \+4\.5 \(-110\)/);
    assert.equal(picks().length, 0);
    await b.post('/picks', { ...BILLS_PLUS, line: '4.5' });
    assert.equal(picks()[0].line, 4.5);
  });

  test('take a line the player never saw', async () => {
    const b = await player('ann@example.com', 'Ann');
    const res = await b.post('/picks', { ...BILLS_PLUS, line: '10.5' });
    assert.equal(res.status, 409);
    assert.equal(picks().length, 0);
  });

  test('close at the start', async () => {
    const b = await player('ann@example.com', 'Ann');
    time.set(KICKOFF);
    await b.post('/picks', BILLS_PLUS);
    assert.match(visible((await b.get('/games?sport=nfl')).text), /That game has started/);
    assert.equal(picks().length, 0);
    assert.equal((await b.get('/pick?game=nfl:1&market=spread&side=away')).status, 303);
  });

  test('close early when ESPN says the game is on', async () => {
    const b = await player('ann@example.com', 'Ann');
    time.set('2026-10-25T16:55:00.000Z');
    setLive(game);
    await b.post('/picks', BILLS_PLUS);
    assert.equal(picks().length, 0);
  });

  test('delete before the start, never after', async () => {
    const b = await player('ann@example.com', 'Ann');
    await b.post('/picks', BILLS_PLUS);
    await b.get('/picks');
    await b.post(`/picks/${picks()[0].id}/delete`);
    assert.equal(picks().length, 0);

    await b.get('/games');
    await b.post('/picks', BILLS_PLUS);
    time.set('2026-10-25T17:01:00.000Z');
    await b.get('/picks');
    await b.post(`/picks/${picks()[0].id}/delete`);
    assert.match(visible((await b.get('/picks')).text), /stays on the record/);
    assert.equal(picks().length, 1);
  });

  test("can't delete someone else's pick", async () => {
    const ann = await player('ann@example.com', 'Ann');
    await ann.post('/picks', BILLS_PLUS);
    const bob = await player('bob@example.com', 'Bob');
    assert.equal((await bob.post(`/picks/${picks()[0].id}/delete`)).status, 404);
    assert.equal(picks().length, 1);
  });

  test('pause when ESPN is out of reach', async () => {
    const b = await player('ann@example.com', 'Ann');
    app.espn.down = true;
    time.advance(11 * 60_000);
    const res = await b.post('/picks', BILLS_PLUS);
    assert.equal(res.status, 503);
    assert.equal(picks().length, 0);
  });

  test('stay hidden from everyone else until the start', async () => {
    const ann = await player('ann@example.com', 'Ann');
    await ann.post('/picks', BILLS_PLUS);
    const bob = await player('bob@example.com', 'Bob');

    assert.doesNotMatch(visible((await bob.get('/u/Ann')).text), /Bills \+3\.5/);
    assert.match(visible((await bob.get('/u/Ann')).text), /1 open pick, shown once the game starts/);
    const stranger = app.browser();
    assert.equal((await stranger.get('/u/ann')).location, '/u/Ann');
    assert.doesNotMatch(visible((await stranger.get('/u/Ann')).text), /Bills \+3\.5/);
    assert.match(visible((await ann.get('/u/Ann')).text), /Bills \+3\.5/);

    time.set('2026-10-25T17:05:00.000Z');
    assert.match(visible((await bob.get('/u/Ann')).text), /Bills \+3\.5/);
  });
});

describe('more and live', () => {
  test('list games in progress with your bets on them', async () => {
    const ann = await player('ann@example.com', 'Ann');
    await ann.post('/picks', { ...BILLS_PLUS, wager: '40' });
    assert.match(visible((await ann.get('/live')).text), /Nothing on right now/);

    time.set('2026-10-25T17:30:00.000Z');
    setLive(game);
    game.competitions[0].competitors[0].score = '7';
    game.competitions[0].competitors[1].score = '3';
    const page = visible((await ann.get('/live')).text);
    assert.match(page, /Live NFL · 2nd Qtr BUF Bills 3 KC Chiefs 7/);
    assert.match(page, /Your bet Bills \+3\.5 −110 \$40/);
    assert.match(visible((await ann.get('/more')).text), /Live games Scores right now, with your bets on them 1 live/);

    const bob = await player('bob@example.com', 'Bob');
    assert.doesNotMatch(visible((await bob.get('/live')).text), /Your bet/, 'only your own bets');
    assert.match((await app.browser().get('/live')).location, /^\/login/);
  });
});

describe('grading and boards', () => {
  test('grade off the final and rank by units', async () => {
    const ann = await player('ann@example.com', 'Ann');
    await ann.post('/picks', { ...BILLS_PLUS, wager: '200' });
    const bob = await player('bob@example.com', 'Bob');
    await bob.post('/picks', { game: 'nfl:1', market: 'ml', side: 'home', line: '', odds: '-170', wager: '100' });
    const cat = await player('cat@example.com', 'Cat');
    await cat.post('/picks', { game: 'nfl:1', market: 'total', side: 'under', line: '47.5', odds: '-110', wager: '100' });

    setFinal(game, 27, 24);
    time.set('2026-10-25T21:00:00.000Z');
    assert.equal(await app.games.checkFinals(), 3);
    assert.deepEqual(picks().map((p) => [p.result, p.profit]), [['win', 1.82], ['win', 0.59], ['loss', -1]]);

    const board = visible((await app.browser().get('/leaderboard')).text);
    assert.ok(board.indexOf('Ann') < board.indexOf('Bob') && board.indexOf('Bob') < board.indexOf('Cat'), board);
    assert.match(board, /Ann 1-0 100% \+1\.82u \+91%/);
    assert.match(visible((await app.browser().get('/leaderboard?sport=nba')).text), /No graded picks here yet/);
    assert.match(visible((await ann.get('/picks?tab=settled')).text), /Won \+\$181\.82/);
    assert.match(visible((await app.browser().get('/u/Cat')).text), /0-1/);
  });

  test('push a spread that lands on the number', async () => {
    const ann = await player('ann@example.com', 'Ann');
    setLine(game, { spread: -3 });
    time.advance(2 * 60_000);
    await ann.post('/picks', { ...BILLS_PLUS, line: '3' });
    setFinal(game, 27, 24);
    time.set('2026-10-25T21:00:00.000Z');
    await app.games.checkFinals();
    assert.deepEqual([picks()[0].result, picks()[0].profit], ['push', 0]);
  });
});

describe('groups', () => {
  test('start one, invite friends, keep it private', async () => {
    const ann = await player('ann@example.com', 'Ann');
    await ann.get('/groups');
    const made = await ann.post('/groups', { name: 'Sunday Squad', sport: 'nfl' });
    assert.equal(made.location, '/groups/1');
    const page = await ann.get('/groups/1');
    const code = /class="code">([A-Z0-9]{8})</.exec(page.text)[1];
    assert.match(page.text, new RegExp(`/join/${code}`));

    const bob = await player('bob@example.com', 'Bob');
    await bob.get('/groups');
    assert.equal((await bob.post('/groups/join', { code: code.toLowerCase() })).location, '/groups/1');

    const cat = await player('cat@example.com', 'Cat');
    assert.equal((await cat.get('/groups/1')).status, 404, 'members only');
    assert.match(visible((await cat.get(`/join/${code}`)).text), /Join Sunday Squad\?/);
    assert.equal((await app.browser().get(`/join/${code}`)).location, `/signup?next=%2Fjoin%2F${code}`);

    await ann.post('/picks', BILLS_PLUS);
    await bob.post('/picks', { ...BILLS_PLUS, side: 'home', line: '-3.5' });
    await cat.post('/picks', BILLS_PLUS);
    setFinal(game, 27, 24);
    time.set('2026-10-25T21:00:00.000Z');
    await app.games.checkFinals();

    const board = visible((await ann.get('/groups/1')).text);
    assert.match(board, /Ann 1-0/);
    assert.match(board, /Bob 0-1/);
    assert.doesNotMatch(board, /Cat/);

    await bob.get('/groups/1');
    await bob.post('/groups/1/leave');
    assert.equal((await bob.get('/groups/1')).status, 404);

    await ann.get('/groups/1');
    await ann.post('/groups/1/delete');
    assert.equal(app.store.get('SELECT COUNT(*) AS n FROM friend_groups').n, 0);
    assert.equal(picks().length, 3, 'deleting a group leaves everyone their picks');
  });

  test('a bad code says so', async () => {
    const ann = await player('ann@example.com', 'Ann');
    await ann.get('/groups');
    assert.match(visible((await ann.post('/groups/join', { code: 'NOPE1234' })).text), /No group has that code/);
  });
});

describe('form safety', () => {
  test('refuse posts from other sites and stale forms', async () => {
    const ann = await player('ann@example.com', 'Ann');
    assert.equal((await ann.post('/picks', BILLS_PLUS, { origin: 'https://evil.example' })).status, 403);
    assert.equal((await ann.post('/picks', BILLS_PLUS, { headers: { 'sec-fetch-site': 'cross-site' } })).status, 403);
    assert.equal((await ann.post('/picks', BILLS_PLUS, { csrf: false })).status, 403);
    assert.equal(picks().length, 0);
  });

  test('escape what players type', async () => {
    const ann = await player('ann@example.com', 'Ann');
    await ann.get('/groups');
    await ann.post('/groups', { name: '<script>alert(1)</script>', sport: '' });
    const page = await ann.get('/groups/1');
    assert.doesNotMatch(page.text, /<script>alert/);
    assert.match(page.text, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  });

  test('install on a phone home screen', async () => {
    const home = (await app.browser().get('/')).text;
    const manifest = /<link rel="manifest" href="([^"]+)"/.exec(home)[1];
    assert.match(home, /<link rel="apple-touch-icon" href="\/static\/icon-180\.png\?v=/);
    const res = await fetch(app.base + manifest);
    assert.equal(res.headers.get('content-type'), 'application/manifest+json');
    const json = await res.json();
    assert.equal(json.display, 'standalone');
    for (const icon of json.icons) assert.equal((await fetch(app.base + icon.src)).status, 200, icon.src);
  });

  test('send security headers', async () => {
    const res = await fetch(`${app.base}/leaderboard`);
    assert.match(res.headers.get('content-security-policy'), /script-src 'self'/);
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.equal(res.headers.get('cache-control'), 'no-store');
  });
});
