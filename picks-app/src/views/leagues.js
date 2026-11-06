// Head-to-head leagues: the list, the new-league form, and a league's page
// (this week's matchups, standings, the schedule and the playoff bracket).

import { html } from '../html.js';
import { LEAGUE_ACTIVE_MAX, LEAGUE_MAX, LEAGUE_MIN, PLAYOFF_SIZES, WEEKS_MAX, WEEKS_MIN } from '../leagues.js';
import { PLAYER_NAME_MAX } from '../tournaments.js';
import { SPORT, SPORTS } from '../sports.js';
import { icons } from './icons.js';
import { csrfField, layout } from './layout.js';
import { avatar, playerName, units } from './parts.js';

const free = html`<span class="free-chip">Free</span>`;

/** "NFL · NBA" or "All sports", as chips. */
function sportChips(list) {
  return html`<span class="sport-chips">${list ? list.map((k) => html`<span class="sport-chip">${SPORT[k]?.short ?? k}</span>`) : html`<span class="sport-chip">All sports</span>`}</span>`;
}

const PHASE = { open: 'Taking players', regular: 'Regular season', playoffs: 'Playoffs', final: 'Final', canceled: 'Canceled' };

function joinForm(ctx, l, next) {
  if (!ctx.user?.screenName) return html`<a class="btn small" href="/login?next=${encodeURIComponent(l.href ?? `/leagues/${l.id}`)}">Join</a>`;
  return html`<form method="post" action="/leagues/${l.id}/join">${csrfField(ctx)}<input type="hidden" name="next" value="${next}">${l.visibility === 'private' ? html`<input type="hidden" name="code" value="${l.invite_code}">` : ''}<button class="btn small">Join</button></form>`;
}

/** One league as a card: in the hub and on /leagues. */
export function leagueCard(ctx, l, next = '/leagues') {
  let status;
  if (l.me) status = html`<span class="tn-status ranked">${l.me.wins}-${l.me.losses}${l.me.ties ? `-${l.me.ties}` : ''} · #${l.me.rank}</span>`;
  else if (l.mine) status = html`<span class="tn-status joined">${icons.check}Joined</span>`;
  else if (l.phase === 'open' && l.membersOnly) status = html`<span class="tn-status">Members only</span>`;
  else if (l.phase === 'open' && l.count < LEAGUE_MAX) status = joinForm(ctx, l, next);
  else status = html`<span class="tn-status">${PHASE[l.phase]}</span>`;
  return html`<article class="card tn-card lg-card ${l.phase}">
    <div class="tn-top"><a class="tn-name" href="${l.href}">${l.name}</a><span class="tn-chips">${free}<span class="pm-chip">League</span></span></div>
    <div class="tn-line">${sportChips(l.sportList)}<span class="tn-window">${l.phase === 'open' ? `Starts ${l.startLabel}` : l.week ? `Week ${l.week} of ${l.regular_weeks + Math.log2(l.playoff_size)}` : PHASE[l.phase]}</span></div>
    <div class="tn-line muted"><span>${l.count} of ${LEAGUE_MAX} players</span><span class="dot">${l.regular_weeks} weeks, top ${l.playoff_size} make the playoffs</span>${l.visibility === 'private' ? html`<span class="dot">Private</span>` : ''}</div>
    <div class="tn-foot"><span class="tn-min">${PHASE[l.phase]}</span>${status}</div>
  </article>`;
}

/** The hub's Leagues section: yours and open ones, with Start a league. */
export function leaguesSection(ctx, { yours, open }) {
  const list = [...yours, ...open].slice(0, 4);
  return html`<h2 id="leagues">Leagues</h2>
    <p class="muted small lg-lede">Head to head, week by week, then playoffs. Most units each week wins the matchup.</p>
    <div class="row tn-make"><a class="btn small" href="/leagues/new">Start a league</a><a class="btn ghost small" href="/leagues">All leagues</a></div>
    ${list.length ? html`<div class="tn-list">${list.map((l) => leagueCard(ctx, l, '/tournaments#leagues'))}</div>` : html`<div class="card empty">No leagues taking players right now. <a href="/leagues/new">Start one</a> for your crew.</div>`}`;
}

