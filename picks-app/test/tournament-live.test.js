// Live "As it stands" standings and the "where you stand" alerts.

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { etToUtc } from '../src/time.js';
import {
  bySlug, closeDueTournaments, joinTournament, liveStandingsOf, sendFinalHoursAlerts, sendMoveAlerts, standingsOf,
} from '../src/tournaments.js';
import { addBet, addGame, addPlayer, clock, startApp, visible } from './helpers.js';

// Friday Nov 6, 2026, 2:00 PM Eastern.
const NOW = '2026-11-06T19:00:00.000Z';
const et = (day, hour, minute = 0) => etToUtc(day, hour, minute).toISOString();
const FRI = '20261106';
const SAT = '20261107';
const JOINED = '2026-11-01T00:00:00.000Z';
const HOUR = 3_600_000;

let time;
let app;

beforeEach(async () => {
  time = clock(NOW);
  app = await startApp({ time });
});

afterEach(() => app.close());

function make({ name = 'Hoops Night', sports = ['nba'], start = et(FRI, 12), end = et(SAT, 0), min = 1 } = {}) {
  const slug = name.toLowerCase().replace(/\W+/g, '-');
  app.store.run(
    `INSERT INTO tournaments (slug, name, sports, starts_at, ends_at, min_bets, prize, kind, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'Bragging rights', 'custom', ?)`,
    slug, name, sports?.join(',') ?? null, start, end, min, NOW,
  );
  return bySlug(app.store, slug);
}

function players(t, names) {
  return names.map((n) => {
    const id = addPlayer(app.store, n);
    assert.ok(joinTournament(app.store, t, id, new Date(JOINED)).ok);
    return id;
  });
}

/** A game under way right now: Lakers at Celtics, with the score as it stands. */
let made = 0;
function liveGame({ start = et(FRI, 13, 30), sport = 'nba', home = 60, away = 50 } = {}) {
  const id = `${sport}:live${++made}`;
  app.store.run(
    `INSERT INTO games (id, sport, start_time, state, status, detail, completed, home_name, home_short, home_abbr, home_score,
                        away_name, away_short, away_abbr, away_score, lines, updated_at)
     VALUES (?, ?, ?, 'in', 'STATUS_IN_PROGRESS', '3rd Qtr', 0, 'Celtics', 'Celtics', 'BOS', ?, 'Lakers', 'Lakers', 'LAL', ?, '{}', ?)`,
    id, sport, start, home, away, start,
  );
  return id;
}

