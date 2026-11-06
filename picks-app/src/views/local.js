// Local rooms: the directory, the Join page for a room you're not in, the
// city dropdown, and the admin page. A room itself is a group, so its page
// is the group page (social.group).

import { cityGroups, groupLabel } from '../cities.js';
import { html } from '../html.js';
import { at } from './parts.js';
import { icons } from './icons.js';
import { csrfField, layout } from './layout.js';

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The city list as a dropdown, grouped by region and state. Nobody types a city. */
export function citySelect(cities, { selected = '', blank = 'Pick your city', label = 'City' } = {}) {
  return html`<select name="city" aria-label="${label}">
    <option value="">${blank}</option>
    ${cities.map((g) => html`<optgroup label="${g.label}">${g.cities.map((c) => html`<option value="${c.slug}" ${c.slug === selected ? 'selected' : ''}>${c.label}</option>`)}</optgroup>`)}
  </select>`;
}

/** "📍 San Diego, CA", with the pin from the icon set, linked to the room when it's open. */
export function cityPin(home) {
  if (!home) return '';
  const text = html`${icons.pin}<span>${home.city.label}</span>`;
  return home.room
    ? html`<a class="city-pin" href="/local/${home.city.slug}">${text}</a>`
    : html`<span class="city-pin">${text}</span>`;
}

/** One room in a list: name, members, what's new, and Open or Join. */
function roomRow(ctx, room, { unread = 0, home = false } = {}) {
  return html`<li class="room-row">
    <a class="room-main" href="/groups/${room.id}">
      <span class="icon">${icons.pin}</span>
      <span class="text">${room.name}${home ? html` <span class="home-tag">Your city</span>` : ''}<small>${plural(room.members, 'member')}</small></span>
    </a>
    ${unread ? html`<a class="unread-count" href="/groups/${room.id}#chat">${unread} new</a>` : ''}
    ${room.joined
      ? html`<a class="btn ghost small" href="/groups/${room.id}">Open</a>`
      : html`<form method="post" action="/groups/${room.id}/join">${csrfField(ctx)}<button class="btn small">Join</button></form>`}
  </li>`;
}