/** /leagues: your leagues and open ones. */
export function leaguesPage(ctx, { yours, open }) {
  return layout(ctx, {
    title: 'Leagues',
    active: 'tournaments',
    description: 'Free head-to-head leagues on LockBox Picks: weekly matchups by units won, then playoffs.',
    body: html`
      <a class="back" href="/tournaments">← Tournaments</a>
      <h1>Leagues</h1>
      <p class="lede">${LEAGUE_MIN} to ${LEAGUE_MAX} players. Each week you play one other player: whoever wins more units on graded bets that week wins. The top seeds make a playoff bracket. Free.</p>
      <div class="row tn-make"><a class="btn small" href="/leagues/new">Start a league</a></div>
      ${ctx.user?.screenName ? html`<h2>Your leagues</h2>${yours.length ? html`<div class="tn-list">${yours.map((l) => leagueCard(ctx, l))}</div>` : html`<div class="card empty">You're not in a league yet.</div>`}` : ''}
      <h2>Open leagues</h2>
      ${open.length ? html`<div class="tn-list">${open.map((l) => leagueCard(ctx, l))}</div>` : html`<div class="card empty">None taking players right now. <a href="/leagues/new">Start one.</a></div>`}
    `,
  });
}

/** /leagues/new */
export function newLeague(ctx, { groups, choices, form = {}, error = null }) {
  const chosen = new Set(form.sports ?? []);
  const verified = Boolean(ctx.user?.verified);
  const weeks = String(form.regularWeeks ?? '5');
  const size = String(form.playoffSize ?? '4');
  return layout(ctx, {
    title: 'Start a league',
    active: 'tournaments',
    body: html`
      <a class="back" href="/leagues">← Leagues</a>
      <h1>Start a league</h1>
      <p class="lede">Free. ${LEAGUE_MIN} to ${LEAGUE_MAX} players, one matchup a week, Monday to Sunday ET. You're in it from the start.</p>
      ${verified ? '' : html`<div class="flash err" role="alert">Confirm your email to start a league. The link is in your inbox.</div>`}
      ${error ? html`<div class="flash err" role="alert">${error}</div>` : ''}
      <form class="form card tn-form" method="post" action="/leagues/new">
        ${csrfField(ctx)}
        <label>Name <span class="hint">3 to ${PLAYER_NAME_MAX} characters. No links or @ names.</span><input type="text" name="name" value="${form.name ?? ''}" minlength="3" maxlength="${PLAYER_NAME_MAX}" required placeholder="Sunday Crew League"></label>
        <fieldset class="tn-sports"><legend>Sports <span class="hint">None checked means all sports</span></legend>
          ${SPORTS.map((s) => html`<label class="check"><input type="checkbox" name="sports" value="${s.key}" ${chosen.has(s.key) ? 'checked' : ''}><span>${s.name}</span></label>`)}
        </fieldset>
        <label>Week 1 <span class="hint">Joining closes when it starts</span>
          <select name="start_week">${choices.map((c) => html`<option value="${c.monday}" ${c.monday === form.startWeek ? 'selected' : ''}>${c.label}</option>`)}</select>
        </label>
        <label>Regular season
          <select name="regular_weeks">${Array.from({ length: WEEKS_MAX - WEEKS_MIN + 1 }, (_, i) => WEEKS_MIN + i).map((n) => html`<option value="${n}" ${String(n) === weeks ? 'selected' : ''}>${n} weeks</option>`)}</select>
        </label>
        <fieldset class="tn-vis lg-sizes"><legend>Playoffs <span class="hint">No more than the players in it</span></legend>
          ${PLAYOFF_SIZES.map((n) => html`<label class="check"><input type="radio" name="playoff_size" value="${n}" ${String(n) === size ? 'checked' : ''}><span><b>Top ${n}</b><small>${n === 2 ? 'A one-week final' : n === 4 ? 'Semifinals, then a final' : 'Three rounds'}</small></span></label>`)}
        </fieldset>
        <fieldset class="tn-vis"><legend>Who can find it</legend>
          <label class="check"><input type="radio" name="visibility" value="public" ${form.visibility !== 'private' ? 'checked' : ''}><span><b>Public</b><small>Listed with a Join button.</small></span></label>
          <label class="check"><input type="radio" name="visibility" value="private" ${form.visibility === 'private' ? 'checked' : ''}><span><b>Private</b><small>Not listed. Players join with your invite link.</small></span></label>
        </fieldset>
        <label>Group or room <span class="hint">Optional. Only its members can join.</span>
          <select name="group"><option value="">Anyone</option>${groups.map((g) => html`<option value="${g.id}" ${String(g.id) === String(form.group ?? '') ? 'selected' : ''}>${g.kind === 'local' ? `${g.name} (local room)` : g.name}</option>`)}</select>
        </label>
        <button class="btn" ${verified ? '' : 'disabled'}>Start it</button>
        <p class="fine">You can have ${LEAGUE_ACTIVE_MAX} leagues going at once. Under ${LEAGUE_MIN} players when Week 1 starts, the league is canceled and everyone hears why.</p>
      </form>
    `,
  });
}

