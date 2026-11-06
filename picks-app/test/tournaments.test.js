import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { closeDueWeeks, standings } from '../src/contest.js';
import { ensureOfficial } from '../src/official.js';
import { etToUtc } from '../src/time.js';
import {
  bySlug, cancelTournament, closeDueTournaments, ensureAutoTournaments, joinTournament, leaveTournament,
  sendStartReminders, standingsOf, windowLabel,
} from '../src/tournaments.js';
import { addBet, addGame, addPlayer, clock, startApp, visible } from './helpers.js';

// Friday Nov 6, 2026, 2:00 PM Eastern (standard time, UTC-5).
const NOW = '2026-11-06T19:00:00.000Z';
const et = (day, hour, minute = 0) => etToUtc(day, hour, minute).toISOString();
const FRI = '20261106';
const SAT = '20261107';
const SUN = '20261108';

let time;
let app;

beforeEach(async () => {
  time = clock(NOW);
  app = await startApp({ time, config: { adminEmails: ['boss@example.com'] } });
});

afterEach(() => app.close());

/** A tournament straight into the table. */
function make({ name = 'Test Cup', slug = name.toLowerCase().replace(/\W+/g, '-'), sports = null, start, end, min = 3, kind = 'custom' }) {
  app.store.run(
    `INSERT INTO tournaments (slug, name, sports, starts_at, ends_at, min_bets, prize, kind, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'Bragging rights', ?, ?)`,
    slug, name, sports?.join(',') ?? null, start, end, min, kind, NOW,
  );
  return bySlug(app.store, slug);
}

/** Join at a given time, straight through the module. */
function enter(t, userId, at = '2026-11-01T00:00:00.000Z') {
  const result = joinTournament(app.store, t, userId, new Date(at));
  assert.ok(result.ok, result.error);
}

/** A straight bet made at `madeAt` (the helper's default is the game's start). */
function bet(userId, { start, madeAt = null, ...rest }) {
  const id = addBet(app.store, { userId, start, ...rest });
  if (madeAt) app.store.run('UPDATE picks SET made_at = ? WHERE id = ?', madeAt, id);
  return id;
}

/** A graded parlay with one leg per sport in `legs`, made at `madeAt`. */
function parlay(userId, { start, legs, profit = 2, result = 'win', madeAt = '2026-11-02T00:00:00.000Z' }) {
  const sport = new Set(legs).size === 1 ? legs[0] : null;
  const id = Number(app.store.run(
    'INSERT INTO parlays (user_id, sport, units, odds, made_at, first_start, result, profit, graded_at) VALUES (?, ?, 1, 264, ?, ?, ?, ?, ?)',
    userId, sport, madeAt, start, result, result ? profit : null, result ? start : null,
  ).lastInsertRowid);
  for (const s of legs) {
    app.store.run(
      "INSERT INTO parlay_legs (parlay_id, game_id, sport, market, side, line, odds, result) VALUES (?, ?, ?, 'ml', 'home', NULL, -110, ?)",
      id, addGame(app.store, { start, sport: s }), s, result ? 'win' : null,
    );
  }
  return id;
}

const names = (rows) => rows.map((r) => `${r.rank ?? '-'} ${r.screen_name} ${r.units}`);

