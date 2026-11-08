import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { openStore } from '../src/db.js';
import { parseScoreboard } from '../src/espn.js';
import { alertPrefs, alertsDue, checkGameAlerts, clockSeconds, FOLLOW_CAP, followedGameIds, followGame, isCloseFinish, periodLabel, unfollowGame } from '../src/gamealerts.js';
import { toGame } from '../src/games.js';
import { SPORT } from '../src/sports.js';
import { addPlayer, clock, event, startApp, visible } from './helpers.js';

const T0 = '2026-11-08T00:00:00.000Z';
const mins = (n) => new Date(Date.parse(T0) + n * 60_000);

/** A game straight into the games table, Celtics (BOS) at Warriors (GS) unless said. */
function putGame(store, { id = 'nba:1', sport = 'nba', start = T0, home = ['Warriors', 'GS'], away = ['Celtics', 'BOS'], tv = 'ESPN' } = {}) {
  store.run(
    `INSERT INTO games (id, sport, start_time, state, status, detail, completed, home_name, home_short, home_abbr, home_score,
                        away_name, away_short, away_abbr, away_score, lines, updated_at, tv)
     VALUES (?, ?, ?, 'pre', 'STATUS_SCHEDULED', '', 0, ?, ?, ?, NULL, ?, ?, ?, NULL, '{}', ?, ?)`,
    id, sport, start, home[0], home[0], home[1], away[0], away[0], away[1], start, tv,
  );
  return id;
}

/** Move a game along: scores are [away, home]. */
function play(store, id, { state = 'in', score = null, period = null, clock: displayClock = null, status = null, detail = '', completed = false }) {
  store.run(
    `UPDATE games SET state = ?, status = ?, detail = ?, completed = ?, away_score = ?, home_score = ?, period = ?, clock = ? WHERE id = ?`,
    state, status ?? (state === 'post' ? 'STATUS_FINAL' : 'STATUS_IN_PROGRESS'), detail, completed || state === 'post' ? 1 : 0,
    score?.[0] ?? null, score?.[1] ?? null, period, displayClock, id,
  );
}

/** A notifier that only writes down what it would send. */
function recorder() {
  const sent = [];
  return { sent, gameAlert: (userId, note) => sent.push({ userId, ...note }) };
}

