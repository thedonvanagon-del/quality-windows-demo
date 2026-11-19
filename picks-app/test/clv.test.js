import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { clvFor, clvLabel, clvSummary, impliedProb, nextClosing } from '../src/clv.js';
import { SPORT } from '../src/sports.js';
import { clock, event, setFinal, setLine, setLive, startApp, visible } from './helpers.js';

// Sunday 8am Eastern; Bills at Chiefs kicks off at 1pm.
const MORNING = '2026-10-25T12:00:00.000Z';
const KICKOFF = '2026-10-25T17:00:00.000Z';

const CLOSE = {
  spread: { home: -2.5, homeOdds: -110, awayOdds: -110 },
  total: { points: 45.5, overOdds: -110, underOdds: -110 },
  ml: { home: -200, away: 170 },
  book: 'DraftKings',
};

describe('working out CLV', () => {
  test('spreads: points gained, positive when the pick got the better number', () => {
    assert.equal(clvFor({ market: 'spread', side: 'away', line: 3.5, odds: -110 }, CLOSE).points, 1, '+3.5 that closed +2.5');
    assert.equal(clvFor({ market: 'spread', side: 'away', line: 1.5, odds: -110 }, CLOSE).points, -1, '+1.5 that closed +2.5');
    assert.equal(clvFor({ market: 'spread', side: 'home', line: -1.5, odds: -110 }, CLOSE).points, 1, '-1.5 that closed -2.5');
    assert.equal(clvFor({ market: 'spread', side: 'home', line: -3.5, odds: -110 }, CLOSE).points, -1, '-3.5 that closed -2.5');
    assert.equal(clvFor({ market: 'spread', side: 'home', line: -2.5, odds: -110 }, CLOSE).points, 0);
  });

  test('totals: an over gains when the total closes higher, an under when it closes lower', () => {
    assert.equal(clvFor({ market: 'total', side: 'over', line: 44, odds: -110 }, CLOSE).points, 1.5, 'Over 44 that closed 45.5');
    assert.equal(clvFor({ market: 'total', side: 'under', line: 44, odds: -110 }, CLOSE).points, -1.5);
    assert.equal(clvFor({ market: 'total', side: 'under', line: 47, odds: -110 }, CLOSE).points, 1.5);
    assert.equal(clvFor({ market: 'total', side: 'over', line: 47, odds: -110 }, CLOSE).points, -1.5);
  });

  test('moneylines: the no-vig win chance at the close against the price taken', () => {
    // Close: -200 / +170. Raw chances 66.67% and 37.04% add up to 103.7%.
    const vig = impliedProb(-200) + impliedProb(170);
    const home = clvFor({ market: 'ml', side: 'home', line: null, odds: -170 }, CLOSE);
    assert.equal(home.points, null);
    assert.equal(home.pct, Math.round(((impliedProb(-200) - impliedProb(-170)) / vig) * 10000) / 100);
    assert.equal(home.pct, 3.57, 'took -170, closed -200: 3.57 points of win chance better');
    const away = clvFor({ market: 'ml', side: 'away', line: null, odds: 200 }, CLOSE);
    assert.equal(away.pct, 3.57, 'took +200, closed +170');
    assert.equal(clvFor({ market: 'ml', side: 'away', line: null, odds: 150 }, CLOSE).pct, -2.86, 'took +150, closed +170');
    assert.equal(clvFor({ market: 'ml', side: 'home', line: null, odds: -200 }, CLOSE).pct, 0, 'the closing price itself is 0, not minus the vig');
  });

  test('the price counts on spreads and totals too, and one closing side means raw chances', () => {
    const juiced = { ...CLOSE, spread: { home: -2.5, homeOdds: -120, awayOdds: 100 } };
    const pick = clvFor({ market: 'spread', side: 'away', line: 2.5, odds: 105 }, juiced);
    assert.equal(pick.points, 0);
    // -120 / +100: 54.55% + 50% = 104.55%. Took +105 (48.78%) on the +100 side.
    assert.equal(pick.pct, Math.round(((0.5 - 100 / 205) / (120 / 220 + 0.5)) * 10000) / 100);
    assert.ok(pick.pct > 0);
    assert.equal(clvLabel({ market: 'spread', clvPoints: 0, clvPct: pick.pct }), `CLV +${pick.pct.toFixed(1)}%`, 'no points gained: the price says');

    const oneSided = { ml: { home: -150, away: Number.NaN } };
    const raw = clvFor({ market: 'ml', side: 'home', line: null, odds: -130 }, oneSided);
    assert.equal(raw.pct, Math.round((impliedProb(-150) - impliedProb(-130)) * 10000) / 100);
  });

  test('no close for the market, no CLV', () => {
    assert.equal(clvFor({ market: 'total', side: 'over', line: 44, odds: -110 }, { spread: CLOSE.spread, total: null, ml: null }), null);
    assert.equal(clvFor({ market: 'ml', side: 'home', line: null, odds: -110 }, null), null);
  });

  test('labels: points on spreads and totals, percent on moneylines', () => {
    assert.equal(clvLabel({ market: 'spread', clvPoints: 1, clvPct: 0 }), 'CLV +1.0');
    assert.equal(clvLabel({ market: 'total', clvPoints: -1.5, clvPct: 0 }), 'CLV −1.5');
    assert.equal(clvLabel({ market: 'ml', clvPoints: null, clvPct: 2.34 }), 'CLV +2.3%');
    assert.equal(clvLabel({ market: 'ml', clvPoints: null, clvPct: null }), null);
  });
});

