import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { CITIES, CITY } from '../src/cities.js';
import { MIGRATIONS, openStore } from '../src/db.js';
import { createGroup, groupsOf, ROOMS_PER_DAY } from '../src/groups.js';
import { addBet, clock, startApp, visible } from './helpers.js';

const MORNING = '2026-10-25T12:00:00.000Z';
const SD = 'san-diego-ca';
const LA = 'los-angeles-ca';

let time;
let app;

beforeEach(async () => {
  time = clock(MORNING);
  app = await startApp({ time, config: { adminEmails: ['boss@example.com'] } });
});

afterEach(() => app.close());

async function player(email, name, options) {
  const b = app.browser();
  await b.join(email, name, undefined, options);
  await b.get('/games');
  return b;
}

const room = (slug) => app.store.get("SELECT * FROM friend_groups WHERE kind = 'local' AND city_slug = ?", slug);
const rooms = () => app.store.all("SELECT * FROM friend_groups WHERE kind = 'local' ORDER BY id");
const userId = (name) => app.store.get('SELECT id FROM users WHERE screen_name = ?', name).id;
const memberOf = (groupId, name) => Boolean(app.store.get('SELECT 1 AS x FROM group_members WHERE group_id = ? AND user_id = ?', groupId, userId(name)));
const homeOf = (name) => app.store.get('SELECT home_city FROM users WHERE screen_name = ?', name).home_city;

/** Ann starts the San Diego room from the directory. */
async function sanDiego() {
  const ann = await player('ann@example.com', 'Ann');
  await ann.get('/local');
  const made = await ann.post('/local', { city: SD });
  const id = room(SD).id;
  assert.equal(made.location, `/groups/${id}`);
  return { ann, id };
}

