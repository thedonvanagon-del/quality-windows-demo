import assert from 'node:assert/strict';
import fs from 'node:fs';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { checkBadges } from '../src/badges.js';
import { THEMES } from '../src/config.js';
import { ICON, ICONS, NAME_COLORS, nametagsFor, saveNametag } from '../src/nametags.js';
import { ensureOfficial } from '../src/official.js';
import { contrast, customTokens, mix } from '../src/themes.js';
import { bySlug, joinTournament } from '../src/tournaments.js';
import { addBet, addPlayer, clock, event, startApp, visible } from './helpers.js';

const NOW = '2026-11-06T19:00:00.000Z';
const KICKOFF = '2026-11-08T18:00:00.000Z';

// ---- contrast ------------------------------------------------------------------

const css = fs.readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');
const presets = Object.fromEntries([...css.matchAll(/\[data-theme="(\w+)"\][^{]*\{([^}]*)\}/g)]
  .map(([, key, body]) => [key, Object.fromEntries([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(([, k, v]) => [k, v.trim()]))]));
/** The --nc-* shades in every rule with exactly this selector. */
const tokens = (selector) => {
  const blocks = [...css.matchAll(/(?:^|\n)([^\n{}]+?) \{([^}]*)\}/g)].filter(([, sel]) => sel === selector).map(([, , body]) => body).join('');
  return Object.fromEntries([...blocks.matchAll(/--nc-([\w-]+):\s*([^;]+);/g)].map(([, k, v]) => [k, v.trim()]));
};
const darkShades = tokens(':root');
const lightShades = tokens('[data-mode="light"]');
const colors = NAME_COLORS.filter((c) => c.key !== 'default');

/** "rgba(r, g, b, a)" laid over a solid color: what a "me" row's background really is. */
function over(soft, base) {
  const [r, g, b, a] = /rgba\((\d+), (\d+), (\d+), ([\d.]+)\)/.exec(soft).slice(1).map(Number);
  return mix(base, `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`, a);
}

/** Every surface a name sits on: cards, chat and podium rows, tiles (chips), the page, and the lit-up "me" row. */
const surfacesOf = (t) => ({ card: t.card, raised: t.raised, tile: t.tile, bg: t.bg, me: over(t['accent-soft'], t.card) });

function assertNames(look, t, light) {
  for (const c of colors) {
    const shade = light ? lightShades[c.key] : darkShades[c.key];
    for (const [where, surface] of Object.entries(surfacesOf(t))) {
      const ratio = contrast(shade, surface);
      assert.ok(ratio >= 4.5, `${c.key} on ${look} ${where} is ${ratio.toFixed(2)}:1, under 4.5:1`);
    }
  }
}

describe('name colors', () => {
  test('each color is a class with a dark and a light shade in style.css, matching the list', () => {
    assert.ok(colors.length >= 11);
    for (const c of colors) {
      assert.equal(darkShades[c.key], c.dark, `${c.key} dark shade`);
      assert.equal(lightShades[c.key], c.light, `${c.key} light shade`);
      assert.match(css, new RegExp(`\\.name-c-${c.key}, \\.who\\.name-c-${c.key} \\{ color: var\\(--nc-${c.key}\\); \\}`));
    }
  });

  test('every color reads at 4.5:1 on every preset, Light included', () => {
    for (const key of THEMES) assertNames(key, presets[key], key === 'light');
  });

  test('and on team and custom looks, dark or light, whatever the colors', () => {
    const tints = ['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#1d3b8a', '#808080'];
    const accents = ['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#808080', '#e31837', '#041e42'];
    for (const mode of ['dark', 'light']) {
      for (const tint of tints) {
        for (const accent of accents) assertNames(`${mode} ${accent} on ${tint}`, customTokens({ mode, accent, tint }), mode === 'light');
      }
    }
  });
});

// ---- saving and drawing ------------------------------------------------------------

let time;
let app;

