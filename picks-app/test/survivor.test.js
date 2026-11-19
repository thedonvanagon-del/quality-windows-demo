import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { parseScoreboard } from '../src/espn.js';
import { nflSeason, weekFromDate, weekOf } from '../src/nflweeks.js';
import { SPORT } from '../src/sports.js';
import {
  ensurePool, entryOf, gradeSurvivor, joinSurvivor, sendSurvivorReminders, setSurvivorPick, standings, survivorState, usedTeams,
} from '../src/survivor.js';
import { etToUtc } from '../src/time.js';
import { addPlayer, clock, event, setFinal, setStatus, startApp, visible } from './helpers.js';

// Week 9 of the 2026 season runs Tue Nov 3 to Mon Nov 9 (Eastern); week 10 from Tue Nov 10.
const et = (day, hour, minute = 0) => etToUtc(day, hour, minute).toISOString();
const TUE = et('20261103', 12);
const NEXT_TUE = et('20261110', 12);

let time;
let app;
let games;

beforeEach(async () => {
  time = clock(TUE);
  app = await startApp({ time });
  games = {
    thu: event({ id: '901', start: et('20261105', 20, 15), home: ['Chiefs', 'KC'], away: ['Bills', 'BUF'] }),
    sunA: event({ id: '902', start: et('20261108', 13), home: ['Eagles', 'PHI'], away: ['Cowboys', 'DAL'] }),
    sunB: event({ id: '903', start: et('20261108', 13), home: ['Lions', 'DET'], away: ['Packers', 'GB'] }),
    mon: event({ id: '904', start: et('20261109', 20, 15), home: ['49ers', 'SF'], away: ['Rams', 'LAR'] }),
    thu10: event({ id: '911', start: et('20261112', 20, 15), home: ['Chiefs', 'KC'], away: ['Broncos', 'DEN'] }),
    sun10: event({ id: '912', start: et('20261115', 13), home: ['Eagles', 'PHI'], away: ['Giants', 'NYG'] }),
  };
  app.espn.events.nfl.push(...Object.values(games));
  await load();
});

afterEach(() => app.close());

/** Every game from ESPN into the games table (and anything final graded). */
async function load() {
  app.games.save(await app.espn.scoreboard(SPORT.nfl, '20261101', '20261120'));
}

const state = () => survivorState(app.store, time.now());
const pool = () => ensurePool(app.store, time.now());
const game = (key) => app.games.get(`nfl:${games[key].id}`);
const pick = (userId, key, side) => setSurvivorPick(app.store, { state: state(), userId, game: game(key), side, now: time.now() });
const join = (userId) => joinSurvivor(app.store, state(), userId, time.now());
const notes = (userId) => app.store.all("SELECT text FROM notifications WHERE user_id = ? AND kind = 'survivor' ORDER BY id", userId).map((r) => r.text);

/** Finals for week 9, then grade. `scores` maps a game to [home, away]; `postponed` voids games. */
async function finishWeek9(scores, { postponed = [] } = {}) {
  for (const [key, [h, a]] of Object.entries(scores)) setFinal(games[key], h, a);
  for (const key of postponed) setStatus(games[key], 'post', 'STATUS_POSTPONED');
  time.set(NEXT_TUE);
  await load();
  return gradeSurvivor(app.store, time.now(), app.notifier);
}

