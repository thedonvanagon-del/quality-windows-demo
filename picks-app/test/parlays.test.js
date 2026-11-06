import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { ensureOfficial } from '../src/official.js';
import {
  americanOdds, decimalOdds, MAX_UNITS, PARLAY_MAX_LEGS, parlayMaxUnits, parlayPrice, parlayToWin, settleParlay,
} from '../src/picks.js';
import { breakdown, lastTen, leaderboard, MIN_RANKED, record, recordBySport, splits } from '../src/stats.js';
import { clock, event, setFinal, setLine, startApp, visible } from './helpers.js';

// Sunday 8am Eastern. Three 1pm games, two 4:25s, a night game and an NBA game.
const MORNING = '2026-10-25T12:00:00.000Z';
const ONE = '2026-10-25T17:00:00.000Z';
const FOUR = '2026-10-25T20:25:00.000Z';
const NIGHT = '2026-10-26T00:20:00.000Z';
const LATE = '2026-10-26T08:00:00.000Z';

let time;
let app;
let games;

beforeEach(async () => {
  time = clock(MORNING);
  app = await startApp({ time });
  games = {
    1: event({ id: '1', start: ONE, home: ['Chiefs', 'KC'], away: ['Bills', 'BUF'] }),
    2: event({ id: '2', start: ONE, home: ['Dolphins', 'MIA'], away: ['Jets', 'NYJ'] }),
    3: event({ id: '3', start: FOUR, home: ['49ers', 'SF'], away: ['Rams', 'LAR'] }),
    4: event({ id: '4', start: FOUR, home: ['Packers', 'GB'], away: ['Bears', 'CHI'], spread: -3 }),
    5: event({ id: '5', start: NIGHT, home: ['Cowboys', 'DAL'], away: ['Giants', 'NYG'] }),
    6: event({ id: '6', start: ONE, home: ['Vikings', 'MIN'], away: ['Lions', 'DET'] }),
    7: event({ id: '7', start: ONE, home: ['Commanders', 'WSH'], away: ['Eagles', 'PHI'] }),
  };
  app.espn.events.nfl.push(...Object.values(games));
  games[8] = event({ id: '8', start: '2026-10-25T23:30:00.000Z', home: ['Celtics', 'BOS'], away: ['Lakers', 'LAL'], spread: -5.5, total: 224.5 });
  app.espn.events.nba.push(games[8]);
});

afterEach(() => app.close());

async function player(email, name) {
  const b = app.browser();
  await b.join(email, name);
  await b.get('/games');
  return b;
}

const userId = (name) => app.store.get('SELECT id FROM users WHERE screen_name = ?', name).id;
const draft = (name) => app.store.all('SELECT * FROM parlay_draft_legs WHERE user_id = ? ORDER BY game_id', userId(name));
const parlays = () => app.store.all('SELECT * FROM parlays ORDER BY id');
const legsOf = (id) => app.store.all('SELECT * FROM parlay_legs WHERE parlay_id = ? ORDER BY game_id', id);

/** Add a leg the way the slip's "Add to parlay" button does. */
async function add(b, game, market, side) {
  const sport = game === 'nba:8' ? 'nba' : 'nfl';
  await b.get(`/pick?game=${game}&market=${market}&side=${side}`);
  const res = await b.post('/parlay/legs', { game, market, side, line: '', odds: '', units: '' });
  return { ...res, page: res.location?.startsWith(`/games?sport=${sport}#`) ? await b.get(res.location) : null };
}

/** Open the parlay page and lock it at `units`, as shown. */
async function lock(b, units) {
  const page = await b.get('/parlay');
  const seen = /name="seen" value="([^"]*)"/.exec(page.text)?.[1] ?? '';
  return b.post('/parlays', { units: String(units), seen });
}

/** Ann with a 3-leg parlay at -110 a leg: Bills +3.5, Jets +3.5, Rams +3.5. */
async function threeLegs(units = 0.83) {
  const ann = await player('ann@example.com', 'Ann');
  await add(ann, 'nfl:1', 'spread', 'away');
  await add(ann, 'nfl:2', 'spread', 'away');
  await add(ann, 'nfl:3', 'spread', 'away');
  const res = await lock(ann, units);
  assert.equal(res.location, '/picks', visible(res.text).slice(0, 300));
  return ann;
}

