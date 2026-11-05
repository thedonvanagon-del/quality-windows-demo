import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { runOf, streakBoards, streakOf } from '../src/streak.js';
import { addBet, addPlayer, clock, event, setFinal, startApp, visible } from './helpers.js';

// Sunday Oct 25, 8am Eastern. Two games today, one Monday night.
const MORNING = '2026-10-25T12:00:00.000Z';
const ONE = '2026-10-25T17:00:00.000Z';
const FOUR = '2026-10-25T20:25:00.000Z';
const MONDAY = '2026-10-27T00:15:00.000Z';

let time;
let app;
let games;

beforeEach(async () => {
  time = clock(MORNING);
  app = await startApp({ time });
  games = {
    1: event({ id: '1', start: ONE, home: ['Chiefs', 'KC'], away: ['Bills', 'BUF'] }),
    2: event({ id: '2', start: FOUR, home: ['Dolphins', 'MIA'], away: ['Jets', 'NYJ'] }),
    3: event({ id: '3', start: MONDAY, home: ['49ers', 'SF'], away: ['Rams', 'LAR'] }),
  };
  app.espn.events.nfl.push(...Object.values(games));
});

afterEach(() => app.close());

const userId = (name) => app.store.get('SELECT id FROM users WHERE screen_name = ?', name).id;
const streakDays = () => app.store.all('SELECT game_id, streak_day FROM picks WHERE streak_day IS NOT NULL ORDER BY game_id').map((r) => `${r.game_id} ${r.streak_day}`);
const pick = (game, extra = {}) => ({ game, market: 'spread', side: 'away', line: '3.5', odds: '-110', units: '1', ...extra });

async function player(email, name) {
  const b = app.browser();
  await b.join(email, name);
  await b.get('/games');
  return b;
}

