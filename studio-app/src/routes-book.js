// The booking flow: service → extras → time → confirm. Plain links and forms,
// no JavaScript, so it works on any phone and every step has its own address.

import {
  addonsFor, createBooking, getAppointment, moveBooking, pickAddons, serviceBySlug, totals, insideWindow,
} from './booking.js';
import { createAvailability } from './availability.js';
import { hasIntake, parseIntake, saveIntake, CONDITIONS } from './intake.js';
import { html, money, raw } from './html.js';
import {
  addDays, addMonths, formatDay, formatDuration, formatTime, isDateStr, isMonthStr, localDate,
} from './time.js';
import { bookingSummaryForOwner } from './notify.js';
import { calendar, csrf, field, layout, steps, textarea } from './views.js';

/** A start time in the URL must be a real ISO instant, written exactly as we write them. */
export function parseStart(raw) {
  const d = new Date(String(raw ?? ''));
  return Number.isNaN(d.getTime()) || d.toISOString() !== raw ? null : d;
}

export function registerBook(add, deps) {
  const { store, tz, notifier, now } = deps;

  // ---- step 2: extras ----
  add('GET', '/book/:slug', (ctx) => {
    const service = serviceBySlug(store, ctx.params.slug);
    if (!service) return ctx.redirect('/book');
    const extras = addonsFor(store, service);
    if (!extras.length) return ctx.redirect(`/book/${service.slug}/times`);
    ctx.page(layout(ctx, {
      title: service.name, section: 'book',
      body: html`<section class="wrap narrow page">
  ${steps(1)}
  <h1>${service.name}</h1>
  <p class="muted">${formatDuration(service.duration_min)} · ${money(service.price_cents)}</p>
  <form method="get" action="/book/${service.slug}/times" class="stack">
    <fieldset class="checks"><legend>Add something? <em>optional</em></legend>
      ${extras.map((a) => html`<label class="check"><input type="checkbox" name="addons" value="${a.id}"> <span>${a.name}</span> <span class="muted">+${money(a.price_cents)} · ${a.duration_min} min</span></label>`)}
    </fieldset>
    <button class="btn" type="submit">See open times</button>
  </form>
  <p><a href="/book">← Choose a different service</a></p>
</section>`,
    }));
  });

  // ---- step 3: pick a day and time (new booking) ----
  add('GET', '/book/:slug/times', (ctx) => {
    const service = serviceBySlug(store, ctx.params.slug);
    if (!service) return ctx.redirect('/book');
    const addons = pickAddons(store, service, ctx.query.getAll('addons'));
    const { durationMin, priceCents } = totals(service, addons);
    const addonParam = addons.map((a) => a.id).join(',');
    const q = (extra = {}) => {
      const p = new URLSearchParams();
      if (addonParam) p.set('addons', addonParam);
      for (const [k, v] of Object.entries(extra)) p.set(k, v);
      return `?${p}`;
    };
    ctx.page(layout(ctx, {
      title: `Pick a time: ${service.name}`, section: 'book',
      body: timesBody(ctx, {
        deps, heading: service.name,
        summary: html`${formatDuration(durationMin)} · ${money(priceCents)}${addons.length ? html` · with ${addons.map((a) => a.name).join(', ')}` : ''}`,
        durationMin, ignoreId: null, stepIndex: 2,
        pathBase: `/book/${service.slug}/times`, query: q,
        slotHref: (iso) => `/book/${service.slug}/confirm${q({ start: iso })}`,
        backHref: addonsFor(store, service).length ? `/book/${service.slug}` : '/book', backLabel: 'Back',
      }),
    }));
  });

  // ---- step 4: confirm ----
  const confirmContext = (ctx, source) => {
    const service = serviceBySlug(store, ctx.params.slug);
    if (!service) return { redirect: '/book' };
    const addons = pickAddons(store, service, [source.addons]);
    const start = parseStart(source.start);
    const addonParam = addons.map((a) => a.id).join(',');
    const timesUrl = `/book/${service.slug}/times${addonParam ? `?addons=${addonParam}` : ''}`;
    if (!start) return { redirect: timesUrl };
    const { durationMin, priceCents } = totals(service, addons);
    const date = localDate(start, tz);
    const avail = createAvailability({ store, settings: ctx.settings, tz, now: now(), fromDate: date, toDate: date });
    const open = avail.slots(date, durationMin).some((s) => s.getTime() === start.getTime());
    if (!open) return { redirect: timesUrl, flash: 'That time is no longer open. Here are the current times.' };
    return { service, addons, start, durationMin, priceCents, addonParam, timesUrl };
  };

  add('GET', '/book/:slug/confirm', (ctx) => {
    const c = confirmContext(ctx, { addons: ctx.query.getAll('addons').join(','), start: ctx.query.get('start') });
    if (c.redirect) return ctx.redirect(c.redirect, c.flash);
    ctx.page(confirmPage(ctx, c));
  });

  add('POST', '/book/:slug/confirm', async (ctx) => {
    if (!ctx.user) return ctx.redirect('/login');
    const c = confirmContext(ctx, ctx.form);
    if (c.redirect) return ctx.redirect(c.redirect, c.flash);
    const fail = (error) => ctx.page(confirmPage(ctx, c, { error, values: ctx.form }), 400);

    const needsName = !ctx.user.name;
    const name = String(ctx.form.name ?? '').trim().slice(0, 120);
    if (needsName && name.length < 2) return fail('Please add your name so I know who to expect.');
    if (!ctx.form.agree) return fail('Please agree to the cancellation policy to book.');
    let intake = null;
    if (!hasIntake(store, ctx.user.id)) {
      intake = parseIntake(ctx.form);
      if (intake.error) return fail(intake.error);
    }

    if (needsName) store.run('UPDATE users SET name = ? WHERE id = ?', name, ctx.user.id);
    const phone = String(ctx.form.phone ?? '').trim().slice(0, 40);
    if (phone && phone !== ctx.user.phone) store.run('UPDATE users SET phone = ? WHERE id = ?', phone, ctx.user.id);
    if (intake) saveIntake(store, ctx.user.id, intake, now());

    const result = createBooking(store, {
      settings: ctx.settings, tz, now: now(), userId: ctx.user.id, service: c.service, addons: c.addons,
      startMs: c.start.getTime(), clientNote: String(ctx.form.note ?? '').trim(),
    });
    if (result.error) return ctx.redirect(c.timesUrl, result.error);
    const appt = result.appointment;
    notifier.confirmed(appt);
    notifier.tellOwner(`New booking: ${appt.service_name}`, `${bookingSummaryForOwner(appt, tz)}\n\nSchedule: ${deps.config.appUrl ?? ''}/admin`);
    ctx.redirect(`/appointments/${appt.id}`, 'You are booked. A confirmation is on its way to your email.');
  });

  // ---- rescheduling an existing appointment ----
  const loadOwn = (ctx) => {
    if (!ctx.user) return null;
    const a = getAppointment(store, Number(ctx.params.id));
    return a && a.user_id === ctx.user.id ? a : null;
  };

  add('GET', '/appointments/:id/reschedule', (ctx) => {
    if (!ctx.user) return ctx.redirect(`/login?next=${encodeURIComponent(ctx.url.pathname)}`);
    const appt = loadOwn(ctx);
    if (!appt || appt.status !== 'booked') return ctx.redirect('/account');
    if (insideWindow(appt, ctx.settings, now())) {
      return ctx.redirect(`/appointments/${appt.id}`, `Changes inside ${ctx.settings.cancel_window_hours} hours need a text to ${ctx.settings.phone || 'the studio'}.`);
    }
    const durationMin = (Date.parse(appt.ends_at) - Date.parse(appt.starts_at)) / 60_000;
    const startParam = ctx.query.get('start');
    const start = startParam ? parseStart(startParam) : null;
    if (start) {
      const date = localDate(start, tz);
      const open = createAvailability({ store, settings: ctx.settings, tz, now: now(), fromDate: date, toDate: date, ignoreId: appt.id })
        .slots(date, durationMin).some((s) => s.getTime() === start.getTime());
      if (!open) return ctx.redirect(`/appointments/${appt.id}/reschedule`, 'That time is no longer open.');
      return ctx.page(layout(ctx, {
        title: 'Confirm the new time', section: 'account',
        body: html`<section class="wrap narrow page">
  <h1>Move your visit?</h1>
  <p><strong>${appt.service_name}</strong></p>
  <p class="muted">Now: ${formatDay(new Date(appt.starts_at), tz)} at ${formatTime(new Date(appt.starts_at), tz)}</p>
  <p class="big">New: ${formatDay(start, tz)} at ${formatTime(start, tz)}</p>
  <form method="post" action="/appointments/${appt.id}/reschedule" class="stack">
    ${csrf(ctx)}<input type="hidden" name="start" value="${start.toISOString()}">
    <button class="btn" type="submit">Yes, move it</button>
  </form>
  <p><a href="/appointments/${appt.id}/reschedule">← Pick another time</a></p>
</section>`,
      }));
    }
    const q = () => '';
    ctx.page(layout(ctx, {
      title: 'Reschedule', section: 'account',
      body: timesBody(ctx, {
        deps, heading: `Move your ${appt.service_name}`,
        summary: html`Now: ${formatDay(new Date(appt.starts_at), tz)} at ${formatTime(new Date(appt.starts_at), tz)}`,
        durationMin, ignoreId: appt.id, stepIndex: null,
        pathBase: `/appointments/${appt.id}/reschedule`, query: q,
        slotHref: (iso) => `/appointments/${appt.id}/reschedule?start=${encodeURIComponent(iso)}`,
        backHref: `/appointments/${appt.id}`, backLabel: 'Keep my current time',
      }),
    }));
  });

  add('POST', '/appointments/:id/reschedule', (ctx) => {
    const appt = loadOwn(ctx);
    if (!appt || appt.status !== 'booked') return ctx.redirect('/account');
    if (insideWindow(appt, ctx.settings, now())) return ctx.redirect(`/appointments/${appt.id}`, 'It is too close to the appointment to change online. Please text.');
    const start = parseStart(ctx.form.start);
    if (!start) return ctx.redirect(`/appointments/${appt.id}/reschedule`);
    const result = moveBooking(store, { settings: ctx.settings, tz, now: now(), appointment: appt, startMs: start.getTime() });
    if (result.error) return ctx.redirect(`/appointments/${appt.id}/reschedule`, result.error);
    notifier.moved(result.appointment);
    notifier.tellOwner(`Moved: ${appt.service_name}`, `${bookingSummaryForOwner(result.appointment, tz)}\n\nWas ${formatDay(new Date(appt.starts_at), tz)} at ${formatTime(new Date(appt.starts_at), tz)}.`);
    ctx.redirect(`/appointments/${appt.id}`, 'Moved. A new confirmation is on its way.');
  });
}

