import { html } from '../html.js';
import { formatOdds, formatSpread, formatUnits, MARKET_NAME, MAX_UNITS, maxUnits, PARLAY_MAX_LEGS, PARLAY_MIN_LEGS, parlayMaxUnits, parlayPrice, parlayToWin, price, selection, toWin, UNIT_CHIPS, UNITS_MIN } from '../picks.js';
import { draftSignature } from '../parlays.js';
import { SPORT } from '../sports.js';
import { dayLabel, etDay, when } from '../time.js';
import { icons } from './icons.js';
import { csrfField, layout } from './layout.js';
import { at, betItem, minus, sportTabs, statStrip, tabs, teamLogo } from './parts.js';

/** The id a game's card carries, so a pick can come back to the same spot on the board. */
export function cardId(gameId) {
  return `g-${String(gameId).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

/**
 * `mine` maps game id -> { spread: 'home', total: 'over', ... } for the
 * player's picks; `draft` maps game id -> { market, side } for their parlay legs.
 */
export function games(ctx, { sport, list, mine, draft = new Map(), chats = new Map(), split = new Map(), problem }) {
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
              ${d.games.map((g) => gameCard(g, mine.get(g.id) ?? {}, sport, chats.get(g.id) ?? 0, split.get(g.id), draft.get(g.id)))}`,
          )
        : html`<div class="card empty">No ${sport.name} games on the board in the next ${sport.days} days.</div>`}
    `,
  });
}

function gameCard(game, mine, sport, chatCount = null, split = null, leg = null) {
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
    ${chatCount == null && !split?.spread ? '' : html`<div class="card-foot">
      ${chatCount == null ? '' : html`<a class="card-chat" href="/games/${encodeURIComponent(game.id)}#chat">${icons.chat}<span>${chatCount ? `Chat · ${chatCount}` : 'Chat'}</span></a>`}
      ${split?.spread ? html`<span class="lean">${leanText(game, split.spread)}</span>` : ''}
    </div>`}
  </article>`;
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

export function myPicks(ctx, { open, graded, tab, record }) {
  const unstarted = (g) => g.state === 'pre' && new Date(g.start) > ctx.now;
  // A parlay can go until its first leg starts.
  const deletable = (p) => (p.kind === 'parlay' ? p.legs.every((l) => unstarted(l.game)) : unstarted(p.game));
  const path = (p) => (p.kind === 'parlay' ? `/parlays/${p.id}/delete` : `/picks/${p.id}/delete`);
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
                ? html`<form method="post" action="${path(p)}" data-confirm="Delete this bet?">${csrfField(ctx)}<button class="btn danger small">Delete</button></form>`
                : null,
            }),
          )}</ul>`
        : tab === 'settled'
          ? html`<div class="card empty">Settled bets land here once games go final.</div>`
          : html`<div class="card empty">No open bets. <a href="/games">Find a game</a>.</div>`}
    `,
  });
}

/** One game: its board (or score once it starts) and its chat. */
export function gamePage(ctx, { game, started, messages, picksBy, mine, leg = null, split = null }) {
  const sport = SPORT[game.sport];
  const scoreline = (side) => html`<div class="scoreline"><span class="team">${teamLogo(game[side])}<span class="tname"><span class="tn">${game[side].short}</span>${game[side].record ? html`<span class="tsub"><span class="trec">${game[side].record}</span></span>` : ''}</span></span><span class="score">${game[side].score ?? 0}</span></div>`;
  const canPost = ctx.user.verified;
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
      <h2 id="chat">Chat</h2>
      <div class="chat" data-poll>
        <ol class="chat-list">
          ${messages.length
            ? messages.map((m) => chatMessage(ctx, game, m, started ? picksBy.get(m.user_id) ?? [] : []))
            : html`<li class="chat-empty">No messages yet. Start it off.</li>`}
        </ol>
        ${canPost
          ? html`<form class="chat-form" method="post" action="/games/${encodeURIComponent(game.id)}/chat">
              ${csrfField(ctx)}
              <label class="sr-only" for="chat-body">Message</label>
              <textarea id="chat-body" name="body" rows="2" maxlength="280" required placeholder="Say something about the game"></textarea>
              <button class="btn">Send</button>
            </form>
            <p class="fine">Keep it about the games. No harassment, hate or selling picks in chat; put your link on your profile instead. Three reports hide a message.</p>`
          : html`<p class="muted">Confirm your email to join the chat. The link is in your inbox.</p>`}
      </div>
    `,
  });
}

function chatMessage(ctx, game, m, picks) {
  const own = m.user_id === ctx.user.id;
  const action = own
    ? html`<form method="post" action="/chat/${m.id}/delete" data-confirm="Delete this message?">${csrfField(ctx)}<button class="link-btn">Delete</button></form>`
    : html`<form method="post" action="/chat/${m.id}/report" data-confirm="Report this message?">${csrfField(ctx)}<button class="link-btn">Report</button></form>`;
  return html`<li class="msg ${own ? 'own' : ''}" data-id="${m.id}${m.hidden ? 'h' : ''}">
    <div class="msg-head">
      <a class="who" href="/u/${encodeURIComponent(m.screen_name)}">${m.screen_name}</a>
      ${picks.map((p) => html`<span class="msg-pick">${selection(p.market, p.side, p.line, game)} ${formatUnits(p.units)}</span>`)}
      <time datetime="${m.created_at}" data-local="long">${when(m.created_at)}</time>
      ${action}
    </div>
    ${m.hidden ? html`<p class="msg-body hidden-msg">Hidden after reports.</p>` : html`<p class="msg-body">${m.body}</p>`}
  </li>`;
}
