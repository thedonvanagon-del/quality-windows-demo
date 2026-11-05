import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { MIGRATIONS, openStore } from '../src/db.js';
import { clock, event, startApp, visible } from './helpers.js';

// Sunday 8am Eastern; Bills at Chiefs kicks off at 1pm.
const MORNING = '2026-10-25T12:00:00.000Z';
const KICKOFF = '2026-10-25T17:00:00.000Z';

let time;
let app;

beforeEach(async () => {
  time = clock(MORNING);
  app = await startApp({ time, config: { adminEmails: ['boss@example.com'] } });
  app.espn.events.nfl.push(event({ id: '1', start: KICKOFF }));
});

afterEach(() => app.close());

async function player(email, name) {
  const b = app.browser();
  await b.join(email, name);
  await b.get('/games');
  return b;
}

/** Ann starts Sunday Squad and Bob joins; Cat stays out. */
async function squad() {
  const ann = await player('ann@example.com', 'Ann');
  await ann.get('/groups');
  await ann.post('/groups', { name: 'Sunday Squad', sport: '' });
  const code = app.store.get('SELECT invite_code FROM friend_groups').invite_code;
  const bob = await player('bob@example.com', 'Bob');
  await bob.get('/groups');
  await bob.post('/groups/join', { code });
  const cat = await player('cat@example.com', 'Cat');
  await ann.get('/groups/1');
  await bob.get('/groups/1');
  return { ann, bob, cat, code };
}

const groupMessages = () => app.store.all('SELECT * FROM chat_messages WHERE group_id IS NOT NULL ORDER BY id');
const later = (minutes = 1) => time.advance(minutes * 60_000);