beforeEach(async () => {
  time = clock(NOW);
  app = await startApp({ time });
  app.espn.events.nfl.push(event({ id: '1', start: KICKOFF }));
});

afterEach(() => app.close());

async function player(email, name) {
  const b = app.browser();
  await b.join(email, name);
  await b.get('/games');
  return b;
}

const idOf = (name) => app.store.get('SELECT id FROM users WHERE screen_name = ?', name).id;
const saved = (name) => ({ ...app.store.get('SELECT name_color, name_icon FROM users WHERE screen_name = ?', name) });

/** Ann wins a weekly contest the real way: a closed week with her at #1, then the badge check. */
function winAWeek(userId) {
  app.store.run("INSERT INTO contest_weeks (week, closed_at) VALUES ('20261026', ?)", NOW);
  app.store.run("INSERT INTO contest_results (week, place, user_id, units, record) VALUES ('20261026', 1, ?, 9.5, '8-2')", userId);
  checkBadges(app.store, [userId], time.now());
}

describe('saving a name color and icon', () => {
  test('only keys from the lists; earned icons only with their badge', () => {
    const ann = addPlayer(app.store, 'Ann');
    const save = (color, icon) => saveNametag(app.store, { userId: ann, color, icon });

    assert.deepEqual(save('gold', 'bull'), { color: 'gold', icon: 'bull' });
    assert.deepEqual(saved('Ann'), { name_color: 'gold', name_icon: 'bull' });

    for (const bad of ['Gold', 'chartreuse', '#ff0000', 'gold; color: red', '<b>']) assert.equal(save(bad, 'bull').error, 'Pick a color from the list.', bad);
    for (const bad of ['🐂', 'Bull', 'unicorn', 'team', '../x']) assert.equal(save('gold', bad).error, 'Pick an icon from the list.', bad);
    assert.deepEqual(saved('Ann'), { name_color: 'gold', name_icon: 'bull' }, 'a bad pick changes nothing');

    // The crown needs a weekly win.
    assert.equal(save('gold', 'crown').error, 'That icon is locked. Earn it: win a weekly contest.');
    for (const key of ['trophy', 'double_fire', 'gem']) assert.match(save('gold', key).error, /^That icon is locked\. Earn it: /);
    winAWeek(ann);
    assert.deepEqual(save('red', 'crown'), { color: 'red', icon: 'crown' });

    // Default and none clear them.
    assert.deepEqual(save('default', 'none'), { color: null, icon: null });
    assert.deepEqual(saved('Ann'), { name_color: null, name_icon: null });
  });

  test('every earned icon names a real badge', async () => {
    const { BADGE } = await import('../src/badges.js');
    const earned = ICONS.filter((i) => i.badge);
    assert.deepEqual(earned.map((i) => [i.emoji, i.badge]), [['👑', 'weekly_winner'], ['🏆', 'tournament_champion'], ['🔥🔥', 'streak_10'], ['💎', 'bets_100']]);
    for (const i of earned) assert.ok(BADGE[i.badge], i.badge);
    assert.ok(ICONS.length - earned.length >= 25);
  });

  test('the official account keeps its Official tag: it can\'t set either, and stored ones never show', async () => {
    const official = ensureOfficial(app.store, time.now());
    assert.equal(saveNametag(app.store, { userId: official, color: 'gold', icon: 'bull' }).error, 'The official account keeps its Official tag.');
    app.store.run("UPDATE users SET name_color = 'red', name_icon = 'fire' WHERE id = ?", official);
    assert.equal(nametagsFor(app.store, [official]).size, 0);
    const name = app.store.get('SELECT screen_name FROM users WHERE id = ?', official).screen_name;
    addBet(app.store, { userId: official, start: '2026-11-01T18:00:00.000Z' });
    const board = (await app.browser().get('/leaderboard')).text;
    assert.match(board, new RegExp(`<a class="who" href="/u/${name}">${name}</a><span class="official-tag"`));
    assert.doesNotMatch(board, /name-c-red|aria-label="Fire"/);
  });

  test('from the profile: a POST with the form token, no JavaScript needed', async () => {
    const ann = await player('ann@example.com', 'Ann');
    const page = (await ann.get('/u/Ann')).text;
    assert.match(page, /<h2 id="nametag">Your name on the boards<\/h2>/);
    assert.match(page, /<form class="form nametag-form" method="post" action="\/nametag" data-nametag-form>\s*<input type="hidden" name="_csrf"/);
    assert.match(page, /<input type="radio" name="color" value="default" checked>/);
    assert.match(page, /<input type="radio" name="icon" value="none" checked >/);
    // Locked ones are greyed out and disabled, with what earns them.
    assert.match(page, /<label class="icon-opt earned locked" title="Earn it: win a weekly contest"><input type="radio" name="icon" value="crown"  disabled>/);
    assert.match(visible(page), /Crown Earn it: win a weekly contest/);
    // Someone else's profile has no picker.
    await player('bob@example.com', 'Bob');
    assert.doesNotMatch((await ann.get('/u/Bob')).text, /nametag-form/);

    assert.equal((await ann.post('/nametag', { color: 'teal', icon: 'shark' }, { csrf: false })).status, 403);
    assert.deepEqual(saved('Ann'), { name_color: null, name_icon: null });

    const ok = await ann.post('/nametag', { color: 'teal', icon: 'shark' });
    assert.equal(ok.location, '/u/Ann#nametag');
    assert.deepEqual(saved('Ann'), { name_color: 'teal', name_icon: 'shark' });
    const after = (await ann.get('/u/Ann')).text;
    assert.match(visible(after), /Saved\. That's your name on the boards now\./);
    assert.match(after, /<input type="radio" name="color" value="teal" checked>/);
    assert.match(after, /<input type="radio" name="icon" value="shark" checked >/);
    // The header shows it to everyone.
    assert.match((await app.browser().get('/u/Ann')).text, /<h1 class="name-c-teal">Ann<\/h1><span class="name-icon" role="img" aria-label="Shark" title="Shark">🦈<\/span>/);

    // A locked icon is turned away by the server too.
    await ann.post('/nametag', { color: 'teal', icon: 'crown' });
    assert.match(visible((await ann.get('/u/Ann')).text), /That icon is locked\. Earn it: win a weekly contest\./);
    assert.deepEqual(saved('Ann'), { name_color: 'teal', name_icon: 'shark' });
  });
});

describe('where names show', () => {
  /** Ann (gold, crown, a weekly winner), Bob (no choices), each with a graded bet. */
  async function setup() {
    const ann = await player('ann@example.com', 'Ann');
    const bob = await player('bob@example.com', 'Bob');
    for (const id of [idOf('Ann'), idOf('Bob')]) addBet(app.store, { userId: id, start: '2026-11-01T18:00:00.000Z' });
    winAWeek(idOf('Ann'));
    assert.deepEqual(saveNametag(app.store, { userId: idOf('Ann'), color: 'gold', icon: 'crown' }), { color: 'gold', icon: 'crown' });
    return { ann, bob };
  }
  const annTag = /<a class="who name-c-gold" href="\/u\/Ann">Ann<\/a><span class="name-icon" role="img" aria-label="Crown" title="Crown">👑<\/span>/;

  test('the leaderboard, search and the home page board', async () => {
    const { bob } = await setup();
    const board = (await bob.get('/leaderboard')).text;
    assert.match(board, annTag);
    assert.match(board, /<a class="who" href="\/u\/Bob">Bob<\/a>/, 'no choices, no change');
    assert.match((await bob.get('/search?q=an')).text, annTag);
    assert.match((await app.browser().get('/')).text, annTag);
  });

  test('tournament standings', async () => {
    const { ann } = await setup();
    app.store.run(
      `INSERT INTO tournaments (slug, name, sports, starts_at, ends_at, min_bets, prize, kind, created_at)
       VALUES ('test-cup', 'Test Cup', NULL, '2026-10-31T00:00:00.000Z', '2026-11-10T00:00:00.000Z', 1, '', 'custom', ?)`, NOW,
    );
    const t = bySlug(app.store, 'test-cup');
    joinTournament(app.store, t, idOf('Ann'), new Date('2026-10-31T01:00:00.000Z'));
    const page = (await ann.get('/tournaments/test-cup')).text;
    assert.match(page, /<span class="tn-who"><span class="pname"><a class="who name-c-gold" href="\/u\/Ann">Ann<\/a><span class="name-icon" role="img" aria-label="Crown"/);
  });

  test('chat, group boards, members and feeds', async () => {
    const { ann, bob } = await setup();
    await ann.get('/groups');
    await ann.post('/groups', { name: 'Sunday Squad', sport: '' });
    await bob.get('/groups');
    await bob.post('/groups/join', { code: app.store.get('SELECT invite_code FROM friend_groups').invite_code });
    await ann.get('/groups/1');
    await ann.post('/groups/1/chat', { body: 'Hello' });
    const page = (await bob.get('/groups/1')).text;
    assert.match(page, new RegExp(`<span class="avatar xs">A</span><span class="pname">${annTag.source}</span>`), 'chat author');
    assert.match(page, new RegExp(`<span class="player"><span class="avatar">A</span><span class="pname">${annTag.source}</span></span><span class="muted small">Owner`), 'members');
    assert.ok(page.match(new RegExp(annTag.source, 'g')).length >= 3, 'board, chat and members');

    // Game chat too.
    await ann.get('/games/nfl:1');
    await ann.post('/games/nfl:1/chat', { body: 'Chiefs by 10' });
    assert.match((await bob.get('/games/nfl:1')).text, new RegExp(`<div class="msg-head">\\s*<span class="avatar xs">A</span><span class="pname">${annTag.source}</span>`));

    // The Following page.
    await bob.post('/u/Ann/follow');
    assert.match((await bob.get('/following')).text, /<span class="name-c-gold">Ann<\/span><span class="name-icon" role="img" aria-label="Crown"/);
  });

  test('an earned icon whose badge is gone draws nothing; an unknown key draws nothing', async () => {
    const { ann, bob } = await setup();
    app.store.run("DELETE FROM badges WHERE key = 'weekly_winner'");
    const board = (await bob.get('/leaderboard')).text;
    assert.match(board, /<a class="who name-c-gold" href="\/u\/Ann">Ann<\/a>(?!<span class="name-icon")/);
    assert.doesNotMatch(board, /aria-label="Crown"/);
    // Her picker shows no icon picked, and the crown locked again.
    const mine = (await ann.get('/u/Ann')).text;
    assert.match(mine, /<input type="radio" name="icon" value="none" checked >/);
    assert.match(mine, /value="crown"  disabled>/);

    app.store.run("UPDATE users SET name_color = 'mauve', name_icon = 'unicorn' WHERE screen_name = 'Ann'");
    const again = (await bob.get('/leaderboard')).text;
    assert.match(again, /<a class="who" href="\/u\/Ann">Ann<\/a>/);
    assert.doesNotMatch(again, /name-c-mauve|unicorn/);
  });

  test('the light page gets the light shades', async () => {
    const { bob } = await setup();
    await bob.get('/u/Bob');
    await bob.post('/theme', { theme: 'light' });
    assert.match((await bob.get('/leaderboard')).text, /<html lang="en" data-theme="light" data-mode="light">/);
    await bob.post('/theme', { theme: 'custom', accent: '#22aa88', tint: '#331144', mode: 'light' });
    assert.match((await bob.get('/leaderboard')).text, /<html lang="en" data-theme="custom" data-mode="light">/);
    assert.equal(ICON.crown.emoji, '👑');
  });
});
