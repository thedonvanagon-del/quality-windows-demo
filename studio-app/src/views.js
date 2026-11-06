// Page shell and the small pieces every page shares.

import { html, raw, money } from './html.js';
import { addMonths, daysInMonth, formatDuration, formatMonth, pad, weekdayOf } from './time.js';
import { CATEGORY_ORDER } from './seed.js';

export function layout(ctx, { title, body, description, section = '' }) {
  const s = ctx.settings;
  const flash = ctx.takeFlash();
  const nav = (href, label, key) => html`<a href="${href}"${section === key ? raw(' aria-current="page"') : ''}>${label}</a>`;
  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title ? `${title} · ${s.studio_name}` : s.studio_name}</title>
<meta name="description" content="${description ?? s.tagline}">
<meta name="theme-color" content="#f6f1e9">
<link rel="icon" href="/static/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/static/style.css">
<script src="/static/app.js" defer></script>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
  <div class="wrap bar">
    <a class="brand" href="/">${s.studio_name}</a>
    <nav class="nav" aria-label="Main">
      ${nav('/services', 'Services', 'services')}
      ${nav('/policies', 'Policies', 'policies')}
      ${ctx.isAdmin ? nav('/admin', 'Schedule', 'admin') : ''}
      ${ctx.user ? nav('/account', 'My visits', 'account') : nav('/login', 'Sign in', 'login')}
      <a class="btn btn-small" href="/book">Book now</a>
    </nav>
  </div>
</header>
${flash ? html`<div class="flash wrap" role="status">${flash}</div>` : ''}
<main id="main">${body}</main>
<footer class="site-footer">
  <div class="wrap foot">
    <div>
      <strong>${s.studio_name}</strong>
      <p>${s.public_area}. Private home studio, by appointment. The address comes with your confirmation.</p>
    </div>
    <div>
      ${s.phone ? html`<p>Text <a href="sms:${s.phone.replace(/[^\d+]/g, '')}">${s.phone}</a></p>` : ''}
      ${s.instagram ? html`<p><a href="https://instagram.com/${encodeURIComponent(s.instagram)}" rel="noopener">@${s.instagram}</a></p>` : ''}
      <p class="muted small">${ctx.user ? html`<form class="inline" method="post" action="/logout">${csrf(ctx)}<button class="linklike" type="submit">Sign out</button></form>` : html`<a href="/login">Sign in</a>`}</p>
    </div>
  </div>
</footer>
</body>
</html>`;
}

export const csrf = (ctx) => html`<input type="hidden" name="_csrf" value="${ctx.csrfToken()}">`;

export function field({ label, name, type = 'text', value = '', required = false, hint = '', autocomplete = '', attrs = '' }) {
  return html`<label class="field"><span>${label}${required ? '' : html` <em>optional</em>`}</span>
    <input type="${type}" name="${name}" value="${value}"${required ? raw(' required') : ''}${autocomplete ? raw(` autocomplete="${autocomplete}"`) : ''}${raw(attrs)}>
    ${hint ? html`<small>${hint}</small>` : ''}</label>`;
}

export function textarea({ label, name, value = '', rows = 3, hint = '', required = false }) {
  return html`<label class="field"><span>${label}${required ? '' : html` <em>optional</em>`}</span>
    <textarea name="${name}" rows="${rows}"${required ? raw(' required') : ''}>${value}</textarea>
    ${hint ? html`<small>${hint}</small>` : ''}</label>`;
}

export function notFoundPage(ctx) {
  return layout(ctx, { title: 'Not found', body: html`<section class="wrap narrow center page"><h1>We can't find that page</h1><p>Maybe the link is old. Head back and pick a time.</p><p><a class="btn" href="/book">Book a visit</a></p></section>` });
}

// ---- menu pieces ----

export function groupByCategory(services) {
  const groups = new Map();
  for (const s of services) {
    if (!groups.has(s.category)) groups.set(s.category, []);
    groups.get(s.category).push(s);
  }
  const rank = (c) => (CATEGORY_ORDER.includes(c) ? CATEGORY_ORDER.indexOf(c) : CATEGORY_ORDER.length);
  return [...groups.entries()].sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]));
}

export function serviceList(services) {
  return html`${groupByCategory(services).map(([category, items]) => html`
    <section class="menu-group" id="${category.toLowerCase().replace(/[^a-z0-9]+/g, '-')}">
      <h2>${category}</h2>
      <ul class="menu">
        ${items.map((s) => html`<li class="menu-item">
          <div class="menu-text">
            <h3>${s.name}</h3>
            ${s.description ? html`<p>${s.description}</p>` : ''}
            ${s.prep_note ? html`<p class="prep"><strong>Before you come:</strong> ${s.prep_note}</p>` : ''}
          </div>
          <div class="menu-side">
            <span class="price">${money(s.price_cents)}</span>
            <span class="muted small">${formatDuration(s.duration_min)}</span>
            <a class="btn btn-small btn-quiet" href="/book/${s.slug}" aria-label="Book ${s.name}">Book</a>
          </div>
        </li>`)}
      </ul>
    </section>`)}`;
}

export function steps(current) {
  const names = ['Service', 'Extras', 'Time', 'Confirm'];
  return html`<ol class="steps" aria-label="Booking steps">${names.map((n, i) => html`<li${i === current ? raw(' aria-current="step"') : ''}${i < current ? raw(' class="done"') : ''}><span>${i + 1}</span> ${n}</li>`)}</ol>`;
}

/**
 * A month grid. `openDays` is a Set of "YYYY-MM-DD" with free times.
 * hrefFor(date) builds the link for a day; monthHref(month) the prev/next links.
 */
export function calendar({ month, openDays, selected, today, hrefFor, monthHref, canPrev, canNext }) {
  const first = weekdayOf(`${month}-01`);
  const cells = [];
  for (let i = 0; i < first; i += 1) cells.push(html`<span class="day blank"></span>`);
  for (let d = 1; d <= daysInMonth(month); d += 1) {
    const date = `${month}-${pad(d)}`;
    const open = openDays.has(date);
    const cls = `day${open ? ' open' : ''}${date === selected ? ' selected' : ''}${date === today ? ' today' : ''}`;
    cells.push(open
      ? html`<a class="${cls}" href="${hrefFor(date)}" aria-label="${date}, times available"${date === selected ? raw(' aria-current="date"') : ''}>${d}</a>`
      : html`<span class="${cls}" aria-hidden="true">${d}</span>`);
  }
  return html`<div class="calendar">
    <div class="cal-head">
      ${canPrev ? html`<a class="cal-nav" href="${monthHref(addMonths(month, -1))}" aria-label="Earlier month">‹</a>` : html`<span class="cal-nav off">‹</span>`}
      <strong>${formatMonth(month)}</strong>
      ${canNext ? html`<a class="cal-nav" href="${monthHref(addMonths(month, 1))}" aria-label="Later month">›</a>` : html`<span class="cal-nav off">›</span>`}
    </div>
    <div class="cal-grid" role="group" aria-label="${formatMonth(month)}">
      ${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((w) => html`<span class="dow" aria-hidden="true">${w}</span>`)}
      ${cells}
    </div>
    <p class="muted small cal-key"><span class="key open"></span> Open days</p>
  </div>`;
}

export function statusBadge(a) {
  const map = { booked: ['Booked', 'ok'], completed: ['Done', 'quiet'], cancelled: ['Cancelled', 'warn'], no_show: ['No-show', 'warn'] };
  const [text, kind] = map[a.status] ?? [a.status, 'quiet'];
  return html`<span class="badge ${kind}">${text}</span>`;
}
