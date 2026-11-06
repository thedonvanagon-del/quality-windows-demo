import assert from 'node:assert/strict';
import test from 'node:test';

import { createAvailability } from '../src/availability.js';
import { openStore } from '../src/db.js';
import { seedIfEmpty } from '../src/seed.js';
import { getSettings } from '../src/settings.js';
import { addDays, formatMinutes, isDateStr, localDate, weekdayOf, zonedToUtc } from '../src/time.js';
import { NOW } from './helpers.js';

const TZ = 'America/Los_Angeles';

test('wall-clock times convert to UTC across daylight saving', () => {
  assert.equal(zonedToUtc('2026-07-01', 600, TZ).toISOString(), '2026-07-01T17:00:00.000Z'); // PDT, UTC-7
  assert.equal(zonedToUtc('2026-11-06', 600, TZ).toISOString(), '2026-11-06T18:00:00.000Z'); // PST, UTC-8
  // The day clocks go back: 1 Nov 2026. 10:00 that morning is already PST.
  assert.equal(zonedToUtc('2026-11-01', 600, TZ).toISOString(), '2026-11-01T18:00:00.000Z');
  // The day they spring forward: 8 Mar 2026. 10:00 is PDT.
  assert.equal(zonedToUtc('2026-03-08', 600, TZ).toISOString(), '2026-03-08T17:00:00.000Z');
});

test('local dates and weekdays', () => {
  assert.equal(localDate(new Date('2026-11-07T03:00:00Z'), TZ), '2026-11-06'); // still Friday evening there
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(weekdayOf('2026-11-06'), 5);
  assert.equal(isDateStr('2026-02-30'), false);
  assert.equal(isDateStr('2026-02-28'), true);
  assert.equal(formatMinutes(13 * 60 + 5), '1:05 pm');
});

function setup() {
  const store = openStore(':memory:');
  seedIfEmpty(store);
  const settings = getSettings(store);
  const avail = (extra = {}) => createAvailability({ store, settings: { ...settings, ...extra }, tz: TZ, now: NOW, fromDate: '2026-11-06', toDate: '2026-12-31' });
  const user = store.run("INSERT INTO users (email, name, email_verified, created_at) VALUES ('c@example.com', 'C', 1, ?)", NOW.toISOString()).id;
  const book = (startIso, minutes) => store.run(
    "INSERT INTO appointments (user_id, service_id, service_name, starts_at, ends_at, price_cents, created_at) VALUES (?, 1, 'x', ?, ?, 0, ?)",
    user, startIso, new Date(Date.parse(startIso) + minutes * 60_000).toISOString(), NOW.toISOString());
  return { store, avail, book };
}

const times = (slots) => slots.map((s) => s.toISOString().slice(11, 16));

test('a 60-minute visit on Saturday fits every half hour from 9 to 1', () => {
  const { avail } = setup();
  // Sat 7 Nov, 9:00-14:00 PST = 17:00Z-22:00Z. Last start is 13:00 (ends 14:00).
  assert.deepEqual(times(avail().slots('2026-11-07', 60)), ['17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00']);
});

test('closed days have no times', () => {
  const { avail } = setup();
  assert.deepEqual(avail().slots('2026-11-08', 60), []); // Sunday
  assert.deepEqual(avail().slots('2026-11-09', 60), []); // Monday
});

test('minimum notice hides times that are too soon', () => {
  const { avail } = setup();
  // Now is Fri noon. With 12 hours' notice, nothing before Sat 8am is bookable, so Friday is out.
  assert.equal(avail().slots('2026-11-06', 60).length, 0); // Fri after 12:00 + 12h: all of Friday is gone
  assert.ok(avail({ min_notice_hours: 0 }).slots('2026-11-06', 60).length > 0);
  assert.deepEqual(times(avail({ min_notice_hours: 0 }).slots('2026-11-06', 60))[0], '20:00'); // 12:00 PST, first slot after now
});

test('a booking blocks its time plus cleanup time on both sides', () => {
  const { avail, book } = setup();
  book('2026-11-07T18:00:00.000Z', 60); // Sat 10:00-11:00
  // 15 min cleanup: starts from 9:00 (ends 10:00, inside the buffer) through 11:00 are out. 11:30 is the first free.
  assert.deepEqual(times(avail().slots('2026-11-07', 60)), ['19:30', '20:00', '20:30', '21:00']);
  // A 20-minute service can still squeeze in at 9:00 (ends 9:20, clear of the 9:45 buffer line).
  assert.ok(times(avail().slots('2026-11-07', 20)).includes('17:00'));
});

test('cancelled visits free their time, and time off blocks it', () => {
  const { avail, book, store } = setup();
  const id = book('2026-11-07T18:00:00.000Z', 60).id;
  store.run("UPDATE appointments SET status = 'cancelled' WHERE id = ?", id);
  assert.equal(avail().slots('2026-11-07', 60).length, 9);
  store.run("INSERT INTO time_off (starts_at, ends_at) VALUES ('2026-11-07T17:00:00.000Z', '2026-11-07T22:00:00.000Z')");
  assert.equal(createAvailability({ store, settings: getSettings(store), tz: TZ, now: NOW, fromDate: '2026-11-07', toDate: '2026-11-07' }).slots('2026-11-07', 60).length, 0);
});

test('a visit being rescheduled does not block its own time', () => {
  const { store, book } = setup();
  const id = book('2026-11-07T18:00:00.000Z', 60).id;
  const settings = getSettings(store);
  const make = (ignoreId) => createAvailability({ store, settings, tz: TZ, now: NOW, fromDate: '2026-11-07', toDate: '2026-11-07', ignoreId });
  assert.ok(!times(make(null).slots('2026-11-07', 60)).includes('18:00'));
  assert.ok(times(make(id).slots('2026-11-07', 60)).includes('18:00'));
});

test('nothing is offered beyond the advance-booking limit', () => {
  const { avail } = setup();
  assert.deepEqual(avail({ max_advance_days: 7 }).slots('2026-12-15', 60), []);
});

test('a split day (lunch break) offers no time that straddles the break', () => {
  const { store } = setup();
  store.run('DELETE FROM hours');
  store.run('INSERT INTO hours (weekday, start_min, end_min) VALUES (2, 540, 720), (2, 780, 1020)'); // Tue 9-12, 1-5
  const a = createAvailability({ store, settings: getSettings(store), tz: TZ, now: NOW, fromDate: '2026-11-10', toDate: '2026-11-10' });
  const starts = a.slots('2026-11-10', 90).map((s) => s.toISOString().slice(11, 16));
  assert.ok(starts.includes('18:30'), '10:30 start ends at 12:00 sharp');
  assert.ok(!starts.includes('19:00'), '11:00 start would run into the break');
  assert.ok(starts.includes('21:00'), '1:00 pm start is fine');
});
