import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { closeDueWeeks, standings, timeLeft, weekBounds } from '../src/contest.js';
import { ensureOfficial } from '../src/official.js';
import { mondayOf, weekLabel } from '../src/time.js';
import { addBet, addParlay, addPlayer, clock, startApp, visible } from './helpers.js';

// The week of Monday Nov 2 to Sunday Nov 8, 2026 (Eastern standard time, UTC-5).
const WEEK = '20261102';
const MONDAY_START = '2026-11-02T05:00:00.000Z'; // Mon 12:00 AM ET
const SUNDAY_LAST = '2026-11-09T04:59:00.000Z'; // Sun 11:59 PM ET
const NEXT_MONDAY = '2026-11-09T05:00:00.000Z'; // the next Mon 12:00 AM ET
const WEDNESDAY = '2026-11-04T23:00:00.000Z';
const SUNDAY_NIGHT = '2026-11-09T03:00:00.000Z'; // Sun 10:00 PM ET
const MONDAY_MORNING = '2026-11-09T15:00:00.000Z'; // Mon 10:00 AM ET
const TUESDAY_559 = '2026-11-10T10:59:00.000Z';
const TUESDAY_6 = '2026-11-10T11:00:00.000Z';

let time;
let app;

beforeEach(async () => {
  time = clock(SUNDAY_NIGHT);
  app = await startApp({ time });
});

afterEach(() => app.close());

const id = (name) => app.store.get('SELECT id FROM users WHERE screen_name = ?', name).id;
const names = (rows) => rows.map((r) => `${r.rank ?? '-'} ${r.screen_name}`);

/** `n` winning bets for a player at `start`, each paying `each` units on `risk` units. */
function wins(userId, n, { start = WEDNESDAY, each = 1, risk = 1 } = {}) {
  for (let i = 0; i < n; i++) addBet(app.store, { userId, start, units: risk, profit: each });
}