describe('game alert engine', () => {
  let store;
  let notes;
  let ann;
  beforeEach(() => {
    store = openStore(':memory:');
    notes = recorder();
    ann = addPlayer(store, 'Ann');
  });
  afterEach(() => store.close());

  const follow = (userId, id, at = mins(-60)) => followGame(store, { userId, game: toGame(store.get('SELECT * FROM games WHERE id = ?', id)), now: at });
  const run = (at) => checkGameAlerts(store, notes, at);
  const texts = () => notes.sent.map((n) => n.text);

  test('nothing to do with no follows, and no ESPN reads due', () => {
    putGame(store);
    play(store, 'nba:1', { score: [10, 8], period: 1, clock: '5:00' });
    assert.equal(run(mins(10)), 0);
    assert.deepEqual(alertsDue(store, mins(10)), []);
    assert.equal(store.get('SELECT COUNT(*) AS n FROM game_watch').n, 0);
  });

  test('says when a followed game starts, with the channel, once', () => {
    putGame(store);
    follow(ann, 'nba:1');
    assert.equal(run(mins(-3)), 0);
    play(store, 'nba:1', { score: [0, 0], period: 1, clock: '12:00' });
    assert.equal(run(mins(1)), 1);
    assert.deepEqual(notes.sent, [{ userId: ann, gameId: 'nba:1', title: 'Celtics @ Warriors', text: 'Celtics @ Warriors is on · ESPN' }]);
    assert.equal(run(mins(2)), 0);
  });

  test('lead changes: none in the first quarter, at most one a period', () => {
    putGame(store);
    follow(ann, 'nba:1');
    play(store, 'nba:1', { score: [2, 0], period: 1, clock: '11:00' });
    run(mins(1));
    // Swaps in the first quarter don't count.
    play(store, 'nba:1', { score: [2, 4], period: 1, clock: '10:00' });
    run(mins(2));
    play(store, 'nba:1', { score: [30, 28], period: 2, clock: '8:00' });
    run(mins(3));
    assert.deepEqual(texts(), ['Celtics @ Warriors is on · ESPN', 'Lead change: Celtics up 2 · BOS 30–GS 28 · Q2 8:00']);
    // Back the other way in the same quarter: quiet. A tie in between keeps the last leader.
    play(store, 'nba:1', { score: [30, 31], period: 2, clock: '6:00' });
    run(mins(4));
    play(store, 'nba:1', { score: [33, 33], period: 2, clock: '5:00' });
    run(mins(5));
    play(store, 'nba:1', { score: [33, 35], period: 3, clock: '11:00' });
    run(mins(6));
    // Ahead again after a tie, same team: not a change.
    play(store, 'nba:1', { score: [35, 35], period: 4, clock: '9:00' });
    run(mins(7));
    play(store, 'nba:1', { score: [35, 38], period: 4, clock: '8:30' });
    run(mins(8));
    play(store, 'nba:1', { score: [88, 90], period: 4, clock: '6:10' });
    run(mins(9));
    assert.deepEqual(texts().slice(2), []);
    play(store, 'nba:1', { score: [92, 90], period: 4, clock: '5:00' });
    run(mins(10));
    assert.deepEqual(texts().slice(2), ['Lead change: Celtics up 2 · BOS 92–GS 90 · Q4 5:00']);
  });

  test('the Q3 lead change from the brief reads like the example', () => {
    putGame(store);
    follow(ann, 'nba:1');
    play(store, 'nba:1', { score: [70, 66], period: 3, clock: '2:00' });
    run(mins(80));
    play(store, 'nba:1', { score: [88, 90], period: 4, clock: '6:10' });
    run(mins(81));
    assert.equal(texts().at(-1), 'Lead change: Warriors up 2 · BOS 88–GS 90 · Q4 6:10');
  });

  test('close finish per sport', () => {
    const g = (sport, period, clock, away, home) => ({ sport, state: 'in', period, clock, home: { score: home }, away: { score: away } });
    // NFL and college football: within 8, 5:00 or less in the 4th, or overtime.
    assert.equal(isCloseFinish(g('nfl', 4, '4:59', 20, 27)), true);
    assert.equal(isCloseFinish(g('nfl', 4, '5:01', 20, 27)), false);
    assert.equal(isCloseFinish(g('nfl', 4, '2:00', 17, 26)), false);
    assert.equal(isCloseFinish(g('nfl', 3, '1:00', 20, 21)), false);
    assert.equal(isCloseFinish(g('ncaaf', 5, '', 31, 31)), true);
    // NBA: within 5, 3:00 or less in the 4th.
    assert.equal(isCloseFinish(g('nba', 4, '1:48', 101, 99)), true);
    assert.equal(isCloseFinish(g('nba', 4, '3:01', 101, 99)), false);
    assert.equal(isCloseFinish(g('nba', 4, '45.2', 101, 96)), true);
    assert.equal(isCloseFinish(g('nba', 4, '1:00', 101, 95)), false);
    assert.equal(isCloseFinish(g('nba', 4, '1:00', 101, 96)), true);
    // College hoops: the 2nd half.
    assert.equal(isCloseFinish(g('ncaab', 2, '2:30', 60, 64)), true);
    assert.equal(isCloseFinish(g('ncaab', 1, '0:30', 30, 31)), false);
    // Hockey: within 1, 5:00 or less in the 3rd.
    assert.equal(isCloseFinish(g('nhl', 3, '4:00', 2, 3)), true);
    assert.equal(isCloseFinish(g('nhl', 3, '4:00', 1, 3)), false);
    assert.equal(isCloseFinish(g('nhl', 3, '6:00', 2, 3)), false);
    assert.equal(isCloseFinish(g('nhl', 4, '3:00', 2, 2)), true);
    // Baseball: within 1 from the 8th.
    assert.equal(isCloseFinish(g('mlb', 8, '0:00', 3, 2)), true);
    assert.equal(isCloseFinish(g('mlb', 7, '0:00', 3, 2)), false);
    assert.equal(isCloseFinish(g('mlb', 9, '0:00', 4, 2)), false);
  });

  test('a close finish goes once, worded like the brief', () => {
    putGame(store);
    follow(ann, 'nba:1');
    play(store, 'nba:1', { score: [99, 99], period: 4, clock: '3:30' });
    run(mins(140));
    assert.deepEqual(texts(), ['Celtics @ Warriors is on · ESPN']);
    notes.sent.length = 0;
    play(store, 'nba:1', { score: [101, 99], period: 4, clock: '1:48' });
    run(mins(141));
    play(store, 'nba:1', { score: [103, 101], period: 4, clock: '1:00' });
    run(mins(142));
    assert.deepEqual(texts(), ['Close finish: BOS 101–GS 99, 1:48 left. Turn it on.']);
  });

  test('baseball and hockey close finishes say where they are', () => {
    putGame(store, { id: 'mlb:1', sport: 'mlb', home: ['Red Sox', 'BOS'], away: ['Yankees', 'NYY'] });
    putGame(store, { id: 'nhl:1', sport: 'nhl', home: ['Bruins', 'BOS'], away: ['Rangers', 'NYR'] });
    follow(ann, 'mlb:1');
    follow(ann, 'nhl:1');
    play(store, 'mlb:1', { score: [3, 2], period: 8, clock: '0:00', detail: 'Bot 8th' });
    play(store, 'nhl:1', { score: [2, 2], period: 4, clock: '3:12', detail: '3:12 - OT' });
    run(mins(170));
    assert.deepEqual(texts().filter((t) => !t.includes(' is on')).sort(), [
      'Close finish: NYR 2–BOS 2, 3:12 left in OT. Turn it on.',
      'Close finish: NYY 3–BOS 2, Bot 8th. Turn it on.',
    ]);
  });

  test('score at the break: halftime, hockey periods, never baseball', () => {
    putGame(store);
    putGame(store, { id: 'nhl:1', sport: 'nhl', home: ['Bruins', 'BOS'], away: ['Rangers', 'NYR'], tv: null });
    putGame(store, { id: 'mlb:1', sport: 'mlb', home: ['Red Sox', 'BOS'], away: ['Yankees', 'NYY'], tv: null });
    for (const id of ['nba:1', 'nhl:1', 'mlb:1']) follow(ann, id);
    play(store, 'nba:1', { score: [54, 50], period: 2, clock: '0:00', status: 'STATUS_HALFTIME', detail: 'Halftime' });
    play(store, 'nhl:1', { score: [1, 0], period: 1, clock: '0:00', status: 'STATUS_END_PERIOD', detail: 'End of 1st' });
    play(store, 'mlb:1', { score: [1, 0], period: 5, clock: '0:00', status: 'STATUS_END_PERIOD', detail: 'End 5th' });
    run(mins(70));
    run(mins(71));
    play(store, 'nhl:1', { score: [1, 1], period: 2, clock: '0:00', status: 'STATUS_END_PERIOD', detail: 'End of 2nd' });
    run(mins(100));
    const breaks = texts().filter((t) => !t.includes(' is on'));
    assert.deepEqual(breaks, ['Halftime: BOS 54–GS 50', 'End of 1st: NYR 1–BOS 0', 'End of 2nd: NYR 1–BOS 1']);
  });

  test('final score, and one note instead of two for a graded pick', () => {
    const bob = addPlayer(store, 'Bob');
    const cy = addPlayer(store, 'Cy');
    store.run('UPDATE users SET notify_settled = 0 WHERE id = ?', cy);
    putGame(store);
    for (const id of [ann, bob, cy]) follow(id, 'nba:1');
    play(store, 'nba:1', { score: [100, 101], period: 4, clock: '4:00' });
    run(mins(150));
    notes.sent.length = 0;
    // Bob (bet results on) and Cy (bet results off) each had a graded pick on it.
    for (const id of [bob, cy]) {
      store.run(
        `INSERT INTO picks (user_id, game_id, sport, market, side, line, odds, units, game_start, made_at, result, profit, graded_at)
         VALUES (?, 'nba:1', 'nba', 'spread', 'home', -3.5, -110, 1, ?, ?, 'loss', -1, ?)`,
        id, T0, T0, mins(160).toISOString(),
      );
    }
    play(store, 'nba:1', { state: 'post', score: [113, 115], period: 4, clock: '0:00', detail: 'Final' });
    run(mins(160));
    assert.deepEqual(notes.sent.map((n) => [n.userId, n.text]), [
      [ann, 'Final: Celtics 113, Warriors 115'],
      [cy, 'Final: Celtics 113, Warriors 115 · Your pick: Lost 1u on Warriors -3.5'],
    ]);
    // Bob heard from "your bet settled", which carries the score.
    assert.equal(run(mins(161)), 0);
  });

  test('a postponed game sends nothing and stops being watched', () => {
    putGame(store);
    follow(ann, 'nba:1', mins(-600));
    play(store, 'nba:1', { state: 'post', status: 'STATUS_POSTPONED', completed: false });
    store.run("UPDATE games SET completed = 0 WHERE id = 'nba:1'");
    assert.equal(run(mins(1)), 0);
    assert.equal(store.get("SELECT final_sent FROM game_watch WHERE game_id = 'nba:1'").final_sent, 1);
  });

  test('never twice, a restart included', () => {
    putGame(store);
    follow(ann, 'nba:1');
    play(store, 'nba:1', { score: [54, 50], period: 2, clock: '0:00', status: 'STATUS_HALFTIME', detail: 'Halftime' });
    assert.equal(run(mins(70)), 2);
    // A fresh notifier (the app restarted) on the same database.
    notes = recorder();
    assert.equal(run(mins(71)), 0);
    play(store, 'nba:1', { state: 'post', score: [113, 115], period: 4 });
    assert.equal(run(mins(160)), 1);
    notes = recorder();
    assert.equal(run(mins(161)), 0);
    assert.equal(run(mins(162)), 0);
  });

  test('games that started over 6 hours ago when it first runs send nothing', () => {
    putGame(store);
    store.run(
      "INSERT INTO game_follows (user_id, game_id, created_at) VALUES (?, 'nba:1', ?)", ann, mins(-60).toISOString(),
    );
    // No watch row yet (the feature's first run), and a watch nobody has checked in hours.
    play(store, 'nba:1', { state: 'post', score: [113, 115], period: 4 });
    assert.equal(run(mins(7 * 60)), 0);
    putGame(store, { id: 'nba:2' });
    follow(ann, 'nba:2', mins(-60));
    play(store, 'nba:2', { score: [101, 99], period: 4, clock: '1:00' });
    assert.equal(run(mins(7 * 60)), 0);
    play(store, 'nba:2', { state: 'post', score: [101, 99], period: 4 });
    assert.equal(run(mins(7 * 60 + 1)), 0);
  });

  test('only the alerts a player has on', () => {
    const bob = addPlayer(store, 'Bob');
    store.run('UPDATE users SET alert_start = 0, alert_break = 0 WHERE id = ?', bob);
    assert.deepEqual(alertPrefs(store, bob), { start: false, lead: true, close: true, break: false, final: true });
    putGame(store);
    follow(ann, 'nba:1');
    follow(bob, 'nba:1');
    play(store, 'nba:1', { score: [54, 50], period: 2, clock: '0:00', status: 'STATUS_HALFTIME', detail: 'Halftime' });
    run(mins(70));
    assert.deepEqual(notes.sent.map((n) => n.userId), [ann, ann]);
  });

  test('following a game already on sends no "it\'s on", and unfollowing stops alerts', () => {
    putGame(store);
    play(store, 'nba:1', { score: [10, 8], period: 1, clock: '5:00' });
    follow(ann, 'nba:1', mins(8));
    assert.equal(run(mins(9)), 0);
    unfollowGame(store, { userId: ann, gameId: 'nba:1' });
    play(store, 'nba:1', { score: [54, 50], period: 2, clock: '0:00', status: 'STATUS_HALFTIME', detail: 'Halftime' });
    assert.equal(run(mins(70)), 0);
  });

  test('follows: finished games refused, at most 30 open games', () => {
    putGame(store, { id: 'nba:done' });
    play(store, 'nba:done', { state: 'post', score: [1, 2] });
    const done = toGame(store.get("SELECT * FROM games WHERE id = 'nba:done'"));
    assert.match(followGame(store, { userId: ann, game: done, now: mins(0) }).error, /over/);
    for (let i = 0; i < FOLLOW_CAP; i++) {
      putGame(store, { id: `nba:${100 + i}`, start: mins(60 + i).toISOString() });
      assert.equal(follow(ann, `nba:${100 + i}`, mins(0)).ok, true);
    }
    putGame(store, { id: 'nba:999', start: mins(500).toISOString() });
    assert.match(follow(ann, 'nba:999', mins(0)).error, /30 games/);
    // Following again is fine; finishing one frees a place.
    assert.equal(follow(ann, 'nba:100', mins(0)).ok, true);
    play(store, 'nba:100', { state: 'post', score: [1, 2] });
    assert.equal(follow(ann, 'nba:999', mins(0)).ok, true);
    assert.deepEqual([...followedGameIds(store, ann, ['nba:999', 'nba:100', 'nba:done', 'nope'])].sort(), ['nba:100', 'nba:999']);
  });

  test('labels and clocks', () => {
    assert.deepEqual([1, 4, 5, 6].map((p) => periodLabel('nba', p)), ['Q1', 'Q4', 'OT', '2OT']);
    assert.deepEqual([1, 2, 3].map((p) => periodLabel('ncaab', p)), ['H1', 'H2', 'OT']);
    assert.deepEqual([3, 4].map((p) => periodLabel('nhl', p)), ['P3', 'OT']);
    assert.equal(periodLabel('mlb', 7), null);
    assert.deepEqual(['6:10', '45.2', '0:00', '', null].map(clockSeconds), [370, 45, 0, null, null]);
  });
});