/** A player in a matchup: face, name, seed, score. */
function side(m, which, rows) {
  const id = m[`${which}_id`];
  if (id == null) return html`<div class="mu-side bye"><span class="mu-name muted">${which === 'b' ? 'Bye' : 'TBD'}</span></div>`;
  const r = rows.get(id) ?? { id, screen_name: m[`${which}_name`] };
  const seed = m[`${which}_seed`];
  const settled = m.settled_at != null;
  const live = m[`live${which.toUpperCase()}`];
  const score = settled ? m[`${which}_units`] : live ? live.units : null;
  const won = settled && (m.result === which || (m.result === 'bye' && which === 'a'));
  const lost = settled && m.result !== 'tie' && m.result !== 'bye' && !won;
  return html`<div class="mu-side ${won ? 'won' : ''} ${lost ? 'lost' : ''}">
    <span class="player">${avatar(r, 'xs')}${seed ? html`<span class="mu-seed">${seed}</span>` : ''}${playerName(r)}</span>
    <span class="mu-score">${score == null ? '–' : units(score)}${live?.live ? html`<small class="live-count">${live.live} live</small>` : ''}</span>
  </div>`;
}

function matchup(m, rows, me) {
  const tie = m.result === 'tie';
  return html`<li class="matchup ${m.mine ? 'mine' : ''}">${side(m, 'a', rows)}${side(m, 'b', rows)}${tie ? html`<span class="mu-note">Tie</span>` : ''}${m.playoff && m.settled_at && m.a_units === m.b_units ? html`<span class="mu-note">Tie goes to the higher seed</span>` : ''}</li>`;
}

/** The playoff bracket: one column a round on wide screens, stacked on a phone. */
function bracket(b, rows) {
  return html`<div class="lg-bracket">${b.map((round) => html`<section class="lg-round">
    <h3>${round.name}<small>Week ${round.week}</small></h3>
    <ol class="lg-games">${round.games.map((m) => (m.tbd && !m.a_seed
      ? html`<li class="matchup tbd"><div class="mu-side bye"><span class="mu-name muted">TBD</span></div><div class="mu-side bye"><span class="mu-name muted">TBD</span></div></li>`
      : m.tbd
        ? html`<li class="matchup tbd"><div class="mu-side"><span class="mu-seed">${m.a_seed}</span><span class="muted">Seed ${m.a_seed}</span></div><div class="mu-side"><span class="mu-seed">${m.b_seed}</span><span class="muted">Seed ${m.b_seed}</span></div></li>`
        : matchup(m, rows)))}</ol>
  </section>`)}</div>`;
}

