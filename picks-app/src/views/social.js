import { html } from '../html.js';
import { SPORT, SPORTS } from '../sports.js';
import { joined } from '../time.js';
import { csrfField, layout } from './layout.js';
import { boardTable, periodTabs, pct, pickItem, profileLink, recordText, signedPct, sportTabs, statStrip, units } from './parts.js';

export function leaderboard(ctx, { rows, sport }) {
  return layout(ctx, {
    title: sport ? `${sport.name} leaderboard` : 'Leaderboard',
    active: 'board',
    body: html`
      <h1>${sport ? `${sport.name} leaderboard` : 'Leaderboard'}</h1>
      <p class="lede">Ranked by units won. Every graded pick counts, losses included.</p>
      ${sportTabs('/leaderboard', ctx.query)}
      ${periodTabs('/leaderboard', ctx.query)}
      ${boardTable(rows, { me: ctx.user?.id })}
    `,
  });
}

const sportName = (key) => (key ? SPORT[key]?.name ?? key : 'All sports');

export function groups(ctx, { list, error, name = '', sport = '' }) {
  return layout(ctx, {
    title: 'Groups',
    active: 'groups',
    body: html`
      <h1>Groups</h1>
      <p class="lede">Your friends, your board. Your picks and record are the same everywhere; a group just decides who you're up against.</p>
      ${error ? html`<div class="flash err" role="alert">${error}</div>` : ''}
      ${list.length
        ? html`<div class="card table-wrap"><table>
            <thead><tr><th>Group</th><th>Sport</th><th class="n">Members</th></tr></thead>
            <tbody>${list.map((g) => html`<tr><td><a class="who" href="/groups/${g.id}">${g.name}</a></td><td>${sportName(g.sport)}</td><td class="n">${g.members}</td></tr>`)}</tbody>
          </table></div>`
        : html`<div class="card empty">You're not in any groups yet. Start one, or join with a code from a friend.</div>`}
      <h2>Start a group</h2>
      <form class="form" method="post" action="/groups">
        ${csrfField(ctx)}
        <label>Name<input type="text" name="name" value="${name}" required minlength="2" maxlength="40" placeholder="Saturday Crew"></label>
        <label>Sport <span class="hint">Pick one to only count that sport's picks.</span>
          <select name="sport">
            <option value="">All sports</option>
            ${SPORTS.map((s) => html`<option value="${s.key}" ${s.key === sport ? 'selected' : ''}>${s.name}</option>`)}
          </select>
        </label>
        <button class="btn">Create group</button>
      </form>
      <h2>Join a group</h2>
      <form class="form" method="post" action="/groups/join">
        ${csrfField(ctx)}
        <label>Invite code<input type="text" name="code" required maxlength="20" autocapitalize="characters" autocomplete="off" spellcheck="false"></label>
        <button class="btn quiet">Join</button>
      </form>
    `,
  });
}

export function group(ctx, { group, rows, members, feed, inviteUrl }) {
  const isOwner = group.owner_id === ctx.user.id;
  return layout(ctx, {
    title: group.name,
    active: 'groups',
    body: html`
      <p><a href="/groups">← Groups</a></p>
      <h1>${group.name}</h1>
      <p class="lede">${sportName(group.sport)} · ${members.length} ${members.length === 1 ? 'member' : 'members'}</p>
      ${periodTabs(`/groups/${group.id}`, ctx.query)}
      ${boardTable(rows, { me: ctx.user.id })}

      <h2>Latest picks</h2>
      ${feed.length
        ? html`<div class="card"><ul class="picks">${feed.map((p) => pickItem(p, { who: true }))}</ul></div>`
        : html`<div class="card empty">Picks show up here once their game starts.</div>`}

      <h2>Invite friends</h2>
      <div class="card stack">
        <div>Code <span class="code">${group.invite_code}</span></div>
        <div class="muted small copy">${inviteUrl}</div>
        <button class="btn quiet small" type="button" data-copy="${inviteUrl}" hidden>Copy invite link</button>
      </div>

      <h2>Members</h2>
      <div class="card"><ul class="picks">
        ${members.map((m) => html`<li class="pick"><div class="sel">${profileLink(m.screen_name)}</div><div class="res"><small class="muted">${m.id === group.owner_id ? 'Owner' : ''}</small></div></li>`)}
      </ul></div>

      <div class="row actions">
        <form method="post" action="/groups/${group.id}/leave" data-confirm="Leave ${group.name}?">${csrfField(ctx)}<button class="btn quiet">Leave group</button></form>
        ${isOwner
          ? html`<form method="post" action="/groups/${group.id}/delete" data-confirm="Delete ${group.name} for everyone? Picks stay on each player's record.">${csrfField(ctx)}<button class="btn danger">Delete group</button></form>`
          : ''}
      </div>
    `,
  });
}

export function join(ctx, { group, members, already }) {
  return layout(ctx, {
    title: `Join ${group.name}`,
    active: 'groups',
    body: html`
      <div class="card slip stack">
        <h1>Join ${group.name}?</h1>
        <p class="muted">${sportName(group.sport)} · ${members} ${members === 1 ? 'member' : 'members'}</p>
        ${already
          ? html`<a class="btn" href="/groups/${group.id}">You're in. Open the group</a>`
          : html`<form method="post" action="/join/${group.invite_code}">${csrfField(ctx)}<button class="btn">Join group</button></form>`}
      </div>
    `,
  });
}

export function profile(ctx, { player, record, bySport, picks, hidden }) {
  return layout(ctx, {
    title: player.screen_name,
    active: ctx.user?.id === player.id ? 'me' : null,
    description: `${player.screen_name}: ${recordText(record)}, ${record.units > 0 ? '+' : ''}${record.units} units. Every pick locked before the game and graded off the final.`,
    body: html`
      <h1>${player.screen_name}</h1>
      <p class="lede">On the record since ${joined(player.created_at)}. ${record.graded} graded ${record.graded === 1 ? 'pick' : 'picks'}, every one locked before its game.</p>
      ${statStrip(record)}
      ${bySport.length
        ? html`<h2>By sport</h2>
          <div class="card table-wrap"><table>
            <thead><tr><th>Sport</th><th class="n">Record</th><th class="n hide-sm">Win</th><th class="n">Units</th><th class="n hide-sm">ROI</th></tr></thead>
            <tbody>${bySport.map((r) => html`<tr>
              <td><a class="who" href="/leaderboard?sport=${r.sport}">${SPORT[r.sport]?.name ?? r.sport}</a></td>
              <td class="n">${recordText(r)}</td><td class="n hide-sm">${pct(r.winPct)}</td>
              <td class="n"><b>${units(r.units)}</b></td><td class="n hide-sm">${signedPct(r.roi)}</td>
            </tr>`)}</tbody>
          </table></div>`
        : ''}
      <h2>Picks</h2>
      ${hidden ? html`<p class="muted">${hidden} open ${hidden === 1 ? 'pick' : 'picks'}, shown once the game starts.</p>` : ''}
      ${picks.length
        ? html`<div class="card"><ul class="picks">${picks.map((p) => pickItem(p))}</ul></div>`
        : html`<div class="card empty">No picks on the record yet.</div>`}
    `,
  });
}
