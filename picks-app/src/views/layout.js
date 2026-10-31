import { THEMES } from '../config.js';
import { html } from '../html.js';
import { when } from '../time.js';
import { icons } from './icons.js';

/**
 * The page shell. `ctx` carries the app name, the signed-in player, the
 * flash message and the asset URLs; `active` lights up a nav link.
 */
export function layout(ctx, { title, active, body, description, share }) {
  const { user, flash, app } = ctx;
  // Players who chose a color that has since been retired get the default.
  const theme = THEMES.includes(user?.theme) ? user.theme : app.theme;
  const playing = Boolean(user?.screenName);
  const profile = playing ? `/u/${encodeURIComponent(user.screenName)}` : null;
  const nav = playing
    ? [
        ['games', '/games', 'Games', icons.games],
        ['picks', '/picks', 'My bets', icons.picks],
        ['board', '/leaderboard', 'Leaderboard', icons.board],
        ['groups', '/groups', 'Groups', icons.groups],
        ['more', '/more', 'More', icons.more],
      ]
    : [['board', '/leaderboard', 'Leaderboard', icons.board]];
  const count = (key) => (key === 'picks' && ctx.openBets ? html`<b class="badge" aria-label="${ctx.openBets} open">${ctx.openBets > 99 ? '99+' : ctx.openBets}</b>` : '');
  const link = ([key, href, label, icon]) =>
    html`<a href="${href}" class="${key === active ? 'on' : ''}" ${key === active ? html`aria-current="page"` : ''}><span class="ic">${icon}${count(key)}</span><span>${label}</span></a>`;

  return html`<!doctype html>
<html lang="en" data-theme="${theme}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title ? `${title} · ${app.name}` : app.name}</title>
<meta name="description" content="${description ?? 'Make your picks before kickoff. They lock, they get graded off the final score, and nobody can edit them.'}">
<meta name="theme-color" content="#0e1a3a">
<meta property="og:site_name" content="${app.name}">
<meta property="og:type" content="${share ? 'profile' : 'website'}">
<meta property="og:title" content="${share?.title ?? (title ? `${title} · ${app.name}` : app.name)}">
<meta property="og:description" content="${share?.description ?? description ?? 'Make your picks before kickoff. They lock, they get graded off the final score, and nobody can edit them.'}">
<meta property="og:url" content="${ctx.origin}${ctx.url.pathname}">
<meta property="og:image" content="${ctx.origin}/static/icon-512.png">
<meta name="twitter:card" content="summary">
<link rel="icon" type="image/png" href="${app.assets.logo}">
<link rel="apple-touch-icon" href="${app.assets.touchIcon}">
<link rel="manifest" href="${app.assets.manifest}">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="${app.name}">
<meta name="apple-mobile-web-app-status-bar-style" content="black">
<link rel="stylesheet" href="${app.assets.css}">
<script src="${app.assets.js}" defer></script>
</head>
<body class="${playing ? 'signed-in' : ''}">
<header class="top">
  <div class="wrap">
    <a class="brand" href="/"><img class="brand-logo" src="${app.assets.logo}" alt="" width="34" height="34">${app.name}</a>
    <nav class="nav" aria-label="Main">${nav.map(link)}</nav>
    <div class="top-right">
      ${active === 'install' ? '' : html`<a class="get-app" href="/install" data-get-app>${icons.download}<span>Get the app</span></a>`}
      ${playing ? html`<a class="bell ${active === 'notifications' ? 'on' : ''}" href="/notifications" aria-label="Notifications${ctx.unread ? `, ${ctx.unread} new` : ''}">${icons.bell}${ctx.unread ? html`<b class="badge">${ctx.unread > 99 ? '99+' : ctx.unread}</b>` : ''}</a>` : ''}
      ${playing
        ? html`<a class="user-chip ${active === 'me' ? 'on' : ''}" href="${profile}"><span class="avatar">${user.screenName[0]}</span><span class="name">${user.screenName}</span></a>`
        : user
          ? ''
          : html`<a class="btn ghost small" href="/login">Log in</a><a class="btn small" href="/signup">Join now</a>`}
    </div>
  </div>
</header>
${user && !user.verified
  ? html`<div class="verify-bar"><div class="wrap">
      <span>Confirm your email to put your record on the leaderboards. Check ${user.email}.</span>
      <form method="post" action="/verify/resend">${csrfField(ctx)}<input type="hidden" name="next" value="${ctx.url.pathname}"><button class="btn small ghost">Send a new link</button></form>
    </div></div>`
  : ''}
${active === 'install' ? '' : html`<div class="app-banner" data-app-banner hidden>
  <div class="wrap">
    <img src="${app.assets.touchIcon}" alt="" width="36" height="36">
    <span><b>Get the Bookie Bullies app</b><small>Free. Home Screen icon, phone alerts.</small></span>
    <a class="btn small" href="/install" data-get-app>Get it</a>
    <button type="button" class="app-banner-close" data-banner-close aria-label="Not now">×</button>
  </div>
</div>`}
${active === 'install' ? '' : html`<div class="ios-install" data-ios-install hidden>
  <div class="ios-card" role="dialog" aria-modal="true" aria-labelledby="ios-install-title">
    <button type="button" class="ios-close" data-ios-close aria-label="Close">×</button>
    <div class="ios-head"><img src="${app.assets.touchIcon}" alt="" width="52" height="52"><div><b id="ios-install-title">Add Bookie Bullies to your Home Screen</b><small>Free. About ten seconds.</small></div></div>
    <ol class="ios-steps">
      <li><span class="step-n">1</span><span>Tap the Share button <svg class="ios-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg> in Safari's bar below<small>On newer iPhones, tap <b>⋯</b>, then <b>Share</b>.</small></span></li>
      <li><span class="step-n">2</span><span>Scroll down and tap <svg class="ios-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M12 8v8M8 12h8"/></svg> <b>Add to Home Screen</b></span></li>
      <li><span class="step-n">3</span><span>Tap <b>Add</b>, then open it from your Home Screen</span></li>
    </ol>
  </div>
  <div class="ios-arrow" aria-hidden="true">↓</div>
</div>`}
<main class="wrap">
  ${flash?.type === 'locked' ? lockedTicket(flash) : flash ? html`<div class="flash ${flash.type === 'error' ? 'err' : 'ok'}" role="status">${flash.text}</div>` : ''}
  ${body}
</main>
<footer>
  <div class="wrap">
    ${user ? html`<form method="post" action="/logout" class="logout">${csrfField(ctx)}<button class="btn quiet small">Log out</button></form>` : ''}
    <p>Picks lock at kickoff and grade off ESPN's final scores. Nothing gets edited after the fact.</p>
    <p>Just picks, no betting here. 21+. If gambling stops being fun, call 1-800-GAMBLER.</p>
    <p><a href="/terms">Terms</a> · <a href="/privacy">Privacy</a></p>
  </div>
</footer>
${playing
  ? html`<nav class="tabbar" aria-label="Main">${[...nav.filter(([key]) => key !== 'more'), ['me', profile, 'Profile', icons.me], ['more', '/more', 'More', icons.more]]
    // Six tabs share a phone's width, so the longest label gets a shorter name.
    .map(([key, href, label, icon]) => link([key, href, key === 'board' ? 'Leaders' : label, icon]))}</nav>`
  : ''}
</body>
</html>`;
}

export function csrfField(ctx) {
  return ctx.session ? html`<input type="hidden" name="_csrf" value="${ctx.session.csrf}">` : '';
}

/** The receipt a pick gets the moment it goes in: the bet, a LOCKED stamp and the exact time. */
function lockedTicket(flash) {
  return html`<div class="locked-ticket" role="status">
    <span class="stamp">Locked</span>
    <div class="lt-body">
      <b>${flash.text}</b>
      ${flash.at ? html`<span>On the record <time datetime="${flash.at}" data-local="long">${when(flash.at)}</time>. It can't be edited after the game starts.</span>` : ''}
    </div>
  </div>`;
}