async function finals(scores) {
  for (const [id, home, away] of scores) setFinal(games[id], home, away);
  time.set(LATE);
  await app.games.checkFinals();
}

describe('parlay math', () => {
  test('3 legs at -110 pay +596, so the most is 0.83u', () => {
    const { decimal, american } = parlayPrice([{ odds: -110 }, { odds: -110 }, { odds: -110 }]);
    assert.equal(american, 596);
    assert.equal(parlayMaxUnits(decimal), 0.83);
    assert.equal(parlayToWin(decimal, 0.83), 4.95);
    assert.ok(0.84 * (decimal - 1) > MAX_UNITS, 'one cent more would win over 5u');
  });

  test('converts between American and decimal odds', () => {
    assert.equal(decimalOdds(150), 2.5);
    assert.equal(Math.round(decimalOdds(-200) * 100) / 100, 1.5);
    assert.equal(americanOdds(2.5), 150);
    assert.equal(americanOdds(1.5), -200);
    assert.equal(parlayPrice([{ odds: -500 }, { odds: -500 }]).american, -227);
    assert.equal(parlayMaxUnits(parlayPrice([{ odds: -500 }, { odds: -500 }]).decimal), MAX_UNITS, 'short parlays risk up to 5u');
  });

  test('settles: a loss loses at once, a push drops out, every push pushes', () => {
    const leg = (odds, result = null) => ({ odds, result });
    assert.deepEqual(settleParlay([leg(-110, 'loss'), leg(-110), leg(-110)], 0.83), { result: 'loss', profit: -0.83 }, 'no waiting on the rest');
    assert.equal(settleParlay([leg(-110, 'win'), leg(-110)], 1), null, 'undecided while a leg is open');
    assert.deepEqual(settleParlay([leg(-110, 'win'), leg(-110, 'win'), leg(-110, 'win')], 0.83), { result: 'win', profit: 4.95 });
    // A push drops out: the parlay pays as a 2-legger, +264.
    assert.deepEqual(settleParlay([leg(-110, 'win'), leg(-110, 'push'), leg(-110, 'win')], 0.83), { result: 'win', profit: 2.2 });
    assert.deepEqual(settleParlay([leg(-110, 'win'), leg(-110, 'void')], 1), { result: 'win', profit: 0.91 }, 'a void drops out the same way');
    assert.deepEqual(settleParlay([leg(-110, 'push'), leg(-110, 'push')], 1), { result: 'push', profit: 0 });
    assert.deepEqual(settleParlay([leg(-110, 'void'), leg(-110, 'void')], 1), { result: 'void', profit: 0 });
  });

  test('never wins more than 5u at the most it allows', () => {
    let seed = 42;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 5000; i++) {
      const n = 2 + Math.floor(rand() * (PARLAY_MAX_LEGS - 1));
      const legs = Array.from({ length: n }, () => {
        const odds = rand() < 0.5 ? -(101 + Math.floor(rand() * 600)) : 100 + Math.floor(rand() * 700);
        return { odds, result: rand() < 0.2 ? 'push' : 'win' };
      });
      const most = parlayMaxUnits(parlayPrice(legs).decimal);
      if (most < 0.1) continue;
      assert.ok(most <= MAX_UNITS);
      const settled = settleParlay(legs, most);
      assert.ok(settled.profit <= MAX_UNITS, `${JSON.stringify(legs)} at ${most}u won ${settled.profit}u`);
    }
  });
});

