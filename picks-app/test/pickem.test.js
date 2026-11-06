import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { closePickemWeeks, gradePickem, pickemWeek, picksOf, pointsFor, savePickem, seasonStandings, weekStandings } from '../src/pickem.js';
import { SPORT } from '../src/sports.js';
import { etToUtc } from '../src/time.js';
import { addPlayer, clock, event, setFinal, setLine, startApp, visible } from './helpers.js';

// Week 9 of 2026: Tue Nov 3 to Mon Nov 9 (Eastern). Six games, home favored by 3.5 unless set.
const et = (day, hour, minute = 0) => etToUtc(day, hour, minute).toISOString();
const TEAMS = [['Chiefs', 'KC'], ['Bills', 'BUF'], ['Eagles', 'PHI'], ['Cowboys', 'DAL'], ['Lions', 'DET'], ['Packers', 'GB'],
  ['49ers', 'SF'], ['Rams', 'LAR'], ['Ravens', 'BAL'], ['Bengals', 'CIN'], ['Jets', 'NYJ'], ['Dolphins', 'MIA']];
const STARTS = [et('20261105', 20, 15), et('20261108', 13), et('20261108', 13), et('20261108', 16, 25), et('20261108', 20, 20), et('20261109', 20, 15)];

let time;
let app;
let events;

beforeEach(async () => {
  time = clock(et('20261103', 12));
  app = await startApp({ time });
  events = STARTS.map((start, i) => event({ id: String(800 + i), start, home: TEAMS[2 * i], away: TEAMS[2 * i + 1], spread: -3.5 }));
  app.espn.events.nfl.push(...events);
  await load();
});

afterEach(() => app.close());

async function load() {
  app.games.save(await app.espn.scoreboard(SPORT.nfl, '20261101', '20261112'));
}

const id = (i) => `nfl:${800 + i}`;
const week = () => pickemWeek(app.store, time.now());
const save = (userId, picks, best = null) => savePickem(app.store, { userId, week: week(), picks: picks.map(([i, side]) => ({ game: id(i), side })), best: best == null ? null : id(best), now: time.now() });

/** Finals for every game: `margins[i]` is the home team's margin. */
async function finals(margins) {
  margins.forEach((m, i) => setFinal(events[i], 20 + Math.max(0, m), 20 + Math.max(0, -m)));
  time.set(et('20261110', 9));
  await load();
  gradePickem(app.store, time.now());
}