/** The Groups page's top section: the rooms you're in, then a way to find yours. */
export function groupsSection(ctx, { rooms, unread }) {
  return html`<h2>Local rooms</h2>
    ${rooms.length ? html`<ul class="rooms">${rooms.map((r) => roomRow(ctx, r, { unread: unread.get(r.id) ?? 0 }))}</ul>` : html`<p class="muted">Talk with bettors in your city, and see who's best there.</p>`}
    <a class="promo" href="/local">${icons.pin}<span><b>Find your city</b><small>Every local room, or start one for your city.</small></span><span class="go">${icons.chevron}</span></a>
    <h2>Your groups</h2>`;
}

/** The form at the top of the directory: start a room from the list. */
function startForm(ctx, { cities, city }) {
  return html`<form class="card form start-room" method="post" action="/local">
    ${csrfField(ctx)}
    <h2>Start a room for your city</h2>
    <label>City ${citySelect(cities, { selected: city })}</label>
    <button class="btn block">Start the room</button>
    <p class="muted small">One room per city. If yours has one, we'll point you to it.</p>
  </form>`;
}

/** Every open room, by region and state, with the start form on top. */
export function directory(ctx, { rooms, unread, cities, homeCity, city = '', error = null, exists = null }) {
  const bySlug = new Map(rooms.map((r) => [r.city_slug, r]));
  const listed = cityGroups(cities.flatMap((g) => g.cities).filter((c) => bySlug.has(c.slug)));
  // A room whose city has left the list still shows, at the end.
  const others = rooms.filter((r) => !r.city);
  return layout(ctx, {
    title: 'Local rooms',
    active: 'groups',
    body: html`
      <a class="back" href="/groups">← Groups</a>
      <h1>Local rooms</h1>
      <p class="lede">One room per city: a chat, and a board of the best bettors there. Join as many as you like.</p>
      ${error
        ? html`<div class="flash err" role="alert">${error}${exists ? html` <a class="flash-go" href="/groups/${exists.id}">Join it</a>` : ''}</div>`
        : ''}
      ${startForm(ctx, { cities, city })}
      ${rooms.length
        ? html`${listed.map((g) => html`<h2 class="region">${g.label}</h2>
            <ul class="rooms">${g.cities.map((c) => roomRow(ctx, bySlug.get(c.slug), { unread: unread.get(bySlug.get(c.slug).id) ?? 0, home: c.slug === homeCity }))}</ul>`)}
          ${others.length ? html`<h2 class="region">Other</h2><ul class="rooms">${others.map((r) => roomRow(ctx, r, { unread: unread.get(r.id) ?? 0 }))}</ul>` : ''}`
        : html`<div class="card empty">No local rooms yet. Start one for your city.</div>`}
    `,
  });
}

/** A room you're not in: what it is and a Join button. Its chat and board are for members. */
export function roomPreview(ctx, { room, members }) {
  return layout(ctx, {
    title: room.name,
    active: 'groups',
    body: html`
      <a class="back" href="/local">← Local rooms</a>
      <div class="auth">
        <h1>${room.name}</h1>
        <p class="lede">Local room${room.city ? ` · ${groupLabel(room.city)}` : ''} · ${plural(members, 'member')}</p>
        <p>Join to see the room's chat and its board. Anyone can join, and you can leave anytime.</p>
        <form method="post" action="/groups/${room.id}/join">${csrfField(ctx)}<button class="btn block">Join ${room.name}</button></form>
      </div>
    `,
  });
}

/** The admin pages share a tab strip. */
export function adminTabs(active) {
  return html`<nav class="tabs" aria-label="Admin">
    <a href="/admin/reports" class="${active === 'reports' ? 'on' : ''}">Reported chat</a>
    <a href="/admin/rooms" class="${active === 'rooms' ? 'on' : ''}">Local rooms</a>
    <a href="/admin/tournaments" class="${active === 'tournaments' ? 'on' : ''}">Tournaments</a>
    <a href="/admin/bracket" class="${active === 'bracket' ? 'on' : ''}">Bracket</a>
  </nav>`;
}

/** Admins: every room, with rename, archive and restore. Players start rooms; admins can too. */
export function adminRooms(ctx, { rooms, cities }) {
  return layout(ctx, {
    title: 'Local rooms',
    active: 'more',
    body: html`
      <a class="back" href="/more">← More</a>
      <h1>Admin</h1>
      ${adminTabs('rooms')}
      <p class="lede">Players start rooms from the city list. Rename changes only the name a room shows. Archive takes it off the directory and stops new posts and members; its history stays. Restore puts it back.</p>
      ${rooms.length
        ? html`<ul class="reports">${rooms.map((r) => html`<li class="card admin-room ${r.archived_at ? 'is-hidden' : ''}">
            <div class="report-head">
              <span><a href="/groups/${r.id}">${r.name}</a>${r.archived_at ? ' · Archived' : ''}</span>
              <span class="report-count">${plural(r.members, 'member')} · ${plural(r.messages, 'message')}</span>
            </div>
            <p class="muted small">${r.city ? r.city.label : r.city_slug} · started ${at(r.created_at, 'long')}${r.started_by ? ` by ${r.started_by}` : ''}</p>
            <form class="row" method="post" action="/admin/rooms/${r.id}/rename">
              ${csrfField(ctx)}
              <input type="text" name="name" value="${r.name}" required minlength="2" maxlength="40" aria-label="Room name">
              <button class="btn small ghost">Rename</button>
            </form>
            <div class="row report-actions">
              ${r.archived_at
                ? html`<form method="post" action="/admin/rooms/${r.id}/restore">${csrfField(ctx)}<button class="btn small">Restore</button></form>`
                : html`<form method="post" action="/admin/rooms/${r.id}/archive" data-confirm="Archive ${r.name}? It leaves the directory and its chat goes read-only.">${csrfField(ctx)}<button class="btn small danger">Archive</button></form>`}
            </div>
          </li>`)}</ul>`
        : html`<div class="card empty">No rooms yet.</div>`}
      <h2>Start a room</h2>
      <form class="card form" method="post" action="/admin/rooms">
        ${csrfField(ctx)}
        <label>City ${citySelect(cities)}</label>
        <button class="btn small">Start it</button>
      </form>
    `,
  });
}
