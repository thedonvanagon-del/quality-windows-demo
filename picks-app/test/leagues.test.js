// Head-to-head leagues: making and joining, the schedule, weekly matchups,
// standings, the playoff bracket, the champion and the notes.

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import {
  bracketPairs, createLeague, finishOrder, joinLeague, leagueById, leagueStandings, leaveLeague, roundRobin, runLeagues,
} from '../src/leagues.js';
import { addDays, etToUtc } from '../src/time.js';
import { addBet, addPlayer, clock, startApp, visible } from './helpers.js';

// Friday Nov 6, 2026, 2:00 PM Eastern. Next Monday is Nov 9.
const NOW = '2026-11-06T19:00:00.000Z';
const et = (day, hour, minute = 0) => etToUtc(day, hour, minute).toISOString();
const MONDAYS = ['20261109', '20261116', '20261123', '20261130', '20261207', '20261214', '20261221'];

let time;
let app;

beforeEach(async () => {
  time = clock(NOW);
  app = await startApp({ time, config: { adminEmails: ['boss@example.com'] } });
});

afterEach(() => app.close());

const players = (names) => names.map((n) => addPlayer(app.store, n));
const notes = (userId) => app.store.all('SELECT text FROM notifications WHERE user_id = ? ORDER BY id', userId).map((r) => r.text);

/** A league starting Nov 9 made by the first player, everyone else joined. */
function league(ids, extra = {}) {
  const made = createLeague(app.store, {
    name: 'Sunday Crew', sports: ['nba'], startWeek: '20261109', regularWeeks: 3, playoffSize: 4, visibility: 'public',
    userId: ids[0], now: time.now(), ...extra,
  });
  assert.ok(made.id, made.error);
  const l = leagueById(app.store, made.id);
  for (const id of ids.slice(1)) assert.ok(joinLeague(app.store, l, id, time.now(), { code: l.invite_code }).ok);
  return leagueById(app.store, made.id);
}

/** A graded NBA bet in a league week (1-based), on that week's Wednesday. */
function bet(userId, week, profit, { sport = 'nba', day = 2 } = {}) {
  const date = addDays(MONDAYS[week - 1], day);
  return addBet(app.store, { userId, start: et(date, 20), sport, result: profit > 0 ? 'win' : profit < 0 ? 'loss' : 'push', profit });
}

/** Run the league job just after the start of league week `week` (Monday 12:05 AM ET). */
function runAt(week) {
  time.set(et(MONDAYS[week - 1], 0, 5));
  return runLeagues(app.store, time.now(), app.notifier);
}

const matchups = (l, week) => app.store.all('SELECT * FROM league_matchups WHERE league_id = ? AND week = ? ORDER BY slot', l.id, week);

