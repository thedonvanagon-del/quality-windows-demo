import { html } from '../html.js';
import { icons } from './icons.js';

/**
 * The page shell. `ctx` carries the app name, the signed-in player, the
 * flash message and the asset URLs; `active` lights up a nav link.
 */
export function layout(ctx, { title, active, body, description, share }) {
  const { user, flash, app } = ctx;
  const theme = user?.theme ?? app.theme;
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
<meta name="theme-color" content="#0f141b">
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
<main class="wrap">
  ${flash ? html`<div class="flash ${flash.type === 'error' ? 'err' : 'ok'}" role="status">${flash.text}</div>` : ''}
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
