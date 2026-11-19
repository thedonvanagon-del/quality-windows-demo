import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { createEspn, parseSummary, summaryForGame } from '../src/espn.js';
import { SPORT } from '../src/sports.js';
import { createSummaries } from '../src/summaries.js';
import { clock, event, quiet, setLive, startApp, visible } from './helpers.js';

// Sunday 8am Eastern; Bills at Chiefs kicks off at 1pm.
const MORNING = '2026-10-25T12:00:00.000Z';
const KICKOFF = '2026-10-25T17:00:00.000Z';

const hurt = (name, status, pos = 'WR', type = 'Ankle') => ({
  athlete: { displayName: name, position: { abbreviation: pos } },
  status,
  type: { description: status.toLowerCase() },
  details: { type, detail: 'Out', returnDate: '2026-11-01' },
});
const played = (gameResult, score, atVs, opp, gameDate) => ({ gameResult, score, atVs, opponent: { abbreviation: opp, displayName: opp }, gameDate });

/** ESPN's summary for Bills at Chiefs, in the shape it's known to send. */
export const FULL = {
  injuries: [
    {
      team: { abbreviation: 'KC', displayName: 'Kansas City Chiefs' },
      injuries: [
        hurt('Probable Guy', 'Probable'),
        hurt('Dtd Guy', 'Day-To-Day', 'TE'),
        hurt('Q One', 'Questionable', 'RB'),
        hurt('Out One', 'Out', 'QB', 'Knee'),
        hurt('Doubt One', 'Doubtful'),
        hurt('Q Two', 'Questionable'),
        hurt('Ir One', 'Injured Reserve', 'LB'),
        hurt('Seventh Guy', 'Day-To-Day'),
      ],
    },
    { team: { abbreviation: 'BUF', displayName: 'Buffalo Bills' }, injuries: [hurt('Bill Hurt', 'Questionable', 'CB', 'Hamstring')] },
  ],
  lastFiveGames: [
    {
      team: { abbreviation: 'KC' },
      events: [
        played('W', '27-20', 'vs', 'DEN', '2026-10-01T00:20Z'),
        played('L', '17-24', '@', 'LV', '2026-10-08T00:20Z'),
        played('W', '31-10', 'vs', 'LAC', '2026-10-12T17:00Z'),
        played('W', '23-20', '@', 'CIN', '2026-10-19T17:00Z'),
        played('T', '20-20', '@', 'PIT', '2026-09-24T17:00Z'),
        played('W', '30-3', 'vs', 'NYJ', '2026-09-17T17:00Z'),
      ],
    },
    { team: { abbreviation: 'BUF' }, events: [played('W', '112-104', 'vs', 'BOS', '2026-10-19T17:00Z')] },
  ],
};

const GAME = { id: 'nfl:1', sport: 'nfl', home: { abbr: 'KC', name: 'Chiefs', short: 'Chiefs' }, away: { abbr: 'BUF', name: 'Bills', short: 'Bills' } };

