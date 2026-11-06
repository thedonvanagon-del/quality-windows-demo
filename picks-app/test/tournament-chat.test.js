// Tournament chat (and the chat_messages rebuild that makes room for it),
// and the Share card for a top-3 finish.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { closeDueWeeks } from '../src/contest.js';
import { MIGRATIONS, openStore } from '../src/db.js';
import { createGroup } from '../src/groups.js';
import { etToUtc } from '../src/time.js';
import { bySlug, closeDueTournaments, joinTournament } from '../src/tournaments.js';
import { addBet, addPlayer, clock, startApp, visible } from './helpers.js';

// Friday Nov 6, 2026, 2:00 PM Eastern.
const NOW = '2026-11-06T19:00:00.000Z';
const et = (day, hour, minute = 0) => etToUtc(day, hour, minute).toISOString();
const FRI = '20261106';
const SAT = '20261107';

let time;
let app;

beforeEach(async () => {
  time = clock(NOW);
  app = await startApp({ time, config: { adminEmails: ['boss@example.com'] } });
});

afterEach(() => app.close());

function make({ name = 'Hoops Night', slug = name.toLowerCase().replace(/\W+/g, '-'), start = et(FRI, 12), end = et(SAT, 0), kind = 'custom', min = 1 } = {}) {
  app.store.run(
    `INSERT INTO tournaments (slug, name, sports, starts_at, ends_at, min_bets, prize, kind, created_at)
     VALUES (?, ?, NULL, ?, ?, ?, 'Bragging rights', ?, ?)`,
    slug, name, start, end, min, kind, NOW,
  );
  return bySlug(app.store, slug);
}

async function player(email, name, options) {
  const b = app.browser();
  await b.join(email, name, undefined, options);
  b.id = app.store.get('SELECT id FROM users WHERE email = ?', email).id;
  return b;
}

const say = (b, slug, body) => b.post(`/tournaments/${slug}/chat`, { body });
const bodies = (t) => app.store.all('SELECT body FROM chat_messages WHERE tournament_id = ? AND deleted_at IS NULL ORDER BY id', t.id).map((m) => m.body);

