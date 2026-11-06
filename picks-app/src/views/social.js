import { groupLabel } from '../cities.js';
import { THEMES } from '../config.js';
import { html } from '../html.js';
import { CHANGE_EVERY_DAYS, HOLD_DAYS } from '../names.js';
import { formatUnits } from '../picks.js';
import { SPORT, SPORTS } from '../sports.js';
import { siteHost } from '../site.js';
import { MIN_RANKED } from '../stats.js';
import { bannerColors, PRESETS, sheetPath, teamAccent } from '../themes.js';
import { dateLabel, joined, when } from '../time.js';
import { icons, trustMark } from './icons.js';
import { csrfField, layout } from './layout.js';
import { citySelect, cityPin, groupsSection } from './local.js';
import { avatar, betItem, boardTable, chatBox, minus, nameIcon, officialTag, pickItem, periodTabs, pct, playerName, profileLink, rankCell, recordText, signedPct, sportTabs, tabs, teamLogo, units, winShare } from './parts.js';
import { endLabel } from '../tournaments.js';
import { card as tournamentCard } from './tournaments.js';
import { cupBanner } from './formats.js';

/** Find a player by the start of their screen name. */
function searchBox(q = '') {
  return html`<form class="search" method="get" action="/search" role="search">
    <input type="search" name="q" value="${q}" placeholder="Find a player" aria-label="Screen name" maxlength="20" autocapitalize="off" autocomplete="off" spellcheck="false">
    <button class="btn">Search</button>
  </form>`;
}

