// The March Madness bracket challenge: the field from ESPN or an admin, the
// First Four, saving picks, the lock, scoring, the tiebreaker, possible max,
// who sees what, and closing.

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import {
  assembleField, bracketStandings, challengeFor, closeChallenge, consistent, ensureChallenge, entryOf, fieldOf, gradeFromGames, isLocked,
  MAX_POINTS, openChallenge, PAIRS, participants, parsePastedField, recordFirstFour, recordResult, resultsOf, saveField, savePicks,
  scoreBracket, slotLabel, tournamentNote,
} from '../src/bracket.js';
import { parseScoreboard } from '../src/espn.js';
import { SPORT } from '../src/sports.js';
import { etToUtc } from '../src/time.js';
import { addPlayer, clock, event, setFinal, startApp, visible } from './helpers.js';

// Friday Nov 6, 2026: the 2027 challenge is the one ahead.
const NOW = '2026-11-06T19:00:00.000Z';
const et = (day, hour, minute = 0) => etToUtc(day, hour, minute).toISOString();
const LOCK = et('20270318', 12, 15);
const REGIONS = ['East', 'West', 'South', 'Midwest'];
// First Four slots: East 16, West 16, South 11, Midwest 11.
const FIRST_FOUR = new Set(['0-16', '1-16', '2-11', '3-11']);

let time;
let app;

beforeEach(async () => {
  time = clock(NOW);
  app = await startApp({ time, config: { adminEmails: ['boss@example.com'] } });
});

afterEach(() => app.close());

const team = (r, seed, x = '') => ({ name: `${REGIONS[r]} ${seed}${x}`, abbr: `${REGIONS[r][0]}${seed}${x.toUpperCase()}`, espnId: String(1000 + r * 100 + seed * 2 + (x === 'b' ? 1 : 0)) });

/** One of ESPN's tournament games: notes and seeds on the competitors (`seed`, or `curatedRank` for some). */
function tEvent({ id, start, region, round, home, away, homeSeed, awaySeed, rankField = false }) {
  const e = event({ id, start, home: [home.name, home.abbr], away: [away.name, away.abbr] });
  const comp = e.competitions[0];
  comp.notes = [{ type: 'event', headline: `Men's Basketball Championship - ${region ? `${region} Region - ` : ''}${round}` }];
  for (const [c, t, seed] of [[comp.competitors[0], home, homeSeed], [comp.competitors[1], away, awaySeed]]) {
    c.team.id = t.espnId;
    if (seed != null) {
      if (rankField) c.curatedRank = { current: seed };
      else c.seed = String(seed);
    }
  }
  return e;
}

/** The whole opening round as ESPN would list it: 32 Round of 64 games (four with a TBD First Four winner) and the 4 First Four games. */
function openingEvents() {
  const events = [];
  let n = 0;
  for (let r = 0; r < 4; r++) {
    for (const [i, [hi, lo]] of PAIRS.entries()) {
      const key = `${r}-${lo}`;
      const away = FIRST_FOUR.has(key) ? { name: 'TBD', abbr: 'TBD', espnId: '-1' } : team(r, lo);
      const day = i < 4 ? '20270318' : '20270319';
      events.push(tEvent({ id: `r1${++n}`, start: et(day, 12 + (i % 4), r === 0 && i === 0 ? 15 : 30), region: REGIONS[r], round: '1st Round', home: team(r, hi), away, homeSeed: hi, awaySeed: lo, rankField: r === 1 }));
    }
  }
  for (const key of FIRST_FOUR) {
    const [r, seed] = key.split('-').map(Number);
    events.push(tEvent({ id: `ff${++n}`, start: et('20270316', 18), region: REGIONS[r], round: 'First Four', home: team(r, seed, 'a'), away: team(r, seed, 'b'), homeSeed: seed, awaySeed: seed }));
  }
  return events;
}

const parse = (events) => parseScoreboard(SPORT.ncaab, { events: structuredClone(events) });

/** The 2027 challenge with the fixture field, opened, locking at LOCK. */
function openedChallenge() {
  let c = ensureChallenge(app.store, 2027, time.now());
  const draft = assembleField(parse(openingEvents()));
  assert.deepEqual(draft.problems, []);
  assert.ok(saveField(app.store, c, draft.slots, time.now()).ok);
  const boss = addPlayer(app.store, 'Boss');
  assert.ok(openChallenge(app.store, c, { regions: REGIONS, locksAt: new Date(LOCK), userId: boss, now: time.now() }).ok);
  c = challengeFor(app.store, 2027);
  return c;
}