// ---- shared: the "pick a day and time" body ----

export function timesBody(ctx, { deps, heading, summary, durationMin, ignoreId, stepIndex, pathBase, query, slotHref, backHref, backLabel }) {
  const { store, tz, now } = deps;
  const s = ctx.settings;
  const today = localDate(now(), tz);
  const lastDay = localDate(new Date(now().getTime() + s.max_advance_days * 86_400_000), tz);
  const avail = createAvailability({ store, settings: s, tz, now: now(), fromDate: today, toDate: lastDay, ignoreId });

  const openDays = new Set();
  for (let d = today; d <= lastDay; d = addDays(d, 1)) if (avail.hasAny(d, durationMin)) openDays.add(d);

  const dateParam = ctx.query.get('date');
  let selected = isDateStr(dateParam) && openDays.has(dateParam) ? dateParam : null;
  const first = [...openDays][0] ?? null;
  const monthParam = ctx.query.get('month');
  const month = isMonthStr(monthParam) ? monthParam : (selected ?? first ?? today).slice(0, 7);

  const withQuery = (extra) => {
    const base = new URLSearchParams(query().replace(/^\?/, ''));
    for (const [k, v] of Object.entries(extra)) base.set(k, v);
    return `${pathBase}?${base}`;
  };
  const times = selected ? avail.slots(selected, durationMin) : [];

  return html`<section class="wrap page">
  ${stepIndex == null ? '' : steps(stepIndex)}
  <h1>${heading}</h1>
  <p class="muted">${summary}</p>
  ${openDays.size === 0
    ? html`<p class="notice">There are no open times in the next ${s.max_advance_days} days. ${s.phone ? html`Text <a href="sms:${s.phone.replace(/[^\d+]/g, '')}">${s.phone}</a> and I'll find a spot.` : 'Please check back soon.'}</p>`
    : html`<div class="times-layout">
    ${calendar({
      month, openDays, selected, today,
      hrefFor: (d) => withQuery({ date: d, month: d.slice(0, 7) }),
      monthHref: (m) => withQuery({ month: m }),
      canPrev: month > today.slice(0, 7),
      canNext: addMonths(month, 1) <= lastDay.slice(0, 7),
    })}
    <div class="slots">
      ${selected
        ? html`<h2>${formatDay(new Date(`${selected}T12:00:00Z`), 'UTC')}</h2>
          <ul class="slot-list">${times.map((t) => html`<li><a class="slot" href="${slotHref(t.toISOString())}">${formatTime(t, tz)}</a></li>`)}</ul>`
        : html`<p class="muted">Pick a highlighted day to see times.</p>${first ? html`<p><a class="btn btn-quiet" href="${withQuery({ date: first, month: first.slice(0, 7) })}">Next opening: ${formatDay(new Date(`${first}T12:00:00Z`), 'UTC')}</a></p>` : ''}`}
    </div>
  </div>`}
  <p><a href="${backHref}">← ${backLabel}</a></p>
</section>`;
}

