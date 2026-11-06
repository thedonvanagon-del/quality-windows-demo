import { html } from '../html.js';
import { SPORT, SPORTS } from '../sports.js';
import { CLOSE_AFTER_HOURS, MIN_BETS_MAX, NAME_MAX, PRIZE_MAX } from '../tournaments.js';
import { icons } from './icons.js';
import { csrfField, layout } from './layout.js';
import { adminTabs } from './local.js';
import { avatar, badgeMark, profileLink, rankCell, recordText, signedPct, units } from './parts.js';

const free = html`<span class="free-chip">Free</span>`;

/** "NFL", "NBA · CBB", or "All sports", as chips. */
function sportChips(list) {
  return html`<span class="sport-chips">${list
    ? list.map((k) => html`<span class="sport-chip">${SPORT[k]?.short ?? k}</span>`)
    : html`<span class="sport-chip">All sports</span>`}</span>`;
}

/** "NFL", "NBA or college basketball", "any sport": for the rules. */
function sportWords(list) {
  if (!list) return 'any sport';
  const names = list.map((k) => (k === 'ncaab' ? 'college basketball' : k === 'ncaaf' ? 'college football' : SPORT[k]?.name ?? k));
  return names.length < 2 ? names[0] : `${names.slice(0, -1).join(', ')} or ${names.at(-1)}`;
}

const placeWord = (n) => `${n} more ${n === 1 ? 'bet' : 'bets'} to place`;

function joinForm(ctx, t, next) {
  if (!ctx.user?.screenName) return html`<a class="btn small" href="/login?next=${encodeURIComponent(`/tournaments/${t.slug}`)}">Join</a>`;
  return html`<form method="post" action="/tournaments/${t.slug}/join">${csrfField(ctx)}<input type="hidden" name="next" value="${next}"><button class="btn small">Join</button></form>`;
}

/** The player's status on a card: Join, Joined, or "You're #4". */
function statusOf(ctx, t) {
  const me = t.me;
  if (me?.rank) return html`<span class="tn-status ranked">${t.phase === 'finished' ? `You finished #${me.rank}` : `You're #${me.rank}`}</span>`;
  if (t.kind === 'weekly') return html`<span class="tn-status">Everyone's in</span>`;
  if (me) return html`<span class="tn-status joined">${icons.check}Joined</span>`;
  return t.phase === 'finished' ? '' : joinForm(ctx, t, '/tournaments');
}

/** One tournament as a card on the hub. */
function card(ctx, t) {
  const winner = t.podium?.[0];
  return html`<article class="card tn-card ${t.phase}">
    <div class="tn-top">
      <a class="tn-name" href="/tournaments/${t.slug}">${t.name}</a>
      ${free}
    </div>
    <div class="tn-line">${sportChips(t.sportList)}<span class="tn-window">${t.window}</span></div>
    <div class="tn-line muted">
      <span>${t.entrants == null ? "Everyone's in" : `${t.entrants} ${t.entrants === 1 ? 'entrant' : 'entrants'}`}</span>
      ${t.clock ? html`<span class="dot">${t.clock}</span>` : t.phase === 'finished'
        ? html`<span class="dot">${t.podium ? winner ? html`Won by <b>${winner.screen_name}</b> (${units(winner.units)})` : 'Nobody placed' : 'Final once every bet is graded'}</span>`
        : ''}
    </div>
    <p class="tn-prize">${icons.medal}<span>${t.prize}</span></p>
    <div class="tn-foot"><span class="tn-min">${t.min_bets} graded ${t.min_bets === 1 ? 'bet' : 'bets'} to place</span>${statusOf(ctx, t)}</div>
  </article>`;
}

function section(ctx, title, list, empty) {
  return html`<h2>${title}</h2>${list.length
    ? html`<div class="tn-list">${list.map((t) => card(ctx, t))}</div>`
    : html`<div class="card empty">${empty}</div>`}`;
}

/** The hub: live now, starting soon, and the last few finished. */
export function hub(ctx, { live, soon, finished, admin = false }) {
  return layout(ctx, {
    title: 'Tournaments',
    active: 'tournaments',
    description: 'Free Bookie Bullies tournaments: join, make your picks, and play for the top spot.',
    body: html`
      <h1>Tournaments</h1>
      <p class="lede">Free to join, one tap. Only bets you make after joining count, on games inside the tournament's window. Most units wins.</p>
      ${admin ? html`<p><a class="btn ghost small" href="/admin/tournaments">New tournament</a></p>` : ''}
      ${section(ctx, 'Live now', live, 'Nothing live right now.')}
      ${section(ctx, 'Starting soon', soon, 'Nothing new yet. Tournaments open about two days ahead.')}
      ${section(ctx, 'Finished', finished, 'None finished yet.')}
      <a class="btn ghost block winners-link" href="/winners?tab=tournaments">Winners wall</a>
    `,
  });
}

