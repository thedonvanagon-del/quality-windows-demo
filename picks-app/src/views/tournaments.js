import { html } from '../html.js';
import { SPORT, SPORTS } from '../sports.js';
import {
  CLOSE_AFTER_HOURS, endLabel, MIN_BETS_MAX, NAME_MAX, PLAYER_ACTIVE_MAX, PLAYER_LEAD_MINUTES, PLAYER_MAX_DAYS, PLAYER_MIN_BETS_MAX, PLAYER_NAME_MAX,
  PLAYER_PER_DAY, PLAYER_PRIZE, PRIZE_MAX, TOURNAMENT_HIDE_AFTER,
} from '../tournaments.js';
import { icons } from './icons.js';
import { csrfField, layout } from './layout.js';
import { adminTabs } from './local.js';
import { at, avatar, badgeMark, chatBox, playerName, profileLink, rankCell, recordText, signedPct, units, winShare } from './parts.js';

const free = html`<span class="free-chip">Free</span>`;
const playerMade = html`<span class="pm-chip">Player-made</span>`;

/** "Made by Ann", and "For Saturday Crew members" when it's tied to a group. */
function madeBy(t) {
  const h = t.host;
  if (!h) return '';
  return html`<div class="tn-line tn-maker"><span>Made by ${h.creator_name ? profileLink(h.creator_name) : 'a player'}</span>${h.members_only
    ? html`<span class="dot">${h.group_name ? html`For <a href="/groups/${h.group_id}">${h.group_name}</a> members` : 'Members only'}</span>`
    : ''}${h.visibility === 'private' ? html`<span class="dot">Private</span>` : ''}</div>`;
}


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

/** Join: a private one carries its invite code along. */
function joinForm(ctx, t, next, code = t.host?.visibility === 'private' ? t.host.invite_code : null) {
  if (!ctx.user?.screenName) return html`<a class="btn small" href="/login?next=${encodeURIComponent(t.href ?? `/tournaments/${t.slug}`)}">Join</a>`;
  return html`<form method="post" action="/tournaments/${t.slug}/join">${csrfField(ctx)}<input type="hidden" name="next" value="${next}">${code ? html`<input type="hidden" name="code" value="${code}">` : ''}<button class="btn small">Join</button></form>`;
}

/** The player's status on a card: Join, Joined, "You're #4", or Members only. */
function statusOf(ctx, t, next) {
  const me = t.me;
  if (me?.rank) return html`<span class="tn-status ranked">${t.phase === 'finished' ? `You finished #${me.rank}` : `You're #${me.rank}`}</span>`;
  if (t.kind === 'weekly') return html`<span class="tn-status">Everyone's in</span>`;
  if (me) return html`<span class="tn-status joined">${icons.check}Joined</span>`;
  if (t.phase === 'finished') return '';
  if (t.membersOnly) return html`<span class="tn-status">Members only</span>`;
  return joinForm(ctx, t, next);
}

/** One tournament as a card: on the hub, or a group's page (`next` is where Join comes back to). */
export function card(ctx, t, next = '/tournaments') {
  const winner = t.podium?.[0];
  return html`<article class="card tn-card ${t.phase} ${t.host ? 'player-made' : ''}">
    <div class="tn-top">
      <a class="tn-name" href="${t.href ?? `/tournaments/${t.slug}`}">${t.name}</a>
      <span class="tn-chips">${free}${t.host ? playerMade : ''}</span>
    </div>
    ${madeBy(t)}
    <div class="tn-line">${sportChips(t.sportList)}<span class="tn-window">${t.window}</span></div>
    <div class="tn-line muted">
      <span>${t.entrants == null ? "Everyone's in" : `${t.entrants} ${t.entrants === 1 ? 'entrant' : 'entrants'}`}</span>
      ${t.clock ? html`<span class="dot">${t.clock}</span>` : t.phase === 'finished'
        ? html`<span class="dot">${t.podium ? winner ? html`Won by <b>${winner.screen_name}</b> (${units(winner.units)})` : 'Nobody placed' : 'Final once every bet is graded'}</span>`
        : ''}
    </div>
    <p class="tn-prize">${icons.medal}<span>${t.prize}</span></p>
    <div class="tn-foot"><span class="tn-min">${t.min_bets} graded ${t.min_bets === 1 ? 'bet' : 'bets'} to place</span>${statusOf(ctx, t, next)}</div>
  </article>`;
}

