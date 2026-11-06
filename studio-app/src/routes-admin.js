// The owner's side: schedule, manual bookings, clients, menu, hours, settings.
// Everything here needs a signed-in owner (see isAdmin in auth.js); to anyone
// else these addresses simply don't exist.

import { cancelBooking, createBooking, getAppointment, listServices, moveBooking, setStatus } from './booking.js';
import { normalizeEmail } from './auth.js';
import { flagsFor, getIntake } from './intake.js';
import { html, money, raw } from './html.js';
import { bookingSummaryForOwner } from './notify.js';
import { safeNext } from './routes-auth.js';
import { FIELDS, parseSettingsForm, saveSettings } from './settings.js';
import {
  addDays, formatDateStr, formatDuration, formatMinutes, formatTime, isDateStr, localDate, minutesOfDay, zonedToUtc, formatDayShort,
} from './time.js';
import { csrf, field, layout, notFoundPage, statusBadge, textarea } from './views.js';

const TABS = [
  ['schedule', '/admin', 'Schedule'],
  ['new', '/admin/new', 'Book a client'],
  ['clients', '/admin/clients', 'Clients'],
  ['services', '/admin/services', 'Menu'],
  ['hours', '/admin/hours', 'Hours'],
  ['settings', '/admin/settings', 'Settings'],
];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function registerAdmin(add, deps) {
  const { store, tz, notifier, now } = deps;

  const guard = (handler) => (ctx) => {
    if (!ctx.user) return ctx.redirect(`/login?next=${encodeURIComponent(ctx.url.pathname + ctx.url.search)}`);
    if (!ctx.isAdmin) return ctx.page(notFoundPage(ctx), 404);
    return handler(ctx);
  };
  const route = (method, path, handler) => add(method, path, guard(handler));
  const page = (ctx, active, title, body, status = 200) => ctx.page(layout(ctx, {
    title, section: 'admin',
    body: html`<section class="wrap page admin">
  <nav class="subnav" aria-label="Owner tools">${TABS.map(([key, href, label]) => html`<a href="${href}"${key === active ? raw(' aria-current="page"') : ''}>${label}</a>`)}</nav>
  ${body}</section>`,
  }), status);

  const parseTime = (s) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(s ?? ''));
    if (!m) return null;
    const mins = Number(m[1]) * 60 + Number(m[2]);
    return Number(m[1]) < 24 && Number(m[2]) < 60 ? mins : null;
  };
  const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

  // ---- schedule ----

  route('GET', '/admin', (ctx) => {
    const today = localDate(now(), tz);
    const fromParam = ctx.query.get('from');
    const from = isDateStr(fromParam) ? fromParam : today;
    const lo = zonedToUtc(from, 0, tz).toISOString();
    const hi = zonedToUtc(addDays(from, 7), 0, tz).toISOString();
    const appts = store.all('SELECT id FROM appointments WHERE starts_at >= ? AND starts_at < ? ORDER BY starts_at', lo, hi).map((r) => getAppointment(store, r.id));
    const off = store.all('SELECT * FROM time_off WHERE ends_at > ? AND starts_at < ? ORDER BY starts_at', lo, hi);
    const live = appts.filter((a) => a.status === 'booked' || a.status === 'completed');
    const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
    const nowIso = now().toISOString();

    page(ctx, 'schedule', 'Schedule', html`
  <div class="sched-head">
    <h1>Schedule</h1>
    <p class="muted">${live.length} visit${live.length === 1 ? '' : 's'} · ${money(live.reduce((n, a) => n + a.price_cents, 0))} booked this week</p>
    <p class="pager"><a href="/admin?from=${addDays(from, -7)}">← Earlier</a> <a href="/admin">This week</a> <a href="/admin?from=${addDays(from, 7)}">Later →</a></p>
  </div>
  ${days.map((day) => {
    const dayStart = zonedToUtc(day, 0, tz).toISOString();
    const dayEnd = zonedToUtc(addDays(day, 1), 0, tz).toISOString();
    const todays = appts.filter((a) => a.starts_at >= dayStart && a.starts_at < dayEnd);
    const blocked = off.filter((o) => o.ends_at > dayStart && o.starts_at < dayEnd);
    return html`<section class="day-block${day === today ? ' is-today' : ''}">
      <h2>${formatDateStr(day)}${day === today ? html` <span class="badge ok">Today</span>` : ''}</h2>
      ${blocked.map((o) => html`<p class="notice">Time off${o.note ? `: ${o.note}` : ''}</p>`)}
      ${todays.length ? html`<ul class="appts">${todays.map((a) => apptRow(ctx, a, from, nowIso))}</ul>` : (blocked.length ? '' : html`<p class="muted">Nothing booked.</p>`)}
    </section>`;
  })}`);
  });

  function apptRow(ctx, a, back, nowIso) {
    const s = new Date(a.starts_at);
    const e = new Date(a.ends_at);
    const intake = getIntake(store, a.user_id);
    const flags = a.status === 'cancelled' ? [] : flagsFor(intake);
    const act = (action, label, cls = 'btn-quiet') => html`<form method="post" action="/admin/appointments/${a.id}/status" class="inline-form">${csrf(ctx)}<input type="hidden" name="action" value="${action}"><input type="hidden" name="back" value="/admin?from=${back}"><button class="btn btn-small ${cls}" type="submit">${label}</button></form>`;
    return html`<li class="appt ${a.status}">
      <div class="appt-time">${formatTime(s, tz)}<span class="muted small">to ${formatTime(e, tz)}</span></div>
      <div class="appt-body">
        <p><strong>${a.service_name}</strong>${a.addons.map((x) => html` <span class="muted">+ ${x.name}</span>`)} ${statusBadge(a)}${a.late_cancel ? html` <span class="badge warn">Late cancel</span>` : ''}</p>
        <p><a href="/admin/clients/${a.user_id}">${a.client_name || a.client_email}</a>${a.client_phone ? html` · <a href="sms:${a.client_phone.replace(/[^\d+]/g, '')}">${a.client_phone}</a>` : ''} · ${money(a.price_cents)}</p>
        ${flags.length ? html`<p class="flags">${flags.map((f) => html`<span class="flag">${f}</span>`)}</p>` : ''}
        ${a.client_note ? html`<p class="small"><em>“${a.client_note}”</em></p>` : ''}
        ${a.admin_note ? html`<p class="small"><strong>Note:</strong> ${a.admin_note}</p>` : ''}
        <div class="actions">
          ${a.status === 'booked' ? html`${a.ends_at <= nowIso ? act('completed', 'Mark done', 'btn') : ''}${act('no_show', 'No-show')}<a class="btn btn-small btn-quiet" href="/admin/appointments/${a.id}/move">Move</a>${act('cancel', 'Cancel', 'btn-danger')}` : ''}
          ${a.status === 'completed' || a.status === 'no_show' ? act('booked', 'Reopen') : ''}
        </div>
        <details class="more"><summary>Private note</summary>
          <form method="post" action="/admin/appointments/${a.id}/note" class="stack">${csrf(ctx)}<input type="hidden" name="back" value="/admin?from=${back}">
          ${textarea({ label: 'Note for this visit', name: 'admin_note', value: a.admin_note, rows: 2 })}<button class="btn btn-small" type="submit">Save note</button></form></details>
      </div></li>`;
  }

  route('POST', '/admin/appointments/:id/status', (ctx) => {
    const a = getAppointment(store, Number(ctx.params.id));
    const back = safeNext(ctx.form.back, '/admin');
    if (!a) return ctx.redirect(back);
    const action = ctx.form.action;
    if (action === 'cancel') {
      const result = cancelBooking(store, { appointment: a, by: 'admin', settings: ctx.settings, now: now() });
      if (result.error) return ctx.redirect(back, result.error);
      notifier.cancelled(result.appointment, 'admin');
      return ctx.redirect(back, `Cancelled, and ${a.client_name || a.client_email} was emailed.`);
    }
    if (['completed', 'no_show', 'booked'].includes(action)) {
      if (action === 'booked') {
        // Reopening must not collide with something booked in the meantime.
        const clash = store.get("SELECT 1 AS x FROM appointments WHERE status = 'booked' AND id != ? AND starts_at < ? AND ends_at > ?", a.id, a.ends_at, a.starts_at);
        if (clash) return ctx.redirect(back, 'Another booking now holds that time.');
      }
      setStatus(store, a.id, action);
      return ctx.redirect(back, 'Updated.');
    }
    ctx.redirect(back);
  });

  route('POST', '/admin/appointments/:id/note', (ctx) => {
    store.run('UPDATE appointments SET admin_note = ? WHERE id = ?', String(ctx.form.admin_note ?? '').trim().slice(0, 1000), Number(ctx.params.id));
    ctx.redirect(safeNext(ctx.form.back, '/admin'), 'Note saved.');
  });

  // ---- move a visit ----

  route('GET', '/admin/appointments/:id/move', (ctx) => {
    const a = getAppointment(store, Number(ctx.params.id));
    if (!a || a.status !== 'booked') return ctx.redirect('/admin');
    const s = new Date(a.starts_at);
    page(ctx, 'schedule', 'Move a visit', html`<h1>Move ${a.client_name || a.client_email}'s visit</h1>
  <p class="muted">${a.service_name}, now ${formatDayShort(s, tz)} at ${formatTime(s, tz)}. You can pick any time, even outside your usual hours. Double-booking is blocked.</p>
  <form method="post" action="/admin/appointments/${a.id}/move" class="stack narrow-form">${csrf(ctx)}
    ${field({ label: 'Date', name: 'date', type: 'date', value: localDate(s, tz), required: true })}
    ${field({ label: 'Start time', name: 'time', type: 'time', value: hhmm(minutesOfDay(s, tz)), required: true })}
    <button class="btn" type="submit">Move and email them</button></form>`);
  });

  route('POST', '/admin/appointments/:id/move', (ctx) => {
    const a = getAppointment(store, Number(ctx.params.id));
    if (!a || a.status !== 'booked') return ctx.redirect('/admin');
    const mins = parseTime(ctx.form.time);
    if (!isDateStr(ctx.form.date) || mins == null) return ctx.redirect(`/admin/appointments/${a.id}/move`, 'Please pick a date and time.');
    const result = moveBooking(store, { settings: ctx.settings, tz, now: now(), appointment: a, startMs: zonedToUtc(ctx.form.date, mins, tz).getTime(), override: true });
    if (result.error) return ctx.redirect(`/admin/appointments/${a.id}/move`, result.error);
    notifier.moved(result.appointment);
    ctx.redirect(`/admin?from=${ctx.form.date}`, 'Moved, and they were emailed.');
  });

  // ---- book a client by hand (phone, text, walk-up) ----

  const newBookingForm = (ctx, values = {}, error = '') => page(ctx, 'new', 'Book a client', html`
  <h1>Book a client</h1>
  <p class="muted">For people who text you. You can book outside your usual hours; double-booking is blocked.</p>
  ${error ? html`<p class="error" role="alert">${error}</p>` : ''}
  <form method="post" action="/admin/new" class="stack narrow-form">${csrf(ctx)}
    ${field({ label: 'Client email', name: 'email', type: 'email', value: values.email ?? '', required: true })}
    ${field({ label: 'Client name', name: 'name', value: values.name ?? '' })}
    ${field({ label: 'Mobile', name: 'phone', type: 'tel', value: values.phone ?? '' })}
    <label class="field"><span>Service</span><select name="service" required>${listServices(store).map((s) => html`<option value="${s.id}"${String(values.service) === String(s.id) ? raw(' selected') : ''}>${s.category}: ${s.name} (${formatDuration(s.duration_min)}, ${money(s.price_cents)})</option>`)}</select></label>
    ${field({ label: 'Date', name: 'date', type: 'date', value: values.date ?? '', required: true })}
    ${field({ label: 'Start time', name: 'time', type: 'time', value: values.time ?? '', required: true })}
    <label class="check"><input type="checkbox" name="notify" value="1" checked> <span>Email them a confirmation</span></label>
    <button class="btn" type="submit">Book</button></form>`, error ? 400 : 200);

  route('GET', '/admin/new', (ctx) => newBookingForm(ctx));

  route('POST', '/admin/new', (ctx) => {
    const email = normalizeEmail(ctx.form.email);
    const service = store.get('SELECT * FROM services WHERE id = ? AND active = 1', Number(ctx.form.service));
    const mins = parseTime(ctx.form.time);
    if (!email) return newBookingForm(ctx, ctx.form, 'That email does not look right.');
    if (!service) return newBookingForm(ctx, ctx.form, 'Pick a service.');
    if (!isDateStr(ctx.form.date) || mins == null) return newBookingForm(ctx, ctx.form, 'Pick a date and a start time.');
    let user = store.get('SELECT * FROM users WHERE email = ?', email);
    if (!user) {
      const r = store.run('INSERT INTO users (email, name, phone, email_verified, created_at) VALUES (?, ?, ?, 0, ?)', email, String(ctx.form.name ?? '').trim().slice(0, 120), String(ctx.form.phone ?? '').trim().slice(0, 40), now().toISOString());
      user = store.get('SELECT * FROM users WHERE id = ?', r.id);
    }
    const result = createBooking(store, {
      settings: ctx.settings, tz, now: now(), userId: user.id, service, addons: [],
      startMs: zonedToUtc(ctx.form.date, mins, tz).getTime(), createdBy: 'admin', override: true,
    });
    if (result.error) return newBookingForm(ctx, ctx.form, result.error);
    if (ctx.form.notify) notifier.confirmed(result.appointment);
    ctx.redirect(`/admin?from=${ctx.form.date}`, `Booked ${user.name || email} for ${formatDateStr(ctx.form.date)} at ${formatMinutes(mins)}.`);
  });

  // ---- clients ----

  route('GET', '/admin/clients', (ctx) => {
    const q = String(ctx.query.get('q') ?? '').trim().slice(0, 80);
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const rows = store.all(
      `SELECT u.id, u.name, u.email, u.phone,
              (SELECT COUNT(*) FROM appointments a WHERE a.user_id = u.id AND a.status IN ('booked', 'completed')) AS visits,
              (SELECT MAX(starts_at) FROM appointments a WHERE a.user_id = u.id AND a.status IN ('booked', 'completed')) AS last_visit
         FROM users u
        WHERE u.id IN (SELECT user_id FROM appointments)
          AND (? = '' OR u.name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\' OR u.phone LIKE ? ESCAPE '\\')
        ORDER BY last_visit DESC LIMIT 300`, q, like, like, like);
    page(ctx, 'clients', 'Clients', html`<h1>Clients</h1>
  <form method="get" action="/admin/clients" class="search"><input type="search" name="q" value="${q}" placeholder="Search name, email or phone" aria-label="Search clients"><button class="btn btn-small" type="submit">Search</button></form>
  ${rows.length ? html`<table class="table"><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Visits</th><th>Last / next</th></tr></thead><tbody>
    ${rows.map((u) => html`<tr><td><a href="/admin/clients/${u.id}">${u.name || '(no name yet)'}</a></td><td>${u.email}</td><td>${u.phone}</td><td>${u.visits}</td><td>${u.last_visit ? formatDayShort(new Date(u.last_visit), tz) : ''}</td></tr>`)}
  </tbody></table>` : html`<p class="muted">No clients yet.</p>`}`);
  });

  route('GET', '/admin/clients/:id', (ctx) => {
    const u = store.get('SELECT * FROM users WHERE id = ?', Number(ctx.params.id));
    if (!u) return ctx.redirect('/admin/clients');
    const intake = getIntake(store, u.id);
    const visits = store.all('SELECT id FROM appointments WHERE user_id = ? ORDER BY starts_at DESC', u.id).map((r) => getAppointment(store, r.id));
    const a = intake?.answers;
    page(ctx, 'clients', u.name || u.email, html`<h1>${u.name || u.email}</h1>
  <p>${u.email}${u.phone ? html` · <a href="sms:${u.phone.replace(/[^\d+]/g, '')}">${u.phone}</a>` : ''}</p>
  <h2>Health form</h2>
  ${intake ? html`<div class="note">
    <p>${flagsFor(intake).length ? flagsFor(intake).map((f) => html`<span class="flag">${f}</span> `) : 'Nothing flagged.'}</p>
    <p class="small">Pregnant or nursing: ${a.pregnant}. Accutane in 6 months: ${a.isotretinoin}.</p>
    ${a.medications ? html`<p class="small"><strong>Meds / active skincare:</strong> ${a.medications}</p>` : ''}
    ${a.goals ? html`<p class="small"><strong>Goals:</strong> ${a.goals}</p>` : ''}
    <p class="muted small">Signed ${intake.signedName}, ${formatDayShort(new Date(intake.signedAt), tz)}.</p></div>` : html`<p class="notice">No health form on file yet.</p>`}
  <h2>Private notes</h2>
  <form method="post" action="/admin/clients/${u.id}/notes" class="stack narrow-form">${csrf(ctx)}
    ${textarea({ label: 'Skin notes, products used, preferences', name: 'admin_notes', value: u.admin_notes, rows: 5 })}
    <button class="btn" type="submit">Save notes</button></form>
  <h2>Visits</h2>
  ${visits.length ? html`<ul class="visits">${visits.map((v) => html`<li class="visit"><div><strong>${v.service_name}</strong> ${statusBadge(v)}<br><span>${formatDayShort(new Date(v.starts_at), tz)} · ${formatTime(new Date(v.starts_at), tz)} · ${money(v.price_cents)}</span>${v.admin_note ? html`<br><span class="small muted">${v.admin_note}</span>` : ''}</div></li>`)}</ul>` : html`<p class="muted">No visits.</p>`}`);
  });

  route('POST', '/admin/clients/:id/notes', (ctx) => {
    store.run('UPDATE users SET admin_notes = ? WHERE id = ?', String(ctx.form.admin_notes ?? '').slice(0, 5000), Number(ctx.params.id));
    ctx.redirect(`/admin/clients/${Number(ctx.params.id)}`, 'Notes saved.');
  });

  // ---- menu: services and add-ons ----

  route('GET', '/admin/services', (ctx) => {
    const services = listServices(store, { includeInactive: true });
    const addons = store.all('SELECT * FROM addons ORDER BY sort, id');
    page(ctx, 'services', 'Menu', html`<h1>Menu</h1>
  <p class="muted">What clients can book. Turn a service off to hide it without losing its history.</p>
  <p><a class="btn btn-small" href="/admin/services/new">Add a service</a></p>
  <table class="table"><thead><tr><th>Service</th><th>Category</th><th>Time</th><th>Price</th><th></th></tr></thead><tbody>
    ${services.map((s) => html`<tr class="${s.active ? '' : 'off'}"><td><a href="/admin/services/${s.id}">${s.name}</a>${s.active ? '' : html` <span class="badge quiet">Hidden</span>`}</td><td>${s.category}</td><td>${formatDuration(s.duration_min)}</td><td>${money(s.price_cents)}</td><td><a href="/admin/services/${s.id}">Edit</a></td></tr>`)}
  </tbody></table>
  <h2>Add-ons</h2>
  <p><a class="btn btn-small" href="/admin/addons/new">Add an add-on</a></p>
  <table class="table"><thead><tr><th>Add-on</th><th>Goes with</th><th>Time</th><th>Price</th><th></th></tr></thead><tbody>
    ${addons.map((a) => html`<tr class="${a.active ? '' : 'off'}"><td>${a.name}${a.active ? '' : html` <span class="badge quiet">Hidden</span>`}</td><td>${a.applies_to || 'Everything'}</td><td>${a.duration_min} min</td><td>${money(a.price_cents)}</td><td><a href="/admin/addons/${a.id}">Edit</a></td></tr>`)}
  </tbody></table>`);
  });

  const categoryList = () => store.all('SELECT DISTINCT category FROM services ORDER BY category').map((r) => r.category);
  const categoryField = (value, { allowAll = false } = {}) => html`<label class="field"><span>${allowAll ? 'Goes with (category)' : 'Category'}</span>
    <input name="category" list="cats" value="${value}"${allowAll ? '' : raw(' required')}>
    <datalist id="cats">${categoryList().map((c) => html`<option value="${c}">`)}</datalist>
    ${allowAll ? html`<small>Leave blank for every service.</small>` : ''}</label>`;

  const serviceForm = (ctx, s, error = '') => page(ctx, 'services', s.id ? s.name : 'New service', html`
  <h1>${s.id ? 'Edit service' : 'New service'}</h1>
  ${error ? html`<p class="error" role="alert">${error}</p>` : ''}
  <form method="post" action="/admin/services/${s.id || 'new'}" class="stack narrow-form">${csrf(ctx)}
    ${field({ label: 'Name', name: 'name', value: s.name, required: true })}
    ${categoryField(s.category)}
    ${textarea({ label: 'Description', name: 'description', value: s.description, rows: 3 })}
    ${textarea({ label: 'Before-you-come note (prep, who should skip it)', name: 'prep_note', value: s.prep_note, rows: 2 })}
    ${field({ label: 'Length (minutes)', name: 'duration_min', type: 'number', value: s.duration_min, required: true, attrs: ' min="5" max="480" step="5"' })}
    ${field({ label: 'Price ($)', name: 'price', type: 'number', value: (s.price_cents / 100).toFixed(2), required: true, attrs: ' min="0" max="5000" step="0.01"', hint: '0 shows as Complimentary.' })}
    <label class="check"><input type="checkbox" name="active" value="1"${s.active ? raw(' checked') : ''}> <span>Available to book</span></label>
    <button class="btn" type="submit">Save</button> <a href="/admin/services">Cancel</a></form>`, error ? 400 : 200);

  const slugify = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'service';

  route('GET', '/admin/services/:id', (ctx) => {
    if (ctx.params.id === 'new') return serviceForm(ctx, { id: 0, name: '', category: '', description: '', prep_note: '', duration_min: 60, price_cents: 0, active: 1 });
    const s = store.get('SELECT * FROM services WHERE id = ?', Number(ctx.params.id));
    return s ? serviceForm(ctx, s) : ctx.redirect('/admin/services');
  });

  route('POST', '/admin/services/:id', (ctx) => {
    const id = ctx.params.id === 'new' ? 0 : Number(ctx.params.id);
    const f = ctx.form;
    const draft = { id, name: String(f.name ?? '').trim(), category: String(f.category ?? '').trim(), description: String(f.description ?? '').trim(), prep_note: String(f.prep_note ?? '').trim(), duration_min: Number(f.duration_min), price_cents: Math.round(Number(f.price) * 100), active: f.active ? 1 : 0 };
    if (!draft.name || !draft.category) return serviceForm(ctx, draft, 'Name and category are needed.');
    if (!Number.isInteger(draft.duration_min) || draft.duration_min < 5 || draft.duration_min > 480) return serviceForm(ctx, draft, 'Length must be between 5 and 480 minutes.');
    if (!Number.isInteger(draft.price_cents) || draft.price_cents < 0 || draft.price_cents > 500_000) return serviceForm(ctx, draft, 'Check the price.');
    if (id) {
      store.run('UPDATE services SET name = ?, category = ?, description = ?, prep_note = ?, duration_min = ?, price_cents = ?, active = ? WHERE id = ?',
        draft.name, draft.category, draft.description, draft.prep_note, draft.duration_min, draft.price_cents, draft.active, id);
    } else {
      let slug = slugify(draft.name);
      for (let n = 2; store.get('SELECT 1 AS x FROM services WHERE slug = ?', slug); n += 1) slug = `${slugify(draft.name)}-${n}`;
      const sort = (store.get('SELECT MAX(sort) AS m FROM services').m ?? 0) + 1;
      store.run('INSERT INTO services (slug, name, category, description, prep_note, duration_min, price_cents, active, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        slug, draft.name, draft.category, draft.description, draft.prep_note, draft.duration_min, draft.price_cents, draft.active, sort);
    }
    ctx.redirect('/admin/services', 'Menu saved.');
  });

  const addonForm = (ctx, a, error = '') => page(ctx, 'services', a.id ? a.name : 'New add-on', html`
  <h1>${a.id ? 'Edit add-on' : 'New add-on'}</h1>
  ${error ? html`<p class="error" role="alert">${error}</p>` : ''}
  <form method="post" action="/admin/addons/${a.id || 'new'}" class="stack narrow-form">${csrf(ctx)}
    ${field({ label: 'Name', name: 'name', value: a.name, required: true })}
    ${categoryField(a.applies_to, { allowAll: true })}
    ${field({ label: 'Extra time (minutes)', name: 'duration_min', type: 'number', value: a.duration_min, required: true, attrs: ' min="0" max="240" step="5"' })}
    ${field({ label: 'Price ($)', name: 'price', type: 'number', value: (a.price_cents / 100).toFixed(2), required: true, attrs: ' min="0" max="5000" step="0.01"' })}
    <label class="check"><input type="checkbox" name="active" value="1"${a.active ? raw(' checked') : ''}> <span>Available to book</span></label>
    <button class="btn" type="submit">Save</button> <a href="/admin/services">Cancel</a></form>`, error ? 400 : 200);

  route('GET', '/admin/addons/:id', (ctx) => {
    if (ctx.params.id === 'new') return addonForm(ctx, { id: 0, name: '', applies_to: '', duration_min: 10, price_cents: 0, active: 1 });
    const a = store.get('SELECT * FROM addons WHERE id = ?', Number(ctx.params.id));
    return a ? addonForm(ctx, a) : ctx.redirect('/admin/services');
  });

  route('POST', '/admin/addons/:id', (ctx) => {
    const id = ctx.params.id === 'new' ? 0 : Number(ctx.params.id);
    const f = ctx.form;
    const draft = { id, name: String(f.name ?? '').trim(), applies_to: String(f.category ?? '').trim(), duration_min: Number(f.duration_min), price_cents: Math.round(Number(f.price) * 100), active: f.active ? 1 : 0 };
    if (!draft.name) return addonForm(ctx, draft, 'Give it a name.');
    if (!Number.isInteger(draft.duration_min) || draft.duration_min < 0 || draft.duration_min > 240) return addonForm(ctx, draft, 'Extra time must be between 0 and 240 minutes.');
    if (!Number.isInteger(draft.price_cents) || draft.price_cents < 0 || draft.price_cents > 500_000) return addonForm(ctx, draft, 'Check the price.');
    if (id) store.run('UPDATE addons SET name = ?, applies_to = ?, duration_min = ?, price_cents = ?, active = ? WHERE id = ?', draft.name, draft.applies_to, draft.duration_min, draft.price_cents, draft.active, id);
    else store.run('INSERT INTO addons (name, applies_to, duration_min, price_cents, active, sort) VALUES (?, ?, ?, ?, ?, (SELECT COALESCE(MAX(sort), 0) + 1 FROM addons))', draft.name, draft.applies_to, draft.duration_min, draft.price_cents, draft.active);
    ctx.redirect('/admin/services', 'Add-on saved.');
  });

  // ---- hours and time off ----

  const hoursPage = (ctx, error = '') => {
    const rows = store.all('SELECT * FROM hours ORDER BY weekday, start_min');
    const off = store.all('SELECT * FROM time_off WHERE ends_at > ? ORDER BY starts_at', now().toISOString());
    const order = [1, 2, 3, 4, 5, 6, 0];
    page(ctx, 'hours', 'Hours', html`<h1>Hours</h1>
  <p class="muted">When clients can book. Use the second row for a split day, like a lunch break. Leave both blank when you're closed.</p>
  ${error ? html`<p class="error" role="alert">${error}</p>` : ''}
  <form method="post" action="/admin/hours" class="stack hours-form">${csrf(ctx)}
    ${order.map((wd) => {
      const blocks = rows.filter((r) => r.weekday === wd);
      return html`<div class="hours-row"><strong>${DAYS[wd]}</strong>
        ${[0, 1].map((i) => html`<span class="hours-block">
          <input type="time" name="start_${wd}_${i}" value="${blocks[i] ? hhmm(blocks[i].start_min) : ''}" aria-label="${DAYS[wd]} block ${i + 1} opens"> to
          <input type="time" name="end_${wd}_${i}" value="${blocks[i] ? hhmm(blocks[i].end_min) : ''}" aria-label="${DAYS[wd]} block ${i + 1} closes"></span>`)}</div>`;
    })}
    <button class="btn" type="submit">Save hours</button></form>

  <h2>Time off</h2>
  <p class="muted">Vacation, a day away, a long lunch. Nobody can book inside these.</p>
  <form method="post" action="/admin/timeoff" class="stack hours-form">${csrf(ctx)}
    <div class="row">
      ${field({ label: 'From date', name: 'from', type: 'date', required: true })}
      ${field({ label: 'Start time', name: 'from_time', type: 'time', hint: 'Blank = start of day' })}
      ${field({ label: 'To date', name: 'to', type: 'date', required: true })}
      ${field({ label: 'End time', name: 'to_time', type: 'time', hint: 'Blank = end of day' })}
    </div>
    ${field({ label: 'Note', name: 'note' })}
    <button class="btn" type="submit">Block this time</button></form>
  ${off.length ? html`<ul class="visits">${off.map((o) => html`<li class="visit"><div>${formatDayShort(new Date(o.starts_at), tz)} ${formatTime(new Date(o.starts_at), tz)} → ${formatDayShort(new Date(o.ends_at), tz)} ${formatTime(new Date(o.ends_at), tz)}${o.note ? html` <span class="muted">${o.note}</span>` : ''}</div>
    <form method="post" action="/admin/timeoff/${o.id}/delete" class="inline-form">${csrf(ctx)}<button class="btn btn-small btn-quiet" type="submit">Remove</button></form></li>`)}</ul>` : ''}`, error ? 400 : 200);
  };

  route('GET', '/admin/hours', (ctx) => hoursPage(ctx));

  route('POST', '/admin/hours', (ctx) => {
    const blocks = [];
    for (let wd = 0; wd < 7; wd += 1) {
      for (let i = 0; i < 2; i += 1) {
        const rawStart = String(ctx.form[`start_${wd}_${i}`] ?? '');
        const rawEnd = String(ctx.form[`end_${wd}_${i}`] ?? '');
        if (!rawStart && !rawEnd) continue;
        const start = parseTime(rawStart);
        const end = parseTime(rawEnd);
        if (start == null || end == null || end <= start) return hoursPage(ctx, `${DAYS[wd]}: opening time must come before closing time.`);
        blocks.push([wd, start, end]);
      }
    }
    for (let wd = 0; wd < 7; wd += 1) {
      const day = blocks.filter((b) => b[0] === wd).sort((a, b) => a[1] - b[1]);
      for (let i = 1; i < day.length; i += 1) if (day[i][1] < day[i - 1][2]) return hoursPage(ctx, `${DAYS[wd]}: the two blocks overlap.`);
    }
    store.tx(() => {
      store.run('DELETE FROM hours');
      for (const [wd, start, end] of blocks) store.run('INSERT INTO hours (weekday, start_min, end_min) VALUES (?, ?, ?)', wd, start, end);
    });
    ctx.redirect('/admin/hours', 'Hours saved.');
  });

  route('POST', '/admin/timeoff', (ctx) => {
    const f = ctx.form;
    if (!isDateStr(f.from) || !isDateStr(f.to) || f.to < f.from) return hoursPage(ctx, 'Pick a start date, and an end date on or after it.');
    const fromMin = f.from_time ? parseTime(f.from_time) : 0;
    const toMin = f.to_time ? parseTime(f.to_time) : 1440;
    if (fromMin == null || toMin == null) return hoursPage(ctx, 'Check the times.');
    const start = zonedToUtc(f.from, fromMin, tz);
    const end = zonedToUtc(f.to, toMin, tz);
    if (end <= start) return hoursPage(ctx, 'The end must be after the start.');
    store.run('INSERT INTO time_off (starts_at, ends_at, note) VALUES (?, ?, ?)', start.toISOString(), end.toISOString(), String(f.note ?? '').trim().slice(0, 200));
    const clash = store.get("SELECT COUNT(*) AS n FROM appointments WHERE status = 'booked' AND starts_at < ? AND ends_at > ?", end.toISOString(), start.toISOString()).n;
    ctx.redirect('/admin/hours', clash ? `Blocked. Heads up: ${clash} booked visit${clash === 1 ? '' : 's'} fall${clash === 1 ? 's' : ''} in that time. Move or cancel them from the Schedule.` : 'Blocked.');
  });

  route('POST', '/admin/timeoff/:id/delete', (ctx) => {
    store.run('DELETE FROM time_off WHERE id = ?', Number(ctx.params.id));
    ctx.redirect('/admin/hours', 'Removed.');
  });

  // ---- settings ----

  const settingsPage = (ctx, error = '', values = null) => {
    const current = values ?? ctx.settings;
    const groups = [...new Set(FIELDS.map((f) => f.group))];
    page(ctx, 'settings', 'Settings', html`<h1>Settings</h1>
  ${error ? html`<p class="error" role="alert">${error}</p>` : ''}
  <form method="post" action="/admin/settings" class="stack narrow-form">${csrf(ctx)}
    ${groups.map((g) => html`<fieldset><legend>${g}</legend>${FIELDS.filter((f) => f.group === g).map((f) => (f.type === 'textarea'
      ? textarea({ label: f.label, name: f.key, value: String(current[f.key] ?? ''), rows: f.key === 'policies' ? 10 : 4 })
      : field({ label: f.label, name: f.key, type: f.type === 'number' ? 'number' : 'text', value: String(current[f.key] ?? ''), required: f.type === 'number' || f.key === 'studio_name', attrs: f.type === 'number' ? ` min="${f.min}" max="${f.max}"` : '' })))}</fieldset>`)}
    <button class="btn" type="submit">Save settings</button></form>`, error ? 400 : 200);
  };

  route('GET', '/admin/settings', (ctx) => settingsPage(ctx));

  route('POST', '/admin/settings', (ctx) => {
    const parsed = parseSettingsForm(ctx.form);
    if (parsed.error) return settingsPage(ctx, parsed.error, ctx.form);
    if (!parsed.values.studio_name) return settingsPage(ctx, 'Your studio needs a name.', ctx.form);
    saveSettings(store, parsed.values);
    ctx.redirect('/admin/settings', 'Settings saved.');
  });
}
