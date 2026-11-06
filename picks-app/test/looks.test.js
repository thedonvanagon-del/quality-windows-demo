import assert from 'node:assert/strict';
import fs from 'node:fs';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { THEMES } from '../src/config.js';
import { ACCENT_MIN, cleanHex, contrast, customTokens, inkOn, parseSheet, PRESET_BAR, PRESETS, sheetPath, surfaces, teamAccent, themeCss } from '../src/themes.js';
import { clock, event, startApp, visible } from './helpers.js';

const MORNING = '2026-10-25T12:00:00.000Z';
const KICKOFF = '2026-10-25T17:00:00.000Z';

// Every preset's tokens, read from the stylesheet the page uses.
const css = fs.readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');
const presets = Object.fromEntries([...css.matchAll(/\[data-theme="(\w+)"\][^{]*\{([^}]*)\}/g)]
  .map(([, key, body]) => [key, Object.fromEntries([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(([, k, v]) => [k, v.trim()]))]));

/** The contrast every look has to keep: text, tiles, odds, buttons, wins, losses and the gold marks. */
function assertReadable(name, t) {
  const checks = [
    ['ink', 'bg', 7], ['ink', 'card', 7], ['ink', 'tile', 7], ['ink', 'tile-hover', 4.5],
    ['muted', 'card', 4.5], ['muted', 'raised', 4.5], ['faint', 'card', 3],
    ['accent', 'tile', ACCENT_MIN], ['accent', 'card', ACCENT_MIN], ['accent-ink', 'accent', 4.5],
    ['win', 'card', 3], ['loss', 'card', 3], ['win', 'tile', 3], ['loss', 'tile', 3],
    ['gold', 'card', 3], ['gold-ink', 'gold', 4.5],
  ];
  for (const [fg, bg, min] of checks) {
    const ratio = contrast(t[fg], t[bg]);
    assert.ok(ratio >= min, `${name}: --${fg} on --${bg} is ${ratio.toFixed(2)}:1, under ${min}:1`);
  }
}

const TOKENS = ['bg', 'bar', 'card', 'raised', 'tile', 'tile-hover', 'line', 'ink', 'muted', 'faint', 'accent', 'accent-ink', 'accent-soft', 'win', 'win-soft', 'loss', 'loss-soft', 'push', 'live', 'gold', 'gold-ink'];

describe('presets', () => {
  test('every preset is a complete, readable token set, light mode included', () => {
    assert.deepEqual(Object.keys(PRESETS), THEMES);
    assert.ok(THEMES.length >= 8 && THEMES.includes('light'));
    for (const key of THEMES) {
      const t = presets[key];
      assert.ok(t, `${key} has a block in style.css`);
      assert.deepEqual(TOKENS.filter((k) => !t[k]), [], `${key} sets every token`);
      assertReadable(key, t);
      // The swatches, banners and the browser bar use the same colors as the stylesheet.
      assert.equal(PRESETS[key].accent, t.accent, `${key} accent`);
      assert.equal(PRESET_BAR[key], t.bar, `${key} bar`);
    }
    assert.match(css, /\[data-theme="light"\]\s*\{[^}]*color-scheme: light/);
  });
});

describe('colors', () => {
  test('only #rrggbb gets through', () => {
    assert.equal(cleanHex('#FF8800'), '#ff8800');
    assert.equal(cleanHex(' ff8800 '), '#ff8800');
    for (const bad of ['', null, 'red', '#fff', '#ff88001', '#ff880g', 'url(x)', '#ff8800;}', '#ff8800 !important', 'rgb(1,2,3)', '</style>']) {
      assert.equal(cleanHex(bad), null, String(bad));
    }
  });

  test('text on the accent is black or white, whichever reads', () => {
    assert.equal(inkOn('#ffb020'), '#000000');
    assert.equal(inkOn('#fde68a'), '#000000');
    assert.equal(inkOn('#1d4ed8'), '#ffffff');
    assert.equal(inkOn('#7c2d12'), '#ffffff');
  });

  test('a team color too dark for the dark page uses the alternate, or gets lighter', () => {
    const navy = '#041e42';
    const tile = surfaces('dark', navy).tile;
    assert.ok(contrast(navy, tile) < ACCENT_MIN, 'navy really is too dark');
    assert.deepEqual(teamAccent({ primary: navy, alternate: '#a5acaf' }, 'dark'), { accent: '#a5acaf', how: 'alternate' });
    const lighter = teamAccent({ primary: navy, alternate: '#000000' }, 'dark');
    assert.equal(lighter.how, 'lightened');
    assert.ok(contrast(lighter.accent, tile) >= ACCENT_MIN);
    assert.ok(contrast(lighter.accent, tile) < ACCENT_MIN + 1, 'only as much lighter as it needs');
    // A color that already reads is left alone.
    assert.deepEqual(teamAccent({ primary: '#e31837', alternate: '#ffb81c' }, 'dark'), { accent: '#e31837', how: null });
  });

  test('a team color too light for the light page uses the alternate, or gets darker', () => {
    const gold = '#ffb612';
    const tile = surfaces('light', gold).tile;
    assert.ok(contrast(gold, tile) < ACCENT_MIN, 'gold really is too light');
    assert.deepEqual(teamAccent({ primary: gold, alternate: '#101820' }, 'light'), { accent: '#101820', how: 'alternate' });
    const darker = teamAccent({ primary: gold }, 'light');
    assert.equal(darker.how, 'darkened');
    assert.ok(contrast(darker.accent, tile) >= ACCENT_MIN);
    assert.ok(contrast(customTokens({ mode: 'light', accent: darker.accent, tint: gold })['accent-ink'], darker.accent) >= 4.5);
  });

  test('any two colors make a readable look, on either background', () => {
    for (const mode of ['dark', 'light']) {
      for (const accent of ['#000000', '#ffffff', '#041e42', '#ffb612', '#ff0000', '#00ff00', '#808080']) {
        for (const tint of ['#000000', '#ffffff', '#ff0000', '#1d3b8a', '#ffff00']) {
          assertReadable(`${mode} ${accent} on ${tint}`, customTokens({ mode, accent, tint }));
        }
      }
    }
  });

  test('stylesheet names hold exactly the colors and nothing else', () => {
    const style = { mode: 'dark', accent: '#ff8800', tint: '#102030' };
    assert.equal(sheetPath(style), '/theme/t1-d-ff8800-102030.css');
    assert.deepEqual(parseSheet('t1-d-ff8800-102030.css'), { ...style, preview: false });
    assert.deepEqual(parseSheet('t1-l-ff8800-102030-preview.css'), { ...style, mode: 'light', preview: true });
    for (const bad of ['t1-d-FF8800-102030.css', 't1-d-ff8800-10203.css', 't1-x-ff8800-102030.css', 't1-d-ff8800-102030.css;}', '../style.css', 't1-d-ff8800-102030.css.map', 't2-d-ff8800-102030.css']) {
      assert.equal(parseSheet(bad), null, bad);
    }
    const body = themeCss(style);
    assert.match(body, /^:root\[data-theme="custom"\], \[data-theme="custom"\] \{\n/);
    assert.match(body, /--accent: #ff8800;/);
    // One rule: hex colors, rgba() and the color scheme. No url(), no @import, no second rule.
    const lines = body.trim().split('\n').slice(1, -1);
    for (const line of lines) assert.match(line, /^ {2}(--[a-z-]+: (#[0-9a-f]{6}|rgba\(\d{1,3}, \d{1,3}, \d{1,3}, 0\.\d+\))|color-scheme: (dark|light));$/, line);
    assert.equal(body.match(/[{}]/g).length, 2);
  });
});

describe('looks in the app', () => {
  let time;
  let app;

  beforeEach(async () => {
    time = clock(MORNING);
    app = await startApp({ time });
    // A navy home team with a gray second color, and a gold road team.
    const e = event({ id: '1', start: KICKOFF, home: ['Navies', 'NAV'], away: ['Golds', 'GLD'] });
    Object.assign(e.competitions[0].competitors[0].team, { color: '041E42', alternateColor: 'a5acaf', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/nav.png' });
    Object.assign(e.competitions[0].competitors[1].team, { color: 'ffb612', alternateColor: '101820' });
    app.espn.events.nfl.push(e);
  });

  afterEach(() => app.close());

  async function player(email, name) {
    const b = app.browser();
    await b.join(email, name);
    await b.get('/games');
    return b;
  }

  const row = (name) => ({ ...app.store.get('SELECT theme, theme_team, theme_mode, theme_accent, theme_tint FROM users WHERE screen_name = ?', name) });

  test('ESPN\'s second team color is kept with the game', async () => {
    await player('ann@example.com', 'Ann');
    const g = { ...app.store.get('SELECT home_color, home_alt_color, away_color, away_alt_color FROM games') };
    assert.deepEqual(g, { home_color: '#041e42', home_alt_color: '#a5acaf', away_color: '#ffb612', away_alt_color: '#101820' });
  });

  test('each preset saves and colors every page', async () => {
    const ann = await player('ann@example.com', 'Ann');
    for (const key of THEMES) {
      await ann.get('/u/Ann');
      assert.equal((await ann.post('/theme', { theme: key })).location, '/u/Ann');
      const page = (await ann.get('/games')).text;
      assert.match(page, new RegExp(`<html lang="en" data-theme="${key}">`));
      assert.match(page, new RegExp(`<meta name="theme-color" content="${PRESET_BAR[key]}">`));
      assert.doesNotMatch(page, /\/theme\/t1-/, 'presets need no extra stylesheet');
    }
  });

  test('match my team: sport, then team, readable, with a badge and banner on the profile', async () => {
    const ann = await player('ann@example.com', 'Ann');
    const mine = (await ann.get('/u/Ann')).text;
    assert.match(mine, /<optgroup label="NFL" data-sport="nfl">/);
    assert.match(mine, /<option value="nfl:NAV" data-dark="\/theme\/t1-d-a5acaf-041e42-preview\.css"/);

    const saved = await ann.post('/theme', { theme: 'team', team: 'nfl:NAV', mode: 'dark' });
    assert.equal(saved.location, '/u/Ann#color');
    assert.deepEqual(row('Ann'), { theme: 'custom', theme_team: 'nfl:NAV', theme_mode: 'dark', theme_accent: '#a5acaf', theme_tint: '#041e42' });
    const page = await ann.get('/u/Ann');
    assert.match(visible(page.text), /Navies colors are on\. Their main color is hard to read here, so the accent is their other one\./);
    assert.match(page.text, /<html lang="en" data-theme="custom">/);
    assert.match(page.text, /<link rel="stylesheet" href="\/theme\/t1-d-a5acaf-041e42\.css">/);

    // Anyone looking at Ann sees the team's colors in her banner and its logo by her name.
    const seen = (await app.browser().get('/u/Ann')).text;
    assert.match(seen, /<svg class="banner"[^>]*>\s*<rect width="400" height="100" fill="#a5acaf"><\/rect>\s*<polygon points="[^"]+" fill="#041e42">/);
    assert.match(seen, /class="team-badge" title="Navies fan"><span class="logo"[^>]*>NAV<img src="https:\/\/a\.espncdn\.com\/i\/teamlogos\/nfl\/500\/nav\.png"/);

    // A light team on the light background gets its dark second color.
    await ann.post('/theme', { theme: 'team', team: 'nfl:GLD', mode: 'light' });
    assert.deepEqual(row('Ann'), { theme: 'custom', theme_team: 'nfl:GLD', theme_mode: 'light', theme_accent: '#101820', theme_tint: '#ffb612' });

    // A team that isn't on the board changes nothing.
    await ann.get('/u/Ann');
    assert.equal((await ann.post('/theme', { theme: 'team', team: 'nfl:ZZZ' })).location, '/u/Ann#color');
    assert.match(visible((await ann.get('/u/Ann')).text), /Pick a team from the list/);
    assert.equal(row('Ann').theme_team, 'nfl:GLD');

    // Back to a preset: the badge goes.
    await ann.post('/theme', { theme: 'ice' });
    assert.equal(row('Ann').theme, 'ice');
    assert.doesNotMatch((await app.browser().get('/u/Ann')).text, /team-badge/);
  });

  test('custom colors: bad ones are turned away, dark ones lightened', async () => {
    const ann = await player('ann@example.com', 'Ann');
    await ann.get('/u/Ann');
    for (const accent of ['red', 'url(x)', '#ff8800;}body{display:none', '#fff']) {
      await ann.post('/theme', { theme: 'custom', accent, tint: '#102030' });
      assert.match(visible((await ann.get('/u/Ann')).text), /Pick both colors with the color boxes/);
    }
    assert.equal(row('Ann').theme, null, 'nothing saved');

    await ann.post('/theme', { theme: 'custom', accent: '#22AA88', tint: '#331144', mode: 'dark' });
    assert.deepEqual(row('Ann'), { theme: 'custom', theme_team: null, theme_mode: 'dark', theme_accent: '#22aa88', theme_tint: '#331144' });
    assert.match((await ann.get('/games')).text, /href="\/theme\/t1-d-22aa88-331144\.css"/);

    await ann.get('/u/Ann');
    await ann.post('/theme', { theme: 'custom', accent: '#000000', tint: '#000000', mode: 'dark' });
    const { theme_accent: accent } = row('Ann');
    assert.notEqual(accent, '#000000');
    assert.ok(contrast(accent, surfaces('dark', '#000000').tile) >= ACCENT_MIN);
    assert.match(visible((await ann.get('/u/Ann')).text), /The accent is a shade lighter so it's easy to read/);
  });

  test('the stylesheet: colors in, hex out, cached for good', async () => {
    const res = await fetch(`${app.base}/theme/t1-d-22aa88-331144.css`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'text/css; charset=utf-8');
    assert.equal(res.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    const etag = res.headers.get('etag');
    assert.match(etag, /^"[0-9a-f]{16}"$/);
    const body = await res.text();
    assert.equal(body, themeCss({ mode: 'dark', accent: '#22aa88', tint: '#331144' }));
    assert.match(body, /--accent: #22aa88;/);
    assert.equal((await fetch(`${app.base}/theme/t1-d-22aa88-331144.css`, { headers: { 'if-none-match': etag } })).status, 304);

    // A dark accent comes back readable even when asked for directly.
    const dark = await (await fetch(`${app.base}/theme/t1-d-041e42-041e42.css`)).text();
    assert.doesNotMatch(dark, /--accent: #041e42;/);
    // The sample card's copy colors only the sample.
    assert.match(await (await fetch(`${app.base}/theme/t1-l-22aa88-331144-preview.css`)).text(), /^\[data-theme="preview"\] \{/);

    for (const bad of ['t1-d-22AA88-331144.css', 't1-d-22aa88-33114.css', 't1-d-22aa88-331144.css%3B%7Dbody%7B', 't1-d-22aa88-331144.css%0A%7D', '..%2Fstatic%2Fstyle.css', 't1-d-zzzzzz-331144.css']) {
      const r = await fetch(`${app.base}/theme/${bad}`);
      assert.equal(r.status, 404, bad);
      assert.match(r.headers.get('content-type'), /text\/html/);
    }
  });
});
