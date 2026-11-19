import assert from 'node:assert/strict';
import { test } from 'node:test';

import { american, createEspn, parseLines, parseScoreboard } from '../src/espn.js';
import { SPORT } from '../src/sports.js';
import { event, setFinal, setStatus } from './helpers.js';

const kc = { abbr: 'KC', short: 'Chiefs' };
const buf = { abbr: 'BUF', short: 'Bills' };

test('reads the nested DraftKings odds', () => {
  const [game] = parseScoreboard(SPORT.nfl, { events: [event({ id: '1', start: '2026-10-25T17:00Z', spread: -3.5, total: 47.5 })] });
  assert.equal(game.id, 'nfl:1');
  assert.equal(game.start, '2026-10-25T17:00:00.000Z');
  assert.equal(game.state, 'pre');
  assert.equal(game.home.score, null);
  assert.deepEqual(game.lines.spread, { home: -3.5, homeOdds: -110, awayOdds: -110 });
  assert.deepEqual(game.lines.total, { points: 47.5, overOdds: -110, underOdds: -110 });
  assert.deepEqual(game.lines.ml, { home: -170, away: 150 });
  assert.equal(game.lines.book, 'DraftKings');
});

test('reads the older flat shape cfb-bot sees', () => {
  const lines = parseLines(SPORT.ncaaf, { details: 'BUF -7.5', overUnder: 52.5, spread: -7.5, homeTeamOdds: { moneyLine: 250 }, awayTeamOdds: { moneyLine: -310 } }, kc, buf);
  assert.equal(lines.spread.home, 7.5, 'the away team is the one laying 7.5');
  assert.equal(lines.spread.homeOdds, -110);
  assert.equal(lines.total.points, 52.5);
  assert.deepEqual(lines.ml, { home: 250, away: -310 });
});

test('takes the sign from the favorite flag when details are missing', () => {
  const lines = parseLines(SPORT.nfl, { spread: 6, homeTeamOdds: { favorite: true }, awayTeamOdds: { favorite: false } }, kc, buf);
  assert.equal(lines.spread.home, -6);
});

test("reads MLB's details as the favorite's moneyline, the way Bookie Bullies does", () => {
  const priced = parseLines(
    SPORT.mlb,
    {
      details: 'KC -149', spread: 1.5, overUnder: 8.5,
      homeTeamOdds: { favorite: true, moneyLine: -149, spreadOdds: 135 },
      awayTeamOdds: { favorite: false, moneyLine: 127, spreadOdds: -155 },
    },
    kc, buf,
  );
  assert.deepEqual(priced.ml, { home: -149, away: 127 });
  assert.deepEqual(priced.spread, { home: -1.5, homeOdds: 135, awayOdds: -155 });

  const unpriced = parseLines(SPORT.mlb, { details: 'KC -149', spread: 1.5, homeTeamOdds: { favorite: true } }, kc, buf);
  assert.equal(unpriced.spread, null, 'no run line without a price on it');
  assert.equal(unpriced.ml, null, 'one side of a moneyline is not a market');
});

test('reads pick-em lines and even money', () => {
  assert.equal(parseLines(SPORT.nfl, { details: 'EVEN' }, kc, buf).spread.home, 0);
  assert.equal(american('EVEN'), 100);
  assert.equal(american('+150'), 150);
  assert.equal(american(-110), -110);
  assert.equal(american('5'), null);
  assert.equal(american(null), null);
});

test('reads finals and postponements', () => {
  const final = event({ id: '2', start: '2026-10-25T17:00Z' });
  setFinal(final, 27, 24);
  const postponed = event({ id: '3', start: '2026-10-25T17:00Z' });
  setStatus(postponed, 'post', 'STATUS_POSTPONED');
  const [a, b] = parseScoreboard(SPORT.nfl, { events: [final, postponed] });
  assert.equal(a.state, 'post');
  assert.equal(a.completed, true);
  assert.equal(a.home.score, 27);
  assert.equal(a.away.score, 24);
  assert.equal(b.status, 'STATUS_POSTPONED');
  assert.equal(b.completed, false);
});

test('skips events it cannot read', () => {
  const games = parseScoreboard(SPORT.nfl, { events: [{ id: '9' }, { id: '10', date: 'soon', competitions: [] }] });
  assert.deepEqual(games, []);
  assert.deepEqual(parseScoreboard(SPORT.nfl, null), []);
});

test("keeps team logos only from ESPN's image server", () => {
  const e = event({ id: '4', start: '2026-10-25T17:00Z' });
  const [home, away] = e.competitions[0].competitors;
  home.team.logo = 'https://a.espncdn.com/i/teamlogos/nfl/500/kc.png';
  away.team.logo = 'https://evil.example/track.png';
  const [game] = parseScoreboard(SPORT.nfl, { events: [e] });
  assert.equal(game.home.logo, 'https://a.espncdn.com/i/teamlogos/nfl/500/kc.png');
  assert.equal(game.away.logo, 'https://a.espncdn.com/i/teamlogos/nfl/500/buf.png', 'the outside address is dropped for ESPN\'s own');
});

test('asks ESPN for one day at a time and drops repeats', async () => {
  const urls = [];
  const fetch = async (url) => {
    urls.push(new URL(url));
    // The same game on both days, the way a late start can show up.
    const events = [event({ id: '7', start: '2026-10-31T00:30Z' })];
    return new Response(JSON.stringify({ events }));
  };
  const games = await createEspn({ fetch }).scoreboard(SPORT.ncaaf, '20261030', '20261031');
  assert.deepEqual(urls.map((u) => u.searchParams.get('dates')), ['20261030', '20261031']);
  assert.ok(urls.every((u) => u.searchParams.get('limit') === '400' && u.searchParams.get('groups') === '80'));
  assert.equal(games.length, 1);
});

test('a refused request is an error, not an empty board', async () => {
  const fetch = async () => new Response('bad', { status: 400 });
  await assert.rejects(createEspn({ fetch }).scoreboard(SPORT.nba, '20261030'), /answered 400/);
});

test('reads the TV channel, team records and team colors', () => {
  const e = event({ id: '9', start: '2026-11-01T18:00Z' });
  const comp = e.competitions[0];
  comp.broadcasts = [{ market: 'national', names: ['CBS'] }];
  comp.competitors[0].records = [{ name: 'overall', type: 'total', summary: '6-2' }, { name: 'Home', type: 'home', summary: '3-1' }];
  comp.competitors[0].team.color = 'E31837';
  comp.competitors[1].records = [{ summary: 'not a record' }];
  comp.competitors[1].team.color = 'url(x)';
  const [game] = parseScoreboard(SPORT.nfl, { events: [e] });
  assert.equal(game.tv, 'CBS');
  assert.deepEqual([game.home.record, game.home.color], ['6-2', '#e31837']);
  assert.deepEqual([game.away.record, game.away.color], [null, null]);
});

test('falls back to ESPN\'s standard logo address when the feed sends none', () => {
  const pro = parseScoreboard(SPORT.nfl, { events: [event({ id: '1', start: '2026-11-01T18:00Z' })] })[0];
  assert.equal(pro.home.logo, 'https://a.espncdn.com/i/teamlogos/nfl/500/kc.png');
  const e = event({ id: '2', start: '2026-11-01T18:00Z' });
  e.competitions[0].competitors[0].team.id = '61';
  const college = parseScoreboard(SPORT.ncaaf, { events: [e] })[0];
  assert.equal(college.home.logo, 'https://a.espncdn.com/i/teamlogos/ncaa/500/61.png');
});