describe('building a parlay', () => {
  test('add legs from the slip, see them on the board and in the bar', async () => {
    const ann = await player('ann@example.com', 'Ann');
    const slip = await ann.get('/pick?game=nfl:1&market=spread&side=away');
    assert.match(slip.text, /<button class="btn" data-busy="Locking it in…">Lock it in<\/button>/);
    assert.match(slip.text, /formaction="\/parlay\/legs" formnovalidate[^>]*>Add to parlay<\/button>/);
    assert.doesNotMatch(slip.text, /class="parlay-bar"/, 'no bar while the draft is empty');

    const first = await add(ann, 'nfl:1', 'spread', 'away');
    assert.equal(first.location, '/games?sport=nfl#g-nfl-1', 'back to the same game');
    assert.match(visible(first.page.text), /Added Bills \+3\.5 to your parlay\. Add a leg from another game\./);
    assert.match(first.page.text, /<a class="cell in-parlay" href="\/pick\?game=nfl%3A1&amp;market=spread&amp;side=away" aria-label="Pick Bills \+3\.5 at -110, in your parlay">/);
    assert.equal((first.page.text.match(/in-parlay/g) ?? []).length, 1, 'only that one cell');
    assert.match(visible(first.page.text), /Parlay · 1 leg · −110 Review/);

    const second = await add(ann, 'nfl:2', 'total', 'over');
    assert.match(visible(second.page.text), /Added Over 47\.5 to your parlay\. 2 legs\./);
    assert.match(second.page.text, /<a class="parlay-bar" href="\/parlay">/);
    assert.match(visible(second.page.text), /Parlay · 2 legs · \+264 Review/);
    assert.match(second.page.text, /class="signed-in has-parlay"/);
    assert.equal(draft('Ann').length, 2);

    // It's kept on the server, so it's there on any page, from any device.
    const again = app.browser();
    await again.post('/login', { email: 'ann@example.com', password: 'correct horse' });
    assert.match(visible((await again.get('/leaderboard')).text), /Parlay · 2 legs · \+264/);
    const page = visible((await again.get('/parlay')).text);
    assert.match(page, /Bills \+3\.5 Spread · Bills @ Chiefs · .*? −110 Remove/);
    assert.match(page, /Over 47\.5 Total · Jets @ Dolphins · .*? −110 Remove/);
    assert.match(page, /Combined odds \+264/);
    assert.match(page, /Lock parlay/);
  });

  test('a leg on a game already in it replaces that leg', async () => {
    const ann = await player('ann@example.com', 'Ann');
    await add(ann, 'nfl:1', 'spread', 'away');
    await add(ann, 'nfl:2', 'spread', 'away');
    const swap = await add(ann, 'nfl:1', 'ml', 'home');
    assert.match(visible(swap.page.text), /Swapped Bills \+3\.5 for Chiefs ML in your parlay\. One leg per game\./);
    const legs = draft('Ann');
    assert.equal(legs.length, 2, 'never two legs on one game');
    assert.deepEqual([legs[0].game_id, legs[0].market, legs[0].side, legs[0].odds], ['nfl:1', 'ml', 'home', -170]);
    assert.match(visible(swap.page.text), /Parlay · 2 legs/);

    const same = await add(ann, 'nfl:1', 'ml', 'home');
    assert.match(visible(same.page.text), /Chiefs ML is already in your parlay/);
  });

  test('remove a leg, and need two to lock', async () => {
    const ann = await player('ann@example.com', 'Ann');
    assert.match(visible((await ann.get('/parlay')).text), /No legs yet\. Tap a number on the board, then Add to parlay/);
    await add(ann, 'nfl:1', 'spread', 'away');
    await add(ann, 'nfl:2', 'spread', 'away');
    await ann.get('/parlay');
    assert.equal((await ann.post('/parlay/legs/nfl%3A2/delete')).location, '/parlay');
    const one = await ann.get('/parlay');
    assert.match(visible(one.text), /1 leg of 6 .* Add at least one more leg, from a different game/);
    assert.doesNotMatch(one.text, /Lock parlay/);
    const res = await ann.post('/parlays', { units: '1', seen: 'nfl:1:spread:away:3.5:-110' });
    assert.equal(res.status, 400);
    assert.match(visible(res.text), /A parlay needs at least 2 legs, each on a different game\. Nothing was locked\./);
    assert.equal(parlays().length, 0);
  });

  test('take up to 6 legs, no more', async () => {
    const ann = await player('ann@example.com', 'Ann');
    for (const id of [1, 2, 3, 4, 5, 6]) await add(ann, `nfl:${id}`, 'total', 'under');
    const seventh = await add(ann, 'nfl:7', 'total', 'under');
    assert.match(visible(seventh.page.text), /A parlay can have 6 legs at most\. Remove one to add this\./);
    assert.equal(draft('Ann').length, 6);
    // Swapping a leg on a game already in it still works at 6.
    await add(ann, 'nfl:6', 'total', 'over');
    assert.equal(draft('Ann').find((l) => l.game_id === 'nfl:6').side, 'over');

    // Six legs at -110 is +4741: 0.1u is the most.
    const page = visible((await ann.get('/parlay')).text);
    assert.match(page, /Combined odds \+4741/);
    assert.match(page, /0\.1u is the most you can play/);
    assert.equal((await lock(ann, 0.1)).location, '/picks');
    const [p] = parlays();
    assert.equal(legsOf(p.id).length, 6);
    assert.equal(p.units, 0.1);
  });
});

