// Prize tournaments: admin-only, the lawyer-review publishing gate, the
// official rules page, "I've read the official rules" on Join, still free
// (the CHECK), and the winner with "Mark prize sent".

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { prizeOf } from '../src/prizes.js';
import { etToUtc } from '../src/time.js';
import { bySlug, closeDueTournaments, createCustom, joinTournament } from '../src/tournaments.js';
import { addBet, clock, startApp, visible } from './helpers.js';

// Friday Nov 6, 2026, 2:00 PM Eastern.
const NOW = '2026-11-06T19:00:00.000Z';
const et = (day, hour, minute = 0) => etToUtc(day, hour, minute).toISOString();

let time;
let app;
let boss;
let ann;

beforeEach(async () => {
  time = clock(NOW);
  app = await startApp({ time, config: { adminEmails: ['boss@example.com'] } });
  boss = app.browser();
  await boss.join('boss@example.com', 'Boss');
  ann = app.browser();
  await ann.join('ann@example.com', 'Ann');
  ann.id = app.store.get("SELECT id FROM users WHERE screen_name = 'Ann'").id;
});

afterEach(() => app.close());

const PRIZE = { prize: 'A bag of Buddha Beans coffee', value: '25', sponsor: 'Buddha Beans Coffee Co.', eligibility: '', delivery: 'Shipped by the Sponsor to a US address within 30 days of the close.' };

/** An admin's custom tournament on Saturday, Nov 7. */
function custom(name = 'Coffee Cup') {
  const made = createCustom(app.store, {
    name, sports: ['nba'], startDate: '2026-11-07', startTime: '12:00', endDate: '2026-11-07', endTime: '23:59', minBets: '1', prize: '',
    userId: app.store.get("SELECT id FROM users WHERE screen_name = 'Boss'").id, now: time.now(),
  });
  return bySlug(app.store, made.slug);
}

async function makePrize(t) {
  await boss.get(`/admin/tournaments/${t.slug}/prize`);
  return boss.post(`/admin/tournaments/${t.slug}/prize`, PRIZE);
}

