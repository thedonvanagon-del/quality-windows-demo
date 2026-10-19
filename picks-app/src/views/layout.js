import { html } from '../html.js';

/**
 * The page shell. `ctx` carries the app name, the signed-in player, the
 * flash message and the asset URLs; `active` lights up a nav link.
 */
export function layout(ctx, { title, active, body, description }) {
  const { user, flash, app } = ctx;
  const nav = user?.screenName
    ? [
        ['games', '/games', 'Games'],
        ['picks', '/picks', 'My picks'],
        ['board', '/leaderboard', 'Leaderboard'],
        ['groups', '/groups', 'Groups'],
        ['me', `/u/${encodeURIComponent(user.screenName)}`, user.screenName],
      ]
    : user
      ? [['board', '/leaderboard', 'Leaderboard']]
      : [
          ['board', '/leaderboard', 'Leaderboard'],
          ['login', '/login', 'Log in'],
          ['signup', '/signup', 'Sign up'],
        ];
  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title ? `${title} · ${app.name}` : app.name}</title>
<meta name="description" content="${description ?? 'Make your picks before kickoff. They lock, they get graded off the final score, and nobody can edit them.'}">
<meta name="theme-color" content="#17734a">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%2317734a'/%3E%3Cpath d='M9 17l5 5 9-12' stroke='white' stroke-width='4' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E">
<link rel="stylesheet" href="${app.assets.css}">
<script src="${app.assets.js}" defer></script>
</head>
<body>
<header class="top">
  <div class="wrap">
    <a class="brand" href="/"><span class="brand-mark" aria-hidden="true">✓</span>${app.name}</a>
    <nav class="nav" aria-label="Main">
      ${nav.map(([key, href, label]) => html`<a href="${href}" class="${key === active ? 'on' : ''}" ${key === active ? html`aria-current="page"` : ''}>${label}</a>`)}
    </nav>
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
</body>
</html>`;
}

export function csrfField(ctx) {
  return ctx.session ? html`<input type="hidden" name="_csrf" value="${ctx.session.csrf}">` : '';
}