describe('reading ESPN game summaries', () => {
  test('a full summary: injuries worst first, six a team; the last five, newest first', () => {
    const s = parseSummary(structuredClone(FULL));
    const kc = s.injuries.find((t) => t.abbr === 'KC');
    assert.equal(kc.players.length, 6);
    assert.deepEqual(kc.players.map((p) => p.status), ['Injured Reserve', 'Out', 'Doubtful', 'Questionable', 'Questionable', 'Day-To-Day']);
    assert.deepEqual(kc.players[1], { name: 'Out One', pos: 'QB', status: 'Out', detail: 'Knee' });
    const form = s.form.find((t) => t.abbr === 'KC').games;
    assert.equal(form.length, 5);
    assert.deepEqual(form.map((g) => `${g.result} ${g.score} ${g.atVs} ${g.opp}`), ['W 23-20 @ CIN', 'W 31-10 vs LAC', 'L 17-24 @ LV', 'W 27-20 vs DEN', 'T 20-20 @ PIT']);

    const forGame = summaryForGame(s, GAME);
    assert.equal(forGame.away.injuries[0].name, 'Bill Hurt');
    assert.equal(forGame.away.form[0].score, '112-104');
    assert.equal(forGame.home.form.length, 5);
  });

  test('a partial summary: missing fields are skipped, not guessed', () => {
    const s = parseSummary({
      injuries: [
        {
          team: { displayName: 'Chiefs' },
          injuries: [
            { athlete: { displayName: 'No Position' }, status: 'OUT' },
            { athlete: { displayName: 'From Type', position: {} }, type: { description: 'day-to-day' } },
            { athlete: {}, status: 'Out' },
            { athlete: { displayName: 'Healthy' }, status: 'Active' },
            { status: 'Questionable' },
          ],
        },
        { injuries: [{ athlete: { displayName: 'Teamless' }, status: 'Out' }] },
      ],
      lastFiveGames: [
        { team: { abbreviation: 'buf' }, events: [played('W', '20-17', 'vs', 'MIA'), { gameResult: 'L', score: '10-13' }, played('X', '1-0', 'vs', 'NE'), played('L', 'twenty', '@', 'NE')] },
      ],
    });
    assert.deepEqual(s.injuries, [{ abbr: null, name: 'Chiefs', players: [
      { name: 'No Position', pos: null, status: 'Out', detail: null },
      { name: 'From Type', pos: null, status: 'Day-To-Day', detail: null },
    ] }]);
    assert.deepEqual(s.form, [{ abbr: 'BUF', name: null, games: [{ result: 'W', score: '20-17', atVs: 'vs', opp: 'MIA', date: null }] }]);
    const forGame = summaryForGame(s, GAME);
    assert.equal(forGame.home.injuries.length, 2, 'matched by name when there is no abbreviation');
    assert.equal(forGame.home.form.length, 0);
    assert.equal(forGame.away.form.length, 1);
    assert.equal(forGame.away.injuries.length, 0);
  });

  test('garbage gives nothing, and nothing shows', () => {
    for (const junk of [null, undefined, 'oops', 42, [], {}, { injuries: 'x', lastFiveGames: 7 }, { injuries: [null, 1, 'x', { team: 5, injuries: {} }] },
      { lastFiveGames: [{ team: { abbreviation: 'KC' }, events: [null, 'W', { gameResult: 'W', score: '<b>1-0</b>', opponent: { abbreviation: 'X' } }] }] },
      { injuries: [{ team: { abbreviation: 'KC' }, injuries: [{ athlete: { displayName: 'x'.repeat(200) }, status: 'Out' }, { athlete: { displayName: 'Ok' }, status: { weird: true } }] }] }]) {
      const s = parseSummary(junk);
      assert.deepEqual(s, { injuries: [], form: [] }, JSON.stringify(junk));
      assert.equal(summaryForGame(s, GAME), null);
    }
    assert.equal(summaryForGame(parseSummary({ injuries: [{ team: { abbreviation: 'NYG' }, injuries: [hurt('Other Team', 'Out')] }] }), GAME), null, "other teams' entries don't count");
  });

  test('the client asks for the summary like the scoreboard, and throws on a bad answer', async () => {
    const asked = [];
    const espn = createEspn({
      fetch: async (url, init) => {
        asked.push({ url, init });
        return url.includes('event=500') ? new Response('no', { status: 500 }) : Response.json(FULL);
      },
    });
    const s = await espn.summary(SPORT.nba, '401');
    assert.equal(asked[0].url, 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=401');
    assert.equal(asked[0].init.headers['user-agent'], 'bookiebullies-app/0.1');
    assert.ok(asked[0].init.signal instanceof AbortSignal, 'with a timeout');
    assert.equal(s.injuries.length, 2);
    await assert.rejects(espn.summary(SPORT.nba, '500'), /summary answered 500/);
  });
});

describe('the summary cache', () => {
  function setup({ answer = () => FULL, maxGames } = {}) {
    const time = clock(MORNING);
    const logged = [];
    const espn = { calls: 0, gate: null, async summary() { this.calls += 1; if (this.gate) await this.gate; return parseSummary(structuredClone(answer())); } };
    const summaries = createSummaries({ espn, now: time.now, log: { ...quiet, warn: (t) => logged.push(t) }, maxGames });
    return { time, logged, espn, summaries };
  }

  test('one request per game at a time, kept 30 minutes', async () => {
    const { time, espn, summaries } = setup();
    let release;
    espn.gate = new Promise((resolve) => (release = resolve));
    for (let i = 0; i < 20; i++) assert.equal(summaries.peek(GAME), null, 'nothing yet, and no waiting');
    assert.equal(espn.calls, 1, 'twenty views, one request');
    release();
    await summaries.load(GAME);
    assert.equal(summaries.peek(GAME).away.injuries[0].name, 'Bill Hurt');
    espn.gate = null;
    time.advance(29 * 60_000);
    summaries.peek(GAME);
    assert.equal(espn.calls, 1, 'fresh for 30 minutes');
    time.advance(2 * 60_000);
    assert.ok(summaries.peek(GAME), 'the old copy shows while the new one loads');
    assert.equal(espn.calls, 2);
  });

  test('a failure is logged once, shows nothing, and is retried after a while', async () => {
    let fail = true;
    const { time, logged, espn, summaries } = setup({ answer: () => { if (fail) throw new Error('ESPN said no'); return FULL; } });
    summaries.peek(GAME);
    await summaries.load(GAME);
    for (let i = 0; i < 5; i++) assert.equal(summaries.peek(GAME), null);
    assert.equal(espn.calls, 1);
    assert.deepEqual(logged, ['summary nfl:1: ESPN said no']);
    fail = false;
    time.advance(6 * 60_000);
    summaries.peek(GAME);
    await summaries.load(GAME);
    assert.ok(summaries.peek(GAME));
    assert.equal(logged.length, 1);
  });

  test('keeps a bounded number of games', async () => {
    const { espn, summaries } = setup({ maxGames: 2 });
    for (const id of ['nfl:1', 'nfl:2', 'nfl:3']) await summaries.load({ ...GAME, id });
    summaries.peek({ ...GAME, id: 'nfl:3' });
    summaries.peek({ ...GAME, id: 'nfl:2' });
    assert.equal(espn.calls, 3);
    summaries.peek({ ...GAME, id: 'nfl:1' });
    assert.equal(espn.calls, 4, 'the oldest was dropped');
  });
});

describe('injuries and form on the game page', () => {
  let time;
  let app;
  let game;
  const page = '/games/nfl%3A1';

  beforeEach(async () => {
    time = clock(MORNING);
    app = await startApp({ time });
    game = event({ id: '1', start: KICKOFF });
    app.espn.events.nfl.push(game);
  });
  afterEach(() => app.close());

  async function player() {
    const b = app.browser();
    await b.join('ann@example.com', 'Ann');
    await b.get('/games');
    return b;
  }

  test('the first view starts the fetch; the next shows both sections', async () => {
    app.espn.summaries['1'] = FULL;
    const ann = await player();
    const first = visible((await ann.get(page)).text);
    assert.doesNotMatch(first, /Injuries|Recent form/);
    await app.summaries.idle(app.games.get('nfl:1'));
    const next = await ann.get(page);
    const text = visible(next.text);
    assert.match(text, /Injuries BUF Bills Bill Hurt CB Questionable · Hamstring KC Chiefs Ir One LB Injured Reserve · Ankle Out One QB Out · Knee Doubt One/);
    assert.doesNotMatch(text, /Seventh Guy|Probable Guy/, 'six a team, worst first');
    assert.match(text, /Recent form BUF Bills 1-0 W Won 112-104 vs BOS KC Chiefs 3-1-1 W Won 23-20 @ CIN W Won 31-10 vs LAC L Lost 17-24 @ LV W Won 27-20 vs DEN T Tied 20-20 @ PIT Chat/);
    // The header's Chat Rooms tab comes first; the game's chat section is the one with id="chat".
    assert.ok(next.text.indexOf('Recent form') < next.text.indexOf('id="chat"'), 'above the chat');
    assert.match(next.text, /<li class="form-chip l">/);
    assert.equal(app.espn.summaryCalls, 1);
  });

  test('only what there is: one empty section hides, an empty summary shows neither', async () => {
    app.espn.summaries['1'] = { lastFiveGames: FULL.lastFiveGames };
    const ann = await player();
    await ann.get(page);
    await app.summaries.idle(app.games.get('nfl:1'));
    const text = visible((await ann.get(page)).text);
    assert.doesNotMatch(text, /Injuries/);
    assert.match(text, /Recent form/);

    app.espn.summaries['1'] = { injuries: [], lastFiveGames: [{ team: { abbreviation: 'NYG' }, events: [] }] };
    time.advance(31 * 60_000);
    await ann.get(page);
    await app.summaries.idle(app.games.get('nfl:1'));
    assert.doesNotMatch(visible((await ann.get(page)).text), /Injuries|Recent form/);
  });

  test('never waits on a slow ESPN, and a failure shows nothing', async () => {
    app.espn.summaries['1'] = FULL;
    app.espn.summaryGate = new Promise(() => {}); // ESPN never answers
    const ann = await player();
    const started = Date.now();
    for (let i = 0; i < 5; i++) {
      const res = await ann.get(page);
      assert.equal(res.status, 200);
      assert.doesNotMatch(visible(res.text), /Injuries/);
    }
    assert.ok(Date.now() - started < 2000, 'pages came back without waiting');
    assert.equal(app.espn.summaryCalls, 1, 'one request in flight for all five views');

    // A different game whose summary fails: logged once, nothing shown.
    app.espn.summaryGate = null;
    app.espn.summaryDown = true;
    app.espn.events.nfl.push(event({ id: '2', start: KICKOFF, home: ['Lions', 'DET'], away: ['Bears', 'CHI'] }));
    time.advance(3 * 60_000);
    await ann.get('/games');
    await ann.get('/games/nfl%3A2');
    await app.summaries.idle(app.games.get('nfl:2'));
    for (let i = 0; i < 3; i++) assert.doesNotMatch(visible((await ann.get('/games/nfl%3A2')).text), /Injuries|Recent form/);
    assert.deepEqual(app.logged, ['summary nfl:2: ESPN summary is down']);
  });

  test('gone once the game starts, and no fetch for a started game', async () => {
    app.espn.summaries['1'] = FULL;
    const ann = await player();
    setLive(game);
    time.set('2026-10-25T17:05:00.000Z');
    await ann.get('/games');
    await app.games.checkFinals();
    const calls = app.espn.summaryCalls;
    assert.doesNotMatch(visible((await ann.get(page)).text), /Injuries|Recent form/);
    assert.equal(app.espn.summaryCalls, calls);
  });
});
