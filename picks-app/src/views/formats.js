// Survivor, NFL Pick'em and the Bookie Bullies Cup: their pages, and the
// featured cards and banner at the top of the tournaments hub.

import { CUP_POINTS, PLACED_POINT, PLAYER_MADE_MIN } from '../cup.js';
import { html } from '../html.js';
import { CLOSE_AFTER_HOURS as PICKEM_CLOSE_HOURS, PICKEM_MIN } from '../pickem.js';
import { formatSpread } from '../picks.js';
import { REGULAR_WEEKS } from '../nflweeks.js';
import { icons } from './icons.js';
import { csrfField, layout } from './layout.js';
import { at, avatar, minus, placeWord, playerName, rankCell, recordText, tabs, teamLogo } from './parts.js';

const free = html`<span class="free-chip">Free</span>`;
const pts = (n) => `${Number.isInteger(n) ? n : n.toFixed(1)} ${n === 1 ? 'pt' : 'pts'}`;

/** "Sign in to join", or the Join button. */
function joinButton(ctx, label = 'Join Survivor') {
  if (!ctx.user?.screenName) return html`<a class="btn small" href="/login?next=%2Fsurvivor">${label}</a>`;
  return html`<form method="post" action="/survivor/join">${csrfField(ctx)}<button class="btn small">${label}</button></form>`;
}

// ---- the hub ------------------------------------------------------------------

/** Survivor at the top of the hub: your status, this week's pick, players left, and the deadline. */
export function survivorFeature(ctx, f) {
  if (!f || f.offseason) {
    const last = f?.last;
    return html`<article class="card feature survivor-feature" aria-labelledby="sv-feature">
      <div class="ft-head"><span class="ft-kicker">${icons.shield}NFL Survivor</span>${free}</div>
      <a class="ft-name" id="sv-feature" href="/survivor">Survivor</a>
      <p class="ft-text">Survivor returns for the NFL season.</p>
      ${last?.winners.length ? html`<p class="ft-last">${icons.medal}<span>Last winner${last.winners.length > 1 ? 's' : ''}: <b>${last.winners.join(', ')}</b> (${last.name})</span></p>` : ''}
    </article>`;
  }
  const { pool, week, status, pick, entered, left, deadline } = f;
  const closed = Boolean(pool.closed_at);
  const statusText = {
    alive: `Alive, Week ${week}`,
    out: `Out in Week ${f.outWeek}`,
    won: 'You won it',
    none: closed ? 'Final' : f.canJoin ? 'Not in yet' : 'Watching',
  }[status];
  let action;
  if (closed) action = html`<a class="btn small ghost" href="/survivor">See how it ended</a>`;
  else if (status === 'none') action = f.canJoin ? joinButton(ctx) : html`<a class="btn small ghost" href="/survivor">Standings</a>`;
  else if (status === 'alive' && !pick) action = html`<a class="btn small" href="/survivor#week">Make your pick</a>`;
  else action = html`<a class="btn small ghost" href="/survivor">Standings</a>`;
  return html`<article class="card feature survivor-feature ${status}" aria-labelledby="sv-feature">
    <div class="ft-head"><span class="ft-kicker">${icons.shield}NFL Survivor · Week ${week}</span>${free}</div>
    <a class="ft-name" id="sv-feature" href="/survivor">${pool.name}</a>
    <p class="ft-text">Pick one team to win each week. Use each team once. Lose and you're out.</p>
    <div class="ft-stats">
      <div class="ft-stat ${status}"><b>${statusText}</b><span>You</span></div>
      <div class="ft-stat"><b>${left} of ${entered}</b><span>${closed ? 'Won it' : 'Left'}</span></div>
    </div>
    ${pick ? html`<p class="ft-pick">${teamLogo(pick.game[pick.side])}<span><b>${pick.name}</b> · your Week ${week} pick</span></p>` : ''}
    ${closed && f.winners.length ? html`<p class="ft-last">${icons.medal}<span>Won by <b>${f.winners.join(', ')}</b></span></p>` : ''}
    <div class="ft-foot">
      <span class="ft-deadline">${deadline
        ? html`${deadline.mine ? 'Locks at kickoff' : deadline.first ? 'Pick by' : 'Next kickoff'} ${at(deadline.at)}`
        : status === 'none' && f.canJoin && f.current?.first ? html`Join by ${at(f.current.first)}` : ''}</span>
      ${action}
    </div>
  </article>`;
}

