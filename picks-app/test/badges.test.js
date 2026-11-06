import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { BADGES, checkAllBadges, checkBadges, topBadges } from '../src/badges.js';
import { ensureOfficial } from '../src/official.js';
import { addBet, addParlay, addPlayer, clock, event, setFinal, startApp, visible } from './helpers.js';

const MORNING = '2026-10-25T12:00:00.000Z';
const KICKOFF = '2026-10-25T17:00:00.000Z';

let time;
let app;

beforeEach(async () => {
  time = clock(MORNING);
  app = await startApp({ time });
});

afterEach(() => app.close());

const keys = (userId) => app.store.all('SELECT key FROM badges WHERE user_id = ? ORDER BY key', userId).map((r) => r.key);
const notes = (userId) => app.store.all("SELECT text FROM notifications WHERE user_id = ? AND kind = 'badge' ORDER BY id", userId).map((r) => r.text);
const check = (...ids) => checkBadges(app.store, ids, time.now(), app.notifier);

/** `n` graded bets for a player, oldest first, on Oct 1 onward. */
function bets(userId, n, result = 'loss', from = 0) {
  for (let i = 0; i < n; i++) {
    addBet(app.store, { userId, start: new Date(Date.parse('2026-10-01T00:00:00.000Z') + (from + i) * 3_600_000).toISOString(), result });
  }
}

describe('badges', () => {
  test('keys stay put', () => {
    assert.deepEqual(BADGES.map((b) => b.key), [
      'cup_champion', 'weekly_winner', 'tournament_champion', 'survivor_champion', 'streak_10', 'hot_hand', 'cup_podium', 'podium',
      'tournament_podium', 'pickem_winner', 'streak_5', 'parlay_hitter', 'bets_500', 'recruiter', 'bets_100', 'bets_50', 'first_win',
    ]);
  });

  test('first win and bet counts, each awarded once, with one note', () => {
    const ann = addPlayer(app.store, 'Ann');
    bets(ann, 49);
    check(ann);
    assert.deepEqual(keys(ann), []);
    bets(ann, 1, 'win', 49);
    check(ann);
    assert.deepEqual(keys(ann), ['bets_50', 'first_win']);
    assert.deepEqual(notes(ann), ['New badges: 50 bets and First win.']);
    check(ann);
    checkAllBadges(app.store, time.now(), app.notifier);
    assert.equal(app.store.get('SELECT COUNT(*) AS n FROM badges WHERE user_id = ?', ann).n, 2, 'never twice');
    assert.equal(notes(ann).length, 1);

    bets(ann, 50, 'loss', 50);
    check(ann);
    assert.deepEqual(notes(ann).at(-1), 'New badge: 100 bets.');
    bets(ann, 400, 'push', 100);
    check(ann);
    assert.deepEqual(keys(ann), ['bets_100', 'bets_50', 'bets_500', 'first_win']);
    assert.equal(app.store.get("SELECT earned_at FROM badges WHERE user_id = ? AND key = 'bets_50'", ann).earned_at, MORNING);
  });

  test('hot hand: 8 of the last 10', () => {
    const ann = addPlayer(app.store, 'Ann');
    bets(ann, 3, 'loss');
    bets(ann, 7, 'win', 3);
    check(ann);
    assert.ok(!keys(ann).includes('hot_hand'), '7 of 10');
    bets(ann, 1, 'win', 10);
    check(ann);
    assert.ok(keys(ann).includes('hot_hand'), '8 of the last 10');
    assert.equal(app.store.get("SELECT detail FROM badges WHERE key = 'hot_hand'").detail, '8-2 last 10');
    assert.equal(notes(ann).at(-1), 'New badge: Hot hand.');
    bets(ann, 5, 'loss', 11);
    check(ann);
    assert.ok(keys(ann).includes('hot_hand'), 'kept once earned');
  });

  test('streak 5 and streak 10 from the streak game', () => {
    const ann = addPlayer(app.store, 'Ann');
    for (let i = 0; i < 10; i++) {
      addBet(app.store, { userId: ann, start: `2026-10-${String(10 + i).padStart(2, '0')}T23:00:00.000Z`, streak: true });
      check(ann);
      assert.equal(keys(ann).includes('streak_5'), i >= 4, `after ${i + 1}`);
      assert.equal(keys(ann).includes('streak_10'), i >= 9, `after ${i + 1}`);
    }
  });

  test('parlay hitter: a winning parlay of 4 legs or more', () => {
    const ann = addPlayer(app.store, 'Ann');
    addParlay(app.store, { userId: ann, start: KICKOFF, legs: 3 });
    addParlay(app.store, { userId: ann, start: KICKOFF, legs: 5, result: 'loss' });
    check(ann);
    assert.ok(!keys(ann).includes('parlay_hitter'));
    addParlay(app.store, { userId: ann, start: KICKOFF, legs: 4 });
    check(ann);
    assert.ok(keys(ann).includes('parlay_hitter'));
  });

  test('the official account earns none', () => {
    const official = ensureOfficial(app.store, time.now());
    bets(official, 60, 'win');
    assert.deepEqual(checkAllBadges(app.store, time.now(), app.notifier), []);
    assert.deepEqual(keys(official), []);
    assert.equal(app.store.get('SELECT COUNT(*) AS n FROM notifications').n, 0);
  });

  test('awarded right after grading', async () => {
    app.espn.events.nfl.push(event({ id: '1', start: KICKOFF }));
    const ann = app.browser();
    await ann.join('ann@example.com', 'Ann');
    const id = app.store.get("SELECT id FROM users WHERE screen_name = 'Ann'").id;
    bets(id, 2, 'loss');
    bets(id, 7, 'win', 2);
    check(id);
    assert.ok(!keys(id).includes('hot_hand'));
    await ann.get('/games');
    await ann.post('/picks', { game: 'nfl:1', market: 'spread', side: 'away', line: '3.5', odds: '-110', units: '1' });
    setFinal(app.espn.events.nfl[0], 20, 24);
    time.set('2026-10-25T21:00:00.000Z');
    await app.games.checkFinals();
    assert.ok(keys(id).includes('hot_hand'), 'the 8th win of 10, graded');
    assert.match(visible((await ann.get('/notifications')).text), /New badge: Hot hand\./);
  });

  test('chips on the profile, one badge on a leaderboard row', async () => {
    const ann = addPlayer(app.store, 'Ann');
    const bob = addPlayer(app.store, 'Bob');
    bets(ann, 2, 'loss');
    bets(ann, 8, 'win', 2);
    bets(bob, 5, 'win');
    check(ann, bob);
    assert.equal(topBadges(app.store, [ann, bob]).get(ann).key, 'hot_hand', 'Hot hand beats First win');
    assert.equal(topBadges(app.store, [ann, bob]).get(bob), undefined, 'First win alone shows nothing on a board');

    const board = await app.browser().get('/leaderboard');
    const annRow = /<tr class="">(?:(?!<\/tr>)[\s\S])*?Ann(?:(?!<\/tr>)[\s\S])*?<\/tr>/.exec(board.text)[0];
    assert.equal((annRow.match(/class="badge-mark"/g) ?? []).length, 1);
    assert.match(annRow, /title="Hot hand: Won 8 or more of their last 10 bets"/);

    const profile = await app.browser().get('/u/Ann');
    assert.match(profile.text, /<h2 id="badges">Badges<\/h2>/);
    assert.match(profile.text, /class="badge-chip" title="Hot hand: Won 8 or more of their last 10 bets\. Earned Oct 25, 2026 \(8-2 last 10\)\."/);
    assert.match(visible(profile.text), /Hot hand First win/);
  });
});