/** An open straight pick on a game, made at `madeAt`. */
function pick(userId, gameId, { market, side, line = null, odds = -110, units = 1, madeAt = et(FRI, 12, 30), sport = 'nba' }) {
  const start = app.store.get('SELECT start_time FROM games WHERE id = ?', gameId).start_time;
  return Number(app.store.run(
    `INSERT INTO picks (user_id, game_id, sport, market, side, line, odds, units, game_start, made_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    userId, gameId, sport, market, side, line, odds, units, start, madeAt,
  ).lastInsertRowid);
}

/** An open parlay: each leg { gameId, market, side, result }. */
function parlay(userId, legs, { units = 1, madeAt = et(FRI, 12, 15) } = {}) {
  const starts = legs.map((l) => app.store.get('SELECT start_time FROM games WHERE id = ?', l.gameId).start_time).sort();
  const id = Number(app.store.run(
    "INSERT INTO parlays (user_id, sport, units, odds, made_at, first_start) VALUES (?, 'nba', ?, 264, ?, ?)",
    userId, units, madeAt, starts[0],
  ).lastInsertRowid);
  for (const l of legs) {
    app.store.run(
      "INSERT INTO parlay_legs (parlay_id, game_id, sport, market, side, line, odds, result) VALUES (?, ?, 'nba', ?, ?, NULL, -110, ?)",
      id, l.gameId, l.market ?? 'ml', l.side ?? 'home', l.result ?? null,
    );
  }
  return id;
}

const order = (rows) => rows.map((r) => r.screen_name);

describe('as it stands', () => {
  /**
   * Graded: Ann +2, Bob +1, Cal +0.5, Dee −1. Then, with Celtics 60, Lakers 50:
   * Dee's Celtics −4.5 (3u) is winning, Ann's Lakers moneyline (2u) is losing,
   * Cal's over 110 is a push, and Bob's 2-leg parlay has one leg won and the
   * other (Celtics moneyline) winning.
   */
  function scene() {
    const t = make();
    const [ann, bob, cal, dee] = players(t, ['Ann', 'Bob', 'Cal', 'Dee']);
    addBet(app.store, { userId: ann, start: et(FRI, 13), sport: 'nba', profit: 2 });
    addBet(app.store, { userId: bob, start: et(FRI, 13), sport: 'nba', profit: 1 });
    addBet(app.store, { userId: cal, start: et(FRI, 13), sport: 'nba', profit: 0.5 });
    addBet(app.store, { userId: dee, start: et(FRI, 13), sport: 'nba', result: 'loss' });
    const g = liveGame();
    const picks = [
      pick(dee, g, { market: 'spread', side: 'home', line: -4.5, units: 3 }),
      pick(ann, g, { market: 'ml', side: 'away', odds: 150, units: 2 }),
      pick(cal, g, { market: 'total', side: 'over', line: 110 }),
      // Made before Ann joined: never counts, live or not.
      pick(ann, g, { market: 'spread', side: 'away', line: 4.5, madeAt: '2026-10-31T00:00:00.000Z' }),
    ];
    const done = addGame(app.store, { start: et(FRI, 12, 30), sport: 'nba' });
    parlay(bob, [{ gameId: done, result: 'win' }, { gameId: g }]);
    // A parlay with a leg still to start stands nowhere yet.
    const later = addGame(app.store, { start: et(FRI, 21), sport: 'nba', state: 'pre' });
    parlay(cal, [{ gameId: g }, { gameId: later }]);
    // Another sport doesn't count in Hoops Night.
    const hockey = liveGame({ sport: 'nhl', home: 1, away: 4 });
    pick(dee, hockey, { market: 'ml', side: 'away', units: 5, sport: 'nhl' });
    return { t, picks };
  }

  test('winning, losing and push in progress, graded at the current score; the record is never touched', () => {
    const { t, picks } = scene();
    const rows = liveStandingsOf(app.store, t);
    const by = Object.fromEntries(rows.map((r) => [r.screen_name, r]));
    assert.deepEqual(order(rows), ['Bob', 'Dee', 'Cal', 'Ann']);
    // Dee: −1 + 2.73 on 3u at −110. Ann: +2 − 2. Cal: a push. Bob: +1 + the parlay at +264.
    assert.deepEqual(
      Object.fromEntries(rows.map((r) => [r.screen_name, [r.units, `${r.wins}-${r.losses}-${r.pushes}`, r.live, r.move, r.rank]])),
      { Bob: [3.64, '2-0-0', 1, 1, 1], Dee: [1.73, '1-1-0', 1, 2, 2], Cal: [0.5, '1-0-1', 1, 0, 3], Ann: [0, '1-1-0', 1, -3, 4] },
    );
    assert.equal(by.Dee.graded, 2, 'a live bet counts toward the minimum while it stands');
    // Nothing was written: the picks are still open and the graded order is as it was.
    for (const id of picks) assert.equal(app.store.get('SELECT result FROM picks WHERE id = ?', id).result, null);
    assert.equal(app.store.get('SELECT COUNT(*) AS n FROM parlays WHERE result IS NOT NULL').n, 0);
    assert.deepEqual(order(standingsOf(app.store, t)), ['Ann', 'Bob', 'Cal', 'Dee']);
  });

  test('the page shows As it stands with arrows and live tags, labeled, and polls every 45 seconds', async () => {
    const { t } = scene();
    const page = await app.browser().get(`/tournaments/${t.slug}`);
    assert.equal(page.status, 200);
    const text = visible(page.text);
    assert.match(text, /As it stands Live: counts games in progress\. Final standings use final scores\./);
    assert.match(page.text, /<div class="tn-standings" data-live-poll data-poll-every="45">/);
    assert.match(text, /1 ▲1 up 1 B Bob 1 live 2-0 \+3\.64u/);
    assert.match(text, /2 ▲2 up 2 D Dee 1 live 1-1 \+1\.73u/);
    assert.match(text, /3 C Cal 1 live 1-0-1 \+0\.5u/);
    assert.match(text, /4 ▼3 down 3 A Ann 1 live 1-1 0u/);
    assert.doesNotMatch(text, /Standings Ann/);
  });

  test('final results ignore games in progress: closing uses graded bets only', () => {
    const { t } = scene();
    time.set(new Date(new Date(t.ends_at).getTime() + 30 * HOUR).toISOString());
    const [closed] = closeDueTournaments(app.store, time.now(), app.notifier);
    assert.deepEqual(closed.podium.map((r) => `${r.screen_name} ${r.units}`), ['Ann 2', 'Bob 1', 'Cal 0.5']);
  });

  test('before the start and after the end, the page shows the plain standings', async () => {
    const soon = make({ name: 'Later Cup', start: et(SAT, 12), end: et('20261108', 0) });
    const text = visible((await app.browser().get(`/tournaments/${soon.slug}`)).text);
    assert.match(text, /Standings Nobody on the board yet/);
    assert.doesNotMatch(text, /As it stands/);
  });
});

describe('where you stand alerts', () => {
  const notes = (id) => app.store.all("SELECT text FROM notifications WHERE user_id = ? AND kind = 'tournament' ORDER BY id", id).map((n) => n.text);

  test('moving into the top 3 from graded standings, at most once in 2 hours, with the setting on, never twice', () => {
    const t = make();
    const [ann, bob, cal, dee] = players(t, ['Ann', 'Bob', 'Cal', 'Dee']);
    // The official account in it by hand: it never ranks, and never hears.
    const official = addPlayer(app.store, 'BookieBullies', { official: true });
    app.store.run('INSERT INTO tournament_entries (tournament_id, user_id, joined_at) VALUES (?, ?, ?)', t.id, official, JOINED);
    const win = (userId, profit) => addBet(app.store, { userId, start: et(FRI, 13), sport: 'nba', profit });
    win(official, 20);
    win(ann, 3.4);
    win(bob, 2);
    win(cal, 1);
    addBet(app.store, { userId: dee, start: et(FRI, 13), sport: 'nba', result: 'loss' });

    assert.equal(sendMoveAlerts(app.store, time.now(), app.notifier), 3);
    assert.deepEqual(notes(ann), ['You moved into 1st in Hoops Night (+3.4u).']);
    assert.deepEqual(notes(bob), ['You moved into 2nd in Hoops Night (+2u).']);
    assert.deepEqual(notes(cal), ['You moved into 3rd in Hoops Night (+1u).']);
    assert.deepEqual(notes(official), []);
    // Again, or after a restart: the places are on the entries, so nothing new.
    assert.equal(sendMoveAlerts(app.store, time.now(), app.notifier), 0);

    // Dee jumps to 1st: she hears; Ann and Bob slip and hear nothing; Cal drops out.
    time.advance(HOUR / 2);
    win(dee, 5);
    assert.equal(sendMoveAlerts(app.store, time.now(), app.notifier), 1);
    assert.deepEqual(notes(dee), ['You moved into 1st in Hoops Night (+4u).']);
    assert.equal(notes(ann).length, 1);

    // Cal climbs back to 1st an hour after his last alert: too soon, so nothing.
    time.advance(HOUR / 2);
    win(cal, 4);
    assert.equal(sendMoveAlerts(app.store, time.now(), app.notifier), 0);
    assert.equal(notes(cal).length, 1);

    // Three hours on, Bob takes 1st: he can hear again.
    time.advance(3 * HOUR);
    win(bob, 10);
    assert.equal(sendMoveAlerts(app.store, time.now(), app.notifier), 1);
    assert.deepEqual(notes(bob).at(-1), 'You moved into 1st in Hoops Night (+12u).');

    // Tournament updates off: Ann takes 1st and hears nothing.
    app.store.run('UPDATE users SET notify_tournament_updates = 0 WHERE id = ?', ann);
    win(ann, 20);
    assert.equal(sendMoveAlerts(app.store, time.now(), app.notifier), 0);
    assert.equal(notes(ann).length, 1);
  });

  test('not before the start, not once it is final, and not for the Weekly Open', () => {
    const soon = make({ name: 'Later Cup', start: et(SAT, 12), end: et('20261108', 0) });
    const [ann] = players(soon, ['Ann']);
    addBet(app.store, { userId: ann, start: et(SAT, 13), sport: 'nba', profit: 1 });
    assert.equal(sendMoveAlerts(app.store, time.now(), app.notifier), 0);
    app.store.run(
      `INSERT INTO tournaments (slug, name, starts_at, ends_at, min_bets, kind, created_at)
       VALUES ('weekly-open-2026-11-02', 'The Weekly Open', ?, ?, 5, 'weekly', ?)`,
      et('20261102', 0), et('20261109', 0), NOW,
    );
    for (let i = 0; i < 5; i++) addBet(app.store, { userId: ann, start: et(FRI, 9), profit: 1 });
    assert.equal(sendMoveAlerts(app.store, time.now(), app.notifier), 0);
  });

  test('"2 hours left": once, about two hours out, to placed entrants 2nd to 10th within 5u, and the leader', () => {
    const t = make({ name: 'NFL Sunday', sports: null, min: 2 });
    const [ann, bob, cal, dee, eve] = players(t, ['Ann', 'Bob', 'Cal', 'Dee', 'Eve']);
    const bet = (userId, profit) => addBet(app.store, profit < 0
      ? { userId, start: et(FRI, 13), result: 'loss', units: -profit }
      : { userId, start: et(FRI, 13), profit });
    [3, 2.5].forEach((p) => bet(ann, p)); // 5.5
    [2, 2.1].forEach((p) => bet(bob, p)); // 4.1
    [1, -0.5].forEach((p) => bet(cal, p)); // 0.5: exactly 5u back
    [-0.5, -0.5].forEach((p) => bet(dee, p)); // −1: too far back
    bet(eve, 9); // one bet: hasn't placed

    const end = new Date(t.ends_at).getTime();
    time.set(new Date(end - 2 * HOUR - 60_000).toISOString());
    assert.equal(sendFinalHoursAlerts(app.store, time.now(), app.notifier), 0, 'too early');
    time.set(new Date(end - 2 * HOUR + 60_000).toISOString());
    assert.equal(sendFinalHoursAlerts(app.store, time.now(), app.notifier), 3);
    assert.deepEqual(notes(ann), ["2 hours left in NFL Sunday. You're in first by 1.4u."]);
    assert.deepEqual(notes(bob), ["2 hours left in NFL Sunday. You're 1.4u out of first."]);
    assert.deepEqual(notes(cal), ["2 hours left in NFL Sunday. You're 5u out of first."]);
    assert.deepEqual(notes(dee), []);
    assert.deepEqual(notes(eve), []);
    // Once: five minutes later, and after a "restart", nothing more.
    time.advance(5 * 60_000);
    assert.equal(sendFinalHoursAlerts(app.store, time.now(), app.notifier), 0);
  });

  test('"2 hours left" stops at 10th, skips players with the setting off, and is never sent late', () => {
    const t = make({ name: 'Big Cup', sports: null });
    const ids = players(t, Array.from({ length: 11 }, (_, i) => `P${i + 1}`));
    ids.forEach((id, i) => addBet(app.store, { userId: id, start: et(FRI, 13), profit: 10 - i / 10 }));
    app.store.run('UPDATE users SET notify_tournament_updates = 0 WHERE id = ?', ids[1]);
    const end = new Date(t.ends_at).getTime();
    // Ten minutes in, it goes; the 11th and the one with it off hear nothing.
    time.set(new Date(end - 2 * HOUR + 10 * 60_000).toISOString());
    assert.equal(sendFinalHoursAlerts(app.store, time.now(), app.notifier), 9);
    assert.deepEqual(notes(ids[10]), []);
    assert.deepEqual(notes(ids[1]), []);
    assert.deepEqual(notes(ids[9]), ["2 hours left in Big Cup. You're 0.9u out of first."]);

    // A tournament nobody checked until 20 minutes in: too late to say "2 hours left".
    const late = make({ name: 'Late Cup', sports: null });
    const [ann] = players(late, ['Ann']);
    addBet(app.store, { userId: ann, start: et(FRI, 13), profit: 1 });
    time.set(new Date(new Date(late.ends_at).getTime() - 2 * HOUR + 20 * 60_000).toISOString());
    assert.equal(sendFinalHoursAlerts(app.store, time.now(), app.notifier), 0);
  });

  test('the Tournament updates setting is on by default, next to the start reminder, and shows in the inbox', async () => {
    const ann = app.browser();
    await ann.join('ann@example.com', 'Ann');
    const id = app.store.get("SELECT id FROM users WHERE screen_name = 'Ann'").id;
    const page = await ann.get('/notifications');
    assert.match(page.text, /name="tournaments" checked[\s\S]*name="tournament_updates" checked/);
    assert.match(visible(page.text), /Tournament updates: I move into the top 3, and where I stand with 2 hours left/);

    // A phone with notifications on.
    const ecdh = crypto.createECDH('prime256v1');
    ecdh.generateKeys();
    const phone = { endpoint: `https://fcm.googleapis.com/fcm/send/${crypto.randomUUID()}`, p256dh: ecdh.getPublicKey().toString('base64url'), auth: crypto.randomBytes(16).toString('base64url') };
    assert.equal((await ann.post('/push/subscribe', phone)).status, 204);

    const t = make();
    assert.ok(joinTournament(app.store, t, id, new Date(JOINED)).ok);
    addBet(app.store, { userId: id, start: et(FRI, 13), sport: 'nba', profit: 1.5 });
    sendMoveAlerts(app.store, time.now(), app.notifier);
    await new Promise((resolve) => setImmediate(resolve));
    assert.match(visible((await ann.get('/notifications')).text), /You moved into 1st in Hoops Night \(\+1\.5u\)\./);
    assert.equal(app.pushed.length, 1, 'and on the phone');

    await ann.post('/notifications/settings', { tournaments: 'on' });
    assert.equal(app.store.get('SELECT notify_tournament_updates AS n FROM users WHERE id = ?', id).n, 0);
    assert.equal(app.store.get('SELECT notify_tournaments AS n FROM users WHERE id = ?', id).n, 1);
    await ann.post('/notifications/settings', { tournaments: 'on', tournament_updates: 'on' });
    assert.equal(app.store.get('SELECT notify_tournament_updates AS n FROM users WHERE id = ?', id).n, 1);
  });
});
