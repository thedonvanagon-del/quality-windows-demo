import assert from 'node:assert/strict';
import { test } from 'node:test';

import { openStore } from '../src/db.js';
import { leaderboard } from '../src/stats.js';
import { grade, gradeFinished, makePick, MAX_UNITS, maxUnits, price, profit, toWin } from '../src/picks.js';

test('grades spreads from the picked side', () => {
  assert.equal(grade({ market: 'spread', side: 'home', line: -3.5 }, 27, 24), 'loss');
  assert.equal(grade({ market: 'spread', side: 'home', line: -2.5 }, 27, 24), 'win');
  assert.equal(grade({ market: 'spread', side: 'home', line: -3 }, 27, 24), 'push');
  assert.equal(grade({ market: 'spread', side: 'away', line: 3.5 }, 27, 24), 'win');
  assert.equal(grade({ market: 'spread', side: 'away', line: 3 }, 27, 24), 'push');
});

test('grades totals', () => {
  assert.equal(grade({ market: 'total', side: 'over', line: 47.5 }, 27, 24), 'win');
  assert.equal(grade({ market: 'total', side: 'under', line: 47.5 }, 27, 24), 'loss');
  assert.equal(grade({ market: 'total', side: 'under', line: 51 }, 27, 24), 'push');
});

test('grades moneylines, with a tie as a push', () => {
  assert.equal(grade({ market: 'ml', side: 'home', line: null }, 27, 24), 'win');
  assert.equal(grade({ market: 'ml', side: 'away', line: null }, 27, 24), 'loss');
  assert.equal(grade({ market: 'ml', side: 'away', line: null }, 20, 20), 'push');
});

test('pays out at American odds', () => {
  assert.equal(toWin(-110, 1), 0.91);
  assert.equal(toWin(150, 2), 3);
  assert.equal(profit('win', -200, 3), 1.5);
  assert.equal(profit('loss', 150, 2), -2);
  assert.equal(profit('push', -110, 5), 0);
  assert.equal(profit('void', -110, 5), 0);
});

test('prices the away side as the mirror of the home spread', () => {
  const game = { lines: { spread: { home: -3.5, homeOdds: -115, awayOdds: -105 }, total: null, ml: { home: -170, away: 150 } } };
  assert.deepEqual(price(game, 'spread', 'away'), { line: 3.5, odds: -105 });
  assert.deepEqual(price(game, 'spread', 'home'), { line: -3.5, odds: -115 });
  assert.deepEqual(price(game, 'ml', 'away'), { line: null, odds: 150 });
  assert.equal(price(game, 'total', 'over'), null);
  assert.equal(price(game, 'spread', 'over'), null);
  assert.deepEqual(price({ lines: { spread: { home: 0, homeOdds: -110, awayOdds: -110 } } }, 'spread', 'away'), { line: 0, odds: -110 });
});

function seed(store, game) {
  store.run("INSERT INTO users (email, password_hash, screen_name, created_at) VALUES ('a@b.co', 'x', 'Ann', '2026-01-01')");
  store.run(
    `INSERT INTO games (id, sport, start_time, state, status, detail, completed, home_name, home_short, home_abbr, home_score,
                        away_name, away_short, away_abbr, away_score, lines, updated_at)
     VALUES ('nfl:1', 'nfl', ?, ?, ?, '', ?, 'Chiefs', 'Chiefs', 'KC', ?, 'Bills', 'Bills', 'BUF', ?, '{}', ?)`,
    game.start, game.state, game.status, game.completed ? 1 : 0, game.home ?? null, game.away ?? null, game.updated,
  );
  store.run(
    `INSERT INTO picks (user_id, game_id, sport, market, side, line, odds, units, game_start, made_at)
     VALUES (1, 'nfl:1', 'nfl', 'spread', 'away', 3.5, -110, 2, ?, '2026-10-25T12:00:00.000Z')`,
    game.start,
  );
}

const pick = (store) => store.get('SELECT result, profit FROM picks');

test('grades a final and leaves a live game alone', () => {
  const store = openStore(':memory:');
  seed(store, { start: '2026-10-25T17:00:00.000Z', state: 'in', status: 'STATUS_IN_PROGRESS', updated: '2026-10-25T18:00:00.000Z' });
  assert.equal(gradeFinished(store, new Date('2026-10-25T18:00Z')), 0);
  store.run("UPDATE games SET state = 'post', completed = 1, status = 'STATUS_FINAL', home_score = 27, away_score = 24");
  assert.equal(gradeFinished(store, new Date('2026-10-25T21:00Z')), 1);
  assert.deepEqual({ ...pick(store) }, { result: 'win', profit: 1.82 });
  assert.equal(gradeFinished(store, new Date('2026-10-25T22:00Z')), 0, 'a graded pick stays graded');
});