describe('locking a parlay', () => {
  test('lock it at the cap, get the LOCKED ticket, and clear the draft', async () => {
    const ann = await player('ann@example.com', 'Ann');
    await add(ann, 'nfl:1', 'spread', 'away');
    await add(ann, 'nfl:2', 'spread', 'away');
    await add(ann, 'nfl:3', 'spread', 'away');
    const page = visible((await ann.get('/parlay')).text);
    assert.match(page, /Combined odds \+596/);
    assert.match(page, /At \+596, 0\.83u is the most you can play/);

    const over = await lock(ann, 0.84);
    assert.equal(over.status, 400);
    assert.match(visible(over.text), /At \+596, 0\.83u is the most you can play\. No bet can win more than 5 units\./);
    assert.equal(parlays().length, 0);

    const res = await lock(ann, 0.83);
    assert.equal(res.location, '/picks');
    const bets = await ann.get('/picks');
    assert.match(bets.text, /<div class="locked-ticket" role="status">/);
    assert.match(visible(bets.text), /Locked 3-leg parlay \(\+596\), 0\.83u to win 4\.95u Once it's in, it's on the record\. On the record Oct 25, 8:00 AM ET/);
    assert.doesNotMatch(bets.text, /class="parlay-bar"/, 'the draft is cleared');
    assert.equal(draft('Ann').length, 0);
    assert.doesNotMatch(bets.text, /aria-label="\d+ open"/, 'no open-bet count on the tab bar');

    const [p] = parlays();
    assert.deepEqual([p.units, p.odds, p.first_start, p.made_at, p.sport, p.result], [0.83, 596, ONE, MORNING, 'nfl', null]);
    assert.deepEqual(legsOf(p.id).map((l) => [l.game_id, l.market, l.side, l.line, l.odds]), [
      ['nfl:1', 'spread', 'away', 3.5, -110],
      ['nfl:2', 'spread', 'away', 3.5, -110],
      ['nfl:3', 'spread', 'away', 3.5, -110],
    ]);

    // My bets lists it with its legs and a PARLAY tag.
    const mine = visible(bets.text);
    assert.match(mine, /Parlay 3 legs \+596 Open 0\.83u to win 4\.95u Delete/);
    assert.match(mine, /Bills \+3\.5 −110 NFL · Bills @ Chiefs · Starts in 5h 0m/);
    assert.match(mine, /Rams \+3\.5 −110 NFL · Rams @ 49ers · Starts in 8h 25m/);
  });

  test('ask again when a line moved', async () => {
    const ann = await player('ann@example.com', 'Ann');
    await add(ann, 'nfl:1', 'spread', 'away');
    await add(ann, 'nfl:2', 'spread', 'away');
    const page = await ann.get('/parlay');
    const seen = /name="seen" value="([^"]*)"/.exec(page.text)[1];
    setLine(games[1], { spread: -4.5 });
    time.advance(2 * 60_000);
    const res = await ann.post('/parlays', { units: '1', seen });
    assert.equal(res.status, 409);
    assert.match(visible(res.text), /Lines moved\. Still want it\?/);
    assert.match(visible(res.text), /Bills \+4\.5 Spread/);
    assert.equal(parlays().length, 0);
    assert.equal(draft('Ann')[0].line, 4.5, 'the draft takes the new number');
    assert.match(res.text, /name="units" value="1"/, 'and keeps the units');

    // The old page's numbers don't go through either.
    assert.equal((await ann.post('/parlays', { units: '1', seen })).status, 409);
    assert.equal((await lock(ann, 1)).location, '/picks');
    assert.equal(legsOf(parlays()[0].id)[0].line, 4.5);
  });

  test('drop a leg whose game has started, and say so', async () => {
    const ann = await player('ann@example.com', 'Ann');
    await add(ann, 'nfl:1', 'spread', 'away');
    await add(ann, 'nfl:3', 'spread', 'away');
    await add(ann, 'nfl:5', 'spread', 'away');
    const page = await ann.get('/parlay');
    const seen = /name="seen" value="([^"]*)"/.exec(page.text)[1];
    time.set('2026-10-25T17:05:00.000Z');
    const res = await ann.post('/parlays', { units: '1', seen });
    assert.equal(res.status, 409);
    assert.match(visible(res.text), /Bills @ Chiefs has started, so Bills \+3\.5 is out\. Still want it\?/);
    assert.match(visible(res.text), /2 legs of 6/);
    assert.equal(parlays().length, 0, 'nothing locks until they see the new price');
    assert.equal((await lock(ann, 1)).location, '/picks');
    assert.deepEqual(legsOf(parlays()[0].id).map((l) => l.game_id), ['nfl:3', 'nfl:5']);
    assert.equal(parlays()[0].first_start, FOUR);
  });

  test("don't lock when fewer than 2 legs are left", async () => {
    const ann = await player('ann@example.com', 'Ann');
    await add(ann, 'nfl:1', 'spread', 'away');
    await add(ann, 'nfl:3', 'spread', 'away');
    const page = await ann.get('/parlay');
    const seen = /name="seen" value="([^"]*)"/.exec(page.text)[1];
    time.set('2026-10-25T17:05:00.000Z');
    const res = await ann.post('/parlays', { units: '1', seen });
    assert.match(visible(res.text), /Bills @ Chiefs has started, so Bills \+3\.5 is out\. A parlay needs at least 2 legs/);
    assert.equal(parlays().length, 0);
    // Opening the page later drops started legs the same way.
    await add(ann, 'nfl:5', 'spread', 'away');
    time.set('2026-10-25T20:30:00.000Z');
    assert.match(visible((await ann.get('/parlay')).text), /Rams @ 49ers has started, so Rams \+3\.5 is out\./);
    assert.equal(draft('Ann').length, 1);
  });

  test("can't add a leg on a game that has started", async () => {
    const ann = await player('ann@example.com', 'Ann');
    time.set('2026-10-25T17:01:00.000Z');
    const res = await add(ann, 'nfl:1', 'spread', 'away');
    assert.match(visible(res.page.text), /That game has started/);
    assert.equal(draft('Ann').length, 0);
  });

  test('pause when ESPN is out of reach', async () => {
    const ann = await player('ann@example.com', 'Ann');
    await add(ann, 'nfl:1', 'spread', 'away');
    await add(ann, 'nfl:2', 'spread', 'away');
    await ann.get('/parlay');
    app.espn.down = true;
    time.advance(15 * 60_000);
    const res = await lock(ann, 1);
    assert.equal(res.status, 503);
    assert.match(visible(res.text), /Can't reach live lines right now/);
    assert.equal(parlays().length, 0);
  });
});