describe('tournaments: what counts', () => {
  test('only graded bets on games that start inside the window, in its sports', () => {
    const t = make({ sports: ['nba'], start: et(FRI, 19), end: et(SAT, 0), min: 1 });
    const ann = addPlayer(app.store, 'Ann');
    enter(t, ann);
    bet(ann, { start: et(FRI, 19), sport: 'nba', profit: 1 }); // the first minute: counts
    bet(ann, { start: et(FRI, 23, 59), sport: 'nba', profit: 2 }); // the last minute: counts
    bet(ann, { start: et(FRI, 18, 59), sport: 'nba', profit: 10 }); // before the window
    bet(ann, { start: et(SAT, 0), sport: 'nba', profit: 10 }); // at the end: out
    bet(ann, { start: et(FRI, 20), sport: 'ncaab', profit: 10 }); // wrong sport
    bet(ann, { start: et(FRI, 20), sport: 'nba', result: null }); // not graded yet
    bet(ann, { start: et(FRI, 20), sport: 'nba', result: 'void' }); // void
    const [row] = standingsOf(app.store, t);
    assert.equal(row.graded, 2);
    assert.equal(row.units, 3);
    assert.equal(windowLabel(t), 'Fri, Nov 6, 7:00 PM – 11:59 PM ET');

    // Every sport when none is set.
    const all = make({ name: 'Open', start: et(FRI, 19), end: et(SAT, 0), min: 1 });
    enter(all, ann);
    assert.equal(standingsOf(app.store, all)[0].units, 13);
  });

  test("bets made before joining don't count", () => {
    const t = make({ sports: ['nfl'], start: et(SUN, 13), end: et('20261109', 0), min: 1 });
    const ann = addPlayer(app.store, 'Ann');
    enter(t, ann, et(SAT, 12));
    bet(ann, { start: et(SUN, 13), madeAt: et(SAT, 11, 59), profit: 5 });
    bet(ann, { start: et(SUN, 16), madeAt: et(SAT, 12), profit: 1 });
    bet(ann, { start: et(SUN, 20), madeAt: et(SUN, 9), profit: 2 });
    assert.deepEqual(names(standingsOf(app.store, t)), ['1 Ann 3']);
  });

  test('a parlay counts for a sport only when every leg is in its sports', () => {
    const start = et(FRI, 20);
    const ann = addPlayer(app.store, 'Ann');
    parlay(ann, { start, legs: ['nba', 'nba'], profit: 1 });
    parlay(ann, { start, legs: ['nba', 'ncaab'], profit: 2 });
    parlay(ann, { start, legs: ['nba', 'nfl'], profit: 4 });
    const window = { start: et(FRI, 0), end: et(SAT, 0), min: 1 };
    const nba = make({ name: 'NBA only', sports: ['nba'], ...window });
    const hoops = make({ name: 'Hoops', sports: ['nba', 'ncaab'], ...window });
    const all = make({ name: 'Everything', ...window });
    for (const t of [nba, hoops, all]) enter(t, ann);
    assert.equal(standingsOf(app.store, nba)[0].units, 1);
    assert.equal(standingsOf(app.store, hoops)[0].units, 3);
    assert.equal(standingsOf(app.store, all)[0].units, 7);
  });

  test('the minimum to place, ties by ROI then whose last bet started first, and the rest listed below', async () => {
    const t = make({ start: et(FRI, 0), end: et(SAT, 0), min: 3 });
    const [ann, bob, cal, dee, eve] = ['Ann', 'Bob', 'Cal', 'Dee', 'Eve'].map((n) => addPlayer(app.store, n));
    for (const id of [ann, bob, cal, dee, eve]) enter(t, id);
    // Ann and Bob: 3u each, Ann on less risked (better ROI).
    for (let i = 0; i < 3; i++) bet(ann, { start: et(FRI, 12), units: 1, profit: 1 });
    for (let i = 0; i < 3; i++) bet(bob, { start: et(FRI, 12), units: 2, profit: 1 });
    // Cal and Dee: same units and ROI; Dee's last bet started first.
    for (let i = 0; i < 2; i++) bet(cal, { start: et(FRI, 10), profit: 1 });
    for (let i = 0; i < 2; i++) bet(dee, { start: et(FRI, 10), profit: 1 });
    bet(cal, { start: et(FRI, 15), result: 'loss' });
    bet(dee, { start: et(FRI, 14), result: 'loss' });
    // Eve is way up, on 2 bets: below the placed ones, with how many she needs.
    for (let i = 0; i < 2; i++) bet(eve, { start: et(FRI, 12), profit: 5 });
    assert.deepEqual(names(standingsOf(app.store, t)), ['1 Ann 3', '2 Bob 3', '3 Dee 1', '4 Cal 1', '- Eve 10']);

    const page = visible((await app.browser().get(`/tournaments/${t.slug}`)).text);
    assert.match(page, /Eve 1 more bet to place/);
  });

  test("entrants show with no bets; the official account can't join", async () => {
    const t = make({ start: et(SAT, 0), end: et(SUN, 0) });
    const ann = addPlayer(app.store, 'Ann');
    enter(t, ann);
    const official = ensureOfficial(app.store, time.now());
    const result = joinTournament(app.store, t, official, time.now());
    assert.match(result.error, /official account/);
    assert.equal(app.store.get('SELECT COUNT(*) AS n FROM tournament_entries WHERE user_id = ?', official).n, 0);
    assert.deepEqual(names(standingsOf(app.store, t)), ['- Ann 0']);
  });

  test('free only: the database refuses any entry fee', () => {
    const t = make({ start: et(SAT, 0), end: et(SUN, 0) });
    assert.equal(t.entry_fee_cents, 0);
    assert.throws(() => app.store.run('UPDATE tournaments SET entry_fee_cents = 500 WHERE id = ?', t.id), /CHECK constraint failed/);
    assert.throws(() => app.store.run(
      `INSERT INTO tournaments (slug, name, starts_at, ends_at, min_bets, kind, created_at, entry_fee_cents)
       VALUES ('paid', 'Paid', ?, ?, 3, 'custom', ?, 100)`,
      et(SAT, 0), et(SUN, 0), NOW,
    ), /CHECK constraint failed/);
  });
});

