// The March Madness bracket challenge: a player's bracket region by region
// (a form per round, so it works without JavaScript; with it, a tap saves
// and advances), the Final Four with the tiebreaker, the standings, the hub
// card, and the admin page for the field and results.

import { html } from '../html.js';
import {
  feeders, gamesIn, GAMES, MAX_POINTS, participants, regionOf, ROUND_NAMES, ROUND_POINTS, TEAM_NAME_MAX, TIEBREAK_MAX, TIEBREAK_MIN,
} from '../bracket.js';
import { icons } from './icons.js';
import { csrfField, layout } from './layout.js';
import { adminTabs } from './local.js';
import { at, avatar, playerName } from './parts.js';

const free = html`<span class="free-chip">Free</span>`;

/** The hub card: fill your bracket, your place once locked, or the off-season line. */
export function bracketFeature(ctx, f, last = null) {
  if (!f || f.c.closed_at) {
    return html`<article class="card feature bracket-feature" aria-labelledby="bk-feature">
      <div class="ft-head"><span class="ft-kicker">${icons.bracket}March Madness</span>${free}</div>
      <a class="ft-name" id="bk-feature" href="/bracket">Bracket challenge</a>
      <p class="ft-text">The bracket challenge opens on Selection Sunday.</p>
      ${f?.winner?.length ? html`<p class="ft-last">${icons.medal}<span>Last winner${f.winner.length > 1 ? 's' : ''}: <b>${f.winner.join(', ')}</b> (${f.c.name})</span></p>` : ''}
    </article>`;
  }
  const { c, locked, picked, entries, row } = f;
  return html`<article class="card feature bracket-feature" aria-labelledby="bk-feature">
    <div class="ft-head"><span class="ft-kicker">${icons.bracket}March Madness</span>${free}</div>
    <a class="ft-name" id="bk-feature" href="/bracket">${c.name}</a>
    <p class="ft-text">Pick all 63 games. 10 points a right pick in the first round, doubling every round.</p>
    <div class="ft-stats">
      <div class="ft-stat"><b>${locked ? (row ? `#${row.rank} · ${row.points} pts` : 'No bracket') : `${picked} of ${GAMES}`}</b><span>${locked ? 'You' : 'Picked'}</span></div>
      <div class="ft-stat"><b>${entries}</b><span>Brackets</span></div>
    </div>
    <div class="ft-foot">
      <span class="ft-deadline">${locked ? 'Locked' : html`Locks ${at(c.locks_at)}`}</span>
      <a class="btn small ${!locked && picked < GAMES ? '' : 'ghost'}" href="/bracket">${locked ? 'Standings' : picked < GAMES ? 'Fill your bracket' : 'Your bracket'}</a>
    </div>
  </article>`;
}

/** A slot as a line: seed, then its team (or a First Four pair). */
function teamLine(field, slot) {
  const s = field.get(slot);
  if (!s) return html`<span class="bk-team muted">TBD</span>`;
  return html`<span class="bk-seed">${s.seed}</span><span class="bk-team">${s.label}${s.name2 && !s.ff_winner ? html`<small>First Four</small>` : ''}</span>`;
}

/** One game: two teams, as radio buttons when editable, else with how the pick went. */
function gameBox(g, { field, picks, results, out, editable }) {
  const options = participants(g, picks);
  const picked = picks[g];
  const result = results[g];
  const mark = picked && result ? (result === picked ? 'right' : 'wrong') : picked && out.has(picked) ? 'dead' : '';
  const f = feeders(g);
  return html`<fieldset class="bk-game ${mark}" id="g${g}">
    <legend class="sr-only">Game ${g + 1}</legend>
    ${options.map((slot, i) => {
      if (!slot) return html`<div class="bk-opt empty"><span class="muted small">Pick game ${f[i] + 1} first</span></div>`;
      const mine = slot === picked;
      const lost = out.has(slot);
      const cls = `${mine ? 'mine' : ''} ${lost ? 'out' : ''} ${result === slot ? 'won' : ''}`;
      return editable
        ? html`<label class="bk-opt ${cls}"><input type="radio" name="g${g}" value="${slot}" ${mine ? 'checked' : ''}><span class="bk-face">${teamLine(field, slot)}</span></label>`
        : html`<div class="bk-opt ${cls}"><span class="bk-face">${teamLine(field, slot)}${mine ? html`<span class="bk-mark">${result ? (result === slot ? icons.check : '✗') : 'Pick'}</span>` : ''}</span></div>`;
    })}
  </fieldset>`;
}

/** A round in a region (or the Final Four): its games, and a Save button when editable. */
function roundBlock(ctx, round, games, opts, view) {
  const head = html`<h3 class="bk-round">${ROUND_NAMES[round]}<small>${ROUND_POINTS[round]} pts a pick</small></h3>`;
  const body = html`<div class="bk-games">${games.map((g) => gameBox(g, opts))}</div>`;
  if (!opts.editable) return html`<section class="bk-round-wrap">${head}${body}</section>`;
  return html`<section class="bk-round-wrap"><form method="post" action="/bracket" data-bracket-round>
    ${csrfField(ctx)}<input type="hidden" name="view" value="${view}">
    ${head}${body}
    ${round === 5 ? html`<label class="bk-tiebreak">Tiebreaker: total points in the title game <input type="number" name="tiebreak" min="${TIEBREAK_MIN}" max="${TIEBREAK_MAX}" value="${opts.tiebreak ?? ''}" inputmode="numeric" placeholder="145"></label>` : ''}
    <button class="btn small bk-save">Save ${ROUND_NAMES[round]}</button>
  </form></section>`;
}

/** The standings: points, possible max, champion pick (after the lock). */
function standingsTable(ctx, rows, { locked, field, c }) {
  if (!rows.length) return html`<div class="card empty">No brackets yet.</div>`;
  return html`<div class="table"><table class="tn-table bk-table">
    <thead><tr><th>#</th><th>Player</th><th class="n">Pts</th><th class="n">Max</th><th class="hide-sm">Champion</th></tr></thead>
    <tbody>${rows.map((r) => html`<tr class="${r.id === ctx.user?.id ? 'me' : ''}">
      <td class="rank"><span class="rk ${r.rank <= 3 ? `r${r.rank}` : ''}">${r.rank}</span></td>
      <td><span class="player">${avatar(r)}<span class="tn-who">${locked ? html`<a class="who" href="/bracket?player=${encodeURIComponent(r.screen_name)}">${r.screen_name}</a>` : playerName(r)}<small class="to-place">${r.picked} of ${GAMES} picked${locked && r.tiebreak != null ? ` · tiebreak ${r.tiebreak}` : ''}</small></span></span></td>
      <td class="n"><b>${r.points}</b></td>
      <td class="n">${r.max}</td>
      <td class="hide-sm">${locked && r.champion ? field.get(r.champion)?.label ?? '–' : html`<span class="muted">Hidden until the lock</span>`}</td>
    </tr>`)}</tbody>
  </table></div>
  <p class="muted small">Max is the points a bracket can still reach: its points so far, plus every pick whose team hasn't lost. Ties go to the tiebreaker closest to the title game's total${c.title_total != null ? ` (${c.title_total})` : ''}, then to whoever saved first.</p>`;
}

/**
 * The page. `owner` is whose bracket shows (the viewer's, or another
 * player's after the lock); `view` is a region (0-3), 'ff' or 'standings'.
 */
export function bracketPage(ctx, { c, field, picks, tiebreak, results, out, view, locked, owner, mine, score, rows, notes = [], last = null }) {
  if (!c) {
    return layout(ctx, {
      title: 'Bracket challenge',
      active: 'tournaments',
      body: html`<a class="back" href="/tournaments">← Tournaments</a>
        <div class="tn-title"><h1>Bracket challenge</h1>${free}</div>
        <div class="card empty">The bracket challenge opens on Selection Sunday. Fill all 63 games of the men's tournament, free.${last ? html` Last winner: <b>${last.winners.join(', ')}</b> (${last.name}).` : ''}</div>`,
    });
  }
  const editable = mine && !locked && Boolean(ctx.user?.screenName);
  const regions = c.regionNames;
  const base = owner && !mine ? `/bracket?player=${encodeURIComponent(owner.screen_name)}&` : '/bracket?';
  const tab = (key, label) => html`<a href="${base}view=${key}" class="${String(view) === String(key) ? 'on' : ''}" ${String(view) === String(key) ? html`aria-current="true"` : ''}>${label}</a>`;
  const opts = { field, picks, results, out, editable, tiebreak };
  let body;
  if (view === 'standings') body = standingsTable(ctx, rows, { locked, field, c });
  else if (view === 'ff') {
    body = html`<p class="muted small bk-pair">${regions[0]} plays ${regions[1]}. ${regions[2]} plays ${regions[3]}.</p>
      ${roundBlock(ctx, 4, gamesIn(4), opts, 'ff')}${roundBlock(ctx, 5, gamesIn(5), opts, 'ff')}
      ${!editable && tiebreak != null ? html`<p class="muted">Tiebreaker: ${tiebreak} total points in the title game.</p>` : ''}`;
  } else {
    const region = Number(view);
    body = html`<div class="bk-region">${[0, 1, 2, 3].map((r) => roundBlock(ctx, r, gamesIn(r, region), opts, String(region)))}</div>`;
  }
  const picked = Object.keys(picks).length;
  return layout(ctx, {
    title: c.name,
    active: 'tournaments',
    description: `${c.name}: a free bracket challenge on LockBox Picks. Pick all 63 games.`,
    body: html`
      <a class="back" href="/tournaments">← Tournaments</a>
      <div class="tn-title"><h1>${c.name}</h1>${free}</div>
      <div class="contest-clock">
        <span class="cc-week">${owner && !mine ? `${owner.screen_name}'s bracket` : 'Your bracket'}</span>
        <b>${locked ? (score ? `${score.points} pts · max ${score.max}` : 'Locked') : `${picked} of ${GAMES} picked`}</b>
        <span class="cc-left">${c.closed_at ? 'Final' : locked ? 'Locked at the first Round of 64 tip' : html`Locks ${at(c.locks_at, 'long')}`}</span>
      </div>
      ${notes.length ? html`<div class="flash err" role="alert">${notes.join(' ')}</div>` : ''}
      ${!ctx.user?.screenName && !locked ? html`<p class="muted"><a href="/login?next=%2Fbracket">Log in</a> to fill your bracket. Free.</p>` : ''}
      <nav class="tabs bk-tabs" aria-label="Bracket">${regions.map((name, i) => tab(i, name))}${tab('ff', 'Final Four')}${tab('standings', 'Standings')}</nav>
      <div data-bracket>${body}</div>
      <h2>How it works</h2>
      <ul class="tn-rules">
        <li>Free. Pick the winner of all ${GAMES} games of the men's tournament before the first Round of 64 tip. The First Four isn't picked: you pick the seed's slot, and whoever wins the First Four game fills it.</li>
        <li>Points for each right pick: ${ROUND_POINTS.map((p, r) => `${ROUND_NAMES[r]} ${p}`).join(', ')}. ${MAX_POINTS} is a perfect bracket.</li>
        <li>Ties go to the guess closest to the title game's total points, then to whoever saved first.</li>
        <li>Other players' brackets show once the brackets lock. The winner gets a Bracket champion badge and Cup points.</li>
      </ul>
    `,
  });
}

/** Admins: the field (pick, paste, or ESPN's draft), the lock and regions, then results. */
export function adminBracket(ctx, { c, field, results, teams, year, draft = null, error = null, paste = '', manual = [] }) {
  const regions = c?.regionNames ?? ['East', 'West', 'South', 'Midwest'];
  const lock = c?.locks_at ? new Date(c.locks_at) : null;
  const etParts = (d) => {
    if (!d) return ['', ''];
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
    const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
    return [day, time];
  };
  const [lockDate, lockTime] = etParts(lock);
  const slot = (r, seed) => field?.get(`${r}-${seed}`);
  return layout(ctx, {
    title: 'Bracket admin',
    active: 'more',
    body: html`
      <a class="back" href="/more">← More</a>
      <h1>Bracket admin</h1>
      ${adminTabs('bracket')}
      ${error ? html`<div class="flash err" role="alert">${error}</div>` : ''}
      ${!c ? html`<form class="card stack" method="post" action="/admin/bracket/start">${csrfField(ctx)}
          <p>No bracket challenge for ${year} yet. Start one to enter the field by hand, or look on ESPN once the tournament games are on the scoreboard.</p>
          <input type="hidden" name="year" value="${year}"><button class="btn small">Start the ${year} challenge</button></form>`
        : html`
      <div class="card stack">
        <b>${c.name}</b>
        <span class="muted small">${c.opened_at ? html`Open to players since ${at(c.opened_at, 'long')}.` : 'A draft: players can\'t see it until you confirm the field below.'} ${c.closed_at ? 'Final.' : ''} Source: ${c.source}.</span>
        <form method="post" action="/admin/bracket/espn">${csrfField(ctx)}<button class="btn ghost small">Look on ESPN for the field</button></form>
        ${draft ? html`<div class="muted small">${draft.problems.length ? html`ESPN's games didn't add up: <ul>${draft.problems.slice(0, 12).map((p) => html`<li>${p}</li>`)}</ul>Fix the field below by hand.` : `ESPN had all 64 teams. Check them below, then confirm.`}</div>` : ''}
      </div>
      <h2>Regions and the lock</h2>
      <form class="form card" method="post" action="/admin/bracket/open">
        ${csrfField(ctx)}
        <p class="muted small">In Final Four order: the first region plays the second, the third plays the fourth.</p>
        <div class="pair">${regions.slice(0, 2).map((r, i) => html`<label>Region ${i + 1}<input type="text" name="region" value="${r}" maxlength="20" required></label>`)}</div>
        <div class="pair">${regions.slice(2).map((r, i) => html`<label>Region ${i + 3}<input type="text" name="region" value="${r}" maxlength="20" required></label>`)}</div>
        <div class="pair">
          <label>Locks (ET)<input type="date" name="lock_date" value="${lockDate}" required></label>
          <label>Time<input type="time" name="lock_time" value="${lockTime}" required></label>
        </div>
        <button class="btn">${c.opened_at ? 'Save regions and lock' : 'Confirm the field and open it'}</button>
      </form>
      <h2>The field</h2>
      <datalist id="college-teams">${teams.map((t) => html`<option value="${t}"></option>`)}</datalist>
      <form class="form card bk-field" method="post" action="/admin/bracket/field">
        ${csrfField(ctx)}
        <p class="muted small">Pick each team from the list (the college teams the app knows), or type a name of up to ${TEAM_NAME_MAX} characters. For a First Four slot, fill the second box too.</p>
        ${regions.map((name, r) => html`<fieldset class="bk-field-region"><legend>${name}</legend>
          ${Array.from({ length: 16 }, (_, i) => i + 1).map((seed) => html`<div class="bk-field-row">
            <span class="bk-seed">${seed}</span>
            <input type="text" name="t_${r}_${seed}" value="${slot(r, seed)?.name ?? ''}" list="college-teams" maxlength="${TEAM_NAME_MAX}" aria-label="${name} ${seed} seed" required>
            <input type="text" name="t2_${r}_${seed}" value="${slot(r, seed)?.name2 ?? ''}" list="college-teams" maxlength="${TEAM_NAME_MAX}" aria-label="${name} ${seed} seed, First Four opponent" placeholder="First Four">
          </div>`)}
        </fieldset>`)}
        <button class="btn">Save the field</button>
      </form>
      <form class="form card" method="post" action="/admin/bracket/paste">
        ${csrfField(ctx)}
        <label>Or paste it <span class="hint">One team a line: Region, Seed, Team. A First Four pair: South, 16, Howard / Wagner</span>
          <textarea name="field" rows="6" placeholder="South, 1, Duke">${paste}</textarea></label>
        <button class="btn ghost">Save the pasted field</button>
      </form>
      ${c.opened_at ? html`<h2>Results</h2>
        <p class="muted small">ESPN's finals fill these in on their own. Set or fix one here; fixing a game drops later results that rode on it.</p>
        <form class="form card bk-results" method="post" action="/admin/bracket/results">
          ${csrfField(ctx)}
          ${[...field.values()].filter((s) => s.name2).map((s) => html`<label>First Four: ${regions[s.region]} ${s.seed}
            <select name="ff_${s.region}-${s.seed}"><option value="">Not played</option><option value="1" ${s.ff_winner === 1 ? 'selected' : ''}>${s.name}</option><option value="2" ${s.ff_winner === 2 ? 'selected' : ''}>${s.name2}</option></select></label>`)}
          ${manual.map((m) => html`<label>${m.round}${m.region != null ? ` · ${regions[m.region]}` : ''}
            <select name="w${m.game}"><option value="">Not played</option>${m.teams.map((t) => html`<option value="${t}" ${results[m.game] === t ? 'selected' : ''}>${field.get(t)?.seed} ${field.get(t)?.label}</option>`)}</select></label>`)}
          ${manual.some((m) => m.game === GAMES - 1) ? html`<label>Title game total points<input type="number" name="title_total" min="0" max="400" value="${c.title_total ?? ''}"></label>` : ''}
          <button class="btn">Save results</button>
        </form>` : ''}
      `}
    `,
  });
}

export { regionOf };
