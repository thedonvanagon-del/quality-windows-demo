// Player-made tournaments: making one, limits, public and private, groups,
// reports, and cancelling.

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { createGroup, joinGroup, startRoom } from '../src/groups.js';
import { etToUtc } from '../src/time.js';
import {
  bySlug, closeDueTournaments, createPlayerTournament, hostOf, joinTournament, PLAYER_PRIZE, reportTournament,
} from '../src/tournaments.js';
import { addBet, addPlayer, clock, startApp, visible } from './helpers.js';

// Friday Nov 6, 2026, 2:00 PM Eastern.
const NOW = '2026-11-06T19:00:00.000Z';
const et = (day, hour, minute = 0) => etToUtc(day, hour, minute).toISOString();
const FRI = '20261106';

let time;
let app;

beforeEach(async () => {
  time = clock(NOW);
  app = await startApp({ time, config: { adminEmails: ['boss@example.com'] } });
});

afterEach(() => app.close());

/** Tonight, 3:00 to 11:59 PM ET, NBA, public: change what a test needs. */
const tonight = (extra = {}) => ({
  name: 'Hoops Night Out', sports: ['nba'], startDate: '2026-11-06', startTime: '15:00', endDate: '2026-11-06', endTime: '23:59',
  minBets: '2', visibility: 'public', now: time.now(), ...extra,
});

/** The same form as a browser posts it. */
function formOf({ name, sports, startDate, startTime, endDate, endTime, minBets, visibility, group = '' }) {
  const form = new URLSearchParams({ name, start_date: startDate, start_time: startTime, end_date: endDate, end_time: endTime, min_bets: minBets, visibility, group });
  for (const s of sports) form.append('sports', s);
  return form;
}

async function postNew(b, fields) {
  await b.get('/tournaments/new');
  const form = formOf(fields);
  form.set('_csrf', b.csrf);
  return b.request('/tournaments/new', { method: 'POST', body: form, headers: { 'content-type': 'application/x-www-form-urlencoded', origin: b.base } });
}

async function player(email, name, options) {
  const b = app.browser();
  await b.join(email, name, undefined, options);
  b.id = app.store.get('SELECT id FROM users WHERE email = ?', email).id;
  return b;
}

