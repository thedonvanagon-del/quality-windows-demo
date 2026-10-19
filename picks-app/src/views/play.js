import { html } from '../html.js';
import { formatOdds, formatSpread, formatUnits, MARKET_NAME, price, selection, toWin, UNIT_CHOICES } from '../picks.js';
import { SPORT } from '../sports.js';
import { dayLabel, etDay } from '../time.js';
import { csrfField, layout } from './layout.js';
import { at, pickItem, sportTabs, statStrip } from './parts.js';

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
      <p class="lede">Tap a number to pick it. It takes the line on the board right now and locks when the game starts.</p>
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
    <span class="team">${side === 'home' ? html`<small>@</small> ` : ''}${game[side].short}</span>
    ${cell(game, 'spread', side, mine)}
    ${cell(game, 'total', totalSide, mine)}
    ${cell(game, 'ml', side, mine)}`;
  return html`<article class="card game">
    <div class="game-head"><span>${at(game.start)}</span><span>${game.lines.book ?? ''}</span></div>
    <div class="board">
      <span></span><span class="colhead">${sport.spread}</span><span class="colhead">Total</span><span class="colhead">Money</span>
      ${row('away', 'over')}
      ${row('home', 'under')}
    </div>
  </article>`;
}

function cell(game, market, side, mine) {
  const p = price(game, market, side);
  if (!p) return html`<span class="cell off" aria-label="No ${MARKET_NAME[market].toLowerCase()} yet">–</span>`;
  const top = market === 'spread' ? formatSpread(p.line) : market === 'total' ? `${side === 'over' ? 'O' : 'U'} ${p.line}` : formatOdds(p.odds);
  const bottom = market === 'ml' ? '' : formatOdds(p.odds);
  const inner = html`${top}${bottom ? html`<small>${bottom}</small>` : ''}`;
  const label = `${selection(market, side, p.line, game)} at ${formatOdds(p.odds)}`;
  if (mine[market] === side) return html`<a class="cell mine" href="/picks" aria-label="Your pick: ${label}">${inner}</a>`;
  if (mine[market]) return html`<span class="cell taken" aria-label="${label}, you took the other side">${inner}</span>`;
  const query = new URLSearchParams({ game: game.id, market, side });
  return html`<a class="cell" href="/pick?${query}" aria-label="Pick ${label}">${inner}</a>`;
}

export function slip(ctx, { game, market, side, current, error, units = 1 }) {
  const sport = SPORT[game.sport];
  return layout(ctx, {
    title: 'Make a pick',
    active: 'games',
    body: html`
      <p><a href="/games?sport=${sport.key}">← ${sport.short} games</a></p>
      ${error ? html`<div class="flash err" role="alert">${error}</div>` : ''}
      <div class="card slip">
        <div class="muted small">${sport.short} · ${game.away.short} @ ${game.home.short} · ${at(game.start)}</div>
        <div class="pickname">${selection(market, side, current.line, game)}</div>
        <div class="muted">${formatOdds(current.odds)} · ${market === 'spread' ? sport.spread : MARKET_NAME[market]}${game.lines.book ? ` · ${game.lines.book} line via ESPN` : ''}</div>
        <form method="post" action="/picks" class="stack" data-odds="${current.odds}">
          ${csrfField(ctx)}
          <input type="hidden" name="game" value="${game.id}">
          <input type="hidden" name="market" value="${market}">
          <input type="hidden" name="side" value="${side}">
          <input type="hidden" name="line" value="${current.line ?? ''}">
          <input type="hidden" name="odds" value="${current.odds}">
          <fieldset class="stakes">
            <legend>Stake</legend>
            ${UNIT_CHOICES.map((u) => html`<label><input type="radio" name="units" value="${u}" ${u === units ? 'checked' : ''}><span>${formatUnits(u)}</span></label>`)}
          </fieldset>
          <p>To win <b data-to-win>${formatUnits(toWin(current.odds, units))}</b></p>
          <button class="btn">Lock it in</button>
        </form>
        <p class="muted small">You can delete it until the game starts. After that it's on your record for good.</p>
      </div>
    `,
  });
}

export function myPicks(ctx, { open, graded, record }) {
  return layout(ctx, {
    title: 'My picks',
    active: 'picks',
    body: html`
      <h1>My picks</h1>
      <p class="lede">Your open picks stay hidden from everyone else until their game starts.</p>
      ${statStrip(record)}
      <h2>Open</h2>
      ${open.length
        ? html`<div class="card"><ul class="picks">${open.map((p) =>
            pickItem(p, {
              actions:
                p.game.state === 'pre' && new Date(p.game.start) > ctx.now
                  ? html`<form method="post" action="/picks/${p.id}/delete" data-confirm="Delete this pick?">${csrfField(ctx)}<button class="btn danger small">Delete</button></form>`
                  : null,
            }),
          )}</ul></div>`
        : html`<div class="card empty">Nothing open. <a href="/games">Find a game</a>.</div>`}
      <h2>Graded</h2>
      ${graded.length
        ? html`<div class="card"><ul class="picks">${graded.map((p) => pickItem(p))}</ul></div>`
        : html`<div class="card empty">Your graded picks land here once games go final.</div>`}
    `,
  });
}
