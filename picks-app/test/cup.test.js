import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { closeDueWeeks } from '../src/contest.js';
import { closeCupYears, cupLine, cupPointsFor, cupStandings } from '../src/cup.js';
import { etToUtc } from '../src/time.js';
import { backfillCup, bySlug, closeDueTournaments, joinTournament } from '../src/tournaments.js';
import { addBet, addPlayer, clock, startApp, visible } from './helpers.js';

const et = (day, hour, minute = 0) => etToUtc(day, hour, minute).toISOString();
// Friday Nov 6, 2026, 2 PM Eastern.
const NOW = et('20261106', 14);

let time;
let app;

beforeEach(async () => {
  time = clock(NOW);
  app = await startApp({ time });
});

afterEach(() => app.close());

/** A finished tournament on Thursday, Nov 5, with these players in it, each with `profit` on one graded bet (1 to place). */
function finished(name, results, { playerMade = false, day = '20261105', next = '20261106' } = {}) {
  const slug = name.toLowerCase().replace(/\W+/g, '-');
  app.store.run(
    `INSERT INTO tournaments (slug, name, sports, starts_at, ends_at, min_bets, prize, kind, created_at)
     VALUES (?, ?, NULL, ?, ?, 1, 'Bragging rights', ?, ?)`,
    slug, name, et(day, 0), et(next, 0), playerMade ? 'custom' : 'auto', NOW,
  );
  const t = bySlug(app.store, slug);
  if (playerMade) {
    app.store.run("INSERT INTO player_tournaments (tournament_id, visibility, invite_code) VALUES (?, 'public', ?)", t.id, slug.toUpperCase().slice(0, 8));
  }
  results.forEach(([userId, profit], i) => {
    assert.ok(joinTournament(app.store, t, userId, new Date(et('20261101', 12))).ok);
    const bet = addBet(app.store, { userId, start: new Date(Date.parse(et(day, 12)) + i * 60_000).toISOString(), profit, result: profit >= 0 ? 'win' : 'loss', units: 1 });
    app.store.run('UPDATE picks SET made_at = ? WHERE id = ?', et(day, 9), bet);
  });
  return t;
}

const players = (n) => Array.from({ length: n }, (_, i) => addPlayer(app.store, `P${String(i + 1).padStart(2, '0')}`));
const cupOf = (source) => app.store.all('SELECT user_id, place, points FROM cup_points WHERE source = ? ORDER BY place, user_id', source).map((r) => ({ ...r }));

