// Menu lookups and the three things that change the schedule: book, move, cancel.
// Every change re-checks the time inside one write transaction, so two people
// grabbing the same slot can never both get it.

import { createAvailability, overlapsAnything } from './availability.js';
import { localDate } from './time.js';

const MIN = 60_000;

export function listServices(store, { includeInactive = false } = {}) {
  return store.all(`SELECT * FROM services ${includeInactive ? '' : 'WHERE active = 1'} ORDER BY sort, id`);
}

export function serviceBySlug(store, slug) {
  return store.get('SELECT * FROM services WHERE slug = ? AND active = 1', slug);
}

export function addonsFor(store, service) {
  return store.all("SELECT * FROM addons WHERE active = 1 AND (applies_to = '' OR applies_to = ?) ORDER BY sort, id", service.category);
}

/** Add-ons by id for this service, ignoring any that don't apply. */
export function pickAddons(store, service, ids) {
  const wanted = new Set([ids].flat().flatMap((x) => String(x ?? '').split(',')).map(Number).filter(Number.isInteger));
  return addonsFor(store, service).filter((a) => wanted.has(a.id));
}

export function totals(service, addons) {
  return {
    durationMin: service.duration_min + addons.reduce((n, a) => n + a.duration_min, 0),
    priceCents: service.price_cents + addons.reduce((n, a) => n + a.price_cents, 0),
  };
}

/**
 * Book a time. `startMs` must be a real open slot unless `override` (the owner
 * booking by hand), which still can't double-book.
 * Returns { appointment } or { error }.
 */
export function createBooking(store, { settings, tz, now = new Date(), userId, service, addons, startMs, clientNote = '', createdBy = 'client', override = false }) {
  const { durationMin, priceCents } = totals(service, addons);
  const endMs = startMs + durationMin * MIN;
  return store.tx(() => {
    const problem = checkTime(store, { settings, tz, now, startMs, endMs, durationMin, override, ignoreId: null });
    if (problem) return { error: problem };
    const r = store.run(
      `INSERT INTO appointments (user_id, service_id, service_name, addons, starts_at, ends_at, price_cents, client_note, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      userId, service.id, service.name,
      JSON.stringify(addons.map((a) => ({ id: a.id, name: a.name, price_cents: a.price_cents, duration_min: a.duration_min }))),
      new Date(startMs).toISOString(), new Date(endMs).toISOString(), priceCents, clientNote.slice(0, 1000), createdBy, now.toISOString(),
    );
    return { appointment: getAppointment(store, r.id) };
  });
}

/** Moves a booked appointment to a new start time (same service and add-ons). */
export function moveBooking(store, { settings, tz, now = new Date(), appointment, startMs, override = false }) {
  const durationMin = (Date.parse(appointment.ends_at) - Date.parse(appointment.starts_at)) / MIN;
  const endMs = startMs + durationMin * MIN;
  return store.tx(() => {
    const current = getAppointment(store, appointment.id);
    if (!current || current.status !== 'booked') return { error: 'That appointment can no longer be changed.' };
    const problem = checkTime(store, { settings, tz, now, startMs, endMs, durationMin, override, ignoreId: current.id });
    if (problem) return { error: problem };
    store.run('UPDATE appointments SET starts_at = ?, ends_at = ?, reminder_sent_at = NULL WHERE id = ?', new Date(startMs).toISOString(), new Date(endMs).toISOString(), current.id);
    return { appointment: getAppointment(store, current.id) };
  });
}

function checkTime(store, { settings, tz, now, startMs, endMs, durationMin, override, ignoreId }) {
  const taken = 'That time was just taken. Please pick another.';
  if (!Number.isFinite(startMs)) return 'That is not a valid time.';
  if (override) return overlapsAnything(store, settings, startMs, endMs, ignoreId) ? 'That overlaps another appointment or time off.' : null;
  const date = localDate(new Date(startMs), tz);
  const avail = createAvailability({ store, settings, tz, now, fromDate: date, toDate: date, ignoreId });
  return avail.slots(date, durationMin).some((s) => s.getTime() === startMs) ? null : taken;
}

export function getAppointment(store, id) {
  const a = store.get(
    `SELECT a.*, u.email AS client_email, u.name AS client_name, u.phone AS client_phone
       FROM appointments a JOIN users u ON u.id = a.user_id WHERE a.id = ?`, id,
  );
  return a ? { ...a, addons: JSON.parse(a.addons) } : null;
}

/** Can the client change this on their own? (Inside the cancellation window, they have to ask.) */
export function insideWindow(appointment, settings, now = new Date()) {
  return Date.parse(appointment.starts_at) - now.getTime() < settings.cancel_window_hours * 3_600_000;
}

export function cancelBooking(store, { appointment, by, settings, now = new Date() }) {
  return store.tx(() => {
    const current = getAppointment(store, appointment.id);
    if (!current || current.status !== 'booked') return { error: 'That appointment is already closed.' };
    const late = by === 'client' && insideWindow(current, settings, now) ? 1 : 0;
    store.run(
      "UPDATE appointments SET status = 'cancelled', cancelled_at = ?, cancelled_by = ?, late_cancel = ? WHERE id = ?",
      now.toISOString(), by, late, current.id,
    );
    return { appointment: getAppointment(store, current.id), late: Boolean(late) };
  });
}

export function setStatus(store, id, status) {
  return store.run("UPDATE appointments SET status = ? WHERE id = ? AND status IN ('booked', 'completed', 'no_show')", status, id).changes > 0;
}