describe('tournaments: joining and leaving', () => {
  test('join free in one tap, leave before the start, stuck in after it', async () => {
    const t = make({ name: 'Saturday Cup', sports: ['ncaaf'], start: et(SAT, 12), end: et(SUN, 0) });
    const ann = app.browser();
    await ann.join('ann@example.com', 'Ann');
    const hub = await ann.get('/tournaments');
    assert.match(hub.text, /action="\/tournaments\/saturday-cup\/join"/);

    const joined = await ann.post('/tournaments/saturday-cup/join', { next: '/tournaments' });
    assert.equal(joined.location, '/tournaments');
    assert.match(visible((await ann.get('/tournaments')).text), /Saturday Cup .*Joined/);
    assert.equal(app.store.get('SELECT joined_at FROM tournament_entries WHERE tournament_id = ?', t.id).joined_at, NOW);

    assert.equal((await ann.post('/tournaments/saturday-cup/leave')).status, 303);
    assert.equal(app.store.get('SELECT COUNT(*) AS n FROM tournament_entries').n, 0);

    await ann.post('/tournaments/saturday-cup/join');
    time.set(et(SAT, 12, 1));
    const page = await ann.get('/tournaments/saturday-cup');
    assert.doesNotMatch(page.text, /\/leave"/, 'no Leave once it starts');
    await ann.post('/tournaments/saturday-cup/leave');
    assert.match(visible((await ann.get('/tournaments/saturday-cup')).text), /It's started, so you're in until the end/);
    assert.equal(app.store.get('SELECT COUNT(*) AS n FROM tournament_entries').n, 1);
    assert.match(leaveTournament(app.store, t, 1, time.now()).error, /started/);

    // Join is open until the end, and closed after.
    const bob = addPlayer(app.store, 'Bob');
    assert.ok(joinTournament(app.store, t, bob, new Date(et(SAT, 23, 59))).ok);
    assert.match(joinTournament(app.store, t, bob, new Date(et(SUN, 0))).error, /over/);
  });

  test('the hub: live, starting soon and finished, with Free, sports, window, entrants and your place', async () => {
    const ann = app.browser();
    await ann.join('ann@example.com', 'Ann');
    const annId = app.store.get("SELECT id FROM users WHERE screen_name = 'Ann'").id;
    const live = make({ name: 'Live Cup', sports: ['nba', 'ncaab'], start: et(FRI, 13), end: et(SAT, 0), min: 1 });
    make({ name: 'Soon Cup', sports: ['nfl'], start: et(SUN, 13), end: et('20261109', 0) });
    const done = make({ name: 'Done Cup', start: et('20261105', 0), end: et(FRI, 0), min: 1 });
    enter(live, annId);
    enter(done, annId);
    bet(annId, { start: et(FRI, 13, 30), sport: 'nba', madeAt: et(FRI, 13), profit: 2 });
    bet(annId, { start: et('20261105', 20), sport: 'nfl', madeAt: et('20261105', 12), profit: 1 });
    closeDueTournaments(app.store, time.now(), app.notifier);

    const text = visible((await ann.get('/tournaments')).text);
    assert.match(text, /Live now Live Cup Free NBA CBB Fri, Nov 6, 1:00 PM – 11:59 PM ET 1 entrant Ends in 10 hours, 0 minutes .* You're #1/);
    assert.match(text, /Starting soon Soon Cup Free NFL Sun, Nov 8, 1:00 PM – 11:59 PM ET 0 entrants Starts in 1 day, 23 hours .* Join/);
    assert.match(text, /Finished Done Cup Free All sports Thu, Nov 5, 12:00 AM – 11:59 PM ET 1 entrant Won by Ann \( \+1u \) .* You finished #1/);
    assert.match((await ann.get('/tournaments')).text, /href="\/winners\?tab=tournaments"/);
    // Public, like the contest.
    assert.equal((await app.browser().get('/tournaments')).status, 200);
    assert.equal((await app.browser().get(`/tournaments/${live.slug}`)).status, 200);
    assert.equal((await app.browser().get('/tournaments/no-such-thing')).status, 404);
  });
});

describe('tournaments: closing', () => {
  test('closes once after the end when everything is graded, with badges and notifications', async () => {
    const t = make({ name: 'NFL Test', sports: ['nfl'], start: et(SUN, 13), end: et('20261109', 0), min: 1 });
    const [ann, bob, cal, dee] = ['Ann', 'Bob', 'Cal', 'Dee'].map((n) => addPlayer(app.store, n));
    for (const id of [ann, bob, cal, dee]) enter(t, id);
    bet(ann, { start: et(SUN, 13), profit: 3 });
    bet(bob, { start: et(SUN, 13), profit: 2 });
    bet(cal, { start: et(SUN, 13), profit: 1 });
    bet(dee, { start: et(SUN, 13), result: 'loss' });
    const open = bet(dee, { start: et(SUN, 20, 20), result: null });

    time.set(et(SUN, 23));
    assert.deepEqual(closeDueTournaments(app.store, time.now(), app.notifier), [], 'not over yet');
    time.set(et('20261109', 1));
    assert.deepEqual(closeDueTournaments(app.store, time.now(), app.notifier), [], "Dee's bet is still out");

    app.store.run("UPDATE picks SET result = 'loss', profit = -1 WHERE id = ?", open);
    const [closed] = closeDueTournaments(app.store, time.now(), app.notifier);
    assert.equal(closed.slug, t.slug);
    const rows = app.store.all('SELECT place, user_id, units, record FROM tournament_results WHERE tournament_id = ? ORDER BY place', t.id);
    assert.deepEqual(rows.map((r) => ({ ...r })), [
      { place: 1, user_id: ann, units: 3, record: '1-0' },
      { place: 2, user_id: bob, units: 2, record: '1-0' },
      { place: 3, user_id: cal, units: 1, record: '1-0' },
    ]);
    const notes = (id) => app.store.all("SELECT text, url FROM notifications WHERE user_id = ? AND kind = 'tournament'", id).map((n) => n.text);
    assert.deepEqual(notes(ann), ['You finished #1 in NFL Test (+3u).']);
    assert.deepEqual(notes(cal), ['You finished #3 in NFL Test (+1u).']);
    assert.deepEqual(notes(dee), ['NFL Test is final: Ann won it (+3u).']);
    const badges = (id) => app.store.all("SELECT key, ref, detail FROM badges WHERE user_id = ? AND key LIKE 'tournament%' ORDER BY key", id).map((b) => ({ ...b }));
    assert.deepEqual(badges(ann), [
      { key: 'tournament_champion', ref: t.slug, detail: 'NFL Test, Nov 8, 2026' },
      { key: 'tournament_podium', ref: '', detail: '#1, NFL Test, Nov 8, 2026' },
    ]);
    assert.deepEqual(badges(bob).map((b) => b.key), ['tournament_podium']);
    assert.deepEqual(badges(dee), []);
    assert.match(app.store.get("SELECT text FROM notifications WHERE user_id = ? AND kind = 'badge'", ann).text, /New badges: Tournament champion, Tournament podium/);

    // Again, after a late change: nothing moves, nobody hears twice.
    bet(dee, { start: et(SUN, 21), profit: 9 });
    time.set(et('20261110', 12));
    assert.deepEqual(closeDueTournaments(app.store, time.now(), app.notifier), []);
    assert.equal(app.store.get('SELECT COUNT(*) AS n FROM tournament_results').n, 3);
    assert.equal(app.store.get("SELECT COUNT(*) AS n FROM notifications WHERE kind = 'tournament'").n, 4);

    // The page shows the final podium, and the winners wall has a tab for it.
    const page = visible((await app.browser().get(`/tournaments/${t.slug}`)).text);
    assert.match(page, /Final podium #1 Ann 1-0 \+3u #2 Bob 1-0 \+2u #3 Cal 1-0 \+1u/);
    const wall = visible((await app.browser().get('/winners?tab=tournaments')).text);
    assert.match(wall, /Most tournament wins Ann · 1 win/);
    assert.match(wall, /NFL Test Sun, Nov 8, 1:00 PM – 11:59 PM ET #1 Ann/);
  });

  test('30 hours after the end at the latest, leaving out what never got graded', () => {
    const t = make({ start: et(FRI, 0), end: et(SAT, 0), min: 1 });
    const ann = addPlayer(app.store, 'Ann');
    const bob = addPlayer(app.store, 'Bob');
    enter(t, ann);
    enter(t, bob);
    bet(ann, { start: et(FRI, 12), profit: 1 });
    bet(bob, { start: et(FRI, 23), result: null, units: 5 });
    time.set(new Date(new Date(et(SAT, 0)).getTime() + 30 * 3600_000 - 60_000));
    assert.deepEqual(closeDueTournaments(app.store, time.now(), app.notifier), []);
    time.advance(60_000);
    const [closed] = closeDueTournaments(app.store, time.now(), app.notifier);
    assert.deepEqual(closed.podium.map((r) => r.screen_name), ['Ann']);
  });

  test('an ungraded bet from a non-entrant, or made before joining, never holds it up', () => {
    const t = make({ start: et(FRI, 0), end: et(SAT, 0), min: 1 });
    const ann = addPlayer(app.store, 'Ann');
    const bob = addPlayer(app.store, 'Bob');
    enter(t, ann, et(FRI, 10));
    bet(ann, { start: et(FRI, 12), madeAt: et(FRI, 11), profit: 1 });
    bet(ann, { start: et(FRI, 22), madeAt: et(FRI, 9), result: null });
    bet(bob, { start: et(FRI, 22), result: null });
    time.set(et(SAT, 1));
    assert.equal(closeDueTournaments(app.store, time.now(), app.notifier).length, 1);
  });

  test('"starts in 1 hour" once per entrant, only with the setting on', () => {
    const t = make({ name: 'NFL Sunday', sports: ['nfl'], start: et(SUN, 13), end: et('20261109', 0) });
    const [ann, bob] = ['Ann', 'Bob'].map((n) => addPlayer(app.store, n));
    enter(t, ann);
    enter(t, bob);
    app.store.run('UPDATE users SET notify_tournaments = 0 WHERE id = ?', bob);
    time.set(et(SUN, 11, 55));
    assert.equal(sendStartReminders(app.store, time.now(), app.notifier), 0, 'too early');
    time.set(et(SUN, 12, 1));
    assert.equal(sendStartReminders(app.store, time.now(), app.notifier), 1);
    time.set(et(SUN, 12, 6));
    assert.equal(sendStartReminders(app.store, time.now(), app.notifier), 0, 'once');
    const notes = app.store.all("SELECT user_id, text, url FROM notifications WHERE kind = 'tournament'");
    assert.deepEqual(notes.map((n) => ({ ...n })), [{ user_id: ann, text: 'NFL Sunday starts in 1 hour.', url: `/tournaments/${t.slug}` }]);
  });
});

describe('tournaments: auto and weekly', () => {
  test('auto tournaments are made about two days ahead, once, and skipped with no games', async () => {
    // Friday: NBA tonight. Saturday: college basketball only. Sunday: NFL and NBA. No college football anywhere.
    addGame(app.store, { start: et(FRI, 19, 30), sport: 'nba', state: 'pre' });
    addGame(app.store, { start: et(SAT, 12), sport: 'ncaab', state: 'pre' });
    addGame(app.store, { start: et(SUN, 13), sport: 'nfl', state: 'pre' });
    addGame(app.store, { start: et(SUN, 16, 25), sport: 'nfl', state: 'pre' });
    addGame(app.store, { start: et(SUN, 19), sport: 'nba', state: 'pre' });
    // Monday is three days out: not yet.
    addGame(app.store, { start: et('20261109', 20, 15), sport: 'nfl', state: 'pre' });
    addGame(app.store, { start: et('20261109', 19), sport: 'nba', state: 'pre' });

    const made = await ensureAutoTournaments(app.store, time.now());
    assert.deepEqual(made.sort(), [
      'hoops-night-2026-11-06', 'hoops-night-2026-11-07', 'hoops-night-2026-11-08', 'nfl-sunday-2026-11-08', 'weekly-open-2026-11-02',
    ]);
    assert.deepEqual(await ensureAutoTournaments(app.store, time.now()), [], 'made once');
    assert.equal(app.store.get('SELECT COUNT(*) AS n FROM tournaments').n, 5);

    const nfl = bySlug(app.store, 'nfl-sunday-2026-11-08');
    assert.deepEqual({ ...nfl, id: 0, created_at: 0 }, {
      id: 0, slug: 'nfl-sunday-2026-11-08', name: 'NFL Sunday', sports: 'nfl', starts_at: et(SUN, 13), ends_at: et('20261109', 0),
      min_bets: 3, prize: 'Tournament champion badge and a spot on the winners wall', kind: 'auto', created_by: null, created_at: 0,
      closed_at: null, canceled_at: null, entry_fee_cents: 0,
    });
    assert.equal(bySlug(app.store, 'hoops-night-2026-11-07').starts_at, et(SAT, 12), 'starts at its first game');
    assert.equal(bySlug(app.store, 'hoops-night-2026-11-07').sports, 'nba,ncaab');
    assert.equal(bySlug(app.store, 'hoops-night-2026-11-06').min_bets, 2);

    // A game turns up later for Saturday's college football: it's made then. A canceled one isn't made again.
    addGame(app.store, { start: et(SAT, 15, 30), sport: 'ncaaf', state: 'pre' });
    assert.deepEqual(await ensureAutoTournaments(app.store, time.now()), ['college-saturday-2026-11-07']);
    assert.ok(cancelTournament(app.store, bySlug(app.store, 'college-saturday-2026-11-07'), time.now()).ok);
    assert.deepEqual(await ensureAutoTournaments(app.store, time.now()), []);

    // Saturday: Monday is two days off, so next week's Weekly Open and Monday's Hoops Night.
    time.set(et(SAT, 9));
    assert.deepEqual((await ensureAutoTournaments(app.store, time.now())).sort(), ['hoops-night-2026-11-09', 'weekly-open-2026-11-09']);
  });

  test('the off-season makes nothing but the Weekly Open', async () => {
    assert.deepEqual(await ensureAutoTournaments(app.store, time.now()), ['weekly-open-2026-11-02']);
  });

  test('The Weekly Open is the weekly contest: same standings as /contest, everyone in, closed with the week', async () => {
    await ensureAutoTournaments(app.store, time.now());
    const weekly = bySlug(app.store, 'weekly-open-2026-11-02');
    assert.equal(weekly.kind, 'weekly');
    const official = ensureOfficial(app.store, time.now());
    const [ann, bob, cal] = ['Ann', 'Bob', 'Cal'].map((n) => addPlayer(app.store, n));
    for (let i = 0; i < 6; i++) bet(official, { start: et('20261104', 19), profit: 3 });
    for (let i = 0; i < 5; i++) bet(ann, { start: et('20261104', 19), profit: 1 });
    for (let i = 0; i < 5; i++) bet(bob, { start: et('20261103', 19), profit: 2 });
    for (let i = 0; i < 4; i++) bet(cal, { start: et('20261105', 19), profit: 4 });
    parlay(ann, { start: et('20261105', 20), legs: ['nfl', 'nba'], profit: 1.5 });

    assert.deepEqual(standingsOf(app.store, weekly), standings(app.store, '20261102'));
    const contest = (await app.browser().get('/contest')).text;
    const page = (await app.browser().get('/tournaments/weekly-open-2026-11-02')).text;
    const order = (text) => [...text.matchAll(/<a class="who" href="\/u\/(\w+)">[\s\S]*?<b><span class="\w+">([^<]+)<\/span><\/b>/g)].map((m) => `${m[1]} ${m[2]}`);
    assert.deepEqual(order(page), order(contest));
    assert.deepEqual(order(page), ['BookieBullies +18u', 'Bob +10u', 'Ann +6.5u', 'Cal +16u']);
    assert.match(visible(page), /Everyone's in\. No need to join/);
    assert.doesNotMatch(page, /\/join"/);
    assert.match(joinTournament(app.store, weekly, ann, time.now()).error, /Everyone's in/);

    // Closing the week closes the tournament; the podium is the contest's.
    time.set(et('20261110', 6));
    closeDueWeeks(app.store, time.now(), app.notifier);
    closeDueTournaments(app.store, time.now(), app.notifier);
    assert.ok(bySlug(app.store, weekly.slug).closed_at);
    const closedPage = visible((await app.browser().get('/tournaments/weekly-open-2026-11-02')).text);
    assert.match(closedPage, /Final podium #1 Bob 5-0 \+10u #2 Ann 6-0 \+6.5u/);
    assert.equal(app.store.get("SELECT COUNT(*) AS n FROM notifications WHERE kind = 'tournament'").n, 0, 'the weekly sends its own contest notes');
    assert.equal(app.store.get("SELECT COUNT(*) AS n FROM notifications WHERE kind = 'contest'").n, 2);
  });
});

describe('tournaments: admin', () => {
  async function boss() {
    const b = app.browser();
    await b.join('boss@example.com', 'Boss');
    return b;
  }

  test('admins make one and cancel it before the start; everyone else gets a 404', async () => {
    const b = await boss();
    const page = await b.get('/admin/tournaments');
    assert.equal(page.status, 200);
    assert.match(visible((await b.get('/more')).text), /Admin: tournaments/);

    const bad = await b.post('/admin/tournaments', { name: 'X', start_date: '2026-11-07', start_time: '12:00', end_date: '2026-11-07', end_time: '23:59', min_bets: '3' });
    assert.equal(bad.status, 400);
    assert.match(visible(bad.text), /Give it a name of 3 to 60 characters/);
    const backwards = await b.post('/admin/tournaments', { name: 'Backwards', start_date: '2026-11-08', start_time: '12:00', end_date: '2026-11-07', end_time: '23:59', min_bets: '3' });
    assert.match(visible(backwards.text), /The end has to come after the start/);

    const form = new URLSearchParams({
      _csrf: b.csrf, name: 'Bullies Hoops Cup', start_date: '2026-11-07', start_time: '12:00', end_date: '2026-11-08', end_time: '23:59', min_bets: '4', prize: 'A shout-out on the site',
    });
    form.append('sports', 'nba');
    form.append('sports', 'ncaab');
    const made = await b.request('/admin/tournaments', { method: 'POST', body: form, headers: { 'content-type': 'application/x-www-form-urlencoded', origin: b.base } });
    assert.equal(made.status, 303);
    assert.equal(made.location, '/tournaments/bullies-hoops-cup-2026-11-07');
    const t = bySlug(app.store, 'bullies-hoops-cup-2026-11-07');
    assert.deepEqual(
      { sports: t.sports, starts_at: t.starts_at, ends_at: t.ends_at, min_bets: t.min_bets, prize: t.prize, kind: t.kind, entry_fee_cents: t.entry_fee_cents },
      { sports: 'nba,ncaab', starts_at: et(SAT, 12), ends_at: et('20261109', 0), min_bets: 4, prize: 'A shout-out on the site', kind: 'custom', entry_fee_cents: 0 },
    );
    assert.match(visible((await b.get(made.location)).text), /Bullies Hoops Cup Free NBA CBB 0 entrants Sat, Nov 7, 12:00 PM – Sun, Nov 8, 11:59 PM ET/);

    // Someone joins; non-admins can't see the page or cancel.
    const ann = app.browser();
    await ann.join('ann@example.com', 'Ann');
    await ann.post(`/tournaments/${t.slug}/join`);
    assert.equal((await ann.get('/admin/tournaments')).status, 404);
    assert.equal((await app.browser().get('/admin/tournaments')).status, 404);
    await ann.get('/tournaments');
    assert.equal((await ann.post('/admin/tournaments', { name: 'Sneaky', start_date: '2026-11-07', start_time: '12:00', end_date: '2026-11-07', end_time: '23:59', min_bets: '3' })).status, 404);
    assert.equal((await ann.post(`/admin/tournaments/${t.slug}/cancel`)).status, 404);
    assert.ok(bySlug(app.store, t.slug));

    // The admin cancels it: gone from the hub, and Ann hears.
    await b.get('/admin/tournaments');
    assert.equal((await b.post(`/admin/tournaments/${t.slug}/cancel`)).status, 303);
    assert.equal(bySlug(app.store, t.slug), null);
    assert.equal((await ann.get(`/tournaments/${t.slug}`)).status, 404);
    assert.match(app.store.get("SELECT text FROM notifications WHERE kind = 'tournament'").text, /Bullies Hoops Cup was canceled before it started/);

    // Not once it's started.
    const live = make({ name: 'Live One', start: et(FRI, 12), end: et(SAT, 0) });
    await b.get('/admin/tournaments');
    await b.post(`/admin/tournaments/${live.slug}/cancel`);
    assert.match(visible((await b.get('/admin/tournaments')).text), /It's already started, so it can't be canceled/);
    assert.ok(bySlug(app.store, live.slug));
  });
});

describe('tab bar', () => {
  test('Tournaments is a tab; Profile is the avatar up top and first in More', async () => {
    const ann = app.browser();
    await ann.join('ann@example.com', 'Ann');
    const games = await ann.get('/games');
    const tabbar = games.text.match(/<nav class="tabbar"[\s\S]*?<\/nav>/)[0];
    const tabs = [...tabbar.matchAll(/<a href="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(tabs, ['/games', '/picks', '/tournaments', '/leaderboard', '/groups', '/more']);
    assert.match(visible(tabbar), /Tourneys/);
    assert.doesNotMatch(tabbar, /\/u\/Ann/);
    assert.match(games.text, /<a class="user-chip [^"]*" href="\/u\/Ann">/);
    const more = visible((await ann.get('/more')).text);
    assert.match(more, /More Everything else in the app\. Your profile Your record, badges and settings/);
    assert.match((await ann.get('/tournaments')).text, /<a href="\/tournaments" class="on" aria-current="page">/);
  });

  test('the start reminder has its own setting, on by default', async () => {
    const ann = app.browser();
    await ann.join('ann@example.com', 'Ann');
    assert.match((await ann.get('/notifications')).text, /name="tournaments" checked/);
    await ann.post('/notifications/settings', { settled: 'on' });
    assert.equal(app.store.get("SELECT notify_tournaments FROM users WHERE screen_name = 'Ann'").notify_tournaments, 0);
    await ann.post('/notifications/settings', { tournaments: 'on' });
    assert.equal(app.store.get("SELECT notify_tournaments FROM users WHERE screen_name = 'Ann'").notify_tournaments, 1);
  });
});