/** NFL Pick'em under Survivor: the week, how many you've picked, and your place. */
export function pickemFeature(ctx, f) {
  if (!f) return '';
  const row = f.row;
  return html`<article class="card feature pickem-feature" aria-labelledby="pk-feature">
    <div class="ft-head"><span class="ft-kicker">${icons.star}NFL Pick'em · Week ${f.week}</span>${free}</div>
    <a class="ft-name" id="pk-feature" href="/pickem/nfl">NFL Pick'em</a>
    <p class="ft-text">Pick every game against the spread. One Best Bet counts double.</p>
    <div class="ft-stats">
      <div class="ft-stat"><b>${f.picked} of ${f.games}</b><span>Picked</span></div>
      <div class="ft-stat"><b>${row ? html`${row.rank ? `#${row.rank} · ` : ''}${pts(row.points)}` : `${f.players} ${f.players === 1 ? 'player' : 'players'}`}</b><span>${row ? 'You this week' : 'In this week'}</span></div>
    </div>
    <div class="ft-foot">
      <span class="ft-deadline">${f.next ? html`Next lock ${at(f.next)}` : 'Every game has started'}</span>
      <a class="btn small ${f.open && f.picked < f.games ? '' : 'ghost'}" href="/pickem/nfl">${f.open && f.picked < f.games ? 'Make your picks' : 'See the week'}</a>
    </div>
  </article>`;
}

