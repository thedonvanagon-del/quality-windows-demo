import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { impliedPct } from '../src/picks.js';
import * as play from '../src/views/play.js';
import { unitsPill } from '../src/views/layout.js';
import { clock, event, setFinal, setLive, startApp, visible } from './helpers.js';

// Sunday 8am Eastern. Bills at Chiefs at 1pm today; Lakers at Celtics tonight;
// Rangers at Bruins tomorrow night; Packers at Bears the Sunday after (NFL only looks a week out).
const MORNING = '2026-10-25T12:00:00.000Z';
const KICKOFF = '2026-10-25T17:00:00.000Z';
const BILLS_PLUS = { game: 'nfl:1', market: 'spread', side: 'away', line: '3.5', odds: '-110', units: '1' };

let time;
let app;
let bills;

beforeEach(async () => {
  time = clock(MORNING);
  app = await startApp({ time });
  bills = event({ id: '1', start: KICKOFF });
  app.espn.events.nfl.push(bills);
  app.espn.events.nfl.push(event({ id: '2', start: '2026-10-29T00:15:00.000Z', home: ['Bears', 'CHI'], away: ['Packers', 'GB'] }));
  app.espn.events.nba.push(event({ id: '5', start: '2026-10-25T23:30:00.000Z', home: ['Celtics', 'BOS'], away: ['Lakers', 'LAL'], spread: -4.5, total: 224.5, ml: { home: -190, away: 160 } }));
  app.espn.events.nhl.push(event({ id: '9', start: '2026-10-26T23:00:00.000Z', home: ['Bruins', 'BOS'], away: ['Rangers', 'NYR'], spread: -1.5, total: 6, ml: { home: -130, away: 110 } }));
});

afterEach(() => app.close());

async function player(email, name) {
  const b = app.browser();
  await b.join(email, name);
  await b.get('/games');
  return b;
}