describe('NFL weeks', () => {
  test("ESPN's week when it sends one, Tuesday-to-Monday windows when it doesn't, regular season only", () => {
    const e = event({ id: '1', start: et('20261108', 13) });
    e.week = { number: 10 };
    e.season = { year: 2026, type: 2 };
    const [g] = parseScoreboard(SPORT.nfl, { events: [e] });
    assert.deepEqual([g.season, g.seasonType, g.week], [2026, 2, 10]);
    assert.deepEqual(weekOf(g), { season: 2026, week: 10 });
    // The scoreboard's own week, when the event has none.
    const bare = event({ id: '2', start: et('20261108', 13) });
    assert.equal(parseScoreboard(SPORT.nfl, { events: [bare], week: { number: 9 }, season: { year: 2026, type: 2 } })[0].week, 9);
    // Playoffs and preseason aren't Survivor weeks.
    assert.equal(weekOf({ ...g, seasonType: 3 }), null);
    assert.equal(weekOf({ ...g, seasonType: 1 }), null);
    // From the date: week 1 starts the Tuesday after Labor Day (Sep 7, 2026).
    assert.deepEqual(weekFromDate(et('20260910', 20, 20)), { season: 2026, week: 1 });
    assert.deepEqual(weekFromDate(et('20261109', 20, 15)), { season: 2026, week: 9 });
    assert.deepEqual(weekFromDate(et('20261110', 9)), { season: 2026, week: 10 });
    assert.deepEqual(weekFromDate(et('20270110', 13)), { season: 2026, week: 18 });
    assert.equal(weekFromDate(et('20270117', 13)), null);
    assert.equal(weekFromDate(et('20260820', 19)), null);
  });

  test('the current week runs until a few hours after its last game, then the next one is up', () => {
    assert.equal(nflSeason(app.store, time.now()).current.week, 9);
    time.set(et('20261110', 0, 10));
    assert.equal(nflSeason(app.store, time.now()).current.week, 9);
    time.set(et('20261110', 1, 30));
    assert.equal(nflSeason(app.store, time.now()).current.week, 10);
  });
});