describe('the Bookie Bullies Cup', () => {
  test('points by finish, plus one for placing', () => {
    assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 40].map(cupPointsFor), [26, 19, 16, 13, 11, 9, 7, 5, 3, 2, 1, 1]);
  });

  test('a tournament close writes every placed finish once; the unplaced get nothing', () => {
    const ids = players(12);
    const t = finished('Hoops Night', ids.slice(0, 11).map((id, i) => [id, 11 - i]));
    joinTournament(app.store, t, ids[11], new Date(et('20261104', 12)));
    closeDueTournaments(app.store, time.now());
    const rows = cupOf('tournament');
    assert.equal(rows.length, 11, 'the one with no bets did not place');
    assert.deepEqual(rows.slice(0, 3), [{ user_id: ids[0], place: 1, points: 26 }, { user_id: ids[1], place: 2, points: 19 }, { user_id: ids[2], place: 3, points: 16 }]);
    assert.deepEqual(rows.at(-1), { user_id: ids[10], place: 11, points: 1 });
    assert.equal(app.store.get('SELECT label FROM cup_points LIMIT 1').label, 'Hoops Night');
  });

  test('a player-made tournament counts only with 8 or more placed', () => {
    const ids = players(8);
    finished('Tiny Crew Cup', ids.slice(0, 7).map((id, i) => [id, 7 - i]), { playerMade: true });
    finished('Big Crew Cup', ids.map((id, i) => [id, 8 - i]), { playerMade: true });
    closeDueTournaments(app.store, time.now());
    assert.deepEqual(app.store.all('SELECT DISTINCT label FROM cup_points').map((r) => r.label), ['Big Crew Cup']);
    assert.equal(cupOf('tournament').length, 8);
  });

  test('the backfill gives points for this year\'s closed tournaments and weeks, and running it again changes nothing', () => {
    const ids = players(5);
    finished('NFL Sunday', ids.map((id, i) => [id, 5 - i]));
    // Last week's contest, with 5 graded bets each for two players.
    for (const [k, id] of ids.slice(0, 2).entries()) {
      for (let i = 0; i < 5; i++) addBet(app.store, { userId: id, start: et('20261103', 12 + i), profit: k ? 0.5 : 1 });
    }
    closeDueTournaments(app.store, time.now());
    closeDueWeeks(app.store, new Date(et('20261110', 9)));
    const before = app.store.all('SELECT * FROM cup_points ORDER BY source, ref, user_id').map((r) => ({ ...r }));
    assert.deepEqual(before.filter((r) => r.source === 'weekly').map((r) => [r.user_id, r.place]), [[ids[0], 1], [ids[1], 2]]);
    // As if the Cup came later: wipe it and backfill, twice.
    app.store.run('DELETE FROM cup_points');
    assert.equal(backfillCup(app.store, time.now()), before.length);
    assert.equal(backfillCup(app.store, time.now()), 0);
    assert.deepEqual(app.store.all('SELECT * FROM cup_points ORDER BY source, ref, user_id').map((r) => ({ ...r, awarded_at: null })), before.map((r) => ({ ...r, awarded_at: null })));
    // Last year's don't count this year.
    assert.deepEqual(app.store.all('SELECT DISTINCT year FROM cup_points').map((r) => r.year), [2026]);
  });

  test('standings, the profile line, the page, the hub banner and the leaderboard link', async () => {
    const ann = app.browser();
    await ann.join('ann@example.com', 'Ann');
    const annId = app.store.get("SELECT id FROM users WHERE screen_name = 'Ann'").id;
    const [bob, cy] = players(2);
    finished('Hoops Night', [[bob, 3], [annId, 2], [cy, 1]]);
    finished('College Saturday', [[annId, 3], [cy, 2]], { day: '20261104', next: '20261105' });
    closeDueTournaments(app.store, time.now());
    assert.deepEqual(cupStandings(app.store, 2026).map((r) => [r.rank, r.screen_name, r.points, r.wins, r.podiums]), [
      [1, 'Ann', 45, 1, 2], [2, 'P02', 35, 0, 2], [3, 'P01', 26, 1, 1],
    ]);
    assert.deepEqual(cupLine(app.store, annId, 2026), { rank: 1, points: 45 });
    assert.equal(cupLine(app.store, annId, 2025), null);
    assert.match(visible((await ann.get('/u/Ann')).text), /Cup: #1 · 45 pts/);
    const page = visible((await ann.get('/cup')).text);
    assert.match(page, /Bookie Bullies Cup 2026/);
    assert.match(page, /#1 You 1 win · 2 podiums · 2 placed 45 pts/);
    assert.match(page, /How points work 1st 25 2nd 18/);
    assert.match(page, /Player-made tournaments count only with 8 or more placed players/);
    assert.match(page, /Your finishes 1st College Saturday \+26 2nd Hoops Night \+19/);
    assert.match((await ann.get('/cup')).text, /<tr class="me">/);
    assert.match(visible((await ann.get('/tournaments')).text), /Bookie Bullies Cup 2026 You: #1 · 45 pts/);
    assert.match((await ann.get('/leaderboard')).text, /href="\/cup"/);
    assert.equal((await app.browser().get('/cup')).status, 200);
  });

  test('after the year ends: the top 3 written once, badges, notes and the winners wall', async () => {
    const ids = players(4);
    finished('Hoops Night', ids.map((id, i) => [id, 4 - i]));
    closeDueTournaments(app.store, time.now());
    assert.deepEqual(closeCupYears(app.store, time.now(), app.notifier), [], 'not while the year is on');
    time.set(et('20270101', 0, 5));
    const [closed] = closeCupYears(app.store, time.now(), app.notifier);
    assert.equal(closed.year, 2026);
    assert.deepEqual(closed.podium.map((r) => r.id), ids.slice(0, 3));
    assert.deepEqual(closeCupYears(app.store, time.now(), app.notifier), [], 'once');
    const badges = (id) => app.store.all('SELECT key, ref FROM badges WHERE user_id = ? AND key LIKE ? ORDER BY key', id, 'cup_%').map((r) => `${r.key}:${r.ref}`);
    assert.deepEqual(badges(ids[0]), ['cup_champion:2026', 'cup_podium:2026']);
    assert.deepEqual(badges(ids[2]), ['cup_podium:2026']);
    assert.deepEqual(badges(ids[3]), []);
    assert.equal(app.store.get("SELECT text FROM notifications WHERE user_id = ? AND kind = 'cup'", ids[0]).text, 'You finished #1 in the 2026 Bookie Bullies Cup (26 pts).');
    const wall = visible((await app.browser().get('/winners?tab=cup')).text);
    assert.match(wall, /2026 Bookie Bullies Cup #1 P01 26 pts #2 P02 19 pts #3 P03 16 pts/);
  });
});
