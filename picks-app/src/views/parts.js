import { html } from '../html.js';
import { clvLabel, clvValue } from '../clv.js';
import { resolveColor } from '../nametags.js';
import { formatOdds, formatUnits, parlayPrice, parlayToWin, selection, toWin } from '../picks.js';
import { SPORT, SPORTS } from '../sports.js';
import { MIN_RANKED, PERIODS } from '../stats.js';
import { kickoff, when } from '../time.js';
import { avatar } from './avatar.js';
import { icons } from './icons.js';
import { csrfField } from './layout.js';

export { avatar };

/** A time in Eastern from the server; app.js swaps in the viewer's zone. */
export function at(iso, style = 'short') {
  return html`<time datetime="${iso}" data-local="${style}">${style === 'long' ? when(iso) : kickoff(iso)}</time>`;
}

/** The tag beside the official BookieBullies account wherever it shows. */
export const officialTag = html`<span class="official-tag" title="The Bookie Bullies model's picks">Official</span>`;

/** The tag on a Streak pick (the streak game). */
export const streakTag = html`<span class="streak-tag" title="Streak pick">${icons.flame}Streak</span>`;

/** One small badge chip beside a name on a board: the player's most notable badge. */
export function badgeMark(badge) {
  return badge ? html`<span class="badge-mark" title="${badge.label}: ${badge.about}"><span class="sr-only">Badge: </span>${badge.short}</span>` : '';
}

/** A gold tag on official picks the site called a lock. */
export const lockTag = html`<span class="lock-tag" title="A lock on bookiebullies.com">Lock</span>`;

/**
 * A player's name as a link to their profile. `color` (a name color key) and
 * `icon` (from nametagsFor) are how they chose to show on the boards; the
 * official account gets its Official tag instead.
 */
export function profileLink(name, { official = false, color = null, icon = null } = {}) {
  const c = official ? null : resolveColor(color);
  const link = html`<a class="${c ? `who name-c-${c}` : 'who'}" href="/u/${encodeURIComponent(name)}">${name}</a>`;
  if (official) return html`${link}${officialTag}`;
  // The icon stays on the name's line when a row wraps.
  return icon ? html`<span class="pname">${link}${nameIcon(icon)}</span>` : link;
}

/** A player's scoreboard icon: an emoji with its name for screen readers, or a team's logo. */
export function nameIcon(icon) {
  if (!icon) return '';
  if (icon.kind === 'team') {
    return html`<img class="name-logo" src="${icon.logo}" alt="${icon.name}" title="${icon.name}" width="18" height="18" loading="lazy" decoding="async" referrerpolicy="no-referrer">`;
  }
  return html`<span class="name-icon" role="img" aria-label="${icon.label}" title="${icon.label}">${icon.emoji}</span>`;
}

/** profileLink for a row: its screen name, Official flag and name color and icon (filled by withLooks in app.js). */
export function playerName(r) {
  return profileLink(r.screen_name ?? r.screenName, { official: Boolean(r.official), color: r.nameColor, icon: r.nameIcon });
}

/** Where a row sits on a board: its number, or a dash for the unranked and the official account. */
export function rankCell(r) {
  if (r.official) return html`<span class="rk unranked" title="The official account isn't ranked">–</span>`;
  if (!r.rank) return html`<span class="rk unranked" title="Needs ${MIN_RANKED} graded picks for a rank">–</span>`;
  return html`<span class="rk ${r.rank <= 3 ? `r${r.rank}` : ''}">${r.rank}</span>`;
}

/** Tabs that keep the rest of the query string. `style` is "tabs" or "seg". */
export function tabs(base, query, key, options, style = 'tabs') {
  return html`<nav class="${style}" aria-label="${key}">
    ${options.map(([value, label]) => {
      const next = new URLSearchParams(query);
      if (value) next.set(key, value);
      else next.delete(key);
      const on = (query.get(key) || '') === (value || '');
      return html`<a href="${base}${next.size ? `?${next}` : ''}" class="${on ? 'on' : ''}" ${on ? html`aria-current="true"` : ''}>${label}</a>`;
    })}
  </nav>`;
}

export function sportTabs(base, query, { all = true } = {}) {
  return tabs(base, query, 'sport', [...(all ? [['', 'All sports']] : []), ...SPORTS.map((s) => [s.key, s.short])]);
}

