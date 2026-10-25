import { html, raw } from '../html.js';
import { icons } from './icons.js';

const FAVICON_COLOR = { teal: '%2322d3b0', violet: '%23a78bfa', ember: '%23ff8f45' };

/**
 * The page shell. `ctx` carries the app name, the signed-in player, the
 * flash message and the asset URLs; `active` lights up a nav link.
 */
export function layout(ctx, { title, active, body, description }) {
  const { user, flash, app } = ctx;
  const theme = user?.theme ?? app.theme;
  const playing = Boolean(user?.screenName);
  const profile = playing ? `/u/${encodeURIComponent(user.screenName)}` : null;
  const nav = playing
    ? [
        ['games', '/games', 'Games', icons.games],
        ['picks', '/picks', 'My picks', icons.picks],
        ['board', '/leaderboard', 'Leaderboard', icons.board],
        ['groups', '/groups', 'Groups', icons.groups],
      ]
    : [['board', '/leaderboard', 'Leaderboard', icons.board]];
  const link = ([key, href, label, icon]) =>
    html`<a href="${href}" class="${key === active ? 'on' : ''}" ${key === active ? html`aria-current="page"` : ''}>${icon}<span>${label}</span></a>`;
  const favicon = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='${FAVICON_COLOR[theme] ?? FAVICON_COLOR.teal}'/%3E%3Cpath d='M9 17l5 5 9-12' stroke='%230b0f15' stroke-width='4' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E`;

  return html`<!doctype html>
<html lang="en" data-theme="${theme}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title ? `${title} · ${app.name}` : app.name}</title>
<meta name="description" content="${description ?? 'Make your picks before kickoff. They lock, they get graded off the final score, and nobody can edit them.'}">
<meta name="theme-color" content="#0f141b">
<link rel="icon" href="${raw(favicon)}">
<link rel="stylesheet" href="${app.assets.css}">
<script src="${app.assets.js}" defer></script>
</head>
<body class="${playing ? 'signed-in' : ''}">
<header class="top">
  <div class="wrap">
    <a class="brand" href="/"><span class="brand-mark">${icons.check}</span>${app.name}</a>
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
<main class="wrap">
  ${flash ? html`<div class="flash ${flash.type === 'error' ? 'err' : 'ok'}" role="status">${flash.text}</div>` : ''}
  ${body}
</main>
<footer>
  <div class="wrap">
    ${user ? html`<form method="post" action="/logout" class="logout">${csrfField(ctx)}<button class="btn quiet small">Log out</button></form>` : ''}
    <p>Picks lock at kickoff and grade off ESPN's final scores. Nothing gets edited after the fact.</p>
    <p>Just picks, no betting here. 21+. If gambling stops being fun, call 1-800-GAMBLER.</p>
  </div>
</footer>
${playing
  ? html`<nav class="tabbar" aria-label="Main">${[...nav, ['me', profile, 'Profile', icons.me]].map(link)}</nav>`
  : ''}
</body>
</html>`;
}

export function csrfField(ctx) {
  return ctx.session ? html`<input type="hidden" name="_csrf" value="${ctx.session.csrf}">` : '';
}
