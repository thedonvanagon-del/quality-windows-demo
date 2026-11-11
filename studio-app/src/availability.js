// Which start times are open. One practitioner, so one appointment at a time.
// A start time is open when the whole treatment (plus cleanup time after the
// previous client) fits inside a block of open hours, clear of other
// bookings and time off, and inside the notice / advance-booking limits.

import { addDays, weekdayOf, zonedToUtc } from './time.js';

const MIN = 60_000;

/**
 * Loads what it needs once for fromDate..toDate (inclusive, "YYYY-MM-DD"),
 * then answers slots(date, durationMin) as many times as asked.
 * ignoreId: an appointment being rescheduled, whose old time shouldn't block.
 */
export function createAvailability({ store, settings, tz, now = new Date(), fromDate, toDate, ignoreId = null }) {
  const hours = store.all('SELECT weekday, start_min, end_min FROM hours ORDER BY weekday, start_min');
  const lo = new Date(zonedToUtc(fromDate, 0, tz).getTime() - 2 * 86_400_000).toISOString();
  const hi = new Date(zonedToUtc(addDays(toDate, 1), 0, tz).getTime() + 2 * 86_400_000).toISOString();
  const buffer = settings.buffer_min * MIN;

  const busy = [];
  for (const a of store.all(
    "SELECT starts_at, ends_at FROM appointments WHERE status IN ('booked', 'completed') AND id != ? AND ends_at > ? AND starts_at < ?",
    ignoreId ?? -1, lo, hi,
  )) {
    busy.push([Date.parse(a.starts_at) - buffer, Date.parse(a.ends_at) + buffer]);
  }
  for (const t of store.all('SELECT starts_at, ends_at FROM time_off WHERE ends_at > ? AND starts_at < ?', lo, hi)) {
    busy.push([Date.parse(t.starts_at), Date.parse(t.ends_at)]);
  }

  const earliest = now.getTime() + settings.min_notice_hours * 60 * MIN;
  const latest = now.getTime() + settings.max_advance_days * 86_400_000;
  const step = settings.slot_step_min;

  function slots(dateStr, durationMin) {
    const out = new Map();
    for (const block of hours) {
      if (block.weekday !== weekdayOf(dateStr)) continue;
      for (let m = block.start_min; m + durationMin <= block.end_min; m += step) {
        const start = zonedToUtc(dateStr, m, tz);
        const s = start.getTime();
        const e = s + durationMin * MIN;
        if (s < earliest || s > latest) continue;
        if (busy.some(([bs, be]) => s < be && e > bs)) continue;
        out.set(s, start);
      }
    }
    return [...out.values()].sort((a, b) => a - b);
  }

  return { slots, hasAny: (dateStr, durationMin) => slots(dateStr, durationMin).length > 0 };
}

/** Is there anything on the books (or time off) overlapping this exact range, cleanup time included? */
export function overlapsAnything(store, settings, startMs, endMs, ignoreId = null) {
  const buffer = settings.buffer_min * MIN;
  const clash = store.get(
    "SELECT 1 AS x FROM appointments WHERE status IN ('booked', 'completed') AND id != ? AND starts_at < ? AND ends_at > ? LIMIT 1",
    ignoreId ?? -1, new Date(endMs + buffer).toISOString(), new Date(startMs - buffer).toISOString(),
  );
  if (clash) return true;
  return Boolean(store.get(
    'SELECT 1 AS x FROM time_off WHERE starts_at < ? AND ends_at > ? LIMIT 1',
    new Date(endMs).toISOString(), new Date(startMs).toISOString(),
  ));
}