/** Standings, with the viewer's row lit up and how many more bets each unplaced player needs. */
function standingsTable(rows, { me, min, badges }) {
  if (!rows.length) return html`<div class="card empty">Nobody on the board yet. Standings fill in as games go final.</div>`;
  return html`<div class="table"><table class="tn-table">
    <thead><tr><th>#</th><th>Player</th><th class="n">Record</th><th class="n">Units</th><th class="n hide-sm">ROI</th></tr></thead>
    <tbody>${rows.map((r) => html`<tr class="${r.id === me ? 'me' : ''}">
      <td class="rank">${rankCell(r)}</td>
      <td><span class="player">${avatar(r)}<span class="tn-who">${profileLink(r.screen_name, { official: r.official })}${badges ? badgeMark(badges.get(r.id)) : ''}${!r.official && r.graded < min ? html`<small class="to-place">${placeWord(min - r.graded)}</small>` : ''}</span></span></td>
      <td class="n">${recordText(r)}</td>
      <td class="n"><b>${units(r.units)}</b></td>
      <td class="n hide-sm">${signedPct(r.roi)}</td>
    </tr>`)}</tbody>
  </table></div>`;
}

function podiumList(list) {
  return html`<ol class="podium">${list.map((r) => html`<li class="p${r.place}">
    <span class="place">#${r.place}</span>
    <span class="who-cell">${profileLink(r.screen_name)}</span>
    <span class="rec">${r.record}</span>
    <b>${units(r.units)}</b>
  </li>`)}</ol>`;
}