test('ESPN gives the period and the clock', () => {
  const e = event({ id: '9', start: T0 });
  e.competitions[0].status = { period: 4, displayClock: '6:10', type: { state: 'in', completed: false, name: 'STATUS_IN_PROGRESS', shortDetail: '6:10 - 4th' } };
  const [g] = parseScoreboard(SPORT.nba, { events: [e] });
  assert.equal(g.period, 4);
  assert.equal(g.clock, '6:10');
  e.competitions[0].status = { period: 0, displayClock: '0:00', type: { state: 'pre', name: 'STATUS_SCHEDULED' } };
  const [pre] = parseScoreboard(SPORT.nba, { events: [e] });
  assert.equal(pre.period, null);
  assert.equal(pre.clock, null);
});

describe('follow routes and the timer', () => {
  let time;
  let app;
  let ann;
  const START = '2026-11-08T00:30:00.000Z';
  const cel = () => app.espn.events.nba[0];
  const enc = encodeURIComponent('nba:7');

  beforeEach(async () => {
    time = clock('2026-11-07T20:00:00.000Z');
    app = await startApp({ time });
    app.espn.events.nba.push(event({ id: '7', start: START, home: ['Warriors', 'GS'], away: ['Celtics', 'BOS'] }));
    ann = app.browser();
    await ann.join('ann@example.com', 'Ann');
    await app.games.refreshDays([{ sport: 'nba', start_time: START }]);
  });
  afterEach(() => app.close());

  test('the game page has the bell; following comes back to next', async () => {
    const page = await ann.get(`/games/${enc}`);
    assert.match(page.text, new RegExp(`<form class="follow" method="post" action="/games/${enc}/follow" data-follow><input type="hidden" name="_csrf" value="[^"]+"><input type="hidden" name="next" value="/games/${enc}"><button class="bell" aria-pressed="false" aria-label="Follow this game">`));
    const res = await ann.post(`/games/${enc}/follow`, { next: '/games?sport=nba#g-nba-7' });
    assert.equal(res.status, 303);
    assert.equal(res.location, '/games?sport=nba#g-nba-7');
    const after = await ann.get(`/games/${enc}`);
    assert.match(after.text, new RegExp(`<a class="bell on" href="/games/${enc}/alerts" data-sheet="Game alerts" aria-pressed="true" aria-label="Following. Change alerts">`));
    assert.match(visible(after.text), /Following\. We'll ping you when it starts\./);
    // Off-site next is ignored.
    assert.equal((await ann.post(`/games/${enc}/follow`, { next: '//evil.example' })).location, `/games/${enc}`);
  });

  test('a fetch gets JSON with the gold bell', async () => {
    const res = await ann.post(`/games/${enc}/follow`, {}, { headers: { accept: 'application/json' } });
    assert.equal(res.status, 200);
    const data = JSON.parse(res.text);
    assert.equal(data.following, true);
    assert.equal(data.message, "Following. We'll ping you when it starts.");
    assert.match(data.bell, /^<a class="bell on" href="\/games\/nba%3A7\/alerts"/);
    const off = JSON.parse((await ann.post(`/games/${enc}/unfollow`, {}, { headers: { accept: 'application/json' } })).text);
    assert.equal(off.following, false);
    assert.match(off.bell, /^<form class="follow"/);
  });

  test('404 for an unknown game, a finished game politely refused, form token checked', async () => {
    assert.equal((await ann.post('/games/nba%3Anope/follow')).status, 404);
    assert.equal((await ann.get('/games/nba%3Anope/alerts')).status, 404);
    assert.equal((await ann.post(`/games/${enc}/follow`, {}, { csrf: false })).status, 403);
    assert.equal((await ann.post(`/games/${enc}/follow`, {}, { origin: 'https://evil.example' })).status, 403);
    assert.equal((await ann.post('/settings/game-alerts', { start: 'on' }, { csrf: false })).status, 403);
    const signedOut = app.browser();
    assert.match((await signedOut.post(`/games/${enc}/follow`)).location, /^\/login/);
    const e = cel();
    e.competitions[0].status.type = { state: 'post', completed: true, name: 'STATUS_FINAL', shortDetail: 'Final' };
    e.competitions[0].competitors[0].score = '115';
    e.competitions[0].competitors[1].score = '113';
    time.advance(5 * 60 * 60_000);
    await app.games.refreshDays([{ sport: 'nba', start_time: START }]);
    const res = await ann.post(`/games/${enc}/follow`, { next: `/games/${enc}` });
    assert.equal(res.status, 303);
    assert.match(visible((await ann.get(res.location)).text), /That game is over/);
    assert.equal(app.store.get('SELECT COUNT(*) AS n FROM game_follows').n, 0);
  });

  test('the alerts page, saving settings, and unfollowing', async () => {
    await ann.post(`/games/${enc}/follow`);
    const page = await ann.get(`/games/${enc}/alerts`);
    assert.equal(page.status, 200);
    const text = visible(page.text);
    assert.match(text, /Celtics @ Warriors/);
    assert.match(text, /You're following this game\. These alerts apply to every game you follow\./);
    assert.match(text, /Game starts Lead changes Close finish Within one score late in the game Score at the break Halftime and end of periods Final score/);
    assert.equal((page.text.match(/type="checkbox"[^>]*checked/g) ?? []).length, 5);
    // No phone turned on: points to notifications.
    assert.match(text, /Phone notifications are off/);
    assert.match(page.text, /class="slip alerts-slip"/);

    const saved = await ann.post('/settings/game-alerts', { start: 'on', final: 'on', next: `/games/${enc}/alerts` });
    assert.equal(saved.status, 303);
    assert.equal(saved.location, `/games/${enc}/alerts`);
    const id = app.store.get("SELECT id FROM users WHERE screen_name = 'Ann'").id;
    assert.deepEqual(alertPrefs(app.store, id), { start: true, lead: false, close: false, break: false, final: true });
    assert.equal(((await ann.get(`/games/${enc}/alerts`)).text.match(/type="checkbox"[^>]*checked/g) ?? []).length, 2);
    const json = await ann.post('/settings/game-alerts', { lead: 'on' }, { headers: { accept: 'application/json' } });
    assert.deepEqual(JSON.parse(json.text), { saved: true, message: 'Saved.' });

    const off = await ann.post(`/games/${enc}/unfollow`, { next: `/games/${enc}` });
    assert.equal(off.location, `/games/${enc}`);
    assert.equal(app.store.get('SELECT COUNT(*) AS n FROM game_follows').n, 0);
    assert.match(visible((await ann.get(`/games/${enc}/alerts`)).text), /You're not following this game/);
  });

  test('the cap holds over the routes too', async () => {
    const id = app.store.get("SELECT id FROM users WHERE screen_name = 'Ann'").id;
    for (let i = 0; i < FOLLOW_CAP; i++) {
      app.store.run(
        `INSERT INTO games (id, sport, start_time, state, status, detail, completed, home_name, home_short, home_abbr, away_name, away_short, away_abbr, lines, updated_at)
         VALUES (?, 'nba', ?, 'pre', 'STATUS_SCHEDULED', '', 0, 'A', 'A', 'A', 'B', 'B', 'B', '{}', ?)`,
        `nba:c${i}`, START, START,
      );
      app.store.run('INSERT INTO game_follows (user_id, game_id, created_at) VALUES (?, ?, ?)', id, `nba:c${i}`, START);
    }
    const res = await ann.post(`/games/${enc}/follow`, {}, { headers: { accept: 'application/json' } });
    assert.equal(res.status, 409);
    assert.match(JSON.parse(res.text).message, /following 30 games/);
  });

  test('the timer reads ESPN only for followed games near or under way, and the alert lands in the inbox', async () => {
    const tick = async () => {
      const due = alertsDue(app.store, time.now());
      if (due.length) await app.games.refreshDays(due);
      return checkGameAlerts(app.store, app.notifier, time.now());
    };
    let calls = app.espn.calls;
    assert.equal(await tick(), 0);
    assert.equal(app.espn.calls, calls, 'no follows, no ESPN');
    await ann.post(`/games/${enc}/follow`);
    // Four hours out: still nothing to read.
    assert.equal(await tick(), 0);
    assert.equal(app.espn.calls, calls);
    // A minute before the start it reads the game's day, once a minute at most.
    time.set('2026-11-08T00:29:00.000Z');
    await tick();
    assert.equal(app.espn.calls, calls + 1);
    calls = app.espn.calls;
    const e = cel();
    e.competitions[0].status = { period: 1, displayClock: '12:00', type: { state: 'in', completed: false, name: 'STATUS_IN_PROGRESS', shortDetail: '12:00 - 1st' } };
    e.competitions[0].odds = [];
    time.advance(30_000);
    assert.equal(await tick(), 0, 'read under a minute ago');
    time.advance(40_000);
    assert.equal(await tick(), 1);
    assert.equal(app.espn.calls, calls + 1);
    const inbox = visible((await ann.get('/notifications')).text);
    assert.match(inbox, /Celtics @ Warriors is on/);
    assert.equal(app.pushed.length, 0, 'no phone turned on');
    assert.equal(app.store.get("SELECT url FROM notifications WHERE kind = 'game'").url, `/games/${enc}`);
  });

  test('the live page shows a bell on each game', async () => {
    const e = cel();
    e.competitions[0].status = { period: 2, displayClock: '3:00', type: { state: 'in', completed: false, name: 'STATUS_IN_PROGRESS', shortDetail: '3:00 - 2nd' } };
    time.set('2026-11-08T01:00:00.000Z');
    const page = await ann.get('/live');
    assert.match(page.text, new RegExp(`action="/games/${enc}/follow" data-follow>.*?name="next" value="/live#g-nba-7"`));
    await ann.post(`/games/${enc}/follow`, { next: '/live#g-nba-7' });
    assert.match((await ann.get('/live')).text, /<a class="bell on" href="\/games\/nba%3A7\/alerts"/);
  });
});