describe('grading parlays', () => {
  test('win: every leg covers, paid at the combined price', async () => {
    await threeLegs();
    await finals([[1, 24, 27], [2, 20, 17], [3, 10, 13]]);
    const [p] = parlays();
    assert.equal(p.result, 'win');
    assert.equal(p.profit, 4.95);
    assert.deepEqual(legsOf(p.id).map((l) => l.result), ['win', 'win', 'win']);
    const note = app.store.get("SELECT text FROM notifications WHERE kind = 'settled'");
    assert.equal(note.text, 'Won +4.95u: 3-leg parlay (+596)');
  });

  test('loss: one leg loses and the parlay loses, without waiting on the rest', async () => {
    const ann = await threeLegs();
    setFinal(games[1], 34, 10);
    time.set('2026-10-25T20:30:00.000Z');
    await app.games.checkFinals();
    const [p] = parlays();
    assert.equal(p.result, 'loss');
    assert.equal(p.profit, -0.83);
    const settled = visible((await ann.get('/picks?tab=settled')).text);
    assert.match(settled, /Parlay 3 legs \+596 Lost −0\.83u/);
    assert.match(settled, /✗ Bills \+3\.5 −110 NFL · Bills @ Chiefs · BUF 10, KC 34/);
    assert.match((await ann.get('/picks?tab=settled')).text, /<li class="leg leg-open">/, 'the rest are still open');
  });

  test('push: a pushed leg drops out and the odds are worked again', async () => {
    const ann = await player('ann@example.com', 'Ann');
    await add(ann, 'nfl:1', 'spread', 'away');
    await add(ann, 'nfl:2', 'spread', 'away');
    await add(ann, 'nfl:4', 'spread', 'home'); // Packers -3
    assert.equal((await lock(ann, 0.83)).location, '/picks');
    await finals([[1, 24, 27], [2, 20, 17], [4, 27, 24]]);
    const [p] = parlays();
    assert.equal(p.result, 'win');
    assert.equal(p.profit, 2.2, 'paid as a 2-leg parlay at +264');
    assert.deepEqual(legsOf(p.id).map((l) => l.result), ['win', 'win', 'push']);
    assert.match(visible((await ann.get('/picks?tab=settled')).text), /Push Packers -3 −110/);
  });

  test('every leg pushes: the parlay pushes', async () => {
    const ann = await player('ann@example.com', 'Ann');
    await add(ann, 'nfl:4', 'spread', 'home');
    await add(ann, 'nfl:5', 'ml', 'home');
    assert.equal((await lock(ann, 1)).location, '/picks');
    await finals([[4, 27, 24], [5, 20, 20]]);
    const [p] = parlays();
    assert.deepEqual([p.result, p.profit], ['push', 0]);
    assert.equal(record(app.store, userId('Ann')).pushes, 1);
  });
});