describe('prize tournaments', () => {
  test('only admins can make one; players get a 404 on every admin page', async () => {
    const t = custom();
    assert.equal((await ann.get(`/admin/tournaments/${t.slug}/prize`)).status, 404);
    assert.equal((await ann.post(`/admin/tournaments/${t.slug}/prize`, PRIZE)).status, 404);
    assert.equal((await ann.post(`/admin/tournaments/${t.slug}/prize/review`, { reviewed: '1' })).status, 404);
    assert.equal((await ann.post(`/admin/tournaments/${t.slug}/prize/publish`, {})).status, 404);
    assert.equal(prizeOf(app.store, t), null);
    const admin = visible((await boss.get('/admin/tournaments')).text);
    assert.match(admin, /Coffee Cup .* Make it a prize tournament/);
    const made = await makePrize(t);
    assert.equal(made.status, 303);
    const prize = prizeOf(app.store, t);
    assert.deepEqual([prize.prize, prize.value_cents, prize.sponsor, prize.eligibility], ['A bag of Buddha Beans coffee', 2500, 'Buddha Beans Coffee Co.', 'US residents 21+, void where prohibited']);
    // Not for the timer's or a player's tournaments.
    const page = await boss.post(`/admin/tournaments/${t.slug}/prize`, { ...PRIZE, value: 'lots' });
    assert.equal(page.status, 400);
    assert.match(visible(page.text), /Give the prize value in dollars/);
  });

  test('the publishing gate: hidden from players until a lawyer review is recorded and an admin publishes', async () => {
    const t = custom();
    await makePrize(t);
    // Draft: players can't see it anywhere.
    assert.equal((await ann.get(`/tournaments/${t.slug}`)).status, 404);
    assert.equal((await ann.get(`/tournaments/${t.slug}/rules`)).status, 404);
    assert.doesNotMatch(visible((await ann.get('/tournaments')).text), /Coffee Cup/);
    assert.match(joinTournament(app.store, bySlug(app.store, t.slug), ann.id, time.now(), { rulesAccepted: true }).error, /isn't open yet/);
    // Admins see it, marked as a draft.
    assert.match(visible((await boss.get('/tournaments')).text), /Coffee Cup Free Prize Draft/);
    assert.match(visible((await boss.get(`/tournaments/${t.slug}`)).text), /Draft prize tournament: only admins can see it/);

    // Publish before the review: refused.
    await boss.get(`/admin/tournaments/${t.slug}/prize`);
    await boss.post(`/admin/tournaments/${t.slug}/prize/publish`, {});
    assert.equal(prizeOf(app.store, t).published_at, null);
    assert.match(visible((await boss.get(`/admin/tournaments/${t.slug}/prize`)).text), /Record the lawyer review of the rules first\./);

    // The review records who and when.
    time.advance(60_000);
    await boss.post(`/admin/tournaments/${t.slug}/prize/review`, { reviewed: '1' });
    let prize = prizeOf(app.store, t);
    assert.equal(prize.reviewed_by, app.store.get("SELECT id FROM users WHERE screen_name = 'Boss'").id);
    assert.equal(prize.reviewed_at, time.now().toISOString());
    assert.match(visible((await boss.get(`/admin/tournaments/${t.slug}/prize`)).text), /A lawyer has reviewed these rules Recorded by Boss/);
    // Changing the prize clears the review: the rules changed.
    await boss.post(`/admin/tournaments/${t.slug}/prize`, { ...PRIZE, value: '30' });
    assert.equal(prizeOf(app.store, t).reviewed_at, null);
    await boss.get(`/admin/tournaments/${t.slug}/prize`);
    await boss.post(`/admin/tournaments/${t.slug}/prize/review`, { reviewed: '1' });
    await boss.post(`/admin/tournaments/${t.slug}/prize/publish`, {});
    prize = prizeOf(app.store, t);
    assert.ok(prize.published_at);
    // Published: players see it, with the gold chip, the prize and the rules link.
    const hub = visible((await ann.get('/tournaments')).text);
    assert.match(hub, /Coffee Cup Free Prize .* A bag of Buddha Beans coffee \(about \$30, from Buddha Beans Coffee Co\.\) Official rules/);
    assert.equal((await ann.get(`/tournaments/${t.slug}`)).status, 200);
    // Published rules don't change.
    await boss.get(`/admin/tournaments/${t.slug}/prize`);
    const late = await boss.post(`/admin/tournaments/${t.slug}/prize`, { ...PRIZE, value: '5' });
    assert.match(visible(late.text), /It's published, so the prize and rules can't change\./);
  });

  test('the official rules page: the template filled in, and a banner only admins see', async () => {
    const t = custom();
    await makePrize(t);
    await boss.post(`/admin/tournaments/${t.slug}/prize/review`, { reviewed: '1' });
    await boss.post(`/admin/tournaments/${t.slug}/prize/publish`, {});
    const mine = visible((await boss.get(`/tournaments/${t.slug}/rules`)).text);
    assert.match(mine, /Draft rules: have a lawyer review before running this tournament\. Only admins see this banner\./);
    const page = await ann.get(`/tournaments/${t.slug}/rules`);
    assert.equal(page.status, 200);
    const text = visible(page.text);
    assert.doesNotMatch(text, /Draft rules/);
    for (const part of [
      /Official rules Coffee Cup\. Free to enter\. Prize: A bag of Buddha Beans coffee \(about \$25, from Buddha Beans Coffee Co\.\)\./,
      /Sponsor Buddha Beans Coffee Co\. \("Sponsor"\) sponsors this tournament/,
      /No purchase necessary NO PURCHASE NECESSARY TO ENTER OR WIN\./,
      /Eligibility Open to: US residents 21\+, void where prohibited\./,
      /Entry period Sat, Nov 7, 12:00 PM – 11:59 PM ET\./,
      /How to enter Free\. .* check "I've read the official rules" and tap Join\./,
      /How the winner is determined Skill, not chance\. The player in first place in the final standings .* \(NBA\), with at least 1 graded pick to place\. Ties go to the better return/,
      /Prize and approximate retail value One prize: A bag of Buddha Beans coffee\. Approximate retail value: \$25\./,
      /Odds Odds of winning depend on skill and the number of entrants\./,
      /Winner notification and verification/,
      /Publicity/,
      /General conditions/,
      /Limitation of liability \[Placeholder: a lawyer supplies this section/,
      /Privacy .* Privacy Policy/,
      /Winners list For the winner's screen name, email/,
    ]) assert.match(text, part);
    assert.match(page.text, /href="\/privacy"/);
  });

  test('joining needs "I\'ve read the official rules", stamped on the entry', async () => {
    const t = custom();
    await makePrize(t);
    await boss.post(`/admin/tournaments/${t.slug}/prize/review`, { reviewed: '1' });
    await boss.post(`/admin/tournaments/${t.slug}/prize/publish`, {});
    const page = await ann.get(`/tournaments/${t.slug}`);
    assert.match(page.text, /<input type="checkbox" name="rules" value="1" required>/);
    assert.match(visible(page.text), /I've read the official rules Join/);
    await ann.post(`/tournaments/${t.slug}/join`, {});
    assert.equal(app.store.get('SELECT COUNT(*) AS n FROM tournament_entries WHERE tournament_id = ?', t.id).n, 0);
    assert.match(visible((await ann.get(`/tournaments/${t.slug}`)).text), /Check that you've read the official rules to join\./);
    await ann.post(`/tournaments/${t.slug}/join`, { rules: '1' });
    const entry = app.store.get('SELECT joined_at, rules_accepted_at FROM tournament_entries WHERE tournament_id = ? AND user_id = ?', t.id, ann.id);
    assert.equal(entry.rules_accepted_at, NOW);
    // A tournament with players in it can't become a prize one.
    const other = custom('Second Cup');
    joinTournament(app.store, other, ann.id, time.now());
    await boss.get(`/admin/tournaments/${other.slug}/prize`);
    assert.match(visible((await boss.post(`/admin/tournaments/${other.slug}/prize`, PRIZE)).text), /Players are already in it/);
  });

  test('still free: the CHECK refuses any entry fee, on tournaments and every new table', async () => {
    const t = custom();
    await makePrize(t);
    assert.throws(() => app.store.run('UPDATE tournaments SET entry_fee_cents = 500 WHERE id = ?', t.id), /CHECK constraint failed/);
    assert.throws(() => app.store.run(
      "INSERT INTO leagues (name, start_week, regular_weeks, playoff_size, visibility, invite_code, created_at, entry_fee_cents) VALUES ('x', '20261109', 3, 4, 'public', 'ABCDEFGH', ?, 100)", NOW,
    ), /CHECK constraint failed/);
    assert.throws(() => app.store.run("INSERT INTO bracket_challenges (year, name, regions, created_at, entry_fee_cents) VALUES (2030, 'x', '[]', ?, 100)", NOW), /CHECK constraint failed/);
    assert.equal(app.store.get('SELECT entry_fee_cents FROM tournaments WHERE id = ?', t.id).entry_fee_cents, 0);
  });

  test('after the close: the winner with their account email, and Mark prize sent', async () => {
    const t = custom();
    await makePrize(t);
    await boss.post(`/admin/tournaments/${t.slug}/prize/review`, { reviewed: '1' });
    await boss.post(`/admin/tournaments/${t.slug}/prize/publish`, {});
    await ann.get(`/tournaments/${t.slug}`);
    await ann.post(`/tournaments/${t.slug}/join`, { rules: '1' });
    assert.match(visible((await boss.get(`/admin/tournaments/${t.slug}/prize`)).text), /The winner shows here once the tournament closes\./);
    addBet(app.store, { userId: ann.id, start: et('20261107', 19), sport: 'nba', result: 'win', profit: 2.5 });
    time.set(et('20261108', 1));
    closeDueTournaments(app.store, time.now(), app.notifier);
    const page = visible((await boss.get(`/admin/tournaments/${t.slug}/prize`)).text);
    assert.match(page, /Winner Ann · ann@example\.com 1-0 · \+2\.5u · read the rules .* Mark prize sent/);
    assert.match(visible((await boss.get('/admin/tournaments')).text), /Coffee Cup A bag of Buddha Beans coffee · Published · Final: send the prize/);
    await boss.post(`/admin/tournaments/${t.slug}/prize/sent`, {});
    const prize = prizeOf(app.store, t);
    assert.ok(prize.sent_at);
    assert.match(visible((await boss.get(`/admin/tournaments/${t.slug}/prize`)).text), /Prize sent, marked by Boss/);
    // A player never sees the email.
    assert.doesNotMatch((await ann.get(`/tournaments/${t.slug}`)).text, /ann@example\.com/);
  });
});
