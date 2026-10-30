import { html } from '../html.js';
import { formatOdds, formatUnits, selection } from '../picks.js';
import { SPORT } from '../sports.js';
import { when } from '../time.js';
import { icons } from './icons.js';
import { csrfField, layout } from './layout.js';
import { at, minus, teamLogo } from './parts.js';

/** The menu behind the three dots. New sections get a row here. */
export function more(ctx, { liveCount }) {
  const row = (href, icon, title, sub, extra = '') => html`<li><a href="${href}">
    <span class="icon">${icon}</span>
    <span class="text">${title}<small>${sub}</small></span>
    ${extra}<span class="go">${icons.chevron}</span>
  </a></li>`;
  return layout(ctx, {
    title: 'More',
    active: 'more',
    body: html`
      <h1>More</h1>
      <p class="lede">Everything else in the app.</p>
      <ul class="menu">
        ${row('/live', icons.live, 'Live games', 'Scores right now, with your bets on them', liveCount ? html`<span class="count">${liveCount} live</span>` : '')}
        ${row('/hot', icons.line, 'Hot streaks', 'Who\'s on a heater: the best last ten')}
        ${row('/following', icons.groups, 'Following', 'Picks from players you follow')}
        ${row('/notifications', icons.bell, 'Notifications', 'Settled bets, players you follow, phone alerts', ctx.unread ? html`<span class="count">${ctx.unread} new</span>` : '')}
        ${row('/chat', icons.chat, 'Game chat', 'Talk about today\'s games while they\'re on')}
        ${row('/leaderboard', icons.board, 'Leaderboard', 'Everyone, or one sport at a time')}
        ${row('/groups', icons.groups, 'Groups', 'Your friends and their boards')}
        ${row(`/u/${encodeURIComponent(ctx.user.screenName)}`, icons.me, 'Profile and settings', 'Bio, link, app color')}
      </ul>
      <h2>Account</h2>
      <ul class="menu">
        <li><form method="post" action="/logout">${csrfField(ctx)}<button><span class="icon">${icons.lock}</span><span class="text">Log out<small>${ctx.user.email}</small></span></button></form></li>
      </ul>
    `,
  });
}

/** Every game going on right now. `mine` maps game id to the viewer's picks on it. */
export function live(ctx, { list, mine }) {
  return layout(ctx, {
    title: 'Live games',
    active: 'more',
    body: html`
      <a class="back" href="/more">← More</a>
      <h1>Live games</h1>
      <p class="lede">Every game in progress, all sports. Scores update each time you open the page.</p>
      ${list.length
        ? list.map((g) => liveCard(g, mine.get(g.id) ?? []))
        : html`<div class="card empty">Nothing on right now. Check back when games kick off.</div>`}
    `,
  });
}

function liveCard(g, picks) {
  const line = (side) => html`<div class="scoreline"><span class="team">${teamLogo(g[side])}<span class="tname">${g[side].short}</span></span><span class="score">${g[side].score ?? 0}</span></div>`;
  return html`<article class="event">
    <div class="live-head"><span class="live-tag">Live</span><span>${SPORT[g.sport]?.short} · ${g.detail}</span><a class="chat-link" href="/games/${encodeURIComponent(g.id)}#chat">${icons.chat}Chat</a></div>
    ${line('away')}
    ${line('home')}
    ${picks.length
      ? html`<div class="yours">${picks.map((p) => html`<div><span><span class="tag">Your bet</span> ${selection(p.market, p.side, p.line, g)} ${minus(formatOdds(p.odds))}</span><span>${formatUnits(p.units)}</span></div>`)}</div>`
      : ''}
  </article>`;
}

/** Games worth talking about, live ones and the busiest chats first. */
export function chatHub(ctx, { list }) {
  return layout(ctx, {
    title: 'Game chat',
    active: 'more',
    body: html`
      <a class="back" href="/more">← More</a>
      <h1>Game chat</h1>
      <p class="lede">One thread per game. Picks show next to names once the game starts. Keep it about the games.</p>
      ${list.length
        ? html`<ul class="menu chat-games">${list.map(({ game: g, count }) => html`<li><a href="/games/${encodeURIComponent(g.id)}#chat">
            <span class="text">${g.away.short} @ ${g.home.short}<small>${SPORT[g.sport]?.short} · ${g.state === 'in' ? html`<b class="live-dot">Live</b> ${g.detail}` : g.state === 'post' ? `Final · ${g.away.abbr} ${g.away.score ?? 0}, ${g.home.abbr} ${g.home.score ?? 0}` : at(g.start)}</small></span>
            <span class="count ${count ? '' : 'zero'}">${count ? `${count} ${count === 1 ? 'message' : 'messages'}` : 'Start it'}</span><span class="go">${icons.chevron}</span>
          </a></li>`)}</ul>`
        : html`<div class="card empty">No games on today. Chats open as games get close.</div>`}
    `,
  });
}

/** The inbox, what to be told about, and phone notifications. */
export function notifications(ctx, { list, prefs, phones, pushKey }) {
  return layout(ctx, {
    title: 'Notifications',
    active: 'notifications',
    body: html`
      <a class="back" href="/more">← More</a>
      <h1>Notifications</h1>
      ${list.length
        ? html`<ul class="menu inbox">${list.map((n) => html`<li class="${n.read_at ? '' : 'unread'}"><a href="${n.url}">
            <span class="icon">${n.kind === 'follow' ? icons.groups : icons.picks}</span>
            <span class="text">${n.text}<small><time datetime="${n.created_at}" data-local="long">${when(n.created_at)}</time></small></span>
          </a></li>`)}</ul>`
        : html`<div class="card empty">Nothing yet. You'll hear here when your bets settle and when players you follow make picks.</div>`}

      <h2>Tell me when</h2>
      <form class="form prefs" method="post" action="/notifications/settings">
        ${csrfField(ctx)}
        <label class="check"><input type="checkbox" name="settled" ${prefs.notify_settled ? 'checked' : ''}><span>My bets settle (won, lost, push)</span></label>
        <label class="check"><input type="checkbox" name="follows" ${prefs.notify_follows ? 'checked' : ''}><span>A player I follow locks a pick</span></label>
        <button class="btn small">Save</button>
      </form>

      <h2>Phone notifications</h2>
      ${pushKey
        ? html`<div class="push-box" data-push-key="${pushKey}">
            <p class="muted">${phones ? `On for ${phones} ${phones === 1 ? 'device' : 'devices'}.` : 'Get these on your lock screen, like any app.'}</p>
            <button class="btn small" type="button" data-push-on hidden>Turn on for this device</button>
            <p class="muted small" data-push-help hidden>On iPhone, add Bookie Bullies to your Home Screen first (Share, then Add to Home Screen), open it from there, and come back to this page.</p>
            <p class="small" data-push-status role="status"></p>
            ${phones ? html`<form method="post" action="/push/unsubscribe">${csrfField(ctx)}<button class="btn ghost small">Turn off on every device</button></form>` : ''}
          </div>`
        : html`<p class="muted">Phone notifications aren't set up on this server yet.</p>`}
    `,
  });
}