describe('who sees a parlay, and when', () => {
  test('hidden from everyone else until the first leg starts', async () => {
    const ann = await threeLegs();
    await ann.get('/groups');
    await ann.post('/groups', { name: 'Sunday Squad', sport: 'nfl' });
    const code = /class="code">([A-Z0-9]{8})</.exec((await ann.get('/groups/1')).text)[1];
    const bob = await player('bob@example.com', 'Bob');
    await bob.get('/groups');
    await bob.post('/groups/join', { code });
    await bob.post('/u/Ann/follow');

    const profile = visible((await bob.get('/u/Ann')).text);
    assert.match(profile, /1 open pick, shown once the game starts/);
    assert.doesNotMatch(profile, /Parlay 3 legs/);
    assert.doesNotMatch(visible((await bob.get('/following')).text), /Parlay/);
    assert.doesNotMatch(visible((await bob.get('/groups/1')).text), /Parlay 3 legs/);
    assert.match(visible((await ann.get('/u/Ann')).text), /Parlay 3 legs/, 'Ann sees her own');

    time.set('2026-10-25T17:01:00.000Z');
    assert.match(visible((await bob.get('/u/Ann')).text), /Parlay 3 legs \+596 0\.83u Open/);
    assert.match(visible((await bob.get('/following')).text), /Ann · Parlay 3 legs \+596/);
    assert.match(visible((await bob.get('/groups/1')).text), /Ann · Parlay 3 legs \+596/);
    assert.match(visible((await app.browser().get('/u/Ann')).text), /Bills \+3\.5 −110 NFL · Bills @ Chiefs/);
  });

  test("the official account's parlays are public right away", async () => {
    const officialId = ensureOfficial(app.store, new Date(MORNING));
    await app.games.upcoming('nfl');
    const id = Number(app.store.run(
      'INSERT INTO parlays (user_id, sport, units, odds, made_at, first_start) VALUES (?, ?, 1, 264, ?, ?)',
      officialId, 'nfl', MORNING, ONE,
    ).lastInsertRowid);
    for (const g of ['nfl:1', 'nfl:2']) {
      app.store.run("INSERT INTO parlay_legs (parlay_id, game_id, sport, market, side, line, odds) VALUES (?, ?, 'nfl', 'spread', 'away', 3.5, -110)", id, g);
    }
    const page = visible((await app.browser().get('/u/BookieBullies')).text);
    assert.match(page, /Parlay 2 legs \+264 1u Open/);
    assert.doesNotMatch(page, /open pick, shown once/);
  });
});

