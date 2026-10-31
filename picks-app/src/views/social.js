import { html } from '../html.js';
import { formatUnits } from '../picks.js';
import { SPORT, SPORTS } from '../sports.js';
import { MIN_RANKED } from '../stats.js';
import { joined } from '../time.js';
import { trustMark } from './icons.js';
import { csrfField, layout } from './layout.js';
import { boardTable, periodTabs, pct, pickItem, profileLink, recordText, signedPct, sportTabs, units } from './parts.js';

export function leaderboard(ctx, { rows, sport }) {
  return layout(ctx, {
    title: sport ? `${sport.name} leaderboard` : 'Leaderboard',
    active: 'board',
    body: html`
      <h1>${sport ? `${sport.name} leaderboard` : 'Leaderboard'}</h1>
      <p class="lede">Ranked by units won, not win rate, so betting only big favorites doesn't pay. Every graded pick counts, losses included. You need ${MIN_RANKED} graded picks in the window for a rank.</p>
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
        ? html`<div class="table"><table>
            <thead><tr><th>Group</th><th>Sport</th><th class="n">Members</th></tr></thead>
            <tbody>${list.map((g) => html`<tr><td><a class="who" href="/groups/${g.id}">${g.name}</a></td><td>${sportName(g.sport)}</td><td class="n">${g.members}</td></tr>`)}</tbody>
          </table></div>`
        : html`<div class="card empty">You're not in any groups yet. Start one, or join with a code from a friend.</div>`}
      <div class="forms">
        <div class="card">
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
            <button class="btn block">Create group</button>
          </form>
        </div>
        <div class="card">
          <h2>Join a group</h2>
          <form class="form" method="post" action="/groups/join">
            ${csrfField(ctx)}
            <label>Invite code<input type="text" name="code" required maxlength="20" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="From a friend"></label>
            <button class="btn ghost block">Join</button>
          </form>
        </div>
      </div>
    `,
  });
}

export function group(ctx, { group, rows, members, feed, inviteUrl }) {
  const isOwner = group.owner_id === ctx.user.id;
  return layout(ctx, {
    title: group.name,
    active: 'groups',
    body: html`
      <a class="back" href="/groups">← Groups</a>
      <h1>${group.name}</h1>
      <p class="lede">${sportName(group.sport)} · ${members.length} ${members.length === 1 ? 'member' : 'members'}</p>
      ${periodTabs(`/groups/${group.id}`, ctx.query)}
      ${boardTable(rows, { me: ctx.user.id })}

      <h2>Latest picks</h2>
      ${feed.length
        ? html`<ul class="tickets">${feed.map((p) => pickItem(p, { who: true }))}</ul>`
        : html`<div class="card empty">Picks show up here once their game starts.</div>`}

      <h2>Invite friends</h2>
      <div class="card stack">
        <div>Code <span class="code">${group.invite_code}</span></div>
        <div class="muted small copy">${inviteUrl}</div>
        <button class="btn quiet small" type="button" data-copy="${inviteUrl}" hidden>Copy invite link</button>
      </div>

      <h2>Members</h2>
      <div class="card"><ul class="members">
        ${members.map((m) => html`<li><span class="player"><span class="avatar">${m.screen_name[0]}</span>${profileLink(m.screen_name)}</span><span class="muted small">${m.id === group.owner_id ? 'Owner' : ''}</span></li>`)}
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
      <div class="auth">
        <h1>Join ${group.name}?</h1>
        <p class="lede">${sportName(group.sport)} · ${members} ${members === 1 ? 'member' : 'members'}</p>
        ${already
          ? html`<a class="btn block" href="/groups/${group.id}">You're in. Open the group</a>`
          : html`<form method="post" action="/join/${group.invite_code}">${csrfField(ctx)}<button class="btn block">Join group</button></form>`}
      </div>
    `,
  });
}

/** A short line about yourself, on your profile for anyone to read. */
function bioForm(ctx, player) {
  return html`<h2>Your bio</h2>
    <form class="bio-form" method="post" action="/bio">
      ${csrfField(ctx)}
      <textarea name="bio" rows="3" maxlength="160" placeholder="What you bet, how you bet, where people can find you." aria-label="Your bio">${player.bio ?? ''}</textarea>
      <div class="row"><button class="btn small">Save bio</button><span class="muted small">Up to 160 characters. Everyone can see it.</span></div>
    </form>`;
}

/** The headline a shared profile link shows: name, record, units. */
function shareCard(player, record) {
  const u = `${record.units > 0 ? '+' : ''}${record.units}u`;
  return {
    title: record.graded ? `${player.screen_name} · ${recordText(record)} · ${u}` : `${player.screen_name} on Bookie Bullies`,
    description: record.graded
      ? `${record.graded} graded ${record.graded === 1 ? 'pick' : 'picks'}, ${pct(record.winPct)} winners, ${signedPct(record.roi)} ROI. Every pick locked before the game and graded off the final score. No edits.`
      : 'A Bookie Bullies record: every pick locked before the game and graded off the final score. No edits.',
  };
}

/** First and last name, both optional. */
function nameForm(ctx, player) {
  return html`<h2>Your name</h2>
    <form class="form name-form" method="post" action="/name">
      ${csrfField(ctx)}
      <div class="pair">
        <label>First name <span class="hint">Optional</span>
          <input type="text" name="first_name" value="${player.first_name ?? ''}" autocomplete="given-name" maxlength="40"></label>
        <label>Last name <span class="hint">Optional</span>
          <input type="text" name="last_name" value="${player.last_name ?? ''}" autocomplete="family-name" maxlength="40"></label>
      </div>
      <div class="row"><button class="btn small">Save name</button><span class="muted small">Shows on your profile. Leave both blank to hide it.</span></div>
    </form>`;
}

/** Account deletion, behind the password. */
function deleteForm(ctx) {
  return html`<details class="danger-zone">
      <summary>Delete account</summary>
      <form class="form" method="post" action="/account/delete" data-confirm="Delete your account and every pick on it? This can't be undone.">
        ${csrfField(ctx)}
        <p class="muted small">This deletes your account, your record and every pick. It can't be undone.</p>
        <label>Your password<input type="password" name="password" autocomplete="current-password" required maxlength="200"></label>
        <button class="btn danger">Delete my account</button>
      </form>
    </details>`;
}

/** One button on the profile to wherever the player sells picks or posts. */
function linkForm(ctx, player) {
  return html`<h2>Your link</h2>
    <form class="form link-form" method="post" action="/link">
      ${csrfField(ctx)}
      <label>Link <span class="hint">Where people can follow you or buy your picks: Telegram, Instagram, X, Discord, a website.</span>
        <input type="text" name="link_url" value="${player.link_url ?? ''}" inputmode="url" autocomplete="url" placeholder="https://t.me/yourname" maxlength="200"></label>
      <label>Button label <span class="hint">Optional. Leave it blank and we'll name the site.</span>
        <input type="text" name="link_label" value="${player.link_label ?? ''}" maxlength="30" placeholder="Get my picks"></label>
      <div class="row"><button class="btn small">Save link</button><span class="muted small">Clear the link and save to remove the button.</span></div>
    </form>`;
}

const BREAKDOWN_LABELS = {
  market: { spread: 'Spreads', total: 'Totals', ml: 'Moneylines' },
  role: { fav: 'Favorites', dog: 'Underdogs' },
  venue: { home: 'Home teams', away: 'Road teams' },
};

/** Where a player wins: bet type, favorite or dog, home or road. */
function breakdownTable(split) {
  const rows = ['market', 'role', 'venue'].flatMap((group) =>
    Object.entries(BREAKDOWN_LABELS[group])
      .map(([key, label]) => ({ label, group, ...(split[group].find((r) => r.key === key) ?? null) }))
      .filter((r) => r.graded),
  );
  if (!rows.length) return '';
  return html`<h2>Breakdown</h2>
    <div class="table"><table class="breakdown">
      <thead><tr><th>Bets on</th><th class="n">Record</th><th class="n hide-sm">Win</th><th class="n">Units</th><th class="n">ROI</th></tr></thead>
      <tbody>${rows.map((r, i) => html`<tr class="${i && rows[i - 1].group !== r.group ? 'group-start' : ''}">
        <td>${r.label}</td><td class="n">${recordText(r)}</td><td class="n hide-sm">${pct(r.winPct)}</td>
        <td class="n"><b>${units(r.units)}</b></td><td class="n">${signedPct(r.roi)}</td>
      </tr>`)}</tbody>
    </table></div>`;
}

/** Follow or unfollow; `next` brings the player back where they pressed it. */
export function followButton(ctx, name, following, next = '') {
  const path = `/u/${encodeURIComponent(name)}/${following ? 'unfollow' : 'follow'}`;
  return html`<form method="post" action="${path}" class="follow-form">${csrfField(ctx)}${next ? html`<input type="hidden" name="next" value="${next}">` : ''}<button class="btn small ${following ? 'ghost' : ''}">${following ? 'Following' : 'Follow'}</button></form>`;
}

/** The best last-ten records right now, with a Follow button on each. */
export function hot(ctx, { rows, followed }) {
  const me = ctx.user?.screenName ? ctx.user.id : null;
  return layout(ctx, {
    title: 'Hot streaks',
    active: 'more',
    description: "Who's hot on Bookie Bullies: the best last ten picks over the past 30 days.",
    body: html`
      <a class="back" href="/more">← More</a>
      <h1>Hot streaks</h1>
      <p class="lede">The best last ten picks over the past 30 days, by units won. Players need ten graded picks in that time to show up.</p>
      ${rows.length
        ? html`<div class="table"><table class="hot">
            <thead><tr><th>#</th><th>Player</th><th class="n">Last 10</th><th class="n">Units</th><th class="n">Streak</th>${me ? html`<th class="n"><span class="sr-only">Follow</span></th>` : ''}</tr></thead>
            <tbody>${rows.map((r, i) => html`<tr class="${r.id === me ? 'me' : ''}">
              <td class="rank"><span class="rk">${i + 1}</span></td>
              <td>${profileLink(r.screen_name)}</td>
              <td class="n">${recordText(r)}</td>
              <td class="n"><b>${units(r.units)}</b></td>
              <td class="n"><span class="streak ${r.streak.startsWith('W') ? 'hot' : ''}">${r.streak}</span></td>
              ${me ? html`<td class="n">${r.id === me ? '' : followButton(ctx, r.screen_name, followed.has(r.id), '/hot')}</td>` : ''}
            </tr>`)}</tbody>
          </table></div>`
        : html`<div class="card empty">Nobody's hot yet. Players show up once they have ten graded picks in 30 days and are up on them.</div>`}
    `,
  });
}

/** Picks from the people the player follows, once each game starts. */
export function following(ctx, { feed, people }) {
  return layout(ctx, {
    title: 'Following',
    active: 'more',
    body: html`
      <a class="back" href="/more">← More</a>
      <h1>Following</h1>
      <p class="lede">Picks from the players you follow, as each game starts. Open picks stay hidden until then, same as everywhere.</p>
      ${people.length
        ? html`<p class="chips-row">${people.map((p) => html`<a class="chip" href="/u/${encodeURIComponent(p.screen_name)}">${p.screen_name}</a>`)}</p>`
        : html`<div class="card empty">You're not following anyone yet. Find players on the <a href="/hot">Hot streaks</a> page or the <a href="/leaderboard">leaderboard</a>, then press Follow on their profile.</div>`}
      ${feed.length ? html`<ul class="tickets">${feed.map((p) => pickItem(p, { who: true }))}</ul>` : people.length ? html`<div class="card empty">No started picks from them yet.</div>` : ''}
    `,
  });
}

/**
 * The record up top, built to be screenshotted: record, units, a 30-day units
 * line, win rate, ROI, last ten and rank. Its data attributes feed the
 * "Share as image" button, which draws the same card as a picture.
 */
function recordCard(ctx, { player, record, series, last10, rank }) {
  const last = last10?.graded ? recordText(last10) : '–';
  const url = `${ctx.origin}/u/${encodeURIComponent(player.screen_name)}`;
  return html`<section class="record-card" aria-label="Record"
      data-name="${player.screen_name}" data-record="${recordText(record)}" data-units="${record.units}"
      data-win="${pct(record.winPct)}" data-roi="${signedPct(record.roi)}" data-last10="${last}"
      data-rank="${rank ? `#${rank}` : ''}" data-series="${series.join(',')}" data-url="${url.replace(/^https?:\/\//, '')}">
    <div class="rc-top">
      <span class="trust-small">${trustMark}<span>Trust Your Bets</span></span>
      ${rank ? html`<span class="rank-badge">#${rank} overall</span>` : html`<span class="rank-badge muted">Unranked: ${MIN_RANKED} picks for a rank</span>`}
    </div>
    <div class="rc-main">
      <div><span class="rc-label">Record</span><b class="rc-big">${recordText(record)}</b></div>
      <div class="rc-right"><span class="rc-label">Units</span><b class="rc-big">${units(record.units)}</b></div>
    </div>
    ${sparkline(series)}
    <div class="rc-stats">
      <div><span class="rc-label">Win</span><b>${pct(record.winPct)}</b></div>
      <div><span class="rc-label">ROI</span><b>${signedPct(record.roi)}</b></div>
      <div><span class="rc-label">Last 10</span><b>${last}</b></div>
      <div><span class="rc-label">Picks</span><b>${record.graded}</b></div>
    </div>
    <button class="btn ghost small rc-share" type="button" data-share-image hidden>Share as image</button>
  </section>`;
}

/** Units over the last 30 days as a line; flat when there's nothing yet. */
function sparkline(series) {
  if (series.length < 2) return '';
  const w = 300;
  const h = 64;
  const lo = Math.min(0, ...series);
  const hi = Math.max(0, ...series);
  const span = hi - lo || 1;
  const pts = series.map((v, i) => `${Math.round((i / (series.length - 1)) * w * 10) / 10},${Math.round((h - 4 - ((v - lo) / span) * (h - 8)) * 10) / 10}`);
  const zero = Math.round((h - 4 - ((0 - lo) / span) * (h - 8)) * 10) / 10;
  const end = series.at(-1);
  return html`<svg class="spark ${end > 0 ? 'up' : end < 0 ? 'down' : ''}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Units over the last 30 days, now ${formatUnits(end, { sign: true })}">
    <line x1="0" y1="${zero}" x2="${w}" y2="${zero}" class="spark-zero"></line>
    <polygon points="0,${zero} ${pts.join(' ')} ${w},${zero}" class="spark-fill"></polygon>
    <polyline points="${pts.join(' ')}" class="spark-line"></polyline>
  </svg>`;
}

const COLORS = { scoreboard: 'Scoreboard', market: 'Bull Market', ember: 'Ember' };

/** Three swatches; the player's pick colors the app on every device they use. */
function colorPicker(ctx) {
  const current = ctx.user.theme ?? ctx.app.theme;
  return html`<h2>App color</h2>
    <form class="swatches" method="post" action="/theme">
      ${csrfField(ctx)}
      ${Object.entries(COLORS).map(([key, label]) => html`<button name="theme" value="${key}" class="swatch ${key} ${key === current ? 'on' : ''}" ${key === current ? html`aria-pressed="true"` : html`aria-pressed="false"`}><span></span>${label}</button>`)}
    </form>`;
}

export function profile(ctx, { player, record, bySport, split = null, series = [], last10 = null, rank = null, follows = { followers: 0, following: 0 }, following = false, picks, hidden }) {
  return layout(ctx, {
    title: player.screen_name,
    active: ctx.user?.id === player.id ? 'me' : null,
    description: `${player.screen_name}: ${recordText(record)}, ${record.units > 0 ? '+' : ''}${record.units} units. Every pick locked before the game and graded off the final.`,
    share: shareCard(player, record),
    body: html`
      <div class="team"><span class="avatar big">${player.screen_name[0]}</span><h1>${player.screen_name}</h1></div>
      ${player.first_name || player.last_name ? html`<p class="real-name">${[player.first_name, player.last_name].filter(Boolean).join(' ')}</p>` : ''}
      ${player.bio ? html`<p class="bio">${player.bio}</p>` : ''}
      <p class="follow-counts"><b>${follows.followers}</b> ${follows.followers === 1 ? 'follower' : 'followers'} · <b>${follows.following}</b> following</p>
      <div class="row profile-actions">
        ${ctx.user?.screenName && ctx.user.id !== player.id ? followButton(ctx, player.screen_name, following) : ''}
        ${player.link_url ? html`<a class="btn small" href="${player.link_url}" target="_blank" rel="nofollow noopener noreferrer ugc">${player.link_label} ↗</a>` : ''}
        <button class="btn ghost small" type="button" data-share="${ctx.origin}/u/${encodeURIComponent(player.screen_name)}" data-share-text="${shareCard(player, record).title}" hidden>Share profile</button>
      </div>
      <p class="lede">On the record since ${joined(player.created_at)}. ${record.graded} graded ${record.graded === 1 ? 'pick' : 'picks'}, every one locked before its game.</p>
      ${recordCard(ctx, { player, record, series, last10, rank })}
      ${ctx.user?.id === player.id ? html`${nameForm(ctx, player)}${bioForm(ctx, player)}${linkForm(ctx, player)}${colorPicker(ctx)}` : ''}
      ${bySport.length
        ? html`<h2>By sport</h2>
          <div class="table"><table>
            <thead><tr><th>Sport</th><th class="n">Record</th><th class="n hide-sm">Win</th><th class="n">Units</th><th class="n hide-sm">ROI</th></tr></thead>
            <tbody>${bySport.map((r) => html`<tr>
              <td><a class="who" href="/leaderboard?sport=${r.sport}">${SPORT[r.sport]?.name ?? r.sport}</a></td>
              <td class="n">${recordText(r)}</td><td class="n hide-sm">${pct(r.winPct)}</td>
              <td class="n"><b>${units(r.units)}</b></td><td class="n hide-sm">${signedPct(r.roi)}</td>
            </tr>`)}</tbody>
          </table></div>`
        : ''}
      ${split ? breakdownTable(split) : ''}
      <h2>Picks</h2>
      ${hidden ? html`<p class="muted">${hidden} open ${hidden === 1 ? 'pick' : 'picks'}, shown once the game starts.</p>` : ''}
      ${picks.length
        ? html`<ul class="tickets">${picks.map((p) => pickItem(p))}</ul>`
        : html`<div class="card empty">No picks on the record yet.</div>`}
      ${ctx.user?.id === player.id ? deleteForm(ctx) : ''}
    `,
  });
}