describe('making and joining', () => {
  test('any confirmed player starts one from /leagues/new; two going at once; admins have no limit', async () => {
    const b = app.browser();
    await b.join('ann@example.com', 'Ann');
    const form = await b.get('/leagues/new');
    assert.equal(form.status, 200);
    assert.match(visible(form.text), /Start a league Free\. 4 to 16 players, one matchup a week, Monday to Sunday ET\./);
    const made = await b.post('/leagues/new', {
      name: 'Hoops Heads', start_week: '20261109', regular_weeks: '4', playoff_size: '2', visibility: 'public', group: '',
    });
    assert.equal(made.status, 303);
    const page = visible((await b.get(made.location)).text);
    assert.match(page, /Hoops Heads Free League All sports 1 player Started by Ann/);
    assert.match(page, /Week 1 starts Nov 9 – 15 Taking players 4 weeks, then a top-2 playoff/);

    const ann = app.store.get("SELECT id FROM users WHERE screen_name = 'Ann'").id;
    const again = createLeague(app.store, { name: 'Second One', startWeek: '20261116', regularWeeks: 3, playoffSize: 2, visibility: 'private', userId: ann, now: time.now() });
    assert.ok(again.id);
    const third = createLeague(app.store, { name: 'Third One', startWeek: '20261116', regularWeeks: 3, playoffSize: 2, visibility: 'public', userId: ann, now: time.now() });
    assert.match(third.error, /2 leagues going at once/);
    // Admins: no limit.
    const boss = app.browser();
    await boss.join('boss@example.com', 'Boss');
    for (const name of ['Boss One', 'Boss Two', 'Boss Three']) {
      const r = await boss.post('/leagues/new', { name, start_week: '20261109', regular_weeks: '3', playoff_size: '4', visibility: 'public', group: '' });
      assert.equal(r.status, 303, name);
    }
    // The form's own checks.
    assert.match(createLeague(app.store, { name: 'x', startWeek: '20261109', regularWeeks: 3, playoffSize: 4, visibility: 'public', userId: ann, now: time.now(), limit: false }).error, /3 to 40/);
    assert.match(createLeague(app.store, { name: 'Long Season', startWeek: '20261109', regularWeeks: 11, playoffSize: 4, visibility: 'public', userId: ann, now: time.now(), limit: false }).error, /3 to 10/);
    assert.match(createLeague(app.store, { name: 'Odd Playoff', startWeek: '20261109', regularWeeks: 3, playoffSize: 6, visibility: 'public', userId: ann, now: time.now(), limit: false }).error, /2, 4 or 8/);
    assert.match(createLeague(app.store, { name: 'This Week', startWeek: '20261102', regularWeeks: 3, playoffSize: 4, visibility: 'public', userId: ann, now: time.now(), limit: false }).error, /start week/);
  });

  test('joining: a private one needs its code, 16 at most, confirmed emails, and it closes when week 1 starts', () => {
    const ids = players(Array.from({ length: 17 }, (_, i) => `P${i + 1}`));
    const made = createLeague(app.store, { name: 'Private Crew', startWeek: '20261109', regularWeeks: 3, playoffSize: 4, visibility: 'private', userId: ids[0], now: time.now() });
    const l = leagueById(app.store, made.id);
    assert.match(joinLeague(app.store, l, ids[1], time.now()).error, /invite link/);
    for (const id of ids.slice(1, 16)) assert.ok(joinLeague(app.store, l, id, time.now(), { code: l.invite_code }).joined);
    assert.match(joinLeague(app.store, l, ids[16], time.now(), { code: l.invite_code }).error, /full \(16 players\)/);
    const unconfirmed = addPlayer(app.store, 'Newbie');
    app.store.run('UPDATE users SET email_verified_at = NULL WHERE id = ?', unconfirmed);
    const open = leagueById(app.store, league(players(['Ann', 'Bob', 'Cat', 'Dan'])).id);
    assert.match(joinLeague(app.store, open, unconfirmed, time.now()).error, /Confirm your email/);
    assert.ok(leaveLeague(app.store, open, app.store.get("SELECT id FROM users WHERE screen_name = 'Bob'").id, time.now()).ok);
    time.set(et('20261109', 0, 1));
    assert.match(joinLeague(app.store, open, ids[16], time.now()).error, /Joining closed when Week 1 started/);
  });

  test('under 4 players when week 1 starts, it is canceled and everyone hears why', () => {
    const ids = players(['Ann', 'Bob', 'Cat']);
    const l = league(ids);
    runAt(1);
    const after = leagueById(app.store, l.id);
    assert.ok(after.canceled_at);
    assert.equal(after.started_at, null);
    for (const id of ids) assert.deepEqual(notes(id), ['Sunday Crew was canceled. Only 3 players joined before Week 1. A league needs 4.']);
    assert.equal(matchups(l, 1).length, 0);
  });
});

