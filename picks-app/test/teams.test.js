import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { openStore } from '../src/db.js';
import { saveNametag } from '../src/nametags.js';
import { cleanLogo, COLLEGE_PROGRAMS, createTeamCatalog, parseTeams, SOURCES, teamsUrl } from '../src/teams.js';
import { addBet, clock, event, quiet, startApp } from './helpers.js';

const NOW = '2026-11-06T19:00:00.000Z';
const KICKOFF = '2026-11-08T18:00:00.000Z';

/** One team the way ESPN's team list has it. */
function espnTeam({ id, abbr, name, location = name.split(' ')[0], short = location, color = '112233', logo = `https://a.espncdn.com/i/teamlogos/nfl/500/${abbr.toLowerCase()}.png` }) {
  return { team: { id, abbreviation: abbr, displayName: name, location, shortDisplayName: short, color, alternateColor: 'ffffff', isActive: true, logos: logo ? [{ href: logo, rel: ['full', 'default'] }] : [] } };
}
/** A whole team list: sports[0].leagues[0].teams. */
const teamList = (teams) => ({ sports: [{ name: 'Football', leagues: [{ name: 'League', teams }] }] });

const NFL = teamList([
  espnTeam({ id: '12', abbr: 'KC', name: 'Kansas City Chiefs', location: 'Kansas City', color: 'E31837' }),
  espnTeam({ id: '2', abbr: 'BUF', name: 'Buffalo Bills', location: 'Buffalo', color: '00338d' }),
  espnTeam({ id: '21', abbr: 'PHI', name: 'Philadelphia Eagles', location: 'Philadelphia', color: 'zzz' }),
]);

const ncaaLogo = (id) => `https://a.espncdn.com/i/teamlogos/ncaa/500/${id}.png`;
const COLLEGE = teamList([
  espnTeam({ id: '333', abbr: 'ALA', name: 'Alabama Crimson Tide', location: 'Alabama', logo: ncaaLogo(333) }),
  espnTeam({ id: '2390', abbr: 'MIA', name: 'Miami Hurricanes', location: 'Miami', logo: ncaaLogo(2390) }),
  espnTeam({ id: '193', abbr: 'M-OH', name: 'Miami (OH) RedHawks', location: 'Miami (OH)', logo: ncaaLogo(193) }),
  espnTeam({ id: '193', abbr: 'MOH', name: 'Miami (OH) RedHawks', location: 'Miami (OH)', logo: ncaaLogo(193) }),
  espnTeam({ id: '2306', abbr: 'KSU', name: 'Kansas State Wildcats', location: 'Kansas State', logo: ncaaLogo(2306) }),
  espnTeam({ id: '245', abbr: 'TA&M', name: 'Texas A&M Aggies', location: 'Texas A&M', logo: ncaaLogo(245) }),
  espnTeam({ id: '245', abbr: 'TAM', name: 'Texas A&M Aggies', location: 'Texas A&M', logo: ncaaLogo(245) }),
  espnTeam({ id: '194', abbr: 'OSU', name: 'Ohio State Buckeyes', location: 'Ohio State', logo: ncaaLogo(194) }),
]);

