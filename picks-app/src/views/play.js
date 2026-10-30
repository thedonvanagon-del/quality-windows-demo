import { html } from '../html.js';
import { formatOdds, formatSpread, formatUnits, MARKET_NAME, MAX_UNITS, maxUnits, price, selection, toWin, UNIT_CHIPS, UNITS_MIN } from '../picks.js';
import { SPORT } from '../sports.js';
import { dayLabel, etDay } from '../time.js';
import { csrfField, layout } from './layout.js';
import { at, minus, pickItem, sportTabs, statStrip, tabs, teamLogo } from './parts.js';

/** `mine` maps game id -> { spread: 'home', total: 'over', ... } for the player's picks. */
export function games(ctx, { sport, list, mine, problem }) {
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
      ${problem ? html`<div class="flash err" role="status">Can't reach live lines right now. Showing the last ones we saw.</div>` : ''}
      ${days.length
        ? days.map(
            (d) => html`<div class="day">${d.label}</div>
              ${d.games.map((g) => gameCard(g, mine.get(g.id) ?? {}, sport))}`,
          )
        : html`<div class="card empty">No ${sport.name} games on the board in the next ${sport.days} days.</div>`}
    `,
  });
}

function gameCard(game, mine, sport) {
  const row = (side, totalSide) => html`
    <span class="team">${teamLogo(game[side])}<span class="tname">${game[side].short}</span></span>
    ${cell(game, 'spread', side, mine)}
    ${cell(game, 'total', totalSide, mine)}
    ${cell(game, 'ml', side, mine)}`;
  return html`<article class="event" aria-label="${game.away.name} at ${game.home.name}">
    <div class="board">
      <span class="when">${at(game.start)}</span><span class="colhead">${sport.spread}</span><span class="colhead">Total</span><span class="colhead">Money</span>
      ${row('away', 'over')}
      ${row('home', 'under')}
    </div>
  </article>`;
}

function cell(game, market, side, mine) {
  const p = price(game, market, side);
  if (!p) return html`<span class="cell off" aria-label="No ${MARKET_NAME[market].toLowerCase()} yet">–</span>`;
  const ml = market === 'ml';
  const top = market === 'spread' ? formatSpread(p.line) : market === 'total' ? `${side === 'over' ? 'O' : 'U'} ${p.line}` : formatOdds(p.odds);
  const inner = html`${minus(top)}${ml ? '' : html`<small>${minus(formatOdds(p.odds))}</small>`}`;
  const kind = ml ? 'cell price' : 'cell';
  const label = `${selection(market, side, p.line, game)} at ${formatOdds(p.odds)}`;
  if (mine[market] === side) return html`<a class="${kind} mine" href="/picks" aria-label="Your pick: ${label}">${inner}</a>`;
  if (mine[market]) return html`<span class="${kind} taken" aria-label="${label}, you took the other side">${inner}</span>`;
  const query = new URLSearchParams({ game: game.id, market, side });
  return html`<a class="${kind}" href="/pick?${query}" aria-label="Pick ${label}">${inner}</a>`;
}

export function slip(ctx, { game, market, side, current, error, units }) {
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
              <button class="btn block">Lock it in</button>
            </form>
            <p class="fine">You can delete it until the game starts. After that it's on your record for good.${game.lines.book ? ` Line from ${game.lines.book} via ESPN.` : ''}</p>
          </div>
        </div>
      </div>
    `,
  });
}

export function myPicks(ctx, { open, graded, tab, record }) {
  const deletable = (p) => p.game.state === 'pre' && new Date(p.game.start) > ctx.now;
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
            pickItem(p, {
              mine: true,
              now: ctx.now,
              actions: deletable(p)
                ? html`<form method="post" action="/picks/${p.id}/delete" data-confirm="Delete this bet?">${csrfField(ctx)}<button class="btn danger small">Delete</button></form>`
                : null,
            }),
          )}</ul>`
        : tab === 'settled'
          ? html`<div class="card empty">Settled bets land here once games go final.</div>`
          : html`<div class="card empty">No open bets. <a href="/games">Find a game</a>.</div>`}
    `,
  });
}
