import { html } from '../html.js';
import { formatOdds, formatSpread, formatUnits, MARKET_NAME, MAX_UNITS, maxUnits, PARLAY_MAX_LEGS, PARLAY_MIN_LEGS, parlayMaxUnits, parlayPrice, parlayToWin, price, selection, toWin, UNIT_CHIPS, UNITS_MIN } from '../picks.js';
import { draftSignature } from '../parlays.js';
import { siteHost, siteLink } from '../site.js';
import { SPORT } from '../sports.js';
import { dayLabel, dayShort, etDay } from '../time.js';
import { icons } from './icons.js';
import { csrfField, layout } from './layout.js';
import { at, betItem, chatBox, lockTag, minus, sportTabs, statStrip, tabs, teamLogo } from './parts.js';

/** The id a game's card carries, so a pick can come back to the same spot on the board. */
export function cardId(gameId) {
  return `g-${String(gameId).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

/**
 * `mine` maps game id -> { spread: 'home', total: 'over', ... } for the
 * player's picks; `draft` maps game id -> { market, side } for their parlay legs.
 */
export function games(ctx, { sport, list, mine, draft = new Map(), chats = new Map(), split = new Map(), bb = new Map(), locks = null, problem }) {
  const days = [];
  for (const game of list) {
    const day = etDay(game.start);
    if (days.at(-1)?.day !== day) days.push({ day, label: dayLabel(game.start), games: [] });
    days.at(-1).games.push(game);
  }
  return layout(ctx, {
    title: `${sport.name} games`,
    active: 'games',
    body: html`
      <h1>Games</h1>
      <p class="lede">Tap a number to pick it. You get the line on the board right now, and it locks when the game starts.</p>
      ${sportTabs('/games', ctx.query, { all: false })}
      ${locks ? locksCard(ctx, locks) : ''}
      ${problem ? html`<div class="flash err" role="status">Can't reach live lines right now. Showing the last ones we saw.</div>` : ''}
      ${days.length
        ? days.map(
            (d) => html`<div class="day">${d.label}</div>
              ${d.games.map((g) => gameCard(g, mine.get(g.id) ?? {}, sport, chats.get(g.id) ?? 0, split.get(g.id), draft.get(g.id), bb.get(g.id)))}`,
          )
        : html`<div class="card empty">No ${sport.name} games on the board in the next ${sport.days} days.</div>`}
    `,
  });
}

function gameCard(game, mine, sport, chatCount = null, split = null, leg = null, bbPicks = null) {
  const fav = favorite(game);
  const row = (side, totalSide) => html`
    <span class="team">${stripe(game[side].color)}${teamLogo(game[side])}<span class="tname"><span class="tn">${game[side].short}</span>${fav === side || game[side].record ? html`<span class="tsub">${fav === side ? html`<span class="fav">Fav</span>` : ''}${game[side].record ? html`<span class="trec">${game[side].record}</span>` : ''}</span>` : ''}</span></span>
    ${cell(game, 'spread', side, mine, leg)}
    ${cell(game, 'total', totalSide, mine, leg)}
    ${cell(game, 'ml', side, mine, leg)}`;
  return html`<article class="event" id="${cardId(game.id)}" aria-label="${game.away.name} at ${game.home.name}">
    <div class="board">
      <span class="when">${at(game.start)}${game.tv ? html`<span class="tv">${game.tv}</span>` : ''}</span><span class="colhead">${sport.spread}</span><span class="colhead">Total</span><span class="colhead">Money</span>
      ${row('away', 'over')}
      ${row('home', 'under')}
    </div>
    ${chatCount == null && !split?.spread && !bbPicks?.length ? '' : html`<div class="card-foot">
      ${chatCount == null ? '' : html`<a class="card-chat" href="/games/${encodeURIComponent(game.id)}#chat">${icons.chat}<span>${chatCount ? `Chat · ${chatCount}` : 'Chat'}</span></a>`}
      ${bbPicks?.length ? bbChip(game, bbPicks[0]) : ''}
      ${split?.spread ? html`<span class="lean">${leanText(game, split.spread)}</span>` : ''}
    </div>`}
  </article>`;
}

// ---- www.bookiebullies.com on the board (src/site.js) -------------------------

/** "Lakers −4.5", "Over 223", "Lakers ML": a pick with true minus signs. */
function pickText(p, game) {
  return selection(p.market, p.side, p.line, game).replace(/(^|\s)-(?=\d)/, '$1\u2212');
}

/**
 * The official account's pick on a game, as a chip under the board: gold
 * "🔒 BB Lock · Lakers −4.5" for a site Lock, else "BB Pick · Over 223". It
 * opens the model's picks on that game (a page; app.js shows it in the sheet).
 */
function bbChip(game, p) {
  return html`<a class="${p.lock ? 'bb-chip lock' : 'bb-chip'}" href="/games/${encodeURIComponent(game.id)}/bb" data-sheet="The Bookie Bullies model's pick">${p.lock ? html`<span aria-hidden="true">🔒</span> BB Lock` : 'BB Pick'} · ${pickText(p, game)}</a>`;
}

/** Confidence from the site, 1 to 5, as stars. */
function stars(conf) {
  const n = Math.max(0, Math.min(5, Math.round(Number(conf) || 0)));
  if (!n) return '';
  return html`<span class="bb-stars" role="img" aria-label="Confidence ${n} of 5">${'★'.repeat(n)}<span class="off">${'★'.repeat(5 - n)}</span></span>`;
}

/** The model's picks on one game: what a BB Pick chip opens. */
export function sitePicks(ctx, { game, picks }) {
  const sport = SPORT[game.sport];
  const name = picks[0]?.name ?? 'BookieBullies';
  return layout(ctx, {
    title: 'Bookie Bullies pick',
    active: 'games',
    body: html`
      <div class="narrow">
        <a class="back" href="/games?sport=${game.sport}#${cardId(game.id)}">← ${sport?.short ?? ''} games</a>
        <div class="slip bb-slip">
          <div class="slip-head"><span>Bookie Bullies model</span><span>${game.away.short} @ ${game.home.short} · ${at(game.start)}</span></div>
          <div class="slip-body">
            ${picks.length
              ? html`<ul class="bb-picks">${picks.map((p) => html`<li>
                  <div>
                    <div class="pickname">${p.lock ? lockTag : ''}${pickText(p, game)}</div>
                    <div class="slip-meta">${p.market === 'spread' ? sport?.spread ?? 'Spread' : MARKET_NAME[p.market]} · ${formatUnits(p.units)}${p.conf ? html` · ${stars(p.conf)}` : ''}</div>
                  </div>
                  <span class="odds-pill">${minus(formatOdds(p.odds))}</span>
                </li>`)}</ul>`
              : html`<p class="muted">No open model picks on this game.</p>`}
            <p class="muted small">Locked at the app's line before the game, and graded like everyone else's.</p>
            <a class="btn block gold" href="${siteLink(ctx.app.site, 'bb_chip')}" target="_blank" rel="noopener">See all today's picks on ${siteHost(ctx.app.site)}</a>
            <a class="bb-profile" href="/u/${encodeURIComponent(name)}">${name}'s record in the app →</a>
          </div>
        </div>
      </div>
    `,
  });
}

/**
 * "🔒 3 Bookie Bullies Locks today · 8 picks · See them", under the sport
 * tabs. The × hides it until the next ET day (a form, so it works without
 * JavaScript; app.js hides it at once).
 */
function locksCard(ctx, { picks, locks, name }) {
  const head = locks
    ? html`<span aria-hidden="true">🔒</span> ${locks} Bookie Bullies ${locks === 1 ? 'Lock' : 'Locks'} today <span class="sep">·</span> <span class="nw">${picks} ${picks === 1 ? 'pick' : 'picks'}</span>`
    : html`${picks} Bookie Bullies ${picks === 1 ? 'pick' : 'picks'} today`;
  return html`<aside class="bb-locks" data-bb-locks aria-label="Bookie Bullies picks today">
    <img class="bb-crest" src="${ctx.app.assets.logo}" alt="" width="30" height="30">
    <div class="bb-locks-text">
      <a class="bb-locks-go" href="${siteLink(ctx.app.site, 'locks_card')}" target="_blank" rel="noopener">${head} <span class="sep">·</span> <span class="see">See them</span></a>
      <a class="bb-locks-profile" href="/u/${encodeURIComponent(name)}">Their record in the app</a>
    </div>
    <form method="post" action="/bb/locks/dismiss" data-bb-dismiss>
      ${csrfField(ctx)}
      <input type="hidden" name="next" value="${ctx.url.pathname}${ctx.url.search}">
      <button class="bb-locks-close" aria-label="Hide until tomorrow" title="Hide until tomorrow">×</button>
    </form>
  </aside>`;
}

/** "64% on KC": where the players lean on the spread. */
function leanText(game, s) {
  const side = (s.home ?? 0) >= (s.away ?? 0) ? 'home' : 'away';
  return `${Math.round(((s[side] ?? 0) / s.total) * 100)}% on ${game[side].abbr}`;
}

/** The public split on each market, as bars. */
function splitBars(game, split) {
  if (!split) return '';
  const rows = [
    ['spread', 'Spread', ['away', 'home'], (side) => game[side].abbr],
    ['total', 'Total', ['over', 'under'], (side) => (side === 'over' ? 'Over' : 'Under')],
    ['ml', 'Moneyline', ['away', 'home'], (side) => game[side].abbr],
  ].filter(([market]) => split[market]);
  return html`<section class="splits" aria-label="Where players are picking">
    <h2>Public split</h2>
    ${rows.map(([market, label, [a, b], name]) => {
      const m = split[market];
      const pa = Math.round(((m[a] ?? 0) / m.total) * 100);
      return html`<div class="split">
        <div class="split-head"><span>${name(a)} ${pa}%</span><span class="muted">${label} · ${m.total} picks</span><span>${100 - pa}% ${name(b)}</span></div>
        <svg class="split-bar" viewBox="0 0 100 8" preserveAspectRatio="none" role="img" aria-label="${name(a)} ${pa} percent, ${name(b)} ${100 - pa} percent"><rect width="${pa}" height="8" class="a"></rect><rect x="${pa}" width="${100 - pa}" height="8" class="b"></rect></svg>
      </div>`;
    })}
  </section>`;
}

/** A bar in the team's color. An SVG fill, since the page's security policy blocks inline styles. */
function stripe(color) {
  return color ? html`<svg class="stripe" viewBox="0 0 4 10" preserveAspectRatio="none" aria-hidden="true"><rect width="4" height="10" fill="${color}"></rect></svg>` : html`<span class="stripe"></span>`;
}

/** The side the book favors: the shorter moneyline, else the side laying points. */
function favorite(game) {
  const { ml, spread } = game.lines ?? {};
  if (ml?.home != null && ml?.away != null && ml.home !== ml.away) return ml.home < ml.away ? 'home' : 'away';
  if (spread?.home) return spread.home < 0 ? 'home' : 'away';
  return null;
}

/** One price on the board. `leg` is the player's parlay leg on this game, if any. */
function cell(game, market, side, mine, leg = null) {
  const p = price(game, market, side);
  if (!p) return html`<span class="cell off" aria-label="No ${MARKET_NAME[market].toLowerCase()} yet">–</span>`;
  const ml = market === 'ml';
  const top = market === 'spread' ? formatSpread(p.line) : market === 'total' ? `${side === 'over' ? 'O' : 'U'} ${p.line}` : formatOdds(p.odds);
  const inner = html`${minus(top)}${ml ? '' : html`<small>${minus(formatOdds(p.odds))}</small>`}`;
  const inParlay = leg?.market === market && leg.side === side;
  const kind = `${ml ? 'cell price' : 'cell'}${inParlay ? ' in-parlay' : ''}`;
  const label = `${selection(market, side, p.line, game)} at ${formatOdds(p.odds)}${inParlay ? ', in your parlay' : ''}`;
  if (mine[market] === side) return html`<a class="${kind} mine" href="/picks" aria-label="Your pick: ${label}">${inner}</a>`;
  if (mine[market]) return html`<span class="${kind} taken" aria-label="${label}, you took the other side">${inner}</span>`;
  const query = new URLSearchParams({ game: game.id, market, side });
  return html`<a class="${kind}" href="/pick?${query}" aria-label="Pick ${label}">${inner}</a>`;
}

/**
 * The pick slip. `streak` is set when the game's day has no Streak pick yet:
 * { today, day, checked }, and the slip offers to make this one it.
 */
export function slip(ctx, { game, market, side, current, error, units, streak = null, survivor = null }) {
  const most = maxUnits(current.odds);
  units ??= Math.min(1, most);
  const sport = SPORT[game.sport];
  const picked = side === 'home' || side === 'away' ? game[side] : null;
  return layout(ctx, {
    title: 'Make a pick',
    active: 'games',
    body: html`
      <div class="narrow">
        <a class="back" href="/games?sport=${sport.key}">← ${sport.short} games</a>
        ${error ? html`<div class="flash err" role="alert">${error}</div>` : ''}
        <div class="slip">
          <div class="slip-head"><span>Pick slip</span><span>${sport.short} · ${at(game.start)}</span></div>
          <div class="slip-body">
            <div class="slip-sel">
              <div class="team">
                ${picked ? teamLogo(picked) : ''}
                <div>
                  <div class="pickname">${selection(market, side, current.line, game)}</div>
                  <div class="slip-meta">${market === 'spread' ? sport.spread : MARKET_NAME[market]} · ${game.away.short} @ ${game.home.short}</div>
                </div>
              </div>
              <span class="odds-pill">${minus(formatOdds(current.odds))}</span>
            </div>
            <form method="post" action="/picks" data-odds="${current.odds}">
              ${csrfField(ctx)}
              <input type="hidden" name="game" value="${game.id}">
              <input type="hidden" name="market" value="${market}">
              <input type="hidden" name="side" value="${side}">
              <input type="hidden" name="line" value="${current.line ?? ''}">
              <input type="hidden" name="odds" value="${current.odds}">
              <label class="wager">Units
                <span class="money-input suffix"><input type="text" name="units" value="${units}" inputmode="decimal" autocomplete="off" required aria-describedby="units-note"><span>u</span></span>
              </label>
              <div class="chips" hidden>
                ${UNIT_CHIPS.filter((n) => n <= most).map((n) => html`<button type="button" class="chip" data-units="${n}">${n}u</button>`)}
              </div>
              <div class="towin"><span>To win</span><b data-to-win>${formatUnits(toWin(current.odds, units))}</b></div>
              <p class="muted small" id="units-note">1u is a normal play, ${MAX_UNITS}u is a max play. ${most < MAX_UNITS
                ? `At ${formatOdds(current.odds)}, ${formatUnits(most)} is the most you can play, so no pick wins more than ${MAX_UNITS} units.`
                : `Play ${formatUnits(UNITS_MIN)} to ${formatUnits(MAX_UNITS)}.`}</p>
              ${streak
                ? html`<label class="check streak-check"><input type="checkbox" name="streak" ${streak.checked ? 'checked' : ''}><span>${icons.flame}Make this my Streak pick for ${streak.today ? 'today' : dayShort(streak.day)}</span></label>`
                : ''}
              ${survivor ? survivorCheck(survivor) : ''}
              <div class="slip-actions">
                <button class="btn" data-busy="Locking it in…">Lock it in</button>
                <button class="btn ghost" formaction="/parlay/legs" formnovalidate data-busy="Adding…">Add to parlay</button>
              </div>
            </form>
            <p class="fine">You can delete it until the game starts. After that it's on your record for good.${game.lines.book ? ` Line from ${game.lines.book} via ESPN.` : ''}</p>
          </div>
        </div>
      </div>
    `,
  });
}

/**
 * The Survivor checkbox on an NFL slip: use this team as the week's Survivor
 * pick (or switch to it), or, for a team used in an earlier week, the same
 * line turned off. The Survivor pick only asks whether the team wins.
 */
function survivorCheck(s) {
  if (s.usedIn) {
    return html`<div class="check streak-check survivor-check used" aria-disabled="true"><input type="checkbox" disabled aria-label="${s.team}: used in Week ${s.usedIn}"><span>${icons.shield}${s.team}: used in Week ${s.usedIn}</span></div>`;
  }
  return html`<label class="check streak-check survivor-check"><input type="checkbox" name="survivor" ${s.checked ? 'checked' : ''}><span>${icons.shield}${s.now
    ? `Switch my Survivor pick to ${s.team} (now: ${s.now})`
    : `Use ${s.team} as my Survivor pick for Week ${s.week}`}</span></label>
    <p class="muted small survivor-note">Survivor only counts whether the ${s.team} win outright, whatever this bet is.</p>`;
}

/**
 * Unit buttons for a parlay. Long parlays often max out under 1u, so below
 * that the buttons are quarters and halves, and the last one is the max.
 */
function parlayChips(most) {
  const steps = (most >= 1 ? UNIT_CHIPS : [0.25, 0.5]).filter((n) => n < most);
  return [...steps.map((n) => [n, `${n}u`]), [most, `Max ${formatUnits(most)}`]];
}

/**
 * The parlay being built: each leg with Remove, the combined price, units,
 * to win and Lock parlay. `notes` say what changed since last time (a leg
 * dropped because its game started); `error` is why it didn't lock.
 */
export function parlayPage(ctx, { legs, notes = [], error = null, units }) {
  const ready = legs.length >= PARLAY_MIN_LEGS;
  const combined = legs.length ? parlayPrice(legs) : null;
  const most = ready ? parlayMaxUnits(combined.decimal) : 0;
  units ??= Math.min(1, most);
  const sport = legs.at(-1)?.game.sport ?? ctx.user.favSports?.[0];
  const board = sport ? `/games?sport=${sport}` : '/games';
  return layout(ctx, {
    title: 'Parlay',
    active: 'games',
    body: html`
      <div class="narrow">
        <a class="back" href="${board}">← Games</a>
        ${notes.length || error ? html`<div class="flash err" role="alert">${notes.map((n) => html`<span class="note">${n}</span>`)}${error ? html`<span class="note">${error}</span>` : ''}</div>` : ''}
        <div class="slip">
          <div class="slip-head"><span>Parlay</span><span>${legs.length} ${legs.length === 1 ? 'leg' : 'legs'} of ${PARLAY_MAX_LEGS}</span></div>
          <div class="slip-body">
            ${legs.length
              ? html`<ol class="parlay-legs">${legs.map((l) => html`<li>
                  <div class="pleg">
                    <div class="pickname">${selection(l.market, l.side, l.line, l.game)}</div>
                    <div class="slip-meta">${l.market === 'spread' ? SPORT[l.game.sport]?.spread ?? 'Spread' : MARKET_NAME[l.market]} · ${l.game.away.short} @ ${l.game.home.short} · ${at(l.game.start)}</div>
                  </div>
                  <span class="odds-pill">${minus(formatOdds(l.odds))}</span>
                  <form method="post" action="/parlay/legs/${encodeURIComponent(l.gameId)}/delete">${csrfField(ctx)}<button class="link-btn">Remove</button></form>
                </li>`)}</ol>`
              : html`<p class="muted">No legs yet. Tap a number on the board, then Add to parlay. Each leg goes on a different game.</p>`}
            ${ready
              ? html`<div class="combined"><span>Combined odds</span><b>${minus(formatOdds(combined.american))}</b></div>
                <form method="post" action="/parlays" data-odds="${combined.american}" data-decimal="${combined.decimal}">
                  ${csrfField(ctx)}
                  <input type="hidden" name="seen" value="${draftSignature(legs)}">
                  <label class="wager">Units
                    <span class="money-input suffix"><input type="text" name="units" value="${units}" inputmode="decimal" autocomplete="off" required aria-describedby="units-note"><span>u</span></span>
                  </label>
                  <div class="chips" hidden>
                    ${parlayChips(most).map(([n, label]) => html`<button type="button" class="chip" data-units="${n}">${label}</button>`)}
                  </div>
                  <div class="towin"><span>To win</span><b data-to-win>${formatUnits(parlayToWin(combined.decimal, units))}</b></div>
                  <p class="muted small" id="units-note">Same cap as any pick: no parlay risks more than ${MAX_UNITS}u or wins more than ${MAX_UNITS}u. At ${formatOdds(combined.american)}, ${formatUnits(most)} is the most you can play.</p>
                  <button class="btn block" data-busy="Locking it in…">Lock parlay</button>
                </form>
                <p class="fine">Every leg has to win. A leg that pushes drops out and the odds are worked again from the rest. You can delete it until its first game starts. After that it's on your record for good.</p>`
              : html`${legs.length ? html`<p class="muted">Add at least one more leg, from a different game.</p>` : ''}
                <a class="btn ghost block" href="${board}">Find a game</a>`}
          </div>
        </div>
      </div>
    `,
  });
}

export function myPicks(ctx, { open, graded, tab, record, streakDays = new Set() }) {
  const unstarted = (g) => g.state === 'pre' && new Date(g.start) > ctx.now;
  // A parlay can go until its first leg starts.
  const deletable = (p) => (p.kind === 'parlay' ? p.legs.every((l) => unstarted(l.game)) : unstarted(p.game));
  const path = (p) => (p.kind === 'parlay' ? `/parlays/${p.id}/delete` : `/picks/${p.id}/delete`);
  // A straight pick can become the day's Streak pick (or stop being it) until its game starts.
  const streakButton = (p) => {
    if (p.kind === 'parlay' || !unstarted(p.game)) return '';
    const day = etDay(p.game.start);
    if (!p.streakDay && streakDays.has(day)) return '';
    return html`<form method="post" action="/picks/${p.id}/streak">${csrfField(ctx)}<input type="hidden" name="on" value="${p.streakDay ? '0' : '1'}"><button class="link-btn">${p.streakDay ? 'Not my Streak pick' : 'Make it my Streak pick'}</button></form>`;
  };
  const list = tab === 'settled' ? graded : open;
  return layout(ctx, {
    title: 'My bets',
    active: 'picks',
    body: html`
      <h1>My bets</h1>
      <p class="lede">Your open bets stay hidden from everyone else until their game starts.</p>
      ${statStrip(record)}
      <div class="bets-tabs">${tabs('/picks', ctx.query, 'tab', [['', `Open (${open.length})`], ['settled', 'Settled']])}</div>
      ${list.length
        ? html`<ul class="tickets">${list.map((p) =>
            betItem(p, {
              mine: true,
              now: ctx.now,
              actions: deletable(p)
                ? html`${streakButton(p)}<form method="post" action="${path(p)}" data-confirm="Delete this bet?">${csrfField(ctx)}<button class="btn danger small">Delete</button></form>`
                : null,
            }),
          )}</ul>`
        : tab === 'settled'
          ? html`<div class="card empty">Settled bets land here once games go final.</div>`
          : html`<div class="card empty">No open bets. <a href="/games">Find a game</a>.</div>`}
    `,
  });
}

const STATUS_CLASS = { out: 'out', 'injured reserve': 'out', suspension: 'out', doubtful: 'doubt', questionable: 'doubt' };

/** Each team's listed injuries, worst first. Hidden when neither team lists any. */
function injuries(game, insight) {
  if (!insight.away.injuries.length && !insight.home.injuries.length) return '';
  return html`<section class="insight" aria-labelledby="injuries">
    <h2 id="injuries">Injuries</h2>
    <div class="insight-teams">${['away', 'home'].map((side) => html`<div class="insight-team">
      <h3>${teamLogo(game[side])}<span>${game[side].short}</span></h3>
      ${insight[side].injuries.length
        ? html`<ul class="injuries">${insight[side].injuries.map((p) => html`<li>
            <span class="inj-who"><b>${p.name}</b>${p.pos ? html` <span class="muted">${p.pos}</span>` : ''}</span>
            <span class="inj-status ${STATUS_CLASS[p.status.toLowerCase()] ?? ''}">${p.status}${p.detail ? html`<span class="muted"> · ${p.detail}</span>` : ''}</span>
          </li>`)}</ul>`
        : html`<p class="muted small">None listed.</p>`}
    </div>`)}</div>
  </section>`;
}

/** Each team's last five results as W/L chips, newest first. Hidden when neither team has any. */
function recentForm(game, insight) {
  if (!insight.away.form.length && !insight.home.form.length) return '';
  const word = { W: 'Won', L: 'Lost', T: 'Tied' };
  return html`<section class="insight" aria-labelledby="form">
    <h2 id="form">Recent form</h2>
    <div class="insight-teams">${['away', 'home'].map((side) => html`<div class="insight-team">
      <h3>${teamLogo(game[side])}<span>${game[side].short}</span>${insight[side].form.length ? html`<span class="form-sum">${formRecord(insight[side].form)}</span>` : ''}</h3>
      ${insight[side].form.length
        ? html`<ol class="form-list" aria-label="Last ${insight[side].form.length}, newest first">${insight[side].form.map((g) => html`<li class="form-chip ${g.result.toLowerCase()}"><b aria-hidden="true">${g.result}</b><span class="sr-only">${word[g.result]}</span> ${g.score} ${g.atVs} ${g.opp}</li>`)}</ol>`
        : html`<p class="muted small">No recent games listed.</p>`}
    </div>`)}</div>
  </section>`;
}

/** "3-2" (or "3-1-1") over the games shown. */
function formRecord(list) {
  const n = (r) => list.filter((g) => g.result === r).length;
  return `${n('W')}-${n('L')}${n('T') ? `-${n('T')}` : ''}`;
}

/** One game: its board (or score once it starts), injuries and form before the start, and its chat. */
export function gamePage(ctx, { game, started, messages, picksBy, mine, leg = null, split = null, insight = null }) {
  const sport = SPORT[game.sport];
  const scoreline = (side) => html`<div class="scoreline"><span class="team">${teamLogo(game[side])}<span class="tname"><span class="tn">${game[side].short}</span>${game[side].record ? html`<span class="tsub"><span class="trec">${game[side].record}</span></span>` : ''}</span></span><span class="score">${game[side].score ?? 0}</span></div>`;
  return layout(ctx, {
    title: `${game.away.short} @ ${game.home.short}`,
    active: 'games',
    body: html`
      <a class="back" href="/games?sport=${sport.key}">← ${sport.short} games</a>
      <h1>${game.away.short} @ ${game.home.short}</h1>
      ${started
        ? html`<article class="event">
            <div class="live-head">${game.state === 'in' ? html`<span class="live-tag">Live</span>` : ''}<span>${sport.short} · ${game.detail || 'Started'}${game.tv ? ` · ${game.tv}` : ''}</span></div>
            ${scoreline('away')}${scoreline('home')}
          </article>`
        : gameCard(game, mine, sport, null, null, leg)}
      ${splitBars(game, split)}
      ${insight ? injuries(game, insight) : ''}
      ${insight ? recentForm(game, insight) : ''}
      <h2 id="chat">Chat</h2>
      ${chatBox(ctx, {
        messages,
        action: `/games/${encodeURIComponent(game.id)}/chat`,
        placeholder: 'Say something about the game',
        rules: 'Keep it about the games. No harassment, hate or selling picks in chat; put your link on your profile instead. Three reports hide a message.',
        tags: (m) => (started ? picksBy.get(m.user_id) ?? [] : []).map((p) => html`<span class="msg-pick">${selection(p.market, p.side, p.line, game)} ${formatUnits(p.units)}</span>`),
      })}
    `,
  });
}
