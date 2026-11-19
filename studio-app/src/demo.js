// DEMO=1 only: a few clients and bookings, so every screen has something on it.

import { createBooking, serviceBySlug } from './booking.js';
import { getSettings } from './settings.js';
import { addDays, localDate, zonedToUtc } from './time.js';

export function seedDemo({ store, tz, now = new Date() }) {
  if (store.get('SELECT 1 AS x FROM users LIMIT 1')) return;
  const settings = getSettings(store);
  const people = [
    ['Maya Torres', 'maya@example.com', '(805) 555-0142'],
    ['Jules Bennett', 'jules@example.com', '(805) 555-0188'],
    ['Priya Shah', 'priya@example.com', '(805) 555-0107'],
  ];
  const ids = people.map(([name, email, phone]) => store.run('INSERT INTO users (email, name, phone, email_verified, created_at) VALUES (?, ?, ?, 1, ?)', email, name, phone, now.toISOString()).id);
  store.run('INSERT INTO intake (user_id, answers, signed_name, signed_at) VALUES (?, ?, ?, ?)', ids[2],
    JSON.stringify({ pregnant: 'no', isotretinoin: 'no', conditions: ['Rosacea'], allergies: 'Latex', medications: 'Tretinoin at night', goals: 'Calm redness, glow for a wedding' }), 'Priya Shah', now.toISOString());

  // Bookings land on the next open weekdays at the studio's usual start times.
  const plan = [[0, 'hydradermabrasion', 0, 600], [0, 'brow-wax', 1, 660], [1, 'lash-lift', 0, 720], [2, 'microneedling', 1, 630], [2, 'enzyme-peel', 0, 840]];
  let day = addDays(localDate(now, tz), 1);
  let n = 0;
  for (const [who, slug, offset, minutes] of plan) {
    let d = addDays(day, offset + n);
    while (![2, 3, 4, 5].includes(new Date(`${d}T12:00:00Z`).getUTCDay())) d = addDays(d, 1);
    createBooking(store, {
      settings, tz, now, userId: ids[who], service: serviceBySlug(store, slug), addons: [],
      startMs: zonedToUtc(d, minutes, tz).getTime(), clientNote: who === 2 ? 'First time with microneedling, a little nervous!' : '', override: true,
    });
    n += 1;
  }
}