describe('the schedule', () => {
  test('a round-robin with a bye: everyone meets once, one bye each, the same every time', () => {
    const ids = [11, 12, 13, 14, 15];
    const weeks = roundRobin(ids, 5);
    assert.deepEqual(weeks, roundRobin(ids, 5), 'deterministic');
    const met = new Set();
    const byes = new Map();
    for (const pairs of weeks) {
      assert.equal(pairs.length, 3);
      const seen = pairs.flat().filter((x) => x != null);
      assert.equal(new Set(seen).size, 5, 'everyone once a week');
      const bye = pairs.filter(([, b]) => b == null);
      assert.equal(bye.length, 1, 'one bye a week');
      byes.set(bye[0][0], (byes.get(bye[0][0]) ?? 0) + 1);
      for (const [a, b] of pairs) if (b != null) met.add([a, b].sort().join('-'));
    }
    assert.equal(met.size, 10, 'every pair meets once in 5 weeks');
    assert.deepEqual([...byes.values()], [1, 1, 1, 1, 1]);
    // Past n-1 weeks it starts over.
    assert.deepEqual(roundRobin([1, 2, 3, 4], 4)[3], roundRobin([1, 2, 3, 4], 4)[0]);
  });

  test('the league starts at week 1 with the schedule stored, and "This week you play" goes once', () => {
    const ids = players(['Ann', 'Bob', 'Cat', 'Dan', 'Eve']);
    const l = league(ids, { regularWeeks: 4 });
    app.store.run('UPDATE users SET notify_tournament_updates = 0 WHERE id = ?', ids[4]);
    const out = runAt(1);
    assert.deepEqual(out.started, [l.id]);
    assert.equal(app.store.get('SELECT COUNT(*) AS n FROM league_matchups WHERE league_id = ?', l.id).n, 12);
    const week1 = matchups(l, 1).map((m) => [m.a_id, m.b_id]);
    assert.deepEqual(week1, roundRobin(ids, 4)[0]);
    const bye = week1.find(([, b]) => b == null)[0];
    const [a, b] = week1.find(([x, y]) => y != null && x !== bye);
    const name = (id) => app.store.get('SELECT screen_name FROM users WHERE id = ?', id).screen_name;
    assert.ok(notes(a).includes(`This week you play ${name(b)} in Sunday Crew.`));
    if (bye !== ids[4]) assert.ok(notes(bye).includes('You have a bye this week in Sunday Crew. Your units still count toward the standings.'));
    assert.deepEqual(notes(ids[4]), [], 'the Tournament updates setting is off');
    runLeagues(app.store, time.now(), app.notifier);
    assert.equal(notes(a).filter((t) => t.startsWith('This week')).length, 1, 'once');
  });
});

describe('matchups and standings', () => {
  test('units on graded bets in the league sports that week; more units wins, the same is a tie, none is 0', async () => {
    const [ann, bob, cat, dan] = players(['Ann', 'Bob', 'Cat', 'Dan']);
    const l = league([ann, bob, cat, dan]);
    runAt(1);
    // Week 1: Ann plays Dan, Bob plays Cat (the circle method on the join order).
    assert.deepEqual(matchups(l, 1).map((m) => [m.a_id, m.b_id]), [[ann, dan], [bob, cat]]);
    bet(ann, 1, 2);
    bet(ann, 1, 1.2);
    bet(bob, 1, 1);
    bet(cat, 1, 1);
    bet(cat, 1, 5, { sport: 'nfl' }); // not a league sport
    bet(dan, 2, 4); // next week's
    // While the week is on, the page shows it.
    time.set(et('20261111', 22));
    const b = app.browser();
    await b.join('zed@example.com', 'Zed');
    const page = visible((await b.get(`/leagues/${l.id}`)).text);
    assert.match(page, /This week: Week 1/);
    assert.match(page, /Live: counts games in progress .* A Ann \+3\.2u D Dan 0u B Bob \+1u C Cat \+1u Standings/);
    const out = runAt(2);
    assert.equal(out.settled, 1);
    const [m1, m2] = matchups(l, 1);
    assert.deepEqual([m1.a_units, m1.b_units, m1.result, m1.winner_id], [3.2, 0, 'a', ann]);
    assert.deepEqual([m2.a_units, m2.b_units, m2.result, m2.winner_id], [1, 1, 'tie', null]);
    assert.ok(notes(ann).includes('You beat Dan +3.2u to 0u.'));
    assert.ok(notes(dan).includes('Ann beat you +3.2u to 0u.'));
    assert.ok(notes(bob).includes('You tied Cat at +1u in Sunday Crew.'));
    const table = leagueStandings(app.store, leagueById(app.store, l.id));
    assert.deepEqual(table.map((r) => [r.screen_name, r.wins, r.losses, r.ties, r.units]), [
      ['Ann', 1, 0, 0, 3.2], ['Bob', 0, 0, 1, 1], ['Cat', 0, 0, 1, 1], ['Dan', 0, 1, 0, 0],
    ]);
  });

  test('live: a bet on a game in progress counts at the current score, labeled, and nothing is written', async () => {
    const [ann, bob, cat, dan] = players(['Ann', 'Bob', 'Cat', 'Dan']);
    const l = league([ann, bob, cat, dan]);
    runAt(1);
    time.set(et('20261111', 21));
    app.store.run(
      `INSERT INTO games (id, sport, start_time, state, status, detail, completed, home_name, home_short, home_abbr, home_score,
                          away_name, away_short, away_abbr, away_score, lines, updated_at)
       VALUES ('nba:live1', 'nba', ?, 'in', 'STATUS_IN_PROGRESS', '3rd', 0, 'Celtics', 'Celtics', 'BOS', 80, 'Lakers', 'Lakers', 'LAL', 70, '{}', ?)`,
      et('20261111', 19, 30), et('20261111', 19, 30),
    );
    app.store.run(
      `INSERT INTO picks (user_id, game_id, sport, market, side, line, odds, units, game_start, made_at)
       VALUES (?, 'nba:live1', 'nba', 'ml', 'home', NULL, 100, 2, ?, ?)`,
      ann, et('20261111', 19, 30), et('20261111', 12),
    );
    const b = app.browser();
    await b.join('zed@example.com', 'Zed');
    const page = visible((await b.get(`/leagues/${l.id}`)).text);
    assert.match(page, /Live: counts games in progress at the current score\. Results use final scores\. A Ann \+2u 1 live D Dan 0u/);
    assert.equal(matchups(l, 1)[0].a_units, null, 'nothing provisional is written');
  });

  test('a week waits for its bets to be graded, until Tuesday 6 AM ET', () => {
    const [ann, bob, cat, dan] = players(['Ann', 'Bob', 'Cat', 'Dan']);
    const l = league([ann, bob, cat, dan]);
    runAt(1);
    bet(ann, 1, 1);
    addBet(app.store, { userId: bob, start: et('20261115', 20), sport: 'nba', result: null });
    assert.equal(runAt(2).settled, 0, 'Bob has a bet still open');
    time.set(et('20261117', 6, 1));
    assert.equal(runLeagues(app.store, time.now(), app.notifier).settled, 1, 'the deadline settles it anyway');
    assert.equal(matchups(l, 1).find((m) => m.a_id === bob || m.b_id === bob).result != null, true);
  });

  test('standings: win share first, then total units', () => {
    const [ann, bob, cat, dan] = players(['Ann', 'Bob', 'Cat', 'Dan']);
    const l = league([ann, bob, cat, dan]);
    runAt(1);
    // Week 1: Ann v Dan, Bob v Cat. Ann and Bob win; Bob by more.
    bet(ann, 1, 1);
    bet(bob, 1, 4);
    runAt(2);
    const table = leagueStandings(app.store, leagueById(app.store, l.id));
    assert.deepEqual(table.map((r) => r.screen_name), ['Bob', 'Ann', 'Cat', 'Dan'], 'Bob and Ann are 1-0; Bob has more units');
    assert.deepEqual(table.map((r) => r.rank), [1, 2, 3, 4]);
  });
});