/** A full bracket: every game to the better seed (or, with `upsets`, the worse one in those games). */
function chalk(upsets = new Set()) {
  let picks = {};
  for (let g = 0; g < 63; g++) {
    const [a, b] = participants(g, picks);
    const seedOf = (s) => Number(s.split('-')[1]);
    const better = seedOf(a) <= seedOf(b) ? a : b;
    picks[g] = upsets.has(g) ? (better === a ? b : a) : better;
    picks = consistent(picks);
  }
  return picks;
}

const slotsOf = (picks) => Object.fromEntries(Object.entries(picks).map(([g, s]) => [`g${g}`, s]));

describe('the field', () => {
  test('ESPN notes say which games are the tournament, which round and region', () => {
    assert.deepEqual(tournamentNote("Men's Basketball Championship - South Region - 1st Round"), { round: 0, region: 'South' });
    assert.deepEqual(tournamentNote("Men's Basketball Championship - Midwest Region - Elite 8"), { round: 3, region: 'Midwest' });
    assert.deepEqual(tournamentNote("Men's Basketball Championship - East Region - First Four"), { round: 'ff', region: 'East' });
    assert.deepEqual(tournamentNote("Men's Basketball Championship - National Championship"), { round: 5, region: null });
    assert.equal(tournamentNote("Women's Basketball Championship - Spokane Region - 1st Round"), null);
    assert.equal(tournamentNote('Men\'s NIT - 1st Round'), null);
    assert.equal(tournamentNote(null), null);
  });

  test('assembled from ESPN fixtures: 64 slots, First Four slots hold both teams, the lock is the first tip', () => {
    const games = parse(openingEvents());
    assert.equal(games.find((g) => g.id === 'ncaab:r11').note, "Men's Basketball Championship - East Region - 1st Round");
    assert.equal(games.find((g) => g.id === 'ncaab:r11').home.seed, 1);
    assert.equal(games.find((g) => g.id === 'ncaab:r19').home.seed, 1, 'the West has its seeds in curatedRank');
    const draft = assembleField(games);
    assert.deepEqual(draft.problems, []);
    assert.deepEqual(draft.regions, REGIONS);
    assert.equal(draft.slots.length, 64);
    assert.equal(draft.locksAt, LOCK);
    const east16 = draft.slots.find((s) => s.region === 0 && s.seed === 16);
    assert.deepEqual([east16.name, east16.name2], ['East 16a', 'East 16b']);
    const east1 = draft.slots.find((s) => s.region === 0 && s.seed === 1);
    assert.deepEqual([east1.name, east1.abbr, east1.espnId], ['East 1', 'E1', '1002']);
  });

  test('anything that does not add up is listed for the admin', () => {
    const events = openingEvents();
    events.splice(events.findIndex((e) => e.id === 'ff33'), 1);
    const bad = events.find((e) => e.id === 'r12');
    bad.competitions[0].competitors[1].seed = '10';
    const draft = assembleField(parse(events));
    assert.ok(draft.problems.some((p) => /seeds 8 and 10 don't meet/.test(p)));
    assert.ok(draft.problems.some((p) => /still TBD/.test(p)));
    assert.ok(draft.problems.some((p) => /of 64 teams/.test(p)));
  });

  test('pasted by an admin: Region, Seed, Team, with a First Four pair', () => {
    const lines = [];
    for (let r = 0; r < 4; r++) for (let seed = 1; seed <= 16; seed++) lines.push(`${REGIONS[r]}, ${seed}, ${team(r, seed).name}${FIRST_FOUR.has(`${r}-${seed}`) ? ` / ${team(r, seed, 'b').name}` : ''}`);
    const parsed = parsePastedField(lines.join('\n'), REGIONS);
    assert.equal(parsed.slots.length, 64);
    assert.equal(parsed.slots.filter((s) => s.name2).length, 4);
    assert.match(parsePastedField('North, 1, Duke', REGIONS).error, /isn't one of the regions/);
    assert.match(parsePastedField(lines.slice(1).join('\n'), REGIONS).error, /63 of 64/);
    assert.match(parsePastedField([...lines.slice(1), 'East, 1, West 1'].join('\n'), REGIONS).error, /in the field twice/);
  });

  test('the admin page works with no ESPN: paste the field, confirm it with the regions and the lock; everyone else gets a 404', async () => {
    app.espn.down = true;
    const boss = app.browser();
    await boss.join('boss@example.com', 'Boss');
    const ann = app.browser();
    await ann.join('ann@example.com', 'Ann');
    assert.equal((await ann.get('/admin/bracket')).status, 404);
    assert.equal((await ann.post('/admin/bracket/start', {})).status, 404);

    assert.match(visible((await boss.get('/admin/bracket')).text), /No bracket challenge for 2027 yet/);
    assert.equal((await boss.post('/admin/bracket/start', {})).status, 303);
    // ESPN is down: the page says so and nothing breaks.
    const espn = await boss.post('/admin/bracket/espn', {});
    assert.equal(espn.status, 503);
    assert.match(visible(espn.text), /ESPN didn't answer\. Try again, or enter the field by hand\./);
    // Not open yet: players see the off-season line.
    assert.match(visible((await ann.get('/bracket')).text), /The bracket challenge opens on Selection Sunday\./);

    const lines = [];
    for (let r = 0; r < 4; r++) for (let seed = 1; seed <= 16; seed++) lines.push(`${REGIONS[r]}, ${seed}, ${team(r, seed).name}${FIRST_FOUR.has(`${r}-${seed}`) ? ` / ${team(r, seed, 'b').name}` : ''}`);
    await boss.get('/admin/bracket');
    assert.equal((await boss.post('/admin/bracket/paste', { field: lines.join('\n') })).status, 303);
    assert.equal(fieldOf(app.store, 2027).size, 64);
    // The one-box-a-team form saves the same way.
    const form = {};
    for (let r = 0; r < 4; r++) for (let seed = 1; seed <= 16; seed++) form[`t_${r}_${seed}`] = team(r, seed).name;
    form.t2_0_16 = 'East 16b';
    await boss.get('/admin/bracket');
    assert.equal((await boss.post('/admin/bracket/field', form)).status, 303);
    assert.equal(slotLabel(fieldOf(app.store, 2027).get('0-16')), 'East 16 / East 16b');
    const open = new URLSearchParams({ _csrf: boss.csrf, lock_date: '2027-03-18', lock_time: '12:15' });
    for (const r of ['Midwest', 'West', 'South', 'East']) open.append('region', r);
    await boss.request('/admin/bracket/open', { method: 'POST', body: open, headers: { 'content-type': 'application/x-www-form-urlencoded', origin: boss.base } });
    const c = challengeFor(app.store, 2027);
    assert.ok(c.opened_at);
    assert.equal(c.locks_at, LOCK);
    assert.deepEqual(c.regionNames, ['Midwest', 'West', 'South', 'East'], 'Final Four order as the admin set it');
    assert.match(visible((await ann.get('/bracket')).text), /March Madness 2027 Free Your bracket 0 of 63 picked/);
    // The hub card.
    assert.match(visible((await ann.get('/tournaments')).text), /March Madness 2027 Pick all 63 games\. .* 0 of 63 Picked/);
  });
});

describe('brackets', () => {
  test('First Four: the pick names the slot, and whoever wins the First Four fills it', () => {
    const c = openedChallenge();
    const ann = addPlayer(app.store, 'Ann');
    // Game 0 is East 1 v East 16 (a First Four slot); Ann takes the 16.
    assert.deepEqual(participants(0, {}), ['0-1', '0-16']);
    assert.ok(savePicks(app.store, c, { userId: ann, updates: { 0: '0-16' }, now: time.now() }).ok);
    assert.equal(slotLabel(fieldOf(app.store, 2027).get('0-16')), 'East 16a / East 16b');
    assert.ok(recordFirstFour(app.store, c, { slot: '0-16', winner: 2 }).ok);
    assert.equal(slotLabel(fieldOf(app.store, 2027).get('0-16')), 'East 16b');
    assert.equal(entryOf(app.store, 2027, ann).picks[0], '0-16', 'the pick is unchanged');
    time.set(LOCK);
    recordResult(app.store, c, { game: 0, winner: '0-16', source: 'admin', now: time.now() });
    assert.equal(scoreBracket(entryOf(app.store, 2027, ann).picks, resultsOf(app.store, 2027)).points, 10);
  });

  test('a full 63-pick save from one form, and a changed pick drops the later picks that rode on it', async () => {
    openedChallenge();
    const b = app.browser();
    await b.join('ann@example.com', 'Ann');
    const page = await b.get('/bracket?view=0');
    assert.match(visible(page.text), /East West South Midwest Final Four Standings/);
    assert.match(page.text, /name="g0" value="0-1"/);
    assert.match(page.text, /Pick game 1 first/, 'the Round of 32 waits on the Round of 64');
    const picks = chalk();
    const saved = await b.post('/bracket', { ...slotsOf(picks), tiebreak: '141', view: 'ff' });
    assert.equal(saved.status, 303);
    const ann = app.store.get("SELECT id FROM users WHERE screen_name = 'Ann'").id;
    const entry = entryOf(app.store, 2027, ann);
    assert.equal(Object.keys(entry.picks).length, 63);
    assert.equal(entry.tiebreak, 141);
    assert.equal(entry.picks[62], '0-1');
    assert.match(visible((await b.get('/bracket?view=ff')).text), /63 of 63 picked/);
    // Switch game 0 to the 16 seed: East 1's later picks go; the rest stay.
    await b.get('/bracket?view=0');
    await b.post('/bracket', { g0: '0-16', view: '0' });
    const after = entryOf(app.store, 2027, ann).picks;
    assert.equal(after[0], '0-16');
    assert.equal(after[32], undefined, 'East 1 no longer gets to the Round of 32');
    assert.equal(after[62], undefined);
    assert.equal(after[1], '0-8');
    assert.equal(Object.keys(after).length, 63 - 5, 'its 5 later games');
    // A pick that isn't one of the game's teams is turned away.
    assert.match(savePicks(app.store, challengeFor(app.store, 2027), { userId: ann, updates: { 32: '0-5' }, now: time.now() }).notes[0], /round before/);
    assert.match(savePicks(app.store, challengeFor(app.store, 2027), { userId: ann, tiebreak: '20', now: time.now() }).error, /60 to 300/);
  });

  test('locked at the first Round of 64 tip: nothing saves after', async () => {
    openedChallenge();
    const b = app.browser();
    await b.join('ann@example.com', 'Ann');
    await b.get('/bracket');
    await b.post('/bracket', { g0: '0-1', view: '0' });
    time.set(LOCK);
    const c = challengeFor(app.store, 2027);
    assert.ok(isLocked(c, time.now()));
    const page = await b.get('/bracket?view=0');
    assert.doesNotMatch(page.text, /type="radio"/, 'read-only');
    await b.post('/bracket', { g1: '0-8', view: '0' });
    const ann = app.store.get("SELECT id FROM users WHERE screen_name = 'Ann'").id;
    assert.deepEqual(entryOf(app.store, 2027, ann).picks, { 0: '0-1' });
    assert.match(savePicks(app.store, c, { userId: ann, updates: { 1: '0-8' }, now: time.now() }).error, /locked/);
  });

  test('scoring by round, the tiebreaker, and possible max', () => {
    const c = openedChallenge();
    const [ann, bob, cat] = ['Ann', 'Bob', 'Cat'].map((n) => addPlayer(app.store, n));
    const all = chalk();
    savePicks(app.store, c, { userId: ann, updates: all, tiebreak: 150, now: time.now() });
    savePicks(app.store, c, { userId: bob, updates: all, tiebreak: 140, now: time.now() });
    savePicks(app.store, c, { userId: cat, updates: chalk(new Set([0])), tiebreak: 150, now: time.now() });
    time.set(LOCK);
    let rows = bracketStandings(app.store, c);
    assert.deepEqual(rows.map((r) => [r.points, r.max]), [[0, MAX_POINTS], [0, MAX_POINTS], [0, MAX_POINTS]]);
    // The whole tournament goes chalk.
    const results = {};
    for (let g = 0; g < 63; g++) {
      results[g] = all[g];
      recordResult(app.store, c, { game: g, winner: all[g], source: 'admin', now: time.now(), total: g === 62 ? 147 : null });
    }
    const full = scoreBracket(all, results);
    assert.deepEqual(full.correct, [32, 16, 8, 4, 2, 1]);
    assert.equal(full.points, 32 * 10 + 16 * 20 + 8 * 40 + 4 * 80 + 2 * 160 + 320);
    assert.equal(full.points, MAX_POINTS);
    rows = bracketStandings(app.store, challengeFor(app.store, 2027));
    // Ann and Bob are perfect; Ann's 150 is closer to 147 than Bob's 140. Cat took East 16, so missed game 0 and every East 1 game after.
    assert.deepEqual(rows.map((r) => [r.screen_name, r.points, r.rank]), [['Ann', 1920, 1], ['Bob', 1920, 2], ['Cat', 1290, 3]]);
  });

  test('possible max drops when a picked team loses', () => {
    const c = openedChallenge();
    const ann = addPlayer(app.store, 'Ann');
    const picks = chalk();
    savePicks(app.store, c, { userId: ann, updates: picks, now: time.now() });
    time.set(LOCK);
    // East 1 (Ann's champion) loses its first game.
    recordResult(app.store, c, { game: 0, winner: '0-16', source: 'admin', now: time.now() });
    const s = scoreBracket(entryOf(app.store, 2027, ann).picks, resultsOf(app.store, 2027));
    assert.equal(s.points, 0);
    assert.equal(s.max, MAX_POINTS - (10 + 20 + 40 + 80 + 160 + 320));
  });

  test('other players\' brackets show only after the lock', async () => {
    const c = openedChallenge();
    const b = app.browser();
    await b.join('ann@example.com', 'Ann');
    const bob = app.browser();
    await bob.join('bob@example.com', 'Bob');
    const bobId = app.store.get("SELECT id FROM users WHERE screen_name = 'Bob'").id;
    savePicks(app.store, c, { userId: bobId, updates: chalk(), now: time.now() });
    assert.equal((await b.get('/bracket?player=Bob')).status, 404);
    const standings = visible((await b.get('/bracket?view=standings')).text);
    assert.match(standings, /Bob 63 of 63 picked 0 1920 Hidden until the lock/);
    time.set(LOCK);
    const theirs = await b.get('/bracket?player=Bob&view=ff');
    assert.equal(theirs.status, 200);
    assert.match(visible(theirs.text), /Bob's bracket .* East 1 .*Pick/);
    assert.match((await b.get('/bracket')).text, /href="\/bracket\?player=Bob"/, 'standings link to brackets once locked');
  });

  test('ESPN finals grade the bracket, and the title game closes it: a badge and Cup points', () => {
    const c = openedChallenge();
    const [ann, bob] = ['Ann', 'Bob'].map((n) => addPlayer(app.store, n));
    savePicks(app.store, c, { userId: ann, updates: chalk(), tiebreak: 150, now: time.now() });
    savePicks(app.store, c, { userId: bob, updates: chalk(new Set([62])), tiebreak: 150, now: time.now() });
    time.set(LOCK);
    // A First Four final, then a Round of 64 final, as ESPN sends them.
    const events = openingEvents();
    const ff = events.find((e) => e.competitions[0].notes[0].headline.includes('East Region - First Four'));
    setFinal(ff, 70, 75); // the away team (East 16b) wins
    const r1 = events.find((e) => e.id === 'r11');
    // By now ESPN shows the First Four winner in its Round of 64 game.
    Object.assign(r1.competitions[0].competitors[1].team, { displayName: 'East 16b', shortDisplayName: 'East 16b', abbreviation: 'E16B', id: '1033' });
    setFinal(r1, 80, 60);
    const added = gradeFromGames(app.store, c, parse([ff, r1]), time.now());
    assert.equal(added, 2);
    assert.equal(fieldOf(app.store, 2027).get('0-16').ff_winner, 2);
    assert.deepEqual(resultsOf(app.store, 2027), { 0: '0-1' });
    // Everything else by hand, the title game to the 1 seed in the East.
    const all = chalk();
    for (let g = 1; g < 63; g++) recordResult(app.store, c, { game: g, winner: all[g], source: 'admin', now: time.now(), total: g === 62 ? 150 : null });
    const top = closeChallenge(app.store, challengeFor(app.store, 2027), time.now(), app.notifier);
    assert.deepEqual(top.map((r) => [r.screen_name, r.rank]), [['Ann', 1], ['Bob', 2]]);
    assert.ok(app.store.get("SELECT 1 AS x FROM badges WHERE user_id = ? AND key = 'bracket_champion' AND ref = 'bracket-2027'", ann));
    assert.deepEqual(app.store.all("SELECT user_id, place FROM cup_points WHERE source = 'bracket' ORDER BY place").map((r) => [r.user_id, r.place]), [[ann, 1], [bob, 2]]);
    assert.equal(closeChallenge(app.store, challengeFor(app.store, 2027), time.now(), app.notifier), null, 'once');
    assert.ok(app.store.all('SELECT text FROM notifications WHERE user_id = ?', ann).some((n) => n.text === 'You finished #1 in March Madness 2027 (1920 pts).'));
  });
});