describe('reading ESPN team lists', () => {
  test('a full list: names, keys, logos and colors', () => {
    assert.deepEqual(parseTeams('nfl', NFL), [
      { key: 'team:nfl:KC', league: 'nfl', name: 'Kansas City Chiefs', abbr: 'KC', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/kc.png', color: '#e31837' },
      { key: 'team:nfl:BUF', league: 'nfl', name: 'Buffalo Bills', abbr: 'BUF', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/buf.png', color: '#00338d' },
      { key: 'team:nfl:PHI', league: 'nfl', name: 'Philadelphia Eagles', abbr: 'PHI', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/phi.png', color: null },
    ]);
  });

  test('partial entries are dropped one by one, the rest kept', () => {
    const good = espnTeam({ id: '12', abbr: 'KC', name: 'Kansas City Chiefs' });
    const list = teamList([
      good,
      espnTeam({ id: '1', abbr: 'ATL', name: '', location: 'Atlanta' }), // no name
      espnTeam({ id: '3', abbr: 'C HI', name: 'Chicago Bears' }), // odd abbreviation
      espnTeam({ id: '4', abbr: 'CIN', name: 'Cincinnati Bengals', logo: null }), // no logo
      { team: { ...espnTeam({ id: '5', abbr: 'CLE', name: 'Cleveland Browns' }).team, isActive: false } },
      { team: null },
      null,
      'KC',
      { team: { ...good.team, displayName: 'Again' } }, // a second KC
    ]);
    assert.deepEqual(parseTeams('nfl', list).map((t) => t.key), ['team:nfl:KC']);
  });

  test('garbage gives nothing, never an error', () => {
    for (const bad of [null, undefined, 'teams', 42, {}, { sports: 'x' }, { sports: [] }, { sports: [{ leagues: [{ teams: 'no' }] }] }, { sports: [{ leagues: [{}] }] }]) {
      assert.deepEqual(parseTeams('nfl', bad), [], JSON.stringify(bad));
    }
    assert.deepEqual(parseTeams('cricket', NFL), [], 'an unknown source');
  });

  test('logos only over https from a.espncdn.com', () => {
    const hosts = [
      'http://a.espncdn.com/i/teamlogos/nfl/500/kc.png',
      'https://evil.example.com/kc.png',
      'https://a.espncdn.com.evil.example/kc.png',
      'https://user@a.espncdn.com/kc.png',
      'https://a.espncdn.com:8443/kc.png',
      'javascript:alert(1)',
      'data:image/png;base64,AAAA',
      '//a.espncdn.com/kc.png',
      'not a url',
    ];
    for (const url of hosts) {
      assert.equal(cleanLogo(url), null, url);
      assert.deepEqual(parseTeams('nfl', teamList([espnTeam({ id: '12', abbr: 'KC', name: 'Kansas City Chiefs', logo: url })])), [], url);
    }
    // One bad logo and one good one: the good one is used.
    const both = espnTeam({ id: '12', abbr: 'KC', name: 'Kansas City Chiefs' });
    both.team.logos.unshift({ href: 'https://evil.example.com/kc.png' });
    assert.equal(parseTeams('nfl', teamList([both]))[0].logo, 'https://a.espncdn.com/i/teamlogos/nfl/500/kc.png');
  });

  test('college keeps only the curated programs, by exact name, once each, keyed by ESPN id', () => {
    const teams = parseTeams('ncaab', COLLEGE);
    assert.deepEqual(teams.map((t) => [t.key, t.name]), [
      ['team:ncaa:333', 'Alabama Crimson Tide'],
      ['team:ncaa:2390', 'Miami Hurricanes'],
      ['team:ncaa:245', 'Texas A&M Aggies'],
      ['team:ncaa:194', 'Ohio State Buckeyes'],
    ]);
    // Football gives the same keys, so a school is one logo in the picker.
    assert.deepEqual(parseTeams('ncaaf', COLLEGE).map((t) => t.key), teams.map((t) => t.key));
    assert.equal(new Set(COLLEGE_PROGRAMS).size, COLLEGE_PROGRAMS.length, 'no program listed twice');
    assert.ok(COLLEGE_PROGRAMS.length >= 50);
  });

  test('the URLs: one per league, the long college lists in one go', () => {
    assert.equal(teamsUrl('nfl'), 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams');
    assert.equal(teamsUrl('ncaab'), 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams?limit=1000');
    assert.equal(teamsUrl('ncaaf'), 'https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams?limit=1000');
  });
});

/** A stand-in for ESPN's team lists: whatever `lists` has by source, else a 404. `gate` holds every answer until it resolves. */
function fakeTeamFetch(lists = {}) {
  const fake = {
    calls: [],
    gate: null,
    async fetch(url) {
      fake.calls.push(url);
      if (fake.gate) await fake.gate;
      const source = SOURCES.find((s) => teamsUrl(s.key) === url)?.key;
      const body = lists[source];
      if (body === undefined) return new Response('nope', { status: 404 });
      return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  };
  return fake;
}

describe('the catalog', () => {
  test('a refresh stores each list; a restart reads them back without ESPN', async () => {
    const store = openStore(':memory:');
    const fake = fakeTeamFetch({ nfl: NFL, ncaab: COLLEGE, ncaaf: COLLEGE });
    const time = clock(NOW);
    const catalog = createTeamCatalog({ store, fetch: fake.fetch, now: time.now, log: quiet });
    assert.deepEqual(await catalog.refresh(), { nfl: 3, nba: 0, mlb: 0, nhl: 0, ncaaf: 4, ncaab: 4 });
    assert.equal(fake.calls.length, SOURCES.length);
    assert.equal(catalog.get('team:nfl:KC').name, 'Kansas City Chiefs');
    assert.equal(catalog.get('team:ncaa:333').name, 'Alabama Crimson Tide');
    assert.equal(catalog.get('team:nfl:ZZZ'), null);
    assert.equal(catalog.get('team:ncaa:193'), null, 'not curated');
    assert.deepEqual(catalog.leagues().map((l) => [l.key, l.teams.length]), [['nfl', 3], ['ncaa', 4]]);
    assert.deepEqual(catalog.leagues()[0].teams.map((t) => t.abbr), ['BUF', 'KC', 'PHI'], 'A to Z');

    const restarted = createTeamCatalog({ store, fetch: null, now: time.now, log: quiet });
    assert.equal(restarted.get('team:nfl:KC').logo, 'https://a.espncdn.com/i/teamlogos/nfl/500/kc.png');
    store.close();
  });

  test('a failed or empty answer keeps the last good list', async () => {
    const store = openStore(':memory:');
    const time = clock(NOW);
    const lists = { nfl: NFL };
    const fake = fakeTeamFetch(lists);
    const catalog = createTeamCatalog({ store, fetch: fake.fetch, now: time.now, log: quiet });
    await catalog.refresh();
    for (const broken of [teamList([]), '<html>oops</html>', { sports: 'x' }, undefined]) {
      lists.nfl = broken;
      await catalog.refresh();
      assert.equal(catalog.get('team:nfl:KC')?.abbr, 'KC', String(broken));
    }
    assert.equal(store.get("SELECT COUNT(*) AS n FROM team_catalog WHERE source = 'nfl'").n, 3);
    store.close();
  });

  test('once a day: refreshIfDue starts one in the background, never twice at once, and waits after a failure', async () => {
    const store = openStore(':memory:');
    const time = clock(NOW);
    const fake = fakeTeamFetch({ nfl: NFL, nba: NFL, mlb: NFL, nhl: NFL, ncaaf: COLLEGE, ncaab: COLLEGE });
    let release;
    fake.gate = new Promise((resolve) => (release = resolve));
    const catalog = createTeamCatalog({ store, fetch: fake.fetch, now: time.now, log: quiet });
    const started = Date.now();
    const job = catalog.refreshIfDue();
    assert.ok(job instanceof Promise);
    assert.ok(Date.now() - started < 50, 'returns at once');
    assert.equal(catalog.refreshIfDue(), job, 'the same refresh, not a second one');
    assert.equal(catalog.get('team:nfl:KC'), null, 'nothing yet');
    release();
    await job;
    assert.equal(catalog.get('team:nfl:KC').abbr, 'KC');
    const calls = fake.calls.length;
    assert.equal(catalog.refreshIfDue(), null, 'fresh: nothing to do');
    time.advance(23 * 3_600_000);
    assert.equal(catalog.refreshIfDue(), null, 'still under a day');
    time.advance(1 * 3_600_000);
    await catalog.refreshIfDue();
    assert.equal(fake.calls.length, calls + SOURCES.length, 'a day later: every list again');
    store.close();
  });
});

describe('team logos as icons in the app', () => {
  let time;
  let app;
  let fake;
  let lists;

  beforeEach(async () => {
    time = clock(NOW);
    lists = { nfl: NFL, ncaab: COLLEGE };
    fake = fakeTeamFetch(lists);
    app = await startApp({ time, teamFetch: fake.fetch });
    // The fake board's teams: Chiefs (KC) at home, Bills (BUF) away, with ESPN's standard logos.
    app.espn.events.nfl.push(event({ id: '1', start: KICKOFF }));
  });

  afterEach(() => app.close());

  async function annOnBoard() {
    const ann = app.browser();
    await ann.join('ann@example.com', 'Ann');
    await ann.get('/games');
    addBet(app.store, { userId: app.store.get("SELECT id FROM users WHERE screen_name = 'Ann'").id, start: '2026-11-01T18:00:00.000Z' });
    return ann;
  }

  test('before ESPN answers: the games table\'s teams, and the profile never waits', async () => {
    let release;
    fake.gate = new Promise((resolve) => (release = resolve));
    const ann = await annOnBoard();
    const started = Date.now();
    const page = await ann.get('/u/Ann');
    assert.equal(page.status, 200);
    assert.ok(Date.now() - started < 2000, 'answered while ESPN hangs');
    assert.ok(fake.calls.length > 0, 'a refresh started');
    // The picker has the teams already on the board.
    assert.match(page.text, /<details class="team-league" data-league="nfl" >\s*<summary>NFL <span class="muted small">2 teams<\/span>/);
    assert.match(page.text, /<input type="radio" name="icon" value="team:nfl:KC" +><img src="https:\/\/a\.espncdn\.com\/i\/teamlogos\/nfl\/500\/kc\.png" alt="" width="30" height="30" loading="lazy"/);

    // Saved from the fallback, drawn from it.
    assert.equal((await ann.post('/nametag', { color: 'sky', icon: 'team:nfl:KC' })).location, '/u/Ann#nametag');
    assert.match((await app.browser().get('/leaderboard')).text,
      /<a class="who name-c-sky" href="\/u\/Ann">Ann<\/a><img class="name-logo" src="https:\/\/a\.espncdn\.com\/i\/teamlogos\/nfl\/500\/kc\.png" alt="Chiefs" title="Chiefs" width="18" height="18" loading="lazy"/);

    // ESPN answers: its names, and its whole league.
    release();
    await app.teams.refreshIfDue();
    const after = (await ann.get('/u/Ann')).text;
    assert.match(after, /NFL <span class="muted small">3 teams<\/span>/);
    assert.match(after, /<details class="team-league" data-league="nfl" open>/, 'the league with your pick starts open');
    assert.match(after, /<details class="team-league" data-league="ncaa" >\s*<summary>College <span class="muted small">4 teams/);
    assert.match((await app.browser().get('/leaderboard')).text, /<img class="name-logo" src="[^"]+kc\.png" alt="Kansas City Chiefs"/);
  });

  test('a college logo saves and shows; unknown teams are turned away; a team that leaves the catalog shows nothing', async () => {
    await app.teams.refresh();
    const ann = await annOnBoard();
    await ann.get('/u/Ann');
    await ann.post('/nametag', { color: 'default', icon: 'team:ncaa:333' });
    const board = (await app.browser().get('/leaderboard')).text;
    assert.match(board, /<a class="who" href="\/u\/Ann">Ann<\/a><img class="name-logo" src="https:\/\/a\.espncdn\.com\/i\/teamlogos\/ncaa\/500\/333\.png" alt="Alabama Crimson Tide"/);

    const id = app.store.get("SELECT id FROM users WHERE screen_name = 'Ann'").id;
    for (const bad of ['team:nfl:ZZZ', 'team:ncaa:193', 'team:ncaa:99999', 'team:xfl:KC']) {
      const result = saveNametag(app.store, { userId: id, color: 'gold', icon: bad, teams: app.teams });
      assert.ok(result.error, bad);
    }
    await ann.post('/nametag', { color: 'gold', icon: 'team:nfl:ZZZ' });
    assert.match((await ann.get('/u/Ann')).text, /Pick a team from the list\./);
    assert.equal(app.store.get('SELECT name_icon FROM users WHERE id = ?', id).name_icon, 'team:ncaa:333');

    // Alabama drops out of ESPN's list: no icon, no broken image.
    lists.ncaab = teamList(COLLEGE.sports[0].leagues[0].teams.filter((t) => t.team.id !== '333'));
    await app.teams.refresh();
    assert.equal(app.teams.get('team:ncaa:333'), null);
    const gone = (await app.browser().get('/leaderboard')).text;
    assert.match(gone, /<a class="who" href="\/u\/Ann">Ann<\/a>/);
    assert.doesNotMatch(gone, /class="name-logo"/);
  });
});