describe('weekly contest', () => {
  test('a week runs Monday 12:00 AM to Sunday 11:59 PM Eastern', () => {
    assert.equal(mondayOf(new Date(SUNDAY_LAST)), WEEK);
    assert.equal(mondayOf(new Date(NEXT_MONDAY)), '20261109');
    assert.equal(mondayOf(new Date(MONDAY_START)), WEEK);
    assert.equal(mondayOf(new Date('2026-11-02T04:59:00.000Z')), '20261026', 'Sunday 11:59 PM belongs to the week before');
    const { start, end, deadline } = weekBounds(WEEK);
    assert.equal(start.toISOString(), MONDAY_START);
    assert.equal(end.toISOString(), NEXT_MONDAY);
    assert.equal(deadline.toISOString(), TUESDAY_6);
    assert.equal(weekLabel(WEEK), 'Nov 2 – 8');
    assert.equal(weekLabel('20261026'), 'Oct 26 – Nov 1');
    assert.equal(timeLeft(new Date(SUNDAY_NIGHT), new Date(NEXT_MONDAY)), '2 hours, 0 minutes left');
  });

  test('counts graded bets whose games started that week, parlays included', () => {
    const ann = addPlayer(app.store, 'Ann');
    wins(ann, 3);
    addBet(app.store, { userId: ann, start: MONDAY_START, profit: 1 });
    addBet(app.store, { userId: ann, start: SUNDAY_LAST, profit: 2 });
    addParlay(app.store, { userId: ann, start: WEDNESDAY, units: 1, profit: 2.64 });
    // Outside the week, either side, and not graded: none of it counts.
    addBet(app.store, { userId: ann, start: NEXT_MONDAY, profit: 5 });
    addBet(app.store, { userId: ann, start: '2026-11-02T04:59:00.000Z', profit: 5 });
    addBet(app.store, { userId: ann, start: WEDNESDAY, result: null });
    addBet(app.store, { userId: ann, start: WEDNESDAY, result: 'void' });
    const [row] = standings(app.store, WEEK);
    assert.equal(row.screen_name, 'Ann');
    assert.equal(row.graded, 6);
    assert.equal(row.units, 8.64);
    assert.equal(row.rank, 1);
  });

  test('5 graded bets to place, ties by ROI and then who got there first, the official account never places', () => {
    const official = ensureOfficial(app.store, time.now());
    wins(official, 6, { each: 3 });
    const bob = addPlayer(app.store, 'Bob');
    const cal = addPlayer(app.store, 'Cal');
    const dee = addPlayer(app.store, 'Dee');
    const eve = addPlayer(app.store, 'Eve');
    const fay = addPlayer(app.store, 'Fay');
    // Bob and Cal both win 5u; Bob risked less, so his ROI is better.
    wins(bob, 5, { risk: 1 });
    wins(cal, 5, { risk: 2 });
    // Dee and Eve match on units and ROI; Dee's last bet started first.
    wins(dee, 4, { start: '2026-11-03T23:00:00.000Z', each: 0.5 });
    wins(eve, 4, { start: '2026-11-03T23:00:00.000Z', each: 0.5 });
    addBet(app.store, { userId: dee, start: '2026-11-05T23:00:00.000Z', result: 'loss', units: 1 });
    addBet(app.store, { userId: eve, start: '2026-11-06T23:00:00.000Z', result: 'loss', units: 1 });
    // Fay is way up but has only 4 graded bets.
    wins(fay, 4, { each: 4 });

    assert.deepEqual(names(standings(app.store, WEEK)), ['- BookieBullies', '1 Bob', '2 Cal', '3 Dee', '4 Eve', '- Fay']);
  });

  test('the contest page: standings, your row, the clock, last week', async () => {
    const ann = app.browser();
    await ann.join('ann@example.com', 'Ann');
    wins(id('Ann'), 3);
    const bob = addPlayer(app.store, 'Bob');
    wins(bob, 6);

    const page = await ann.get('/contest');
    assert.equal(page.status, 200);
    const text = visible(page.text);
    assert.match(text, /This week's contest/);
    assert.match(text, /Nov 2 – 8 Ends Sunday at midnight ET 2 hours, 0 minutes left/);
    assert.match(text, /You 3-0 · 2 more graded bets to place/);
    assert.match(page.text, /<tr class="me">[\s\S]*?Ann/);
    assert.match(text, /Last week closes once every bet in it is graded, by Tuesday 6 AM ET/);
    assert.match(page.text, /href="\/winners"/);
    assert.match((await app.browser().get('/contest')).text, /Bob/, 'public, like the leaderboard');

    // Linked from the leaderboard and from More.
    assert.match((await ann.get('/leaderboard')).text, /href="\/contest"[^>]*>[\s\S]*?This week's contest/);
    assert.match((await ann.get('/more')).text, /href="\/contest"/);
  });

  test('closes once every bet is graded, records the top 3 exactly once, and tells them', async () => {
    const ann = addPlayer(app.store, 'Ann');
    const bob = addPlayer(app.store, 'Bob');
    const cal = addPlayer(app.store, 'Cal');
    const dee = addPlayer(app.store, 'Dee');
    wins(ann, 5, { each: 2.48 });
    wins(bob, 5, { each: 2 });
    wins(cal, 5, { each: 1 });
    wins(dee, 5, { each: 0.5 });
    const open = addBet(app.store, { userId: dee, start: SUNDAY_LAST, result: null });

    // Not over yet (the first run starts from the week before, which had nobody), then over but a bet is still out.
    assert.deepEqual(closeDueWeeks(app.store, time.now(), app.notifier).map((c) => c.week), ['20261026']);
    time.set(MONDAY_MORNING);
    assert.deepEqual(closeDueWeeks(app.store, time.now(), app.notifier), []);
    assert.equal(app.store.get('SELECT COUNT(*) AS n FROM contest_results').n, 0);

    // The last bet is graded: it closes.
    app.store.run("UPDATE picks SET result = 'win', profit = 0.91 WHERE id = ?", open);
    const closed = closeDueWeeks(app.store, time.now(), app.notifier);
    assert.equal(closed.length, 1);
    assert.equal(closed[0].week, WEEK);
    const rows = app.store.all('SELECT place, user_id, units, record FROM contest_results WHERE week = ? ORDER BY place', WEEK);
    assert.deepEqual(rows.map((r) => ({ ...r })), [
      { place: 1, user_id: ann, units: 12.4, record: '5-0' },
      { place: 2, user_id: bob, units: 10, record: '5-0' },
      { place: 3, user_id: cal, units: 5, record: '5-0' },
    ]);
    const note = (userId) => app.store.all("SELECT text, url FROM notifications WHERE user_id = ? AND kind = 'contest'", userId);
    assert.deepEqual(note(ann).map((n) => n.text), ["You finished #1 in last week's contest (+12.4u)."]);
    assert.equal(note(ann)[0].url, '/winners');
    assert.deepEqual(note(cal).map((n) => n.text), ["You finished #3 in last week's contest (+5u)."]);
    assert.deepEqual(note(dee), []);

    // Run it again, later, after a late change: nothing moves, nobody hears twice.
    wins(dee, 5, { each: 9 });
    time.set(TUESDAY_6);
    assert.deepEqual(closeDueWeeks(app.store, time.now(), app.notifier), []);
    assert.equal(app.store.get('SELECT COUNT(*) AS n FROM contest_results').n, 3);
    assert.equal(app.store.get("SELECT COUNT(*) AS n FROM notifications WHERE kind = 'contest'").n, 3);

    // The winner's badges: Weekly winner (with the week) and Podium.
    const badges = app.store.all('SELECT key, ref, detail FROM badges WHERE user_id = ? AND key IN (?, ?) ORDER BY key', ann, 'podium', 'weekly_winner');
    assert.deepEqual(badges.map((b) => ({ ...b })), [
      { key: 'podium', ref: '', detail: '#1, Nov 2 – 8' },
      { key: 'weekly_winner', ref: WEEK, detail: 'Nov 2 – 8' },
    ]);
    assert.equal(app.store.get("SELECT COUNT(*) AS n FROM badges WHERE user_id = ? AND key = 'weekly_winner'", bob).n, 0);
  });

  test('closes by Tuesday 6 AM ET at the latest, leaving out what was never graded', () => {
    const ann = addPlayer(app.store, 'Ann');
    const bob = addPlayer(app.store, 'Bob');
    wins(ann, 5);
    wins(bob, 4);
    addBet(app.store, { userId: bob, start: SUNDAY_LAST, result: null, units: 5 });
    time.set(TUESDAY_559);
    assert.deepEqual(closeDueWeeks(app.store, time.now(), app.notifier), []);
    time.set(TUESDAY_6);
    const [closed] = closeDueWeeks(app.store, time.now(), app.notifier);
    assert.deepEqual(closed.podium.map((r) => r.screen_name), ['Ann'], 'Bob had 4 graded bets: not enough');
    assert.deepEqual(closeDueWeeks(app.store, time.now(), app.notifier), []);
  });

  test('the winners wall: every closed week, newest first, with an all-time count', async () => {
    const ann = addPlayer(app.store, 'Ann');
    const bob = addPlayer(app.store, 'Bob');
    // Week one: Ann wins. Week two: Ann again. Then a week where nobody places.
    wins(ann, 5, { start: '2026-11-04T23:00:00.000Z', each: 2 });
    wins(bob, 5, { start: '2026-11-04T23:00:00.000Z', each: 1 });
    wins(ann, 5, { start: '2026-11-11T23:00:00.000Z', each: 2 });
    wins(bob, 5, { start: '2026-11-11T23:00:00.000Z', each: 3 });
    addBet(app.store, { userId: ann, start: '2026-11-18T23:00:00.000Z' });
    time.set(MONDAY_MORNING);
    closeDueWeeks(app.store, time.now(), app.notifier);
    time.set('2026-11-16T15:00:00.000Z');
    closeDueWeeks(app.store, time.now(), app.notifier);
    time.set('2026-11-23T15:00:00.000Z');
    closeDueWeeks(app.store, time.now(), app.notifier);

    const page = await app.browser().get('/winners');
    assert.equal(page.status, 200);
    const text = visible(page.text);
    assert.match(text, /Most weekly wins Bob · 1 win Ann · 1 win|Most weekly wins Ann · 1 win Bob · 1 win/);
    assert.match(text, /Nov 16 – 22 Nobody had enough graded bets to place\. Nov 9 – 15 #1 Bob 5-0 \+15u #2 Ann 5-0 \+10u Nov 2 – 8 #1 Ann 5-0 \+10u #2 Bob 5-0 \+5u/);
    assert.match((await app.browser().get('/contest')).text, /Last week's top 3/);
  });
});