describe("NFL Pick'em", () => {
  test('scoring: a win is 1, a push a half, the Best Bet doubles its own points', async () => {
    assert.deepEqual(['win', 'push', 'loss', 'void'].map((r) => pointsFor(r)), [1, 0.5, 0, 0]);
    assert.deepEqual(['win', 'push', 'loss'].map((r) => pointsFor(r, true)), [2, 1, 0]);
    const ann = addPlayer(app.store, 'Ann');
    // Home -3.5 everywhere, but game 1 moves to -3 before Ann picks it, so a 3-point win is a push.
    setLine(events[1], { spread: -3 });
    await load();
    save(ann, [[0, 'home'], [1, 'home'], [2, 'away'], [3, 'home'], [4, 'home'], [5, 'away']], 1);
    await finals([7, 3, 10, 1, 4, -14]);
    const mine = picksOf(app.store, ann, 2026, 9);
    assert.deepEqual([0, 1, 2, 3, 4, 5].map((i) => [mine.get(id(i)).result, mine.get(id(i)).points]), [
      ['win', 1], ['push', 1], ['loss', 0], ['loss', 0], ['win', 1], ['win', 1],
    ]);
    const [row] = weekStandings(app.store, 2026, 9);
    assert.deepEqual([row.points, row.wins, row.losses, row.pushes, row.rank], [4, 3, 2, 1, 1]);
  });

  test('the line is the one on the board when the pick is saved; changing sides before kickoff takes the new one', async () => {
    const ann = addPlayer(app.store, 'Ann');
    save(ann, [[2, 'home']]);
    setLine(events[2], { spread: -6.5 });
    await load();
    save(ann, [[2, 'home']]);
    assert.equal(picksOf(app.store, ann, 2026, 9).get(id(2)).line, -3.5, 'saving the same side keeps its line');
    save(ann, [[2, 'away']]);
    assert.deepEqual([picksOf(app.store, ann, 2026, 9).get(id(2)).side, picksOf(app.store, ann, 2026, 9).get(id(2)).line], ['away', 6.5]);
    // It's its own table: no bet, no record.
    assert.equal(app.store.get('SELECT COUNT(*) AS n FROM picks WHERE user_id = ?', ann).n, 0);
  });

  test('each game locks at its kickoff, and so does the Best Bet on it', async () => {
    const ann = addPlayer(app.store, 'Ann');
    save(ann, [[0, 'home'], [1, 'home']], 0);
    time.set(et('20261105', 20, 16));
    let result = save(ann, [[0, 'away'], [1, 'away']], 1);
    assert.deepEqual(result.notes, ["Bills @ Chiefs has started, so that pick stays.", "Your Best Bet's game has started, so it stays."]);
    let mine = picksOf(app.store, ann, 2026, 9);
    assert.deepEqual([mine.get(id(0)).side, mine.get(id(0)).best, mine.get(id(1)).side], ['home', 1, 'away']);
    // A Best Bet can't go onto a game that's started either.
    const bob = addPlayer(app.store, 'Bob');
    save(bob, [[2, 'home']]);
    result = save(bob, [], 0);
    assert.match(result.notes[0], /Pick a side/);
    time.set(et('20261108', 13, 1));
    result = save(bob, [], 2);
    assert.match(result.notes[0], /has started, so it can't be your Best Bet/);
    mine = picksOf(app.store, bob, 2026, 9);
    assert.equal(mine.get(id(2)).best, 0);
  });

  test('the page saves without JavaScript, shows the spreads, and the week and season standings', async () => {
    const ann = app.browser();
    await ann.join('ann@example.com', 'Ann');
    let page = (await ann.get('/pickem/nfl')).text;
    assert.match(page, /<input type="radio" name="pick_nfl:800" value="home"/);
    assert.match(visible(page), /Chiefs −3\.5 .* Bills \+3\.5|Bills \+3\.5 .* Chiefs −3\.5/);
    const form = { week: '9', best: id(3) };
    for (let i = 0; i < 6; i++) form[`pick_${id(i)}`] = 'home';
    const res = await ann.post('/pickem/nfl', form);
    assert.equal(res.location, '/pickem/nfl#games');
    const annId = app.store.get("SELECT id FROM users WHERE screen_name = 'Ann'").id;
    assert.equal(picksOf(app.store, annId, 2026, 9).size, 6);
    assert.match(visible((await ann.get('/tournaments')).text), /NFL Pick'em · Week 9 Free NFL Pick'em .* 6 of 6 Picked/);
    page = (await ann.get('/pickem/nfl')).text;
    assert.match(page, new RegExp(`name="best" value="${id(3)}" checked`));
    await finals([7, 7, 7, 7, -7, 7]);
    page = visible((await ann.get('/pickem/nfl')).text);
    assert.match(page, /Week 9 standings # Player Record Pts 1 A Ann 5-1 6 pts/);
    assert.match(page, /Season standings # Player Wks won Pts 1 A Ann 0 6 pts/);
    assert.match(page, /Wk 9 Wk 10/);
    // Anyone can look; the hub links it.
    assert.equal((await app.browser().get('/pickem/nfl')).status, 200);
  });

  test('a week closes once: the top 3 written and told, a Pick\'em winner badge, Cup points', async () => {
    const [ann, bob, cy] = ['Ann', 'Bob', 'Cy'].map((n) => addPlayer(app.store, n));
    save(ann, [0, 1, 2, 3, 4, 5].map((i) => [i, 'home']), 0);
    save(bob, [0, 1, 2, 3, 4, 5].map((i) => [i, i < 4 ? 'home' : 'away']));
    save(cy, [[0, 'home'], [1, 'home']]);
    await finals([7, 7, 7, 7, -7, -7]);
    assert.deepEqual(weekStandings(app.store, 2026, 9).map((r) => `${r.rank ?? '-'} ${r.screen_name} ${r.points}`), ['1 Bob 6', '2 Ann 5', '- Cy 2']);
    const closed = closePickemWeeks(app.store, time.now(), app.notifier);
    assert.equal(closed.length, 1);
    assert.deepEqual(closePickemWeeks(app.store, time.now(), app.notifier), [], 'once');
    assert.deepEqual(app.store.all('SELECT place, user_id, points, record FROM pickem_results ORDER BY place').map((r) => ({ ...r })), [
      { place: 1, user_id: bob, points: 6, record: '6-0' }, { place: 2, user_id: ann, points: 5, record: '4-2' },
    ]);
    assert.ok(app.store.get("SELECT 1 AS x FROM badges WHERE user_id = ? AND key = 'pickem_winner' AND ref = 'pickem-2026-w9'", bob));
    assert.equal(app.store.get("SELECT COUNT(*) AS n FROM badges WHERE key = 'pickem_winner'").n, 1);
    assert.equal(app.store.get("SELECT text FROM notifications WHERE user_id = ? AND kind = 'pickem'", bob).text, "You won NFL Pick'em for Week 9 (6 pts).");
    assert.deepEqual(app.store.all("SELECT user_id, place, points FROM cup_points WHERE source = 'pickem' ORDER BY place").map((r) => ({ ...r })), [
      { user_id: bob, place: 1, points: 26 }, { user_id: ann, place: 2, points: 19 },
    ]);
    assert.deepEqual(seasonStandings(app.store, 2026).map((r) => [r.screen_name, r.points, r.won]), [['Bob', 6, 1], ['Ann', 5, 0], ['Cy', 2, 0]]);
  });

  test("a week waits for its grades, but not past 30 hours after it", async () => {
    const ann = addPlayer(app.store, 'Ann');
    save(ann, [0, 1, 2, 3, 4, 5].map((i) => [i, 'home']));
    // Every game but the last goes final.
    [0, 1, 2, 3, 4].forEach((i) => setFinal(events[i], 27, 20));
    time.set(et('20261110', 9));
    await load();
    gradePickem(app.store, time.now());
    assert.deepEqual(closePickemWeeks(app.store, time.now()), []);
    time.set(et('20261111', 9));
    assert.equal(closePickemWeeks(app.store, time.now()).length, 1);
  });
});