export function periodTabs(base, query) {
  return tabs(base, query, 'period', PERIODS.map((p) => [p.key === 'all' ? '' : p.key, p.label]), 'seg');
}

/** A true minus sign: as wide as a plus, so columns of numbers line up. */
export function minus(text) {
  return String(text).replace(/^-/, '\u2212');
}

export function units(n) {
  return html`<span class="${n > 0 ? 'win' : n < 0 ? 'loss' : 'push'}">${minus(formatUnits(n, { sign: true }))}</span>`;
}

export function pct(n) {
  return n == null ? '–' : `${Math.round(n * 1000) / 10}%`;
}

export function signedPct(n) {
  if (n == null) return '–';
  const v = Math.round(n * 1000) / 10;
  return minus(`${v > 0 ? '+' : ''}${v}%`);
}

export function recordText(r) {
  return `${r.wins}-${r.losses}${r.pushes ? `-${r.pushes}` : ''}`;
}

export function statStrip(r) {
  return html`<div class="stats">
    <div class="stat"><b>${recordText(r)}</b><span>Record</span></div>
    <div class="stat"><b>${units(r.units)}</b><span>Units</span></div>
    <div class="stat"><b>${pct(r.winPct)}</b><span>Win rate</span></div>
    <div class="stat"><b>${signedPct(r.roi)}</b><span>ROI</span></div>
  </div>`;
}

/** A team's ESPN logo, with its initials underneath for when the image can't load. */
export function teamLogo(team) {
  return html`<span class="logo" aria-hidden="true">${team.abbr.slice(0, 4)}${team.logo ? html`<img src="${team.logo}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}</span>`;
}

/**
 * Players with their records. `ranks: false` drops the # column, for lists
 * that aren't a board. `badges` (user id -> badge) puts one badge by a name.
 */