test('voids a postponed game', () => {
  const store = openStore(':memory:');
  seed(store, { start: '2026-10-25T17:00:00.000Z', state: 'post', status: 'STATUS_POSTPONED', updated: '2026-10-25T18:00:00.000Z' });
  gradeFinished(store, new Date('2026-10-25T18:00Z'));
  assert.deepEqual({ ...pick(store) }, { result: 'void', profit: 0 });
});

test('voids a game that never finished only on ESPN saying so days later', () => {
  const store = openStore(':memory:');
  // Last heard from ESPN before the game: the app was cut off, not the game.
  seed(store, { start: '2026-10-25T17:00:00.000Z', state: 'pre', status: 'STATUS_SCHEDULED', updated: '2026-10-25T12:00:00.000Z' });
  gradeFinished(store, new Date('2026-11-05T00:00Z'));
  assert.equal(pick(store).result, null);
  // ESPN still lists it as scheduled four days on.
  store.run("UPDATE games SET updated_at = '2026-10-29T17:00:00.000Z'");
  gradeFinished(store, new Date('2026-11-05T00:00Z'));
  assert.equal(pick(store).result, 'void');
});

test('caps a pick at 5 units risked and 5 to win', () => {
  assert.equal(maxUnits(-110), MAX_UNITS);
  assert.equal(maxUnits(100), 5);
  assert.equal(maxUnits(150), 3.33);
  assert.equal(maxUnits(1000), 0.5);

  const store = openStore(':memory:');
  seed(store, { start: '2026-10-25T17:00:00.000Z', state: 'pre', status: 'STATUS_SCHEDULED', updated: '2026-10-25T12:00:00.000Z' });
  const game = { id: 'nfl:1', sport: 'nfl', start: '2026-10-25T17:00:00.000Z', state: 'pre', lines: { ml: { home: -170, away: 400 } } };
  const at = { userId: 1, game, market: 'ml', now: new Date('2026-10-25T12:00Z') };
  assert.match(makePick(store, { ...at, side: 'home', units: 6 }).error, /Play between 0\.1u and 5u/);
  assert.match(makePick(store, { ...at, side: 'away', units: 2 }).error, /At \+400, 1\.25u is the most you can play/);
  assert.equal(makePick(store, { ...at, side: 'home', units: 5 }).units, 5);
});

test('one lucky max play ranks below a real record', () => {
  const store = openStore(':memory:');
  seed(store, { start: '2026-10-25T17:00:00.000Z', state: 'post', status: 'STATUS_FINAL', updated: '2026-10-25T21:00:00.000Z' });
  store.run('DELETE FROM picks');
  store.run("UPDATE users SET email_verified_at = '2026-01-01'");
  store.run("INSERT INTO users (email, password_hash, screen_name, created_at, email_verified_at) VALUES ('b@b.co', 'x', 'Bo', '2026-01-01', '2026-01-01')");
  let n = 1;
  const add = (user, result, units, profit) => {
    const id = `nfl:${(n += 1)}`;
    store.run(
      `INSERT INTO games (id, sport, start_time, state, status, detail, completed, home_name, home_short, home_abbr, away_name, away_short, away_abbr, lines, updated_at)
       VALUES (?, 'nfl', '2026-10-25T17:00:00.000Z', 'post', 'STATUS_FINAL', '', 1, 'Chiefs', 'Chiefs', 'KC', 'Bills', 'Bills', 'BUF', '{}', '2026-10-25T21:00:00.000Z')`,
      id,
    );
    store.run(
      `INSERT INTO picks (user_id, game_id, sport, market, side, line, odds, units, game_start, made_at, result, profit)
       VALUES (?, ?, 'nfl', 'ml', 'home', NULL, 100, ?, '2026-10-25T17:00:00.000Z', '2026-10-25T12:00:00.000Z', ?, ?)`,
      user, id, units, result, profit,
    );
  };
  add(1, 'win', 5, 5); // Ann: one 5u hit
  for (const r of ['win', 'win', 'win', 'loss', 'win']) add(2, r, 1, r === 'win' ? 1 : -1); // Bo: 4-1, +3u
  const rows = leaderboard(store, {}, new Date('2026-10-26T00:00Z'));
  assert.deepEqual(rows.map((r) => [r.screen_name, r.ranked]), [['Bo', true], ['Ann', false]]);
});
