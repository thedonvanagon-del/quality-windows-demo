import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { ensureOfficial } from '../src/official.js';
import { createReminders } from '../src/reminders.js';
import { addBet, addPlayer, clock, event, quiet, startApp, visible } from './helpers.js';

// Thursday Nov 5, 2026, Eastern standard time (UTC-5).
const at = (et) => {
  const [h, m] = et.split(':').map(Number);
  return new Date(Date.UTC(2026, 10, 5, h + 5, m)).toISOString();
};

let time;
let app;
let reminders;

beforeEach(async () => {
  time = clock(at('9:00'));
  app = await startApp({ time });
  // Tonight: two NBA games, three college games. NFL's next game is Sunday.
  app.espn.events.nba.push(
    event({ id: '1', start: at('19:30'), home: ['Celtics', 'BOS'], away: ['Lakers', 'LAL'] }),
    event({ id: '2', start: at('22:00'), home: ['Nuggets', 'DEN'], away: ['Suns', 'PHX'] }),
  );
  for (const [id, hour] of [['3', '19:00'], ['4', '19:00'], ['5', '21:00']]) {
    app.espn.events.ncaab.push(event({ id, start: at(hour), home: ['Duke', 'DUKE'], away: ['Kansas', 'KU'] }));
  }
  app.espn.events.nfl.push(event({ id: '6', start: '2026-11-08T18:00:00.000Z' }));
  reminders = createReminders({ store: app.store, games: app.games, notifier: app.notifier, now: time.now, log: quiet });
});

afterEach(() => app.close());

const id = (name) => app.store.get('SELECT id FROM users WHERE screen_name = ?', name).id;
const sent = (kind) => app.store.all(
  'SELECT u.screen_name, n.text, n.url FROM notifications n JOIN users u ON u.id = n.user_id WHERE n.kind = ? ORDER BY n.id',
  kind,
).map((r) => `${r.screen_name}: ${r.text} ${r.url}`);