/** One league: this week's matchups (yours first), standings, the bracket once playoffs start, and the schedule. */
export function leaguePage(ctx, { l, view, isMember, code = null, inviteUrl = null, rows }) {
  const { phase, standings, weeks, current, liveWeek, champion } = view;
  const here = l.visibility === 'private' && code ? `/l/${code}` : `/leagues/${l.id}`;
  const thisWeek = weeks.find((w) => w.week === current);
  const lastSettled = [...weeks].reverse().find((w) => w.matchups.length && w.matchups.every((m) => m.settled_at));
  const showWeek = phase === 'final' ? lastSettled : thisWeek;
  let action = '';
  if (phase === 'canceled') action = html`<div class="card empty" role="status">This league was canceled. ${l.cancel_reason ?? ''}</div>`;
  else if (phase === 'open') {
    if (isMember) {
      action = html`<div class="row tn-actions"><span class="tn-status joined">${icons.check}You're in</span>${ctx.user?.id !== l.created_by
        ? html`<form method="post" action="/leagues/${l.id}/leave" data-confirm="Leave ${l.name}?">${csrfField(ctx)}<button class="btn ghost small">Leave</button></form>` : ''}</div>`;
    } else if (view.membersOnly) {
      action = html`<p class="muted">Only members of ${view.group ? html`<a href="/groups/${view.group.id}">${view.group.name}</a>` : 'its group'} can join.</p>`;
    } else if (view.members.length < LEAGUE_MAX) {
      action = html`<div class="tn-join">${joinForm(ctx, { ...l, href: here, invite_code: code ?? l.invite_code }, here)}<span class="muted small">Free. Joining closes when Week 1 starts.</span></div>`;
    }
  }
  return layout(ctx, {
    title: l.name,
    active: 'tournaments',
    description: `${l.name}: a free head-to-head league on LockBox Picks.`,
    body: html`
      <a class="back" href="/leagues">← Leagues</a>
      <div class="tn-title"><h1>${l.name}</h1>${free}<span class="pm-chip">League</span></div>
      <div class="tn-line">${sportChips(view.sports)}<span class="muted">${view.members.length} ${view.members.length === 1 ? 'player' : 'players'}</span>${view.creator ? html`<span class="muted dot">Started by ${view.creator}</span>` : ''}${view.group ? html`<span class="muted dot">For <a href="/groups/${view.group.id}">${view.group.name}</a></span>` : ''}</div>
      <div class="contest-clock">
        <span class="cc-week">${phase === 'open' ? `Week 1 starts ${weeks[0]?.label}` : thisWeek ? `Week ${current}: ${thisWeek.label}` : ''}</span>
        <b>${PHASE[phase]}</b>
        <span class="cc-left">${l.regular_weeks} weeks, then a top-${l.playoff_size} playoff</span>
      </div>
      ${champion ? html`<p class="ft-last lg-champ">${icons.medal}<span>League champion: <b>${champion.screen_name}</b></span></p>` : ''}
      ${action}
      ${inviteUrl && phase === 'open' ? html`<div class="card stack tn-invite"><b>Invite players</b><div class="muted small copy">${inviteUrl}</div><div class="row"><button class="btn quiet small" type="button" data-copy="${inviteUrl}" hidden>Copy invite link</button></div></div>` : ''}
      ${showWeek && showWeek.matchups.length
        ? html`<div ${liveWeek === showWeek.week ? html`data-live-poll data-poll-every="45"` : ''}>
            <h2>${phase === 'final' ? 'The final' : showWeek.playoff ? `This week: ${view.bracket?.find((r) => r.week === showWeek.week)?.name ?? 'Playoffs'}` : `This week: Week ${showWeek.week}`}</h2>
            ${liveWeek === showWeek.week ? html`<p class="live-note">${icons.live}<span>Live: counts games in progress at the current score. Results use final scores.</span></p>` : ''}
            <ol class="matchups">${showWeek.matchups.map((m) => matchup(m, rows))}</ol>
          </div>`
        : phase === 'open' ? html`<h2>Players</h2><ul class="lg-members">${view.members.map((m) => html`<li>${avatar(rows.get(m.id) ?? m, 'xs')}${playerName(rows.get(m.id) ?? m)}</li>`)}</ul><p class="muted small">The schedule is made when Week 1 starts. ${LEAGUE_MIN} players needed.</p>` : ''}
      ${view.bracket ? html`<h2 id="bracket">Playoff bracket</h2>${bracket(view.bracket, rows)}` : ''}
      ${phase !== 'open' && phase !== 'canceled' ? html`<h2>Standings</h2>
        <div class="table"><table class="tn-table lg-table">
          <thead><tr><th>#</th><th>Player</th><th class="n">W-L-T</th><th class="n">Units</th></tr></thead>
          <tbody>${standings.map((r) => html`<tr class="${r.id === ctx.user?.id ? 'me' : ''} ${r.rank === l.playoff_size ? 'cut' : ''}">
            <td class="rank"><span class="rk">${r.rank}</span></td>
            <td><span class="player">${avatar(rows.get(r.id) ?? r)}${playerName(rows.get(r.id) ?? r)}${r.seed ? html`<small class="mu-seedtag">${r.seed} seed</small>` : ''}</span></td>
            <td class="n">${r.wins}-${r.losses}-${r.ties}</td>
            <td class="n"><b>${units(r.units)}</b></td>
          </tr>`)}</tbody>
        </table></div>
        <p class="muted small">Ranked by wins (a tie is half), then total units. The top ${l.playoff_size} make the playoffs.</p>` : ''}
      ${phase !== 'open' && phase !== 'canceled' ? html`<h2>Schedule</h2>
        <div class="lg-weeks">${weeks.map((w) => html`<details class="lg-week" ${w.week === current && phase !== 'final' ? 'open' : ''}>
          <summary><b>Week ${w.week}${w.playoff ? ' · Playoffs' : ''}</b><span class="muted">${w.label}</span></summary>
          ${w.matchups.length ? html`<ol class="matchups">${w.matchups.map((m) => matchup(m, rows))}</ol>` : html`<p class="muted small">Set when the round before it ends.</p>`}
        </details>`)}</div>` : ''}
      <h2>Rules</h2>
      <ul class="tn-rules">
        <li>Free. Nothing to pay, nothing paid out.</li>
        <li>Each week runs Monday to Sunday ET. Your score is units won on graded bets (picks and parlays) on games in this league's sports that started that week. No graded bets is 0.</li>
        <li>More units wins the matchup. The same units is a tie. With an odd number of players, one player has a bye each week.</li>
        <li>Standings: wins (a tie is half), then total units.</li>
        <li>After ${l.regular_weeks} weeks the top ${l.playoff_size} are seeded into a bracket, 1 against ${l.playoff_size}. One round a week. A tie goes to the higher seed.</li>
        <li>The champion gets a League champion badge. With ${8} or more players, everyone gets Cup points by finish.</li>
        <li>Chat lives in your group or room: tie the league to one when you start it.</li>
      </ul>
    `,
  });
}
