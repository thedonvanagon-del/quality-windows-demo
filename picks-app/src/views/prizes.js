// Prize tournaments: the official rules page and the admin page for one.

import { html } from '../html.js';
import { DEFAULT_ELIGIBILITY, dollars, FIELD_MAX, VALUE_MAX_DOLLARS, WINNER_METHOD } from '../prizes.js';
import { SPORT } from '../sports.js';
import { csrfField, layout } from './layout.js';
import { adminTabs } from './local.js';
import { at } from './parts.js';

const sportsText = (list) => (list ? list.map((k) => SPORT[k]?.name ?? k).join(', ') : 'any sport');

/**
 * The official rules: the prize's fields poured into a standard template.
 * Admins see a banner on top: these are drafts until a lawyer reads them.
 */
export function rulesPage(ctx, { t, prize, admin, appName, contact }) {
  const value = dollars(prize.value_cents);
  const sections = [
    ['Sponsor', html`${prize.sponsor} ("Sponsor") sponsors this tournament and its prize. It is run in the ${appName} app (app.bookiebullies.com).`],
    ['No purchase necessary', html`<b>NO PURCHASE NECESSARY TO ENTER OR WIN.</b> A purchase or payment of any kind will not improve your chances of winning. There is no entry fee and no way to pay one.`],
    ['Eligibility', html`Open to: ${prize.eligibility}. You need a ${appName} account with a confirmed email. Employees of the Sponsor and of ${appName}, and their immediate families and households, are not eligible.`],
    ['Entry period', html`${t.window}. Entries are accepted from when the tournament is published until it ends. The app's clock is the official clock.`],
    ['How to enter', html`Free. Sign in to ${appName}, open the tournament, check "I've read the official rules" and tap Join. One entry per person. Making more than one account to enter more than once voids every entry.`],
    ['How the winner is determined', html`Skill, not chance. ${WINNER_METHOD} Players rank by units won on graded picks made after joining, on games that start inside the entry period${t.sportList ? ` (${sportsText(t.sportList)})` : ''}, with at least ${t.min_bets} graded ${t.min_bets === 1 ? 'pick' : 'picks'} to place. Ties go to the better return on units risked, then to the player whose last counted pick started first, the same as every tournament in the app. Picks are graded off final scores; a postponed or canceled game doesn't count. The tournament closes once every counted pick is graded, or 30 hours after the end at the latest.`],
    ['Prize and approximate retail value', html`One prize: ${prize.prize}. Approximate retail value: ${value}. No cash or other substitute, and the prize can't be transferred, except that the Sponsor may substitute a prize of equal or greater value if this one isn't available. Delivery: ${prize.delivery}`],
    ['Odds', html`Odds of winning depend on skill and the number of entrants.`],
    ['Winner notification and verification', html`The winner is told in the app and by email to the address on their account within 7 days of the close. They may be asked to confirm their eligibility, identity and mailing address within 14 days. If they don't, are not eligible, or the prize comes back undeliverable, the prize goes to the next eligible player in the final standings.`],
    ['Publicity', html`Except where the law forbids it, entering means the Sponsor and ${appName} may use the winner's screen name and finish to announce the result, in the app and elsewhere, without further pay.`],
    ['General conditions', html`The Sponsor and ${appName} may disqualify anyone who tampers with entries or the app, breaks these rules or the Terms of Use, or acts unfairly. If a problem outside their control (a feed outage, a bug, fraud) spoils the tournament, they may cancel it or pick the winner from the standings as they stood before the problem. Taxes on the prize are the winner's. The Sponsor's and ${appName}'s decisions are final.`],
    ['Limitation of liability', html`<span class="placeholder">[Placeholder: a lawyer supplies this section, including any release of the Sponsor and ${appName} and the governing law.]</span>`],
    ['Privacy', html`What you give us is handled under our <a href="/privacy">Privacy Policy</a>. The winner's name and mailing address go to the Sponsor only to deliver the prize.`],
    ['Winners list', html`For the winner's screen name, email ${contact} within 60 days of the close, with "${t.name} winner" in the subject.`],
  ];
  return layout(ctx, {
    title: `${t.name}: official rules`,
    active: 'tournaments',
    body: html`
      ${admin ? html`<div class="admin-banner draft-rules" role="note"><b>Draft rules: have a lawyer review before running this tournament.</b><span>Only admins see this banner.${prize.reviewed_at ? html` A review was recorded ${at(prize.reviewed_at, 'long')}.` : ''} <a href="/admin/tournaments/${t.slug}/prize">Prize settings</a></span></div>` : ''}
      <a class="back" href="/tournaments/${t.slug}">← ${t.name}</a>
      <h1>Official rules</h1>
      <p class="lede">${t.name}. Free to enter. Prize: ${prize.prize} (about ${value}, from ${prize.sponsor}).</p>
      <ol class="rules">${sections.map(([title, text]) => html`<li><h2>${title}</h2><p>${text}</p></li>`)}</ol>
      <p class="fine">Last changed ${at(prize.updated_at, 'long')}.</p>
    `,
  });
}