function section(ctx, title, list, empty, id = null) {
  return html`<h2 ${id ? html`id="${id}"` : ''}>${title}</h2>${list.length
    ? html`<div class="tn-list">${list.map((t) => card(ctx, t))}</div>`
    : html`<div class="card empty">${empty}</div>`}`;
}

/** The hub: live now, starting soon, player tournaments, and the last few finished. */
export function hub(ctx, { live, soon, players = [], finished, admin = false }) {
  return layout(ctx, {
    title: 'Tournaments',
    active: 'tournaments',
    description: 'Free Bookie Bullies tournaments: join, make your picks, and play for the top spot.',
    body: html`
      <h1>Tournaments</h1>
      <p class="lede">Free to join, one tap. Only bets you make after joining count, on games inside the tournament's window. Most units wins.</p>
      <div class="row tn-make">
        <a class="btn small" href="/tournaments/new">Make a tournament</a>
        ${admin ? html`<a class="btn ghost small" href="/admin/tournaments">Admin</a>` : ''}
      </div>
      ${section(ctx, 'Live now', live, 'Nothing live right now.')}
      ${section(ctx, 'Starting soon', soon, 'Nothing new yet. Tournaments open about two days ahead.')}
      ${section(ctx, 'Player tournaments', players, html`None right now. <a href="/tournaments/new">Make one</a> for your crew.`, 'players')}
      ${section(ctx, 'Finished', finished, 'None finished yet.')}
      <a class="btn ghost block winners-link" href="/winners?tab=tournaments">Winners wall</a>
    `,
  });
}

/** ▲3 or ▼1: places moved against the graded-only order, while live. */
function moveMark(move) {
  if (!move) return '';
  const up = move > 0;
  return html`<span class="move ${up ? 'up' : 'down'}" title="${up ? 'Up' : 'Down'} ${Math.abs(move)} with games in progress"><span aria-hidden="true">${up ? '▲' : '▼'}${Math.abs(move)}</span><span class="sr-only">${up ? 'up' : 'down'} ${Math.abs(move)}</span></span>`;
}