describe('parlays on the record', () => {
  /** Graded bets straight into the database. */
  function graded(name, rows) {
    for (const r of rows) {
      if (r.legs) {
        const id = Number(app.store.run(
          `INSERT INTO parlays (user_id, sport, units, odds, made_at, first_start, result, profit, graded_at) VALUES (?, ?, ?, 264, ?, ?, ?, ?, ?)`,
          userId(name), r.sport ?? null, r.units ?? 1, MORNING, r.start ?? ONE, r.result, r.profit, LATE,
        ).lastInsertRowid);
        for (const [g, market] of r.legs) {
          app.store.run("INSERT INTO parlay_legs (parlay_id, game_id, sport, market, side, line, odds, result) VALUES (?, ?, ?, ?, 'home', -3.5, -110, 'win')", id, g, g.split(':')[0], market);
        }
      } else {
        app.store.run(
          `INSERT INTO picks (user_id, game_id, sport, market, side, line, odds, units, game_start, made_at, result, profit, graded_at)
           VALUES (?, ?, ?, ?, 'home', -3.5, -110, 1, ?, ?, ?, ?, ?)`,
          userId(name), r.game, r.game.split(':')[0], r.market, r.start ?? ONE, MORNING, r.result, r.profit, LATE,
        );
      }
    }
  }

  test('a parlay is one bet in the record, last 10, ROI and the boards', async () => {
    await player('ann@example.com', 'Ann');
    await app.games.upcoming('nfl');
    await app.games.upcoming('nba');
    graded('Ann', [
      { game: 'nfl:1', market: 'spread', result: 'win', profit: 0.91 },
      { game: 'nfl:2', market: 'spread', result: 'loss', profit: -1 },
      { game: 'nfl:3', market: 'total', result: 'win', profit: 0.91 },
      { game: 'nfl:4', market: 'ml', result: 'push', profit: 0 },
    ]);
    const ann = userId('Ann');
    assert.equal(leaderboard(app.store, {}, time.now()).find((r) => r.id === ann).ranked, false, `${MIN_RANKED - 1} bets: no rank yet`);

    // A same-sport parlay and a cross-sport one.
    graded('Ann', [
      { legs: [['nfl:5', 'spread'], ['nfl:6', 'total']], sport: 'nfl', result: 'win', profit: 2.64 },
      { legs: [['nfl:7', 'spread'], ['nba:8', 'ml']], sport: null, result: 'loss', profit: -1 },
    ]);
    const all = record(app.store, ann);
    assert.deepEqual([all.wins, all.losses, all.pushes, all.graded, all.units], [3, 2, 1, 6, 2.46]);
    assert.equal(Math.round(all.roi * 1000) / 1000, Math.round((2.46 / 5) * 1000) / 1000, 'risked counts each parlay once');
    const row = leaderboard(app.store, {}, time.now()).find((r) => r.id === ann);
    assert.deepEqual([row.ranked, row.rank, row.graded], [true, 1, 6], 'parlays count toward the minimum');
    assert.deepEqual(lastTen(app.store, ann), { wins: 3, losses: 2, pushes: 1, graded: 6 });

    // The NFL board takes the all-NFL parlay; the mixed one counts overall only.
    const nfl = leaderboard(app.store, { sport: 'nfl' }, time.now()).find((r) => r.id === ann);
    assert.deepEqual([nfl.wins, nfl.losses, nfl.units], [3, 1, 3.46]);
    assert.equal(leaderboard(app.store, { sport: 'nba' }, time.now()).find((r) => r.id === ann), undefined);
    assert.deepEqual(recordBySport(app.store, ann).map((r) => [r.sport, r.graded]), [['nfl', 5]]);

    // Splits by market leave parlays out.
    const split = breakdown(app.store, ann);
    assert.equal(split.market.reduce((n, r) => n + r.graded, 0), 4);
    assert.equal(splits(app.store, ['nfl:5', 'nfl:6']).size, 0);

    // And the pages agree, once the games have been played.
    time.set(LATE);
    const page = visible((await app.browser().get('/u/Ann')).text);
    assert.match(page, /Record 3-2-1 Units \+2\.46u/);
    assert.match(page, /Last 10 3-2-1/);
    assert.match(page, /Parlay 2 legs \+264 1u Won \+2\.64u/);
    assert.match(page, /✓ Celtics ML −110 NBA · Lakers @ Celtics/);
    assert.match(visible((await app.browser().get('/leaderboard')).text), /1 A Ann 3-2-1/);
  });

  test('group boards count a parlay like a pick, within the group sport', async () => {
    const ann = await player('ann@example.com', 'Ann');
    await app.games.upcoming('nba');
    await ann.get('/groups');
    await ann.post('/groups', { name: 'Hoops', sport: 'nba' });
    await ann.post('/groups', { name: 'Everything', sport: '' });
    graded('Ann', [
      { legs: [['nfl:1', 'spread'], ['nba:8', 'ml']], sport: null, result: 'win', profit: 2.64 },
    ]);
    assert.equal(leaderboard(app.store, { groupId: 2 }, time.now())[0].units, 2.64);
    assert.equal(leaderboard(app.store, { groupId: 1, sport: 'nba' }, time.now()).length, 0);
  });
});