export function search(ctx, { q, rows }) {
  return layout(ctx, {
    title: 'Find players',
    active: 'board',
    body: html`
      <h1>Find players</h1>
      <p class="lede">Type the start of a screen name.</p>
      ${searchBox(q)}
      ${q ? boardTable(rows, { me: ctx.user?.id, ranks: false, empty: html`Nobody's name starts with “${q}”.` }) : ''}
    `,
  });
}

export function leaderboard(ctx, { rows, sport, badges = null, cup = null }) {
  return layout(ctx, {
    title: sport ? `${sport.name} leaderboard` : 'Leaderboard',
    active: 'board',
    body: html`
      <h1>${sport ? `${sport.name} leaderboard` : 'Leaderboard'}</h1>
      <p class="lede">Ranked by units won, not win rate, so betting only big favorites doesn't pay. Every graded pick counts, losses included. You need ${MIN_RANKED} graded picks in the window for a rank.</p>
      <a class="promo" href="/contest">${icons.board}<span><b>This week's contest</b><small>Free, everyone's in. Most units Monday to Sunday wins.</small></span><span class="go">${icons.chevron}</span></a>
      ${cup ? cupBanner(ctx, cup) : ''}
      ${searchBox()}
      ${sportTabs('/leaderboard', ctx.query)}
      ${periodTabs('/leaderboard', ctx.query)}
      ${boardTable(rows, { me: ctx.user?.id, badges })}
    `,
  });
}

const sportName = (key) => (key ? SPORT[key]?.name ?? key : 'All sports');

export function groups(ctx, { list, rooms = [], unread = new Map(), error, name = '', sport = '' }) {
  return layout(ctx, {
    title: 'Chat Rooms',
    active: 'groups',
    body: html`
      <h1>Chat Rooms</h1>
      <p class="lede">Your friends, your board. Your picks and record are the same everywhere; a group just decides who you're up against.</p>
      ${error ? html`<div class="flash err" role="alert">${error}</div>` : ''}
      ${groupsSection(ctx, { rooms, unread })}
      ${list.length
        ? html`<div class="table"><table>
            <thead><tr><th>Group</th><th>Sport</th><th class="n">Members</th></tr></thead>
            <tbody>${list.map((g) => html`<tr><td><a class="who" href="/groups/${g.id}">${g.name}</a>${unread.get(g.id) ? html` <a class="unread-count" href="/groups/${g.id}#chat">${unread.get(g.id)} new</a>` : ''}</td><td>${sportName(g.sport)}</td><td class="n">${g.members}</td></tr>`)}</tbody>
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

/**
 * A group's page: its board, chat, feed and members. A local room uses it
 * too, without the private-group parts (invite code, owner, delete): it says
 * "Local room" and its region instead, and admins can delete in its chat.
 */
export function group(ctx, { group, rows, members, feed, inviteUrl, messages = [], city = null, home = false, admin = false, tournaments = [] }) {
  const isLocal = group.kind === 'local';
  const isOwner = !isLocal && group.owner_id === ctx.user.id;
  const mod = isOwner || (isLocal && admin);
  const shown = isLocal ? members.slice(0, 60) : members;
  return layout(ctx, {
    title: group.name,
    active: 'groups',
    body: html`
      ${isLocal ? html`<a class="back" href="/local">← Local rooms</a>` : html`<a class="back" href="/groups">← Chat Rooms</a>`}
      <h1>${group.name}</h1>
      <p class="lede">${isLocal
        ? html`<span class="local-tag">${icons.pin}Local room</span>${city ? ` · ${groupLabel(city)}` : ''}`
        : sportName(group.sport)} · ${members.length} ${members.length === 1 ? 'member' : 'members'}</p>
      ${group.archived_at ? html`<div class="card empty">This room is archived. Its history stays, but nobody can post or join.</div>` : ''}
      ${isLocal && city && !group.archived_at
        ? home
          ? html`<p class="muted small">${cityPin({ city })} is your city.</p>`
          : html`<form method="post" action="/home-city" class="home-form">${csrfField(ctx)}<input type="hidden" name="city" value="${city.slug}"><input type="hidden" name="next" value="/groups/${group.id}"><button class="btn quiet small">${icons.pin} Make this my city</button></form>`
        : ''}
      ${isLocal ? html`<h2>Top bettors in ${city?.name ?? group.name}</h2>` : ''}
      ${periodTabs(`/groups/${group.id}`, ctx.query)}
      ${boardTable(rows, { me: ctx.user.id })}

      <h2 id="chat">Chat</h2>
      ${group.archived_at
        ? html`<div class="chat"><ol class="chat-list">${messages.map((m) => html`<li class="msg"><div class="msg-head">${playerName(m)}</div><p class="msg-body">${m.hidden ? 'Hidden after reports.' : m.body}</p></li>`)}</ol></div>`
        : chatBox(ctx, {
          messages,
          action: `/groups/${group.id}/chat`,
          placeholder: isLocal ? `Talk to ${city?.name ?? group.name}` : `Talk some trash to ${group.name}`,
          rules: isLocal
            ? `Everyone in the ${group.name} room sees this. Trash talk is fine; harassment, hate and selling picks aren't. Three reports hide a message${admin ? ', and as an admin you can delete any message here' : ''}.`
            : `Only members of ${group.name} see this. Trash talk is fine; harassment, hate and selling picks aren't. Three reports hide a message${isOwner ? ', and you can delete any message here' : ''}.`,
          canDelete: (m) => m.user_id === ctx.user.id || mod,
        })}

      <h2 id="tournaments">Tournaments</h2>
      ${tournaments.length
        ? html`<div class="tn-list">${tournaments.map((t) => tournamentCard(ctx, t, `/groups/${group.id}#tournaments`))}</div>`
        : html`<div class="card empty">None yet. Only members can join one made for ${isLocal ? 'this room' : 'this group'}.</div>`}
      ${group.archived_at ? '' : html`<p><a class="btn ghost small" href="/tournaments/new?group=${group.id}">Make one for ${isLocal ? 'this room' : 'this group'}</a></p>`}

      <h2>Latest picks</h2>
      ${feed.length
        ? html`<ul class="tickets">${feed.map((p) => betItem(p, { who: true }))}</ul>`
        : html`<div class="card empty">Picks show up here once their game starts.</div>`}

      ${isLocal
        ? ''
        : html`<h2>Invite friends</h2>
      <div class="card stack">
        <div>Code <span class="code">${group.invite_code}</span></div>
        <div class="muted small copy">${inviteUrl}</div>
        <button class="btn quiet small" type="button" data-copy="${inviteUrl}" hidden>Copy invite link</button>
      </div>`}

      <h2>Members</h2>
      <div class="card"><ul class="members">
        ${shown.map((m) => html`<li><span class="player">${avatar(m)}${playerName(m)}</span><span class="muted small">${!isLocal && m.id === group.owner_id ? 'Owner' : ''}</span></li>`)}
      </ul>${members.length > shown.length ? html`<p class="muted small">And ${members.length - shown.length} more.</p>` : ''}</div>

      <div class="row actions">
        <form method="post" action="/groups/${group.id}/leave" data-confirm="Leave ${group.name}?">${csrfField(ctx)}<button class="btn quiet">${isLocal ? 'Leave room' : 'Leave group'}</button></form>
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
    title: record.graded ? `${player.screen_name} · ${recordText(record)} · ${u}` : `${player.screen_name} on LockBox`,
    description: record.graded
      ? `${record.graded} graded ${record.graded === 1 ? 'pick' : 'picks'}, ${pct(record.winPct)} winners, ${signedPct(record.roi)} ROI. Every pick locked before the game and graded off the final score. No edits.`
      : 'A LockBox record: every pick locked before the game and graded off the final score. No edits.',
  };
}

/** A new screen name, once every 30 days. The old one keeps working as a link for 90. */
function screenNameForm(ctx, player, nextChange) {
  return html`<h2>Screen name</h2>
    ${nextChange
      ? html`<p class="muted small">You changed it recently. You can change it again ${html`<time datetime="${nextChange.toISOString()}" data-local="long">${when(nextChange.toISOString())}</time>`}.</p>`
      : html`<form class="form screen-name-form" method="post" action="/screen-name" data-confirm="Change your screen name? You can only do this once every ${CHANGE_EVERY_DAYS} days.">
          ${csrfField(ctx)}
          <label>New screen name <span class="hint">3 to 20 letters, numbers or underscores.</span>
            <input type="text" name="screen_name" value="" placeholder="${player.screen_name}" required minlength="3" maxlength="20" pattern="[A-Za-z0-9_]{3,20}" autocapitalize="off" spellcheck="false"></label>
          <div class="row"><button class="btn small">Change name</button><span class="muted small">Once every ${CHANGE_EVERY_DAYS} days. Links to your old name keep working for ${HOLD_DAYS} days.</span></div>
        </form>`}`;
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
    description: "Who's hot on LockBox: the best last ten picks over the past 30 days.",
    body: html`
      <a class="back" href="/more">← More</a>
      <h1>Hot streaks</h1>
      <p class="lede">The best last ten picks over the past 30 days, by units won. Players need ten graded picks in that time to show up.</p>
      ${rows.length
        ? html`<div class="table"><table class="hot">
            <thead><tr><th>#</th><th>Player</th><th class="n">Last 10</th><th class="n">Units</th><th class="n">Streak</th>${me ? html`<th class="n"><span class="sr-only">Follow</span></th>` : ''}</tr></thead>
            <tbody>${rows.map((r) => html`<tr class="${r.id === me ? 'me' : ''}">
              <td class="rank">${rankCell(r)}</td>
              <td><span class="player">${avatar(r)}${playerName(r)}</span></td>
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
        ? html`<p class="chips-row">${people.map((p) => html`<a class="chip face-chip" href="/u/${encodeURIComponent(p.screen_name)}">${avatar(p, 'xs')}<span class="${p.nameColor ? `name-c-${p.nameColor}` : ''}">${p.screen_name}</span>${nameIcon(p.nameIcon)}</a>`)}</p>`
        : html`<div class="card empty">You're not following anyone yet. Find players on the <a href="/hot">Hot streaks</a> page or the <a href="/leaderboard">leaderboard</a>, then press Follow on their profile.</div>`}
      ${feed.length ? html`<ul class="tickets">${feed.map((p) => betItem(p, { who: true }))}</ul>` : people.length ? html`<div class="card empty">No started picks from them yet.</div>` : ''}
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
      data-rank="${rank ? `#${rank}` : ''}" data-series="${series.join(',')}" data-url="${url.replace(/^https?:\/\//, '')}"
      data-photo="${player.photo ? `/media/${player.photo}` : ''}" data-site="${siteHost(ctx.app.site)}">
    <div class="rc-top">
      <span class="trust-small">${trustMark}<span>Trust Your Bets</span></span>
      ${rank
        ? html`<span class="rank-badge">#${rank} overall</span>`
        : player.official
          ? html`<span class="rank-badge muted">Official account: not ranked</span>`
          : html`<span class="rank-badge muted">Unranked: ${MIN_RANKED} picks for a rank</span>`}
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

/**
 * "Show Bookie Bullies picks on the board": the BB Pick chips, the Locks card
 * and the line on the LOCKED ticket. On by default.
 */
function sitePicksSetting(ctx) {
  return html`<h2 id="bb-picks">Bookie Bullies picks</h2>
    <form class="form prefs" method="post" action="/bb/settings">
      ${csrfField(ctx)}
      <label class="check"><input type="checkbox" name="show" ${ctx.user.showBb ? 'checked' : ''}><span>Show Bookie Bullies picks on the board</span></label>
      <p class="muted small">The model's picks from ${siteHost(ctx.app.site)}: a chip on each game it picked, today's Locks up top, and a link on your LOCKED ticket.</p>
      <button class="btn small">Save</button>
    </form>`;
}

/** A sample game card, drawn in whatever look its box carries, so the picker shows a choice before it's saved. */
function samplePreview(theme) {
  const row = (name, abbr, color, cells) => html`
    <span class="team"><svg class="stripe" viewBox="0 0 4 10" preserveAspectRatio="none" aria-hidden="true"><rect width="4" height="10" fill="${color}"></rect></svg><span class="logo">${abbr}</span><span class="tname"><span class="tn">${name}</span></span></span>
    ${cells}`;
  return html`<div class="theme-preview" data-theme="${theme}" data-preview aria-hidden="true">
    <div class="event">
      <div class="board">
        <span class="when">Sun 1:00 PM</span><span class="colhead">Spread</span><span class="colhead">Total</span><span class="colhead">Money</span>
        ${row('Bills', 'BUF', '#00338d', html`<span class="cell">+3.5<small>−110</small></span><span class="cell">O 47.5<small>−110</small></span><span class="cell price">+150</span>`)}
        ${row('Chiefs', 'KC', '#e31837', html`<span class="cell mine">−3.5<small>−110</small></span><span class="cell">U 47.5<small>−110</small></span><span class="cell price">−170</span>`)}
      </div>
    </div>
    <div class="tp-foot"><span class="btn small">Lock it in</span><span class="status win">Won +1.82u</span><span class="status loss">Lost −1u</span></div>
  </div>`;
}

/** Dark or light background, for a team or custom look. */
function modePick(mode) {
  return html`<fieldset class="mode-pick"><legend>Background</legend>
    <label class="check"><input type="radio" name="mode" value="dark" ${mode !== 'light' ? 'checked' : ''}><span>Dark</span></label>
    <label class="check"><input type="radio" name="mode" value="light" ${mode === 'light' ? 'checked' : ''}><span>Light</span></label>
  </fieldset>`;
}

/**
 * The look picker: preset swatches, "Match my team" (sport, then team) and
 * "Custom" (two colors), each on a dark or light background, with a sample
 * card. app.js recolors the sample before anything is saved; without it the
 * sample shows the look in use.
 */
function colorPicker(ctx, { teams, look }) {
  const style = ctx.user.style;
  const current = style ? 'custom' : THEMES.includes(ctx.user.theme) ? ctx.user.theme : ctx.app.theme;
  const teamKey = look.team?.key ?? null;
  // Each team carries its sample stylesheet for both backgrounds, already through the readability guard.
  const sample = (t, mode) => sheetPath({ mode, accent: teamAccent({ primary: t.color, alternate: t.alt }, mode).accent, tint: t.color }, { preview: true });
  return html`<h2 id="color">App color</h2>
    <div class="picker" data-picker>
      ${samplePreview(current)}
      <form class="swatches" method="post" action="/theme">
        ${csrfField(ctx)}
        ${Object.entries(PRESETS).map(([key, p]) => html`<button name="theme" value="${key}" class="swatch ${key} ${key === current ? 'on' : ''}" aria-pressed="${key === current ? 'true' : 'false'}" data-sample="${key}"><span></span>${p.label}</button>`)}
      </form>
      ${teams?.length
        ? html`<form class="form look-form ${teamKey ? 'on' : ''}" method="post" action="/theme" data-team-form>
            ${csrfField(ctx)}
            <input type="hidden" name="theme" value="team">
            <h3>Match my team</h3>
            <p class="muted small">Your team's color on buttons and odds, and a hint of it in the background.</p>
            <div class="pair">
              <label data-sport-pick hidden>Sport
                <select data-team-sport>${teams.map((g) => html`<option value="${g.sport.key}" ${look.team?.sport === g.sport.key ? 'selected' : ''}>${g.sport.name}</option>`)}</select></label>
              <label>Team
                <select name="team" required data-team-select>
                  <option value="">Pick a team</option>
                  ${teams.map((g) => html`<optgroup label="${g.sport.name}" data-sport="${g.sport.key}">${g.teams.map((t) => html`<option value="${t.key}" data-dark="${sample(t, 'dark')}" data-light="${sample(t, 'light')}" ${t.key === teamKey ? 'selected' : ''}>${t.name}</option>`)}</optgroup>`)}
                </select></label>
            </div>
            ${modePick(teamKey ? style?.mode : 'dark')}
            <button class="btn small">Use my team's colors</button>
          </form>`
        : ''}
      <form class="form look-form ${style && !teamKey ? 'on' : ''}" method="post" action="/theme" data-custom-form>
        ${csrfField(ctx)}
        <input type="hidden" name="theme" value="custom">
        <h3>Custom</h3>
        <p class="muted small">Pick an accent and a background tint. A color that's hard to read gets a shade lighter or darker.</p>
        <div class="pair colors">
          <label>Accent<input type="color" name="accent" value="${style && !teamKey ? style.accent : '#ff8f45'}" data-color="accent"></label>
          <label>Background tint<input type="color" name="tint" value="${style && !teamKey ? style.tint : '#1d3b8a'}" data-color="tint"></label>
        </div>
        ${modePick(style && !teamKey ? style.mode : 'dark')}
        <button class="btn small">Use these colors</button>
      </form>
    </div>`;
}

/**
 * "Your name on the boards": a color and an icon, with a board row that
 * shows them. Plain radio buttons, so it works without JavaScript; app.js
 * only updates the sample row and filters the team logos. Earned icons
 * show locked, with what earns them, until the player has the badge.
 */
function nametagPicker(ctx, { player, record, nametag }) {
  const { color, icon, colors, icons: choices, leagues } = nametag;
  const free = choices.filter((i) => !i.badge);
  const earned = choices.filter((i) => i.badge);
  const current = choices.find((i) => i.key === icon && !i.locked) ?? null;
  const team = icon.startsWith('team:') ? leagues.flatMap((l) => l.teams).find((t) => t.key === icon) ?? null : null;
  const shown = current ? { kind: 'emoji', emoji: current.emoji, label: current.label } : team ? { kind: 'team', name: team.name, logo: team.logo } : null;
  const radio = (value, extra = '') => html`<input type="radio" name="icon" value="${value}" ${value === icon ? 'checked' : ''} ${extra}>`;
  return html`<h2 id="nametag">Your name on the boards</h2>
    <div class="card nametag-card" data-nametag>
      <p class="muted small">Everyone sees these by your name: boards, standings, chat and feeds.</p>
      <div class="table nt-preview"><table><tbody><tr>
        <td class="rank"><span class="rk r1">1</span></td>
        <td><span class="player">${avatar(player)}<span class="pname"><span class="${color !== 'default' ? `who name-c-${color}` : 'who'}" data-nt-name>${player.screen_name}</span><span class="nt-icon" data-nt-icon>${nameIcon(shown)}</span></span></span></td>
        <td class="n">${recordText(record)}</td>
        <td class="n"><b>${units(record.units)}</b></td>
      </tr></tbody></table></div>
      <form class="form nametag-form" method="post" action="/nametag" data-nametag-form>
        ${csrfField(ctx)}
        <fieldset class="nc-pick"><legend>Name color</legend>
          <div class="nc-grid">${colors.map((c) => html`<label class="nc-swatch"><input type="radio" name="color" value="${c.key}" ${c.key === color ? 'checked' : ''}><span class="${c.key === 'default' ? '' : `name-c-${c.key}`}">${c.label}</span></label>`)}</div>
        </fieldset>
        <fieldset class="icon-pick"><legend>Icon</legend>
          <div class="icon-grid">
            <label class="icon-opt" title="No icon">${radio('none')}<span class="icon-none">None</span></label>
            ${free.map((i) => html`<label class="icon-opt" title="${i.label}">${radio(i.key)}<span class="glyph" aria-hidden="true" data-glyph>${i.emoji}</span><span class="sr-only">${i.label}</span></label>`)}
          </div>
          <p class="muted small">Earned icons</p>
          <div class="earned-grid">
            ${earned.map((i) => html`<label class="icon-opt earned ${i.locked ? 'locked' : ''}" title="${i.locked ? i.hint : i.label}">${radio(i.key, i.locked ? 'disabled' : '')}<span class="glyph" aria-hidden="true" data-glyph>${i.emoji}</span><span class="earned-text"><b>${i.label}</b><small>${i.locked ? i.hint : 'Unlocked'}</small></span></label>`)}
          </div>
        </fieldset>
        ${leagues.length
          ? html`<fieldset class="team-pick"><legend>Team logo</legend>
              <div class="pair team-filter" data-team-filter hidden>
                <label>League<select data-team-league><option value="">All leagues</option>${leagues.map((l) => html`<option value="${l.key}">${l.name}</option>`)}</select></label>
                <label>Find a team<input type="search" data-team-find placeholder="Team name" autocomplete="off"></label>
              </div>
              ${leagues.map((l) => html`<details class="team-league" data-league="${l.key}" ${team?.league === l.key ? 'open' : ''}>
                <summary>${l.name} <span class="muted small">${l.teams.length} ${l.teams.length === 1 ? 'team' : 'teams'}</span></summary>
                <div class="logo-grid">${l.teams.map((t) => html`<label class="icon-opt logo-opt" title="${t.name}" data-team-name="${t.name.toLowerCase()}">${radio(t.key)}<img src="${t.logo}" alt="" width="30" height="30" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-glyph data-name="${t.name}"><span class="sr-only">${t.name}</span></label>`)}</div>
              </details>`)}
            </fieldset>`
          : ''}
        <button class="btn small">Save</button>
      </form>
    </div>`;
}

/**
 * The band behind a profile's header: the player's cover photo when they
 * have one, else their team colors if they matched one, else their look's
 * accent. An SVG, since inline styles are blocked. `edit`, on your own
 * profile, is a Cover photo button on the banner that goes to the form (and,
 * with JavaScript, opens the file picker).
 */
function banner(look, cover = null, edit = false) {
  const button = edit
    ? html`<a class="cover-btn" href="#cover" data-cover-pick>${icons.camera}<span>${cover ? 'Edit cover' : 'Add cover'}</span></a>`
    : '';
  if (cover) {
    return html`<div class="banner cover"><img src="/media/${cover}" alt="" width="1200" height="400" decoding="async"></div>${button}`;
  }
  const [a, b] = bannerColors(look);
  return html`<svg class="banner" viewBox="0 0 400 100" preserveAspectRatio="none" aria-hidden="true">
    <rect width="400" height="100" fill="${b}"></rect>
    <polygon points="0,0 236,0 176,100 0,100" fill="${a}"></polygon>
    <polygon points="250,0 280,0 220,100 190,100" fill="${a}" opacity="0.6"></polygon>
    <polygon points="294,0 308,0 248,100 234,100" fill="${a}" opacity="0.35"></polygon>
    <rect width="400" height="100" class="banner-shade"></rect>
  </svg>${button}`;
}

/**
 * Your cover photo (or, for an admin, the official account's): choose, crop
 * to 3:1 in the browser (drag to choose what shows), save, or remove.
 */
function coverForm(ctx, player, cover) {
  const official = cover.upload !== '/cover';
  const remove = official ? '/admin/official/cover/delete' : '/cover/delete';
  return html`<h2 id="cover">${official ? 'Official account cover' : 'Cover photo'}</h2>
    <div class="cover-edit">
      <div class="cover-now">${cover.file
        ? html`<img class="cover-thumb" src="/media/${cover.file}" alt="Your cover photo" width="1200" height="400" loading="lazy" decoding="async">`
        : html`<span class="cover-thumb cover-empty">No cover photo yet</span>`}<canvas class="cover-thumb cover-crop" width="1200" height="400" hidden tabindex="0" aria-label="Cover preview. Drag, or use the arrow keys, to choose what shows." data-cover-canvas></canvas></div>
      ${cover.hidden && !official ? html`<p class="muted small">Your cover photo is hidden after reports until an admin looks at it.</p>` : ''}
      ${cover.blockedUntil
        ? html`<p class="muted small">An admin removed your last cover photo. You can add a new one after ${dateLabel(cover.blockedUntil)}.</p>`
        : html`<form class="form photo-form" method="post" action="${cover.upload}" enctype="multipart/form-data" data-cover-form>
            ${csrfField(ctx)}
            <label>Choose a cover photo <span class="hint">JPEG, PNG or WebP, up to 2 MB. It's cut to a wide strip, 3 times as wide as it is tall.</span>
              <input type="file" name="cover" accept="image/jpeg,image/png,image/webp" required data-cover-input></label>
            <div class="row"><button class="btn small" data-cover-save>Save cover</button><span class="muted small" data-cover-status role="status"></span></div>
          </form>`}
      ${cover.file || cover.hidden
        ? html`<form method="post" action="${remove}" data-confirm="Remove your cover photo?">${csrfField(ctx)}<button class="btn ghost small">Remove cover</button></form>`
        : ''}
      <p class="muted small">Everyone can see it. The same rules as photos; reported covers get looked at.</p>
    </div>`;
}

/** Your photo (or, for an admin, the official account's): choose, crop in the browser, save, or remove. */
function photoForm(ctx, player, photo) {
  const official = photo.upload !== '/photo';
  const remove = official ? '/admin/official/photo/delete' : '/photo/delete';
  return html`<h2 id="photo">${official ? 'Official account photo' : 'Profile photo'}</h2>
    <div class="photo-edit">
      <div class="photo-now">${avatar(player, 'huge')}<canvas class="avatar huge photo-crop" width="400" height="400" hidden data-photo-canvas></canvas></div>
      <div class="photo-side">
        ${photo.hidden && !official ? html`<p class="muted small">Your photo is hidden after reports until an admin looks at it.</p>` : ''}
        ${photo.blockedUntil
          ? html`<p class="muted small">An admin removed your last photo. You can add a new one after ${dateLabel(photo.blockedUntil)}.</p>`
          : html`<form class="form photo-form" method="post" action="${photo.upload}" enctype="multipart/form-data" data-photo-form>
              ${csrfField(ctx)}
              <label>Choose a photo <span class="hint">JPEG, PNG or WebP, up to 1 MB. It's cut to a square from the middle.</span>
                <input type="file" name="photo" accept="image/jpeg,image/png,image/webp" required data-photo-input></label>
              <div class="row"><button class="btn small" data-photo-save>Save photo</button><span class="muted small" data-photo-status role="status"></span></div>
            </form>`}
        ${player.photo || photo.hidden
          ? html`<form method="post" action="${remove}" data-confirm="Remove this photo?">${csrfField(ctx)}<button class="btn ghost small">Remove photo</button></form>`
          : ''}
        <p class="muted small">Everyone can see it. No nudity, hate or other people's photos; reported photos get looked at.</p>
      </div>
    </div>`;
}

/** A player's badges as chips; the title says when each was earned. */
function badgeChips(badges) {
  if (!badges.length) return '';
  const about = (b) => {
    const dates = b.earned.map((e) => `${dateLabel(e.at)}${e.detail ? ` (${e.detail})` : ''}`);
    return `${b.label}: ${b.about}. Earned ${dates.join(', ')}.`;
  };
  return html`<h2 id="badges">Badges</h2>
    <ul class="badge-chips">${badges.map((b) => html`<li class="badge-chip" title="${about(b)}"><span class="sr-only">${about(b)}</span><span aria-hidden="true">${icons.medal}${b.label}${b.count > 1 ? ` ×${b.count}` : ''}</span></li>`)}</ul>`;
}

/** Beat the close and average CLV across the player's straight picks, with a plain-words note on what it means. */
function clvLine(clv) {
  if (!clv) return '';
  const avg = clv.avgPct == null ? null : Math.round(clv.avgPct * 10) / 10;
  return html`<div class="clv-line">
    <p>Beat the close: <b>${pct(clv.beat)}</b>${avg == null ? '' : html` · Avg CLV <b class="clv ${avg > 0 ? 'up' : avg < 0 ? 'down' : ''}">${minus(`${avg > 0 ? '+' : ''}${avg.toFixed(1)}%`)}</b>`} <span class="muted small">· ${clv.picks} ${clv.picks === 1 ? 'pick' : 'picks'}</span></p>
    <details class="clv-help"><summary>What's CLV?</summary><p>CLV shows whether you got a better number than where the line closed. Beating the close over time is the best sign of a sharp bettor.</p></details>
  </div>`;
}

/** Your city, from the same list as the directory. Picking one joins its room, starting it if need be. */
function homeCityForm(ctx, home, cities) {
  return html`<h2>Your city</h2>
    <form class="form home-city-form" method="post" action="/home-city">
      ${csrfField(ctx)}
      <label>Pick your city <span class="hint">Joins its local room, and shows on your profile. Just a city, never an address.</span>
        ${citySelect(cities, { selected: home?.city.slug ?? '', blank: 'No city' })}</label>
      <div class="row"><button class="btn small">Save city</button></div>
    </form>`;
}

export function profile(ctx, { player, nametag = null, record, bySport, split = null, series = [], last10 = null, rank = null, follows = { followers: 0, following: 0 }, following = false, picks, hidden, nextChange = null, badges = [], streak = null, cup = null, clv = null, look = { preset: null }, photo = {}, cover = {}, teams = null, home = null, cities = null }) {
  const own = ctx.user?.id === player.id;
  const team = look.team ?? null;
  // Anyone signed in can report someone else's photo, once.
  const report = ctx.user?.screenName && !own && player.photo
    ? photo.reported
      ? html`<span class="muted small">Photo reported</span>`
      : html`<form method="post" action="/u/${encodeURIComponent(player.screen_name)}/photo/report" data-confirm="Report ${player.screen_name}'s photo to the admins?">${csrfField(ctx)}<button class="link-btn">Report photo</button></form>`
    : '';
  const reportCover = ctx.user?.screenName && !own && cover.file
    ? cover.reported
      ? html`<span class="muted small">Cover reported</span>`
      : html`<form method="post" action="/u/${encodeURIComponent(player.screen_name)}/cover/report" data-confirm="Report ${player.screen_name}'s cover photo to the admins?">${csrfField(ctx)}<button class="link-btn">Report cover</button></form>`
    : '';
  return layout(ctx, {
    title: player.screen_name,
    active: ctx.user?.id === player.id ? 'me' : null,
    description: `${player.screen_name}: ${recordText(record)}, ${record.units > 0 ? '+' : ''}${record.units} units. Every pick locked before the game and graded off the final.`,
    share: shareCard(player, record),
    body: html`
      <header class="profile-head ${player.photo ? 'has-photo' : ''} ${cover.file ? 'has-cover' : ''}">
        ${banner(look, cover.file, Boolean(cover.upload) && !cover.blockedUntil)}
        <div class="profile-face">${avatar(player, player.photo ? 'huge' : 'big')}</div>
        <div class="team">${!player.official && player.nameColor ? html`<h1 class="name-c-${player.nameColor}">${player.screen_name}</h1>` : html`<h1>${player.screen_name}</h1>`}${player.official ? officialTag : nameIcon(player.nameIcon)}${team
          ? html`<span class="team-badge" title="${team.name} fan">${teamLogo(team)}<span class="sr-only">${team.name} fan</span></span>`
          : ''}</div>
      </header>
      ${player.official ? html`<p class="muted small">The official account. Listed on the boards, never ranked. <span class="lock-tag">Lock</span>marks the site's locks.</p>` : ''}
      ${player.first_name || player.last_name ? html`<p class="real-name">${[player.first_name, player.last_name].filter(Boolean).join(' ')}</p>` : ''}
      ${player.bio ? html`<p class="bio">${player.bio}</p>` : ''}
      ${home ? html`<p class="home-city">${cityPin(home)}</p>` : ''}
      <p class="follow-counts"><b>${follows.followers}</b> ${follows.followers === 1 ? 'follower' : 'followers'} · <b>${follows.following}</b> following</p>
      <div class="row profile-actions">
        ${ctx.user?.screenName && ctx.user.id !== player.id ? followButton(ctx, player.screen_name, following) : ''}
        ${player.link_url ? html`<a class="btn small" href="${player.link_url}" target="_blank" rel="nofollow noopener noreferrer ugc">${player.link_label} ↗</a>` : ''}
        <button class="btn ghost small" type="button" data-share="${ctx.origin}/u/${encodeURIComponent(player.screen_name)}" data-share-text="${shareCard(player, record).title}" hidden>Share profile</button>
        ${ctx.user?.id === player.id ? html`<a class="btn ghost small" href="/invite">Invite friends</a>` : ''}
        ${report}
        ${reportCover}
      </div>
      <p class="lede">On the record since ${joined(player.created_at)}. ${record.graded} graded ${record.graded === 1 ? 'pick' : 'picks'}, every one locked before its game.</p>
      ${recordCard(ctx, { player, record, series, last10, rank })}
      ${clvLine(clv)}
      ${streak?.played ? html`<p class="streak-line"><a href="/streak">${icons.flame}<span>Streak: <b>${streak.current}</b> · Best: <b>${streak.best}</b></span></a></p>` : ''}
      ${cup ? html`<p class="streak-line cup-line"><a href="/cup">${icons.board}<span>Cup: <b>${cup.rank ? `#${cup.rank}` : '–'}</b> · <b>${cup.points} pts</b></span></a></p>` : ''}
      ${badgeChips(badges)}
      ${own ? html`${photoForm(ctx, player, photo)}${coverForm(ctx, player, cover)}${screenNameForm(ctx, player, nextChange)}${nameForm(ctx, player)}${bioForm(ctx, player)}${linkForm(ctx, player)}${cities ? homeCityForm(ctx, home, cities) : ''}${colorPicker(ctx, { teams, look })}${sitePicksSetting(ctx)}${nametag ? nametagPicker(ctx, { player, record, nametag }) : ''}` : ''}
      ${!own && photo.upload ? photoForm(ctx, player, photo) : ''}
      ${!own && cover.upload ? coverForm(ctx, player, cover) : ''}
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
        ? html`<ul class="tickets">${picks.map((p) => betItem(p))}</ul>`
        : html`<div class="card empty">No picks on the record yet.</div>`}
      ${ctx.user?.id === player.id ? deleteForm(ctx) : ''}
    `,
  });
}

/**
 * A week's (or a tournament's) top 3: place, player, record and units. With
 * `share`, the viewer's own row gets a Share button for their card.
 */
function podium(list, share = null) {
  return html`<ol class="podium">${list.map((r) => html`<li class="p${r.place}">
    <span class="place">#${r.place}</span>
    <span class="who-cell">${profileLink(r.screen_name)}</span>
    <span class="rec">${r.record}</span>
    <b>${units(r.units)}</b>
  </li>${share && r.id != null && r.id === share.ctx.user?.id
    ? html`<li class="podium-share">${winShare(share.ctx, { place: r.place, title: share.title, units: r.units, record: r.record, players: share.players?.(), date: share.date, path: share.path })}</li>`
    : ''}`)}</ol>`;
}

/** The free weekly contest: this week's standings, the clock, last week's top 3. */
export function contest(ctx, { week, rows, badges, me, left, min, last, players = null }) {
  const playing = Boolean(ctx.user?.screenName);
  return layout(ctx, {
    title: "This week's contest",
    active: 'board',
    description: 'The free weekly contest on LockBox: most units won Monday to Sunday takes it.',
    body: html`
      <a class="back" href="/leaderboard">← Leaderboard</a>
      <h1>This week's contest</h1>
      <p class="lede">Free, and everyone's in. Most units won on bets whose games start Monday through Sunday takes the week. ${min} graded bets to place. Ties go to the better ROI, then to whoever got there first.</p>
      <div class="contest-clock">
        <span class="cc-week">${week}</span>
        <b>Ends Sunday at midnight ET</b>
        <span class="cc-left">${left}</span>
      </div>
      ${me
        ? html`<div class="card my-standing">
            <span class="ms-place">${me.rank ? `#${me.rank}` : '–'}</span>
            <span class="ms-text"><b>You</b><small>${recordText(me)} · ${me.rank ? `${signedPct(me.roi)} ROI` : `${min - me.graded} more graded ${min - me.graded === 1 ? 'bet' : 'bets'} to place`}</small></span>
            <b class="ms-units">${units(me.units)}</b>
          </div>`
        : playing
          ? html`<p class="muted">You're not on the board this week yet. Your bets show here once their games go final.</p>`
          : ''}
      ${boardTable(rows, { me: ctx.user?.id, badges, empty: 'No graded bets this week yet. Standings fill in as games go final.' })}
      <h2>Last week's top 3</h2>
      <p class="muted small">${last.label}</p>
      ${last.podium
        ? last.podium.length
          ? podium(last.podium, { ctx, title: 'the weekly contest', date: `Week of ${last.label}`, path: '/winners', players: () => players?.(last.week) })
          : html`<div class="card empty">Nobody had ${min} graded bets last week.</div>`
        : html`<div class="card empty">Last week closes once every bet in it is graded, by Tuesday 6 AM ET.</div>`}
      <a class="btn ghost block winners-link" href="/winners">Winners wall</a>
    `,
  });
}

/**
 * The winners wall, in two tabs: every closed week's top 3 (and who has won
 * the most weeks), and every closed tournament's.
 */
export function winners(ctx, { weeks, champions, tab = 'weekly', tournaments = { list: [], champions: [] }, cupList = [], players = null }) {
  const chips = (list) => html`<p class="chips-row">${list.map((c) => html`<a class="chip" href="/u/${encodeURIComponent(c.screen_name)}">${c.screen_name} · ${c.wins} ${c.wins === 1 ? 'win' : 'wins'}</a>`)}</p>`;
  const weekly = html`
      ${champions.length ? html`<h2>Most weekly wins</h2>${chips(champions)}` : ''}
      ${weeks.length
        ? weeks.map((w) => html`<section class="card week-card">
            <h3>${w.label}</h3>
            ${w.podium.length ? podium(w.podium, { ctx, title: 'the weekly contest', date: `Week of ${w.label}`, path: '/winners', players: () => players?.(w.week) }) : html`<p class="muted small">Nobody had enough graded bets to place.</p>`}
          </section>`)
        : html`<div class="card empty">No weeks closed yet. The first winners go up once this week ends. <a href="/contest">See this week's standings</a>.</div>`}`;
  const cups = html`
      ${tournaments.champions.length ? html`<h2>Most tournament wins</h2>${chips(tournaments.champions)}` : ''}
      ${tournaments.list.length
        ? tournaments.list.map((t) => html`<section class="card week-card">
            <h3><a href="/tournaments/${t.slug}">${t.name}</a></h3>
            <p class="muted small">${t.window}</p>
            ${t.podium.length ? podium(t.podium, { ctx, title: t.name, date: endLabel(t), path: `/tournaments/${t.slug}`, players: () => t.players }) : html`<p class="muted small">Nobody had enough graded bets to place.</p>`}
          </section>`)
        : html`<div class="card empty">No tournaments finished yet. <a href="/tournaments">See what's on</a>.</div>`}`;
  const cupYears = cupList.length
    ? cupList.map((y) => html`<section class="card week-card">
        <h3><a href="/cup?year=${y.year}">${y.year} Bookie Bullies Cup</a></h3>
        <ol class="podium">${y.podium.map((r) => html`<li class="p${r.place}"><span class="place">#${r.place}</span><span class="who-cell">${profileLink(r.screen_name)}</span><span class="rec"></span><b>${r.points} pts</b></li>`)}</ol>
      </section>`)
    : html`<div class="card empty">The first Cup winners go up when the year ends. <a href="/cup">See the standings</a>.</div>`;
  const lede = { tournaments: 'The top 3 from every finished tournament, newest first.', cup: 'The top 3 in the Bookie Bullies Cup, every year.', weekly: 'The top 3 from every week of the free weekly contest, newest first.' }[tab];
  return layout(ctx, {
    title: 'Winners wall',
    active: 'board',
    description: "Every week's top 3 in the free LockBox weekly contest, and every tournament's.",
    body: html`
      <a class="back" href="/contest">← This week's contest</a>
      <h1>Winners wall</h1>
      <p class="lede">${lede}</p>
      ${tabs('/winners', ctx.query, 'tab', [['', 'Weekly contest'], ['tournaments', 'Tournaments'], ['cup', 'Cup']])}
      ${tab === 'tournaments' ? cups : tab === 'cup' ? cupYears : weekly}
    `,
  });
}

/** One streak board: the longest current runs or the best ever. */
function streakTable(rows, key, me, empty) {
  if (!rows.length) return html`<div class="card empty">${empty}</div>`;
  return html`<div class="table"><table>
    <thead><tr><th>#</th><th>Player</th><th class="n">${key === 'current' ? 'Streak' : 'Best'}</th></tr></thead>
    <tbody>${rows.map((r) => html`<tr class="${r.id === me ? 'me' : ''}">
      <td class="rank"><span class="rk ${r.rank <= 3 ? `r${r.rank}` : ''}">${r.rank}</span></td>
      <td>${playerName(r)}</td>
      <td class="n"><b class="streak hot">${r[key]}</b></td>
    </tr>`)}</tbody>
  </table></div>`;
}

/** The streak game: your streak, today's Streak pick, and the streak boards. */
export function streak(ctx, { mine, todays, boards }) {
  return layout(ctx, {
    title: 'Streak',
    active: 'more',
    body: html`
      <a class="back" href="/more">← More</a>
      <h1>Streak</h1>
      <p class="lede">One Streak pick a day: any straight pick, checked on the pick slip. Win it and your streak grows. A loss sets it back to 0. Pushes, and days you skip, don't count either way.</p>
      <div class="stats two">
        <div class="stat"><b class="streak-now">${icons.flame}${mine.current}</b><span>Current streak</span></div>
        <div class="stat"><b>${mine.best}</b><span>Best streak</span></div>
      </div>
      <h2>Today's Streak pick</h2>
      ${todays
        ? html`<ul class="tickets">${pickItem(todays, { mine: true, now: ctx.now })}</ul>`
        : html`<div class="card empty stack">
            <p>No Streak pick today yet. Tap any line on the board and check "Make this my Streak pick".</p>
            <a class="btn" href="/games">Make today's Streak pick</a>
          </div>`}
      <h2>Longest streaks now</h2>
      ${streakTable(boards.current, 'current', ctx.user.id, 'Nobody has a streak going yet.')}
      <h2>Best streaks ever</h2>
      ${streakTable(boards.best, 'best', ctx.user.id, 'No Streak picks have won yet.')}
    `,
  });
}

/** Your invite link, who joined from it, and how close the Recruiter badge is. */
export function invite(ctx, { url, joined, waiting, goal }) {
  const count = joined.length;
  return layout(ctx, {
    title: 'Invite friends',
    active: 'more',
    body: html`
      <a class="back" href="/more">← More</a>
      <h1>Invite friends</h1>
      <p class="lede">Your own link. Friends who sign up with it follow you from the start, and you'll hear when they join.</p>
      <div class="card stack invite-card">
        <div class="copy invite-url">${url}</div>
        <div class="row">
          <button class="btn small" type="button" data-copy="${url}" hidden>Copy link</button>
          <button class="btn ghost small" type="button" data-share="${url}" data-share-text="Make picks with me on LockBox" hidden>Share</button>
        </div>
      </div>
      <h2>Friends who joined</h2>
      <div class="card stack recruit">
        <p><b class="recruit-count">${count}</b> ${count === 1 ? 'friend has' : 'friends have'} joined.</p>
        <progress max="${goal}" value="${Math.min(count, goal)}" aria-label="Recruiter badge progress"></progress>
        <p class="muted small">${count >= goal ? 'You have the Recruiter badge.' : `${count} of ${goal} for the Recruiter badge.`} A friend counts once they confirm their email and pick a screen name.</p>
        ${waiting ? html`<p class="muted small">${waiting} more signed up and ${waiting === 1 ? "hasn't" : "haven't"} finished yet.</p>` : ''}
      </div>
      ${joined.length ? html`<p class="chips-row">${joined.map((name) => html`<a class="chip" href="/u/${encodeURIComponent(name)}">${name}</a>`)}</p>` : ''}
    `,
  });
}
