// Every page and form. Plain Node http: a route table, a context per request,
// and handlers that render views or redirect.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as auth from './auth.js';
import { createGroup, deleteGroup, findByCode, groupFor, groupsOf, joinGroup, leaveGroup, membersOf } from './groups.js';
import { groupFeed, ownPicks, picksOnGames, publicPicks } from './history.js';
import { THEMES } from './config.js';
import { LOGO_HOST } from './espn.js';
import { cleanLink } from './links.js';
import { createMailer } from './mail.js';
import { deletePick, formatLine, formatUnits, isLocked, makePick, MARKETS, price, toWin } from './picks.js';
import { SPORT } from './sports.js';
import { lastTen, leaderboard, PERIODS, rankOf, record, recordBySport, unitsSeries } from './stats.js';
import * as account from './views/account.js';
import * as legal from './views/legal.js';
import * as moreViews from './views/more.js';
import * as play from './views/play.js';
import * as social from './views/social.js';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const MAX_BODY = 16 * 1024;
const DEFAULT_SPORT = 'nfl';
export const BIO_MAX = 160;

const SECURITY_HEADERS = {
  'Content-Security-Policy':
    `default-src 'self'; img-src 'self' data: https://${LOGO_HOST}; style-src 'self'; script-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'`,
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

export function createApp({ store, games, config, mailer = createMailer({ log: { log() {} } }), now = () => new Date(), log = console }) {
  const assets = loadAssets();
  const app = {
    name: config.appName,
    theme: config.theme ?? THEMES[0],
    assets: {
      css: assets.url('style.css'),
      js: assets.url('app.js'),
      logo: assets.url('logo.png'),
      touchIcon: assets.url('icon-180.png'),
      manifest: assets.url('manifest.webmanifest'),
    },
  };
  const loginLimit = auth.rateLimiter({ limit: 10, windowMs: 15 * 60_000 });
  const signupLimit = auth.rateLimiter({ limit: 10, windowMs: 60 * 60_000 });
  const joinLimit = auth.rateLimiter({ limit: 30, windowMs: 60 * 60_000 });
  const forgotLimit = auth.rateLimiter({ limit: 5, windowMs: 60 * 60_000 });
  const resendLimit = auth.rateLimiter({ limit: 5, windowMs: 60 * 60_000 });
  const contact = config.contactEmail ?? 'hello@bookiebullies.com';

  /** Email a link that confirms this address. Mail trouble is logged, never shown. */
  async function sendVerify(ctx, userId, email) {
    const token = auth.createVerify(store, userId, ctx.now);
    const link = `${config.appUrl ?? origin(ctx)}/verify?token=${token}`;
    try {
      await mailer.send({
        to: email,
        subject: `Confirm your ${config.appName} email`,
        text: `Welcome to ${config.appName}.\n\nConfirm this email to put your record on the leaderboards (the link works for ${auth.VERIFY_DAYS} days):\n${link}\n\nIf you didn't sign up, ignore this email.\n`,
      });
    } catch (err) {
      log.error(`verify email to ${email}: ${err.message}`);
    }
  }

  // ---- helpers --------------------------------------------------------------

  const secure = (ctx) => Boolean(ctx.req.socket.encrypted) || (config.trustProxy && ctx.req.headers['x-forwarded-proto'] === 'https');

  function origin(ctx) {
    const host = (config.trustProxy && ctx.req.headers['x-forwarded-host']) || ctx.req.headers.host;
    return `${secure(ctx) ? 'https' : 'http'}://${host}`;
  }

  function clientIp(ctx) {
    const forwarded = config.trustProxy && ctx.req.headers['x-forwarded-for'];
    // The last hop is the one our host's proxy added; anything before it the client could have made up.
    return forwarded ? forwarded.split(',').at(-1).trim() : ctx.req.socket.remoteAddress ?? '?';
  }

  function setCookie(ctx, name, value, maxAge) {
    const parts = [`${name}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`];
    if (secure(ctx)) parts.push('Secure');
    ctx.cookies.push(parts.join('; '));
  }

  function flash(ctx, type, text, at) {
    setCookie(ctx, 'flash', Buffer.from(JSON.stringify({ type, text, at })).toString('base64url'), 60);
  }

  function headers(ctx, extra) {
    const out = { ...SECURITY_HEADERS, ...extra };
    if (secure(ctx)) out['Strict-Transport-Security'] = 'max-age=31536000';
    if (ctx.cookies.length) out['Set-Cookie'] = ctx.cookies;
    return out;
  }

  function send(ctx, status, page) {
    const body = String(page);
    ctx.res.writeHead(status, headers(ctx, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body) }));
    ctx.res.end(body);
  }

  function redirect(ctx, location) {
    ctx.res.writeHead(303, headers(ctx, { Location: location, 'Cache-Control': 'no-store' }));
    ctx.res.end();
  }

  const notFound = (ctx) => send(ctx, 404, account.notFound(ctx));

  /** Signed in with a screen name, or sent where they need to go first. */
  function signedIn(ctx) {
    const here = ctx.req.method === 'GET' ? ctx.url.pathname + ctx.url.search : null;
    const next = here && here !== '/' ? `?next=${encodeURIComponent(here)}` : '';
    if (!ctx.user) redirect(ctx, `/login${next}`);
    else if (!ctx.user.screenName) redirect(ctx, `/welcome${next}`);
    return Boolean(ctx.user?.screenName);
  }

  function startSession(ctx, userId) {
    const token = auth.createSession(store, userId, ctx.now);
    setCookie(ctx, 'sid', token, auth.SESSION_DAYS * 86_400);
  }

  // ---- pages ----------------------------------------------------------------

  function home(ctx) {
    if (ctx.user) return redirect(ctx, ctx.user.screenName ? '/games' : '/welcome');
    send(ctx, 200, account.home(ctx, { top: leaderboard(store, { period: '30' }, ctx.now, 10) }));
  }

  function health(ctx) {
    ctx.res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
    ctx.res.end('ok');
  }

  function signupForm(ctx) {
    if (ctx.user) return redirect(ctx, '/');
    send(ctx, 200, account.signup(ctx, { next: safeNext(ctx.query.get('next')) }));
  }

  async function signup(ctx) {
    const email = auth.normalizeEmail(ctx.form.get('email'));
    const password = ctx.form.get('password') ?? '';
    const next = safeNext(ctx.form.get('next'));
    const adult = ctx.form.get('adult') === 'on';
    const terms = ctx.form.get('terms') === 'on';
    const again = (status, error) => send(ctx, status, account.signup(ctx, { email, error, next, adult, terms }));
    if (!signupLimit.allow(clientIp(ctx), ctx.now)) return again(429, 'Too many new accounts from here. Try again in an hour.');
    if (!auth.validEmail(email)) return again(400, "That email doesn't look right.");
    if (!adult) return again(400, "You have to be 21 or older to play. Check the box if you are.");
    if (!terms) return again(400, 'Agree to the Terms and Privacy Policy to make an account.');
    if (password.length < auth.MIN_PASSWORD) return again(400, `Use at least ${auth.MIN_PASSWORD} characters for your password.`);
    if (password.length > 200) return again(400, 'That password is too long. Keep it under 200 characters.');
    const taken = () => again(400, "There's already an account with that email. Log in instead?");
    if (store.get('SELECT 1 FROM users WHERE email = ?', email)) return taken();
    const hash = await auth.hashPassword(password);
    let id;
    try {
      const at = ctx.now.toISOString();
      id = Number(store.run(
        'INSERT INTO users (email, password_hash, created_at, age_confirmed_at, terms_accepted_at) VALUES (?, ?, ?, ?, ?)',
        email, hash, at, at, at,
      ).lastInsertRowid);
    } catch (err) {
      if (/UNIQUE/.test(err.message)) return taken();
      throw err;
    }
    startSession(ctx, id);
    await sendVerify(ctx, id, email);
    redirect(ctx, `/welcome${next ? `?next=${encodeURIComponent(next)}` : ''}`);
  }

  function verify(ctx) {
    const userId = auth.useVerify(store, ctx.query.get('token'), ctx.now);
    if (!userId) return send(ctx, 400, account.verifyDead(ctx));
    flash(ctx, 'ok', "Email confirmed. Your record shows on the leaderboards now.");
    redirect(ctx, ctx.user ? '/games' : '/login');
  }

  async function verifyResend(ctx) {
    if (!signedIn(ctx)) return;
    if (ctx.user.verified) return redirect(ctx, '/games');
    if (!resendLimit.allow(`user ${ctx.user.id}`, ctx.now)) {
      flash(ctx, 'error', 'We already sent a few. Give them a few minutes, and check spam.');
    } else {
      await sendVerify(ctx, ctx.user.id, ctx.user.email);
      flash(ctx, 'ok', `Sent a new link to ${ctx.user.email}.`);
    }
    redirect(ctx, safeNext(ctx.form.get('next')) ?? '/games');
  }

  function loginForm(ctx) {
    if (ctx.user) return redirect(ctx, '/');
    send(ctx, 200, account.login(ctx, { next: safeNext(ctx.query.get('next')) }));
  }

  async function login(ctx) {
    const email = auth.normalizeEmail(ctx.form.get('email'));
    const password = ctx.form.get('password') ?? '';
    const next = safeNext(ctx.form.get('next'));
    const again = (status, error) => send(ctx, status, account.login(ctx, { email, error, next }));
    const allowed = loginLimit.allow(`ip ${clientIp(ctx)}`, ctx.now) && loginLimit.allow(`email ${email}`, ctx.now);
    if (!allowed) return again(429, 'Too many tries. Wait 15 minutes and try again.');
    const user = store.get('SELECT id, password_hash, screen_name FROM users WHERE email = ?', email);
    const ok = user ? await auth.verifyPassword(password, user.password_hash) : await auth.decoyCheck(password);
    if (!ok) return again(400, "That email and password don't match.");
    auth.pruneSessions(store, ctx.now);
    if (ctx.session) auth.endSession(store, ctx.session.tokenHash);
    startSession(ctx, user.id);
    const query = next ? `?next=${encodeURIComponent(next)}` : '';
    redirect(ctx, user.screen_name ? next ?? '/games' : `/welcome${query}`);
  }

  function forgotForm(ctx) {
    send(ctx, 200, account.forgot(ctx, {}));
  }

  async function forgot(ctx) {
    const email = auth.normalizeEmail(ctx.form.get('email'));
    if (!auth.validEmail(email)) return send(ctx, 400, account.forgot(ctx, { email, error: "That email doesn't look right." }));
    const allowed = forgotLimit.allow(`ip ${clientIp(ctx)}`, ctx.now) && forgotLimit.allow(`email ${email}`, ctx.now);
    if (!allowed) return send(ctx, 429, account.forgot(ctx, { email, error: 'Too many tries. Wait an hour and try again.' }));
    const user = store.get('SELECT id FROM users WHERE email = ?', email);
    if (user) {
      const token = auth.createReset(store, user.id, ctx.now);
      const link = `${config.appUrl ?? origin(ctx)}/reset?token=${token}`;
      try {
        await mailer.send({
          to: email,
          subject: `Reset your ${config.appName} password`,
          text: `Someone asked to reset the password for this email on ${config.appName}.\n\nSet a new one here (the link works once, for the next ${auth.RESET_MINUTES} minutes):\n${link}\n\nIf that wasn't you, ignore this email. Your password stays the same.\n`,
        });
      } catch (err) {
        log.error(`reset email to ${email}: ${err.message}`);
      }
    }
    // The same answer either way, so this page can't be used to find out who has an account.
    send(ctx, 200, account.forgot(ctx, { sent: true, email }));
  }

  function resetForm(ctx) {
    const token = ctx.query.get('token') ?? '';
    if (!auth.findReset(store, token, ctx.now)) return send(ctx, 400, account.resetDead(ctx));
    send(ctx, 200, account.reset(ctx, { token }));
  }

  async function reset(ctx) {
    const token = ctx.form.get('token') ?? '';
    const password = ctx.form.get('password') ?? '';
    const found = auth.findReset(store, token, ctx.now);
    if (!found) return send(ctx, 400, account.resetDead(ctx));
    if (password.length < auth.MIN_PASSWORD) return send(ctx, 400, account.reset(ctx, { token, error: `Use at least ${auth.MIN_PASSWORD} characters for your password.` }));
    if (password.length > 200) return send(ctx, 400, account.reset(ctx, { token, error: 'That password is too long. Keep it under 200 characters.' }));
    auth.finishReset(store, found, await auth.hashPassword(password), ctx.now);
    startSession(ctx, found.user_id);
    flash(ctx, 'ok', 'Password changed. Every other device was signed out.');
    const user = store.get('SELECT screen_name FROM users WHERE id = ?', found.user_id);
    redirect(ctx, user?.screen_name ? '/games' : '/welcome');
  }

  function logout(ctx) {
    if (ctx.session) auth.endSession(store, ctx.session.tokenHash);
    setCookie(ctx, 'sid', '', 0);
    redirect(ctx, '/');
  }

  function welcomeForm(ctx) {
    const next = safeNext(ctx.query.get('next'));
    if (!ctx.user) return redirect(ctx, '/login');
    if (ctx.user.screenName) return redirect(ctx, next ?? '/games');
    send(ctx, 200, account.welcome(ctx, { next }));
  }

  function welcome(ctx) {
    if (!ctx.user) return redirect(ctx, '/login');
    const next = safeNext(ctx.form.get('next'));
    if (ctx.user.screenName) return redirect(ctx, next ?? '/games');
    const name = String(ctx.form.get('screen_name') ?? '').trim();
    const first = auth.cleanName(ctx.form.get('first_name'));
    const last = auth.cleanName(ctx.form.get('last_name'));
    const again = (error) => send(ctx, 400, account.welcome(ctx, {
      name, error, next, firstName: ctx.form.get('first_name') ?? '', lastName: ctx.form.get('last_name') ?? '',
    }));
    const problem = auth.screenNameProblem(name);
    if (problem) return again(problem);
    if (first.error || last.error) return again(first.error ?? last.error);
    if (store.get('SELECT 1 FROM users WHERE screen_name = ?', name)) return again('Someone already has that name. Try another.');
    try {
      store.run('UPDATE users SET screen_name = ?, first_name = ?, last_name = ? WHERE id = ? AND screen_name IS NULL', name, first.name, last.name, ctx.user.id);
    } catch (err) {
      if (/UNIQUE/.test(err.message)) return again('Someone already has that name. Try another.');
      throw err;
    }
    flash(ctx, 'ok', `You're on the board, ${name}. Go make a pick.`);
    redirect(ctx, next ?? '/games');
  }

  async function gamesPage(ctx) {
    if (!signedIn(ctx)) return;
    const sport = SPORT[ctx.query.get('sport')] ?? SPORT[DEFAULT_SPORT];
    ctx.query.set('sport', sport.key);
    const list = await games.upcoming(sport.key);
    const mine = picksOnGames(store, ctx.user.id, list.map((g) => g.id));
    send(ctx, 200, play.games(ctx, { sport, list, mine, live: games.liveNow(), problem: games.problem(sport.key) }));
  }

  async function pickForm(ctx) {
    if (!signedIn(ctx)) return;
    const market = ctx.query.get('market');
    const side = ctx.query.get('side');
    const { game } = await games.current(ctx.query.get('game') ?? '');
    if (!game || !MARKETS[market]?.includes(side)) return notFound(ctx);
    const back = `/games?sport=${game.sport}`;
    if (isLocked(game, ctx.now)) {
      flash(ctx, 'error', 'That game has started. Picks lock at the start.');
      return redirect(ctx, back);
    }
    const current = price(game, market, side);
    if (!current) {
      flash(ctx, 'error', 'That line is off the board right now.');
      return redirect(ctx, back);
    }
    send(ctx, 200, play.slip(ctx, { game, market, side, current }));
  }

  async function pickPost(ctx) {
    if (!signedIn(ctx)) return;
    const market = ctx.form.get('market');
    const side = ctx.form.get('side');
    const units = Number(String(ctx.form.get('units') ?? '').replace(/[u,\s]/gi, ''));
    const seen = { line: ctx.form.get('line') ? Number(ctx.form.get('line')) : null, odds: Number(ctx.form.get('odds')) };
    const { game, stale } = await games.current(ctx.form.get('game') ?? '');
    if (!game || !MARKETS[market]?.includes(side)) return notFound(ctx);
    const back = `/games?sport=${game.sport}`;
    const current = price(game, market, side);
    if (!isLocked(game, ctx.now) && current && stale) {
      return send(ctx, 503, play.slip(ctx, { game, market, side, current, units, error: "Can't reach live lines right now, so picks are paused. Try again in a minute." }));
    }
    const result = makePick(store, { userId: ctx.user.id, game, market, side, units, seen, now: ctx.now });
    if (result.moved) return send(ctx, 409, play.slip(ctx, { game, market, side, current: result.moved, units, error: result.error }));
    if (result.error) {
      if (current && !isLocked(game, ctx.now) && !/already/.test(result.error)) {
        return send(ctx, 400, play.slip(ctx, { game, market, side, current, units: Number.isFinite(units) ? units : undefined, error: result.error }));
      }
      flash(ctx, 'error', result.error);
      return redirect(ctx, back);
    }
    flash(ctx, 'locked', `${formatLine(market, side, current, game)}, ${formatUnits(result.units)} to win ${formatUnits(toWin(current.odds, result.units))}`, ctx.now.toISOString());
    redirect(ctx, back);
  }

  async function pickDelete(ctx, { id }) {
    if (!signedIn(ctx)) return;
    const row = store.get('SELECT game_id FROM picks WHERE id = ? AND user_id = ?', Number(id), ctx.user.id);
    if (!row) return notFound(ctx);
    const { game } = await games.current(row.game_id);
    const result = deletePick(store, { userId: ctx.user.id, pickId: Number(id), game, now: ctx.now });
    flash(ctx, result.error ? 'error' : 'ok', result.error ?? 'Pick deleted.');
    redirect(ctx, '/picks');
  }

  function myPicks(ctx) {
    if (!signedIn(ctx)) return;
    const { open, graded } = ownPicks(store, ctx.user.id);
    const tab = ctx.query.get('tab') === 'settled' ? 'settled' : 'open';
    send(ctx, 200, play.myPicks(ctx, { open, graded, tab, record: record(store, ctx.user.id) }));
  }

  async function morePage(ctx) {
    if (!signedIn(ctx)) return;
    const liveCount = store.get("SELECT COUNT(*) AS n FROM games WHERE state = 'in'").n;
    send(ctx, 200, moreViews.more(ctx, { liveCount }));
  }

  async function livePage(ctx) {
    if (!signedIn(ctx)) return;
    const list = await games.live();
    const mine = new Map();
    if (list.length) {
      const rows = store.all(
        `SELECT game_id, market, side, line, odds, units FROM picks
          WHERE user_id = ? AND game_id IN (${list.map(() => '?').join(',')})`,
        ctx.user.id, ...list.map((g) => g.id),
      );
      for (const r of rows) mine.set(r.game_id, [...(mine.get(r.game_id) ?? []), r]);
    }
    send(ctx, 200, moreViews.live(ctx, { list, mine }));
  }

  function leaderboardPage(ctx) {
    const sport = SPORT[ctx.query.get('sport')] ?? null;
    const period = periodOf(ctx.query);
    send(ctx, 200, social.leaderboard(ctx, { sport, rows: leaderboard(store, { sport: sport?.key, period }, ctx.now) }));
  }

  function groupsPage(ctx) {
    if (!signedIn(ctx)) return;
    send(ctx, 200, social.groups(ctx, { list: groupsOf(store, ctx.user.id) }));
  }

  function groupCreate(ctx) {
    if (!signedIn(ctx)) return;
    const name = ctx.form.get('name') ?? '';
    const sport = ctx.form.get('sport') ?? '';
    const result = createGroup(store, { ownerId: ctx.user.id, name, sport, now: ctx.now });
    if (result.error) return send(ctx, 400, social.groups(ctx, { list: groupsOf(store, ctx.user.id), error: result.error, name, sport }));
    flash(ctx, 'ok', 'Group started. Send your friends the invite link below.');
    redirect(ctx, `/groups/${result.id}`);
  }

  function groupJoinByCode(ctx) {
    if (!signedIn(ctx)) return;
    if (!joinLimit.allow(`user ${ctx.user.id}`, ctx.now)) {
      return send(ctx, 429, social.groups(ctx, { list: groupsOf(store, ctx.user.id), error: 'Too many tries. Wait an hour and try again.' }));
    }
    const group = findByCode(store, ctx.form.get('code'));
    if (!group) return send(ctx, 400, social.groups(ctx, { list: groupsOf(store, ctx.user.id), error: 'No group has that code. Check it with whoever sent it.' }));
    joinGroup(store, { groupId: group.id, userId: ctx.user.id, now: ctx.now });
    flash(ctx, 'ok', `You're in ${group.name}.`);
    redirect(ctx, `/groups/${group.id}`);
  }

  function groupPage(ctx, { id }) {
    if (!signedIn(ctx)) return;
    const group = groupFor(store, Number(id), ctx.user.id);
    if (!group) return notFound(ctx);
    const rows = leaderboard(store, { groupId: group.id, sport: group.sport, period: periodOf(ctx.query) }, ctx.now);
    send(ctx, 200, social.group(ctx, {
      group,
      rows,
      members: membersOf(store, group.id),
      feed: groupFeed(store, group, ctx.now),
      inviteUrl: `${origin(ctx)}/join/${group.invite_code}`,
    }));
  }

  function groupLeave(ctx, { id }) {
    if (!signedIn(ctx)) return;
    const group = groupFor(store, Number(id), ctx.user.id);
    if (!group) return notFound(ctx);
    leaveGroup(store, { groupId: group.id, userId: ctx.user.id });
    flash(ctx, 'ok', `You left ${group.name}.`);
    redirect(ctx, '/groups');
  }

  function groupDelete(ctx, { id }) {
    if (!signedIn(ctx)) return;
    const group = groupFor(store, Number(id), ctx.user.id);
    if (!group || !deleteGroup(store, { groupId: group.id, userId: ctx.user.id })) return notFound(ctx);
    flash(ctx, 'ok', `${group.name} is gone. Everyone's picks stay on their records.`);
    redirect(ctx, '/groups');
  }

  function joinPage(ctx, { code }) {
    const group = findByCode(store, code);
    if (!group) return notFound(ctx);
    // Most people opening an invite are new, so send them to sign up.
    if (!ctx.user) return redirect(ctx, `/signup?next=${encodeURIComponent(`/join/${group.invite_code}`)}`);
    if (!signedIn(ctx)) return;
    const members = store.get('SELECT COUNT(*) AS n FROM group_members WHERE group_id = ?', group.id).n;
    send(ctx, 200, social.join(ctx, { group, members, already: Boolean(groupFor(store, group.id, ctx.user.id)) }));
  }

  function joinPost(ctx, { code }) {
    if (!signedIn(ctx)) return;
    const group = findByCode(store, code);
    if (!group) return notFound(ctx);
    joinGroup(store, { groupId: group.id, userId: ctx.user.id, now: ctx.now });
    flash(ctx, 'ok', `You're in ${group.name}.`);
    redirect(ctx, `/groups/${group.id}`);
  }

  function profilePage(ctx, { name }) {
    const player = store.get('SELECT id, screen_name, created_at, bio, link_url, link_label, first_name, last_name FROM users WHERE screen_name = ?', name);
    if (!player) return notFound(ctx);
    if (player.screen_name !== name) return redirect(ctx, `/u/${encodeURIComponent(player.screen_name)}`);
    const { picks, hidden } = publicPicks(store, player.id, { viewerId: ctx.user?.id, now: ctx.now });
    send(ctx, 200, social.profile(ctx, {
      player,
      record: record(store, player.id),
      bySport: recordBySport(store, player.id),
      series: unitsSeries(store, player.id, ctx.now),
      last10: lastTen(store, player.id),
      rank: rankOf(store, player.id, ctx.now),
      picks,
      hidden,
    }));
  }

  function themePost(ctx) {
    if (!signedIn(ctx)) return;
    const theme = ctx.form.get('theme');
    if (THEMES.includes(theme)) store.run('UPDATE users SET theme = ? WHERE id = ?', theme, ctx.user.id);
    redirect(ctx, `/u/${encodeURIComponent(ctx.user.screenName)}`);
  }

  function namePost(ctx) {
    if (!signedIn(ctx)) return;
    const first = auth.cleanName(ctx.form.get('first_name'));
    const last = auth.cleanName(ctx.form.get('last_name'));
    if (first.error || last.error) {
      flash(ctx, 'error', first.error ?? last.error);
    } else {
      store.run('UPDATE users SET first_name = ?, last_name = ? WHERE id = ?', first.name, last.name, ctx.user.id);
      flash(ctx, 'ok', first.name || last.name ? 'Name saved.' : 'Name removed.');
    }
    redirect(ctx, `/u/${encodeURIComponent(ctx.user.screenName)}`);
  }

  /** Delete the account and everything in it, after the password checks out. */
  async function deleteAccount(ctx) {
    if (!signedIn(ctx)) return;
    const row = store.get('SELECT password_hash FROM users WHERE id = ?', ctx.user.id);
    if (!(await auth.verifyPassword(ctx.form.get('password') ?? '', row.password_hash))) {
      flash(ctx, 'error', "That password didn't match, so nothing was deleted.");
      return redirect(ctx, `/u/${encodeURIComponent(ctx.user.screenName)}`);
    }
    // Hand any group this player owns to another member before the account goes.
    for (const g of store.all('SELECT id FROM friend_groups WHERE owner_id = ?', ctx.user.id)) {
      leaveGroup(store, { groupId: g.id, userId: ctx.user.id });
    }
    store.run('DELETE FROM users WHERE id = ?', ctx.user.id);
    setCookie(ctx, 'sid', '', 0);
    flash(ctx, 'ok', 'Your account and your picks are deleted.');
    redirect(ctx, '/');
  }

  function linkPost(ctx) {
    if (!signedIn(ctx)) return;
    const link = cleanLink(ctx.form.get('link_url'), ctx.form.get('link_label'));
    if (link.error) {
      flash(ctx, 'error', link.error);
    } else {
      store.run('UPDATE users SET link_url = ?, link_label = ? WHERE id = ?', link.url, link.label, ctx.user.id);
      flash(ctx, 'ok', link.url ? `Your ${link.label} button is on your profile.` : 'Link removed.');
    }
    redirect(ctx, `/u/${encodeURIComponent(ctx.user.screenName)}`);
  }

  function bioPost(ctx) {
    if (!signedIn(ctx)) return;
    // One paragraph: line breaks and runs of spaces fold into single spaces.
    const bio = String(ctx.form.get('bio') ?? '').replace(/\s+/g, ' ').trim();
    if (bio.length > BIO_MAX) {
      flash(ctx, 'error', `Keep your bio to ${BIO_MAX} characters.`);
    } else {
      store.run('UPDATE users SET bio = ? WHERE id = ?', bio || null, ctx.user.id);
      flash(ctx, 'ok', bio ? 'Bio saved.' : 'Bio cleared.');
    }
    redirect(ctx, `/u/${encodeURIComponent(ctx.user.screenName)}`);
  }

  function asset(ctx, { name }) {
    const file = assets.files.get(name);
    if (!file) return notFound(ctx);
    const pinned = ctx.query.get('v') === file.hash;
    if (ctx.req.headers['if-none-match'] === `"${file.hash}"`) {
      ctx.res.writeHead(304, { ETag: `"${file.hash}"` });
      return ctx.res.end();
    }
    ctx.res.writeHead(200, {
      ...SECURITY_HEADERS,
      'Content-Type': file.type,
      'Content-Length': file.body.length,
      ETag: `"${file.hash}"`,
      'Cache-Control': pinned ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    ctx.res.end(file.body);
  }

  // ---- routing --------------------------------------------------------------

  const routes = [
    ['GET', '/', home],
    ['GET', '/healthz', health],
    ['GET', '/static/:name', asset],
    ['GET', '/signup', signupForm],
    ['POST', '/signup', signup],
    ['GET', '/login', loginForm],
    ['POST', '/login', login],
    ['POST', '/logout', logout],
    ['GET', '/forgot', forgotForm],
    ['POST', '/forgot', forgot],
    ['GET', '/reset', resetForm],
    ['POST', '/reset', reset],
    ['GET', '/welcome', welcomeForm],
    ['POST', '/welcome', welcome],
    ['GET', '/games', gamesPage],
    ['GET', '/pick', pickForm],
    ['POST', '/picks', pickPost],
    ['GET', '/picks', myPicks],
    ['POST', '/picks/:id/delete', pickDelete],
    ['GET', '/leaderboard', leaderboardPage],
    ['GET', '/groups', groupsPage],
    ['POST', '/groups', groupCreate],
    ['POST', '/groups/join', groupJoinByCode],
    ['GET', '/groups/:id', groupPage],
    ['POST', '/groups/:id/leave', groupLeave],
    ['POST', '/groups/:id/delete', groupDelete],
    ['GET', '/join/:code', joinPage],
    ['POST', '/join/:code', joinPost],
    ['GET', '/u/:name', profilePage],
    ['GET', '/more', morePage],
    ['GET', '/live', livePage],
    ['POST', '/theme', themePost],
    ['POST', '/bio', bioPost],
    ['POST', '/link', linkPost],
    ['POST', '/name', namePost],
    ['POST', '/account/delete', deleteAccount],
    ['GET', '/verify', verify],
    ['POST', '/verify/resend', verifyResend],
    ['GET', '/terms', (ctx) => send(ctx, 200, legal.terms(ctx, { contact }))],
    ['GET', '/privacy', (ctx) => send(ctx, 200, legal.privacy(ctx, { contact }))],
  ].map(([method, pattern, handler]) => {
    const keys = [];
    const regex = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, key) => (keys.push(key), '([^/]+)'))}$`);
    return { method, regex, keys, handler };
  });

  function match(method, pathname) {
    const verb = method === 'HEAD' ? 'GET' : method;
    for (const r of routes) {
      if (r.method !== verb) continue;
      const m = r.regex.exec(pathname);
      if (!m) continue;
      try {
        return { handler: r.handler, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
      } catch {
        return null;
      }
    }
    return null;
  }

  return async function handle(req, res) {
    const url = new URL(req.url, 'http://local');
    const ctx = { req, res, app, url, query: url.searchParams, now: now(), origin: null, cookies: [], user: null, session: null, flash: null, form: null };
    try {
      ctx.origin = config.appUrl ?? origin(ctx);
      const route = match(req.method, url.pathname);
      if (!route) return notFound(ctx);

      const cookies = parseCookies(req.headers.cookie);
      ctx.session = auth.readSession(store, cookies.sid, ctx.now);
      ctx.user = ctx.session?.user ?? null;
      // The count on the My bets tab.
      if (ctx.user?.screenName) ctx.openBets = store.get('SELECT COUNT(*) AS n FROM picks WHERE user_id = ? AND result IS NULL', ctx.user.id).n;
      if (cookies.flash) {
        ctx.flash = readFlash(cookies.flash);
        setCookie(ctx, 'flash', '', 0);
      }

      if (req.method === 'POST') {
        if (!sameOrigin(req, config)) return send(ctx, 403, account.problem(ctx, { status: 403, text: 'That form came from another site.' }));
        ctx.form = await readForm(req);
        if (ctx.session && !sameToken(ctx.form.get('_csrf'), ctx.session.csrf)) {
          return send(ctx, 403, account.problem(ctx, { status: 403, text: 'That form was out of date. Go back, reload the page, and try again.' }));
        }
      }
      await route.handler(ctx, route.params);
    } catch (err) {
      if (res.headersSent) return res.destroy(err);
      if (err.status === 413) return send(ctx, 413, account.problem(ctx, { status: 413, text: 'That was more than a form should send.' }));
      log.error(err);
      send(ctx, 500, account.problem(ctx, {}));
    }
  };
}

// ---- request plumbing -------------------------------------------------------

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

function readFlash(value) {
  try {
    const { type, text, at } = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (typeof text !== 'string' || text.length >= 300) return null;
    const time = typeof at === 'string' && !Number.isNaN(Date.parse(at)) ? new Date(at).toISOString() : null;
    return { type: ['error', 'locked'].includes(type) ? type : 'ok', text, at: time };
  } catch {
    return null;
  }
}

async function readForm(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw Object.assign(new Error('form too large'), { status: 413 });
    chunks.push(chunk);
  }
  if (!String(req.headers['content-type'] ?? '').startsWith('application/x-www-form-urlencoded')) return new URLSearchParams();
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

/**
 * Browsers send Origin (and Sec-Fetch-Site) with every form post. Refuse one
 * that came from another site; a request with neither came from a script or
 * curl, which can't carry a victim's cookies anyway.
 */
function sameOrigin(req, config) {
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'none') return false;
  const from = req.headers.origin;
  if (!from) return true;
  try {
    const host = new URL(from).host;
    return host === req.headers.host || (config.trustProxy && host === req.headers['x-forwarded-host']);
  } catch {
    return false;
  }
}

function sameToken(a, b) {
  const x = Buffer.from(String(a ?? ''));
  const y = Buffer.from(String(b ?? ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** A local path to come back to after signing in, never another site. */
function safeNext(next) {
  return typeof next === 'string' && /^\/(?![/\\])[^\s\\]*$/.test(next) ? next : null;
}

function periodOf(query) {
  const key = query.get('period');
  return PERIODS.some((p) => p.key === key) ? key : 'all';
}

function loadAssets() {
  const types = {
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.png': 'image/png',
    '.woff2': 'font/woff2',
    '.webmanifest': 'application/manifest+json',
  };
  const files = new Map();
  for (const name of fs.readdirSync(PUBLIC_DIR)) {
    const body = fs.readFileSync(path.join(PUBLIC_DIR, name));
    const hash = crypto.createHash('sha256').update(body).digest('hex').slice(0, 12);
    files.set(name, { body, hash, type: types[path.extname(name)] ?? 'application/octet-stream' });
  }
  return { files, url: (name) => `/static/${name}?v=${files.get(name).hash}` };
}
