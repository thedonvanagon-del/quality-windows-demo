import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { clock, startApp, visible } from './helpers.js';

const MORNING = '2026-10-25T12:00:00.000Z';

let time;
let app;

beforeEach(async () => {
  time = clock(MORNING);
  app = await startApp({ time });
});

afterEach(() => app.close());

const user = (name) => app.store.get('SELECT id, invited_by, invite_counted_at FROM users WHERE screen_name = ?', name);
const follows = (name) => app.store.all(
  'SELECT u.screen_name FROM follows f JOIN users u ON u.id = f.followee_id WHERE f.follower_id = ? ORDER BY lower(u.screen_name)',
  user(name).id,
).map((r) => r.screen_name);
const inviteNotes = (name) => app.store.all("SELECT text FROM notifications WHERE user_id = ? AND kind = 'invite' ORDER BY id", user(name).id).map((r) => r.text);

/** Ann's invite link, from her invite page. */
async function annsLink() {
  const ann = app.browser();
  await ann.join('ann@example.com', 'Ann');
  const page = await ann.get('/invite');
  assert.equal(page.status, 200);
  const url = /data-copy="(https:\/\/app\.example\.test\/i\/([A-Z0-9]{8}))"/.exec(page.text);
  assert.ok(url, 'a copy button with the link');
  assert.match(page.text, new RegExp(`data-share="${url[1]}"`), 'and a share button');
  return { ann, path: `/i/${url[2]}`, code: url[2] };
}

describe('invite friends', () => {
  test('a friend counts once they confirm and pick a name, and follows the inviter', async () => {
    const { ann, path, code } = await annsLink();
    assert.equal(app.store.get("SELECT invite_code FROM users WHERE screen_name = 'Ann'").invite_code, code, 'stored on the player');

    const bob = app.browser();
    const link = await bob.get(path);
    assert.equal(link.location, `/signup?invite=${code}`);
    const signup = await bob.get(link.location);
    assert.match(visible(signup.text), /Ann invited you\./);
    assert.match(signup.text, new RegExp(`name="invite" value="${code}"`));
    const made = await bob.post('/signup', { email: 'bob@example.com', password: 'correct horse', adult: 'on', terms: 'on', invite: code });
    assert.equal(made.location, '/welcome');
    assert.equal(app.store.get("SELECT invited_by FROM users WHERE email = 'bob@example.com'").invited_by, user('Ann').id);

    // A name, but no confirmed email yet: following, not counted.
    await bob.get('/welcome');
    const welcome = await bob.post('/welcome', { screen_name: 'Bob' });
    assert.equal(welcome.location, '/setup');
    assert.deepEqual(follows('Bob'), ['Ann']);
    assert.equal(user('Bob').invite_counted_at, null);
    assert.deepEqual(inviteNotes('Ann'), []);
    let page = visible((await ann.get('/invite')).text);
    assert.match(page, /0 friends have joined/);
    assert.match(page, /1 more signed up and hasn't finished yet/);

    // Setup still adds its own follows.
    await bob.get('/setup');
    await bob.post('/setup/skip');
    assert.deepEqual(follows('Bob'), ['Ann', 'BookieBullies']);

    // Confirmed: it counts, once, and Ann hears.
    await bob.get(bob.verifyLink('bob@example.com'));
    assert.equal(user('Bob').invite_counted_at, MORNING);
    assert.deepEqual(inviteNotes('Ann'), ['Bob joined from your invite.']);
    page = visible((await ann.get('/invite')).text);
    assert.match(page, /1 friend has joined/);
    assert.match(page, /1 of 3 for the Recruiter badge/);
    assert.match((await ann.get('/invite')).text, /<progress max="3" value="1"/);
    await bob.get(bob.verifyLink('bob@example.com'));
    assert.equal(inviteNotes('Ann').length, 1);
  });

  test('confirm first, name second; the invite cookie carries it if the form lost it; three earn Recruiter', async () => {
    const { ann, path } = await annsLink();
    for (const [n, name] of [[1, 'Cal'], [2, 'Dee'], [3, 'Eve']]) {
      const b = app.browser();
      await b.get(path);
      // Wander off and sign up from the plain page: the cookie still knows.
      await b.get('/signup');
      await b.post('/signup', { email: `${name.toLowerCase()}@example.com`, password: 'correct horse', adult: 'on', terms: 'on' });
      assert.ok(!b.jar.has('invite'), 'the cookie is spent');
      await b.get(b.verifyLink(`${name.toLowerCase()}@example.com`));
      assert.equal(app.store.get('SELECT invite_counted_at FROM users WHERE email = ?', `${name.toLowerCase()}@example.com`).invite_counted_at, null, 'no name yet');
      await b.get('/welcome');
      await b.post('/welcome', { screen_name: name });
      assert.ok(user(name).invite_counted_at, `${name} counts`);
      assert.equal(inviteNotes('Ann').length, n);
      assert.equal(app.store.get("SELECT COUNT(*) AS n FROM badges WHERE user_id = ? AND key = 'recruiter'", user('Ann').id).n, n === 3 ? 1 : 0);
    }
    assert.match(visible((await ann.get('/notifications')).text), /New badge: Recruiter\./);
    const page = visible((await ann.get('/invite')).text);
    assert.match(page, /3 friends have joined/);
    assert.match(page, /You have the Recruiter badge/);
    assert.match(page, /Cal Dee Eve/);
    assert.match(visible((await app.browser().get('/u/Ann')).text), /Badges Recruiter/);
  });

  test('bad codes, signed-in visitors, and group invites still working', async () => {
    const { ann, path } = await annsLink();
    assert.equal((await app.browser().get('/i/NOPE2345')).status, 404);
    assert.equal((await app.browser().get('/i/x')).status, 404);
    assert.equal((await ann.get(path)).location, '/u/Ann', 'already signed in: just the profile');
    assert.match((await ann.get('/more')).text, /href="\/invite"/);
    assert.match((await ann.get('/u/Ann')).text, /href="\/invite">Invite friends/);

    // A group link opened by someone who also came from Ann's invite: both survive signup.
    await ann.post('/groups', { name: 'Saturday Crew', sport: '' });
    const code = app.store.get('SELECT invite_code FROM friend_groups').invite_code;
    const bob = app.browser();
    await bob.get(path);
    const join = await bob.get(`/join/${code}`);
    assert.equal(join.location, `/signup?next=${encodeURIComponent(`/join/${code}`)}`);
    const made = await bob.post('/signup', { email: 'bob@example.com', password: 'correct horse', adult: 'on', terms: 'on', next: `/join/${code}` });
    assert.equal(made.location, `/welcome?next=${encodeURIComponent(`/join/${code}`)}`);
    await bob.get(made.location);
    const welcome = await bob.post('/welcome', { screen_name: 'Bob', next: `/join/${code}` });
    await bob.get(welcome.location);
    const done = await bob.post('/setup/skip', { next: `/join/${code}` });
    assert.equal(done.location, `/join/${code}`);
    await bob.get(done.location);
    assert.equal((await bob.post(`/join/${code}`)).location, `/groups/${app.store.get('SELECT id FROM friend_groups').id}`);
    assert.equal(user('Bob').invited_by, user('Ann').id);
  });
});