describe('deleting a parlay', () => {
  test('until the first leg starts, never after', async () => {
    const ann = await threeLegs();
    const [p] = parlays();
    const bob = await player('bob@example.com', 'Bob');
    assert.equal((await bob.post(`/parlays/${p.id}/delete`)).status, 404, "not someone else's");
    assert.equal(parlays().length, 1);

    await ann.get('/picks');
    await ann.post(`/parlays/${p.id}/delete`);
    assert.match(visible((await ann.get('/picks')).text), /Parlay deleted\./);
    assert.equal(parlays().length, 0);
    assert.equal(app.store.get('SELECT COUNT(*) AS n FROM parlay_legs').n, 0, 'its legs go with it');

    await add(ann, 'nfl:1', 'spread', 'away');
    await add(ann, 'nfl:3', 'spread', 'away');
    assert.equal((await lock(ann, 1)).location, '/picks');
    const [q] = parlays();
    time.set('2026-10-25T17:01:00.000Z'); // the first leg is on; the second hasn't started
    const bets = await ann.get('/picks');
    assert.doesNotMatch(bets.text, new RegExp(`/parlays/${q.id}/delete`), 'no Delete button once it starts');
    await ann.post(`/parlays/${q.id}/delete`);
    assert.match(visible((await ann.get('/picks')).text), /Its first game has started, so the parlay stays on the record\./);
    assert.equal(parlays().length, 1);
  });

  test('deleting the account takes parlays and the draft with it', async () => {
    const ann = await threeLegs();
    await add(ann, 'nfl:5', 'spread', 'away');
    await ann.get('/u/Ann');
    await ann.post('/account/delete', { password: 'correct horse' });
    assert.equal(parlays().length, 0);
    assert.equal(app.store.get('SELECT COUNT(*) AS n FROM parlay_legs').n, 0);
    assert.equal(app.store.get('SELECT COUNT(*) AS n FROM parlay_draft_legs').n, 0);
  });
});