describe('the closing line', () => {
  const at = new Date(MORNING);
  const pre = (lines) => ({ state: 'pre', start: KICKOFF, lines });

  test('tracks the latest pregame number for each market, and keeps a pulled market', () => {
    const first = nextClosing(null, pre(CLOSE), at);
    assert.equal(first.at, null, 'not closed before the start');
    const moved = nextClosing({ lines: '{}', closing_lines: first.lines }, pre({ ...CLOSE, spread: { home: -3, homeOdds: -110, awayOdds: -110 } }), at);
    assert.equal(JSON.parse(moved.lines).spread.home, -3);
    const pulled = nextClosing({ lines: '{}', closing_lines: moved.lines }, pre({ spread: null, total: null, ml: CLOSE.ml, book: 'DraftKings' }), at);
    assert.equal(JSON.parse(pulled.lines).spread.home, -3, 'the book pulled the spread: its last number stays');
  });

  test('freezes once the game starts, by ESPN or the clock, and never changes after', () => {
    const tracked = JSON.stringify(CLOSE);
    const live = nextClosing({ lines: '{}', closing_lines: tracked }, { state: 'in', start: KICKOFF, lines: { spread: { home: -10, homeOdds: -110, awayOdds: -110 } } }, at);
    assert.equal(live.lines, tracked, 'live odds never feed the close');
    assert.equal(live.at, MORNING);
    const later = nextClosing({ lines: '{}', closing_lines: live.lines, closing_at: live.at }, pre({ ...CLOSE, total: { points: 60, overOdds: -110, underOdds: -110 } }), new Date(KICKOFF));
    assert.deepEqual(later, { lines: tracked, at: MORNING });
    const byClock = nextClosing({ lines: '{}', closing_lines: tracked }, pre(CLOSE), new Date(KICKOFF));
    assert.equal(byClock.at, KICKOFF, 'ESPN still says pre, but the clock says it started');
  });
});

