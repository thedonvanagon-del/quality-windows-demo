import { html } from '../html.js';
import { formatOdds, formatUnits, selection } from '../picks.js';
import { SPORT, SPORTS } from '../sports.js';
import { PERIODS } from '../stats.js';
import { kickoff, when } from '../time.js';
import { icons } from './icons.js';

/** A time in Eastern from the server; app.js swaps in the viewer's zone. */
export function at(iso, style = 'short') {
  return html`<time datetime="${iso}" data-local="${style}">${style === 'long' ? when(iso) : kickoff(iso)}</time>`;
}

export function profileLink(name) {
  return html`<a class="who" href="/u/${encodeURIComponent(name)}">${name}</a>`;
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

export function boardTable(rows, { me } = {}) {
  if (!rows.length) return html`<div class="card empty">No graded picks here yet. Results show up once games go final.</div>`;
  return html`<div class="table"><table>
    <thead><tr><th>#</th><th>Player</th><th class="n">Record</th><th class="n hide-sm">Win</th><th class="n">Units</th><th class="n hide-sm">ROI</th></tr></thead>
    <tbody>
      ${rows.map((r, i) => html`<tr class="${r.id === me ? 'me' : ''}">
        <td class="rank"><span class="rk">${i + 1}</span></td>
        <td><span class="player"><span class="avatar">${r.screen_name[0]}</span>${profileLink(r.screen_name)}</span></td>
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
 * ahead of the game. `who` shows the player's name (feeds); `actions` adds
 * owner-only buttons.
 */
export function pickItem(p, { who = false, actions = null } = {}) {
  const g = p.game;
  const score = g.home.score != null ? `${g.away.abbr} ${g.away.score}, ${g.home.abbr} ${g.home.score}` : null;
  const status = p.result
    ? score ?? (p.result === 'void' ? g.detail || 'Called off' : '')
    : g.state === 'pre'
      ? html`Starts ${at(g.start, 'long')}`
      : `${g.detail}${score ? ` · ${score}` : ''}`;
  const [kind, label] = p.result ? [p.result, RESULT[p.result]] : WAITING[g.state] ?? WAITING.pre;
  const pl = p.result === 'win' || p.result === 'loss' ? html` <span class="pl">${minus(formatUnits(p.profit, { sign: true }))}</span>` : '';
  return html`<li class="ticket">
    <div class="sel">${who ? html`${profileLink(p.screenName)} · ` : ''}${selection(p.market, p.side, p.line, g)}<span class="odds">${minus(formatOdds(p.odds))}</span><span class="units">${formatUnits(p.units)}</span></div>
    <div class="status ${kind}">${label}${pl}</div>
    <div class="meta">${SPORT[g.sport]?.short} · ${g.away.short} @ ${g.home.short} · ${status}</div>
    <div class="receipt">${icons.lock}<span>Locked ${at(p.madeAt, 'long')}, ${lead(p.madeAt, g.start)} before the game</span></div>
    ${actions ? html`<div class="act">${actions}</div>` : ''}
  </li>`;
}