describe('Survivor: joining and picking', () => {
  test('one free pool per season, made on its own; join while the week has not started; a late joiner starts that week', async () => {
    const p = pool();
    assert.equal(p.name, 'Survivor 2026');
    assert.equal(pool().id, p.id, 'made once');
    const ann = addPlayer(app.store, 'Ann');
    const bob = addPlayer(app.store, 'Bob');
    assert.deepEqual(join(ann), { ok: true, joined: true, week: 9 });
    assert.equal(entryOf(app.store, p, ann).start_week, 9);
    // Thursday's kickoff closes the door for the week.
    time.set(et('20261105', 20, 15));
    assert.match(join(bob).error, /Week 9 has started/);
    // Next week it's open again, from week 10.
    time.set(NEXT_TUE);
    assert.ok(join(bob).joined);
    assert.equal(entryOf(app.store, p, bob).start_week, 10);
    // The official account doesn't play.
    const bb = addPlayer(app.store, 'BB', { official: true });
    assert.match(join(bb).error, /official/);
  });

  test('picking on the page: switch until kickoff, locked after, used teams turned away', async () => {
    pool();
    const ann = app.browser();
    await ann.join('ann@example.com', 'Ann');
    await ann.get('/survivor');
    let res = await ann.post('/survivor/join');
    assert.equal(res.location, '/survivor#week');
    let page = visible((await ann.get('/survivor')).text);
    assert.match(page, /Alive, Week 9/);
    assert.match(page, /Week 9 games/);

    res = await ann.post('/survivor/pick', { game: 'nfl:902', side: 'home' });
    assert.match(decodeURIComponent((await ann.get('/survivor')).text), /Eagles is your Week 9 Survivor pick|Your pick/);
    await ann.post('/survivor/pick', { game: 'nfl:903', side: 'home' });
    const annId = app.store.get("SELECT id FROM users WHERE screen_name = 'Ann'").id;
    assert.equal(app.store.get('SELECT team FROM survivor_picks WHERE user_id = ?', annId).team, 'DET');
    // Thursday's game has started: it can't be picked.
    time.set(et('20261106', 9));
    assert.match(pick(annId, 'thu', 'home').error, /kicked off/);
    // Once the Lions kick off, the pick is locked.
    time.set(et('20261108', 13, 1));
    assert.match(pick(annId, 'mon', 'home').error, /Your Week 9 pick, Lions, has kicked off/);
    page = (await ann.get('/survivor')).text;
    assert.doesNotMatch(page, /name="game" value="nfl:902"/, 'started games have no buttons');

    // Week 10: the Lions are used. (The Eagles weren't: switching away freed them.)
    await finishWeek9({ thu: [24, 20], sunA: [20, 17], sunB: [27, 10], mon: [21, 14] });
    assert.deepEqual([...usedTeams(app.store, pool(), annId)], [['DET', 9]]);
    assert.ok(pick(annId, 'sun10', 'home').ok, 'the Eagles were never used');
    assert.match(page, /Used Wk|Locked/);
  });

  test('the pick slip offers the Survivor pick, switches it, and shows a used team turned off', async () => {
    pool();
    const ann = app.browser();
    await ann.join('ann@example.com', 'Ann');
    const annId = app.store.get("SELECT id FROM users WHERE screen_name = 'Ann'").id;
    // Not in Survivor: no checkbox.
    assert.doesNotMatch((await ann.get('/pick?game=nfl:902&market=spread&side=home')).text, /Survivor/);
    assert.ok(join(annId).joined);
    let slip = visible((await ann.get('/pick?game=nfl:902&market=spread&side=home')).text);
    assert.match(slip, /Use Eagles as my Survivor pick for Week 9/);
    assert.match(slip, /Survivor only counts whether the Eagles win outright, whatever this bet is/);
    // Totals have no team.
    assert.doesNotMatch((await ann.get('/pick?game=nfl:902&market=total&side=over')).text, /Survivor pick/);

    const res = await ann.post('/picks', { game: 'nfl:902', market: 'spread', side: 'home', line: '-3.5', odds: '-110', units: '1', survivor: 'on' });
    assert.equal(res.status, 303);
    assert.equal(app.store.get('SELECT COUNT(*) AS n FROM picks WHERE user_id = ?', annId).n, 1, 'the bet went in');
    assert.equal(app.store.get('SELECT team FROM survivor_picks WHERE user_id = ?', annId).team, 'PHI', 'with the Survivor pick');

    slip = visible((await ann.get('/pick?game=nfl:903&market=ml&side=home')).text);
    assert.match(slip, /Switch my Survivor pick to Lions \(now: Eagles\)/);
    // Without the box checked, the bet goes in and the Survivor pick stays.
    await ann.post('/picks', { game: 'nfl:903', market: 'ml', side: 'home', line: '', odds: '-170', units: '1' });
    assert.equal(app.store.get('SELECT team FROM survivor_picks WHERE user_id = ?', annId).team, 'PHI');

    await finishWeek9({ thu: [24, 20], sunA: [20, 17], sunB: [27, 10], mon: [21, 14] });
    slip = visible((await ann.get('/pick?game=nfl:912&market=spread&side=home')).text);
    assert.match(slip, /Eagles: used in Week 9/);
    assert.match((await ann.get('/pick?game=nfl:912&market=spread&side=home')).text, /<input type="checkbox" disabled/);
    // A forged checkbox does nothing.
    await ann.post('/picks', { game: 'nfl:912', market: 'spread', side: 'home', line: '-3.5', odds: '-110', units: '1', survivor: 'on' });
    assert.equal(app.store.get('SELECT COUNT(*) AS n FROM survivor_picks WHERE user_id = ? AND week = 10', annId).n, 0);
  });
});

