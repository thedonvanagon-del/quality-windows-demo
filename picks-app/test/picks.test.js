import assert from 'node:assert/strict';
import { test } from 'node:test';

import { openStore } from '../src/db.js';
import { grade, gradeFinished, makePick, MAX_UNITS, price, profit, toWin } from '../src/picks.js';

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

test('caps a pick at the max units, whatever the unit size', () => {
  const store = openStore(':memory:');
  seed(store, { start: '2026-10-25T17:00:00.000Z', state: 'pre', status: 'STATUS_SCHEDULED', updated: '2026-10-25T12:00:00.000Z' });
  const game = { id: 'nfl:1', sport: 'nfl', start: '2026-10-25T17:00:00.000Z', state: 'pre', lines: { ml: { home: -170, away: 150 } } };
  const at = { userId: 1, game, market: 'ml', side: 'home', now: new Date('2026-10-25T12:00Z') };
  // A $1 unit can't turn a $1,000 bet into 1,000 units.
  assert.match(makePick(store, { ...at, wager: 1000, unitSize: 1 }).error, /5 units is the max on one pick\. At \$1 a unit, that's \$5\./);
  assert.equal(MAX_UNITS, 5);
  assert.deepEqual(makePick(store, { ...at, wager: 500, unitSize: 100 }).units, 5);
});
