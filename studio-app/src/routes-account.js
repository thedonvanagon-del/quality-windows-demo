// A client's own pages: their visits, profile, health form, and each appointment.

import { checkPassword, hashPassword, passwordProblem } from './auth.js';
import { cancelBooking, getAppointment, insideWindow } from './booking.js';
import { getIntake, parseIntake, saveIntake } from './intake.js';
import { html, money, raw } from './html.js';
import { appointmentIcs, bookingSummaryForOwner } from './notify.js';
import { formatDay, formatDuration, formatTime } from './time.js';
import { intakeFields } from './routes-book.js';
import { csrf, field, layout, statusBadge } from './views.js';

export function registerAccount(add, { store, tz, notifier, now }) {
  const needUser = (ctx) => {
    if (ctx.user) return false;
    ctx.redirect(`/login?next=${encodeURIComponent(ctx.url.pathname)}`);
    return true;
  };

  const apptCard = (a) => {
    const s = new Date(a.starts_at);
    return html`<li class="visit">
      <div><strong>${a.service_name}</strong>${a.addons.map((x) => html` <span class="muted">+ ${x.name}</span>`)}<br>
        <span>${formatDay(s, tz)} · ${formatTime(s, tz)}</span> ${statusBadge(a)}</div>
      <a class="btn btn-small btn-quiet" href="/appointments/${a.id}">Details</a>
    </li>`;
  };

  add('GET', '/account', (ctx) => {
    if (needUser(ctx)) return;
    const all = store.all('SELECT id FROM appointments WHERE user_id = ? ORDER BY starts_at', ctx.user.id).map((r) => getAppointment(store, r.id));
    const nowIso = now().toISOString();
    const upcoming = all.filter((a) => a.status === 'booked' && a.ends_at > nowIso);
    const past = all.filter((a) => !upcoming.includes(a)).reverse();
    ctx.page(layout(ctx, {
      title: 'My visits', section: 'account',
      body: html`<section class="wrap page">
  <h1>${ctx.user.name ? `Hi, ${ctx.user.name.split(' ')[0]}` : 'My visits'}</h1>
  <h2>Upcoming</h2>
  ${upcoming.length ? html`<ul class="visits">${upcoming.map(apptCard)}</ul>` : html`<p class="muted">Nothing booked. <a href="/book">Book a visit</a></p>`}
  ${past.length ? html`<h2>Past</h2><ul class="visits">${past.slice(0, 20).map(apptCard)}</ul>` : ''}

  <h2>My profile</h2>
  <form method="post" action="/account" class="stack card-form">
    ${csrf(ctx)}
    ${field({ label: 'Full name', name: 'name', value: ctx.user.name, required: true, autocomplete: 'name' })}
    ${field({ label: 'Mobile', name: 'phone', type: 'tel', value: ctx.user.phone, autocomplete: 'tel' })}
    <p class="muted small">Email: ${ctx.user.email}</p>
    <label class="check"><input type="checkbox" name="email_reminders" value="1"${ctx.user.emailReminders ? raw(' checked') : ''}> <span>Email me a reminder the day before</span></label>
    <details class="more"><summary>${ctx.user.hasPassword ? 'Change password' : 'Add a password'} <em>optional</em></summary>
      ${ctx.user.hasPassword ? field({ label: 'Current password', name: 'current_password', type: 'password', autocomplete: 'current-password' }) : ''}
      ${field({ label: 'New password', name: 'new_password', type: 'password', autocomplete: 'new-password', hint: 'At least 8 characters.' })}
    </details>
    <button class="btn" type="submit">Save</button>
  </form>
  <p><a href="/account/health">My health form</a></p>
</section>`,
    }));
  });

  add('POST', '/account', (ctx) => {
    if (!ctx.user) return ctx.redirect('/login');
    const name = String(ctx.form.name ?? '').trim().slice(0, 120);
    if (name.length < 2) return ctx.redirect('/account', 'Please add your name.');
    const newPassword = String(ctx.form.new_password ?? '');
    if (newPassword) {
      const problem = passwordProblem(newPassword);
      if (problem) return ctx.redirect('/account', problem);
      if (ctx.user.hasPassword) {
        const row = store.get('SELECT password_hash FROM users WHERE id = ?', ctx.user.id);
        if (!checkPassword(String(ctx.form.current_password ?? ''), row.password_hash)) return ctx.redirect('/account', 'Your current password did not match, so nothing was changed.');
      }
      store.run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(newPassword), ctx.user.id);
    }
    store.run('UPDATE users SET name = ?, phone = ?, email_reminders = ? WHERE id = ?', name, String(ctx.form.phone ?? '').trim().slice(0, 40), ctx.form.email_reminders ? 1 : 0, ctx.user.id);
    ctx.redirect('/account', 'Saved.');
  });

  add('GET', '/account/health', (ctx) => {
    if (needUser(ctx)) return;
    const intake = getIntake(store, ctx.user.id);
    const values = intake ? { ...intake.answers, consent: '1', signed_name: intake.signedName } : {};
    ctx.page(layout(ctx, {
      title: 'Health form', section: 'account',
      body: html`<section class="wrap narrow page"><h1>My health form</h1>
  <p class="muted">${intake ? 'Update it any time your health, medications or skincare change.' : 'You can also fill this in while booking.'}</p>
  <form method="post" action="/account/health" class="stack">${csrf(ctx)}${intakeFields(values, { signedName: ctx.user.name })}<button class="btn" type="submit">Save</button></form>
  <p><a href="/account">← Back</a></p></section>`,
    }));
  });

  add('POST', '/account/health', (ctx) => {
    if (!ctx.user) return ctx.redirect('/login');
    const parsed = parseIntake(ctx.form);
    if (parsed.error) return ctx.redirect('/account/health', parsed.error);
    saveIntake(store, ctx.user.id, parsed, now());
    ctx.redirect('/account', 'Your health form is saved.');
  });

  // ---- one appointment (the client, or the owner, may look) ----

  const load = (ctx) => {
    const a = getAppointment(store, Number(ctx.params.id));
    if (!a || !ctx.user) return null;
    return a.user_id === ctx.user.id || ctx.isAdmin ? a : null;
  };

  add('GET', '/appointments/:id', (ctx) => {
    if (needUser(ctx)) return;
    const a = load(ctx);
    if (!a) return ctx.redirect('/account');
    const s = ctx.settings;
    const start = new Date(a.starts_at);
    const upcoming = a.status === 'booked' && a.ends_at > now().toISOString();
    const late = insideWindow(a, s, now());
    ctx.page(layout(ctx, {
      title: a.service_name, section: 'account',
      body: html`<section class="wrap narrow page">
  <h1>${a.service_name} ${statusBadge(a)}</h1>
  ${a.addons.length ? html`<p class="muted">With ${a.addons.map((x) => x.name).join(', ')}</p>` : ''}
  <p class="big">${formatDay(start, tz)} at ${formatTime(start, tz)}</p>
  <p class="muted">${formatDuration((Date.parse(a.ends_at) - Date.parse(a.starts_at)) / 60_000)} · ${money(a.price_cents)}, paid at your visit</p>
  ${upcoming ? html`<div class="note"><h3>Where to go</h3>
    <p>${s.address || s.public_area}</p>${s.arrival_notes ? html`<p>${s.arrival_notes}</p>` : ''}</div>
    <p><a class="btn btn-quiet" href="/appointments/${a.id}/calendar.ics">Add to my calendar</a></p>` : ''}
  ${a.client_note ? html`<p><strong>Your note:</strong> ${a.client_note}</p>` : ''}
  ${upcoming && a.user_id === ctx.user.id ? html`
    ${late
      ? html`<p class="notice">This is inside ${s.cancel_window_hours} hours, so changes aren't automatic. ${s.phone ? html`Please text <a href="sms:${s.phone.replace(/[^\d+]/g, '')}">${s.phone}</a>.` : 'Please get in touch.'} If you cancel here anyway, a late fee may apply.</p>`
      : html`<p><a class="btn" href="/appointments/${a.id}/reschedule">Change the time</a></p>`}
    <form method="post" action="/appointments/${a.id}/cancel" class="inline-form">${csrf(ctx)}
      <button class="btn btn-danger" type="submit" data-confirm="Cancel this appointment?">Cancel this appointment</button></form>` : ''}
  <p><a href="/account">← My visits</a></p>
</section>`,
    }));
  });

  add('GET', '/appointments/:id/calendar.ics', (ctx) => {
    if (!ctx.user) return ctx.redirect('/login');
    const a = load(ctx);
    if (!a || a.status !== 'booked') return ctx.redirect('/account');
    ctx.send(200, appointmentIcs(a, ctx.settings, ctx.url.hostname), 'text/calendar; charset=utf-8', { 'Content-Disposition': `attachment; filename="appointment-${a.id}.ics"` });
  });

  add('POST', '/appointments/:id/cancel', (ctx) => {
    if (!ctx.user) return ctx.redirect('/login');
    const a = getAppointment(store, Number(ctx.params.id));
    if (!a || a.user_id !== ctx.user.id) return ctx.redirect('/account');
    const result = cancelBooking(store, { appointment: a, by: 'client', settings: ctx.settings, now: now() });
    if (result.error) return ctx.redirect('/account', result.error);
    notifier.cancelled(result.appointment, 'client');
    notifier.tellOwner(`Cancelled${result.late ? ' (late)' : ''}: ${a.service_name}`, bookingSummaryForOwner(result.appointment, tz));
    ctx.redirect('/account', result.late ? 'Cancelled. Because it was inside the free window, a late fee may apply.' : 'Cancelled. No charge.');
  });
}