/** One tournament: rules, the clock, Join or Leave, standings, and the podium once it's closed. */
export function detail(ctx, { t, rows, badges, entry, entrants, podium }) {
  const playing = Boolean(ctx.user?.screenName);
  const weekly = t.kind === 'weekly';
  const here = `/tournaments/${t.slug}`;
  const sports = sportWords(t.sportList);
  const myRow = playing ? rows.find((r) => r.id === ctx.user.id) ?? null : null;
  let action = '';
  if (weekly) action = html`<p class="muted">Everyone's in. No need to join. These are the same standings as <a href="/contest">This week's contest</a>.</p>`;
  else if (entry && t.phase === 'soon') {
    action = html`<div class="row tn-actions"><span class="tn-status joined">${icons.check}You're in</span>
      <form method="post" action="${here}/leave" data-confirm="Leave ${t.name}?">${csrfField(ctx)}<button class="btn ghost small">Leave</button></form></div>`;
  } else if (entry) action = html`<div class="row tn-actions"><span class="tn-status joined">${icons.check}You're in</span></div>`;
  else if (t.phase !== 'finished') {
    action = html`<div class="tn-join">${joinForm(ctx, t, here)}<span class="muted small">Free. Bets you make from now on count.</span></div>`;
  }

  return layout(ctx, {
    title: t.name,
    active: 'tournaments',
    description: `${t.name}: a free Bookie Bullies tournament. ${t.window}.`,
    body: html`
      <a class="back" href="/tournaments">← Tournaments</a>
      <div class="tn-title"><h1>${t.name}</h1>${free}</div>
      <div class="tn-line">${sportChips(t.sportList)}<span class="muted">${weekly ? "Everyone's in" : `${entrants} ${entrants === 1 ? 'entrant' : 'entrants'}`}</span></div>
      <div class="contest-clock">
        <span class="cc-week">${t.window}</span>
        <b>${t.phase === 'soon' ? 'Starting soon' : t.phase === 'live' ? 'Live now' : 'Finished'}</b>
        <span class="cc-left">${t.clock ?? (podium ? 'Final' : 'Final once every bet is graded')}</span>
      </div>
      <p class="tn-prize">${icons.medal}<span>${t.prize}</span></p>
      ${action}
      ${myRow && t.phase !== 'soon'
        ? html`<div class="card my-standing">
            <span class="ms-place">${myRow.rank ? `#${myRow.rank}` : '–'}</span>
            <span class="ms-text"><b>You</b><small>${recordText(myRow)} · ${myRow.rank ? `${signedPct(myRow.roi)} ROI` : placeWord(t.min_bets - myRow.graded)}</small></span>
            <b class="ms-units">${units(myRow.units)}</b>
          </div>`
        : ''}
      ${podium
        ? html`<h2>Final podium</h2>${podium.length ? podiumList(podium) : html`<div class="card empty">Nobody had ${t.min_bets} graded bets to place.</div>`}`
        : t.phase === 'finished'
          ? html`<p class="muted">Final once every counted bet is graded, ${CLOSE_AFTER_HOURS} hours after the end at the latest.</p>`
          : ''}
      <h2>Standings</h2>
      ${standingsTable(rows, { me: ctx.user?.id, min: t.min_bets, badges })}
      <h2>Rules</h2>
      <ul class="tn-rules">
        <li>Free. Nothing to pay, nothing paid out.</li>
        ${weekly
          ? html`<li>Everyone's in. Every bet on a game that starts in the window counts.</li>`
          : html`<li>Join any time before it ends. Only bets you make after joining count.</li>`}
        <li>A bet counts when its game starts in the window (${t.window})${t.sportList ? html` and it's ${sports}` : ''}. For a parlay, that's its first game${t.sportList ? html`, and every leg has to be ${sports}` : ''}.</li>
        <li>Straight picks and parlays both count. A parlay is one bet.</li>
        <li>Ranked by units won on graded bets. ${t.min_bets} graded ${t.min_bets === 1 ? 'bet' : 'bets'} to place.</li>
        <li>Ties go to the better ROI, then to the player whose last counted bet started first.</li>
        ${weekly ? '' : html`<li>You can leave until it starts. After that you're in.</li>`}
        <li>${weekly
          ? 'It closes once every bet is graded, by Tuesday 6 AM ET at the latest.'
          : `It closes once every counted bet is graded, ${CLOSE_AFTER_HOURS} hours after the end at the latest.`} The top 3 get a badge and go on the winners wall.</li>
        <li>The official BookieBullies account shows on the board but never places.</li>
      </ul>
    `,
  });
}

/** For admins: make a tournament, and cancel one before it starts. */
export function admin(ctx, { list, error = null, form = {} }) {
  const chosen = new Set(form.sports ?? []);
  return layout(ctx, {
    title: 'Tournaments admin',
    active: 'more',
    body: html`
      <a class="back" href="/more">← More</a>
      <h1>Tournaments admin</h1>
      ${adminTabs('tournaments')}
      <p class="lede">Make a free tournament, or cancel one before it starts. NFL Sunday, College Saturday, Hoops Night and the Weekly Open make themselves.</p>
      <h2>New tournament</h2>
      ${error ? html`<div class="flash err" role="alert">${error}</div>` : ''}
      <form class="form card tn-form" method="post" action="/admin/tournaments">
        ${csrfField(ctx)}
        <label>Name<input type="text" name="name" value="${form.name ?? ''}" maxlength="${NAME_MAX}" required></label>
        <fieldset class="tn-sports"><legend>Sports <span class="hint">None checked means all sports</span></legend>
          ${SPORTS.map((s) => html`<label class="check"><input type="checkbox" name="sports" value="${s.key}" ${chosen.has(s.key) ? 'checked' : ''}><span>${s.name}</span></label>`)}
        </fieldset>
        <div class="pair">
          <label>Starts (ET)<input type="date" name="start_date" value="${form.startDate ?? ''}" required></label>
          <label>Time<input type="time" name="start_time" value="${form.startTime ?? '00:00'}" required></label>
        </div>
        <div class="pair">
          <label>Ends (ET)<input type="date" name="end_date" value="${form.endDate ?? ''}" required></label>
          <label>Time<input type="time" name="end_time" value="${form.endTime ?? '23:59'}" required></label>
        </div>
        <label>Graded bets to place<input type="number" name="min_bets" value="${form.minBets ?? '3'}" min="1" max="${MIN_BETS_MAX}" required></label>
        <label>Prize <span class="hint">What the winner gets. No money.</span><input type="text" name="prize" value="${form.prize ?? ''}" maxlength="${PRIZE_MAX}" placeholder="Champion badge and the top spot on the winners wall"></label>
        <button class="btn">Make it</button>
      </form>
      <h2>Live and coming up</h2>
      ${list.length
        ? html`<ul class="menu tn-admin">${list.map((t) => html`<li><div class="tn-admin-row">
            <span class="text"><a href="/tournaments/${t.slug}">${t.name}</a><small>${t.window} · ${t.kind === 'weekly' ? "everyone's in" : `${t.entrants} ${t.entrants === 1 ? 'entrant' : 'entrants'}`} · ${t.kind}</small></span>
            ${t.phase === 'soon' && t.kind !== 'weekly'
              ? html`<form method="post" action="/admin/tournaments/${t.slug}/cancel" data-confirm="Cancel ${t.name}? Everyone who joined hears about it.">${csrfField(ctx)}<button class="btn small danger">Cancel</button></form>`
              : html`<span class="muted small">${t.phase === 'live' ? 'Live' : ''}</span>`}
          </div></li>`)}</ul>`
        : html`<div class="card empty">Nothing live or coming up.</div>`}
    `,
  });
}
