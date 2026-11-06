import { html } from '../html.js';
import { formatOdds, formatUnits, selection } from '../picks.js';
import { siteHost, siteLink } from '../site.js';
import { SPORT } from '../sports.js';
import { when } from '../time.js';
import { icons } from './icons.js';
import { csrfField, layout } from './layout.js';
import { adminTabs } from './local.js';
import { at, avatar, minus, profileLink, teamLogo } from './parts.js';

/** The menu behind the three dots. New sections get a row here. */
export function more(ctx, { liveCount, admin = false, reported = 0, reportedCups = 0 }) {
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
        <li class="site-row"><a href="${siteLink(ctx.app.site, 'more_menu')}" target="_blank" rel="noopener">
          <span class="icon"><img src="${ctx.app.assets.logo}" alt="" width="34" height="34"></span>
          <span class="text">Free picks: ${siteHost(ctx.app.site)}<small>The Bookie Bullies model's daily picks and Locks</small></span>
          <span class="go">${icons.chevron}</span>
        </a></li>
        ${row(`/u/${encodeURIComponent(ctx.user.screenName)}`, icons.me, 'Your profile', 'Your record, badges and settings')}
        ${row('/install', icons.download, 'Get the app', 'Put LockBox Picks on your Home Screen', '', 'get-app-row')}
        ${row('/live', icons.live, 'Live games', 'Scores right now, with your bets on them', liveCount ? html`<span class="count">${liveCount} live</span>` : '')}
        ${row('/contest', icons.board, 'This week\'s contest', 'Free weekly contest, and the winners wall')}
        ${row('/streak', icons.flame, 'Streak', 'One Streak pick a day. How long can you go?')}
        ${row('/hot', icons.line, 'Hot streaks', 'Who\'s on a heater: the best last ten')}
        ${row('/following', icons.groups, 'Following', 'Picks from players you follow')}
        ${row('/notifications', icons.bell, 'Notifications', 'Settled bets, players you follow, phone alerts', ctx.unread ? html`<span class="count">${ctx.unread} new</span>` : '')}
        ${row('/chat', icons.chat, 'Game chat', 'Talk about today\'s games while they\'re on')}
        ${row('/leaderboard', icons.board, 'Leaderboard', 'Everyone, or one sport at a time')}
        ${row('/search', icons.search, 'Find players', 'Look someone up by screen name')}
        ${row('/groups', icons.groups, 'Chat Rooms', 'Your groups and local rooms: chat and boards')}
        ${row('/local', icons.pin, 'Local rooms', 'A chat and a board for your city')}
        ${row('/invite', icons.invite, 'Invite friends', 'Your own link, and who joined')}
        ${admin ? row('/admin/reports', icons.flag, 'Admin', 'Reported chat and photos', reported ? html`<span class="count">${reported}</span>` : '') : ''}
        ${admin ? row('/admin/tournaments', icons.bracket, 'Admin: tournaments', 'Make a tournament, cancel one, or look at reported ones', reportedCups ? html`<span class="count">${reportedCups}</span>` : '') : ''}
        ${admin ? row('/admin/bracket', icons.bracket, 'Admin: bracket', 'The March Madness field, the lock, results') : ''}
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
      <p class="lede">Every game in progress, all sports. Scores update on their own about every 30 seconds.</p>
      <div class="live-list" data-live-poll>
        ${list.length
          ? list.map((g) => liveCard(g, mine.get(g.id) ?? []))
          : html`<div class="card empty">Nothing on right now. Check back when games kick off.</div>`}
      </div>
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
      ? html`<div class="yours">${picks.map((p) => html`<div><span><span class="tag">${p.parlay ? 'Parlay leg' : 'Your bet'}</span> ${selection(p.market, p.side, p.line, g)} ${minus(formatOdds(p.odds))}</span><span>${p.parlay ? '' : formatUnits(p.units)}</span></div>`)}</div>`
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

// The icon beside each kind of note in the inbox.
const KIND_ICON = { follow: icons.groups, invite: icons.invite, badge: icons.medal, contest: icons.board, lines: icons.games, streak: icons.flame, tournament: icons.bracket, photo: icons.me };

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
            ${n.face ? html`<span class="icon face">${avatar(n.face)}</span>` : html`<span class="icon">${KIND_ICON[n.kind] ?? icons.picks}</span>`}
            <span class="text">${n.text}<small><time datetime="${n.created_at}" data-local="long">${when(n.created_at)}</time></small></span>
          </a></li>`)}</ul>`
        : html`<div class="card empty">Nothing yet. You'll hear here when your bets settle and when players you follow make picks.</div>`}

      <h2>Tell me when</h2>
      <form class="form prefs" method="post" action="/notifications/settings">
        ${csrfField(ctx)}
        <label class="check"><input type="checkbox" name="settled" ${prefs.notify_settled ? 'checked' : ''}><span>My bets settle (won, lost, push)</span></label>
        <label class="check"><input type="checkbox" name="follows" ${prefs.notify_follows ? 'checked' : ''}><span>A player I follow locks a pick</span></label>
        <label class="check"><input type="checkbox" name="lines" ${prefs.notify_lines ? 'checked' : ''}><span>Lines are up: today's games in my sports, about 11 AM ET</span></label>
        <label class="check"><input type="checkbox" name="streak" ${prefs.notify_streak ? 'checked' : ''}><span>Streak reminder: no Streak pick yet today, about 5 PM ET</span></label>
        <label class="check"><input type="checkbox" name="tournaments" ${prefs.notify_tournaments ? 'checked' : ''}><span>A tournament I joined starts in an hour</span></label>
        <label class="check"><input type="checkbox" name="tournament_updates" ${prefs.notify_tournament_updates ? 'checked' : ''}><span>Tournament updates: I move into the top 3, and where I stand with 2 hours left</span></label>
        <button class="btn small">Save</button>
      </form>

      <h2>Phone notifications</h2>
      ${pushKey
        ? html`<div class="push-box" data-push-key="${pushKey}">
            <p class="muted">${phones ? `On for ${phones} ${phones === 1 ? 'device' : 'devices'}.` : 'Get these on your lock screen, like any app.'}</p>
            <button class="btn small" type="button" data-push-on hidden>Turn on for this device</button>
            <p class="muted small" data-push-help hidden>On iPhone, add LockBox Picks to your Home Screen first (Share, then Add to Home Screen), open it from there, and come back to this page.</p>
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
    description: 'Put LockBox Picks on your Home Screen. No app store, takes ten seconds.',
    body: html`
      <h1>Get the app</h1>
      <p class="lede">LockBox Picks installs straight from your browser: its own icon on your Home Screen, full screen, and updates on its own. No app store, about ten seconds.</p>
      <button class="btn" type="button" data-install-now hidden>${icons.download} Install LockBox Picks</button>
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

/**
 * Reports, for admins: chat messages (put one back or delete it for good)
 * and profile and cover photos (keep one, or remove it).
 */
export function adminReports(ctx, { list, hideAfter, photos = [], photoHideAfter = 3, blockDays = 7 }) {
  return layout(ctx, {
    title: 'Reports',
    active: 'more',
    body: html`
      <a class="back" href="/more">← More</a>
      <h1>Admin</h1>
      ${adminTabs('reports')}
      <p class="lede">Messages anyone has reported. ${hideAfter} reports hide a message. Restore puts it back and clears its reports. Delete takes it down for everyone.</p>
      ${list.length
        ? html`<ul class="reports">${list.map((m) => html`<li class="card report ${m.hidden ? 'is-hidden' : ''}">
            <div class="report-head">
              <span>${profileLink(m.screen_name)} · ${m.group_id != null
                ? m.group_kind === 'local' ? html`Local room: <a href="/groups/${m.group_id}#chat">${m.group_name}</a>` : html`Group: ${m.group_name}`
                : m.tournament_id != null
                  ? html`Tournament: ${m.tournament_name}`
                  : html`<a href="/games/${encodeURIComponent(m.game_id)}#chat">${m.away_short} @ ${m.home_short}</a> · ${SPORT[m.sport]?.short ?? m.sport}`}</span>
              <span class="report-count">${m.reports} ${m.reports === 1 ? 'report' : 'reports'}${m.hidden ? ' · Hidden' : ''}</span>
            </div>
            <p class="report-body">${m.body}</p>
            <div class="row report-actions">
              <span class="muted small">Sent ${at(m.created_at, 'long')}</span>
              <form method="post" action="/admin/reports/${m.id}/restore">${csrfField(ctx)}<button class="btn small ghost">Restore</button></form>
              <form method="post" action="/admin/reports/${m.id}/delete" data-confirm="Delete this message for everyone?">${csrfField(ctx)}<button class="btn small danger">Delete</button></form>
            </div>
          </li>`)}</ul>`
        : html`<div class="card empty">Nothing reported right now.</div>`}

      <h2 id="photos">Reported photos</h2>
      <p class="lede">Profile photos and cover photos anyone has reported. ${photoHideAfter} reports hide one until you look. Remove deletes it, tells the player, and stops new ones of that kind for ${blockDays} days. Dismiss keeps it and clears its reports.</p>
      ${photos.length
        ? html`<ul class="reports">${photos.map((p) => {
            const cover = p.kind === 'cover';
            const what = cover ? 'cover' : 'photo';
            return html`<li class="card report photo-report ${cover ? 'cover-report' : ''} ${p.hidden ? 'is-hidden' : ''}">
            ${cover
              ? html`<img class="report-photo report-cover" src="/media/${p.photo}" alt="${p.screen_name}'s cover photo" width="192" height="64" loading="lazy">`
              : html`<img class="report-photo" src="/media/${p.photo}" alt="${p.screen_name}'s photo" width="96" height="96" loading="lazy">`}
            <div class="report-main">
              <div class="report-head">
                <span>${profileLink(p.screen_name)}</span>
                <span class="report-count">${p.reports} ${p.reports === 1 ? 'report' : 'reports'}${p.hidden ? ' · Hidden' : ''}</span>
              </div>
              <p class="muted small">Last report ${at(p.last_report, 'long')} · ${cover ? 'Cover photo' : 'Profile photo'}</p>
              <div class="row report-actions">
                <form method="post" action="/admin/photos/${p.id}/dismiss">${csrfField(ctx)}<input type="hidden" name="photo" value="${p.photo}"><input type="hidden" name="kind" value="${p.kind}"><button class="btn small ghost">Dismiss</button></form>
                <form method="post" action="/admin/photos/${p.id}/remove" data-confirm="Remove ${p.screen_name}'s ${what}?">${csrfField(ctx)}<input type="hidden" name="photo" value="${p.photo}"><input type="hidden" name="kind" value="${p.kind}"><button class="btn small danger">Remove ${what}</button></form>
              </div>
            </div>
          </li>`;
          })}</ul>`
        : html`<div class="card empty">No reported photos right now.</div>`}
    `,
  });
}