describe('playoffs', () => {
  test('bracket pairs: 1 against N, and 1 and 2 only meet in the final', () => {
    assert.deepEqual(bracketPairs(2), [[1, 2]]);
    assert.deepEqual(bracketPairs(4), [[1, 4], [2, 3]]);
    assert.deepEqual(bracketPairs(8), [[1, 8], [4, 5], [2, 7], [3, 6]]);
  });

  test('seeded after the regular season, a tie goes to the higher seed, and the champion gets a badge and Cup points', async () => {
    const names = ['Ann', 'Bob', 'Cat', 'Dan', 'Eve', 'Fay', 'Gus', 'Hal'];
    const ids = players(names);
    const id = Object.fromEntries(names.map((n, i) => [n, ids[i]]));
    const l = league(ids);
    runAt(1);
    // Three regular weeks: a player's skill is how many units they win each week.
    const skill = { Ann: 8, Bob: 7, Cat: 6, Dan: 5, Eve: 4, Fay: 3, Gus: 2, Hal: 1 };
    for (const week of [1, 2, 3]) {
      for (const n of names) bet(id[n], week, skill[n]);
      runAt(week + 1);
    }
    const table = leagueStandings(app.store, leagueById(app.store, l.id));
    assert.deepEqual(table.map((r) => r.screen_name), names, 'more units won every matchup');
    assert.deepEqual(app.store.all('SELECT user_id, seed FROM league_members WHERE league_id = ? AND seed IS NOT NULL ORDER BY seed', l.id).map((r) => r.user_id), ids.slice(0, 4));
    assert.deepEqual(matchups(l, 4).map((m) => [m.a_seed, m.b_seed, m.a_id, m.b_id, m.playoff]), [[1, 4, id.Ann, id.Dan, 1], [2, 3, id.Bob, id.Cat, 1]]);
    assert.ok(notes(id.Cat).includes('You made the playoffs in Sunday Crew as the 3 seed.'));
    assert.ok(notes(id.Cat).includes('Playoffs: this week you play Bob in Sunday Crew.'));
    assert.ok(!notes(id.Eve).some((t) => t.includes('made the playoffs')));

    // Semifinals: Ann and Dan both win nothing, a tie: the 1 seed goes on. Cat beats Bob.
    bet(id.Cat, 4, 2);
    runAt(5);
    const semis = matchups(l, 4);
    assert.deepEqual([semis[0].a_units, semis[0].b_units, semis[0].winner_id], [0, 0, id.Ann]);
    assert.equal(semis[1].winner_id, id.Cat);
    assert.ok(notes(id.Ann).includes('You beat Dan 0u to 0u (the higher seed wins a tie). On to the next round.'));
    assert.ok(notes(id.Dan).includes('Ann beat you 0u to 0u (the higher seed wins a tie). Your playoff run is over.'));
    assert.deepEqual(matchups(l, 5).map((m) => [m.a_id, m.b_id, m.a_seed, m.b_seed]), [[id.Ann, id.Cat, 1, 3]]);
    assert.ok(notes(id.Cat).includes('In the final, this week you play Ann in Sunday Crew.'));

    // The page shows the bracket.
    const b = app.browser();
    await b.join('zed@example.com', 'Zed');
    const page = visible((await b.get(`/leagues/${l.id}`)).text);
    assert.match(page, /Playoff bracket Semifinals Week 4 .*1 .*Ann .*4 .*Dan .* Final Week 5 .*1 .*Ann .*3 .*Cat/);

    // The final: Cat wins it.
    bet(id.Cat, 5, 3);
    bet(id.Ann, 5, 1);
    const out = runAt(6);
    assert.deepEqual(out.closed, [l.id]);
    const done = leagueById(app.store, l.id);
    assert.equal(done.champion_id, id.Cat);
    assert.ok(app.store.get("SELECT 1 AS x FROM badges WHERE user_id = ? AND key = 'league_champion' AND ref = ?", id.Cat, `league-${l.id}`));
    assert.ok(notes(id.Cat).includes('You won Sunday Crew. League champion.'));
    assert.ok(notes(id.Bob).includes('Sunday Crew is final: Cat won it. You finished 3rd.'));
    // Champion 1st, runner-up 2nd, semifinal losers 3rd, then the rest by the standings.
    assert.deepEqual(finishOrder(app.store, done).map((r) => [names[ids.indexOf(r.id)], r.place]), [
      ['Cat', 1], ['Ann', 2], ['Dan', 3], ['Bob', 3], ['Eve', 5], ['Fay', 6], ['Gus', 7], ['Hal', 8],
    ]);
    const cup = app.store.all("SELECT user_id, place, points FROM cup_points WHERE source = 'league' ORDER BY place, user_id");
    assert.equal(cup.length, 8);
    assert.deepEqual({ ...cup[0] }, { user_id: id.Cat, place: 1, points: 26 });
    assert.equal(cup.filter((r) => r.place === 3).length, 2);
    // Running again changes nothing.
    assert.equal(runLeagues(app.store, time.now(), app.notifier).settled, 0);
  });

  test('a league under 8 players gets no Cup points (the player-made minimum), but still a champion', () => {
    const ids = players(['Ann', 'Bob', 'Cat', 'Dan']);
    const l = league(ids, { playoffSize: 2 });
    runAt(1);
    for (const week of [1, 2, 3]) {
      bet(ids[0], week, 2);
      runAt(week + 1);
    }
    bet(ids[0], 4, 1);
    runAt(5);
    assert.equal(leagueById(app.store, l.id).champion_id, ids[0]);
    assert.equal(app.store.get("SELECT COUNT(*) AS n FROM cup_points WHERE source = 'league'").n, 0);
  });

  test('an 8-team playoff with 6 players becomes a 4-team one', () => {
    const ids = players(['Ann', 'Bob', 'Cat', 'Dan', 'Eve', 'Fay']);
    const l = league(ids, { playoffSize: 8 });
    runAt(1);
    assert.equal(leagueById(app.store, l.id).playoff_size, 4);
  });
});