export function boardTable(rows, { me, ranks = true, badges = null, empty = 'No graded picks here yet. Results show up once games go final.' } = {}) {
  if (!rows.length) return html`<div class="card empty">${empty}</div>`;
  return html`<div class="table"><table>
    <thead><tr>${ranks ? html`<th>#</th>` : ''}<th>Player</th><th class="n">Record</th><th class="n hide-sm">Win</th><th class="n">Units</th><th class="n hide-sm">ROI</th></tr></thead>
    <tbody>
      ${rows.map((r) => html`<tr class="${r.id === me ? 'me' : ''}">
        ${ranks ? html`<td class="rank">${rankCell(r)}</td>` : ''}
        <td><span class="player">${avatar(r)}${playerName(r)}${badges ? badgeMark(badges.get(r.id)) : ''}</span></td>
        <td class="n">${recordText(r)}</td>
        <td class="n hide-sm">${pct(r.winPct)}</td>
        <td class="n"><b>${units(r.units)}</b></td>
        <td class="n hide-sm">${signedPct(r.roi)}</td>
      </tr>`)}
    </tbody>
  </table></div>`;
}

/** "3h 46m", "2 days": how far ahead of the start a pick went in. */
export function lead(madeAt, start) {
  const minutes = Math.max(0, Math.floor((new Date(start) - new Date(madeAt)) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 48 * 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  return `${Math.floor(minutes / 1440)} days`;
}

const RESULT = { win: 'Won', loss: 'Lost', push: 'Push', void: 'Void' };
const WAITING = { pre: ['open', 'Open'], in: ['live', 'Live'], post: ['grading', 'Grading'] };

/**
 * One pick as a ticket, with its receipt: when it was locked and how far
 * ahead of the game. `mine` (the owner's own view) adds "to win" and a
 * countdown; `who` shows the player's name; `actions` adds owner-only buttons.
 */
export function pickItem(p, { who = false, actions = null, mine = false, now = null } = {}) {
  const g = p.game;
  const status = gameStatus(g, p.result, now);
  const [kind, label] = p.result ? [p.result, RESULT[p.result]] : WAITING[g.state] ?? WAITING.pre;
  const won = p.result === 'win' || p.result === 'loss' ? formatUnits(p.profit, { sign: true }) : null;
  const pl = won ? html` <span class="pl">${minus(won)}</span>` : '';
  const stake = mine ? `${formatUnits(p.units)}${p.result ? '' : ` to win ${formatUnits(toWin(p.odds, p.units))}`}` : formatUnits(p.units);
  return html`<li class="ticket">
    <div class="sel">${who ? html`${avatar({ screen_name: p.screenName, photo: p.photo }, 'xs')}${playerName(p)} · ` : ''}${p.lock ? lockTag : ''}${p.streakDay ? streakTag : ''}${selection(p.market, p.side, p.line, g)}<span class="odds">${minus(formatOdds(p.odds))}</span>${mine ? '' : html`<span class="units">${stake}</span>`}</div>
    <div class="status ${kind}">${label}${pl}</div>
    ${mine || actions ? html`<div class="stake">${mine ? stake : ''}</div>` : ''}
    ${actions ? html`<div class="act">${actions}</div>` : ''}
    <div class="meta">${SPORT[g.sport]?.short} · ${g.away.short} @ ${g.home.short} · ${status}${clvTag(p)}</div>
    <div class="receipt">${icons.lock}<span>Locked ${at(p.madeAt, 'long')}, ${lead(p.madeAt, g.start)} before the game</span></div>
  </li>`;
}

/** "CLV +1.0" or "CLV +2.3%": green when the pick beat the close, red when it didn't. Only once the close is known. */
export function clvTag(p) {
  if (p.result === 'void') return '';
  const label = clvLabel(p);
  if (!label) return '';
  const v = clvValue(p);
  const parts = [p.clvPoints != null && p.market !== 'ml' ? `${p.clvPoints > 0 ? '+' : ''}${p.clvPoints} points` : null, p.clvPct != null ? `${p.clvPct > 0 ? '+' : ''}${p.clvPct}% on the price` : null].filter(Boolean);
  return html` <span class="clv ${v > 0 ? 'up' : v < 0 ? 'down' : ''}" title="Closing line value: ${parts.join(', ')}">${label}</span>`;
}

/** Where a game stands for a bet on it: the final score, a countdown, or the live score. */
function gameStatus(g, result, now) {
  const score = g.home.score != null ? `${g.away.abbr} ${g.away.score}, ${g.home.abbr} ${g.home.score}` : null;
  const soon = now && new Date(g.start) - now < 48 * 3_600_000;
  return result
    ? score ?? (result === 'void' ? g.detail || 'Called off' : '')
    : g.state === 'pre'
      ? soon ? `Starts in ${lead(now, g.start)}` : html`Starts ${at(g.start, 'long')}`
      : `${g.detail}${score ? ` · ${score}` : ''}`;
}

const LEG_MARK = { win: ['✓', 'Won'], loss: ['✗', 'Lost'], push: ['Push', 'Push'], void: ['Void', 'Void'] };

/**
 * A parlay as a ticket: a PARLAY tag, its legs and the combined price, then
 * each leg with how it went (✓, ✗ or push). Takes the same options as pickItem.
 */
export function parlayItem(p, { who = false, actions = null, mine = false, now = null } = {}) {
  const started = p.legs.some((l) => l.game.state !== 'pre' || (now && new Date(l.game.start) <= now));
  const waiting = p.legs.every((l) => l.result || l.game.state === 'post') ? WAITING.post : WAITING.in;
  const [kind, label] = p.result ? [p.result, RESULT[p.result]] : started ? waiting : WAITING.pre;
  const won = p.result === 'win' || p.result === 'loss' ? formatUnits(p.profit, { sign: true }) : null;
  const pl = won ? html` <span class="pl">${minus(won)}</span>` : '';
  const toWinNow = parlayToWin(parlayPrice(p.legs).decimal, p.units);
  const stake = mine ? `${formatUnits(p.units)}${p.result ? '' : ` to win ${formatUnits(toWinNow)}`}` : formatUnits(p.units);
  return html`<li class="ticket parlay">
    <div class="sel">${who ? html`${avatar({ screen_name: p.screenName, photo: p.photo }, 'xs')}${playerName(p)} · ` : ''}<span class="parlay-tag">Parlay</span>${p.legs.length} legs<span class="odds">${minus(formatOdds(p.odds))}</span>${mine ? '' : html`<span class="units">${stake}</span>`}</div>
    <div class="status ${kind}">${label}${pl}</div>
    ${mine || actions ? html`<div class="stake">${mine ? stake : ''}</div>` : ''}
    ${actions ? html`<div class="act">${actions}</div>` : ''}
    <ol class="legs">${p.legs.map((l) => {
      const [mark, says] = LEG_MARK[l.result] ?? ['', 'Open'];
      return html`<li class="leg leg-${l.result ?? 'open'}">
        <span class="mark" aria-label="${says}">${mark}</span>
        <span class="leg-sel">${selection(l.market, l.side, l.line, l.game)}<span class="odds">${minus(formatOdds(l.odds))}</span></span>
        <span class="leg-meta">${SPORT[l.game.sport]?.short} · ${l.game.away.short} @ ${l.game.home.short} · ${gameStatus(l.game, l.result, now)}</span>
      </li>`;
    })}</ol>
    <div class="receipt">${icons.lock}<span>Locked ${at(p.madeAt, 'long')}, ${lead(p.madeAt, p.firstStart)} before the first game</span></div>
  </li>`;
}

/** A straight pick or a parlay, whichever this bet is. */
export function betItem(bet, options) {
  return bet.kind === 'parlay' ? parlayItem(bet, options) : pickItem(bet, options);
}

/**
 * A chat thread (a game's or a group's): the messages, and the box to post
 * one for players with a confirmed email. app.js refreshes `.chat[data-poll]`
 * every 15 seconds. `tags` adds chips beside a name (picks on a game);
 * `canDelete` says who may delete a message (its author, or a group's owner).
 */
export function chatBox(ctx, { messages, action, placeholder, rules, tags = () => [], canDelete = (m) => m.user_id === ctx.user.id }) {
  return html`<div class="chat" data-poll>
    <ol class="chat-list">
      ${messages.length
        ? messages.map((m) => chatMessage(ctx, m, tags(m), canDelete(m)))
        : html`<li class="chat-empty">No messages yet. Start it off.</li>`}
    </ol>
    ${ctx.user.verified
      ? html`<form class="chat-form" method="post" action="${action}">
          ${csrfField(ctx)}
          <label class="sr-only" for="chat-body">Message</label>
          <textarea id="chat-body" name="body" rows="2" maxlength="280" required placeholder="${placeholder}"></textarea>
          <button class="btn">Send</button>
        </form>
        <p class="fine">${rules}</p>`
      : html`<p class="muted">Confirm your email to join the chat. The link is in your inbox.</p>`}
  </div>`;
}

function chatMessage(ctx, m, tags, canDelete) {
  const own = m.user_id === ctx.user.id;
  const remove = html`<form method="post" action="/chat/${m.id}/delete" data-confirm="Delete this message?">${csrfField(ctx)}<button class="link-btn">Delete</button></form>`;
  const report = html`<form method="post" action="/chat/${m.id}/report" data-confirm="Report this message?">${csrfField(ctx)}<button class="link-btn">Report</button></form>`;
  return html`<li class="msg ${own ? 'own' : ''}" data-id="${m.id}${m.hidden ? 'h' : ''}">
    <div class="msg-head">
      ${avatar(m, 'xs')}${playerName(m)}
      ${tags}
      <time datetime="${m.created_at}" data-local="long">${when(m.created_at)}</time>
      <span class="msg-act">${own ? remove : html`${canDelete ? remove : ''}${report}`}</span>
    </div>
    ${m.hidden ? html`<p class="msg-body hidden-msg">Hidden after reports.</p>` : html`<p class="msg-body">${m.body}</p>`}
  </li>`;
}

/** 1 -> "1st", 2 -> "2nd", 3 -> "3rd". */
export const placeWord = (n) => ({ 1: '1st', 2: '2nd', 3: '3rd' })[n] ?? `${n}th`;

/**
 * Share for a player's own top-3 finish (a tournament or a weekly contest):
 * app.js draws a square card from these on a canvas, the way the profile's
 * Share as image does, and hands it to the share sheet or saves it. Hidden
 * until the script shows it, so it never shows where it can't work.
 */
export function winShare(ctx, { place, title, units: u, record, players, date, path }) {
  return html`<button class="btn small win-share" type="button" hidden data-share-win
    data-place="${placeWord(place)}" data-title="${title}" data-units="${u}" data-record="${record}"
    data-players="${players ?? ''}" data-date="${date}" data-url="${`${ctx.origin}${path}`.replace(/^https?:\/\//, '')}"
    data-name="${ctx.user?.screenName ?? ''}" data-photo="${ctx.user?.photo ? `/media/${ctx.user.photo}` : ''}">${icons.download}<span>Share</span></button>`;
}