/** The slim Cup banner under the featured cards (and on the leaderboard). */
export function cupBanner(ctx, cup) {
  return html`<a class="promo cup-banner" href="/cup">${icons.board}<span><b>Bookie Bullies Cup ${cup.year}</b><small>${cup.mine
    ? html`You: #${cup.mine.rank} · ${cup.mine.points} pts`
    : 'Points for every tournament finish, all year.'}</small></span><span class="go">${icons.chevron}</span></a>`;
}

// ---- Survivor -------------------------------------------------------------------

const RESULT_CLASS = { win: 'win', loss: 'loss', tie: 'loss', void: 'push' };

/** One team on this week's board: a button to pick it, or why not. */
function teamButton(ctx, g, t, { canPick }) {
  const label = html`${teamLogo(t)}<span class="sv-tname"><b>${t.short}</b>${t.record ? html`<small>${t.record}</small>` : ''}</span>`;
  const tag = t.mine ? html`<span class="sv-tag mine">${icons.check}Your pick</span>`
    : t.used ? html`<span class="sv-tag used">Used Wk ${t.used}</span>`
      : g.locked ? html`<span class="sv-tag">${icons.lock}Locked</span>` : '';
  const off = !canPick || g.locked || t.used || t.mine;
  if (off) {
    return html`<div class="sv-team ${t.mine ? 'mine' : ''} ${t.used ? 'used' : ''} ${g.locked ? 'locked' : ''}" ${t.used ? html`aria-label="${t.short}: used in Week ${t.used}"` : ''}>${label}${tag}</div>`;
  }
  return html`<form class="sv-team-form" method="post" action="/survivor/pick">
    ${csrfField(ctx)}<input type="hidden" name="game" value="${g.game.id}"><input type="hidden" name="side" value="${t.side}">
    <button class="sv-team" aria-label="Pick ${t.short} to win">${label}<span class="sv-tag go">Pick</span></button>
  </form>`;
}

/** The Survivor page: your status, this week's games, your picks, the standings and the rules. */
export function survivorPage(ctx, { state, entry, board, history, table, canJoin, last, next = null }) {
  const { pool, current } = state;
  const playing = Boolean(ctx.user?.screenName);
  const status = !entry ? 'none' : entry.won_at ? 'won' : entry.out_week ? 'out' : 'alive';
  const canPick = Boolean(pool && !pool.closed_at && status === 'alive' && current && entry.start_week <= current.week);
  const title = pool?.name ?? 'Survivor';
  let me;
  if (!pool) me = html`<div class="card empty">Survivor returns for the NFL season.${last?.winners.length ? html` Last winner: <b>${last.winners.join(', ')}</b> (${last.name}).` : ''}</div>`;
  else if (status === 'none') {
    me = canJoin
      ? html`<div class="card sv-me"><span class="sv-me-text"><b>Join for Week ${current.week}</b><small>Free. You're alive from Week ${current.week} on.${current.first ? html` Join by ${at(current.first)}.` : ''}</small></span>${joinButton(ctx, playing ? 'Join' : 'Log in to join')}</div>`
      : html`<p class="muted">${pool.closed_at ? `${pool.name} is over.` : `Week ${current?.week} has started. You can join before next week's first game.`}</p>`;
  } else {
    const word = { alive: `Alive, Week ${current?.week ?? pool.closed_week}`, out: `Out in Week ${entry.out_week}`, won: pool.closed_at ? 'You won it' : 'Alive' }[status];
    const why = status === 'out'
      ? entry.out_reason === 'missed' ? 'No pick that week.' : `${entry.out_team} ${entry.out_reason === 'tie' ? 'tied' : 'lost'}.`
      : status === 'won' ? 'Last one standing.' : `In since Week ${entry.start_week}.`;
    me = html`<div class="card sv-me ${status}"><span class="sv-icon">${icons.shield}</span><span class="sv-me-text"><b>${word}</b><small>${why}</small></span></div>`;
  }
  const mine = board.flatMap((g) => [g.away, g.home].filter((t) => t.mine).map((t) => ({ g, t })))[0] ?? null;
  return layout(ctx, {
    title,
    active: 'tournaments',
    description: 'Free NFL Survivor on LockBox: pick one team to win each week, use each team once, last one standing wins.',
    body: html`
      <a class="back" href="/tournaments">← Tournaments</a>
      <div class="tn-title"><h1>${title}</h1>${free}</div>
      <p class="lede">Pick one NFL team to win each week. Use each team once a season. A loss, a tie or a week with no pick and you're out. Last one standing wins.</p>
      ${me}
      ${pool && current && !pool.closed_at
        ? html`<div class="contest-clock">
            <span class="cc-week">Week ${current.week}</span>
            <b>${mine ? html`${mine.t.short} · locks ${at(mine.g.game.start)}` : next ? html`${next === current.first ? 'First game' : 'Next kickoff'} ${at(next)}` : current.games.length ? 'Every game has started' : "This week's games aren't up yet"}</b>
            <span class="cc-left">Picks lock at each game's kickoff</span>
          </div>
          <h2 id="week">Week ${current.week} games</h2>
          ${canPick ? html`<p class="muted small">Tap a team to pick it. You can switch until your team kicks off.</p>` : ''}
          ${board.length
            ? html`<div class="sv-games">${board.map((g) => html`<div class="sv-game ${g.locked ? 'locked' : ''}">
                <div class="sv-when">${at(g.game.start)}${g.game.tv ? html`<span class="tv">${g.game.tv}</span>` : ''}${g.locked ? html`<span class="sv-started">${g.game.state === 'post' ? 'Final' : 'Started'}</span>` : ''}</div>
                <div class="sv-pair">${teamButton(ctx, g, g.away, { canPick })}<span class="sv-at">@</span>${teamButton(ctx, g, g.home, { canPick })}</div>
              </div>`)}</div>`
            : html`<div class="card empty">Week ${current.week} games show here once they're on the board.</div>`}`
        : ''}
      ${history.length
        ? html`<h2>Your picks</h2>
          <ul class="sv-history">${history.map((h) => html`<li>
            <span class="sv-wk">Wk ${h.week}</span>
            <span class="team">${teamLogo({ abbr: h.abbr, logo: h.logo })}<span class="tname">${h.team} <span class="muted">${h.home ? 'vs' : '@'} ${h.opp}</span></span></span>
            <span class="status ${h.result ? RESULT_CLASS[h.result] : 'open'}">${h.word}</span>
          </li>`)}</ul>`
        : ''}
      ${pool ? standingsSection(ctx, table) : ''}
      <h2>Rules</h2>
      <ul class="tn-rules">
        <li>Free. Nothing to pay, nothing paid out.</li>
        <li>Each week, pick one team to win its game outright. No spread.</li>
        <li>You can use each team once a season.</li>
        <li>If your team loses, you're out. A tie counts as a loss.</li>
        <li>A week with no pick knocks you out too. You'll get a reminder 3 hours before the week's first game.</li>
        <li>You can switch your pick until your team kicks off. Other players' picks stay hidden until each game starts.</li>
        <li>If your team's game is postponed or canceled, that pick doesn't count: you survive the week and can use the team again.</li>
        <li>Join any week before its first game. You're alive from that week on, and only weeks from then count.</li>
        <li>Last one standing wins. If everyone left goes out the same week, they share the win. After Week ${REGULAR_WEEKS}, everyone still alive shares it.</li>
        <li>The winner gets the Survivor champion badge and Bookie Bullies Cup points.</li>
      </ul>
    `,
  });
}