describe('CLV in the app', () => {
  let time;
  let app;
  let game;
  const refresh = async () => app.games.save(await app.espn.scoreboard(SPORT.nfl, '20261025'));
  const closing = () => JSON.parse(app.store.get("SELECT closing_lines FROM games WHERE id = 'nfl:1'").closing_lines);

  beforeEach(async () => {
    time = clock(MORNING);
    app = await startApp({ time });
    game = event({ id: '1', start: KICKOFF, spread: -3.5, total: 44 });
    app.espn.events.nfl.push(game);
  });
  afterEach(() => app.close());

  async function player(email, name) {
    const b = app.browser();
    await b.join(email, name);
    await b.get('/games');
    return b;
  }

  test('snapshots the close at the start, once, and puts CLV on each pick', async () => {
    const ann = await player('ann@example.com', 'Ann');
    await ann.post('/picks', { game: 'nfl:1', market: 'spread', side: 'away', line: '3.5', odds: '-110', units: '1' });
    await ann.post('/picks', { game: 'nfl:1', market: 'total', side: 'over', line: '44', odds: '-110', units: '1' });
    await ann.post('/picks', { game: 'nfl:1', market: 'ml', side: 'home', line: '', odds: '-170', units: '1' });
    assert.equal(app.store.get('SELECT COUNT(*) AS n FROM picks').n, 3);

    // The market moves against the Bills and toward the over before kickoff.
    setLine(game, { spread: -2.5, total: 45.5 });
    game.competitions[0].odds[0].moneyline = { home: { close: { odds: '-200' } }, away: { close: { odds: '+170' } } };
    time.set('2026-10-25T16:50:00.000Z');
    await refresh();
    assert.equal(app.store.get("SELECT closing_at FROM games WHERE id = 'nfl:1'").closing_at, null, 'not closed yet');
    assert.equal(app.store.get('SELECT COUNT(*) AS n FROM picks WHERE clv_pct IS NOT NULL').n, 0);

    setLive(game);
    time.set('2026-10-25T17:05:00.000Z');
    await refresh();
    assert.equal(closing().spread.home, -2.5);
    assert.equal(closing().total.points, 45.5);
    assert.deepEqual(closing().ml, { home: -200, away: 170 });
    const clv = Object.fromEntries(app.store.all('SELECT market, clv_points, clv_pct FROM picks').map((p) => [p.market, [p.clv_points, p.clv_pct]]));
    assert.deepEqual(clv, { spread: [1, 0], total: [1.5, 0], ml: [null, 3.57] });

    // ESPN posting live odds, or the stored lines changing, can't move the close.
    game.competitions[0].odds = [{ provider: { displayName: 'DraftKings' }, details: 'KC -14.5', spread: -14.5, overUnder: 60 }];
    await refresh();
    app.store.run("UPDATE games SET lines = '{}' WHERE id = 'nfl:1'");
    setFinal(game, 30, 20);
    time.set('2026-10-25T21:00:00.000Z');
    await refresh();
    assert.equal(closing().spread.home, -2.5);
    assert.equal(closing().total.points, 45.5);
    assert.equal(app.store.get('SELECT COUNT(*) AS n FROM picks WHERE result IS NOT NULL').n, 3);
    assert.deepEqual(app.store.all('SELECT clv_points, clv_pct FROM picks ORDER BY id').map((p) => [p.clv_points, p.clv_pct]), [[1, 0], [1.5, 0], [null, 3.57]], 'unchanged by grading');

    // My bets and the profile show it.
    const bets = await ann.get('/picks?tab=settled');
    assert.match(bets.text, /<span class="clv up" title="Closing line value: \+1 points, 0% on the price">CLV \+1\.0<\/span>/);
    assert.match(bets.text, /CLV \+1\.5</);
    assert.match(bets.text, /<span class="clv up"[^>]*>CLV \+3\.6%<\/span>/);
    const profile = visible((await app.browser().get('/u/Ann')).text);
    assert.match(profile, /Beat the close: 100% · Avg CLV \+1\.2% · 3 picks/);
    assert.match(profile, /What's CLV\? CLV shows whether you got a better number than where the line closed\. Beating the close over time is the best sign of a sharp bettor\./);
  });

  test('a game the app only saw after it started takes its close from the last lines, at grading', async () => {
    const ann = await player('ann@example.com', 'Ann');
    await ann.post('/picks', { game: 'nfl:1', market: 'spread', side: 'home', line: '-3.5', odds: '-110', units: '1' });
    // As if the close were never snapshotted (a game from before this existed).
    app.store.run("UPDATE games SET state = 'in', closing_lines = NULL, closing_at = NULL WHERE id = 'nfl:1'");
    app.store.run("UPDATE games SET lines = ? WHERE id = 'nfl:1'", JSON.stringify(CLOSE));
    setFinal(game, 30, 20);
    time.set('2026-10-25T21:00:00.000Z');
    await refresh();
    assert.equal(closing().spread.home, -2.5);
    const pick = app.store.get('SELECT result, clv_points FROM picks');
    assert.deepEqual({ ...pick }, { result: 'win', clv_points: -1 });
    const bets = await ann.get('/picks?tab=settled');
    assert.match(bets.text, /<span class="clv down"[^>]*>CLV −1\.0<\/span>/);
  });

  test('nothing shows without a close: open picks, voids and empty profiles', async () => {
    const ann = await player('ann@example.com', 'Ann');
    await ann.post('/picks', { game: 'nfl:1', market: 'spread', side: 'away', line: '3.5', odds: '-110', units: '1' });
    assert.doesNotMatch((await ann.get('/picks')).text, /class="clv/);
    assert.doesNotMatch(visible((await ann.get('/u/Ann')).text), /Beat the close/);
    const id = app.store.get('SELECT id FROM users').id;
    assert.equal(clvSummary(app.store, id), null);
    app.store.run("UPDATE picks SET clv_points = -1, clv_pct = 0, result = 'void', profit = 0");
    assert.equal(clvSummary(app.store, id), null, 'voids are left out');
    assert.doesNotMatch((await ann.get('/picks?tab=settled')).text, /class="clv/);
  });
});
