import { html } from '../html.js';
import { formatOdds, formatUnits, selection } from '../picks.js';
import { SPORT, SPORTS } from '../sports.js';
import { PERIODS } from '../stats.js';
import { kickoff, when } from '../time.js';

/** A time in Eastern from the server; app.js swaps in the viewer's zone. */
export function at(iso, style = 'short') {
  return html`<time datetime="${iso}" data-local="${style}">${style === 'long' ? when(iso) : kickoff(iso)}</time>`;
}

export function profileLink(name) {
  return html`<a class="who" href="/u/${encodeURIComponent(name)}">${name}</a>`;
}

/** Tabs that keep the rest of the query string. */
export function tabs(base, query, key, options) {
  return html`<nav class="tabs" aria-label="${key}">
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
  return tabs(base, query, 'period', PERIODS.map((p) => [p.key === 'all' ? '' : p.key, p.label]));
}

export function units(n) {
  return html`<span class="${n > 0 ? 'win' : n < 0 ? 'loss' : 'push'}">${formatUnits(n, { sign: true })}</span>`;
}

export function pct(n) {
  return n == null ? '–' : `${Math.round(n * 1000) / 10}%`;
}

export function signedPct(n) {
  if (n == null) return '–';
  const v = Math.round(n * 1000) / 10;
  return `${v > 0 ? '+' : ''}${v}%`;
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

export function boardTable(rows, { me } = {}) {
  if (!rows.length) return html`<div class="card empty">No graded picks here yet. Results show up once games go final.</div>`;
  return html`<div class="card table-wrap"><table>
    <thead><tr><th>#</th><th>Player</th><th class="n">Record</th><th class="n hide-sm">Win</th><th class="n">Units</th><th class="n hide-sm">ROI</th></tr></thead>
    <tbody>
      ${rows.map((r, i) => html`<tr class="${r.id === me ? 'me' : ''}">
        <td class="rank">${i + 1}</td>
        <td>${profileLink(r.screen_name)}</td>
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

const RESULT = { win: 'W', loss: 'L', push: 'Push', void: 'Void' };

/**
 * One pick with its receipt: when it was locked and when the game started.
 * `who` shows the player's name (feeds); `actions` adds owner-only buttons.
 */
export function pickItem(p, { who = false, actions = null } = {}) {
  const g = p.game;
  const score = g.home.score != null ? `${g.away.abbr} ${g.away.score}, ${g.home.abbr} ${g.home.score}` : null;
  const status = p.result
    ? score ?? (p.result === 'void' ? g.detail || 'Called off' : '')
    : g.state === 'pre'
      ? html`Starts ${at(g.start)}`
      : `${g.detail}${score ? ` · ${score}` : ''}`;
  return html`<li class="pick">
    <div class="sel">${who ? html`${profileLink(p.screenName)} · ` : ''}${selection(p.market, p.side, p.line, g)}<span class="odds">${formatOdds(p.odds)}</span><span class="units">${formatUnits(p.units)}</span></div>
    <div class="res ${p.result ?? 'pending'}">
      ${p.result ? html`${RESULT[p.result]}<small>${formatUnits(p.profit, { sign: true })}</small>` : html`<small>${{ pre: 'Pending', in: 'Live', post: 'Grading' }[g.state]}</small>`}
    </div>
    <div class="meta">${SPORT[g.sport]?.short} · ${g.away.short} @ ${g.home.short} · ${status}</div>
    <div class="receipt">Locked ${at(p.madeAt, 'long')}, ${lead(p.madeAt, g.start)} before the game</div>
    ${actions ? html`<div class="act">${actions}</div>` : ''}
  </li>`;
}