/** Players left, who went out each week, and every player's picks (hidden until each game starts). */
function standingsSection(ctx, table) {
  return html`<h2>Standings</h2>
    <div class="sv-summary">
      <div class="ft-stat"><b>${table.left} of ${table.entered}</b><span>Left</span></div>
      ${table.outByWeek.length ? html`<p class="sv-outs"><span class="muted">Out by week:</span> ${table.outByWeek.map((o) => html`<span class="sv-out">Wk ${o.week}: <b>${o.n}</b></span>`)}</p>` : ''}
    </div>
    ${table.players.length
      ? html`<ul class="sv-players">${table.players.map((p) => html`<li class="${p.id === ctx.user?.id ? 'me' : ''} ${p.status}">
          <div class="sv-row">
            <span class="player">${avatar(p, 'xs')}${playerName(p)}</span>
            <span class="sv-state ${p.status}">${p.status === 'won' ? 'Winner' : p.status === 'alive' ? 'Alive' : `Out Wk ${p.outWeek}`}</span>
          </div>
          ${p.picks.length
            ? html`<ol class="sv-chips">${p.picks.map((k) => html`<li class="sv-chip ${k.result ? RESULT_CLASS[k.result] : 'open'}" title="Week ${k.week}${k.word ? `: ${k.word}` : ''}">
                <span class="wk">${k.week}</span>${k.hidden ? html`${icons.lock}<span class="sr-only">Hidden until kickoff</span>` : k.abbr}
              </li>`)}</ol>`
            : html`<p class="muted small">No picks yet.</p>`}
        </li>`)}</ul>`
      : html`<div class="card empty">Nobody's in yet.</div>`}`;
}

// ---- NFL Pick'em ----------------------------------------------------------------

/** One game on the Pick'em form: two team buttons with the spread, and the Best Bet star. */
function pickemGame(g, best) {
  const p = g.pick;
  const name = `pick_${g.game.id}`;
  const side = (s) => {
    const t = g.game[s];
    const line = p?.side === s ? p.line : g.spread[s]?.line;
    const on = p?.side === s;
    return html`<label class="pk-team ${on ? 'on' : ''}">
      <input type="radio" name="${name}" value="${s}" ${on ? 'checked' : ''} ${g.locked || !g.spread[s] ? 'disabled' : ''}>
      <span class="pk-face">${teamLogo(t)}<span class="pk-tname">${t.short}</span><b class="pk-line">${line == null ? '–' : minus(formatSpread(line))}</b></span>
    </label>`;
  };
  const result = p?.result ? html`<span class="status ${p.result === 'void' ? 'push' : p.result}">${{ win: 'Won', loss: 'Lost', push: 'Push', void: 'Void' }[p.result]}${p.points ? ` · ${pts(p.points)}` : ''}</span>` : '';
  return html`<div class="pk-game ${g.locked ? 'locked' : ''} ${p?.best ? 'best' : ''}">
    <div class="pk-when">${at(g.game.start)}${g.locked ? html`<span class="sv-started">${icons.lock}${g.game.state === 'post' ? 'Final' : 'Locked'}</span>` : ''}${result}</div>
    <fieldset class="pk-pair"><legend class="sr-only">${g.game.away.short} at ${g.game.home.short}</legend>${side('away')}${side('home')}</fieldset>
    <label class="pk-best ${p?.best ? 'on' : ''}">
      <input type="radio" name="best" value="${g.game.id}" ${p?.best ? 'checked' : ''} ${g.locked || (best && best.locked && !p?.best) ? 'disabled' : ''}>
      <span>${icons.star}Best Bet</span>
    </label>
  </div>`;
}