describe('streak game', () => {
  test('the math: wins count, pushes and voids are skipped, a loss resets, the best is kept', () => {
    assert.deepEqual(runOf([]), { current: 0, best: 0 });
    assert.deepEqual(runOf(['win', 'win', 'push', 'win', 'void']), { current: 3, best: 3 });
    assert.deepEqual(runOf(['win', 'win', 'win', 'loss', 'win']), { current: 1, best: 3 });
    assert.deepEqual(runOf(['win', 'loss']), { current: 0, best: 1 });
    assert.deepEqual(runOf(['win', null, 'win']), { current: 2, best: 2 }, 'an open one waits');
  });

  test('a missed day does not break it; a loss does', () => {
    const ann = addPlayer(app.store, 'Ann');
    // Oct 20, 21, then nothing on the 22nd, then the 23rd.
    for (const day of ['2026-10-20T23:00:00.000Z', '2026-10-21T23:00:00.000Z', '2026-10-23T23:00:00.000Z']) {
      addBet(app.store, { userId: ann, start: day, streak: true });
    }
    addBet(app.store, { userId: ann, start: '2026-10-24T17:00:00.000Z', result: 'push', streak: true });
    // A plain pick that lost doesn't touch the streak.
    addBet(app.store, { userId: ann, start: '2026-10-24T20:00:00.000Z', result: 'loss' });
    assert.deepEqual(streakOf(app.store, ann), { current: 3, best: 3, played: 4 });

    const bob = addPlayer(app.store, 'Bob');
    for (const [day, result] of [['2026-10-19', 'win'], ['2026-10-20', 'win'], ['2026-10-21', 'loss'], ['2026-10-22', 'win']]) {
      addBet(app.store, { userId: bob, start: `${day}T23:00:00.000Z`, result, streak: true });
    }
    assert.deepEqual(streakOf(app.store, bob), { current: 1, best: 2, played: 4 });

    const boards = streakBoards(app.store);
    assert.deepEqual(boards.current.map((r) => `${r.screen_name} ${r.current}`), ['Ann 3', 'Bob 1']);
    assert.deepEqual(boards.best.map((r) => `${r.screen_name} ${r.best}`), ['Ann 3', 'Bob 2']);
  });

  test('one Streak pick per day, from the slip; never a parlay', async () => {
    const ann = await player('ann@example.com', 'Ann');
    const slip = await ann.get('/pick?game=nfl:1&market=spread&side=away');
    assert.match(visible(slip.text), /Make this my Streak pick for today/);
    assert.match(slip.text, /<input type="checkbox" name="streak" >/);

    const res = await ann.post('/picks', pick('nfl:1', { streak: 'on' }));
    assert.match(visible((await ann.get(res.location)).text), /Bills \+3\.5 \(-110\), 1u to win 0\.91u\. Your Streak pick/);
    assert.deepEqual(streakDays(), ['nfl:1 20261025']);

    // Today has one now: the next slip today doesn't offer it, and asking anyway doesn't take.
    assert.doesNotMatch((await ann.get('/pick?game=nfl:2&market=spread&side=away')).text, /name="streak"/);
    const again = await ann.post('/picks', pick('nfl:2', { streak: 'on' }));
    assert.match(visible((await ann.get(again.location)).text), /You already had a Streak pick that day, so this one isn't/);
    assert.deepEqual(streakDays(), ['nfl:1 20261025']);

    // Monday's game is a different day.
    assert.match(visible((await ann.get('/pick?game=nfl:3&market=spread&side=away')).text), /Make this my Streak pick for Mon, Oct 26/);

    // Parlays ignore it.
    await ann.get('/pick?game=nfl:3&market=total&side=over');
    await ann.post('/parlay/legs', { game: 'nfl:3', market: 'total', side: 'over', streak: 'on' });
    assert.deepEqual(streakDays(), ['nfl:1 20261025']);

    // My bets marks it.
    const mine = await ann.get('/picks');
    assert.equal((mine.text.match(/class="streak-tag"/g) ?? []).length, 1);
    assert.match(visible(mine.text), /Streak Bills \+3\.5/);
  });

  test('switch it before the start, never after; deleting the pick takes the flag', async () => {
    const ann = await player('ann@example.com', 'Ann');
    await ann.post('/picks', pick('nfl:1', { streak: 'on' }));
    await ann.post('/picks', pick('nfl:2'));
    const first = app.store.get("SELECT id FROM picks WHERE game_id = 'nfl:1'").id;
    const second = app.store.get("SELECT id FROM picks WHERE game_id = 'nfl:2'").id;

    // Only one a day, even by the button.
    let page = await ann.get('/picks');
    assert.match(page.text, new RegExp(`action="/picks/${first}/streak"><input type="hidden" name="_csrf"[^>]*><input type="hidden" name="on" value="0">`));
    assert.doesNotMatch(page.text, new RegExp(`/picks/${second}/streak`));
    let res = await ann.post(`/picks/${second}/streak`, { on: '1' });
    assert.match(visible((await ann.get(res.location)).text), /You already have a Streak pick for that day/);

    // Take it off the first, put it on the second.
    await ann.post(`/picks/${first}/streak`, { on: '0' });
    await ann.post(`/picks/${second}/streak`, { on: '1' });
    assert.deepEqual(streakDays(), ['nfl:2 20261025']);

    // Delete the pick before the start: the flag goes too, and the day is open again.
    await ann.post(`/picks/${second}/delete`);
    assert.deepEqual(streakDays(), []);
    assert.match((await ann.get('/pick?game=nfl:2&market=total&side=over')).text, /name="streak"/);
    await ann.post(`/picks/${first}/streak`, { on: '1' });
    assert.deepEqual(streakDays(), ['nfl:1 20261025']);

    // After the start nothing changes.
    time.set('2026-10-25T17:01:00.000Z');
    page = await ann.get('/picks');
    assert.doesNotMatch(page.text, new RegExp(`/picks/${first}/streak`));
    res = await ann.post(`/picks/${first}/streak`, { on: '0' });
    assert.match(visible((await ann.get(res.location)).text), /That game has started, so its Streak pick can't change/);
    await ann.post(`/picks/${first}/delete`);
    assert.deepEqual(streakDays(), ['nfl:1 20261025']);
  });

  test('the streak page and the profile', async () => {
    const ann = await player('ann@example.com', 'Ann');
    let page = visible((await ann.get('/streak')).text);
    assert.match(page, /0 Current streak 0 Best streak/);
    assert.match(page, /No Streak pick today yet/);
    assert.match((await ann.get('/streak')).text, /href="\/games">Make today's Streak pick/);
    assert.doesNotMatch(visible((await ann.get('/u/Ann')).text), /Streak:/, 'nothing to show before the first one');

    // Four wins in a row, a loss, then two more: 2 now, 4 at best.
    const id = userId('Ann');
    const results = ['win', 'win', 'win', 'win', 'loss', 'win', 'win'];
    results.forEach((result, i) => addBet(app.store, { userId: id, start: `2026-10-${String(15 + i).padStart(2, '0')}T23:00:00.000Z`, result, streak: true }));
    await ann.post('/picks', pick('nfl:1', { streak: 'on' }));

    page = visible((await ann.get('/streak')).text);
    assert.match(page, /2 Current streak 4 Best streak/);
    assert.match(page, /Today's Streak pick Streak Bills \+3\.5/);
    assert.match(page, /Longest streaks now # Player Streak 1 Ann 2/);
    assert.match(page, /Best streaks ever # Player Best 1 Ann 4/);
    assert.match(visible((await app.browser().get('/u/Ann')).text), /Streak: 2 · Best: 4/);
    assert.match((await ann.get('/more')).text, /href="\/streak"/);

    // The game goes final with a Bills cover: 3 in a row.
    setFinal(games[1], 24, 23);
    time.set('2026-10-25T21:00:00.000Z');
    await app.games.checkFinals();
    assert.match(visible((await ann.get('/u/Ann')).text), /Streak: 3 · Best: 4/);
  });
});