/** Standings, with the viewer's row lit up and how many more bets each unplaced player needs. While live: movement and "2 live". */
function standingsTable(rows, { me, min, badges }) {
  if (!rows.length) return html`<div class="card empty">Nobody on the board yet. Standings fill in as games go final.</div>`;
  return html`<div class="table"><table class="tn-table">
    <thead><tr><th>#</th><th>Player</th><th class="n">Record</th><th class="n">Units</th><th class="n hide-sm">ROI</th></tr></thead>
    <tbody>${rows.map((r) => html`<tr class="${r.id === me ? 'me' : ''}">
      <td class="rank">${rankCell(r)}${moveMark(r.move)}</td>
      <td><span class="player">${avatar(r)}<span class="tn-who">${playerName(r)}${badges ? badgeMark(badges.get(r.id)) : ''}${!r.official && r.graded < min ? html`<small class="to-place">${placeWord(min - r.graded)}</small>` : ''}${r.live ? html`<small class="live-count">${r.live} live</small>` : ''}</span></span></td>
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

/** The chat, for entrants: read-only once canceled. Everyone else hears how to get in. */
function chatSection(ctx, t, { chat, canceled, entry }) {
  let body;
  if (chat && canceled) {
    body = html`<div class="chat"><ol class="chat-list">${chat.length
      ? chat.map((m) => html`<li class="msg" data-id="${m.id}"><div class="msg-head">${avatar(m, 'xs')}${playerName(m)}</div><p class="msg-body">${m.hidden ? 'Hidden after reports.' : m.body}</p></li>`)
      : html`<li class="chat-empty">Nobody said anything.</li>`}</ol>
      <p class="fine">This tournament was canceled, so its chat is read-only.</p></div>`;
  } else if (chat) {
    body = chatBox(ctx, {
      messages: chat,
      action: `/tournaments/${t.slug}/chat`,
      placeholder: `Talk to everyone in ${t.name}`,
      rules: `${t.kind === 'weekly' ? 'Everyone in the Weekly Open sees this' : `Only players in ${t.name} see this`}. Trash talk is fine; harassment, hate and selling picks aren't. Three reports hide a message.`,
    });
  } else if (canceled) {
    return '';
  } else if (!ctx.user?.screenName) {
    body = html`<div class="card empty"><a href="/login?next=${encodeURIComponent(t.href ?? `/tournaments/${t.slug}`)}">Log in</a> and join to see the chat.</div>`;
  } else if (!entry) {
    body = html`<div class="card empty">${t.phase === 'finished' ? 'The chat is for players who were in it.' : 'Join to see the chat. Only players in it can read and post.'}</div>`;
  }
  return html`<h2 id="chat">Chat</h2>${body}`;
}

/** Its maker's tools: the invite link to copy, and Cancel before the start. */
function makerTools(ctx, t, { inviteUrl, canceled }) {
  if (canceled) return '';
  return html`<div class="card stack tn-invite">
    <b>Invite players</b>
    <div class="muted small copy">${inviteUrl}</div>
    <div class="row">
      <button class="btn quiet small" type="button" data-copy="${inviteUrl}" hidden>Copy invite link</button>
      ${t.phase === 'soon'
        ? html`<form method="post" action="/tournaments/${t.slug}/cancel" data-confirm="Cancel ${t.name}? Everyone who joined hears about it.">${csrfField(ctx)}<button class="btn ghost small danger">Cancel tournament</button></form>`
        : ''}
    </div>
  </div>`;
}

/**
 * One tournament: rules, the clock, Join or Leave, standings (As it stands,
 * refreshed every 45 seconds, while live), the chat, the podium once it's
 * closed, and Share for a player on it. A player-made one adds who made it,
 * its maker's invite link and Cancel, and Report for everyone else.
 */
export function detail(ctx, {
  t, rows, live = false, myRow = null, badges, entry, entrants, podium, canceled = false, host = null, mine = false, code = null,
  inviteUrl = null, reported = false, chat = null, share = null,
}) {
  const playing = Boolean(ctx.user?.screenName);
  const weekly = t.kind === 'weekly';
  const here = t.href ?? `/tournaments/${t.slug}`;
  const sports = sportWords(t.sportList);
  let action = '';
  if (canceled) action = html`<div class="card empty tn-canceled" role="status">This tournament was canceled. Nothing in it counts. ${chat ? 'Its chat stays, read-only.' : ''}</div>`;
  else if (weekly) action = html`<p class="muted">Everyone's in. No need to join. These are the same standings as <a href="/contest">This week's contest</a>.</p>`;
  else if (entry && t.phase === 'soon' && !mine) {
    action = html`<div class="row tn-actions"><span class="tn-status joined">${icons.check}You're in</span>
      <form method="post" action="${here}/leave" data-confirm="Leave ${t.name}?">${csrfField(ctx)}<button class="btn ghost small">Leave</button></form></div>`;
  } else if (entry) action = html`<div class="row tn-actions"><span class="tn-status joined">${icons.check}You're in</span></div>`;
  else if (t.phase !== 'finished' && t.membersOnly) {
    action = html`<p class="muted">${host?.group_name ? html`Only members of <a href="/groups/${host.group_id}">${host.group_name}</a> can join this one.` : 'This one is closed to new players.'}</p>`;
  } else if (t.phase !== 'finished') {
    action = html`<div class="tn-join">${joinForm(ctx, t, here, code)}<span class="muted small">Free. Bets you make from now on count.</span></div>`;
  }
  const table = standingsTable(rows, { me: ctx.user?.id, min: t.min_bets, badges });

  return layout(ctx, {
    title: t.name,
    active: 'tournaments',
    description: `${t.name}: a free Bookie Bullies tournament. ${t.window}.`,
    body: html`
      <a class="back" href="/tournaments">← Tournaments</a>
      <div class="tn-title"><h1>${t.name}</h1>${free}${host ? playerMade : ''}</div>
      <div class="tn-line">${sportChips(t.sportList)}<span class="muted">${weekly ? "Everyone's in" : `${entrants} ${entrants === 1 ? 'entrant' : 'entrants'}`}</span></div>
      ${madeBy(t)}
      <div class="contest-clock">
        <span class="cc-week">${t.window}</span>
        <b>${canceled ? 'Canceled' : t.phase === 'soon' ? 'Starting soon' : t.phase === 'live' ? 'Live now' : 'Finished'}</b>
        <span class="cc-left">${canceled ? '' : t.clock ?? (podium ? 'Final' : 'Final once every bet is graded')}</span>
      </div>
      <p class="tn-prize">${icons.medal}<span>${t.prize}</span></p>
      ${action}
      ${mine && inviteUrl ? makerTools(ctx, t, { inviteUrl, canceled }) : ''}
      ${myRow && t.phase !== 'soon' && !canceled
        ? html`<div class="card my-standing">
            <span class="ms-place">${myRow.rank ? `#${myRow.rank}` : '–'}</span>
            <span class="ms-text"><b>You</b><small>${recordText(myRow)} · ${myRow.rank ? `${signedPct(myRow.roi)} ROI` : placeWord(t.min_bets - myRow.graded)}</small></span>
            <b class="ms-units">${units(myRow.units)}</b>
          </div>`
        : ''}
      ${podium
        ? html`<h2>Final podium</h2>${podium.length ? podiumList(podium) : html`<div class="card empty">Nobody had ${t.min_bets} graded bets to place.</div>`}
          ${share ? html`<div class="card win-card">
            <span class="wc-text"><b>You finished ${share.place === 1 ? '1st' : share.place === 2 ? '2nd' : '3rd'}.</b><small>Out of ${share.players} ${share.players === 1 ? 'player' : 'players'}. Share the card.</small></span>
            ${winShare(ctx, { place: share.place, title: t.name, units: share.units, record: share.record, players: share.players, date: endLabel(t), path: `/tournaments/${t.slug}` })}
          </div>` : ''}`
        : t.phase === 'finished' && !canceled
          ? html`<p class="muted">Final once every counted bet is graded, ${CLOSE_AFTER_HOURS} hours after the end at the latest.</p>`
          : ''}
      ${live
        ? html`<div class="tn-standings" data-live-poll data-poll-every="45">
            <h2>As it stands</h2>
            <p class="live-note">${icons.live}<span>Live: counts games in progress. Final standings use final scores.</span></p>
            ${table}
          </div>`
        : canceled ? '' : html`<h2>Standings</h2>${table}`}
      ${chatSection(ctx, t, { chat, canceled, entry: entry ?? (weekly && playing) })}
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
        ${host ? html`<li>A player made this one. It's free like every other, and the prize is the same: ${PLAYER_PRIZE.toLowerCase()}.</li>` : ''}
      </ul>
      ${host && playing && !mine && !canceled
        ? reported
          ? html`<p class="muted small tn-report">You reported this tournament.</p>`
          : html`<form class="tn-report" method="post" action="/tournaments/${t.slug}/report" data-confirm="Report ${t.name}? ${TOURNAMENT_HIDE_AFTER} reports take it off the lists until an admin looks.">${csrfField(ctx)}${code ? html`<input type="hidden" name="code" value="${code}">` : ''}<button class="link-btn">${icons.flag}Report this tournament</button></form>`
        : ''}
    `,
  });
}

/** The new-tournament form, for any player: free, a fixed prize, public or private, optionally for one group. */
export function newTournament(ctx, { groups, form = {}, error = null }) {
  const chosen = new Set(form.sports ?? []);
  const verified = Boolean(ctx.user?.verified);
  return layout(ctx, {
    title: 'Make a tournament',
    active: 'tournaments',
    body: html`
      <a class="back" href="/tournaments">← Tournaments</a>
      <h1>Make a tournament</h1>
      <p class="lede">Free, like every tournament here. Pick the sports and the window, then send the link. You're in it from the start.</p>
      ${verified ? '' : html`<div class="flash err" role="alert">Confirm your email to make a tournament. The link is in your inbox.</div>`}
      ${error ? html`<div class="flash err" role="alert">${error}</div>` : ''}
      <form class="form card tn-form" method="post" action="/tournaments/new">
        ${csrfField(ctx)}
        <label>Name <span class="hint">3 to ${PLAYER_NAME_MAX} characters. No links or @ names.</span><input type="text" name="name" value="${form.name ?? ''}" minlength="3" maxlength="${PLAYER_NAME_MAX}" required placeholder="Sunday Sweat"></label>
        <fieldset class="tn-sports"><legend>Sports <span class="hint">At least one</span></legend>
          ${SPORTS.map((s) => html`<label class="check"><input type="checkbox" name="sports" value="${s.key}" ${chosen.has(s.key) ? 'checked' : ''}><span>${s.name}</span></label>`)}
        </fieldset>
        <div class="pair">
          <label>Starts (ET)<input type="date" name="start_date" value="${form.startDate ?? ''}" required></label>
          <label>Time<input type="time" name="start_time" value="${form.startTime ?? ''}" required></label>
        </div>
        <div class="pair">
          <label>Ends (ET)<input type="date" name="end_date" value="${form.endDate ?? ''}" required></label>
          <label>Time<input type="time" name="end_time" value="${form.endTime ?? ''}" required></label>
        </div>
        <p class="hint tn-hint">Starts at least ${PLAYER_LEAD_MINUTES} minutes from now. Runs 1 hour to ${PLAYER_MAX_DAYS} days. The end time is the last minute that counts.</p>
        <label>Graded bets to place<input type="number" name="min_bets" value="${form.minBets ?? '3'}" min="1" max="${PLAYER_MIN_BETS_MAX}" required></label>
        <fieldset class="tn-vis"><legend>Who can find it</legend>
          <label class="check"><input type="radio" name="visibility" value="public" ${form.visibility !== 'private' ? 'checked' : ''}><span><b>Public</b><small>Listed under Player tournaments. Anyone can join.</small></span></label>
          <label class="check"><input type="radio" name="visibility" value="private" ${form.visibility === 'private' ? 'checked' : ''}><span><b>Private</b><small>Not listed. Players join with your invite link.</small></span></label>
        </fieldset>
        <label>Group or room <span class="hint">Optional. Only its members can join, and it shows on its page.</span>
          <select name="group">
            <option value="">Anyone</option>
            ${groups.map((g) => html`<option value="${g.id}" ${String(g.id) === String(form.group ?? '') ? 'selected' : ''}>${g.kind === 'local' ? `${g.name} (local room)` : g.name}</option>`)}
          </select>
        </label>
        <p class="tn-prize">${icons.medal}<span>Prize: ${PLAYER_PRIZE}. Nothing to pay, nothing paid out.</span></p>
        <button class="btn" ${verified ? '' : 'disabled'}>Make it</button>
        <p class="fine">You can have ${PLAYER_ACTIVE_MAX} going at once and make ${PLAYER_PER_DAY} a day. You can cancel yours before it starts. Players can report a tournament; ${TOURNAMENT_HIDE_AFTER} reports take it off the lists until an admin looks.</p>
      </form>
    `,
  });
}

/** For admins: make a tournament, and cancel one before it starts. */
export function admin(ctx, { list, reported = [], error = null, form = {} }) {
  const chosen = new Set(form.sports ?? []);
  return layout(ctx, {
    title: 'Tournaments admin',
    active: 'more',
    body: html`
      <a class="back" href="/more">← More</a>
      <h1>Tournaments admin</h1>
      ${adminTabs('tournaments')}
      <p class="lede">Make a free tournament, or cancel one before it starts. NFL Sunday, College Saturday, Hoops Night and the Weekly Open make themselves.</p>
      <h2 id="reported">Reported</h2>
      <p class="muted small">Player-made tournaments anyone has reported. ${TOURNAMENT_HIDE_AFTER} reports take one off the lists until you look. Dismiss puts it back and clears its reports. Cancel takes it down and tells everyone in it.</p>
      ${reported.length
        ? html`<ul class="reports">${reported.map((t) => html`<li class="card report ${t.hidden ? 'is-hidden' : ''}">
            <div class="report-head">
              <span><a href="/tournaments/${t.slug}">${t.name}</a> · Made by ${t.creator_name ? profileLink(t.creator_name) : 'a player'}</span>
              <span class="report-count">${t.reports} ${t.reports === 1 ? 'report' : 'reports'}${t.hidden ? ' · Hidden' : ''}</span>
            </div>
            <p class="muted small">${t.window} · ${t.visibility === 'private' ? 'Private' : 'Public'} · Last report ${at(t.last_report, 'long')}</p>
            <div class="row report-actions">
              <form method="post" action="/admin/tournaments/${t.slug}/dismiss">${csrfField(ctx)}<button class="btn small ghost">Dismiss</button></form>
              <form method="post" action="/admin/tournaments/${t.slug}/cancel" data-confirm="Cancel ${t.name}? Everyone in it hears about it.">${csrfField(ctx)}<button class="btn small danger">Cancel</button></form>
            </div>
          </li>`)}</ul>`
        : html`<div class="card empty">Nothing reported right now.</div>`}
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
            <span class="text"><a href="/tournaments/${t.slug}">${t.name}</a><small>${t.window} · ${t.kind === 'weekly' ? "everyone's in" : `${t.entrants} ${t.entrants === 1 ? 'entrant' : 'entrants'}`} · ${t.host ? `player-made by ${t.host.creator_name ?? 'a player'}, ${t.host.visibility}` : t.kind}</small></span>
            ${(t.phase === 'soon' || t.host) && t.kind !== 'weekly'
              ? html`<form method="post" action="/admin/tournaments/${t.slug}/cancel" data-confirm="Cancel ${t.name}? Everyone who joined hears about it.">${csrfField(ctx)}<button class="btn small danger">Cancel</button></form>`
              : html`<span class="muted small">${t.phase === 'live' ? 'Live' : ''}</span>`}
          </div></li>`)}</ul>`
        : html`<div class="card empty">Nothing live or coming up.</div>`}
    `,
  });
}
