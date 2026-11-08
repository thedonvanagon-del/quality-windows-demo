// Follow a game: the bell on a game, and the game alerts settings it opens.

import { html } from '../html.js';
import { GAME_ALERTS } from '../gamealerts.js';
import { SPORT } from '../sports.js';
import { icons } from './icons.js';
import { csrfField, layout } from './layout.js';
import { at } from './parts.js';

const gameUrl = (id) => `/games/${encodeURIComponent(id)}`;

/**
 * The bell on a game. Not followed: a form that follows it (app.js sends it
 * without a reload), coming back to `next`. Followed: a gold bell that opens
 * the game alerts (in the sheet, with JavaScript).
 */
export function followBell(ctx, gameId, { following, next }) {
  return following
    ? html`<a class="bell on" href="${gameUrl(gameId)}/alerts" data-sheet="Game alerts" aria-pressed="true" aria-label="Following. Change alerts">${icons.bellOn}</a>`
    : html`<form class="follow" method="post" action="${gameUrl(gameId)}/follow" data-follow>${csrfField(ctx)}<input type="hidden" name="next" value="${next}"><button class="bell" aria-pressed="false" aria-label="Follow this game">${icons.bell}</button></form>`;
}

/**
 * The game alerts page: what the followed bell opens. A page (so it works
 * without JavaScript) whose `.slip` app.js lifts into the sheet.
 */
export function gameAlertsPage(ctx, { game, following, prefs, phones, pushKey }) {
  const sport = SPORT[game.sport];
  const here = `${gameUrl(game.id)}/alerts`;
  return layout(ctx, {
    title: 'Game alerts',
    active: 'games',
    body: html`
      <div class="narrow">
        <a class="back" href="${gameUrl(game.id)}">← ${game.away.short} @ ${game.home.short}</a>
        <div class="slip alerts-slip" data-game-id="${game.id}">
          <div class="slip-head"><span>Game alerts</span><span>${sport?.short ?? ''} · ${at(game.start)}</span></div>
          <div class="slip-body">
            <h2 class="alerts-title">${game.away.short} @ ${game.home.short}</h2>
            ${following
              ? html`<p class="muted">You're following this game. These alerts apply to every game you follow.</p>`
              : html`<p class="muted">You're not following this game. These alerts apply to every game you follow.</p>`}
            <form class="form prefs alerts-prefs" method="post" action="/settings/game-alerts" data-game-alerts>
              ${csrfField(ctx)}
              <input type="hidden" name="next" value="${here}">
              ${GAME_ALERTS.map((a) => html`<label class="check"><input type="checkbox" name="${a.key}" ${prefs[a.key] ? 'checked' : ''}><span>${a.label}${a.sub ? html`<small>${a.sub}</small>` : ''}</span></label>`)}
              <button class="btn small" data-alerts-save>Save</button>
              <p class="small muted" data-alerts-status role="status"></p>
            </form>
            ${phones
              ? ''
              : html`<div class="alerts-push">
                  <p class="small">Phone notifications are off, so these only show in your inbox.</p>
                  ${pushKey
                    ? html`<div class="push-box" data-push-key="${pushKey}">
                        <button class="btn small" type="button" data-push-on hidden>Turn on for this device</button>
                        <p class="muted small" data-push-help hidden>On iPhone, add LockBox to your Home Screen first (Share, then Add to Home Screen), open it from there, and come back to this page.</p>
                        <p class="small" data-push-status role="status"></p>
                      </div>`
                    : ''}
                  <a class="small" href="/notifications">Notification settings</a>
                </div>`}
            ${following
              ? html`<form class="unfollow" method="post" action="${gameUrl(game.id)}/unfollow" data-unfollow>
                  ${csrfField(ctx)}<input type="hidden" name="next" value="${gameUrl(game.id)}">
                  <button class="btn ghost block">Unfollow game</button>
                </form>`
              : game.state === 'post'
                ? ''
                : html`<form method="post" action="${gameUrl(game.id)}/follow">
                    ${csrfField(ctx)}<input type="hidden" name="next" value="${here}">
                    <button class="btn block">Follow this game</button>
                  </form>`}
          </div>
        </div>
      </div>
    `,
  });
}
