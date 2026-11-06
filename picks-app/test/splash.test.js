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
    assert.match(first.text, /<div class="splash"[^>]*data-splash>.*<b class="splash-name">LockBox Picks<\/b><span class="splash-by">by BOOKIEBULLIES\.COM<\/span><span class="splash-motto">Made to show the true skill of real handicappers with nothing to hide\.<\/span><\/div>/s);
    assert.equal(b.jar.get('bb_splash'), '1', 'a session cookie, so it shows once per visit');
    const second = await b.get('/login');
    assert.doesNotMatch(second.text, /class="splash"/);
  });

  test('a redirect does not use it up', async () => {
    const b = app.browser();
    const res = await b.get('/games');
    assert.ok(res.location, 'signed out, so /games sends you to log in');
    assert.equal(b.jar.has('bb_splash'), false);
    assert.match((await b.get(res.location)).text, /class="splash"/);
  });

  test('LockBox Picks, by BOOKIEBULLIES.COM, in the header', async () => {
    const page = (await app.browser().get('/login')).text;
    assert.match(page, /<a class="brand" href="\/">.*<span class="brand-name"><span class="brand-word">LockBox Picks<\/span><small class="brand-by">by BOOKIEBULLIES\.COM<\/small><\/span><\/a>/s);
  });
});