describe('Survivor: grading', () => {
  test('a loss or a tie ends a run, a postponed game voids without using the team, a missed week knocks you out', async () => {
    const p = pool();
    const [ann, bob, cy, dee, eve] = ['Ann', 'Bob', 'Cy', 'Dee', 'Eve'].map((n) => addPlayer(app.store, n));
    for (const id of [ann, bob, cy, dee, eve]) join(id);
    assert.ok(pick(ann, 'sunA', 'home').ok);
    assert.ok(pick(bob, 'sunA', 'away').ok);
    assert.ok(pick(cy, 'sunB', 'away').ok);
    assert.ok(pick(dee, 'mon', 'home').ok);
    await finishWeek9({ thu: [24, 20], sunA: [27, 17], sunB: [20, 20] }, { postponed: ['mon'] });

    const out = (id) => entryOf(app.store, p, id);
    assert.equal(out(ann).out_week, null);
    assert.deepEqual([out(bob).out_week, out(bob).out_reason], [9, 'loss']);
    assert.deepEqual([out(cy).out_week, out(cy).out_reason], [9, 'tie']);
    assert.equal(out(dee).out_week, null, 'a postponed game: survives');
    assert.equal(app.store.get('SELECT result FROM survivor_picks WHERE user_id = ?', dee).result, 'void');
    assert.equal(usedTeams(app.store, p, dee).size, 0, 'and the 49ers are not used');
    assert.deepEqual([out(eve).out_week, out(eve).out_reason], [9, 'missed']);
    assert.deepEqual(notes(bob), ['Your Survivor run ended in Week 9 (Cowboys lost).']);
    assert.deepEqual(notes(cy), ['Your Survivor run ended in Week 9 (Packers tied).']);
    assert.deepEqual(notes(eve), ['Your Survivor run ended in Week 9 (no pick).']);
    // Settling runs once.
    gradeSurvivor(app.store, time.now(), app.notifier);
    assert.equal(notes(eve).length, 1);
    assert.equal(pool().closed_at, null, 'two still alive');
    // Out means out.
    assert.match(pick(bob, 'sun10', 'home').error, /You're out/);
  });

  test("other players' picks stay hidden until each game starts", () => {
    pool();
    const ann = addPlayer(app.store, 'Ann');
    const bob = addPlayer(app.store, 'Bob');
    join(ann);
    join(bob);
    pick(bob, 'sunA', 'away');
    pick(ann, 'sunB', 'home');
    const chips = (viewer) => Object.fromEntries(standings(app.store, pool(), viewer, time.now()).players.map((r) => [r.screen_name, r.picks.map((k) => k.abbr ?? 'hidden')]));
    assert.deepEqual(chips(ann), { Ann: ['DET'], Bob: ['hidden'] });
    assert.deepEqual(chips(null), { Ann: ['hidden'], Bob: ['hidden'] });
    time.set(et('20261108', 13, 5));
    assert.deepEqual(chips(null), { Ann: ['DET'], Bob: ['DAL'] });
  });

  test('the last one standing wins: the badge, the notes and Cup points', async () => {
    const p = pool();
    const ann = addPlayer(app.store, 'Ann');
    const bob = addPlayer(app.store, 'Bob');
    join(ann);
    join(bob);
    pick(ann, 'sunA', 'home');
    pick(bob, 'sunB', 'home');
    await finishWeek9({ thu: [24, 20], sunA: [27, 17], sunB: [10, 20], mon: [21, 14] });
    const closed = pool();
    assert.ok(closed.closed_at);
    assert.equal(closed.closed_week, 9);
    assert.ok(entryOf(app.store, p, ann).won_at);
    assert.equal(entryOf(app.store, p, bob).won_at, null);
    assert.ok(app.store.get("SELECT 1 AS x FROM badges WHERE user_id = ? AND key = 'survivor_champion' AND ref = 'survivor-2026'", ann));
    assert.deepEqual(notes(ann), ['You won Survivor 2026. Last one standing.']);
    assert.deepEqual(notes(bob), ['Your Survivor run ended in Week 9 (Lions lost).', 'Survivor 2026 is over: Ann won it.']);
    assert.deepEqual(app.store.all("SELECT user_id, place, points FROM cup_points WHERE source = 'survivor' ORDER BY place").map((r) => ({ ...r })), [
      { user_id: ann, place: 1, points: 26 }, { user_id: bob, place: 2, points: 19 },
    ]);
    // Closed: no new players or picks.
    time.set(et('20261111', 9));
    assert.match(join(addPlayer(app.store, 'Cy')).error, /over/);
  });

  test('everyone left out the same week share the win', async () => {
    const p = pool();
    const ann = addPlayer(app.store, 'Ann');
    const bob = addPlayer(app.store, 'Bob');
    join(ann);
    join(bob);
    pick(ann, 'sunA', 'home');
    pick(bob, 'sunB', 'home');
    await finishWeek9({ thu: [24, 20], sunA: [10, 17], sunB: [10, 20], mon: [21, 14] });
    assert.ok(pool().closed_at);
    assert.ok(entryOf(app.store, p, ann).won_at && entryOf(app.store, p, bob).won_at);
    assert.equal(notes(ann).at(-1), 'You won Survivor 2026, shared with 1 other player.');
    assert.equal(app.store.get("SELECT COUNT(*) AS n FROM badges WHERE key = 'survivor_champion'").n, 2);
  });

  test('alive players with no pick hear once, 3 hours before the week\'s first game, with the setting on', async () => {
    pool();
    const [ann, bob, cy] = ['Ann', 'Bob', 'Cy'].map((n) => addPlayer(app.store, n));
    for (const id of [ann, bob, cy]) join(id);
    pick(bob, 'sunA', 'home');
    app.store.run('UPDATE users SET notify_tournaments = 0 WHERE id = ?', cy);
    time.set(et('20261105', 17));
    assert.equal(sendSurvivorReminders(app.store, time.now(), app.notifier), 0, 'too early');
    time.set(et('20261105', 17, 30));
    assert.equal(sendSurvivorReminders(app.store, time.now(), app.notifier), 1);
    assert.equal(sendSurvivorReminders(app.store, time.now(), app.notifier), 0, 'once a week');
    assert.deepEqual(notes(ann), ['Make your Survivor pick for Week 9. The first game starts in 3 hours.']);
    assert.deepEqual([notes(bob), notes(cy)], [[], []]);
  });
});

describe('Survivor on the hub', () => {
  test('the featured card sits on top: status, players left, the pick button and the deadline', async () => {
    const ann = app.browser();
    await ann.join('ann@example.com', 'Ann');
    let page = visible((await ann.get('/tournaments')).text);
    assert.ok(page.indexOf('Survivor 2026') < page.indexOf('Live now'), 'above everything else');
    assert.match(page, /NFL Survivor · Week 9 Free Survivor 2026 .* Not in yet You 0 of 0 Left Join by .* Join Survivor/);
    await ann.post('/survivor/join');
    const bob = addPlayer(app.store, 'Bob');
    join(bob);
    page = visible((await ann.get('/tournaments')).text);
    assert.match(page, /Alive, Week 9 You 2 of 2 Left Pick by .* Make your pick/);
    await ann.post('/survivor/pick', { game: 'nfl:902', side: 'home' });
    page = visible((await ann.get('/tournaments')).text);
    assert.match(page, /Eagles · your Week 9 pick Locks at kickoff/);
    assert.match((await ann.get('/tournaments')).text, /href="\/pickem\/nfl"/);
    assert.equal((await ann.get('/tournaments/survivor')).location, '/survivor');
  });

  test('between seasons: "Survivor returns for the NFL season" and the last winner', async () => {
    const p = pool();
    const ann = addPlayer(app.store, 'Ann');
    const bob = addPlayer(app.store, 'Bob');
    join(ann);
    join(bob);
    pick(ann, 'sunA', 'home');
    pick(bob, 'sunB', 'home');
    await finishWeek9({ thu: [24, 20], sunA: [27, 17], sunB: [10, 20], mon: [21, 14] });
    assert.ok(p);
    time.set('2027-06-01T16:00:00.000Z');
    const page = visible((await app.browser().get('/tournaments')).text);
    assert.match(page, /Survivor returns for the NFL season\. Last winner: Ann \(Survivor 2026\)/);
    assert.match(visible((await app.browser().get('/survivor')).text), /Survivor returns for the NFL season/);
  });
});
