import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { clock, startApp } from './helpers.js';

let app;

beforeEach(async () => {
  app = await startApp({ time: clock('2026-11-06T18:00:00.000Z') });
});

afterEach(() => app.close());

describe('launch screen and the .com', () => {
  test('shows the crest and BOOKIEBULLIES.COM on the first page of a visit, then not again', async () => {
    const b = app.browser();
    const first = await b.get('/login');
    assert.match(first.text, /<div class="splash"[^>]*data-splash>.*<b class="splash-name">LockBox<\/b><span class="splash-by">by BOOKIEBULLIES\.COM<\/span><span class="splash-motto">Made to show the true skill of real handicappers with nothing to hide\.<\/span><\/div>/s);
    assert.equal(b.jar.get('bb_seen'), '1', 'renewed on every page, so moving around never shows it');
    const second = await b.get('/login');
    assert.doesNotMatch(second.text, /class="splash"/);
  });

  test('comes back after 20 minutes away: the cookie lasts 20 minutes and every page renews it', async () => {
    const b = app.browser();
    const first = (await fetch(b.base + '/login')).headers.getSetCookie().find((c) => c.startsWith('bb_seen='));
    assert.match(first, /Max-Age=1200/);
    const again = await fetch(b.base + '/login', { headers: { cookie: 'bb_seen=1' } });
    assert.ok(again.headers.getSetCookie().some((c) => c.startsWith('bb_seen=')), 'renewed on the next page too');
    assert.doesNotMatch(await again.text(), /class="splash"/, 'and not shown while the cookie lasts');
  });

  test('a redirect does not use it up', async () => {
    const b = app.browser();
    const res = await b.get('/games');
    assert.ok(res.location, 'signed out, so /games sends you to log in');
    assert.equal(b.jar.has('bb_seen'), false);
    assert.match((await b.get(res.location)).text, /class="splash"/);
  });

  test('LockBox, by BOOKIEBULLIES.COM, in the header', async () => {
    const page = (await app.browser().get('/login')).text;
    assert.match(page, /<a class="brand" href="\/">.*<span class="brand-name"><span class="brand-word">LockBox<\/span><small class="brand-by">by BOOKIEBULLIES\.COM<\/small><\/span><\/a>/s);
  });
});
