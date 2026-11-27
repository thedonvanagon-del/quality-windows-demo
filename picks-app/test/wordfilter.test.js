import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { cleanMessage } from '../src/chat.js';
import { createGroup } from '../src/groups.js';
import { createLeague } from '../src/leagues.js';
import { cleanLink } from '../src/links.js';
import { cleanTournamentName } from '../src/tournaments.js';
import { CHAT_REFUSED, filterChat, hasBadLanguage, maskProfanity, NAME_REFUSED, readings, scan } from '../src/wordfilter.js';
import { clock, event, startApp, visible } from './helpers.js';

// The words the tests lean on most.
const F = 'fu' + 'ck';
const S = 'sh' + 'it';
const N = 'nig' + 'ger';

describe('the word filter', () => {
  test('masks strong profanity after its first letter', () => {
    assert.equal(maskProfanity(`what the ${F}`), 'what the f***');
    assert.equal(maskProfanity(`${S} call, ref`), 's*** call, ref');
    assert.equal(maskProfanity(`mother${F}ing refs`), 'm************ refs');
    assert.equal(maskProfanity('son of a bitch'), 'son of a b****');
    assert.equal(maskProfanity(`Holy ${S}!!!`), 'Holy s***!!!', 'the exclamation marks stay');
    assert.equal(maskProfanity(`Big${S.replace('s', 'S')}Guy`), 'BigS***Guy', 'camelCase parts');
    assert.equal(maskProfanity(`${S}s and giggles`), 's**** and giggles', 'a plural');
    assert.equal(maskProfanity('Bills cover easy'), 'Bills cover easy');
  });

  test('sees through simple disguises', () => {
    const caught = [
      F.toUpperCase(), 'FUUUUUCK', 'fuuuuuck', 'sh1t', 'sh!t', '$hit', '5hit', 'f@ggot', 'b1tch', 'f\u00fcck', '\uff46\uff55\uff43\uff4b', // an umlaut, full-width letters
      'fu\u200bck', 'fu\u2060ck', 'f\u00adu\u00adc\u00adk', 'fu\u0441k', // zero-width space, word joiner, soft hyphens, a Cyrillic es
      'f u c k', 'f.u.c.k', 'f-u-c-k', 'f_u_c_k', 'F . U . C . K', 'n i g g e r', 'c.u.n.t',
      'xX' + F + 'Xx', 'big' + F + 'guy', 'n1gg3r', 'n1gga', 'shiiiiit', 'cuuuunt',
    ];
    for (const text of caught) assert.ok(hasBadLanguage(text), `${JSON.stringify(text)} gets caught`);
    assert.equal(maskProfanity('f u c k this ref'), 'f * * * this ref');
    assert.equal(maskProfanity('f.u.c.k'), 'f.*.*.*');
    assert.ok(readings('sh1t').includes('shit'));
    assert.ok(readings('fai1').includes('fail') && readings('fai1').includes('faii'), '1 reads as l and as i');
  });

  test('refuses slurs, whatever the disguise', () => {
    for (const text of [N, `${N}s`, 'n1gga', 'faggots', 'f4g', 'tranny', 'trannies', 'that call was retarded', 'k1ke', 'sp1c', 'wetback']) {
      assert.ok(scan(text).slur, `${JSON.stringify(text)} is a slur`);
      assert.deepEqual(filterChat(text), { error: CHAT_REFUSED });
    }
    assert.equal(scan(`${F} off`).slur, false, 'profanity is not a slur');
  });

  test('leaves ordinary words, places, teams and players alone', () => {
    const fine = [
      'Scunthorpe United', 'class act', 'great assist', 'Dickinson State', 'Cockburn', 'shitake risotto', 'Sussex', 'Middlesex',
      'therapist', 'Hancock', 'cocktail', 'passed', 'bass fishing', 'Matsushita', 'Go Gamecocks', 'Go Cocks!', 'South Carolina Gamecocks',
      "Dick's Sporting Goods", 'Dick Vitale', 'Dick Van Dyke', 'Eric Dickerson', 'Kiké Hernández', 'Kike Hernandez homered',
      'spic and span', 'a chink in the armor', 'Niger', 'Nigeria', 'Negro Leagues', 'Coon Rapids', 'Fukuoka', 'Fukushima',
      'he sniggered', 'niggardly', 'fire retardant', 'Penistone', 'Arsenal', 'Essex', 'Spices', 'Japan', 'Pakistan', 'Hokies',
      'Shittu', 'Cumming, GA', 'Peter Fuchs', 'Analysis', 'Titusville', 'Lake Placid', 'Horned Frogs', 'Beavers', 'Butts County',
      'damn', 'hell yeah', 'this crap', 'the refs suck', 'kick ass', 'pissed', 'bastards', 'the 49ers -3.5', '3 HRs and 4 RBIs',
      'I c u', 'U.S.A.', 'W 5-3', 'B1G', 'Pac-12', '1st and 10', 'over 47.5', '+150', 'f*ck', 'LeBron', 'DeVonta Smith',
    ];
    for (const text of fine) {
      assert.equal(hasBadLanguage(text), false, `${JSON.stringify(text)} is fine`);
      assert.deepEqual(filterChat(text), { body: text });
    }
  });

  test('a mild word is fine; a strong one is masked; a slur refuses the message', () => {
    assert.deepEqual(filterChat('damn, the refs suck'), { body: 'damn, the refs suck' });
    assert.deepEqual(filterChat(`${F} the refs`), { body: 'f*** the refs' });
    assert.deepEqual(filterChat(`${F} you ${N}`), { error: CHAT_REFUSED });
  });

  test('chat messages go through it', () => {
    assert.deepEqual(cleanMessage(`  this ref is ${S}  `), { body: 'this ref is s***' });
    assert.deepEqual(cleanMessage(`you ${N}`), { error: CHAT_REFUSED });
  });

  test('names, labels and tournament or league names refuse profanity too', () => {
    assert.deepEqual(cleanTournamentName(`${F} Sundays`), { error: NAME_REFUSED });
    assert.deepEqual(cleanTournamentName('Gamecocks Classic'), { name: 'Gamecocks Classic' });
    assert.deepEqual(createLeague(null, { name: `B1tch Slap League` }), { error: NAME_REFUSED }, 'league names');
    assert.deepEqual(createGroup(null, { name: `${S} Talkers`, sport: '' }), { error: NAME_REFUSED }, 'group and Chat Room names');
    assert.match(cleanLink('https://t.me/x', `${S} picks`).error, /language that isn't allowed/);
    assert.equal(cleanLink('https://t.me/x', 'Get my picks').label, 'Get my picks');
  });
});

// Sunday 8am Eastern; Bills at Chiefs kicks off at 1pm.
const MORNING = '2026-10-25T12:00:00.000Z';
const KICKOFF = '2026-10-25T17:00:00.000Z';
const NATIVE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 LockBoxApp';

describe('the filter in the app', () => {
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
    return b;
  }

  const bodies = () => app.store.all('SELECT body FROM chat_messages ORDER BY id').map((m) => m.body);

  test('game and group chat mask profanity and refuse slurs', async () => {
    const ann = await player('ann@example.com', 'Ann');
    const page = '/games/nfl%3A1';
    await ann.get(page);
    await ann.post(`${page}/chat`, { body: `Chiefs are ${S}` });
    await ann.post(`${page}/chat`, { body: `you ${N}` });
    let seen = visible((await ann.get(page)).text);
    assert.match(seen, /That message has language that isn't allowed here\./);
    assert.match(seen, /Chiefs are s\*\*\*/);
    assert.match(seen, /A filter masks strong profanity and blocks slurs\./, 'the chat rules say so');
    assert.deepEqual(bodies(), ['Chiefs are s***']);

    await ann.get('/groups');
    await ann.post('/groups', { name: 'Sunday Squad', sport: '' });
    await ann.get('/groups/1');
    await ann.post('/groups/1/chat', { body: `F U C K the Bills` });
    await ann.post('/groups/1/chat', { body: 'f a g g o t' });
    seen = visible((await ann.get('/groups/1')).text);
    assert.match(seen, /isn't allowed here/);
    assert.deepEqual(bodies(), ['Chiefs are s***', 'F * * * the Bills']);
  });

  test('screen names, real names, bios, link labels and group names refuse it', async () => {
    const b = app.browser();
    await b.post('/signup', { email: 'cat@example.com', password: 'correct horse', adult: 'on', terms: 'on' });
    await b.get('/welcome');
    assert.match(visible((await b.post('/welcome', { screen_name: `Big_${S}_Guy` })).text), /Pick a different name\. That one has language that isn't allowed\./);
    assert.match(visible((await b.post('/welcome', { screen_name: 'xXf4ggotXx' })).text), /Pick a different name/);
    assert.match(visible((await b.post('/welcome', { screen_name: 'Cat', first_name: F })).text), /Pick a different name/);
    assert.equal((await b.post('/welcome', { screen_name: 'GamecocksFan', last_name: 'Hancock' })).status, 303, 'ordinary names go through');

    const ann = await player('ann@example.com', 'Ann');
    await ann.get('/u/Ann');
    app.store.run("UPDATE users SET name_changed_at = NULL WHERE screen_name = 'Ann'");
    await ann.post('/screen-name', { screen_name: `${F}_this` });
    assert.match(visible((await ann.get('/u/Ann')).text), /Pick a different name/);
    assert.ok(app.store.get("SELECT 1 AS x FROM users WHERE screen_name = 'Ann'"), 'still Ann');

    await ann.post('/bio', { bio: `Fade these ${S} cappers` });
    assert.match(visible((await ann.get('/u/Ann')).text), /Your bio has language that isn't allowed/);
    await ann.post('/bio', { bio: 'Big Ten unders. Go Gamecocks.' });
    assert.match(visible((await ann.get('/u/Ann')).text), /Bio saved\./);

    await ann.post('/link', { link_url: 't.me/ann', link_label: `${F}ing locks` });
    assert.match(visible((await ann.get('/u/Ann')).text), /Pick a different label/);
    assert.equal(app.store.get("SELECT link_url FROM users WHERE screen_name = 'Ann'").link_url, null);

    await ann.get('/groups');
    assert.match(visible((await ann.post('/groups', { name: `${N} crew`, sport: '' })).text), /Pick a different name/);
    assert.equal(app.store.get('SELECT COUNT(*) AS n FROM friend_groups').n, 0);
  });
});