/** Points, record and place, for a standings table. */
function pickemTable(ctx, rows, { season = false } = {}) {
  if (!rows.length) return html`<div class="card empty">No picks yet. Standings fill in as games go final.</div>`;
  return html`<div class="table"><table class="pk-table">
    <thead><tr><th>#</th><th>Player</th><th class="n">${season ? 'Wks won' : 'Record'}</th><th class="n">Pts</th></tr></thead>
    <tbody>${rows.map((r) => html`<tr class="${r.id === ctx.user?.id ? 'me' : ''}">
      <td class="rank">${rankCell(r)}</td>
      <td><span class="player">${avatar(r)}${playerName(r)}</span>${!season && !r.rank ? html`<small class="to-place">${PICKEM_MIN - r.graded} more to place</small>` : ''}</td>
      <td class="n">${season ? r.won : recordText(r)}</td>
      <td class="n"><b>${pts(r.points)}</b></td>
    </tr>`)}</tbody>
  </table></div>`;
}

/** The NFL Pick'em page: the week's games as a form, the week's standings and the season's. */
export function pickemPage(ctx, { week, board, rows, season, results, weeks, viewing, notes = [] }) {
  const playing = Boolean(ctx.user?.screenName);
  const bestGame = board.find((g) => g.pick?.best) ?? null;
  const open = board.some((g) => !g.locked);
  const mineRow = rows.find((r) => r.id === ctx.user?.id) ?? null;
  return layout(ctx, {
    title: "NFL Pick'em",
    active: 'tournaments',
    description: "Free NFL Pick'em on LockBox: pick every game against the spread each week.",
    body: html`
      <a class="back" href="/tournaments">← Tournaments</a>
      <div class="tn-title"><h1>NFL Pick'em</h1>${free}</div>
      <p class="lede">Pick every NFL game against the spread. A right pick is 1 point, a push half a point. Your Best Bet counts double. Separate from your bets: no units, no record.</p>
      ${notes.length ? html`<div class="flash err" role="alert">${notes.map((n) => html`<span class="note">${n}</span>`)}</div>` : ''}
      ${week
        ? html`${weeks.length > 1 ? html`<nav class="tabs pk-weeks" aria-label="Week">${weeks.map((w) => html`<a href="/pickem/nfl?week=${w}" class="${w === viewing ? 'on' : ''}" ${w === viewing ? html`aria-current="true"` : ''}>Wk ${w}</a>`)}</nav>` : ''}
          ${mineRow
            ? html`<div class="card my-standing">
                <span class="ms-place">${mineRow.rank ? `#${mineRow.rank}` : '–'}</span>
                <span class="ms-text"><b>You, Week ${week.week}</b><small>${recordText(mineRow)} · ${mineRow.picks} of ${board.length} picked${bestGame ? html` · Best Bet: ${bestGame.game[bestGame.pick.side].short}` : ''}</small></span>
                <b class="ms-units">${pts(mineRow.points)}</b>
              </div>`
            : ''}
          ${results?.length ? html`<p class="pk-final">${icons.medal}<span>Week ${week.week} is final. Won by <b>${results[0].screen_name}</b> (${pts(results[0].points)}).</span></p>` : ''}
          <h2 id="games">Week ${week.week} games</h2>
          ${board.length
            ? html`<form class="pk-form" method="post" action="/pickem/nfl">
                ${playing ? csrfField(ctx) : ''}
                <input type="hidden" name="week" value="${week.week}">
                <div class="pk-games">${board.map((g) => pickemGame(g, bestGame))}</div>
                ${open
                  ? playing
                    ? html`<div class="pk-save"><button class="btn block" data-busy="Saving…">Save picks</button><p class="fine">Each game locks at its kickoff. Change any pick until then. The line is the app's spread when you save that pick.</p></div>`
                    : html`<a class="btn block" href="/login?next=%2Fpickem%2Fnfl">Log in to pick</a>`
                  : ''}
              </form>`
            : html`<div class="card empty">Week ${week.week} games show here once they're on the board.</div>`}
          <h2>Week ${week.week} standings</h2>
          ${pickemTable(ctx, rows)}
          <h2>Season standings</h2>
          ${pickemTable(ctx, season, { season: true })}`
        : html`<div class="card empty">NFL Pick'em returns for the NFL season.</div>`}
      <h2>Rules</h2>
      <ul class="tn-rules">
        <li>Free. Everyone who makes a pick is in. Nothing to pay, nothing paid out.</li>
        <li>Pick a side of every game against the spread. The line is the app's spread when you save that game's pick.</li>
        <li>A right pick is 1 point. A push is half a point. A postponed game doesn't count.</li>
        <li>Mark one pick a week as your Best Bet. It counts double, win or push.</li>
        <li>Each game locks at its kickoff. You can change a pick, or your Best Bet, until its game starts.</li>
        <li>${PICKEM_MIN} graded picks to place. Ties go to more wins, then to whoever saved their picks first.</li>
        <li>The week is final once every pick is graded, ${PICKEM_CLOSE_HOURS} hours after its last game at the latest. The winner gets the Pick'em winner badge, and everyone placed gets Bookie Bullies Cup points.</li>
        <li>Pick'em picks are separate from your bets. They don't touch your units or your record.</li>
      </ul>
    `,
  });
}

// ---- the Cup --------------------------------------------------------------------

/** The Bookie Bullies Cup: the year's standings, your row lit up, and how points work. */
export function cupPage(ctx, { year, years, rows, mine, history }) {
  return layout(ctx, {
    title: `Bookie Bullies Cup ${year}`,
    active: 'board',
    description: 'The Bookie Bullies Cup: a year-long points race over every free tournament.',
    body: html`
      <a class="back" href="/tournaments">← Tournaments</a>
      <div class="tn-title"><h1>Bookie Bullies Cup ${year}</h1>${free}</div>
      <p class="lede">A points race over the whole year. Every tournament you finish counts: auto ones, player-made ones, the Weekly Open, Survivor and NFL Pick'em.</p>
      ${years.length > 1 ? tabs('/cup', ctx.query, 'year', years.map((y, i) => [i === 0 ? '' : String(y), String(y)])) : ''}
      ${mine
        ? html`<div class="card my-standing">
            <span class="ms-place">#${mine.rank}</span>
            <span class="ms-text"><b>You</b><small>${mine.wins} ${mine.wins === 1 ? 'win' : 'wins'} · ${mine.podiums} ${mine.podiums === 1 ? 'podium' : 'podiums'} · ${mine.events} placed</small></span>
            <b class="ms-units">${mine.points} pts</b>
          </div>`
        : ctx.user?.screenName ? html`<p class="muted">No Cup points yet this year. Finish a tournament to get on the board.</p>` : ''}
      ${rows.length
        ? html`<div class="table"><table class="cup-table">
            <thead><tr><th>#</th><th>Player</th><th class="n">Pts</th><th class="n">Wins</th><th class="n">Podiums</th></tr></thead>
            <tbody>${rows.map((r) => html`<tr class="${r.id === ctx.user?.id ? 'me' : ''}">
              <td class="rank">${rankCell(r)}</td>
              <td><span class="player">${avatar(r)}${playerName(r)}</span></td>
              <td class="n"><b>${r.points}</b></td>
              <td class="n">${r.wins}</td>
              <td class="n">${r.podiums}</td>
            </tr>`)}</tbody>
          </table></div>`
        : html`<div class="card empty">No points yet. They come in as tournaments close.</div>`}
      <section class="card cup-how" aria-labelledby="cup-how">
        <h2 id="cup-how">How points work</h2>
        <ol class="cup-points">${CUP_POINTS.map((p, i) => html`<li><span>${placeWord(i + 1)}</span><b>${p}</b></li>`)}</ol>
        <ul class="tn-rules">
          <li>Plus ${PLACED_POINT} point for every tournament you place in (you met its minimum), so playing a lot counts.</li>
          <li>Every tournament counts when it closes: NFL Sunday, College Saturday, Hoops Night, admin-made ones, the Weekly Open, Survivor and each week of NFL Pick'em.</li>
          <li>Player-made tournaments count only with ${PLAYER_MADE_MIN} or more placed players.</li>
          <li>A shared place gets that place's points. Ties in the Cup go to more wins, then more podiums.</li>
          <li>The year runs January to December. The top 3 get the Cup champion and Cup podium badges and go on the winners wall.</li>
        </ul>
      </section>
      ${history.length
        ? html`<h2>Your finishes</h2>
          <ul class="cup-history">${history.map((h) => html`<li><span class="place">${placeWord(h.place)}</span><span class="label">${h.label}</span><b>+${h.points}</b></li>`)}</ul>`
        : ''}
      <a class="btn ghost block winners-link" href="/winners?tab=cup">Winners wall</a>
    `,
  });
}

export { pts };