describe('making one', () => {
  test('any confirmed player, from /tournaments/new: free, a fixed prize, and the maker is in it', async () => {
    const ann = await player('ann@example.com', 'Ann');
    const form = await ann.get('/tournaments/new');
    assert.equal(form.status, 200);
    assert.match(visible(form.text), /Make a tournament .* Public Listed under Player tournaments\. .* Private Not listed\. Players join with your invite link\./);
    assert.match(visible(form.text), /Prize: Bragging rights and a Tournament champion badge\. Nothing to pay, nothing paid out\./);
    assert.doesNotMatch(form.text, /name="prize"/, 'no prize text from players');

    const made = await postNew(ann, tonight({ name: '  Hoops   Night Out ' }));
    assert.equal(made.status, 303);
    assert.equal(made.location, '/tournaments/hoops-night-out-2026-11-06');
    const t = bySlug(app.store, 'hoops-night-out-2026-11-06');
    assert.deepEqual(
      { name: t.name, sports: t.sports, starts_at: t.starts_at, ends_at: t.ends_at, min_bets: t.min_bets, prize: t.prize, kind: t.kind, created_by: t.created_by, entry_fee_cents: t.entry_fee_cents },
      { name: 'Hoops Night Out', sports: 'nba', starts_at: et(FRI, 15), ends_at: et('20261107', 0), min_bets: 2, prize: PLAYER_PRIZE, kind: 'custom', created_by: ann.id, entry_fee_cents: 0 },
    );
    assert.equal(hostOf(app.store, t).visibility, 'public');
    assert.ok(app.store.get('SELECT 1 AS x FROM tournament_entries WHERE tournament_id = ? AND user_id = ?', t.id, ann.id), 'the maker is in');

    const page = visible((await ann.get(made.location)).text);
    assert.match(page, /Hoops Night Out Free Player-made NBA 1 entrant Made by Ann/);
    assert.match(page, /Invite players https:\/\/app\.example\.test\/tournaments\/hoops-night-out-2026-11-06 Copy invite link Cancel tournament/);
    // Listed in the hub under Player tournaments, not with the house's.
    const hub = visible((await app.browser().get('/tournaments')).text);
    assert.match(hub, /Player tournaments Hoops Night Out Free Player-made Made by Ann NBA Fri, Nov 6, 3:00 PM – 11:59 PM ET/);
    assert.doesNotMatch(hub, /Starting soon Hoops Night Out/);
  });

  test('the checks: name, sports, times, minimum, visibility, and a confirmed email', async () => {
    const ann = addPlayer(app.store, 'Ann');
    const make = (extra) => createPlayerTournament(app.store, tonight({ userId: ann, ...extra }));
    assert.match(make({ name: 'Yo' }).error, /3 to 40 characters/);
    assert.match(make({ name: 'x'.repeat(41) }).error, /3 to 40 characters/);
    assert.match(make({ name: 'Picks at sharp.bet' }).error, /No links/);
    assert.match(make({ name: 'Join www.example' }).error, /No links/);
    assert.match(make({ name: 'Cup https://x.co' }).error, /No links/);
    assert.match(make({ name: 'Beat @Bob tonight' }).error, /No @ mentions/);
    assert.match(make({ name: 'B00kie Bu11ies Cup' }).error, /official account/);
    assert.match(make({ sports: [] }).error, /at least one sport/);
    assert.match(make({ sports: ['nba', 'cricket'] }).error, /from the list/);
    assert.match(make({ startTime: '14:10' }).error, /at least 15 minutes from now/);
    assert.ok(make({ name: 'Just in time', startTime: '14:15' }).slug, '15 minutes is enough');
    assert.match(make({ endTime: '15:58' }).error, /at least an hour/);
    assert.ok(make({ name: 'One hour', endTime: '15:59' }).slug);
    app.store.run('DELETE FROM tournaments');
    assert.match(make({ endDate: '2026-11-20', endTime: '15:00' }).error, /14 days or less/);
    assert.match(make({ minBets: '0' }).error, /1 to 20/);
    assert.match(make({ minBets: '21' }).error, /1 to 20/);
    assert.match(make({ minBets: '2.5' }).error, /1 to 20/);
    assert.match(make({ visibility: 'secret' }).error, /Public or Private/);
    assert.match(make({ startDate: 'soon' }).error, /start and an end/);

    // Unconfirmed emails see the form but can't make one.
    const bob = await player('bob@example.com', 'Bob', { confirm: false });
    assert.match(visible((await bob.get('/tournaments/new')).text), /Confirm your email to make a tournament/);
    const refused = await postNew(bob, tonight());
    assert.equal(refused.status, 403);
    assert.equal(app.store.get('SELECT COUNT(*) AS n FROM tournaments WHERE created_by = ?', bob.id).n, 0);
    // The page tells a bad form what's wrong and keeps what was typed.
    const ann2 = await player('ann2@example.com', 'Annie');
    const bad = await postNew(ann2, tonight({ name: 'Ping @Bob' }));
    assert.equal(bad.status, 400);
    assert.match(visible(bad.text), /No @ mentions in the name/);
    assert.match(bad.text, /value="Ping @Bob"/);
    // Anyone signed out goes to log in.
    assert.match((await app.browser().get('/tournaments/new')).location, /^\/login/);
  });

  test('two going at once and five a day; admins have no limit', () => {
    const ann = addPlayer(app.store, 'Ann');
    const make = (name) => createPlayerTournament(app.store, tonight({ name, userId: ann }));
    const first = make('Cup One');
    assert.ok(make('Cup Two').slug);
    assert.match(make('Cup Three').error, /2 tournaments going at once/);
    // A canceled one frees a slot, but still counts for the day.
    app.store.run('UPDATE tournaments SET canceled_at = ? WHERE slug = ?', NOW, first.slug);
    assert.ok(make('Cup Three').slug);
    for (const slug of app.store.all('SELECT slug FROM tournaments').map((r) => r.slug)) app.store.run('UPDATE tournaments SET canceled_at = ? WHERE slug = ?', NOW, slug);
    assert.ok(make('Cup Four').slug);
    app.store.run('UPDATE tournaments SET canceled_at = ? WHERE canceled_at IS NULL', NOW);
    assert.ok(make('Cup Five').slug);
    app.store.run('UPDATE tournaments SET canceled_at = ? WHERE canceled_at IS NULL', NOW);
    assert.match(make('Cup Six').error, /5 tournaments a day/);
    // A day later, the count starts over.
    time.advance(24 * 3_600_000 + 60_000);
    assert.ok(createPlayerTournament(app.store, tonight({ name: 'Cup Six', userId: ann, startDate: '2026-11-07', endDate: '2026-11-07', now: time.now() })).slug);

    const boss = addPlayer(app.store, 'Boss');
    for (let i = 1; i <= 7; i++) assert.ok(createPlayerTournament(app.store, tonight({ name: `Boss Cup ${i}`, userId: boss, limit: false, startDate: '2026-11-07', endDate: '2026-11-07', now: time.now() })).slug);
  });
});

