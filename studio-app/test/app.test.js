import assert from 'node:assert/strict';
import test from 'node:test';

import { NOW, makeApp, slotLinks } from './helpers.js';

const INTAKE = { pregnant: 'no', isotretinoin: 'no', consent: '1', signed_name: 'Maya Torres', allergies: '', medications: '', goals: 'Glow' };

/** Opens the hydradermabrasion times for Sat 7 Nov and returns the confirm links. */
async function openSlots(c, date = '2026-11-07') {
  const res = await c.get(`/book/hydradermabrasion/times?date=${date}&month=${date.slice(0, 7)}`);
  assert.equal(res.status, 200);
  return slotLinks(res.text);
}

test('public pages render', async () => {
  const app = await makeApp();
  const c = app.client();
  for (const path of ['/', '/services', '/policies', '/book', '/login', '/signup', '/healthz']) {
    assert.equal((await c.get(path)).status, 200, path);
  }
  assert.equal((await c.get('/nope')).status, 404);
  const home = await c.get('/');
  assert.match(home.text, /Lumen Skin Studio/);
  assert.match(home.headers.get('content-security-policy'), /default-src 'self'/);
  await app.close();
});

test('the menu lists the services with prices', async () => {
  const app = await makeApp();
  const { text } = await app.client().get('/services');
  for (const name of ['Hydradermabrasion Facial', 'Microneedling', 'Enzyme Peel Facial', 'Lash Lift', 'Brow Wax']) assert.match(text, new RegExp(name));
  assert.match(text, /\$140/);
  assert.match(text, /Complimentary/); // the free consultation
  await app.close();
});

test('the times page shows open days and slots; a closed day shows none', async () => {
  const app = await makeApp();
  const c = app.client();
  const links = await openSlots(c);
  assert.equal(links.length, 9);
  assert.match(links[0], /^\/book\/hydradermabrasion\/confirm\?start=2026-11-07T17%3A00%3A00\.000Z/);
  assert.equal((await openSlots(c, '2026-11-08')).length, 0); // a Sunday is not offered
  await app.close();
});