/** The admin page for one prize tournament: the fields, the lawyer review, publish, and after the close the winner. */
export function adminPrize(ctx, { t, prize, audit, winner, form = null, error = null, entrants }) {
  const f = form ?? (prize ? { ...prize, value: (prize.value_cents / 100).toFixed(prize.value_cents % 100 ? 2 : 0) } : { eligibility: DEFAULT_ELIGIBILITY });
  const locked = Boolean(prize?.published_at);
  return layout(ctx, {
    title: `Prize: ${t.name}`,
    active: 'more',
    body: html`
      <a class="back" href="/admin/tournaments#prizes">← Tournaments admin</a>
      <h1>Prize tournament</h1>
      ${adminTabs('tournaments')}
      <p class="lede"><a href="/tournaments/${t.slug}">${t.name}</a> · ${t.window} · ${entrants} ${entrants === 1 ? 'entrant' : 'entrants'}</p>
      <div class="card stack prize-status">
        <span><b>Status:</b> ${prize?.published_at ? 'Published' : prize ? 'Draft: only admins can see it' : 'Not a prize tournament yet'}</span>
        <span class="muted small">Free to enter, always. No purchase or payment of any kind.</span>
      </div>
      ${error ? html`<div class="flash err" role="alert">${error}</div>` : ''}
      <h2>The prize</h2>
      <form class="form card" method="post" action="/admin/tournaments/${t.slug}/prize">
        ${csrfField(ctx)}
        <label>Prize <span class="hint">What the winner gets</span><input type="text" name="prize" value="${f.prize ?? ''}" maxlength="${FIELD_MAX.prize}" required placeholder="A bag of Buddha Beans coffee" ${locked ? 'disabled' : ''}></label>
        <label>Value in dollars <span class="hint">Approximate retail value, up to $${VALUE_MAX_DOLLARS.toLocaleString('en-US')}</span><input type="text" name="value" value="${f.value ?? ''}" inputmode="decimal" required placeholder="25" ${locked ? 'disabled' : ''}></label>
        <label>Sponsor<input type="text" name="sponsor" value="${f.sponsor ?? ''}" maxlength="${FIELD_MAX.sponsor}" required placeholder="Buddha Beans Coffee Co." ${locked ? 'disabled' : ''}></label>
        <label>Eligibility<input type="text" name="eligibility" value="${f.eligibility ?? DEFAULT_ELIGIBILITY}" maxlength="${FIELD_MAX.eligibility}" required ${locked ? 'disabled' : ''}></label>
        <p class="hint">How the winner is picked: ${WINNER_METHOD}</p>
        <label>Delivery <span class="hint">How and when the prize gets to the winner</span><textarea name="delivery" rows="3" maxlength="${FIELD_MAX.delivery}" required placeholder="Shipped by the Sponsor to a US address within 30 days of the close." ${locked ? 'disabled' : ''}>${f.delivery ?? ''}</textarea></label>
        ${locked ? html`<p class="muted small">Published, so the prize and rules can't change.</p>` : html`<button class="btn">${prize ? 'Save the prize' : 'Make it a prize tournament'}</button>`}
        ${prize ? html`<a class="small" href="/tournaments/${t.slug}/rules">See the official rules</a>` : ''}
      </form>
      ${prize ? html`
        <h2>Rules review</h2>
        <form class="form card" method="post" action="/admin/tournaments/${t.slug}/prize/review">
          ${csrfField(ctx)}
          <label class="check"><input type="checkbox" name="reviewed" value="1" ${prize.reviewed_at ? 'checked' : ''} ${locked ? 'disabled' : ''}><span>A lawyer has reviewed these rules</span></label>
          ${prize.reviewed_at ? html`<p class="muted small">Recorded by ${audit.reviewer?.screen_name ?? 'an admin'} ${at(prize.reviewed_at, 'long')}.</p>` : html`<p class="muted small">Changing the prize clears this, since the rules change with it.</p>`}
          ${locked ? '' : html`<button class="btn ghost small">Save</button>`}
        </form>
        <h2>Publish</h2>
        <div class="card stack">
          ${prize.published_at
            ? html`<span>Published by ${audit.publisher?.screen_name ?? 'an admin'} ${at(prize.published_at, 'long')}. Players can see it and join.</span>`
            : html`<span class="muted small">Players can't see this tournament until it's published. Publishing needs the lawyer review above.</span>
              <form method="post" action="/admin/tournaments/${t.slug}/prize/publish" data-confirm="Publish ${t.name}? Players see it and can join.">${csrfField(ctx)}<button class="btn small" ${prize.reviewed_at ? '' : 'disabled'}>Publish</button></form>`}
        </div>
        <h2>Winner</h2>
        ${winner
          ? html`<div class="card stack prize-winner">
              <span><b>${winner.screen_name}</b> · ${winner.email}</span>
              <span class="muted small">${winner.record} · ${winner.units > 0 ? '+' : ''}${winner.units}u${winner.rules_accepted_at ? html` · read the rules ${at(winner.rules_accepted_at, 'long')}` : ''}</span>
              ${prize.sent_at
                ? html`<span>Prize sent, marked by ${audit.sender?.screen_name ?? 'an admin'} ${at(prize.sent_at, 'long')}.</span>`
                : html`<form method="post" action="/admin/tournaments/${t.slug}/prize/sent" data-confirm="Mark the prize as sent to ${winner.screen_name}?">${csrfField(ctx)}<button class="btn small">Mark prize sent</button></form>`}
            </div>`
          : html`<div class="card empty">${t.closed_at ? 'Nobody placed, so there is no winner.' : 'The winner shows here once the tournament closes.'}</div>`}
      ` : ''}
    `,
  });
}