// ---- the confirm page ----

function confirmPage(ctx, c, { error = '', values = {} } = {}) {
  const s = ctx.settings;
  const tz = ctx.tz;
  const { service, addons, start, durationMin, priceCents, addonParam } = c;
  const here = `/book/${service.slug}/confirm?${new URLSearchParams({ ...(addonParam ? { addons: addonParam } : {}), start: start.toISOString() })}`;
  const summary = html`<div class="summary">
    <h2>${service.name}${addons.map((a) => html` <span class="muted">+ ${a.name}</span>`)}</h2>
    <p class="big">${formatDay(start, tz)} at ${formatTime(start, tz)}</p>
    <p class="muted">${formatDuration(durationMin)} · ${money(priceCents)}, paid at your visit · ${s.public_area}</p>
    ${service.prep_note ? html`<p class="prep"><strong>Before you come:</strong> ${service.prep_note}</p>` : ''}
  </div>`;

  if (!ctx.user) {
    return layout(ctx, {
      title: 'Confirm', section: 'book',
      body: html`<section class="wrap narrow page">${steps(3)}<h1>Almost there</h1>${summary}
  <h2>Sign in to finish</h2>
  <p>Use your email. It takes a minute, and you'll be able to change or cancel later.</p>
  <p class="hero-actions"><a class="btn" href="/login?next=${encodeURIComponent(here)}">Continue with email</a> <a class="btn btn-quiet" href="/signup?next=${encodeURIComponent(here)}">Create a profile</a></p>
  <p><a href="${c.timesUrl}">← Pick a different time</a></p>
</section>`,
    });
  }

  const needsIntake = !hasIntake(ctx.store, ctx.user.id);
  const v = (k) => String(values[k] ?? '');
  return layout(ctx, {
    title: 'Confirm', section: 'book',
    body: html`<section class="wrap narrow page">${steps(3)}<h1>Confirm your visit</h1>${summary}
  ${error ? html`<p class="error" role="alert">${error}</p>` : ''}
  <form method="post" action="/book/${service.slug}/confirm" class="stack">
    ${csrf(ctx)}<input type="hidden" name="start" value="${start.toISOString()}"><input type="hidden" name="addons" value="${addonParam}">
    ${ctx.user.name ? '' : field({ label: 'Your full name', name: 'name', value: v('name'), required: true, autocomplete: 'name' })}
    ${ctx.user.phone ? '' : field({ label: 'Mobile', name: 'phone', type: 'tel', value: v('phone'), autocomplete: 'tel', hint: 'In case I need to reach you about your visit.' })}
    ${textarea({ label: 'Anything I should know?', name: 'note', value: v('note'), hint: 'Skin concerns, sensitivities, what you want out of the visit.' })}
    ${needsIntake ? intakeFields(values) : html`<p class="muted small">Your health form is on file. <a href="/account/health">Review it</a>.</p>`}
    <label class="check agree"><input type="checkbox" name="agree" value="1"${values.agree ? raw(' checked') : ''} required> <span>I understand I can change or cancel free until ${s.cancel_window_hours} hours before. Later changes may be charged.</span></label>
    <button class="btn" type="submit">Book it</button>
  </form>
  <p class="muted small">Signed in as ${ctx.user.email}. <a href="${c.timesUrl}">Pick a different time</a></p>
</section>`,
  });
}