test('full booking: email code, health form, confirmation, and the slot is gone afterwards', async () => {
  const app = await makeApp();
  const c = app.client();
  const [first] = await openSlots(c);

  // Not signed in: the confirm page asks for sign-in and carries them back.
  const gate = await c.get(first);
  assert.match(gate.text, /Continue with email/);

  const verified = await c.signIn('maya@example.com');
  assert.equal(verified.status, 303);
  const confirm = await c.get(first);
  assert.match(confirm.text, /Confirm your visit/);
  assert.match(confirm.text, /Quick health check/);

  const start = new URL(first, 'http://x').searchParams.get('start');
  // Missing the name and the agreement: refused with an error, nothing booked.
  const bad = await c.post('/book/hydradermabrasion/confirm', { start, addons: '', ...INTAKE });
  assert.equal(bad.status, 400);
  assert.equal(app.store.get('SELECT COUNT(*) AS n FROM appointments').n, 0);

  const ok = await c.post('/book/hydradermabrasion/confirm', { start, addons: '', name: 'Maya Torres', phone: '805-555-0100', agree: '1', note: 'Sensitive skin', ...INTAKE });
  assert.equal(ok.status, 303);
  assert.match(ok.location, /^\/appointments\/\d+$/);
  const detail = await c.follow(ok);
  assert.match(detail.text, /Hydradermabrasion Facial/);
  assert.match(detail.text, /Saturday, November 7 at 9:00 am/);

  const row = app.store.get('SELECT * FROM appointments');
  assert.equal(row.starts_at, '2026-11-07T17:00:00.000Z');
  assert.equal(row.price_cents, 14000);
  assert.equal(app.store.get('SELECT name FROM users WHERE email = ?', 'maya@example.com').name, 'Maya Torres');
  assert.ok(app.store.get('SELECT 1 AS x FROM intake'));

  // Confirmation email to the client; heads-up to the owner.
  assert.ok(app.outbox.some((m) => m.to === 'maya@example.com' && /You're booked/.test(m.subject)));
  assert.ok(app.outbox.some((m) => m.to === 'owner@example.com' && /New booking/.test(m.subject)));

  // The booked time and its cleanup buffer are gone for everyone else.
  const after = (await openSlots(app.client())).map((l) => new URL(l, 'http://x').searchParams.get('start').slice(11, 16));
  // 9:00-10:00 am is booked, plus 15 minutes of cleanup: the next open start is 10:30 am (18:30 UTC).
  assert.deepEqual(after.slice(0, 2), ['18:30', '19:00']);
  assert.ok(!after.includes('17:00') && !after.includes('17:30') && !after.includes('18:00'));
  await app.close();
});

test('two people cannot both take the same slot', async () => {
  const app = await makeApp();
  const a = app.client();
  const b = app.client();
  const [first] = await openSlots(a);
  const start = new URL(first, 'http://x').searchParams.get('start');
  await a.signIn('a@example.com');
  await b.signIn('b@example.com');
  const form = { start, addons: '', name: 'Someone', agree: '1', ...INTAKE };
  const [r1, r2] = await Promise.all([a.post('/book/hydradermabrasion/confirm', form), b.post('/book/hydradermabrasion/confirm', form)]);
  const redirects = [r1, r2].map((r) => r.location);
  assert.equal(app.store.get("SELECT COUNT(*) AS n FROM appointments WHERE status = 'booked'").n, 1);
  assert.equal(redirects.filter((l) => /^\/appointments\//.test(l)).length, 1);
  assert.equal(redirects.filter((l) => /\/times/.test(l)).length, 1);
  await app.close();
});

test('add-ons lengthen the visit and change the price', async () => {
  const app = await makeApp();
  const c = app.client();
  await c.signIn('maya@example.com');
  const browWax = app.store.get("SELECT id FROM addons WHERE name = 'Brow wax' AND applies_to = 'Facials'").id;
  const page = await c.get(`/book/hydradermabrasion/times?addons=${browWax}&date=2026-11-07&month=2026-11`);
  const link = slotLinks(page.text)[0];
  assert.match(link, new RegExp(`addons=${browWax}`));
  const start = new URL(link, 'http://x').searchParams.get('start');
  await c.post('/book/hydradermabrasion/confirm', { start, addons: String(browWax), name: 'Maya', agree: '1', ...INTAKE });
  const row = app.store.get('SELECT * FROM appointments');
  assert.equal(row.price_cents, 16000);
  assert.equal((Date.parse(row.ends_at) - Date.parse(row.starts_at)) / 60_000, 75);
  assert.equal(JSON.parse(row.addons)[0].name, 'Brow wax');
  await app.close();
});

test('forged or stale times are refused', async () => {
  const app = await makeApp();
  const c = app.client();
  await c.signIn('maya@example.com');
  for (const start of ['2026-11-07T17:07:00.000Z', '2026-11-08T17:00:00.000Z', '2026-11-07T03:00:00.000Z', 'garbage', '2025-01-01T10:00:00.000Z']) {
    const res = await c.post('/book/hydradermabrasion/confirm', { start, addons: '', name: 'Maya', agree: '1', ...INTAKE });
    assert.equal(res.status, 303, start);
    assert.match(res.location, /\/times/);
  }
  assert.equal(app.store.get('SELECT COUNT(*) AS n FROM appointments').n, 0);
  await app.close();
});

test('cancelling: free well ahead, flagged late inside the window', async () => {
  const app = await makeApp();
  const c = app.client();
  await c.signIn('maya@example.com');
  const book = async (date) => {
    const [link] = await openSlots(c, date);
    const start = new URL(link, 'http://x').searchParams.get('start');
    const res = await c.post('/book/hydradermabrasion/confirm', { start, addons: '', name: 'Maya', agree: '1', ...INTAKE });
    return Number(res.location.split('/').pop());
  };
  const far = await book('2026-11-10'); // Tuesday, days away
  await c.post(`/appointments/${far}/cancel`);
  let row = app.store.get('SELECT * FROM appointments WHERE id = ?', far);
  assert.equal(row.status, 'cancelled');
  assert.equal(row.late_cancel, 0);

  const near = await book('2026-11-07'); // Saturday 9am: 21 hours away
  const page = await c.get(`/appointments/${near}`);
  assert.match(page.text, /inside 24 hours/);
  assert.doesNotMatch(page.text, /Change the time/);
  await c.post(`/appointments/${near}/cancel`);
  row = app.store.get('SELECT * FROM appointments WHERE id = ?', near);
  assert.equal(row.late_cancel, 1);
  // Cancelled visits free the slot again.
  assert.ok((await openSlots(app.client())).length > 0);
  await app.close();
});

test('rescheduling moves the visit, and is blocked inside the window', async () => {
  const app = await makeApp();
  const c = app.client();
  await c.signIn('maya@example.com');
  const [link] = await openSlots(c, '2026-11-10');
  const start = new URL(link, 'http://x').searchParams.get('start');
  const id = Number((await c.post('/book/hydradermabrasion/confirm', { start, addons: '', name: 'Maya', agree: '1', ...INTAKE })).location.split('/').pop());

  const times = await c.get(`/appointments/${id}/reschedule?date=2026-11-11&month=2026-11`);
  const newLink = slotLinks(times.text)[2];
  const newStart = new URL(newLink, 'http://x').searchParams.get('start');
  const ask = await c.get(newLink);
  assert.match(ask.text, /Move your visit\?/);
  const moved = await c.post(`/appointments/${id}/reschedule`, { start: newStart });
  assert.equal(moved.status, 303);
  assert.equal(app.store.get('SELECT starts_at FROM appointments WHERE id = ?', id).starts_at, newStart);
  assert.ok(app.outbox.some((m) => /moved/i.test(m.subject)));

  // Time travel to 5 hours before: the client has to text instead.
  app.clock.now = new Date(Date.parse(newStart) - 5 * 3_600_000);
  const late = await c.get(`/appointments/${id}/reschedule`);
  assert.equal(late.status, 303);
  assert.match(late.location, new RegExp(`/appointments/${id}$`));
  await app.close();
});

test('clients cannot see or touch each other\'s appointments', async () => {
  const app = await makeApp();
  const maya = app.client();
  await maya.signIn('maya@example.com');
  const [link] = await openSlots(maya, '2026-11-10');
  const start = new URL(link, 'http://x').searchParams.get('start');
  const id = Number((await maya.post('/book/hydradermabrasion/confirm', { start, addons: '', name: 'Maya', agree: '1', ...INTAKE })).location.split('/').pop());

  const eve = app.client();
  await eve.signIn('eve@example.com');
  assert.equal((await eve.get(`/appointments/${id}`)).status, 303);
  await eve.post(`/appointments/${id}/cancel`);
  assert.equal(app.store.get('SELECT status FROM appointments WHERE id = ?', id).status, 'booked');
  assert.equal((await eve.get(`/appointments/${id}/calendar.ics`)).status, 303);
  await app.close();
});

test('the calendar file has the right times', async () => {
  const app = await makeApp();
  const c = app.client();
  await c.signIn('maya@example.com');
  const [link] = await openSlots(c, '2026-11-10');
  const start = new URL(link, 'http://x').searchParams.get('start');
  const id = (await c.post('/book/hydradermabrasion/confirm', { start, addons: '', name: 'Maya', agree: '1', ...INTAKE })).location.split('/').pop();
  const ics = await c.get(`/appointments/${id}/calendar.ics`);
  assert.equal(ics.status, 200);
  assert.match(ics.headers.get('content-type'), /text\/calendar/);
  assert.match(ics.text, /DTSTART:20261110T180000Z/);
  assert.match(ics.text, /DTEND:20261110T190000Z/);
  await app.close();
});

// ---- security ----

test('forms without the CSRF token are refused', async () => {
  const app = await makeApp();
  const c = app.client();
  await c.get('/login');
  const res = await fetch(`${app.base}/login/code`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'email=x%40example.com' });
  assert.equal(res.status, 403);
  assert.equal(app.outbox.length, 0);
  await app.close();
});

test('wrong codes are rejected and five misses burn the code', async () => {
  const app = await makeApp();
  const c = app.client();
  await c.get('/login');
  await c.post('/login/code', { email: 'maya@example.com' });
  const real = /(\d{6}) is your sign-in code/.exec(app.outbox.at(-1).subject)[1];
  const wrong = real === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i += 1) assert.equal((await c.post('/login/verify', { email: 'maya@example.com', code: wrong })).status, 400);
  // The right code no longer works: the five misses used it up.
  assert.equal((await c.post('/login/verify', { email: 'maya@example.com', code: real })).status, 400);
  assert.equal(app.store.get('SELECT COUNT(*) AS n FROM users').n, 0);
  await app.close();
});

test('signing up creates no account until the email is confirmed', async () => {
  const app = await makeApp();
  const c = app.client();
  await c.get('/signup');
  const res = await c.post('/signup', { name: 'Maya Torres', email: 'maya@example.com', phone: '', password: 'correct horse battery' });
  assert.equal(res.status, 303);
  assert.equal(app.store.get('SELECT COUNT(*) AS n FROM users').n, 0);
  const code = /(\d{6}) is your sign-in code/.exec(app.outbox.at(-1).subject)[1];
  assert.equal((await c.post('/login/verify', { email: 'maya@example.com', code })).status, 303);
  const user = app.store.get('SELECT * FROM users');
  assert.equal(user.name, 'Maya Torres');
  assert.equal(user.email_verified, 1);

  // Password sign-in now works from a fresh browser.
  const other = app.client();
  await other.get('/login');
  assert.equal((await other.post('/login', { email: 'maya@example.com', password: 'correct horse battery' })).status, 303);
  const bad = app.client();
  await bad.get('/login');
  assert.equal((await bad.post('/login', { email: 'maya@example.com', password: 'wrong password' })).status, 400);
  await app.close();
});

test('nobody can take over the owner\'s address by signing up with it first', async () => {
  const app = await makeApp();
  const attacker = app.client();
  await attacker.get('/signup');
  await attacker.post('/signup', { name: 'Mallory', email: 'owner@example.com', phone: '', password: 'attacker-password' });
  // No code entered: no account, so the attacker's password opens nothing.
  const probe = app.client();
  await probe.get('/login');
  assert.equal((await probe.post('/login', { email: 'owner@example.com', password: 'attacker-password' })).status, 400);
  assert.equal((await attacker.get('/admin')).status, 303);
  await app.close();
});

test('owner pages: anonymous goes to sign-in, clients get a 404, only the owner gets in', async () => {
  const app = await makeApp();
  const anon = app.client();
  const gate = await anon.get('/admin');
  assert.equal(gate.status, 303);
  assert.match(gate.location, /^\/login\?next=/);

  const client = app.client();
  await client.signIn('maya@example.com');
  for (const p of ['/admin', '/admin/clients', '/admin/services', '/admin/hours', '/admin/settings', '/admin/new']) {
    assert.equal((await client.get(p)).status, 404, p);
  }
  const post = await client.post('/admin/settings', { studio_name: 'Hacked' });
  assert.equal(post.status, 404);
  assert.notEqual(app.store.get("SELECT value FROM settings WHERE key = 'studio_name'")?.value, 'Hacked');

  const owner = app.client();
  await owner.signIn('owner@example.com');
  for (const p of ['/admin', '/admin/clients', '/admin/services', '/admin/hours', '/admin/settings', '/admin/new', '/admin/services/new', '/admin/addons/new']) {
    assert.equal((await owner.get(p)).status, 200, p);
  }
  await app.close();
});

test('open-redirect attempts via ?next= go nowhere', async () => {
  const app = await makeApp();
  const c = app.client();
  await c.get('/login');
  await c.post('/login/code', { email: 'maya@example.com', next: 'https://evil.example/' });
  const code = /(\d{6}) is your sign-in code/.exec(app.outbox.at(-1).subject)[1];
  const res = await c.post('/login/verify', { email: 'maya@example.com', code, next: '//evil.example/' });
  assert.equal(res.location, '/account');
  await app.close();
});

test('names with markup are escaped everywhere', async () => {
  const app = await makeApp();
  const owner = app.client();
  await owner.signIn('owner@example.com');
  await owner.get('/admin/services/new');
  const res = await owner.post('/admin/services/new', { name: '<script>alert(1)</script>', category: 'Facials', description: '<img src=x onerror=alert(1)>', prep_note: '', duration_min: '30', price: '50', active: '1' });
  assert.equal(res.status, 303);
  const menu = await app.client().get('/services');
  assert.doesNotMatch(menu.text, /<script>alert/);
  assert.doesNotMatch(menu.text, /<img src=x/);
  assert.match(menu.text, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  await app.close();
});

// ---- the owner's tools ----

test('owner: sees the day, books a client by hand, marks done, cancels with an email', async () => {
  const app = await makeApp();
  const owner = app.client();
  await owner.signIn('owner@example.com');
  await owner.get('/admin/new');
  const service = app.store.get("SELECT id FROM services WHERE slug = 'lash-lift'").id;
  const made = await owner.post('/admin/new', { email: 'walkin@example.com', name: 'Walk In', phone: '805-555-0111', service: String(service), date: '2026-11-10', time: '19:00', notify: '1' });
  assert.equal(made.status, 303);
  const row = app.store.get('SELECT * FROM appointments');
  assert.equal(row.created_by, 'admin');
  assert.equal(row.starts_at, '2026-11-11T03:00:00.000Z'); // 7pm PST is outside normal hours; the owner may override
  assert.ok(app.outbox.some((m) => m.to === 'walkin@example.com'));

  // But she cannot double-book herself.
  const clash = await owner.post('/admin/new', { email: 'other@example.com', service: String(service), date: '2026-11-10', time: '19:30' });
  assert.equal(clash.status, 400);
  assert.equal(app.store.get('SELECT COUNT(*) AS n FROM appointments').n, 1);

  const sched = await owner.get('/admin?from=2026-11-09');
  assert.match(sched.text, /Walk In/);
  assert.match(sched.text, /Lash Lift/);

  await owner.post(`/admin/appointments/${row.id}/status`, { action: 'completed', back: '/admin' });
  assert.equal(app.store.get('SELECT status FROM appointments').status, 'completed');
  await owner.post(`/admin/appointments/${row.id}/status`, { action: 'booked', back: '/admin' });
  await owner.post(`/admin/appointments/${row.id}/status`, { action: 'cancel', back: '/admin' });
  assert.equal(app.store.get('SELECT status, cancelled_by FROM appointments').cancelled_by, 'admin');
  assert.ok(app.outbox.some((m) => m.to === 'walkin@example.com' && /Cancelled/.test(m.subject)));
  await app.close();
});

test('owner: hours and time off change what clients can book', async () => {
  const app = await makeApp();
  const owner = app.client();
  await owner.signIn('owner@example.com');
  await owner.get('/admin/hours');

  // Open Mondays 12-4 (a Monday that was closed before) and add a lunch break on Tuesdays.
  const form = {};
  for (let wd = 0; wd < 7; wd += 1) for (let i = 0; i < 2; i += 1) { form[`start_${wd}_${i}`] = ''; form[`end_${wd}_${i}`] = ''; }
  Object.assign(form, { start_1_0: '12:00', end_1_0: '16:00', start_2_0: '09:00', end_2_0: '12:00', start_2_1: '13:00', end_2_1: '17:00' });
  assert.equal((await owner.post('/admin/hours', form)).status, 303);

  const client = app.client();
  assert.equal((await openSlots(client, '2026-11-09')).length, 7); // Monday 12-4, 60 min, every half hour
  assert.equal((await openSlots(client, '2026-11-07')).length, 0); // Saturday is closed now

  // Backwards hours are rejected.
  const bad = await owner.post('/admin/hours', { ...form, start_3_0: '15:00', end_3_0: '10:00' });
  assert.equal(bad.status, 400);

  // Time off on Monday blocks it.
  await owner.post('/admin/timeoff', { from: '2026-11-09', to: '2026-11-09', note: 'Dentist' });
  assert.equal((await openSlots(client, '2026-11-09')).length, 0);
  await app.close();
});

test('owner: editing the menu and settings shows up for clients', async () => {
  const app = await makeApp();
  const owner = app.client();
  await owner.signIn('owner@example.com');
  await owner.get('/admin/settings');
  const settings = Object.fromEntries(app.store.all('SELECT key, value FROM settings').map((r) => [r.key, r.value]));
  const current = (await owner.get('/admin/settings')).text;
  const values = {};
  for (const m of current.matchAll(/name="([a-z_]+)"(?: value="([^"]*)")?/g)) if (m[1] !== '_csrf') values[m[1]] = m[2] ?? '';
  const res = await owner.post('/admin/settings', { ...values, studio_name: 'Salt & Sage Skin', cancel_window_hours: '48', policies: 'Be kind.\n\nBe on time.' });
  assert.equal(res.status, 303, JSON.stringify(settings));
  const home = await app.client().get('/');
  assert.match(home.text, /Salt &amp; Sage Skin/);
  assert.match((await app.client().get('/policies')).text, /Be on time/);

  const bad = await owner.post('/admin/settings', { ...values, cancel_window_hours: 'soon' });
  assert.equal(bad.status, 400);

  // Hide a service: gone from the menu and unbookable.
  const s = app.store.get("SELECT id FROM services WHERE slug = 'brow-wax'");
  await owner.post(`/admin/services/${s.id}`, { name: 'Brow Wax', category: 'Waxing', description: '', prep_note: '', duration_min: '20', price: '25' });
  assert.doesNotMatch((await app.client().get('/services')).text, /Brow Wax/);
  assert.equal((await app.client().get('/book/brow-wax')).status, 303);
  await app.close();
});

test('day-before reminders go out once, and only for visits booked well ahead', async () => {
  const { sendReminders } = await import('../src/reminders.js');
  const { createNotifier } = await import('../src/notify.js');
  const { getSettings } = await import('../src/settings.js');
  const app = await makeApp();
  const c = app.client();
  await c.signIn('maya@example.com');
  const [link] = await openSlots(c, '2026-11-10');
  const start = new URL(link, 'http://x').searchParams.get('start');
  await c.post('/book/hydradermabrasion/confirm', { start, addons: '', name: 'Maya', agree: '1', ...INTAKE });
  const sent = [];
  const notifier = createNotifier({ mailer: { send: async (m) => sent.push(m) }, config: { adminEmails: [], appUrl: 'http://studio.test' }, getSettings: () => getSettings(app.store), tz: 'America/Los_Angeles' });
  const dayBefore = new Date(Date.parse(start) - 20 * 3_600_000);
  assert.equal(await sendReminders({ store: app.store, notifier, now: NOW }), 0); // days away: too early
  assert.equal(await sendReminders({ store: app.store, notifier, now: dayBefore }), 1);
  assert.equal(await sendReminders({ store: app.store, notifier, now: dayBefore }), 0); // only once
  assert.match(sent[0].subject, /Tomorrow/);
  await app.close();
});