describe('reminders', () => {
  test('"Lines are up" once a day at 11 AM ET, in each player\'s sports, settings respected', async () => {
    addPlayer(app.store, 'Ann', { favSports: 'nba,ncaab' });
    addPlayer(app.store, 'Bob', { favSports: 'nfl' });
    const cal = addPlayer(app.store, 'Cal', { favSports: 'nba' });
    app.store.run('UPDATE users SET notify_lines = 0 WHERE id = ?', cal);
    addPlayer(app.store, 'Dee', { favSports: 'nba' });
    addPlayer(app.store, 'Eve');
    const official = ensureOfficial(app.store, time.now());
    app.store.run("UPDATE users SET fav_sports = 'nba' WHERE id = ?", official);

    time.set(at('10:55'));
    assert.deepEqual(await reminders.run(), { lines: 0, streak: 0 });
    time.set(at('11:02'));
    assert.deepEqual(await reminders.run(), { lines: 2, streak: 0 });
    assert.deepEqual(sent('lines'), [
      'Ann: Lines are up: 2 NBA and 3 college hoops games today. /games?sport=nba',
      'Dee: Lines are up: 2 NBA games today. /games?sport=nba',
    ], 'Bob has no NFL today, Cal turned it off, Eve has no sports, the official account gets nothing');

    // Every few minutes after, and after a restart: still once.
    time.set(at('11:07'));
    assert.deepEqual(await reminders.run(), { lines: 0, streak: 0 });
    const restarted = createReminders({ store: app.store, games: app.games, notifier: app.notifier, now: time.now, log: quiet });
    assert.deepEqual(await restarted.run(), { lines: 0, streak: 0 });
    assert.equal(sent('lines').length, 2);

    // The phone gets the same thing.
    assert.equal(app.store.get("SELECT COUNT(*) AS n FROM reminders_sent WHERE kind = 'lines'").n, 2);
    // Too late in the day: not sent at 3 PM for someone who just turned it on.
    app.store.run('UPDATE users SET notify_lines = 1 WHERE id = ?', cal);
    time.set(at('15:00'));
    assert.deepEqual(await reminders.run(), { lines: 0, streak: 0 });
  });

  test('skipped when there are no games', async () => {
    addPlayer(app.store, 'Ann', { favSports: 'nhl,mlb' });
    time.set(at('11:05'));
    assert.deepEqual(await reminders.run(), { lines: 0, streak: 0 });
    assert.deepEqual(sent('lines'), []);
  });

  test('the Streak reminder at 5 PM ET: only for players in the streak game who have no pick today', async () => {
    const ann = addPlayer(app.store, 'Ann', { favSports: 'nba' }); // a streak of 1 from yesterday
    addBet(app.store, { userId: ann, start: '2026-11-04T23:00:00.000Z', streak: true });
    const bob = addPlayer(app.store, 'Bob', { favSports: 'nba' }); // lost yesterday, but played this week
    addBet(app.store, { userId: bob, start: '2026-11-03T23:00:00.000Z', result: 'loss', streak: true });
    const cal = addPlayer(app.store, 'Cal', { favSports: 'nba' }); // last played two weeks ago, and lost
    addBet(app.store, { userId: cal, start: '2026-10-20T23:00:00.000Z', result: 'loss', streak: true });
    const dee = addPlayer(app.store, 'Dee', { favSports: 'nba' }); // already made today's
    addBet(app.store, { userId: dee, start: '2026-11-04T23:00:00.000Z', streak: true });
    addBet(app.store, { userId: dee, start: at('19:30'), result: null, sport: 'nba', streak: true });
    const eve = addPlayer(app.store, 'Eve', { favSports: 'nfl' }); // no games left today in her sport
    addBet(app.store, { userId: eve, start: '2026-11-04T23:00:00.000Z', streak: true });
    const fay = addPlayer(app.store, 'Fay', { favSports: 'nba' }); // turned it off
    addBet(app.store, { userId: fay, start: '2026-11-04T23:00:00.000Z', streak: true });
    app.store.run('UPDATE users SET notify_streak = 0 WHERE id = ?', fay);
    const gus = addPlayer(app.store, 'Gus'); // no favorites: any sport counts
    addBet(app.store, { userId: gus, start: '2026-11-04T23:00:00.000Z', streak: true });
    addPlayer(app.store, 'Hal', { favSports: 'nba' }); // never played

    time.set(at('16:58'));
    assert.deepEqual(await reminders.run(), { lines: 0, streak: 0 });
    time.set(at('17:03'));
    assert.deepEqual(await reminders.run(), { lines: 0, streak: 3 });
    assert.deepEqual(sent('streak'), [
      "Ann: Keep your streak alive: make today's Streak pick. /games?sport=nba",
      "Bob: Keep your streak alive: make today's Streak pick. /games?sport=nba",
      "Gus: Keep your streak alive: make today's Streak pick. /games?sport=nba",
    ]);
    time.set(at('17:30'));
    assert.deepEqual(await reminders.run(), { lines: 0, streak: 0 }, 'once a day');
  });

  test('two settings on the notifications page, on by default', async () => {
    const ann = app.browser();
    await ann.join('ann@example.com', 'Ann');
    let page = await ann.get('/notifications');
    assert.match(page.text, /name="lines" checked><span>Lines are up/);
    assert.match(page.text, /name="streak" checked><span>Streak reminder/);
    await ann.post('/notifications/settings', { settled: 'on', follows: 'on', streak: 'on' });
    assert.deepEqual({ ...app.store.get("SELECT notify_lines, notify_streak, notify_settled FROM users WHERE screen_name = 'Ann'") }, { notify_lines: 0, notify_streak: 1, notify_settled: 1 });
    page = await ann.get('/notifications');
    assert.match(page.text, /name="lines" ><span>Lines are up/);

    // What lands in the inbox has its own icon and reads plainly.
    app.store.run("UPDATE users SET fav_sports = 'nba', notify_lines = 1 WHERE screen_name = 'Ann'");
    time.set(at('11:01'));
    await reminders.run();
    assert.match(visible((await ann.get('/notifications')).text), /Lines are up: 2 NBA games today\./);
  });
});