describe('group chat', () => {
  test('members talk trash on the group page; nobody else can read or post', async () => {
    const { ann, bob, cat } = await squad();
    const sent = await bob.post('/groups/1/chat', { body: 'Ann picks like my <b>grandma</b>' });
    assert.equal(sent.location, '/groups/1#chat');

    const page = await ann.get('/groups/1');
    assert.match(page.text, /<div class="chat" data-poll>/, 'refreshes like game chat');
    assert.match(page.text, /Ann picks like my &lt;b&gt;grandma&lt;\/b&gt;/, 'plain text');
    assert.match(visible(page.text), /Only members of Sunday Squad see this/);

    assert.equal((await cat.get('/groups/1')).status, 404);
    await cat.get('/games');
    assert.equal((await cat.post('/groups/1/chat', { body: 'let me in' })).status, 404);
    assert.equal(groupMessages().length, 1);

    // Group messages stay out of the game chat and its counts.
    assert.doesNotMatch(visible((await cat.get('/games/nfl%3A1')).text), /grandma/);
    assert.match(visible((await cat.get('/chat')).text), /Bills @ Chiefs/);
    assert.doesNotMatch(visible((await cat.get('/chat')).text), /1 message/);
  });

  test('same rules as game chat: 280 characters, confirmed emails, the rate limit', async () => {
    const { ann } = await squad();
    await ann.post('/groups/1/chat', { body: '   ' });
    assert.match(visible((await ann.get('/groups/1')).text), /Type something first/);
    await ann.post('/groups/1/chat', { body: 'x'.repeat(281) });
    assert.match(visible((await ann.get('/groups/1')).text), /Keep it under 280 characters/);
    for (let i = 0; i < 9; i++) await ann.post('/groups/1/chat', { body: `msg ${i}` });
    assert.match(visible((await ann.get('/groups/1')).text), /Slow down a little/);
    assert.equal(groupMessages().length, 6, 'eight tries a minute, the two turned away included');

    const dan = app.browser();
    await dan.join('dan@example.com', 'Dan', 'correct horse', { confirm: false });
    await dan.get('/groups');
    await dan.post('/groups/join', { code: app.store.get('SELECT invite_code FROM friend_groups').invite_code });
    assert.match(visible((await dan.get('/groups/1')).text), /Confirm your email to join the chat/);
    await dan.post('/groups/1/chat', { body: 'hi' });
    assert.equal(app.store.get("SELECT COUNT(*) AS n FROM chat_messages WHERE body = 'hi'").n, 0);
  });

  test('delete your own; the owner can delete anything in the group; members can report', async () => {
    const { ann, bob, cat } = await squad();
    await bob.post('/groups/1/chat', { body: 'first from bob' });
    await bob.post('/groups/1/chat', { body: 'second from bob' });
    await ann.post('/groups/1/chat', { body: 'from ann' });
    const [first, second, fromAnn] = groupMessages().map((m) => m.id);

    // Bob isn't the owner, so Ann's message isn't his to delete.
    await bob.get('/groups/1');
    assert.equal((await bob.post(`/chat/${fromAnn}/delete`)).location, '/groups/1#chat');
    assert.match(visible((await bob.get('/groups/1')).text), /isn't yours/);
    assert.equal(app.store.get('SELECT deleted_at FROM chat_messages WHERE id = ?', fromAnn).deleted_at, null);

    await bob.post(`/chat/${first}/delete`);
    assert.ok(app.store.get('SELECT deleted_at FROM chat_messages WHERE id = ?', first).deleted_at, 'his own');

    // Ann owns the group: her page offers Delete on Bob's message, and it works.
    const page = await ann.get('/groups/1');
    assert.match(page.text, new RegExp(`action="/chat/${second}/delete"`));
    await ann.post(`/chat/${second}/delete`);
    assert.ok(app.store.get('SELECT deleted_at FROM chat_messages WHERE id = ?', second).deleted_at, "the owner's call");
    assert.doesNotMatch(visible((await bob.get('/groups/1')).text), /second from bob/);

    // An outsider can't delete or report, and gets no hint the message exists.
    await cat.get('/games');
    assert.equal((await cat.post(`/chat/${fromAnn}/report`)).status, 404);
    assert.equal((await cat.post(`/chat/${fromAnn}/delete`)).status, 404);
    assert.equal(app.store.get('SELECT COUNT(*) AS n FROM chat_reports').n, 0);

    await bob.get('/groups/1');
    assert.equal((await bob.post(`/chat/${fromAnn}/report`)).location, '/groups/1#chat');
    assert.equal(app.store.get('SELECT COUNT(*) AS n FROM chat_reports WHERE message_id = ?', fromAnn).n, 1);
  });

  test('three reports hide a group message, and it shows on the admin page with the group', async () => {
    const { ann, bob, code } = await squad();
    await ann.post('/groups/1/chat', { body: 'buy my picks at scam.example' });
    const [spam] = groupMessages().map((m) => m.id);
    const reporters = [bob];
    for (const [email, name] of [['cal@example.com', 'Cal'], ['dee@example.com', 'Dee']]) {
      const b = await player(email, name);
      await b.get('/groups');
      await b.post('/groups/join', { code });
      reporters.push(b);
    }
    for (const b of reporters) {
      await b.get('/groups/1');
      await b.post(`/chat/${spam}/report`);
    }
    const after = visible((await bob.get('/groups/1')).text);
    assert.doesNotMatch(after, /scam\.example/);
    assert.match(after, /Hidden after reports/);

    const boss = await player('boss@example.com', 'Boss');
    const list = visible((await boss.get('/admin/reports')).text);
    assert.match(list, /Ann · Group: Sunday Squad 3 reports · Hidden buy my picks at scam\.example/);
    await boss.post(`/admin/reports/${spam}/restore`);
    assert.match(visible((await bob.get('/groups/1')).text), /scam\.example/, 'restored');
    await boss.get('/admin/reports');
    await boss.post(`/admin/reports/${spam}/delete`);
    assert.doesNotMatch(visible((await bob.get('/groups/1')).text), /scam\.example/);
  });

  test('the Groups list counts unread messages per group until the chat is opened', async () => {
    const { ann, bob } = await squad();
    later();
    await bob.post('/groups/1/chat', { body: 'you up?' });
    later();
    await bob.post('/groups/1/chat', { body: 'hello??' });
    later();

    const list = visible((await ann.get('/groups')).text);
    assert.match(list, /Sunday Squad 2 new/);
    assert.doesNotMatch(visible((await bob.get('/groups')).text), /\d new/, 'your own messages are never unread');

    await ann.get('/groups/1');
    later();
    assert.doesNotMatch(visible((await ann.get('/groups')).text), /\d new/, 'opening the group reads them');

    await bob.post('/groups/1/chat', { body: 'one more' });
    later();
    assert.match(visible((await ann.get('/groups')).text), /Sunday Squad 1 new/);

    // A new member starts with nothing unread, not the whole history.
    const eve = await player('eve@example.com', 'Eve');
    await eve.get('/groups');
    await eve.post('/groups/join', { code: app.store.get('SELECT invite_code FROM friend_groups').invite_code });
    later();
    assert.doesNotMatch(visible((await eve.get('/groups')).text), /\d new/);
  });

  test('leaving takes away access; deleting the group deletes its chat', async () => {
    const { ann, bob } = await squad();
    await bob.post('/groups/1/chat', { body: 'see ya' });
    await ann.post('/groups/1/chat', { body: 'bye bob' });
    const [bobs, anns] = groupMessages().map((m) => m.id);
    await bob.get('/groups/1');
    await bob.post('/groups/1/leave');
    assert.equal((await bob.get('/groups/1')).status, 404);
    await bob.get('/groups');
    assert.equal((await bob.post('/groups/1/chat', { body: 'back door' })).status, 404);
    assert.equal((await bob.post(`/chat/${anns}/report`)).status, 404);
    assert.equal((await bob.post(`/chat/${bobs}/delete`)).status, 404);

    await bob.get('/games/nfl%3A1');
    await bob.post('/games/nfl%3A1/chat', { body: 'game chat still fine' });
    const gameMessage = app.store.get('SELECT id FROM chat_messages WHERE game_id IS NOT NULL').id;
    await ann.get('/games/nfl%3A1');
    await ann.post(`/chat/${gameMessage}/report`);

    await ann.get('/groups/1');
    await ann.post('/groups/1/chat', { body: 'reported later' });
    const doomed = groupMessages().at(-1).id;
    await bob.get('/games');
    app.store.run("INSERT INTO chat_reports (message_id, user_id, created_at) VALUES (?, ?, '2026-10-25T12:00:00Z')", doomed, 2);

    await ann.get('/groups/1');
    await ann.post('/groups/1/delete');
    assert.equal(groupMessages().length, 0, 'the chat goes with the group');
    assert.equal(app.store.get('SELECT COUNT(*) AS n FROM chat_reports WHERE message_id = ?', doomed).n, 0);
    assert.equal(app.store.get('SELECT COUNT(*) AS n FROM chat_messages WHERE game_id IS NOT NULL').n, 1, 'game chat stays');
    assert.equal(app.store.get('SELECT COUNT(*) AS n FROM chat_reports').n, 1);
  });
});

describe('the chat migration', () => {
  test('keeps old game messages and their reports, and a message is a game or a group, never both', () => {
    // A database as it stood before group chat, with a reported game message in it.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-chat-'));
    const file = path.join(dir, 'old.db');
    const old = new DatabaseSync(file);
    old.exec('PRAGMA foreign_keys = ON');
    MIGRATIONS.slice(0, -1).forEach((sql) => old.exec(sql));
    old.exec(`PRAGMA user_version = ${MIGRATIONS.length - 1}`);
    old.exec("INSERT INTO users (id, email, password_hash, created_at) VALUES (1, 'a@x.co', '!', 't'), (2, 'b@x.co', '!', 't')");
    old.exec(
      `INSERT INTO games (id, sport, start_time, state, status, detail, completed, home_name, home_short, home_abbr, away_name, away_short, away_abbr, lines, updated_at)
       VALUES ('nfl:1', 'nfl', 't', 'pre', '', '', 0, 'A', 'A', 'A', 'B', 'B', 'B', '{}', 't')`,
    );
    old.exec("INSERT INTO chat_messages (id, game_id, user_id, body, created_at) VALUES (5, 'nfl:1', 1, 'old one', 't')");
    old.exec("INSERT INTO chat_reports (message_id, user_id, created_at) VALUES (5, 2, 't')");
    old.close();

    const store = openStore(file);
    assert.deepEqual({ ...store.get('SELECT id, game_id, group_id, body FROM chat_messages') }, { id: 5, game_id: 'nfl:1', group_id: null, body: 'old one' });
    assert.equal(store.get('SELECT COUNT(*) AS n FROM chat_reports WHERE message_id = 5').n, 1);
    assert.throws(() => store.run("INSERT INTO chat_messages (user_id, body, created_at) VALUES (1, 'x', 't')"), /CHECK/);
    store.run("INSERT INTO friend_groups (id, name, invite_code, owner_id, created_at) VALUES (1, 'G', 'C', 1, 't')");
    assert.throws(() => store.run("INSERT INTO chat_messages (game_id, group_id, user_id, body, created_at) VALUES ('nfl:1', 1, 1, 'x', 't')"), /CHECK/);
    // Reports still point at chat_messages after the rebuild, and cascade with it.
    store.run("INSERT INTO chat_messages (id, game_id, user_id, body, created_at) VALUES (9, 'nfl:1', 1, 'x', 't')");
    store.run("INSERT INTO chat_reports (message_id, user_id, created_at) VALUES (9, 2, 't')");
    store.run('DELETE FROM chat_messages WHERE id = 9');
    assert.equal(store.get('SELECT COUNT(*) AS n FROM chat_reports WHERE message_id = 9').n, 0);
    assert.deepEqual(store.all('PRAGMA foreign_key_check'), []);
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
