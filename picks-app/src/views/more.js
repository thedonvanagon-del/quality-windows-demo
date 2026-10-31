import { html } from '../html.js';
import { formatOdds, formatUnits, selection } from '../picks.js';
import { SPORT } from '../sports.js';
import { when } from '../time.js';
import { icons } from './icons.js';
import { csrfField, layout } from './layout.js';
import { at, minus, teamLogo } from './parts.js';

/** The menu behind the three dots. New sections get a row here. */
export function more(ctx, { liveCount }) {
  const row = (href, icon, title, sub, extra = '', cls = '') => html`<li class="${cls}"><a href="${href}">
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
        ${row('/install', icons.download, 'Get the app', 'Put Bookie Bullies on your Home Screen', '', 'get-app-row')}
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

/** How to put the app on a phone or computer. The page shows the viewer's own device first. */
export function install(ctx) {
  const step = (n, text) => html`<li><span class="step-n">${n}</span><span>${text}</span></li>`;
  return layout(ctx, {
    title: 'Get the app',
    active: 'install',
    description: 'Put Bookie Bullies on your Home Screen. No app store, takes ten seconds.',
    body: html`
      <h1>Get the app</h1>
      <p class="lede">Bookie Bullies installs straight from your browser: its own icon on your Home Screen, full screen, and updates on its own. No app store, about ten seconds.</p>
      <button class="btn" type="button" data-install-now hidden>${icons.download} Install Bookie Bullies</button>
      <div class="card inapp-note" data-inapp-note hidden>
        <h2>Open this in <span data-browser-name>your browser</span> first</h2>
        <p>You're in <b data-inapp-name>an app's built-in browser</b>, which can't add apps to your Home Screen.</p>
        <ol class="steps">
          ${step(1, html`Tap <b>⋯</b> or the share icon (usually top right) and choose <b>Open in <span data-browser-name>browser</span></b>.`)}
          ${step(2, html`Or copy the link and paste it into <b data-browser-name>your browser</b>:`)}
        </ol>
        <button class="btn small" type="button" data-copy="${ctx.origin}/install" hidden>Copy link</button>
      </div>
      <div class="installs">
        <section class="install-card" data-device="ios">
          <h2>iPhone and iPad</h2>
          <ol class="steps" data-ios="safari">
            ${step(1, html`Tap the <b>Share</b> button: the square with an arrow pointing up, at the bottom of Safari (on newer iPhones, tap <b>⋯</b> first).`)}
            ${step(2, html`Scroll down and tap <b>Add to Home Screen</b>.`)}
            ${step(3, html`Tap <b>Add</b>. The bull crest is now on your Home Screen.`)}
          </ol>
          <ol class="steps" data-ios="other" hidden>
            ${step(1, html`Tap the <b>Share</b> button next to the address bar (top right in Chrome).`)}
            ${step(2, html`Tap <b>Add to Home Screen</b>, then <b>Add</b>.`)}
            ${step(3, html`If you don't see it, open <b>app.bookiebullies.com/install</b> in <b>Safari</b> instead.`)}
          </ol>
          <p class="muted small">Then open it from your Home Screen and log in once. That's also where phone notifications work.</p>
        </section>
        <section class="install-card" data-device="android">
          <h2>Android</h2>
          <ol class="steps">
            ${step(1, html`Open <b>app.bookiebullies.com</b> in <b>Chrome</b>.`)}
            ${step(2, html`Tap <b>Install app</b> when it pops up, or the <b>⋮</b> menu → <b>Add to Home screen</b> → <b>Install</b>.`)}
          </ol>
        </section>
        <section class="install-card" data-device="desktop">
          <h2>Computer</h2>
          <ol class="steps">
            ${step(1, html`<b>Chrome or Edge:</b> click the install icon at the right end of the address bar, then <b>Install</b>.`)}
            ${step(2, html`<b>Safari on a Mac:</b> File → <b>Add to Dock</b>.`)}
          </ol>
        </section>
      </div>
    `,
  });
}