describe('public, private and groups', () => {
  test('private: off the lists, opened by its invite link, joined with the code', async () => {
    const ann = await player('ann@example.com', 'Ann');
    const made = await postNew(ann, tonight({ name: 'Secret Sweat', visibility: 'private' }));
    const t = bySlug(app.store, made.location.split('/').pop());
    const { invite_code: code } = hostOf(app.store, t);
    assert.match(code, /^[A-Z2-9]{8}$/);
    // The maker's invite link is the code link.
    assert.match(visible((await ann.get(made.location)).text), new RegExp(`Invite players https://app\\.example\\.test/t/${code} Copy invite link`));

    const bob = await player('bob@example.com', 'Bob');
    assert.doesNotMatch(visible((await bob.get('/tournaments')).text), /Secret Sweat/);
    assert.equal((await bob.get(`/tournaments/${t.slug}`)).status, 404, 'not by its slug');
    assert.equal((await bob.get('/t/NOPE2345')).status, 404);
    // Without the code, joining is turned down.
    await bob.get('/tournaments');
    assert.equal((await bob.post(`/tournaments/${t.slug}/join`)).status, 404);
    assert.match(joinTournament(app.store, t, bob.id, time.now()).error, /invite link/);

    const invite = await bob.get(`/t/${code.toLowerCase()}`);
    assert.equal(invite.status, 200);
    assert.match(visible(invite.text), /Secret Sweat Free Player-made NBA 1 entrant Made by Ann Private/);
    assert.match(invite.text, new RegExp(`<input type="hidden" name="code" value="${code}">`));
    const joined = await bob.post(`/tournaments/${t.slug}/join`, { code, next: `/t/${code}` });
    assert.equal(joined.status, 303);
    assert.equal(app.store.get('SELECT COUNT(*) AS n FROM tournament_entries WHERE tournament_id = ?', t.id).n, 2);
    // In it now, so the page opens for him by its slug too.
    assert.equal((await bob.get(`/tournaments/${t.slug}`)).status, 200);
    // Signed out, the invite still shows, with Join going to log in.
    assert.match((await app.browser().get(`/t/${code}`)).text, new RegExp(`href="/login\\?next=%2Ft%2F${code}"`));
  });

  test("a group's tournament: on its page, members only, and the maker must be a member", async () => {
    const ann = addPlayer(app.store, 'Ann');
    const bob = addPlayer(app.store, 'Bob');
    const cal = addPlayer(app.store, 'Cal');
    const crew = createGroup(app.store, { ownerId: ann, name: 'Saturday Crew', sport: '', now: time.now() });
    joinGroup(app.store, { groupId: crew.id, userId: bob, now: time.now() });
    assert.match(createPlayerTournament(app.store, tonight({ userId: cal, groupId: crew.id })).error, /group or room you're in/);
    const { slug } = createPlayerTournament(app.store, tonight({ name: 'Crew Cup', userId: ann, groupId: crew.id }));
    const t = bySlug(app.store, slug);
    assert.match(joinTournament(app.store, t, cal, time.now()).error, /Only members of Saturday Crew/);
    assert.ok(joinTournament(app.store, t, bob, time.now()).ok);

    // Public, but tied to a private group: not in the hub, and not for outsiders.
    const browser = app.browser();
    assert.doesNotMatch(visible((await browser.get('/tournaments')).text), /Crew Cup/);
    assert.equal((await browser.get(`/tournaments/${slug}`)).status, 404);

    // On the group's page, for members.
    const bobB = app.browser();
    await bobB.join('bob2@example.com', 'Bobby');
    const bobby = app.store.get("SELECT id FROM users WHERE screen_name = 'Bobby'").id;
    joinGroup(app.store, { groupId: crew.id, userId: bobby, now: time.now() });
    const group = visible((await bobB.get(`/groups/${crew.id}`)).text);
    assert.match(group, /Tournaments Crew Cup Free Player-made Made by Ann For Saturday Crew members NBA/);
    assert.match(group, /Make one for this group/);
  });

  test("a local room's public tournament is listed, and only the room's members can join", async () => {
    const ann = addPlayer(app.store, 'Ann');
    const room = startRoom(app.store, { citySlug: 'san-diego-ca', userId: ann, now: time.now(), limit: false });
    const { slug } = createPlayerTournament(app.store, tonight({ name: 'SD Sweat', userId: ann, groupId: room.id }));
    const cal = await player('cal@example.com', 'Cal');
    const hub = visible((await cal.get('/tournaments')).text);
    assert.match(hub, /Player tournaments SD Sweat Free Player-made Made by Ann For San Diego, CA members .* Members only/);
    const page = visible((await cal.get(`/tournaments/${slug}`)).text);
    assert.match(page, /Only members of San Diego, CA can join this one\./);
    joinGroup(app.store, { groupId: room.id, userId: cal.id, now: time.now() });
    await cal.get(`/tournaments/${slug}`);
    await cal.post(`/tournaments/${slug}/join`);
    assert.equal(app.store.get('SELECT COUNT(*) AS n FROM tournament_entries WHERE user_id = ?', cal.id).n, 1);
  });
});

describe('reports, cancelling, winning', () => {
  test('anyone can report once; three hide it until an admin looks; Dismiss and Cancel', async () => {
    const ann = addPlayer(app.store, 'Ann');
    const { slug } = createPlayerTournament(app.store, tonight({ name: 'Sketchy Cup', userId: ann }));
    const t = bySlug(app.store, slug);
    assert.match(reportTournament(app.store, t, ann, time.now()).error, /your own/);

    const bob = await player('bob@example.com', 'Bob');
    await bob.get(`/tournaments/${slug}`);
    assert.equal((await bob.post(`/tournaments/${slug}/report`)).status, 303);
    assert.match(visible((await bob.get(`/tournaments/${slug}`)).text), /You reported this tournament\./);
    assert.match(reportTournament(app.store, t, bob.id, time.now()).error, /already reported/);
    assert.match(visible((await app.browser().get('/tournaments')).text), /Sketchy Cup/, 'two reports leave it listed');
    for (const n of ['Cal', 'Dee']) reportTournament(app.store, t, addPlayer(app.store, n), time.now());
    assert.ok(hostOf(app.store, t).hidden);
    assert.doesNotMatch(visible((await app.browser().get('/tournaments')).text), /Sketchy Cup/);
    assert.equal((await app.browser().get(`/tournaments/${slug}`)).status, 404, 'hidden from everyone not in it');
    assert.match(joinTournament(app.store, t, addPlayer(app.store, 'Eve'), time.now()).error, /under review/);

    // The admin page lists it, hidden first; Dismiss puts it back.
    const boss = await player('boss@example.com', 'Boss');
    assert.match(visible((await boss.get('/more')).text), /Admin: tournaments Make a tournament, cancel one, or look at reported ones 1/);
    const admin = visible((await boss.get('/admin/tournaments')).text);
    assert.match(admin, /Reported .* Sketchy Cup · Made by Ann 3 reports · Hidden .* Public · Last report .* Dismiss Cancel/);
    assert.equal((await boss.post(`/admin/tournaments/${slug}/dismiss`)).status, 303);
    assert.match(visible((await app.browser().get('/tournaments')).text), /Sketchy Cup/);
    assert.match(visible((await boss.get('/admin/tournaments')).text), /Reported .* Nothing reported right now\./);
    // The same three can't report it again; a fourth can.
    assert.match(reportTournament(app.store, t, bob.id, time.now()).error, /already/);
    assert.equal((await app.browser().get('/admin/tournaments')).status, 404);
    assert.equal((await bob.post(`/admin/tournaments/${slug}/dismiss`)).status, 404);

    // Cancel, even once it's started: everyone in it hears.
    joinTournament(app.store, t, bob.id, time.now());
    time.set(et(FRI, 16));
    await boss.get('/admin/tournaments');
    assert.equal((await boss.post(`/admin/tournaments/${slug}/cancel`)).status, 303);
    assert.equal(bySlug(app.store, slug), null);
    assert.match(app.store.get("SELECT text FROM notifications WHERE user_id = ? AND kind = 'tournament'", bob.id).text, /Sketchy Cup was canceled by an admin\./);
  });

  test('its maker cancels before the start, not after; nobody else can', async () => {
    const ann = await player('ann@example.com', 'Ann');
    const made = await postNew(ann, tonight({ name: 'Maybe Cup' }));
    const slug = made.location.split('/').pop();
    const bob = await player('bob@example.com', 'Bob');
    await bob.get(made.location);
    await bob.post(`/tournaments/${slug}/join`);
    assert.doesNotMatch((await bob.get(made.location)).text, /\/cancel"/);
    assert.equal((await bob.post(`/tournaments/${slug}/cancel`)).status, 404);
    assert.ok(bySlug(app.store, slug));

    // After the start, not even its maker.
    const second = await postNew(ann, tonight({ name: 'Started Cup', startTime: '14:30' }));
    const started = second.location.split('/').pop();
    time.set(et(FRI, 14, 31));
    await ann.get(second.location);
    await ann.post(`/tournaments/${started}/cancel`);
    assert.match(visible((await ann.get(second.location)).text), /It's already started, so it can't be canceled/);
    assert.ok(bySlug(app.store, started));

    await ann.get(made.location);
    assert.equal((await ann.post(`/tournaments/${slug}/cancel`)).location, '/tournaments');
    assert.equal(bySlug(app.store, slug), null);
    assert.match(app.store.get("SELECT text FROM notifications WHERE user_id = ? AND kind = 'tournament'", bob.id).text, /Maybe Cup was canceled before it started\./);
  });

  test('winners of a player-made one still earn the tournament badges', () => {
    const ann = addPlayer(app.store, 'Ann');
    const bob = addPlayer(app.store, 'Bob');
    const { slug } = createPlayerTournament(app.store, tonight({ name: 'Friday Cup', userId: ann, minBets: '1' }));
    const t = bySlug(app.store, slug);
    joinTournament(app.store, t, bob, time.now());
    addBet(app.store, { userId: bob, start: et(FRI, 19), sport: 'nba', profit: 2 });
    addBet(app.store, { userId: ann, start: et(FRI, 19), sport: 'nba', profit: 1 });
    time.set(et('20261107', 1));
    const [closed] = closeDueTournaments(app.store, time.now(), app.notifier);
    assert.deepEqual(closed.podium.map((r) => r.screen_name), ['Bob', 'Ann']);
    assert.deepEqual(app.store.all("SELECT key FROM badges WHERE user_id = ? AND key LIKE 'tournament%' ORDER BY key", bob).map((b) => b.key), ['tournament_champion', 'tournament_podium']);
  });
});
