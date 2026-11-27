// Blocking a player: the profile's "⋯", what the blocker stops seeing (chat,
// feeds, notes), what the blocked player can't do (follow), and the Blocked
// players list.

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { block, blockedIds, eitherBlocked, isBlocked, unblock } from '../src/blocks.js';
import { addBet, clock, event, startApp, visible } from './helpers.js';

// Sunday 8am Eastern; Bills at Chiefs kicks off at 1pm.
const MORNING = '2026-10-25T12:00:00.000Z';
const KICKOFF = '2026-10-25T17:00:00.000Z';

let time;
let app;

beforeEach(async () => {
  time = clock(MORNING);
  app = await startApp({ time });
  app.espn.events.nfl.push(event({ id: '1', start: KICKOFF }));
});

afterEach(() => app.close());

async function player(email, name) {
  const b = app.browser();
  await b.join(email, name);
  await b.get('/games');
  b.id = app.store.get('SELECT id FROM users WHERE email = ?', email).id;
  b.name = name;
  return b;
}

const later = (minutes = 1) => time.advance(minutes * 60_000);
const follows = () => app.store.all('SELECT follower_id, followee_id FROM follows ORDER BY follower_id, followee_id');

describe('blocking', () => {
  test('the "⋯" on a profile blocks in two steps; it needs the form token; not yourself; not a player who isn\'t there', async () => {
    const ann = await player('ann@example.com', 'Ann');
    const bob = await player('bob@example.com', 'Bob');

    const page = await ann.get('/u/Bob');
    assert.match(page.text, /<details class="profile-more">/, 'a menu by Follow');
    assert.match(visible(page.text), /Block Bob\? You won't see their messages or picks, and they can't follow you\./);
    assert.match(page.text, /action="\/u\/Bob\/block"[^>]*>.*Yes, block/s, 'the confirm step is a second button, no pop-up');
    assert.doesNotMatch(page.text, /data-confirm="[^"]*[Bb]lock/);
    assert.doesNotMatch((await ann.get('/u/Ann')).text, /class="profile-more"/, 'no menu on your own profile');

    // Without the form token, nothing happens.
    assert.equal((await ann.post('/u/Bob/block', {}, { csrf: false })).status, 403);
    assert.equal(isBlocked(app.store, ann.id, bob.id), false);

    const done = await ann.post('/u/Bob/block');
    assert.equal(done.status, 303);
    assert.equal(done.location, '/u/Bob');
    assert.ok(isBlocked(app.store, ann.id, bob.id));
    assert.equal(isBlocked(app.store, bob.id, ann.id), false, 'one way');
    const after = await ann.get('/u/Bob');
    assert.match(visible(after.text), /You blocked Bob\. You won't see their messages or picks, and they can't follow you\./);
    assert.match(visible(after.text), /You blocked this player\. Unblock/);
    assert.doesNotMatch(after.text, /class="profile-more"/);
    assert.doesNotMatch(after.text, /action="\/u\/Bob\/follow"/, 'no Follow button while blocked');

    // Twice is fine; yourself isn't; nobody isn't.
    assert.equal((await ann.post('/u/Bob/block')).status, 303);
    assert.equal(app.store.get('SELECT COUNT(*) AS n FROM user_blocks').n, 1);
    await ann.get('/u/Ann');
    assert.equal((await ann.post('/u/Ann/block')).status, 303);
    assert.match(visible((await ann.get('/u/Ann')).text), /You can't block yourself\./);
    assert.equal(isBlocked(app.store, ann.id, ann.id), false);
    assert.equal((await ann.post('/u/Nobody/block')).status, 404);
    assert.equal((await ann.post('/u/Nobody/unblock')).status, 404);

    // Signed out: off to log in.
    const visitor = app.browser();
    const out = await visitor.post('/u/Bob/block');
    assert.equal(out.status, 303);
    assert.match(out.location, /^\/login/);
    assert.doesNotMatch((await visitor.get('/u/Bob')).text, /profile-more|blocked-note/);
  });

  test("a blocked player's profile hides their photo, cover, bio, link and picks behind a banner", async () => {
    const ann = await player('ann@example.com', 'Ann');
    const bob = await player('bob@example.com', 'Bob');
    app.store.run("UPDATE users SET bio = 'Fade me', link_url = 'https://t.me/bob', link_label = 'My picks', photo = 'a.jpg', cover = 'c.jpg' WHERE id = ?", bob.id);
    addBet(app.store, { userId: bob.id, start: '2026-10-20T17:00:00.000Z' });
    const before = await ann.get('/u/Bob');
    assert.match(before.text, /\/media\/a\.jpg/);
    assert.match(before.text, /\/media\/c\.jpg/);
    assert.match(visible(before.text), /Fade me/);

    await ann.post('/u/Bob/block');
    const page = await ann.get('/u/Bob');
    for (const gone of [/\/media\/a\.jpg/, /\/media\/c\.jpg/, /Fade me/, /t\.me\/bob/, /class="tickets"/]) assert.doesNotMatch(page.text, gone);
    assert.match(visible(page.text), /Hidden because you blocked Bob\./);
    assert.match(visible(page.text), /1-0/, 'the record stays: it is public');
    // Everyone else still sees all of it.
    const cat = await player('cat@example.com', 'Cat');
    const theirs = await cat.get('/u/Bob');
    assert.match(theirs.text, /\/media\/a\.jpg/);
    assert.match(visible(theirs.text), /Fade me/);
    assert.ok(cat.id);
  });

  test('messages from a blocked player disappear from game chat, for the blocker only', async () => {
    const ann = await player('ann@example.com', 'Ann');
    const bob = await player('bob@example.com', 'Bob');
    const cat = await player('cat@example.com', 'Cat');
    await bob.get('/games/nfl%3A1');
    await bob.post('/games/nfl%3A1/chat', { body: 'Ann is a clown' });
    later();
    await cat.get('/games/nfl%3A1');
    await cat.post('/games/nfl%3A1/chat', { body: 'Chiefs by ten' });

    await ann.get('/games/nfl%3A1');
    await ann.post('/u/Bob/block');
    const mine = visible((await ann.get('/games/nfl%3A1')).text);
    assert.doesNotMatch(mine, /Ann is a clown/);
    assert.match(mine, /Chiefs by ten/);
    assert.match(visible((await cat.get('/games/nfl%3A1')).text), /Ann is a clown/, 'others still see it');
    assert.match(visible((await bob.get('/games/nfl%3A1')).text), /Ann is a clown/, 'and so does Bob');

    // New messages too, and after unblocking they're back.
    later();
    await bob.post('/games/nfl%3A1/chat', { body: 'Still a clown' });
    assert.doesNotMatch(visible((await ann.get('/games/nfl%3A1')).text), /Still a clown/);
    await ann.post('/u/Bob/unblock');
    assert.match(visible((await ann.get('/games/nfl%3A1')).text), /Ann is a clown.*Still a clown/);
  });

  test('and from group chat (and its unread count) and tournament chat', async () => {
    const ann = await player('ann@example.com', 'Ann');
    await ann.get('/groups');
    await ann.post('/groups', { name: 'Sunday Squad', sport: '' });
    const code = app.store.get('SELECT invite_code FROM friend_groups').invite_code;
    const bob = await player('bob@example.com', 'Bob');
    await bob.get('/groups');
    await bob.post('/groups/join', { code });
    const cat = await player('cat@example.com', 'Cat');
    await cat.get('/groups');
    await cat.post('/groups/join', { code });
    await ann.get('/groups/1');
    later();
    await bob.get('/groups/1');
    await bob.post('/groups/1/chat', { body: 'Trash from Bob' });
    await cat.get('/groups/1');
    await cat.post('/groups/1/chat', { body: 'Hello from Cat' });
    assert.match(visible((await ann.get('/groups')).text), /2 new/);

    await ann.post('/u/Bob/block');
    assert.match(visible((await ann.get('/groups')).text), /1 new/, 'the blocked player\'s messages don\'t count as unread');
    const group = visible((await ann.get('/groups/1')).text);
    assert.doesNotMatch(group, /Trash from Bob/);
    assert.match(group, /Hello from Cat/);
    assert.match(visible((await cat.get('/groups/1')).text), /Trash from Bob/);

    // The Weekly Open's chat: everyone signed in.
    app.store.run(
      `INSERT INTO tournaments (slug, name, sports, starts_at, ends_at, min_bets, prize, kind, created_at)
       VALUES ('weekly-open', 'The Weekly Open', NULL, '2026-10-19T04:00:00.000Z', '2026-10-26T04:00:00.000Z', 5, 'Bragging rights', 'weekly', ?)`,
      MORNING,
    );
    await bob.get('/tournaments/weekly-open');
    await bob.post('/tournaments/weekly-open/chat', { body: 'Bob talks big' });
    await cat.get('/tournaments/weekly-open');
    await cat.post('/tournaments/weekly-open/chat', { body: 'Cat talks small' });
    const t = visible((await ann.get('/tournaments/weekly-open')).text);
    assert.doesNotMatch(t, /Bob talks big/);
    assert.match(t, /Cat talks small/);
    assert.match(t, /block a player from their profile/, 'the rules say how');
    assert.match(visible((await cat.get('/tournaments/weekly-open')).text), /Bob talks big/);
  });

  test('blocking ends both follows, and neither can follow the other after', async () => {
    const ann = await player('ann@example.com', 'Ann');
    const bob = await player('bob@example.com', 'Bob');
    await ann.post('/u/Bob/follow');
    await bob.get('/u/Ann');
    await bob.post('/u/Ann/follow');
    assert.equal(follows().length, 2);

    await ann.post('/u/Bob/block');
    assert.deepEqual(follows(), []);

    // Bob is told no, politely, and nothing more.
    await bob.get('/u/Ann');
    const refused = await bob.post('/u/Ann/follow');
    assert.equal(refused.status, 303);
    const page = visible((await bob.get('/u/Ann')).text);
    assert.match(page, /You can't follow this player\./);
    assert.doesNotMatch(page, /blocked/i, 'Bob isn\'t told he was blocked');
    // Ann gets the reason.
    await ann.get('/u/Bob');
    await ann.post('/u/Bob/follow');
    assert.match(visible((await ann.get('/u/Bob')).text), /You blocked Bob\. Unblock them first to follow\./);
    assert.deepEqual(follows(), []);

    // Unblocking doesn't bring the follows back, but allows them again.
    await ann.post('/u/Bob/unblock');
    assert.deepEqual(follows(), []);
    await bob.get('/u/Ann');
    await bob.post('/u/Ann/follow');
    assert.equal(follows().length, 1);
  });

  test('the Following feed, Hot streaks, group feed and notifications leave a blocked player out', async () => {
    const ann = await player('ann@example.com', 'Ann');
    const bob = await player('bob@example.com', 'Bob');
    await ann.get('/groups');
    await ann.post('/groups', { name: 'Sunday Squad', sport: '' });
    const code = app.store.get('SELECT invite_code FROM friend_groups').invite_code;
    await bob.get('/groups');
    await bob.post('/groups/join', { code });
    // Bob has ten straight wins this month: on Hot, in the group feed, and in Ann's Following.
    for (let i = 0; i < 10; i++) addBet(app.store, { userId: bob.id, start: new Date(Date.parse(MORNING) - (i + 1) * 86_400_000).toISOString() });
    await ann.get('/u/Bob');
    await ann.post('/u/Bob/follow');
    // Bob locks a pick: Ann, following, hears about it.
    app.notifier.pickMade({ player: { id: bob.id, screenName: 'Bob' }, game: { away: { short: 'Bills' }, home: { short: 'Chiefs' } }, now: time.now() });
    assert.match(visible((await ann.get('/notifications')).text), /Bob locked a pick on Bills @ Chiefs/);
    assert.match(visible((await ann.get('/following')).text), /Bob/);
    assert.match((await ann.get('/hot')).text, /href="\/u\/Bob"/);
    assert.match(visible((await ann.get('/groups/1')).text), /Bob/);
    const groupBets = (text) => (/<h2[^>]*>Picks<\/h2>([\s\S]*?)(<h2|$)/.exec(text)?.[1] ?? text).match(/class="ticket/g)?.length ?? 0;
    assert.ok(groupBets((await ann.get('/groups/1')).text) > 0);

    await ann.post('/u/Bob/block');
    // The old note goes out of the inbox, and the feeds drop him.
    assert.doesNotMatch(visible((await ann.get('/notifications')).text), /Bob locked/);
    assert.doesNotMatch((await ann.get('/following')).text, /\/u\/Bob/);
    assert.doesNotMatch((await ann.get('/hot')).text, /href="\/u\/Bob"/);
    assert.equal(groupBets((await ann.get('/groups/1')).text), 0);
    // The leaderboard keeps him: a record is public.
    assert.match((await ann.get('/leaderboard')).text, /href="\/u\/Bob"/);

    // Even a follow that slipped through (a row put straight in) sends no note and shows no picks.
    app.store.run('INSERT INTO follows (follower_id, followee_id, created_at) VALUES (?, ?, ?)', ann.id, bob.id, MORNING);
    later(60);
    const before = app.store.get('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ?', ann.id).n;
    app.notifier.pickMade({ player: { id: bob.id, screenName: 'Bob' }, game: { away: { short: 'Bills' }, home: { short: 'Chiefs' } }, now: time.now() });
    assert.equal(app.store.get('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ?', ann.id).n, before);
    assert.doesNotMatch(visible((await ann.get('/following')).text), /Bob/);
    // And the other way: Bob following Ann hears nothing from her while she has him blocked.
    app.store.run('INSERT INTO follows (follower_id, followee_id, created_at) VALUES (?, ?, ?)', bob.id, ann.id, MORNING);
    app.notifier.pickMade({ player: { id: ann.id, screenName: 'Ann' }, game: { away: { short: 'Bills' }, home: { short: 'Chiefs' } }, now: time.now() });
    assert.equal(app.store.get("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND kind = 'follow'", bob.id).n, 0);
  });

  test('your profile lists who you blocked, with Unblock that comes back to the list', async () => {
    const ann = await player('ann@example.com', 'Ann');
    await player('bob@example.com', 'Bob');
    await player('cat@example.com', 'Cat');
    let own = await ann.get('/u/Ann');
    assert.match(visible(own.text), /Blocked players Nobody\. To block a player, open their profile and tap ⋯ by Follow\./);

    await ann.post('/u/Bob/block');
    later();
    await ann.post('/u/Cat/block');
    own = await ann.get('/u/Ann');
    const list = /<ul class="blocked-list">([\s\S]*?)<\/ul>/.exec(own.text)[1];
    assert.deepEqual([...list.matchAll(/class="who" href="\/u\/(\w+)"/g)].map((m) => m[1]), ['Cat', 'Bob'], 'newest first');
    assert.doesNotMatch((await (await player('dan@example.com', 'Dan')).get('/u/Ann')).text, /blocked-list|Blocked players/, 'only you see it');

    const back = await ann.post('/u/Bob/unblock', { next: '/u/Ann#blocked' });
    assert.equal(back.location, '/u/Ann#blocked');
    own = await ann.get('/u/Ann');
    assert.match(visible(own.text), /You unblocked Bob\./);
    assert.deepEqual([.../<ul class="blocked-list">([\s\S]*?)<\/ul>/.exec(own.text)[1].matchAll(/class="who" href="\/u\/(\w+)"/g)].map((m) => m[1]), ['Cat']);
    assert.doesNotMatch(visible((await ann.get('/u/Bob')).text), /You blocked this player/);
  });

  test('blocks.js on its own, and deleting an account takes its blocks with it', async () => {
    const ann = await player('ann@example.com', 'Ann');
    const bob = await player('bob@example.com', 'Bob');
    const now = time.now();
    assert.deepEqual(block(app.store, { blockerId: ann.id, blockedId: ann.id, now }), { error: "You can't block yourself." });
    assert.deepEqual(block(app.store, { blockerId: ann.id, blockedId: bob.id, now }), {});
    assert.ok(eitherBlocked(app.store, bob.id, ann.id));
    assert.deepEqual([...blockedIds(app.store, ann.id)], [bob.id]);
    assert.deepEqual([...blockedIds(app.store, null)], []);
    assert.equal(unblock(app.store, { blockerId: bob.id, blockedId: ann.id }), false, 'only the blocker can take it back');
    assert.equal(unblock(app.store, { blockerId: ann.id, blockedId: bob.id }), true);
    block(app.store, { blockerId: ann.id, blockedId: bob.id, now });

    await bob.get('/u/Bob');
    await bob.post('/account/delete', { password: 'correct horse' });
    assert.equal(app.store.get('SELECT COUNT(*) AS n FROM user_blocks').n, 0);
  });
});