/** The health questionnaire fields. Reused on the confirm page and in My Account. */
export function intakeFields(values = {}, { signedName = '' } = {}) {
  const selected = [values.conditions ?? []].flat();
  const radio = (name, v, label) => html`<label class="check"><input type="radio" name="${name}" value="${v}"${values[name] === v ? raw(' checked') : ''} required> <span>${label}</span></label>`;
  return html`<fieldset class="intake">
    <legend>Quick health check <em>(first visit only)</em></legend>
    <p class="muted small">This keeps you safe. Treatments like peels, microneedling and waxing aren't right for everyone. It stays private.</p>
    <div class="q"><p>Are you pregnant or nursing?</p>${radio('pregnant', 'no', 'No')}${radio('pregnant', 'yes', 'Yes')}${radio('pregnant', 'unsure', 'Not sure')}</div>
    <div class="q"><p>Have you taken Accutane (isotretinoin) in the last 6 months?</p>${radio('isotretinoin', 'no', 'No')}${radio('isotretinoin', 'yes', 'Yes')}</div>
    <div class="q"><p>Anything here apply to you?</p>
      ${CONDITIONS.map((c) => html`<label class="check"><input type="checkbox" name="conditions" value="${c}"${selected.includes(c) ? raw(' checked') : ''}> <span>${c}</span></label>`)}
    </div>
    ${textarea({ label: 'Allergies or sensitivities', name: 'allergies', value: String(values.allergies ?? ''), rows: 2 })}
    ${textarea({ label: 'Medications or active skincare (retinoids, acids)', name: 'medications', value: String(values.medications ?? ''), rows: 2 })}
    ${textarea({ label: 'What would you like help with?', name: 'goals', value: String(values.goals ?? ''), rows: 2 })}
    <label class="check agree"><input type="checkbox" name="consent" value="1"${values.consent ? raw(' checked') : ''} required> <span>My answers are true. I consent to treatment, and I'll tell my esthetician about any change in my health.</span></label>
    ${field({ label: 'Type your full name to sign', name: 'signed_name', value: String(values.signed_name ?? signedName), required: true })}
  </fieldset>`;
}