describe('tournament chat', () => {
  test('entrants only: they read and post; everyone else is told how to get in', async () => {
    const t = make();
    const ann = await player('ann@example.com', 'Ann');
    const bob = await player('bob@example.com', 'Bob');
    joinTournament(app.store, t, ann.id, time.now());

    await ann.get(`/tournaments/${t.slug}`);
    const posted = await say(ann, t.slug, 'Hoops Night is mine.');
    assert.equal(posted.location, `/tournaments/${t.slug}#chat`);
    const page = await ann.get(`/tournaments/${t.slug}`);
    assert.match(visible(page.text), /Chat A Ann .* Hoops Night is mine\. .* Only players in Hoops Night see this\./);
    assert.match(page.text, /<div class="chat" data-poll>/, 'refreshes like every chat');

    // Bob isn't in it: no messages, and a post or a report is a 404.
    const outside = await bob.get(`/tournaments/${t.slug}`);
    assert.match(visible(outside.text), /Chat Join to see the chat\. Only players in it can read and post\./);
    assert.doesNotMatch(outside.text, /Hoops Night is mine/);
    assert.equal((await say(bob, t.slug, 'let me in')).status, 404);
    const id = app.store.get('SELECT id FROM chat_messages WHERE tournament_id = ?', t.id).id;
    assert.equal((await bob.post(`/chat/${id}/report`)).status, 404);
    assert.equal((await bob.post(`/chat/${id}/delete`)).status, 404);
    // Signed out: log in first.
    assert.match(visible((await app.browser().get(`/tournaments/${t.slug}`)).text), /Chat Log in and join to see the chat\./);

    // He joins, and he's in the chat.
    await bob.post(`/tournaments/${t.slug}/join`);
    await say(bob, t.slug, 'Not tonight.');
    assert.deepEqual(bodies(t), ['Hoops Night is mine.', 'Not tonight.']);
  });

  test('the Weekly Open: everyone signed in can chat', async () => {
    const weekly = make({ name: 'The Weekly Open', slug: 'weekly-open-2026-11-02', start: et('20261102', 0), end: et('20261109', 0), kind: 'weekly', min: 5 });
    const cal = await player('cal@example.com', 'Cal');
    await cal.get(`/tournaments/${weekly.slug}`);
    await say(cal, weekly.slug, 'Big week.');
    assert.deepEqual(bodies(weekly), ['Big week.']);
    assert.match(visible((await cal.get(`/tournaments/${weekly.slug}`)).text), /Big week\. .* Everyone in the Weekly Open sees this\./);
  });

  test('the same rules as all chat: confirmed email, 280 characters, the shared rate limit, delete your own, three reports hide, admins', async () => {
    const t = make({ name: 'Rules Cup' });
    const ann = await player('ann@example.com', 'Ann');
    const unconfirmed = await player('zed@example.com', 'Zed', { confirm: false });
    for (const b of [ann, unconfirmed]) joinTournament(app.store, t, b.id, time.now());

    await unconfirmed.get(`/tournaments/${t.slug}`);
    await say(unconfirmed, t.slug, 'hi');
    assert.deepEqual(bodies(t), []);
    assert.match(visible((await unconfirmed.get(`/tournaments/${t.slug}`)).text), /Confirm your email to join the chat/);

    await ann.get(`/tournaments/${t.slug}`);
    await say(ann, t.slug, 'x'.repeat(281));
    assert.deepEqual(bodies(t), []);
    await say(ann, t.slug, 'First.');
    const mine = app.store.get('SELECT id FROM chat_messages WHERE tournament_id = ?', t.id).id;

    // Reports: three hide it, and the admin page says where it was.
    const reporters = [];
    for (const [email, name] of [['b@example.com', 'Bea'], ['c@example.com', 'Cyd'], ['d@example.com', 'Dot']]) {
      const b = await player(email, name);
      joinTournament(app.store, t, b.id, time.now());
      await b.get(`/tournaments/${t.slug}`);
      await b.post(`/chat/${mine}/report`);
      reporters.push(b);
    }
    assert.match(visible((await reporters[0].get(`/tournaments/${t.slug}`)).text), /Hidden after reports\./);
    const boss = await player('boss@example.com', 'Boss');
    const admin = visible((await boss.get('/admin/reports')).text);
    assert.match(admin, /Ann · Tournament: Rules Cup 3 reports · Hidden First\./);
    await boss.post(`/admin/reports/${mine}/restore`);
    assert.doesNotMatch(visible((await ann.get(`/tournaments/${t.slug}`)).text), /Hidden after reports/);

    // The maker of a tournament has no say over others' messages; you delete your own.
    await reporters[0].get(`/tournaments/${t.slug}`);
    await reporters[0].post(`/chat/${mine}/delete`);
    assert.deepEqual(bodies(t), ['First.']);
    await ann.get(`/tournaments/${t.slug}`);
    await ann.post(`/chat/${mine}/delete`);
    assert.deepEqual(bodies(t), []);

    // One rate limit across every thread: eight a minute, a group's chat and this one together.
    time.advance(61_000);
    const crew = createGroup(app.store, { ownerId: ann.id, name: 'Crew', sport: '', now: time.now() });
    await ann.get(`/groups/${crew.id}`);
    for (let i = 1; i <= 5; i++) await ann.post(`/groups/${crew.id}/chat`, { body: `group ${i}` });
    await ann.get(`/tournaments/${t.slug}`);
    for (let i = 1; i <= 5; i++) await say(ann, t.slug, `cup ${i}`);
    assert.deepEqual(bodies(t), ['cup 1', 'cup 2', 'cup 3']);
  });

  test('canceling keeps the chat, read-only, for whoever was in it', async () => {
    const t = make({ name: 'Doomed Cup', start: et(SAT, 12), end: et('20261108', 0) });
    const ann = await player('ann@example.com', 'Ann');
    joinTournament(app.store, t, ann.id, time.now());
    await ann.get(`/tournaments/${t.slug}`);
    await say(ann, t.slug, 'See you Saturday.');
    app.store.run('UPDATE tournaments SET canceled_at = ? WHERE id = ?', NOW, t.id);

    const page = visible((await ann.get(`/tournaments/${t.slug}`)).text);
    assert.match(page, /Doomed Cup .* Canceled .* This tournament was canceled\. Nothing in it counts\. Its chat stays, read-only\./);
    assert.match(page, /Chat A Ann See you Saturday\. This tournament was canceled, so its chat is read-only\./);
    assert.doesNotMatch(page, /Message Send/);
    await say(ann, t.slug, 'hello?');
    assert.deepEqual(bodies(t), ['See you Saturday.']);
    assert.equal((await app.browser().get(`/tournaments/${t.slug}`)).status, 404);
    // And a tournament with chat can't be deleted out from under it.
    assert.throws(() => app.store.run('DELETE FROM tournaments WHERE id = ?', t.id), /FOREIGN KEY/);
  });
});