describe('the local rooms migration', () => {
  test('seeds nothing, and an old database keeps its groups, members and chat', () => {
    const fresh = openStore(':memory:');
    assert.equal(fresh.get('SELECT COUNT(*) AS n FROM friend_groups').n, 0, 'no rooms until someone starts one');
    fresh.close();

    // A database as it stood before local rooms, with a group, a member and a reported group message.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-local-'));
    const file = path.join(dir, 'old.db');
    const old = new DatabaseSync(file);
    old.exec('PRAGMA foreign_keys = ON');
    const before = MIGRATIONS.findIndex((sql) => sql.includes('friend_groups_v2'));
    MIGRATIONS.slice(0, before).forEach((sql) => old.exec(sql));
    old.exec(`PRAGMA user_version = ${before}`);
    old.exec("INSERT INTO users (id, email, password_hash, created_at) VALUES (1, 'a@x.co', '!', 't'), (2, 'b@x.co', '!', 't')");
    old.exec("INSERT INTO friend_groups (id, name, sport, invite_code, owner_id, created_at) VALUES (7, 'Crew', 'nfl', 'ABCD2345', 1, 't')");
    old.exec("INSERT INTO group_members (group_id, user_id, joined_at, chat_read_at) VALUES (7, 1, 't', 'r'), (7, 2, 't', NULL)");
    old.exec("INSERT INTO chat_messages (id, group_id, user_id, body, created_at) VALUES (3, 7, 2, 'hi', 't')");
    old.exec("INSERT INTO chat_reports (message_id, user_id, created_at) VALUES (3, 1, 't')");
    old.close();

    const store = openStore(file);
    assert.deepEqual({ ...store.get('SELECT id, name, sport, invite_code, owner_id, kind, city_slug, archived_at FROM friend_groups') },
      { id: 7, name: 'Crew', sport: 'nfl', invite_code: 'ABCD2345', owner_id: 1, kind: 'private', city_slug: null, archived_at: null });
    assert.equal(store.get('SELECT COUNT(*) AS n FROM group_members WHERE group_id = 7').n, 2, 'members kept');
    assert.equal(store.get('SELECT chat_read_at FROM group_members WHERE user_id = 1').chat_read_at, 'r');
    assert.equal(store.get('SELECT COUNT(*) AS n FROM chat_reports WHERE message_id = 3').n, 1, 'chat and reports kept');
    assert.equal(store.get('SELECT COUNT(*) AS n FROM friend_groups WHERE kind = ?', 'local').n, 0);
    assert.equal(store.get('PRAGMA foreign_keys').foreign_keys, 1, 'foreign keys back on');
    // Members and chat still point at the rebuilt table, and still go with it.
    store.run('DELETE FROM friend_groups WHERE id = 7');
    assert.equal(store.get('SELECT COUNT(*) AS n FROM group_members').n, 0);
    assert.equal(store.get('SELECT COUNT(*) AS n FROM chat_messages').n, 0);
    // A private group still needs an owner and a code; a room has neither, and one per city.
    assert.throws(() => store.run("INSERT INTO friend_groups (name, created_at) VALUES ('x', 't')"), /CHECK/);
    assert.throws(() => store.run("INSERT INTO friend_groups (kind, name, invite_code, city_slug, created_at) VALUES ('local', 'x', 'C0DE', 'x-ca', 't')"), /CHECK/);
    store.run("INSERT INTO friend_groups (kind, name, city_slug, created_at) VALUES ('local', 'X', 'x-ca', 't')");
    assert.throws(() => store.run("INSERT INTO friend_groups (kind, name, city_slug, created_at) VALUES ('local', 'X', 'x-ca', 't')"), /UNIQUE/);
    assert.deepEqual(store.all('PRAGMA foreign_key_check'), []);
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('the city list', () => {
  test('one slug per city, Central Coast first, and the major cities', () => {
    assert.equal(new Set(CITIES.map((c) => c.slug)).size, CITIES.length);
    assert.equal(CITIES[0].label, 'Santa Cruz, CA');
    assert.equal(CITY[SD].label, 'San Diego, CA');
    for (const slug of ['new-york-ny', 'chicago-il', 'st-louis-mo', 'washington-dc', 'bakersfield-ca', 'el-centro-ca']) assert.ok(CITY[slug], slug);
  });
});

describe('local rooms', () => {
  test('start one from the list only; a city that has one points to it', async () => {
    const ann = await player('ann@example.com', 'Ann');
    const empty = visible((await ann.get('/local')).text);
    assert.match(empty, /Start a room for your city/);
    assert.match(empty, /No local rooms yet\. Start one for your city\./);

    assert.match(visible((await ann.post('/local', { city: 'gotham-nj' })).text), /Pick a city from the list/);
    assert.match(visible((await ann.post('/local', { city: '' })).text), /Pick a city from the list/);
    assert.equal(rooms().length, 0, 'no free-text rooms');

    await ann.post('/local', { city: SD });
    const sd = room(SD);
    assert.equal(sd.name, 'San Diego, CA', 'named from the list');
    assert.equal(sd.owner_id, null, 'no owner');
    assert.equal(sd.invite_code, null, 'no code');
    assert.ok(memberOf(sd.id, 'Ann'), 'the starter joins');

    const bob = await player('bob@example.com', 'Bob');
    await bob.get('/local');
    const again = await bob.post('/local', { city: SD });
    assert.equal(again.status, 400);
    assert.match(visible(again.text), /There's already a San Diego room\. Join it/);
    assert.match(again.text, new RegExp(`href="/groups/${sd.id}">Join it`));
    assert.equal(rooms().length, 1, 'never two rooms for a city');

    // The directory, by region, with Join for Bob.
    const dir = visible((await bob.get('/local')).text);
    assert.match(dir, /California: San Diego and Imperial San Diego, CA 1 member Join/);
  });

  test('an unconfirmed email can join a room but not start one', async () => {
    await sanDiego();
    const dan = await player('dan@example.com', 'Dan', { confirm: false });
    await dan.get('/local');
    const refused = await dan.post('/local', { city: LA });
    assert.equal(refused.status, 403);
    assert.match(visible(refused.text), /Confirm your email to start a room/);
    assert.equal(room(LA), undefined);
    await dan.post(`/groups/${room(SD).id}/join`);
    assert.ok(memberOf(room(SD).id, 'Dan'));
  });

  test('three rooms a day, then wait', async () => {
    const ann = await player('ann@example.com', 'Ann');
    await ann.get('/local');
    const slugs = ['santa-cruz-ca', 'salinas-ca', 'monterey-ca', 'seaside-ca'];
    for (const slug of slugs.slice(0, ROOMS_PER_DAY)) await ann.post('/local', { city: slug });
    assert.equal(rooms().length, 3);
    assert.match(visible((await ann.post('/local', { city: slugs[3] })).text), /You can start 3 rooms a day\. Try again tomorrow\./);
    assert.equal(rooms().length, 3);
    // The limit is per player, and a private group still starts.
    await ann.get('/groups');
    await ann.post('/groups', { name: 'Sunday Squad', sport: '' });
    assert.equal(app.store.get("SELECT COUNT(*) AS n FROM friend_groups WHERE kind = 'private'").n, 1);
    time.advance(24 * 3_600_000 + 60_000);
    await ann.get('/local');
    await ann.post('/local', { city: slugs[3] });
    assert.ok(room(slugs[3]), 'a day later');
  });

  test('join with one tap and leave anytime; an empty room stays', async () => {
    const { ann, id } = await sanDiego();
    const bob = await player('bob@example.com', 'Bob');
    // Not a member: a Join page, no chat and no board.
    const preview = await bob.get(`/groups/${id}`);
    assert.equal(preview.status, 200);
    assert.match(visible(preview.text), /Join San Diego, CA/);
    assert.doesNotMatch(preview.text, /class="chat"/);
    assert.equal((await bob.get(`/local/${SD}`)).location, `/groups/${id}`);

    const joined = await bob.post(`/groups/${id}/join`);
    assert.equal(joined.location, `/groups/${id}`);
    const page = visible((await bob.get(`/groups/${id}`)).text);
    assert.match(page, /Local room · California: San Diego and Imperial · 2 members/);
    assert.match(page, /Top bettors in San Diego/);
    assert.doesNotMatch(page, /Invite friends|Code |Owner|Delete group/, 'no private-group controls');

    await bob.post(`/groups/${id}/leave`);
    assert.ok(!memberOf(id, 'Bob'));
    await ann.get(`/groups/${id}`);
    assert.equal((await ann.post(`/groups/${id}/leave`)).location, '/local');
    assert.ok(room(SD), 'the last one out leaves the room standing');
    assert.equal(app.store.get('SELECT COUNT(*) AS n FROM group_members WHERE group_id = ?', id).n, 0);
  });

  test('chat and board are for members, like group chat', async () => {
    const { ann, id } = await sanDiego();
    const bob = await player('bob@example.com', 'Bob');
    await ann.post(`/groups/${id}/chat`, { body: 'Padres in 6' });
    const msg = app.store.get('SELECT id FROM chat_messages WHERE group_id = ?', id).id;

    // Bob sees the directory, but can't read or post until he joins.
    assert.match(visible((await bob.get('/local')).text), /San Diego, CA/);
    assert.doesNotMatch((await bob.get(`/groups/${id}`)).text, /Padres in 6/);
    assert.equal((await bob.post(`/groups/${id}/chat`, { body: 'let me in' })).status, 404);
    assert.equal((await bob.post(`/chat/${msg}/report`)).status, 404);
    assert.equal((await bob.post(`/chat/${msg}/delete`)).status, 404);

    await bob.post(`/groups/${id}/join`);
    assert.match((await bob.get(`/groups/${id}`)).text, /Padres in 6/);
    time.advance(60_000);
    await bob.post(`/groups/${id}/chat`, { body: 'Dodgers in 4' });
    assert.equal(app.store.get('SELECT COUNT(*) AS n FROM chat_messages WHERE group_id = ?', id).n, 2);

    // Unread counts on the directory and the Groups page, never a notification.
    const unread = visible((await ann.get('/local')).text);
    assert.match(unread, /San Diego, CA 2 members 1 new Open/);
    assert.match(visible((await ann.get('/groups')).text), /Local rooms San Diego, CA 2 members 1 new Open Find your city/);
    assert.equal(app.store.get('SELECT COUNT(*) AS n FROM notifications').n, 0);
  });

  test('the local board counts members only', async () => {
    const { ann, id } = await sanDiego();
    const bob = await player('bob@example.com', 'Bob');
    await player('cat@example.com', 'Cat');
    await bob.post(`/groups/${id}/join`);
    addBet(app.store, { userId: userId('Ann'), start: '2026-10-20T17:00:00.000Z', result: 'win' });
    addBet(app.store, { userId: userId('Bob'), start: '2026-10-20T17:00:00.000Z', result: 'loss' });
    addBet(app.store, { userId: userId('Cat'), start: '2026-10-20T17:00:00.000Z', result: 'win' });
    const board = visible((await ann.get(`/groups/${id}`)).text);
    assert.match(board, /Ann 1-0/);
    assert.match(board, /Bob 0-1/);
    assert.doesNotMatch(board, /Cat/);
    assert.match((await ann.get(`/groups/${id}?period=7`)).text, /aria-current="true">7 days/);
  });

  test('home city from setup starts the room if needed, and shows on the profile', async () => {
    // Confirmed: picking a city with no room starts it.
    const ann = app.browser();
    await ann.join('ann@example.com', 'Ann');
    const setup = await ann.get('/setup');
    assert.match(visible(setup.text), /Pick your city/);
    assert.match(setup.text, /<optgroup label="California: Central Coast">/);
    await ann.post('/setup', { city: SD });
    assert.equal(homeOf('Ann'), SD);
    assert.ok(memberOf(room(SD).id, 'Ann'));
    const profile = await ann.get('/u/Ann');
    assert.match(profile.text, new RegExp(`<a class="city-pin" href="/local/${SD}">`));
    assert.match(visible(profile.text), /San Diego, CA/);
    assert.match(visible((await app.browser().get('/u/Ann')).text), /San Diego, CA/, 'public, like the rest of the profile');
    assert.match(visible((await ann.get(`/groups/${room(SD).id}`)).text), /San Diego, CA is your city/);

    // Unconfirmed: the city is saved, and its room starts once the email is confirmed.
    const dan = app.browser();
    await dan.join('dan@example.com', 'Dan', undefined, { confirm: false });
    await dan.get('/setup');
    await dan.post('/setup', { city: LA });
    assert.equal(homeOf('Dan'), LA);
    assert.equal(room(LA), undefined);
    await dan.get(dan.verifyLink('dan@example.com'));
    assert.ok(memberOf(room(LA).id, 'Dan'), 'room started on confirming');

    // An existing room is joined, not doubled.
    const eve = app.browser();
    await eve.join('eve@example.com', 'Eve');
    await eve.get('/setup');
    await eve.post('/setup', { city: SD });
    assert.equal(rooms().length, 2);
    assert.ok(memberOf(room(SD).id, 'Eve'));
  });

  test('home city from the profile: one home, many rooms', async () => {
    const { ann, id } = await sanDiego();
    await ann.get('/u/Ann');
    await ann.post('/home-city', { city: LA });
    assert.equal(homeOf('Ann'), LA);
    assert.ok(memberOf(room(LA).id, 'Ann'), 'joined, and started');
    assert.ok(memberOf(id, 'Ann'), 'still in San Diego');
    assert.match((await ann.get('/u/Ann')).text, new RegExp(`<a class="city-pin" href="/local/${LA}">`), 'the profile shows the new home');

    await ann.post('/home-city', { city: 'nowhere-zz' });
    assert.match(visible((await ann.get('/u/Ann')).text), /Pick a city from the list/);
    assert.equal(homeOf('Ann'), LA);

    // Leaving your home city's room clears it.
    await ann.get(`/groups/${room(LA).id}`);
    await ann.post(`/groups/${room(LA).id}/leave`);
    assert.equal(homeOf('Ann'), null);
    await ann.get('/u/Ann');
    await ann.post('/home-city', { city: SD });
    await ann.post('/home-city', { city: '' });
    assert.equal(homeOf('Ann'), null);
    assert.ok(memberOf(id, 'Ann'), 'clearing the city keeps the room');
  });

  test('admins rename, archive and restore; archived rooms are hidden and read-only', async () => {
    const { ann, id } = await sanDiego();
    await ann.post(`/groups/${id}/chat`, { body: 'old news' });
    const boss = await player('boss@example.com', 'Boss');
    for (const [method, url] of [['get', '/admin/rooms'], ['post', `/admin/rooms/${id}/rename`], ['post', `/admin/rooms/${id}/archive`], ['post', `/admin/rooms/${id}/restore`], ['post', '/admin/rooms']]) {
      await ann.get('/local');
      assert.equal((await ann[method](url, { name: 'Mine now', city: LA })).status, 404, `${url} is admins only`);
    }
    assert.equal(room(SD).name, 'San Diego, CA');

    const admin = visible((await boss.get('/admin/rooms')).text);
    assert.match(admin, /San Diego, CA .*1 member · 1 message/);
    await boss.post(`/admin/rooms/${id}/rename`, { name: 'America’s Finest' });
    assert.equal(room(SD).name, 'America’s Finest');
    assert.equal(room(SD).city_slug, SD, 'the city stays');
    await boss.post('/admin/rooms', { city: LA });
    assert.ok(room(LA), 'admins can start one too');

    await boss.get('/admin/rooms');
    await boss.post(`/admin/rooms/${id}/archive`);
    assert.ok(room(SD).archived_at);
    assert.doesNotMatch(visible((await ann.get('/local')).text), /America/, 'off the directory');
    assert.doesNotMatch(visible((await ann.get('/groups')).text), /America/);
    const page = await ann.get(`/groups/${id}`);
    assert.match(visible(page.text), /This room is archived/);
    assert.match(page.text, /old news/, 'history kept');
    assert.doesNotMatch(page.text, /class="chat-form"/);
    await ann.post(`/groups/${id}/chat`, { body: 'anyone?' });
    assert.equal(app.store.get('SELECT COUNT(*) AS n FROM chat_messages WHERE group_id = ?', id).n, 1, 'no new posts');
    const cat = await player('cat@example.com', 'Cat');
    assert.equal((await cat.get(`/groups/${id}`)).status, 404);
    assert.equal((await cat.post(`/groups/${id}/join`)).status, 404, 'no new members');
    assert.match(visible((await cat.post('/local', { city: SD })).text), /The San Diego room is closed for now/);

    await boss.get('/admin/rooms');
    await boss.post(`/admin/rooms/${id}/restore`);
    assert.equal(room(SD).archived_at, null);
    assert.match(visible((await cat.get('/local')).text), /America/);
  });

  test('no owner powers: the starter is just a member, and admins moderate', async () => {
    const { ann, id } = await sanDiego();
    const bob = await player('bob@example.com', 'Bob');
    await bob.post(`/groups/${id}/join`);
    await bob.post(`/groups/${id}/chat`, { body: 'Ann fades herself' });
    const bobs = app.store.get('SELECT id FROM chat_messages WHERE group_id = ?', id).id;

    await ann.get(`/groups/${id}`);
    await ann.post(`/chat/${bobs}/delete`);
    assert.equal(app.store.get('SELECT deleted_at FROM chat_messages WHERE id = ?', bobs).deleted_at, null, "the starter can't delete others");
    assert.equal((await ann.post(`/groups/${id}/delete`)).status, 404, "or delete the room");
    assert.ok(room(SD));

    // Three reports hide a message, as everywhere.
    for (const [email, name] of [['c@example.com', 'Cee'], ['d@example.com', 'Dee']]) {
      const b = await player(email, name);
      await b.post(`/groups/${id}/join`);
      await b.post(`/chat/${bobs}/report`);
    }
    await ann.get(`/groups/${id}`);
    await ann.post(`/chat/${bobs}/report`);
    assert.match(visible((await ann.get(`/groups/${id}`)).text), /Hidden after reports/);
    const boss = await player('boss@example.com', 'Boss');
    assert.match(visible((await boss.get('/admin/reports')).text), /Local room: San Diego, CA/);

    // An admin in the room can delete any message there.
    await boss.post(`/groups/${id}/join`);
    await boss.post(`/groups/${id}/chat`, { body: 'keep it clean' });
    await ann.post(`/groups/${id}/chat`, { body: 'spam spam' });
    const spam = app.store.get("SELECT id FROM chat_messages WHERE body = 'spam spam'").id;
    await boss.get(`/groups/${id}`);
    await boss.post(`/chat/${spam}/delete`);
    assert.ok(app.store.get('SELECT deleted_at FROM chat_messages WHERE id = ?', spam).deleted_at);
  });

  test("rooms don't count as groups you run, or hit the group limit", async () => {
    const { ann, id } = await sanDiego();
    // Twenty private groups is the most anyone can run; rooms don't count toward it.
    for (let i = 0; i < 19; i++) createGroup(app.store, { ownerId: userId('Ann'), name: `Group ${i}`, sport: '', now: time.now() });
    await ann.get('/groups');
    await ann.post('/groups', { name: 'The twentieth', sport: '' });
    assert.equal(app.store.get("SELECT COUNT(*) AS n FROM friend_groups WHERE owner_id = ? AND kind = 'private'", userId('Ann')).n, 20);
    assert.match(visible((await ann.post('/groups', { name: 'One more', sport: '' })).text), /You can run up to 20 groups/);
    await ann.get('/local');
    await ann.post('/local', { city: LA });
    assert.ok(room(LA), 'rooms still start');
    assert.ok(!groupsOf(app.store, userId('Ann')).some((g) => g.id === id), 'not in your groups list');
    const page = visible((await ann.get('/groups')).text);
    assert.match(page, /Local rooms Los Angeles, CA .* San Diego, CA .* Find your city/);

    // Deleting the account hands over private groups as before, and leaves rooms standing.
    await ann.get('/u/Ann');
    await ann.post('/account/delete', { password: 'correct horse' });
    assert.ok(room(SD));
    assert.ok(room(LA));
  });
});