const card = (page, id) => page.match(new RegExp(`<article class="event gc[^"]*" id="g-${id.replace(':', '-')}"[\\s\\S]*?</article>`))?.[0] ?? '';
const order = (page) => [...page.matchAll(/<article class="event gc[^"]*" id="g-([a-z]+)-(\d+)"/g)].map((m) => `${m[1]}:${m[2]}`);

describe('the games board', () => {
  test('opens on All: every sport today and tomorrow, by start time; a sport keeps its own window', async () => {
    const ann = await player('ann@example.com', 'Ann');
    const all = await ann.get('/games');
    assert.match(all.text, /<nav class="sport-chips" aria-label="sport">\s*<a href="\/games" class="on" aria-current="true">All<\/a>/, 'All first, and on');
    assert.deepEqual(order(all.text), ['nfl:1', 'nba:5', 'nhl:9'], 'merged by start time; Thursday is too far out for All');
    assert.match(visible(all.text), /Today Sunday, Oct 25 .* Tomorrow Monday, Oct 26/);
    assert.match(visible(card(all.text, 'nba:5')), /Sun 7:30 PM ET · NBA/, 'the sport shows on All');

    const nfl = await ann.get('/games?sport=nfl');
    assert.match(nfl.text, /href="\/games\?sport=nfl" class="on"/);
    assert.deepEqual(order(nfl.text), ['nfl:1', 'nfl:2'], "the NFL board looks a week ahead");
    assert.doesNotMatch(visible(card(nfl.text, 'nfl:1')), /· NFL/, 'no sport tag on one sport');

    const nhl = await ann.get('/games?sport=nhl');
    assert.match(visible(nhl.text), /Puck line Total Money/, "the spread tab takes the sport's name");
    assert.match((await ann.get('/games?sport=bogus')).text, /href="\/games" class="on"/, 'an unknown sport is All');
  });

  test('two big buttons a market, with the price and the win chance it implies', async () => {
    const ann = await player('ann@example.com', 'Ann');
    const bos = card((await ann.get('/games')).text, 'nba:5');
    assert.match(visible(bos), /Spread Total Money Lakers \+4\.5 −110 52% Celtics −4\.5 −110 52%/);
    assert.match(visible(bos), /Over 224\.5 −110 52% Under 224\.5 −110 52%/);
    assert.match(visible(bos), /Lakers ML \+160 38% Celtics ML −190 66%/);
    assert.match(bos, /<a class="pbtn" href="\/pick\?game=nba%3A5&amp;market=spread&amp;side=away&amp;board=all"/, 'from All, the slip knows to come back to All');
    assert.match(bos, /<div class="mk-panel" id="g-nba-5-spread" data-market-panel="spread" >/, 'spread shows first');
    assert.match(bos, /<div class="mk-panel" id="g-nba-5-total" data-market-panel="total" hidden>/);
    assert.match(bos, /<button type="button" class="mk-tab" data-market-tab="spread" aria-controls="g-nba-5-spread" aria-pressed="true">Spread<\/button>/);
  });

  test('implied win chance: |odds| / (|odds| + 100) on a favorite, 100 / (odds + 100) on a dog', () => {
    assert.equal(impliedPct(-110), 52);
    assert.equal(impliedPct(150), 40);
    assert.equal(impliedPct(100), 50);
    assert.equal(impliedPct(-100), 50);
    assert.equal(impliedPct(-200), 67);
    assert.equal(impliedPct(-175), 64);
    assert.equal(impliedPct(400), 20);
    assert.equal(impliedPct(null), null);
  });

  test('a pick from All comes back to the same card on All, with the LOCKED ticket on it', async () => {
    const ann = await player('ann@example.com', 'Ann');
    const slip = await ann.get('/pick?game=nba:5&market=total&side=over&board=all');
    assert.match(slip.text, /<input type="hidden" name="board" value="all">/);
    assert.match(slip.text, /<a class="back" href="\/games">← All games<\/a>/);

    const res = await ann.post('/picks', { game: 'nba:5', market: 'total', side: 'over', line: '224.5', odds: '-110', units: '2', board: 'all' });
    assert.equal(res.location, '/games#g-nba-5');
    const board = (await ann.get(res.location)).text;
    const bos = card(board, 'nba:5');
    assert.match(bos, /<div class="locked-ticket" role="status">/, 'the ticket is on the card');
    assert.equal((board.match(/class="locked-ticket"/g) ?? []).length, 1, 'and not at the top too');
    assert.match(visible(bos), /Locked Over 224\.5 \(-110\), 2u to win 1\.82u Once it's in, it's on the record\./);
    assert.match(bos, /<div class="mk-panel" id="g-nba-5-total" data-market-panel="total" >/, 'the market with the pick shows');
    assert.match(bos, /data-market-tab="total" aria-controls="g-nba-5-total" aria-pressed="true">Total<span class="mk-dot"/, 'with a dot on its tab');
    assert.match(bos, /<a class="pbtn mine" href="\/picks" aria-label="Your pick: Over 224\.5 at -110">/);
    assert.match(bos, /<span class="pbtn taken" aria-label="Under 224\.5 at -110, you took the other side">/);
    assert.match(visible(bos), /Over 224\.5 −110 Locked/);

    // The next look at the board: a plain strip.
    const again = card((await ann.get('/games')).text, 'nba:5');
    assert.match(visible(again), /Locked Over 224\.5 · −110 · 2u Once it's in, it's on the record\./);
    assert.doesNotMatch(again, /locked-ticket/);

    // From a sport's board, back to that board.
    const nfl = await ann.post('/picks', { ...BILLS_PLUS, board: 'nfl' });
    assert.equal(nfl.location, '/games?sport=nfl#g-nfl-1');
    assert.equal((await ann.post('/picks', { game: 'nfl:1', market: 'total', side: 'over', line: '47.5', odds: '-110', units: '1' })).location, '/games?sport=nfl#g-nfl-1', 'no board: the game\'s sport');
  });

  test('the bell on each card: a follow form, or a gold bell once followed', async () => {
    const ann = await player('ann@example.com', 'Ann');
    const kc = card((await ann.get('/games?sport=nfl')).text, 'nfl:1');
    assert.match(kc, new RegExp(`<form class="follow" method="post" action="/games/nfl%3A1/follow" data-follow><input type="hidden" name="_csrf" value="${ann.csrf}"><input type="hidden" name="next" value="/games\\?sport=nfl#g-nfl-1"><button class="bell" aria-pressed="false" aria-label="Follow this game"><svg`));

    const game = app.games.get('nfl:1');
    const page = String(play.games(fakeCtx(), { sport: null, list: [game], follows: new Set(['nfl:1']) }));
    assert.match(page, /<a class="bell on" href="\/games\/nfl%3A1\/alerts" data-sheet="Game alerts" aria-pressed="true" aria-label="Following. Change alerts"><svg viewBox="0 0 24 24" fill="currentColor"/);
    assert.doesNotMatch(page, /data-follow/);
  });
});

describe('Live now', () => {
  test('games under way up top, with how your pick stands at the score', async () => {
    const ann = await player('ann@example.com', 'Ann');
    await ann.post('/picks', { ...BILLS_PLUS, units: '2' });
    await ann.post('/picks', { game: 'nfl:1', market: 'total', side: 'over', line: '47.5', odds: '-110', units: '1' });
    const bob = await player('bob@example.com', 'Bob');
    assert.doesNotMatch((await ann.get('/games')).text, /Live now/, 'nothing on yet');

    time.set('2026-10-25T17:40:00.000Z');
    setLive(bills);
    const [home, away] = bills.competitions[0].competitors;
    home.score = '10';
    away.score = '3';
    let page = (await ann.get('/games')).text;
    const live = page.match(/<section class="live-now"[\s\S]*?<\/section>/)?.[0] ?? '';
    assert.match(live, /data-live-poll data-poll-every="30" data-poll-empty/, 'refreshes itself');
    assert.match(visible(live), /Live now 1 live Live · 2nd Qtr · NFL BUF Bills 3 KC Chiefs 10/);
    assert.match(live, /<span class="gc-score trail">3<\/span>[\s\S]*<span class="gc-score lead">10<\/span>/, 'the leader bright, the trailer muted');
    // Bills +3.5 down 7: losing. The total pick is the "+1 more".
    assert.match(live, /<div class="lbox losing">/);
    assert.match(visible(live), /Your pick · Bills \+3\.5 \+1 more −110 · 2u Losing/);
    assert.match(visible(live), /Chat Talk about it/);
    assert.match(live, /<a class="lbox chat" href="\/games\/nfl%3A1#chat">/);
    assert.doesNotMatch(card(page.slice(page.indexOf('</section>')), 'nfl:1'), /./, 'not under upcoming too');

    home.score = '10';
    away.score = '9';
    time.advance(2 * 60_000);
    page = (await ann.get('/games?sport=nfl')).text;
    assert.match(page, /<div class="lbox winning">/, 'down 1 with 3.5 points: winning');
    assert.match(visible(page), /Bills \+3\.5 \+1 more −110 · 2u Winning/);
    assert.doesNotMatch((await ann.get('/games?sport=nba')).text, /Live now/, 'only the chosen sport');

    const theirs = (await bob.get('/games')).text;
    assert.match(visible(theirs), /No pick Locked at start/, 'no pick: says so');
    assert.doesNotMatch(theirs, /Bills \+3\.5 −110 · 2u/, "never someone else's pick");
  });

  test('a pick even at the score reads Even', () => {
    const game = { home: { score: 10 }, away: { score: 7 } };
    assert.equal(play.pickStatus({ market: 'spread', side: 'away', line: 3 }, game), 'even');
    assert.equal(play.pickStatus({ market: 'spread', side: 'home', line: -2.5 }, game), 'winning');
    assert.equal(play.pickStatus({ market: 'total', side: 'over', line: 20.5 }, game), 'losing');
    assert.equal(play.pickStatus({ market: 'ml', side: 'away', line: null }, game), 'losing');
  });
});

describe('the units pill', () => {
  test('your all-time units up top, green and up or red and down, linking to your profile', async () => {
    const ann = await player('ann@example.com', 'Ann');
    const bob = await player('bob@example.com', 'Bob');
    const pill = (page) => page.match(/<a class="units-pill[^"]*"[^>]*>[\s\S]*?<\/a>/)?.[0] ?? '';
    assert.match(pill((await ann.get('/games')).text), /<a class="units-pill even" href="\/u\/Ann"[^>]*>0u<\/a>/, 'nothing graded yet');
    assert.doesNotMatch((await ann.get('/games')).text, /class="get-app"/, 'the pill takes the place of Get the app');

    await ann.post('/picks', { ...BILLS_PLUS, units: '1' });
    await bob.post('/picks', { ...BILLS_PLUS, side: 'home', line: '-3.5', units: '2' });
    time.set('2026-10-25T21:00:00.000Z');
    setFinal(bills, 20, 21);
    await app.games.checkFinals();
    assert.match(pill((await ann.get('/picks')).text), /<a class="units-pill up" href="\/u\/Ann" aria-label="Up 0\.9 units, all time\. Your profile"[^>]*>\+0\.9u<span class="arrow" aria-hidden="true">▲<\/span><\/a>/);
    assert.match(pill((await bob.get('/picks')).text), /<a class="units-pill down" href="\/u\/Bob"[^>]*>−2u<span class="arrow" aria-hidden="true">▼<\/span><\/a>/);

    assert.match((await app.browser().get('/')).text, /href="\/install" data-get-app/, 'visitors still get Get the app');
    assert.match(visible((await ann.get('/more')).text), /Get the app Put LockBox on your Home Screen/, 'and players find it in More');
  });

  test('rounds to a tenth, with a true minus', () => {
    assert.match(String(unitsPill(12.36, '/u/A')), />\+12\.4u</);
    assert.match(String(unitsPill(-3.24, '/u/A')), />−3\.2u</);
    assert.match(String(unitsPill(0.04, '/u/A')), /class="units-pill even"[^>]*>0u</);
    assert.equal(String(unitsPill(null, '/u/A')), '');
  });
});

/** Just enough of a request for a view to draw a page. */
function fakeCtx() {
  const url = new URL('http://local/games');
  return {
    app: { name: 'LockBox', theme: 'scoreboard', assets: { logo: '/l.png', touchIcon: '/t.png', manifest: '/m.json', css: '/s.css', js: '/a.js' }, site: 'https://www.bookiebullies.com' },
    url, query: url.searchParams, now: new Date(MORNING), origin: 'https://app.example.test',
    user: null, session: { csrf: 'token' }, flash: null, cookieValues: { bb_seen: '1' },
  };
}