describe('the tournament chat migration', () => {
  test('keeps every game and group message and their reports, and a message has exactly one thread', () => {
    // A database as it stood before tournament chat, with reported game and group messages in it.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-tchat-'));
    const file = path.join(dir, 'old.db');
    const old = new DatabaseSync(file);
    old.exec('PRAGMA foreign_keys = ON');
    const before = MIGRATIONS.findIndex((sql) => sql.includes('chat_messages_v3'));
    assert.equal(before, MIGRATIONS.length - 1);
    MIGRATIONS.slice(0, before).forEach((sql) => old.exec(sql));
    old.exec(`PRAGMA user_version = ${before}`);
    old.exec("INSERT INTO users (id, email, password_hash, created_at) VALUES (1, 'a@x.co', '!', 't'), (2, 'b@x.co', '!', 't'), (3, 'c@x.co', '!', 't')");
    old.exec(
      `INSERT INTO games (id, sport, start_time, state, status, detail, completed, home_name, home_short, home_abbr, away_name, away_short, away_abbr, lines, updated_at)
       VALUES ('nfl:1', 'nfl', 't', 'pre', '', '', 0, 'A', 'A', 'A', 'B', 'B', 'B', '{}', 't')`,
    );
    old.exec("INSERT INTO friend_groups (id, name, invite_code, owner_id, created_at) VALUES (7, 'Crew', 'ABCD2345', 1, 't')");
    old.exec("INSERT INTO group_members (group_id, user_id, joined_at) VALUES (7, 1, 't')");
    old.exec(`INSERT INTO chat_messages (id, game_id, group_id, user_id, body, created_at, deleted_at) VALUES
      (4, 'nfl:1', NULL, 1, 'game one', 't1', NULL), (5, NULL, 7, 2, 'group one', 't2', NULL), (6, 'nfl:1', NULL, 3, 'gone', 't3', 'd')`);
    old.exec("INSERT INTO chat_reports (message_id, user_id, created_at) VALUES (4, 2, 'r1'), (5, 1, 'r2'), (5, 3, 'r3')");
    old.exec("INSERT INTO tournaments (id, slug, name, starts_at, ends_at, min_bets, kind, created_at) VALUES (9, 'cup', 'Cup', 'a', 'b', 1, 'custom', 't')");
    old.exec("INSERT INTO tournament_entries (tournament_id, user_id, joined_at, reminded_at) VALUES (9, 1, 'j', 'r')");
    const rowsBefore = old.prepare('SELECT * FROM chat_messages ORDER BY id').all();
    old.close();

    const store = openStore(file);
    assert.equal(store.get('PRAGMA user_version').user_version, MIGRATIONS.length);
    assert.deepEqual(
      store.all('SELECT id, game_id, group_id, user_id, body, created_at, deleted_at FROM chat_messages ORDER BY id').map((r) => ({ ...r })),
      rowsBefore.map((r) => ({ ...r })),
    );
    assert.equal(store.get('SELECT COUNT(*) AS n FROM chat_messages WHERE tournament_id IS NOT NULL').n, 0);
    assert.deepEqual(store.all('SELECT message_id, user_id, created_at FROM chat_reports ORDER BY created_at').map((r) => ({ ...r })), [
      { message_id: 4, user_id: 2, created_at: 'r1' }, { message_id: 5, user_id: 1, created_at: 'r2' }, { message_id: 5, user_id: 3, created_at: 'r3' },
    ]);
    assert.deepEqual({ ...store.get('SELECT joined_at, reminded_at, alert_place, moved_at, final_alert_at FROM tournament_entries') },
      { joined_at: 'j', reminded_at: 'r', alert_place: null, moved_at: null, final_alert_at: null });
    assert.equal(store.get('PRAGMA foreign_keys').foreign_keys, 1, 'foreign keys back on');
    assert.deepEqual(store.all('PRAGMA foreign_key_check'), []);

    // A tournament message; never two threads, never none.
    store.run("INSERT INTO chat_messages (tournament_id, user_id, body, created_at) VALUES (9, 1, 'gl', 't')");
    assert.throws(() => store.run("INSERT INTO chat_messages (game_id, tournament_id, user_id, body, created_at) VALUES ('nfl:1', 9, 1, 'x', 't')"), /CHECK/);
    assert.throws(() => store.run("INSERT INTO chat_messages (group_id, tournament_id, user_id, body, created_at) VALUES (7, 9, 1, 'x', 't')"), /CHECK/);
    assert.throws(() => store.run("INSERT INTO chat_messages (user_id, body, created_at) VALUES (1, 'x', 't')"), /CHECK/);
    // Reports still cascade with their message, and a group's chat still goes with the group.
    store.run('DELETE FROM chat_messages WHERE id = 4');
    assert.equal(store.get('SELECT COUNT(*) AS n FROM chat_reports WHERE message_id = 4').n, 0);
    store.run('DELETE FROM friend_groups WHERE id = 7');
    assert.equal(store.get('SELECT COUNT(*) AS n FROM chat_messages WHERE id = 5').n, 0);
    assert.equal(store.get('SELECT COUNT(*) AS n FROM chat_reports WHERE message_id = 5').n, 0);
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('share cards', () => {
  test("a closed tournament's top 3 get Share for their own finish; nobody else does", async () => {
    const t = make({ name: 'Hoops Night', start: et('20261105', 0), end: et(FRI, 0) });
    const browsers = {};
    for (const [i, name] of ['Ann', 'Bob', 'Cal', 'Dee'].entries()) {
      browsers[name] = await player(`${name.toLowerCase()}@example.com`, name);
      joinTournament(app.store, t, browsers[name].id, new Date('2026-11-01T00:00:00.000Z'));
      addBet(app.store, { userId: browsers[name].id, start: et('20261105', 20), profit: 4 - i });
    }
    // Live: no Share yet.
    assert.doesNotMatch((await browsers.Ann.get(`/tournaments/${t.slug}`)).text, /data-share-win/);
    closeDueTournaments(app.store, time.now(), app.notifier);

    const page = await browsers.Bob.get(`/tournaments/${t.slug}`);
    assert.match(visible(page.text), /You finished 2nd\. Out of 4 players\. Share the card\. Share/);
    const button = page.text.match(/<button class="btn small win-share"[^>]*>/)[0];
    assert.match(button, /data-place="2nd"/);
    assert.match(button, /data-title="Hoops Night"/);
    assert.match(button, /data-units="3"/);
    assert.match(button, /data-record="1-0"/);
    assert.match(button, /data-players="4"/);
    assert.match(button, /data-date="Nov 5, 2026"/);
    assert.match(button, /data-url="app\.example\.test\/tournaments\/hoops-night"/);
    assert.match(button, /data-name="Bob"/);
    assert.match(button, / hidden /, 'hidden until the script can draw it');
    assert.match((await browsers.Ann.get(`/tournaments/${t.slug}`)).text, /data-place="1st"/);
    assert.doesNotMatch((await browsers.Dee.get(`/tournaments/${t.slug}`)).text, /data-share-win/, '4th');
    assert.doesNotMatch((await app.browser().get(`/tournaments/${t.slug}`)).text, /data-share-win/, 'signed out');
    // The winners wall: on your own row only.
    const wall = (await browsers.Cal.get('/winners?tab=tournaments')).text;
    assert.equal(wall.match(/data-share-win/g).length, 1);
    assert.match(wall, /data-place="3rd"[\s\S]*data-players="4"/);
  });

  test('weekly contest winners get it on /contest and /winners, for their own row', async () => {
    const ann = await player('ann@example.com', 'Ann');
    const bob = addPlayer(app.store, 'Bob');
    // Last week: Ann 5 wins, Bob 5 smaller wins.
    for (let i = 0; i < 5; i++) {
      addBet(app.store, { userId: ann.id, start: et('20261028', 19), profit: 2 });
      addBet(app.store, { userId: bob, start: et('20261028', 19), profit: 1 });
    }
    time.set(et('20261103', 7));
    closeDueWeeks(app.store, time.now(), app.notifier);
    const contest = (await ann.get('/contest')).text;
    assert.equal(contest.match(/data-share-win/g).length, 1);
    assert.match(contest, /data-place="1st" data-title="the weekly contest" data-units="10" data-record="5-0"\s+data-players="2" data-date="Week of Oct 26 – Nov 1"/);
    assert.equal((await ann.get('/winners')).text.match(/data-share-win/g).length, 1);
    assert.doesNotMatch((await app.browser().get('/winners')).text, /data-share-win/);
  });
});
