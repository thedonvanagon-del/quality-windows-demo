// Every page and form. Plain Node http: a route table, a context per request,
// and handlers that render views or redirect.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as auth from './auth.js';
import { badgesOf, topBadges } from './badges.js';
import { clvSummary } from './clv.js';
import { chatCounts, chatGames, deleteMessage, HIDE_AFTER_REPORTS, markGroupRead, messages, postMessage, removeMessage, reportedMessages, reportMessage, restoreMessage, threadOfMessage, unreadCounts } from './chat.js';
import { CITY, cityGroups } from './cities.js';
import { allRooms, archiveRoom, createGroup, deleteGroup, findByCode, groupFor, groupsOf, joinGroup, joinRoom, leaveGroup, localRooms, membersOf, renameRoom, roomFor, roomsOf, setHomeCity, settleHomeCity, startRoom } from './groups.js';
import { follow, followCounts, followingAmong, followingList, isFollowing, unfollow } from './follows.js';
import { alertPrefs, followedGameIds, followGame, GAME_ALERTS, isFollowingGame, saveAlertPrefs, unfollowGame } from './gamealerts.js';
import { followFeed, groupFeed, ownPick, ownPicks, picksForGames, picksOnGames, publicPicks } from './history.js';
import { SITE_URL, THEMES } from './config.js';
import { clearPhoto, cleanImage, deleteFile, dismissPhoto, filesOf, KINDS, kindOf, MEDIA_NAME, MEDIA_TYPES, mediaDir, mediaOwner, parseMultipart, PHOTO_BLOCK_DAYS, PHOTO_HIDE_AFTER, photosFor, removeReportedPhoto, reportedBy, reportedPhotos, reportPhoto, savePhoto, tooBigText, uploadBlockedUntil } from './photos.js';
import { cleanHex, customTokens, parseSheet, styleOf, teamAccent, teamByKey, teamsBySport, themeCss } from './themes.js';
import { CONTEST_MIN, results, standings, timeLeft, weekBounds, winnersWall } from './contest.js';
import { cupHistory, cupLine, cupStandings, cupWinners, cupYear, cupYears } from './cup.js';
import { seasonWeeks } from './nflweeks.js';
import * as pickem from './pickem.js';
import * as survivor from './survivor.js';
import * as bracket from './bracket.js';
import * as leagues from './leagues.js';
import * as prizes from './prizes.js';
import { LOGO_HOST } from './espn.js';
import { toGame } from './games.js';
import { countInvite, findInviter, followInviter, inviteCodeOf, inviteStats } from './invites.js';
import { cleanLink } from './links.js';
import { createMailer } from './mail.js';
import { earnedOf, ICONS, NAME_COLORS, nametagsFor, resolveColor, resolveIcon, saveNametag } from './nametags.js';
import { changeScreenName, nameProblem, nextNameChange, renamedTo } from './names.js';
import { createNotifier } from './notify.js';
import { ensureOfficial } from './official.js';
import { addLeg, deleteParlay, draftLegs, draftOnGames, draftSummary, lockParlay, parlayGameIds, pruneDraft, removeLeg } from './parlays.js';
import { validSubscription } from './push.js';
import { deletePick, formatLine, formatOdds, formatUnits, isLocked, makePick, MARKETS, price, toWin } from './picks.js';
import { SPORT, SPORTS } from './sports.js';
import { hideLocksCard, locksCardHidden, officialOnGames, setShowSitePicks, showsSitePicks, todaysSitePicks } from './site.js';
import { setStreak, streakBoards, streakOf, streakPickOn } from './streak.js';
import { createTeamCatalog } from './teams.js';
import {
  accessTo, adminList, byCode, bySlug, cancelTournament, canChat, cardOf, createCustom, createPlayerTournament, dismissTournamentReports, entrantCount,
  entryOf, findTournament, formDefaults, groupChoices, groupTournaments, hostOf, hub, invitePath, joinTournament, leaveTournament, liveStandingsOf,
  reportedByMe, reportedTournaments, reportTournament, standingsOf, tournamentWinners,
} from './tournaments.js';
import { addDays, dateLabel, etDay, mondayOf, weekLabel } from './time.js';
import { breakdown, hotStreaks, lastTen, leaderboard, PERIODS, rankOf, record, recordBySport, searchPlayers, splits, unitsSeries } from './stats.js';
import * as account from './views/account.js';
import * as alertViews from './views/alerts.js';
import * as legal from './views/legal.js';
import * as local from './views/local.js';
import * as moreViews from './views/more.js';
import * as play from './views/play.js';
import * as social from './views/social.js';
import * as tourneyViews from './views/tournaments.js';
import * as formats from './views/formats.js';
import * as bracketViews from './views/bracket.js';
import * as leagueViews from './views/leagues.js';
import * as prizeViews from './views/prizes.js';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const MAX_BODY = 16 * 1024;
// A photo upload: the photo (1 MB at most, a cover 2 MB) plus room for the form around it.
const UPLOAD_ROOM = 16 * 1024;
// A body that's too big is still read to the end (and thrown away) up to
// these sizes, so the browser hears why. Past them the connection just closes.
const DRAIN_FORM = 1024 * 1024;
const DRAIN_UPLOAD = 12 * 1024 * 1024;
export const BIO_MAX = 160;

const SECURITY_HEADERS = {
  'Content-Security-Policy':
    `default-src 'self'; img-src 'self' data: https://${LOGO_HOST}; style-src 'self'; script-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'`,
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

// How long away from the app before opening it shows the launch screen again.
const SPLASH_AWAY_SECONDS = 20 * 60;

export function createApp({ store, games, espn = null, config, mailer = createMailer({ log: { log() {} } }), notifier = createNotifier({ store }), push = null, summaries = null, teams = null, now = () => new Date(), log = console }) {
  const assets = loadAssets();
  // Team logos for scoreboard icons. Without one passed in (tests, the demo)
  // it never fetches: it uses what's stored, else the teams in the games table.
  const catalog = teams ?? createTeamCatalog({ store, log });
  const media = mediaDir(config.mediaDir ?? 'data/media');
  const app = {
    name: config.appName,
    shortName: config.appShortName ?? config.appName,
    motto: 'Made to show the true skill of real handicappers with nothing to hide.',
    theme: config.theme ?? THEMES[0],
    // www.bookiebullies.com, for links to the site (src/site.js).
    site: config.siteUrl ?? SITE_URL,
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
  const chatLimit = auth.rateLimiter({ limit: 8, windowMs: 60_000 });
  const contact = config.contactEmail ?? 'hello@bookiebullies.com';
  const admins = new Set((config.adminEmails ?? []).map((e) => String(e).trim().toLowerCase()));
  // Only a confirmed email counts, so signing up with an admin's address isn't enough.
  const isAdmin = (ctx) => Boolean(ctx.user?.screenName && ctx.user.verified && admins.has(ctx.user.email.toLowerCase()));

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

  /** A one-time note for the next page. `game` (a LOCKED ticket's game) puts the ticket on that game's card on the board. */
  function flash(ctx, type, text, at, game) {
    setCookie(ctx, 'flash', Buffer.from(JSON.stringify({ type, text, at, game })).toString('base64url'), 60);
  }

  function headers(ctx, extra) {
    const out = { ...SECURITY_HEADERS, ...extra };
    if (secure(ctx)) out['Strict-Transport-Security'] = 'max-age=31536000';
    if (ctx.cookies.length) out['Set-Cookie'] = ctx.cookies;
    return out;
  }

  function send(ctx, status, page) {
    const body = String(page);
    // A page went out: hold off the launch screen until 20 minutes of being away.
    if (ctx.pageShown) ctx.cookies.push(['bb_seen=1', 'Path=/', `Max-Age=${SPLASH_AWAY_SECONDS}`, 'HttpOnly', 'SameSite=Lax', ...(secure(ctx) ? ['Secure'] : [])].join('; '));
    ctx.res.writeHead(status, headers(ctx, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body) }));
    ctx.res.end(body);
  }

  function redirect(ctx, location, status = 303) {
    ctx.res.writeHead(status, headers(ctx, { Location: location, 'Cache-Control': 'no-store' }));
    ctx.res.end();
  }

  const notFound = (ctx) => send(ctx, 404, account.notFound(ctx));

  /** A fetch from app.js that asked for JSON back instead of a redirect. */
  const wantsJson = (ctx) => /application\/json/.test(ctx.req.headers.accept ?? '');

  function sendJson(ctx, status, data) {
    const body = JSON.stringify(data);
    ctx.res.writeHead(status, headers(ctx, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body) }));
    ctx.res.end(body);
  }

  /**
   * Put each row's look on it, by the player id in `key`: `photo` (null if
   * none or hidden), and `nameColor` and `nameIcon` (null unless they chose
   * one that still checks out).
   */
  function withLooks(rows, key = 'id') {
    const ids = rows.map((r) => r[key]);
    const photos = photosFor(store, ids);
    const tags = nametagsFor(store, ids, catalog);
    for (const r of rows) {
      const tag = tags.get(r[key]);
      r.photo = photos.get(r[key]) ?? null;
      r.nameColor = tag?.color ?? null;
      r.nameIcon = tag?.icon ?? null;
    }
    return rows;
  }

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
    send(ctx, 200, account.home(ctx, { top: withLooks(leaderboard(store, { period: '30' }, ctx.now, 10)) }));
  }

  /**
   * For uptime monitors (and the deploy check): "ok" only if the database
   * answers, so a broken database sets off the alert too, not just a dead app.
   */
  function health(ctx) {
    let ok = false;
    try {
      ok = store.get('SELECT 1 AS ok')?.ok === 1;
    } catch {
      ok = false;
    }
    ctx.res.writeHead(ok ? 200 : 503, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
    ctx.res.end(ok ? 'ok' : 'database not answering');
  }

  /** The player whose invite link brought this visitor, from the form, the address or the invite cookie. */
  const inviterOf = (ctx, code) => findInviter(store, code || ctx.cookieValues.invite);

  function signupForm(ctx) {
    if (ctx.user) return redirect(ctx, '/');
    send(ctx, 200, account.signup(ctx, { next: safeNext(ctx.query.get('next')), inviter: inviterOf(ctx, ctx.query.get('invite')) }));
  }

  /**
   * A player's invite link. Visitors go to signup with the inviter
   * remembered (in the form, and in a cookie in case they wander off first).
   * Someone already signed in just sees the inviter's profile.
   */
  function inviteLink(ctx, { code }) {
    const inviter = findInviter(store, code);
    if (!inviter) return notFound(ctx);
    if (ctx.user) return redirect(ctx, `/u/${encodeURIComponent(inviter.screen_name)}`);
    setCookie(ctx, 'invite', inviter.code, 30 * 86_400);
    redirect(ctx, `/signup?invite=${inviter.code}`);
  }

  async function signup(ctx) {
    const email = auth.normalizeEmail(ctx.form.get('email'));
    const password = ctx.form.get('password') ?? '';
    const next = safeNext(ctx.form.get('next'));
    const adult = ctx.form.get('adult') === 'on';
    const terms = ctx.form.get('terms') === 'on';
    const inviter = inviterOf(ctx, ctx.form.get('invite'));
    const again = (status, error) => send(ctx, status, account.signup(ctx, { email, error, next, adult, terms, inviter }));
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
        'INSERT INTO users (email, password_hash, created_at, age_confirmed_at, terms_accepted_at, invited_by) VALUES (?, ?, ?, ?, ?, ?)',
        email, hash, at, at, at, inviter?.id ?? null,
      ).lastInsertRowid);
    } catch (err) {
      if (/UNIQUE/.test(err.message)) return taken();
      throw err;
    }
    startSession(ctx, id);
    if (ctx.cookieValues.invite) setCookie(ctx, 'invite', '', 0);
    await sendVerify(ctx, id, email);
    redirect(ctx, `/welcome${next ? `?next=${encodeURIComponent(next)}` : ''}`);
  }

  function verify(ctx) {
    const userId = auth.useVerify(store, ctx.query.get('token'), ctx.now);
    if (!userId) return send(ctx, 400, account.verifyDead(ctx));
    // A friend's invite counts once the email is confirmed (and there's a screen name).
    countInvite(store, userId, ctx.now, notifier);
    // A home city picked before confirming gets its room now.
    settleHomeCity(store, userId, ctx.now);
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
    const problem = nameProblem(store, name, { now: ctx.now });
    if (problem) return again(problem);
    if (first.error || last.error) return again(first.error ?? last.error);
    try {
      store.run('UPDATE users SET screen_name = ?, first_name = ?, last_name = ? WHERE id = ? AND screen_name IS NULL', name, first.name, last.name, ctx.user.id);
    } catch (err) {
      if (/UNIQUE/.test(err.message)) return again('Someone already has that name. Try another.');
      throw err;
    }
    // Whoever invited them: followed now, and counted once the email is confirmed too.
    followInviter(store, ctx.user.id, ctx.now);
    countInvite(store, ctx.user.id, ctx.now, notifier);
    // First-time setup comes next, once.
    redirect(ctx, `/setup${next ? `?next=${encodeURIComponent(next)}` : ''}`);
  }

  // ---- first-time setup -------------------------------------------------------

  function setupForm(ctx) {
    if (!signedIn(ctx)) return;
    const next = safeNext(ctx.query.get('next'));
    if (ctx.user.setupDone) return redirect(ctx, next ?? '/games');
    const officialId = ensureOfficial(store, ctx.now);
    const official = officialId
      ? { id: officialId, screen_name: store.get('SELECT screen_name FROM users WHERE id = ?', officialId).screen_name, official: true, ...record(store, officialId) }
      : null;
    // The top of the all-time board: ranked players first.
    const players = leaderboard(store, {}, ctx.now, 20).filter((r) => !r.official && r.id !== ctx.user.id).slice(0, 5);
    send(ctx, 200, account.setup(ctx, { official, players, next, cities: cityGroups() }));
  }

  /** Finish setup: follow the official account (and whoever else was checked), and remember the sports. */
  function finishSetup(ctx, { sports = [], follows = [] }) {
    const officialId = ensureOfficial(store, ctx.now);
    store.tx(() => {
      for (const id of new Set(follows)) {
        if (store.get('SELECT 1 AS x FROM users WHERE id = ? AND screen_name IS NOT NULL', id)) {
          follow(store, { followerId: ctx.user.id, followeeId: id, now: ctx.now });
        }
      }
      store.run('UPDATE users SET fav_sports = ?, setup_done = 1 WHERE id = ?', sports.join(',') || null, ctx.user.id);
    });
    return officialId;
  }

  function setupPost(ctx) {
    if (!signedIn(ctx)) return;
    const next = safeNext(ctx.form.get('next'));
    if (ctx.user.setupDone) return redirect(ctx, next ?? '/games');
    const sports = SPORTS.map((s) => s.key).filter((key) => ctx.form.getAll('sport').includes(key));
    const follows = ctx.form.getAll('follow').map(Number).filter((id) => Number.isInteger(id) && id > 0);
    finishSetup(ctx, { sports, follows });
    // Your city: joins its room (starting it once the email is confirmed).
    const home = ctx.form.get('city') ? setHomeCity(store, { userId: ctx.user.id, citySlug: ctx.form.get('city'), now: ctx.now, canStart: ctx.user.verified }) : {};
    if (home.error) flash(ctx, 'error', home.error);
    else flash(ctx, 'ok', `You're on the board, ${ctx.user.screenName}. Go make a pick.`);
    redirect(ctx, next ?? (sports.length ? `/games?sport=${sports[0]}` : '/games'));
  }

  /** Skip still follows the official account, so Following isn't empty. */
  function setupSkip(ctx) {
    if (!signedIn(ctx)) return;
    const next = safeNext(ctx.form.get('next'));
    if (!ctx.user.setupDone) {
      const officialId = ensureOfficial(store, ctx.now);
      finishSetup(ctx, { follows: officialId ? [officialId] : [] });
      flash(ctx, 'ok', `You're on the board, ${ctx.user.screenName}. Go make a pick.`);
    }
    redirect(ctx, next ?? '/games');
  }

  async function gamesPage(ctx) {
    if (!signedIn(ctx)) return;
    // No sport asked for (or one we don't know): All, every sport's games today and tomorrow (ET).
    const sport = SPORT[ctx.query.get('sport')] ?? null;
    if (!sport) ctx.query.delete('sport');
    const sports = sport ? [sport] : SPORTS;
    const boards = await Promise.all(sports.map((s) => games.upcoming(s.key)));
    let list = boards.flat();
    if (!sport) {
      const last = addDays(etDay(ctx.now), 1);
      list = list.filter((g) => etDay(g.start) <= last).sort((a, b) => a.start.localeCompare(b.start) || a.sport.localeCompare(b.sport) || a.home.name.localeCompare(b.home.name));
    }
    // Games under way, for Live now (after the boards, so today's read is shared).
    const live = (await games.live()).filter((g) => !sport || g.sport === sport.key);
    const ids = [...live, ...list].map((g) => g.id);
    const mine = picksForGames(store, ctx.user.id, ids);
    const chats = chatCounts(store, ids);
    const split = splits(store, ids);
    const draft = draftOnGames(store, ctx.user.id, list.map((g) => g.id));
    // The official account's picks: a chip on each game it picked, and today's count up top.
    const site = showsSitePicks(ctx.user);
    const bb = site ? officialOnGames(store, list.map((g) => g.id)) : new Map();
    const locks = site && !locksCardHidden(ctx.user, ctx.now) ? todaysSitePicks(store, ctx.now) : null;
    const problem = sports.some((s) => games.problem(s.key));
    const follows = followedGameIds(store, ctx.user.id, ids);
    send(ctx, 200, play.games(ctx, { sport, list, live, mine, draft, chats, split, bb, locks, problem, follows }));
  }

  // ---- www.bookiebullies.com on the board (src/site.js) -----------------------

  /** What a BB Pick chip opens: the model's picks on one game. A page, so it works without JavaScript; app.js shows it in the sheet. */
  function sitePicksPage(ctx, { id }) {
    if (!signedIn(ctx)) return;
    const game = games.get(id);
    if (!game) return notFound(ctx);
    const picks = officialOnGames(store, [game.id]).get(game.id) ?? [];
    send(ctx, 200, play.sitePicks(ctx, { game, picks }));
  }

  /** The × on the Locks card: hidden until the next ET day. */
  function locksCardDismiss(ctx) {
    if (!signedIn(ctx)) return;
    hideLocksCard(store, ctx.user.id, ctx.now);
    redirect(ctx, safeNext(ctx.form.get('next')) ?? '/games');
  }

  /** "Show Bookie Bullies picks on the board", from profile settings. */
  function sitePicksSetting(ctx) {
    if (!signedIn(ctx)) return;
    setShowSitePicks(store, ctx.user.id, ctx.form.get('show') === 'on');
    flash(ctx, 'ok', 'Saved.');
    redirect(ctx, `/u/${encodeURIComponent(ctx.user.screenName)}#bb-picks`);
  }

  async function pickForm(ctx) {
    if (!signedIn(ctx)) return;
    const market = ctx.query.get('market');
    const side = ctx.query.get('side');
    // Show the slip from the cached line right away; the pick is checked
    // against the live line when it's sent.
    const { game } = await games.current(ctx.query.get('game') ?? '', { wait: false });
    if (!game || !MARKETS[market]?.includes(side)) return notFound(ctx);
    const board = boardOf(ctx.query.get('board'));
    const back = boardPath(board, game);
    if (isLocked(game, ctx.now)) {
      flash(ctx, 'error', 'That game has started. Picks lock at the start.');
      return redirect(ctx, back);
    }
    const current = price(game, market, side);
    if (!current) {
      flash(ctx, 'error', 'That line is off the board right now.');
      return redirect(ctx, back);
    }
    send(ctx, 200, play.slip(ctx, { game, market, side, current, board, streak: streakChoice(ctx, game), survivor: survivorChoice(ctx, game, market, side) }));
  }

  /** The board a pick slip came from: 'all', a sport, or null (the game's own sport). */
  function boardOf(value) {
    return value === 'all' || SPORT[value] ? value : null;
  }

  /** Back to the board the player came from: All, or a sport's. */
  function boardPath(board, game) {
    return board === 'all' ? '/games' : `/games?sport=${board ?? game.sport}`;
  }

  /** Whether the slip offers "Use Chiefs as my Survivor pick for Week 10" (src/survivor.js). */
  function survivorChoice(ctx, game, market, side, checked = false) {
    const choice = survivor.slipChoice(store, { userId: ctx.user.id, game, market, side, now: ctx.now });
    return choice ? { ...choice, checked: checked && !choice.usedIn } : null;
  }

  /** Whether the slip offers "Make this my Streak pick": only if that game's day has none yet. */
  function streakChoice(ctx, game, checked = false) {
    const day = etDay(game.start);
    if (streakPickOn(store, ctx.user.id, day)) return null;
    return { today: day === etDay(ctx.now), day, checked };
  }

  async function pickPost(ctx) {
    if (!signedIn(ctx)) return;
    const market = ctx.form.get('market');
    const side = ctx.form.get('side');
    const units = Number(String(ctx.form.get('units') ?? '').replace(/[u,\s]/gi, ''));
    const seen = { line: ctx.form.get('line') ? Number(ctx.form.get('line')) : null, odds: Number(ctx.form.get('odds')) };
    const wantsStreak = ctx.form.get('streak') === 'on';
    const wantsSurvivor = ctx.form.get('survivor') === 'on';
    const { game, stale } = await games.current(ctx.form.get('game') ?? '');
    if (!game || !MARKETS[market]?.includes(side)) return notFound(ctx);
    const streak = streakChoice(ctx, game, wantsStreak);
    const surv = survivorChoice(ctx, game, market, side, wantsSurvivor);
    // Back to the same game on the board it came from, not the top of the page.
    const board = boardOf(ctx.form.get('board'));
    const back = `${boardPath(board, game)}#${play.cardId(game.id)}`;
    const current = price(game, market, side);
    if (!isLocked(game, ctx.now) && current && stale) {
      return send(ctx, 503, play.slip(ctx, { game, market, side, current, units, board, streak, survivor: surv, error: "Can't reach live lines right now, so picks are paused. Try again in a minute." }));
    }
    const result = makePick(store, { userId: ctx.user.id, game, market, side, units, seen, now: ctx.now, streak: wantsStreak });
    if (result.moved) return send(ctx, 409, play.slip(ctx, { game, market, side, current: result.moved, units, board, streak, survivor: surv, error: result.error }));
    if (result.error) {
      if (current && !isLocked(game, ctx.now) && !/already/.test(result.error)) {
        return send(ctx, 400, play.slip(ctx, { game, market, side, current, units: Number.isFinite(units) ? units : undefined, board, streak, survivor: surv, error: result.error }));
      }
      flash(ctx, 'error', result.error);
      return redirect(ctx, back);
    }
    notifier.pickMade({ player: ctx.user, game, now: ctx.now });
    let note = result.streak ? '. Your Streak pick' : result.streakTaken ? ". You already had a Streak pick that day, so this one isn't" : '';
    // The Survivor pick goes in with the bet: only whether the team wins counts for it.
    if (wantsSurvivor && surv && !surv.usedIn) {
      const picked = survivor.setSurvivorPick(store, { state: survivor.survivorState(store, ctx.now), userId: ctx.user.id, game, side, now: ctx.now });
      note += picked.error ? `. Survivor pick not saved: ${picked.error.replace(/\.$/, '')}` : `. ${picked.name} is your Week ${picked.week} Survivor pick`;
    }
    flash(ctx, 'locked', `${formatLine(market, side, current, game)}, ${formatUnits(result.units)} to win ${formatUnits(toWin(current.odds, result.units))}${note}`, ctx.now.toISOString(), game.id);
    redirect(ctx, back);
  }

  /** Make an open pick the Streak pick for its day, or take that back. Never once the game starts. */
  async function pickStreak(ctx, { id }) {
    if (!signedIn(ctx)) return;
    const row = store.get('SELECT game_id FROM picks WHERE id = ? AND user_id = ?', Number(id), ctx.user.id);
    if (!row) return notFound(ctx);
    const { game } = await games.current(row.game_id);
    const on = ctx.form.get('on') === '1';
    const result = setStreak(store, { userId: ctx.user.id, pickId: Number(id), game, on, now: ctx.now });
    flash(ctx, result.error ? 'error' : 'ok', result.error ?? (on ? 'That\'s your Streak pick for the day.' : 'Not your Streak pick anymore.'));
    redirect(ctx, safeNext(ctx.form.get('next')) ?? '/picks');
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
    // Days that already have a Streak pick, so the others can offer one.
    const streakDays = new Set(store.all('SELECT streak_day FROM picks WHERE user_id = ? AND streak_day IS NOT NULL AND result IS NULL', ctx.user.id).map((r) => r.streak_day));
    send(ctx, 200, play.myPicks(ctx, { open, graded, tab, record: record(store, ctx.user.id), streakDays }));
  }

  // ---- parlays --------------------------------------------------------------

  /** "Add to parlay" on the pick slip: the leg goes in the draft at the board's line. */
  async function parlayLegAdd(ctx) {
    if (!signedIn(ctx)) return;
    const market = ctx.form.get('market');
    const side = ctx.form.get('side');
    const { game } = await games.current(ctx.form.get('game') ?? '', { wait: false });
    if (!game || !MARKETS[market]?.includes(side)) return notFound(ctx);
    const result = addLeg(store, { userId: ctx.user.id, game, market, side, now: ctx.now });
    if (result.error) flash(ctx, 'error', result.error);
    else if (result.replaced) flash(ctx, 'ok', `Swapped ${result.replaced} for ${result.added} in your parlay. One leg per game.`);
    else flash(ctx, 'ok', `Added ${result.added} to your parlay. ${result.legs < 2 ? 'Add a leg from another game.' : `${result.legs} legs.`}`);
    redirect(ctx, `${boardPath(boardOf(ctx.form.get('board')), game)}#${play.cardId(game.id)}`);
  }

  function parlayLegRemove(ctx, { game }) {
    if (!signedIn(ctx)) return;
    removeLeg(store, { userId: ctx.user.id, gameId: game });
    redirect(ctx, '/parlay');
  }

  /** The parlay being built. Legs whose game has started drop out, with a note. */
  function parlayPage(ctx) {
    if (!signedIn(ctx)) return;
    const notes = pruneDraft(store, ctx.user.id, ctx.now);
    send(ctx, 200, play.parlayPage(ctx, { legs: draftLegs(store, ctx.user.id), notes }));
  }

  /** Lock parlay: every leg checked against the live line, like a straight pick. */
  async function parlayPost(ctx) {
    if (!signedIn(ctx)) return;
    const units = Number(String(ctx.form.get('units') ?? '').replace(/[u,\s]/gi, ''));
    const fetched = await Promise.all(draftLegs(store, ctx.user.id).map((leg) => games.current(leg.gameId)));
    const live = new Map(fetched.filter((f) => f.game).map((f) => [f.game.id, f.game]));
    const again = (status, extra) => send(ctx, status, play.parlayPage(ctx, {
      legs: draftLegs(store, ctx.user.id), units: Number.isFinite(units) && units > 0 ? units : undefined, ...extra,
    }));
    if (fetched.some((f) => f.game && f.stale && !isLocked(f.game, ctx.now))) {
      return again(503, { error: "Can't reach live lines right now, so picks are paused. Try again in a minute." });
    }
    const result = lockParlay(store, { userId: ctx.user.id, live, units, seen: ctx.form.get('seen') ?? '', now: ctx.now });
    if (result.error) return again(result.changed ? 409 : 400, { notes: result.notes, error: result.error });
    const first = [...live.values()].sort((a, b) => a.start.localeCompare(b.start))[0];
    notifier.pickMade({ player: ctx.user, game: first, legs: result.legs, now: ctx.now });
    flash(ctx, 'locked', `${result.legs}-leg parlay (${formatOdds(result.odds)}), ${formatUnits(result.units)} to win ${formatUnits(result.toWin)}`, ctx.now.toISOString());
    redirect(ctx, '/picks');
  }

  async function parlayDelete(ctx, { id }) {
    if (!signedIn(ctx)) return;
    const ids = parlayGameIds(store, { userId: ctx.user.id, parlayId: Number(id) });
    if (!ids.length) return notFound(ctx);
    const list = (await Promise.all(ids.map((gameId) => games.current(gameId)))).map((r) => r.game);
    const result = deleteParlay(store, { userId: ctx.user.id, parlayId: Number(id), games: list, now: ctx.now });
    flash(ctx, result.error ? 'error' : 'ok', result.error ?? 'Parlay deleted.');
    redirect(ctx, '/picks');
  }

  // ---- game chat ------------------------------------------------------------

  const gamePath = (id) => `/games/${encodeURIComponent(id)}`;

  /** One game: its lines (or score), injuries and form before the start, and the chat about it. */
  function gamePage(ctx, { id }) {
    if (!signedIn(ctx)) return;
    const game = games.get(id);
    if (!game) return notFound(ctx);
    const started = isLocked(game, ctx.now);
    const list = withLooks(messages(store, { gameId: game.id }), 'user_id');
    // Picks show beside names only once the game starts, like everywhere else.
    const picksBy = new Map();
    if (started && list.length) {
      for (const p of store.all('SELECT user_id, market, side, line, odds, units FROM picks WHERE game_id = ?', game.id)) {
        picksBy.set(p.user_id, [...(picksBy.get(p.user_id) ?? []), p]);
      }
    }
    const mine = picksOnGames(store, ctx.user.id, [game.id]).get(game.id) ?? {};
    const leg = draftOnGames(store, ctx.user.id, [game.id]).get(game.id) ?? null;
    // Injuries and recent form, before the start: from the cache only, never waiting on ESPN.
    const insight = started ? null : summaries?.peek(game) ?? null;
    // The follow bell by the title: not on a finished game, unless it's still followed (to unfollow).
    const following = isFollowingGame(store, ctx.user.id, game.id);
    const bell = game.state !== 'post' || following ? alertViews.followBell(ctx, game.id, { following, next: gamePath(game.id) }) : null;
    send(ctx, 200, play.gamePage(ctx, { game, started, messages: list, picksBy, mine, leg, split: splits(store, [game.id]).get(game.id) ?? null, insight, bell }));
  }

  // ---- follow a game (src/gamealerts.js) ----------------------------------------

  /** The bell: follow a game. app.js sends it with fetch and asks for JSON; without JavaScript it redirects to `next`. */
  function gameFollow(ctx, { id }) {
    if (!signedIn(ctx)) return;
    const game = games.get(id);
    if (!game) return notFound(ctx);
    const result = followGame(store, { userId: ctx.user.id, game, now: ctx.now });
    const message = result.error ?? (game.state === 'pre' ? "Following. We'll ping you when it starts." : "Following. We'll ping you as it goes.");
    if (wantsJson(ctx)) {
      return sendJson(ctx, result.error ? 409 : 200, { following: !result.error, message, bell: result.error ? null : String(alertViews.followBell(ctx, game.id, { following: true })) });
    }
    flash(ctx, result.error ? 'error' : 'ok', message);
    redirect(ctx, safeNext(ctx.form.get('next')) ?? gamePath(game.id));
  }

  /** "Unfollow game", from the game alerts page (or sheet). */
  function gameUnfollow(ctx, { id }) {
    if (!signedIn(ctx)) return;
    const game = games.get(id);
    if (!game) return notFound(ctx);
    unfollowGame(store, { userId: ctx.user.id, gameId: game.id });
    const message = 'Unfollowed. No more alerts on this game.';
    if (wantsJson(ctx)) {
      // The bell to put back on the page: a follow form (none on a finished game).
      const bell = game.state === 'post' ? '' : String(alertViews.followBell(ctx, game.id, { following: false, next: gamePath(game.id) }));
      return sendJson(ctx, 200, { following: false, message, bell });
    }
    flash(ctx, 'ok', message);
    redirect(ctx, safeNext(ctx.form.get('next')) ?? gamePath(game.id));
  }

  /** What a followed bell opens: the five alerts and Unfollow. A page; app.js shows it in the sheet. */
  function gameAlertsPage(ctx, { id }) {
    if (!signedIn(ctx)) return;
    const game = games.get(id);
    if (!game) return notFound(ctx);
    const phones = store.get('SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?', ctx.user.id).n;
    send(ctx, 200, alertViews.gameAlertsPage(ctx, {
      game, following: isFollowingGame(store, ctx.user.id, game.id), prefs: alertPrefs(store, ctx.user.id), phones, pushKey: push?.publicKey() ?? null,
    }));
  }

  /** The five game alert settings. Every game the player follows uses them. */
  function gameAlertsSettings(ctx) {
    if (!signedIn(ctx)) return;
    saveAlertPrefs(store, ctx.user.id, Object.fromEntries(GAME_ALERTS.map((a) => [a.key, ctx.form.get(a.key) === 'on'])));
    if (wantsJson(ctx)) return sendJson(ctx, 200, { saved: true, message: 'Saved.' });
    flash(ctx, 'ok', 'Saved. These apply to every game you follow.');
    redirect(ctx, safeNext(ctx.form.get('next')) ?? '/notifications');
  }

  /**
   * Post to a thread, after the same checks for a game, a group or a
   * tournament: a confirmed email and the rate limit (eight a minute, every
   * thread together).
   */
  function postChat(ctx, where) {
    if (!ctx.user.verified) {
      flash(ctx, 'error', 'Confirm your email to chat. The link is in your inbox.');
    } else if (!chatLimit.allow(`user ${ctx.user.id}`, ctx.now)) {
      flash(ctx, 'error', 'Slow down a little. Try again in a minute.');
    } else {
      const result = postMessage(store, { ...where, userId: ctx.user.id, text: ctx.form.get('body'), now: ctx.now });
      if (result.error) flash(ctx, 'error', result.error);
    }
  }

  function chatPost(ctx, { id }) {
    if (!signedIn(ctx)) return;
    const game = games.get(id);
    if (!game) return notFound(ctx);
    postChat(ctx, { gameId: game.id });
    redirect(ctx, `${gamePath(game.id)}#chat`);
  }

  /** Where a thread lives: its game's page, its group's or its tournament's. */
  function threadPath(where) {
    if (where?.groupId != null) return `/groups/${where.groupId}#chat`;
    if (where?.tournamentId != null) {
      const slug = store.get('SELECT slug FROM tournaments WHERE id = ?', where.tournamentId)?.slug;
      return slug ? `/tournaments/${slug}#chat` : '/tournaments';
    }
    return where?.gameId ? `${gamePath(where.gameId)}#chat` : '/chat';
  }

  /** The thread a message is in, if this player may see it. Group threads are for members only, tournament threads for entrants. */
  function visibleThread(ctx, messageId) {
    const where = threadOfMessage(store, messageId);
    if (!where) return { where: null };
    if (where.groupId != null && !groupFor(store, where.groupId, ctx.user.id)) return null;
    if (where.tournamentId != null) {
      const t = store.get('SELECT * FROM tournaments WHERE id = ?', where.tournamentId);
      if (!t || !canChat(store, t, ctx.user.id)) return null;
    }
    return { where };
  }

  function chatDelete(ctx, { id }) {
    if (!signedIn(ctx)) return;
    const seen = visibleThread(ctx, Number(id));
    if (!seen) return notFound(ctx);
    // Local rooms have no owner: admins take down anything in them.
    const result = isAdmin(ctx) && seen.where?.groupId != null && isLocal(seen.where.groupId)
      ? removeMessage(store, { id: Number(id), now: ctx.now })
      : deleteMessage(store, { id: Number(id), userId: ctx.user.id, now: ctx.now });
    if (result.error) flash(ctx, 'error', result.error);
    redirect(ctx, threadPath(seen.where));
  }

  function chatReport(ctx, { id }) {
    if (!signedIn(ctx)) return;
    if (!visibleThread(ctx, Number(id))) return notFound(ctx);
    const result = reportMessage(store, { id: Number(id), userId: ctx.user.id, now: ctx.now });
    flash(ctx, result.error ? 'error' : 'ok', result.error ?? 'Thanks. Messages enough people report get hidden.');
    redirect(ctx, threadPath(result));
  }

  /** Every game worth talking about right now, busiest chats first. */
  function chatHub(ctx) {
    if (!signedIn(ctx)) return;
    send(ctx, 200, moreViews.chatHub(ctx, { list: chatGames(store, ctx.now).map((row) => ({ game: toGame(row), count: row.chat_count })) }));
  }

  async function morePage(ctx) {
    if (!signedIn(ctx)) return;
    const liveCount = store.get("SELECT COUNT(*) AS n FROM games WHERE state = 'in'").n;
    const admin = isAdmin(ctx);
    const reported = admin ? reportedMessages(store).length + reportedPhotos(store).length : 0;
    const reportedCups = admin ? reportedTournaments(store).length : 0;
    send(ctx, 200, moreViews.more(ctx, { liveCount, admin, reported, reportedCups }));
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
      // Legs of open parlays on these games show too.
      const legs = store.all(
        `SELECT l.game_id, l.market, l.side, l.line, l.odds, 1 AS parlay FROM parlay_legs l JOIN parlays x ON x.id = l.parlay_id
          WHERE x.user_id = ? AND x.result IS NULL AND l.game_id IN (${list.map(() => '?').join(',')})`,
        ctx.user.id, ...list.map((g) => g.id),
      );
      for (const r of legs) mine.set(r.game_id, [...(mine.get(r.game_id) ?? []), r]);
    }
    send(ctx, 200, moreViews.live(ctx, { list, mine, follows: followedGameIds(store, ctx.user.id, list.map((g) => g.id)) }));
  }

  function leaderboardPage(ctx) {
    const sport = SPORT[ctx.query.get('sport')] ?? null;
    const period = periodOf(ctx.query);
    const rows = withLooks(leaderboard(store, { sport: sport?.key, period }, ctx.now));
    send(ctx, 200, social.leaderboard(ctx, { sport, rows, badges: topBadges(store, rows.map((r) => r.id)), cup: cupSummary(ctx) }));
  }

  // ---- weekly contest, streaks, invites ---------------------------------------

  /** This week's free contest: standings, the clock, and last week's top 3. */
  function contestPage(ctx) {
    const week = mondayOf(ctx.now);
    const rows = withLooks(standings(store, week));
    const lastWeek = addDays(week, -7);
    send(ctx, 200, social.contest(ctx, {
      week: weekLabel(week),
      rows,
      badges: topBadges(store, rows.map((r) => r.id)),
      me: ctx.user?.screenName ? rows.find((r) => r.id === ctx.user.id) ?? null : null,
      left: timeLeft(ctx.now, weekBounds(week).end),
      min: CONTEST_MIN,
      last: { label: weekLabel(lastWeek), week: lastWeek, podium: results(store, lastWeek) },
      players: (week) => standings(store, week, 100_000).length,
    }));
  }

  /**
   * The winners wall. A player's own podium rows get a Share button, with
   * how many played: counted only for the weeks and tournaments they placed in.
   */
  function winnersPage(ctx) {
    const tab = ['tournaments', 'cup'].includes(ctx.query.get('tab')) ? ctx.query.get('tab') : 'weekly';
    const tournaments = tournamentWinners(store);
    const userId = ctx.user?.screenName ? ctx.user.id : null;
    if (userId) {
      for (const t of tournaments.list) if (t.podium?.some((r) => r.id === userId)) t.players = standingsOf(store, t, 100_000).length;
    }
    send(ctx, 200, social.winners(ctx, { ...winnersWall(store), tab, tournaments, cupList: tab === 'cup' ? cupWinners(store) : [], players: (week) => standings(store, week, 100_000).length }));
  }

  // ---- tournaments ------------------------------------------------------------

  /** The hub: live now, starting soon, finished. Public, like the contest. */
  function tournamentsPage(ctx) {
    const userId = ctx.user?.screenName ? ctx.user.id : null;
    survivor.ensurePool(store, ctx.now);
    const admin = isAdmin(ctx);
    send(ctx, 200, tourneyViews.hub(ctx, {
      ...hub(store, ctx.now, userId, { admin }),
      admin,
      survivor: survivor.featured(store, ctx.now, userId),
      pickem: pickem.featured(store, ctx.now, userId),
      cup: cupSummary(ctx),
      leagues: leagues.leagueLists(store, userId, ctx.now),
      bracket: bracket.featured(store, ctx.now, userId),
    }));
  }

  // ---- Survivor, NFL Pick'em and the Bookie Bullies Cup --------------------------

  /** This year's Cup, and the viewer's place in it, for the hub banner and the leaderboard. */
  function cupSummary(ctx) {
    const year = cupYear(ctx.now);
    return { year, mine: ctx.user?.screenName ? cupLine(store, ctx.user.id, year) : null };
  }

  /** The NFL board, freshened (rate-limited inside games). A page never fails on ESPN. */
  async function freshNfl() {
    try {
      await games.upcoming('nfl');
    } catch (err) {
      log.warn(`nfl board: ${err.message}`);
    }
  }

  /** Survivor: your status, this week's games to pick from, your picks, the standings. Public, like the hub. */
  async function survivorPage(ctx) {
    await freshNfl();
    survivor.ensurePool(store, ctx.now);
    const state = survivor.survivorState(store, ctx.now);
    const userId = ctx.user?.screenName ? ctx.user.id : null;
    const table = survivor.standings(store, state.pool, userId, ctx.now);
    withLooks(table.players);
    send(ctx, 200, formats.survivorPage(ctx, {
      state,
      entry: survivor.entryOf(store, state.pool, userId),
      board: survivor.weekBoard(store, state, userId, ctx.now),
      history: survivor.historyOf(store, state.pool, userId),
      table,
      canJoin: survivor.canJoin(state, ctx.now),
      last: survivor.lastWinners(store),
      next: survivor.nextKickoff(state.current, ctx.now),
    }));
  }

  function survivorJoin(ctx) {
    if (!signedIn(ctx)) return;
    const state = survivor.survivorState(store, ctx.now);
    const result = survivor.joinSurvivor(store, state, ctx.user.id, ctx.now);
    flash(ctx, result.error ? 'error' : 'ok', result.error ?? (result.joined ? `You're in ${state.pool.name}, alive from Week ${result.week}. Make your pick.` : "You're already in."));
    redirect(ctx, result.error ? '/survivor' : '/survivor#week');
  }

  /** Pick a team on the Survivor page, or switch to it. */
  async function survivorPick(ctx) {
    if (!signedIn(ctx)) return;
    const { game } = await games.current(ctx.form.get('game') ?? '', { wait: false });
    if (!game) return notFound(ctx);
    const state = survivor.survivorState(store, ctx.now);
    const result = survivor.setSurvivorPick(store, { state, userId: ctx.user.id, game, side: ctx.form.get('side'), now: ctx.now });
    flash(ctx, result.error ? 'error' : 'ok', result.error ?? (result.switched
      ? `Switched your Week ${result.week} pick to ${result.name} (was ${result.prev}).`
      : result.same ? `${result.name} is already your Week ${result.week} pick.` : `${result.name} is your Week ${result.week} Survivor pick.`));
    redirect(ctx, '/survivor#week');
  }

  /** The week to show on the Pick'em page: ?week= for an earlier one this season, else the current week. */
  function pickemView(ctx) {
    const current = pickem.pickemWeek(store, ctx.now);
    if (!current) return { week: null, weeks: [] };
    const weeks = seasonWeeks(store, current.season);
    const played = new Set(store.all('SELECT DISTINCT week FROM pickem_picks WHERE season = ?', current.season).map((r) => r.week));
    const tabsList = [...new Set([...weeks.filter((w) => played.has(w.week)).map((w) => w.week), current.week])].sort((a, b) => a - b);
    // Between weeks, before the next week's games are up, the last week played shows by default.
    const fallback = !current.games.length ? weeks.filter((w) => played.has(w.week)).at(-1)?.week : null;
    const asked = ctx.query?.has('week') ? Number(ctx.query.get('week')) : fallback;
    const other = asked !== current.week ? weeks.find((w) => w.week === asked && played.has(asked)) : null;
    return { week: other ? { season: current.season, ...other } : current, weeks: tabsList };
  }

  async function pickemPage(ctx, notes = [], status = 200) {
    await freshNfl();
    const { week, weeks } = pickemView(ctx);
    const userId = ctx.user?.screenName ? ctx.user.id : null;
    const rows = week ? withLooks(pickem.weekStandings(store, week.season, week.week)) : [];
    const season = week ? withLooks(pickem.seasonStandings(store, week.season)) : [];
    send(ctx, status, formats.pickemPage(ctx, {
      week,
      weeks,
      viewing: week?.week ?? null,
      board: week ? pickem.weekBoard(store, week, userId, ctx.now) : [],
      rows,
      season,
      results: week ? pickem.weekResults(store, week.season, week.week) : null,
      notes,
    }));
  }

  /** Save the week's Pick'em picks: one form, so it works without JavaScript. */
  async function pickemPost(ctx) {
    if (!signedIn(ctx)) return;
    // The latest lines first: a pick takes the spread on the board when it's saved.
    try {
      await games.upcoming('nfl');
    } catch (err) {
      log.warn(`nfl board: ${err.message}`);
    }
    const week = pickem.pickemWeek(store, ctx.now);
    if (!week) return notFound(ctx);
    const picks = [];
    for (const [key, value] of ctx.form) if (key.startsWith('pick_')) picks.push({ game: key.slice(5), side: value });
    const result = pickem.savePickem(store, { userId: ctx.user.id, week, picks, best: ctx.form.get('best') || null, now: ctx.now });
    if (result.notes.length) return pickemPage(ctx, result.notes, 400);
    flash(ctx, 'ok', result.saved ? `Saved. Week ${week.week} picks lock at each game's kickoff.` : 'Nothing changed.');
    redirect(ctx, '/pickem/nfl#games');
  }

  /** The Bookie Bullies Cup: a year's standings (this year unless ?year=), how points work, your finishes. */
  function cupPage(ctx) {
    const current = cupYear(ctx.now);
    const years = [...new Set([current, ...cupYears(store)])].sort((a, b) => b - a);
    const asked = Number(ctx.query.get('year'));
    const year = years.includes(asked) ? asked : current;
    const rows = withLooks(cupStandings(store, year));
    const userId = ctx.user?.screenName ? ctx.user.id : null;
    const mine = userId != null ? cupStandings(store, year, 100_000).find((r) => r.id === userId) ?? null : null;
    send(ctx, 200, formats.cupPage(ctx, { year, years, rows, mine, history: userId != null ? cupHistory(store, userId, year) : [] }));
  }

  /** One tournament: rules, the clock, Join or Leave, standings (as it stands while live), chat, the podium once closed. */
  function tournamentPage(ctx, { slug }) {
    const row = findTournament(store, slug);
    if (!row) return notFound(ctx);
    return showTournament(ctx, row, null);
  }

  /** A private tournament's invite link: its page, with Join for anyone holding the code. */
  function tournamentInvite(ctx, { code }) {
    const row = byCode(store, code);
    if (!row) return notFound(ctx);
    return showTournament(ctx, row, hostOf(store, row).invite_code);
  }

  async function showTournament(ctx, row, code) {
    const userId = ctx.user?.screenName ? ctx.user.id : null;
    const admin = isAdmin(ctx);
    const seen = accessTo(store, row, { userId, admin, code });
    if (!seen.see) return notFound(ctx);
    const t = cardOf(store, row, userId, ctx.now);
    const canceled = Boolean(row.canceled_at);
    const graded = standingsOf(store, row, 100_000);
    // While it's live: scores from the stored games, freshened once (games.live is rate-limited), and "As it stands".
    let live = false;
    let rows = graded;
    if (t.phase === 'live' && !canceled) {
      try {
        await games.live();
      } catch (err) {
        log.warn(`tournament live scores: ${err.message}`);
      }
      rows = liveStandingsOf(store, row);
      live = true;
    }
    rows = withLooks(rows.slice(0, 100));
    const chat = canChat(store, row, userId) ? withLooks(messages(store, { tournamentId: row.id }), 'user_id') : null;
    const host = seen.host ?? null;
    const mine = Boolean(host && userId != null && row.created_by === userId);
    const won = userId != null ? t.podium?.find((r) => r.id === userId) ?? null : null;
    send(ctx, 200, tourneyViews.detail(ctx, {
      t,
      rows,
      live,
      myRow: userId != null ? graded.find((r) => r.id === userId) ?? null : null,
      badges: topBadges(store, rows.map((r) => r.id)),
      entry: row.kind === 'weekly' ? null : entryOf(store, row, userId),
      entrants: entrantCount(store, row),
      podium: t.podium,
      canceled,
      host,
      mine,
      code: host?.visibility === 'private' ? code ?? (mine ? host.invite_code : null) : null,
      inviteUrl: mine ? `${ctx.origin}${invitePath(row, host)}` : null,
      reported: host ? reportedByMe(store, row, userId) : false,
      chat,
      share: won ? { place: won.place, units: won.units, record: won.record, players: graded.length } : null,
    }));
  }

  /** The tournament a form is about, if this player may see it. */
  function visibleTournament(ctx, slug, code = null) {
    const row = findTournament(store, slug);
    if (!row) return null;
    const userId = ctx.user?.screenName ? ctx.user.id : null;
    return accessTo(store, row, { userId, admin: isAdmin(ctx), code }).see ? row : null;
  }

  function tournamentJoin(ctx, { slug }) {
    if (!signedIn(ctx)) return;
    const code = ctx.form.get('code') || null;
    const t = visibleTournament(ctx, slug, code);
    if (!t) return notFound(ctx);
    const result = joinTournament(store, t, ctx.user.id, ctx.now, { code, rulesAccepted: ['1', 'on'].includes(ctx.form.get('rules')) });
    flash(ctx, result.error ? 'error' : 'ok', result.error ?? `You're in ${t.name}. Bets you make from now on count.`);
    redirect(ctx, safeNext(ctx.form.get('next')) ?? `/tournaments/${t.slug}`);
  }

  function tournamentLeave(ctx, { slug }) {
    if (!signedIn(ctx)) return;
    const t = bySlug(store, slug);
    if (!t) return notFound(ctx);
    const result = leaveTournament(store, t, ctx.user.id, ctx.now);
    flash(ctx, result.error ? 'error' : 'ok', result.error ?? `You left ${t.name}.`);
    redirect(ctx, `/tournaments/${t.slug}`);
  }

  /** The new-tournament form. Anyone signed in sees it; making one needs a confirmed email. */
  function tournamentNewForm(ctx, extra = {}, status = 200) {
    if (!signedIn(ctx)) return;
    send(ctx, status, tourneyViews.newTournament(ctx, {
      groups: groupChoices(store, ctx.user.id),
      form: extra.form ?? { ...formDefaults(ctx.now), group: ctx.query?.get('group') ?? '' },
      error: extra.error ?? null,
    }));
  }

  function tournamentCreate(ctx) {
    if (!signedIn(ctx)) return;
    const form = {
      name: ctx.form.get('name') ?? '',
      sports: ctx.form.getAll('sports'),
      startDate: ctx.form.get('start_date') ?? '',
      startTime: ctx.form.get('start_time') ?? '',
      endDate: ctx.form.get('end_date') ?? '',
      endTime: ctx.form.get('end_time') ?? '',
      minBets: ctx.form.get('min_bets') ?? '',
      visibility: ctx.form.get('visibility') ?? '',
      group: ctx.form.get('group') ?? '',
    };
    if (!ctx.user.verified) return tournamentNewForm(ctx, { form, error: 'Confirm your email to make a tournament. The link is in your inbox.' }, 403);
    const result = createPlayerTournament(store, { ...form, groupId: form.group || null, userId: ctx.user.id, now: ctx.now, limit: !isAdmin(ctx) });
    if (result.error) return tournamentNewForm(ctx, { form, error: result.error }, 400);
    flash(ctx, 'ok', form.visibility === 'private'
      ? "Tournament made, and you're in. Copy the invite link below and send it to your friends."
      : "Tournament made, and you're in. It's listed under Player tournaments.");
    redirect(ctx, `/tournaments/${result.slug}`);
  }

  /** Cancel: its maker before the start, or an admin any time before it's final (player-made) or before the start (the rest). */
  function tournamentCancel(ctx, { slug }) {
    if (!signedIn(ctx)) return;
    const t = bySlug(store, slug);
    if (!t) return notFound(ctx);
    const host = hostOf(store, t);
    const admin = isAdmin(ctx);
    if (!admin && !(host && t.created_by === ctx.user.id)) return notFound(ctx);
    const result = cancelTournament(store, t, ctx.now, notifier, { anytime: Boolean(admin && host) });
    flash(ctx, result.error ? 'error' : 'ok', result.error ?? `${t.name} is canceled. Everyone who joined hears about it.`);
    redirect(ctx, result.error ? `/tournaments/${t.slug}` : '/tournaments');
  }

  /** Report a player-made tournament, once. */
  function tournamentReport(ctx, { slug }) {
    if (!signedIn(ctx)) return;
    const t = visibleTournament(ctx, slug, ctx.form.get('code') || null);
    if (!t) return notFound(ctx);
    const result = reportTournament(store, t, ctx.user.id, ctx.now);
    flash(ctx, result.error ? 'error' : 'ok', result.error ?? 'Thanks. Tournaments enough people report come off the lists until an admin looks.');
    redirect(ctx, `/tournaments/${t.slug}`);
  }

  /** Tournament chat: entrants only (everyone signed in, in the Weekly Open). A canceled one's is read-only. */
  function tournamentChatPost(ctx, { slug }) {
    if (!signedIn(ctx)) return;
    const t = findTournament(store, slug);
    if (!t || !canChat(store, t, ctx.user.id)) return notFound(ctx);
    if (t.canceled_at) flash(ctx, 'error', 'This tournament was canceled. Its chat is read-only.');
    else postChat(ctx, { tournamentId: t.id });
    redirect(ctx, `/tournaments/${t.slug}#chat`);
  }

  /** Make a tournament, or cancel one before it starts. Anyone who isn't an admin gets a plain 404. */
  function adminTournaments(ctx) {
    if (!isAdmin(ctx)) return notFound(ctx);
    send(ctx, 200, tourneyViews.admin(ctx, { list: adminList(store, ctx.now), reported: reportedTournaments(store), prizes: prizeList() }));
  }

  /** Every prize tournament, newest first, for the admin page. */
  const prizeList = () => store.all(
    `SELECT t.*, z.prize, z.reviewed_at, z.published_at, z.sent_at FROM tournaments t JOIN prize_tournaments z ON z.tournament_id = t.id
      WHERE t.canceled_at IS NULL ORDER BY t.ends_at DESC, t.id DESC LIMIT 50`,
  );

  /** An admin looked at a reported tournament and it's fine: it's listed again. */
  function adminTournamentDismiss(ctx, { slug }) {
    if (!isAdmin(ctx)) return notFound(ctx);
    const t = bySlug(store, slug);
    if (!t || !dismissTournamentReports(store, t, ctx.now)) return notFound(ctx);
    flash(ctx, 'ok', `${t.name} is back on the lists. Its reports are cleared.`);
    redirect(ctx, '/admin/tournaments');
  }

  function adminTournamentCreate(ctx) {
    if (!isAdmin(ctx)) return notFound(ctx);
    const form = {
      name: ctx.form.get('name') ?? '',
      sports: ctx.form.getAll('sports'),
      startDate: ctx.form.get('start_date') ?? '',
      startTime: ctx.form.get('start_time') ?? '',
      endDate: ctx.form.get('end_date') ?? '',
      endTime: ctx.form.get('end_time') ?? '',
      minBets: ctx.form.get('min_bets') ?? '',
      prize: ctx.form.get('prize') ?? '',
    };
    const result = createCustom(store, { ...form, userId: ctx.user.id, now: ctx.now });
    if (result.error) return send(ctx, 400, tourneyViews.admin(ctx, { list: adminList(store, ctx.now), reported: reportedTournaments(store), prizes: prizeList(), error: result.error, form }));
    flash(ctx, 'ok', 'Tournament made. It shows on the Tournaments page now.');
    redirect(ctx, `/tournaments/${result.slug}`);
  }

  function adminTournamentCancel(ctx, { slug }) {
    if (!isAdmin(ctx)) return notFound(ctx);
    const t = bySlug(store, slug);
    if (!t) return notFound(ctx);
    // A player-made one can be taken down any time before it's final; the rest only before the start.
    const result = cancelTournament(store, t, ctx.now, notifier, { anytime: Boolean(hostOf(store, t)) });
    flash(ctx, result.error ? 'error' : 'ok', result.error ?? `${t.name} is canceled.`);
    redirect(ctx, '/admin/tournaments');
  }

  // ---- prize tournaments --------------------------------------------------------

  /** A prize tournament's official rules. Admins see a banner: drafts until a lawyer reads them. Players only once it's published. */
  function prizeRules(ctx, { slug }) {
    const row = findTournament(store, slug);
    const prize = prizes.prizeOf(store, row);
    if (!row || !prize) return notFound(ctx);
    const admin = isAdmin(ctx);
    if (!admin && (prizes.isDraftPrize(prize) || row.canceled_at)) return notFound(ctx);
    send(ctx, 200, prizeViews.rulesPage(ctx, { t: cardOf(store, row, null, ctx.now), prize, admin, appName: config.appName, contact }));
  }

  /** The admin page for one prize tournament (or for making a custom one into one). */
  function adminPrizePage(ctx, { slug }, extra = {}, status = 200) {
    if (!isAdmin(ctx)) return notFound(ctx);
    const row = bySlug(store, slug);
    if (!row || row.kind !== 'custom' || hostOf(store, row)) return notFound(ctx);
    const prize = prizes.prizeOf(store, row);
    send(ctx, status, prizeViews.adminPrize(ctx, {
      t: cardOf(store, row, null, ctx.now),
      prize,
      audit: prize ? prizes.prizeAudit(store, prize) : null,
      winner: prize ? prizes.prizeWinner(store, row) : null,
      entrants: entrantCount(store, row),
      ...extra,
    }));
  }

  function adminPrizeSave(ctx, { slug }) {
    if (!isAdmin(ctx)) return notFound(ctx);
    const row = bySlug(store, slug);
    if (!row) return notFound(ctx);
    const form = Object.fromEntries(['prize', 'value', 'sponsor', 'eligibility', 'delivery'].map((k) => [k, ctx.form.get(k) ?? '']));
    const result = prizes.savePrize(store, row, form, { userId: ctx.user.id, now: ctx.now, playerMade: Boolean(hostOf(store, row)) });
    if (result.error) return adminPrizePage(ctx, { slug }, { form, error: result.error }, 400);
    flash(ctx, 'ok', 'Saved. Players can\'t see it until a lawyer\'s review is recorded and you publish it.');
    redirect(ctx, `/admin/tournaments/${row.slug}/prize`);
  }

  function adminPrizeReview(ctx, { slug }) {
    if (!isAdmin(ctx)) return notFound(ctx);
    const row = bySlug(store, slug);
    if (!row) return notFound(ctx);
    const reviewed = ['1', 'on'].includes(ctx.form.get('reviewed'));
    const result = prizes.setReviewed(store, row, { reviewed, userId: ctx.user.id, now: ctx.now });
    flash(ctx, result.error ? 'error' : 'ok', result.error ?? (reviewed ? 'Recorded: a lawyer has reviewed these rules.' : 'Review cleared.'));
    redirect(ctx, `/admin/tournaments/${row.slug}/prize`);
  }

  function adminPrizePublish(ctx, { slug }) {
    if (!isAdmin(ctx)) return notFound(ctx);
    const row = bySlug(store, slug);
    if (!row) return notFound(ctx);
    const result = prizes.publishPrize(store, row, { userId: ctx.user.id, now: ctx.now });
    flash(ctx, result.error ? 'error' : 'ok', result.error ?? `${row.name} is published. Players can see it and join.`);
    redirect(ctx, `/admin/tournaments/${row.slug}/prize`);
  }

  function adminPrizeSent(ctx, { slug }) {
    if (!isAdmin(ctx)) return notFound(ctx);
    const row = findTournament(store, slug);
    if (!row) return notFound(ctx);
    const result = prizes.markPrizeSent(store, row, { userId: ctx.user.id, now: ctx.now });
    flash(ctx, result.error ? 'error' : 'ok', result.error ?? 'Marked: prize sent.');
    redirect(ctx, `/admin/tournaments/${row.slug}/prize`);
  }

  // ---- leagues ----------------------------------------------------------------

  function leaguesPage(ctx) {
    const userId = ctx.user?.screenName ? ctx.user.id : null;
    send(ctx, 200, leagueViews.leaguesPage(ctx, leagues.leagueLists(store, userId, ctx.now)));
  }

  function leagueNewForm(ctx, extra = {}, status = 200) {
    if (!signedIn(ctx)) return;
    const choices = leagues.startChoices(ctx.now);
    send(ctx, status, leagueViews.newLeague(ctx, {
      groups: groupChoices(store, ctx.user.id),
      choices,
      form: extra.form ?? { startWeek: choices[0].monday, regularWeeks: '5', playoffSize: '4', visibility: 'public', group: ctx.query?.get('group') ?? '' },
      error: extra.error ?? null,
    }));
  }

  function leagueCreate(ctx) {
    if (!signedIn(ctx)) return;
    const form = {
      name: ctx.form.get('name') ?? '',
      sports: ctx.form.getAll('sports'),
      startWeek: ctx.form.get('start_week') ?? '',
      regularWeeks: ctx.form.get('regular_weeks') ?? '',
      playoffSize: ctx.form.get('playoff_size') ?? '',
      visibility: ctx.form.get('visibility') ?? '',
      group: ctx.form.get('group') ?? '',
    };
    if (!ctx.user.verified) return leagueNewForm(ctx, { form, error: 'Confirm your email to start a league. The link is in your inbox.' }, 403);
    const result = leagues.createLeague(store, { ...form, groupId: form.group || null, userId: ctx.user.id, now: ctx.now, limit: !isAdmin(ctx) });
    if (result.error) return leagueNewForm(ctx, { form, error: result.error }, 400);
    flash(ctx, 'ok', form.visibility === 'private' ? "League started, and you're in. Copy the invite link below and send it around." : "League started, and you're in. It's listed under Open leagues until Week 1.");
    redirect(ctx, `/leagues/${result.id}`);
  }

  function showLeague(ctx, l, code) {
    const userId = ctx.user?.screenName ? ctx.user.id : null;
    if (!leagues.canSeeLeague(store, l, { userId, admin: isAdmin(ctx), code })) return notFound(ctx);
    const view = leagues.leagueView(store, l, userId, ctx.now);
    const rows = new Map(withLooks(view.members.map((m) => ({ ...m }))).map((r) => [r.id, r]));
    const isMember = leagues.isMemberOf(store, l, userId);
    send(ctx, 200, leagueViews.leaguePage(ctx, {
      l, view, rows, isMember,
      code: l.visibility === 'private' ? code ?? (isMember ? l.invite_code : null) : null,
      inviteUrl: isMember ? `${ctx.origin}${l.visibility === 'private' ? `/l/${l.invite_code}` : `/leagues/${l.id}`}` : null,
    }));
  }

  function leaguePage(ctx, { id }) {
    const l = leagues.leagueById(store, id);
    return l ? showLeague(ctx, l, null) : notFound(ctx);
  }

  function leagueInvite(ctx, { code }) {
    const l = leagues.leagueByCode(store, code);
    return l ? showLeague(ctx, l, l.invite_code) : notFound(ctx);
  }

  function leagueJoin(ctx, { id }) {
    if (!signedIn(ctx)) return;
    const l = leagues.leagueById(store, id);
    const code = ctx.form.get('code') || null;
    if (!l || !leagues.canSeeLeague(store, l, { userId: ctx.user.id, admin: isAdmin(ctx), code })) return notFound(ctx);
    const result = leagues.joinLeague(store, l, ctx.user.id, ctx.now, { code });
    flash(ctx, result.error ? 'error' : 'ok', result.error ?? `You're in ${l.name}. The schedule comes out when Week 1 starts.`);
    redirect(ctx, safeNext(ctx.form.get('next')) ?? `/leagues/${l.id}`);
  }

  function leagueLeave(ctx, { id }) {
    if (!signedIn(ctx)) return;
    const l = leagues.leagueById(store, id);
    if (!l) return notFound(ctx);
    const result = leagues.leaveLeague(store, l, ctx.user.id, ctx.now);
    flash(ctx, result.error ? 'error' : 'ok', result.error ?? `You left ${l.name}.`);
    redirect(ctx, `/leagues/${l.id}`);
  }

  // ---- the bracket challenge ------------------------------------------------------

  /** Your bracket (or another player's, after the lock), a region at a time, the Final Four, or the standings. */
  function bracketPage(ctx, notes = [], status = 200) {
    const userId = ctx.user?.screenName ? ctx.user.id : null;
    const c = bracket.currentChallenge(store, ctx.now, { drafts: isAdmin(ctx) });
    if (!c) {
      const lastYear = store.get('SELECT year FROM bracket_challenges WHERE closed_at IS NOT NULL ORDER BY year DESC LIMIT 1')?.year;
      const last = lastYear ? { name: bracket.challengeFor(store, lastYear).name, winners: bracket.bracketStandings(store, bracket.challengeFor(store, lastYear)).filter((r) => r.rank === 1).map((r) => r.screen_name) } : null;
      return send(ctx, status, bracketViews.bracketPage(ctx, { c: null, last }));
    }
    const locked = bracket.isLocked(c, ctx.now);
    let owner = userId != null ? { id: userId, screen_name: ctx.user.screenName } : null;
    const asked = ctx.query.get('player');
    if (asked && asked.toLowerCase() !== ctx.user?.screenName?.toLowerCase()) {
      // Other players' brackets show only once the brackets lock.
      if (!locked) return notFound(ctx);
      owner = store.get('SELECT id, screen_name FROM users WHERE screen_name = ? AND email_verified_at IS NOT NULL', asked) ?? null;
      if (!owner || !bracket.entryOf(store, c.year, owner.id)) return notFound(ctx);
    }
    const entry = owner ? bracket.entryOf(store, c.year, owner.id) : null;
    const results = bracket.resultsOf(store, c.year);
    const out = bracket.eliminated(results);
    const picks = entry?.picks ?? {};
    const raw = ctx.query.get('view');
    const view = ['0', '1', '2', '3', 'ff', 'standings'].includes(raw) ? raw : locked && !asked ? 'standings' : '0';
    const rows = view === 'standings' ? withLooks(bracket.bracketStandings(store, c)) : [];
    send(ctx, status, bracketViews.bracketPage(ctx, {
      c, field: bracket.fieldOf(store, c.year), picks, tiebreak: entry?.tiebreak ?? null, results, out, view, locked,
      owner, mine: owner?.id === userId, score: entry ? bracket.scoreBracket(picks, results, out) : null, rows, notes,
    }));
  }

  /** Save picks: a round's form, or the whole bracket. Works without JavaScript. */
  function bracketPost(ctx) {
    if (!signedIn(ctx)) return;
    const c = bracket.currentChallenge(store, ctx.now);
    if (!c) return notFound(ctx);
    const updates = {};
    for (const [key, value] of ctx.form) if (/^g\d{1,2}$/.test(key)) updates[Number(key.slice(1))] = value;
    const view = ['0', '1', '2', '3', 'ff'].includes(ctx.form.get('view')) ? ctx.form.get('view') : '0';
    const result = bracket.savePicks(store, c, { userId: ctx.user.id, updates, tiebreak: ctx.form.get('tiebreak'), now: ctx.now });
    if (result.error) {
      flash(ctx, 'error', result.error);
      return redirect(ctx, `/bracket?view=${view}`);
    }
    flash(ctx, result.notes.length ? 'error' : 'ok', result.notes.length ? result.notes.join(' ') : `Saved. ${result.picked} of ${bracket.GAMES} picked.${result.dropped ? ` ${result.dropped} later ${result.dropped === 1 ? 'pick was' : 'picks were'} cleared: that team no longer gets there.` : ''}`);
    redirect(ctx, `/bracket?view=${view}`);
  }

  /** The year the admin page works on: the current challenge's, else this season's (next year's from November). */
  function bracketYear(ctx) {
    const c = bracket.currentChallenge(store, ctx.now, { drafts: true });
    if (c) return c.year;
    const [y, m] = [+etDay(ctx.now).slice(0, 4), +etDay(ctx.now).slice(4, 6)];
    return m >= 11 ? y + 1 : y;
  }

  /** Games whose two teams are known by the results so far, for entering winners by hand. */
  function manualGames(c) {
    const results = bracket.resultsOf(store, c.year);
    const out = [];
    for (let g = 0; g < bracket.GAMES; g++) {
      const teams = bracket.participants(g, results);
      if (teams.every(Boolean)) out.push({ game: g, round: bracket.ROUND_NAMES[bracket.roundOf(g)], region: bracket.regionOf(g), teams });
    }
    return out;
  }

  function adminBracket(ctx, extra = {}, status = 200) {
    if (!isAdmin(ctx)) return notFound(ctx);
    const year = bracketYear(ctx);
    const c = bracket.challengeFor(store, year);
    send(ctx, status, bracketViews.adminBracket(ctx, {
      c, year,
      field: c ? bracket.fieldOf(store, year) : null,
      results: c ? bracket.resultsOf(store, year) : {},
      teams: bracket.collegeTeams(store),
      manual: c?.opened_at ? manualGames(c) : [],
      ...extra,
    }));
  }

  function adminBracketStart(ctx) {
    if (!isAdmin(ctx)) return notFound(ctx);
    bracket.ensureChallenge(store, bracketYear(ctx), ctx.now);
    flash(ctx, 'ok', 'Started. Fill in the field, set the lock, then open it.');
    redirect(ctx, '/admin/bracket');
  }

  async function adminBracketEspn(ctx) {
    if (!isAdmin(ctx)) return notFound(ctx);
    const c = bracket.challengeFor(store, bracketYear(ctx));
    if (!c) return notFound(ctx);
    if (!espn) return adminBracket(ctx, { error: "This server can't reach ESPN. Enter the field by hand." }, 503);
    try {
      const draft = await bracket.fetchField(store, espn, c, ctx.now);
      return adminBracket(ctx, { draft });
    } catch (err) {
      log.warn(`bracket field: ${err.message}`);
      return adminBracket(ctx, { error: "ESPN didn't answer. Try again, or enter the field by hand." }, 503);
    }
  }

  function adminBracketOpen(ctx) {
    if (!isAdmin(ctx)) return notFound(ctx);
    const c = bracket.challengeFor(store, bracketYear(ctx));
    if (!c) return notFound(ctx);
    const result = bracket.openChallenge(store, c, {
      regions: ctx.form.getAll('region'),
      locksAt: bracket.lockInstant(ctx.form.get('lock_date'), ctx.form.get('lock_time')),
      userId: ctx.user.id, now: ctx.now,
    });
    if (result.error) return adminBracket(ctx, { error: result.error }, 400);
    flash(ctx, 'ok', `${c.name} is open. Players can fill their brackets until the lock.`);
    redirect(ctx, '/admin/bracket');
  }

  function adminBracketField(ctx) {
    if (!isAdmin(ctx)) return notFound(ctx);
    const c = bracket.challengeFor(store, bracketYear(ctx));
    if (!c) return notFound(ctx);
    const slots = [];
    for (let region = 0; region < 4; region++) {
      for (let seed = 1; seed <= 16; seed++) {
        const name = String(ctx.form.get(`t_${region}_${seed}`) ?? '').trim();
        const name2 = String(ctx.form.get(`t2_${region}_${seed}`) ?? '').trim();
        const one = bracket.teamDetails(store, name);
        const two = name2 ? bracket.teamDetails(store, name2) : {};
        slots.push({ region, seed, name, abbr: one.abbr, logo: one.logo, name2: name2 || null, abbr2: two.abbr ?? null, logo2: two.logo ?? null });
      }
    }
    const result = bracket.saveField(store, c, slots, ctx.now);
    if (result.error) return adminBracket(ctx, { error: result.error }, 400);
    flash(ctx, 'ok', 'Field saved.');
    redirect(ctx, '/admin/bracket');
  }

  function adminBracketPaste(ctx) {
    if (!isAdmin(ctx)) return notFound(ctx);
    const c = bracket.challengeFor(store, bracketYear(ctx));
    if (!c) return notFound(ctx);
    const text = ctx.form.get('field') ?? '';
    const parsed = bracket.parsePastedField(text, c.regionNames);
    if (parsed.error) return adminBracket(ctx, { error: parsed.error, paste: text }, 400);
    const result = bracket.saveField(store, c, parsed.slots.map((s) => ({ ...s, ...bracket.teamDetails(store, s.name) })), ctx.now);
    if (result.error) return adminBracket(ctx, { error: result.error, paste: text }, 400);
    flash(ctx, 'ok', 'Field saved from the pasted list.');
    redirect(ctx, '/admin/bracket');
  }

  function adminBracketResults(ctx) {
    if (!isAdmin(ctx)) return notFound(ctx);
    const c = bracket.challengeFor(store, bracketYear(ctx));
    if (!c?.opened_at) return notFound(ctx);
    const errors = [];
    for (const [key, value] of ctx.form) {
      if (key.startsWith('ff_') && value) {
        const r = bracket.recordFirstFour(store, c, { slot: key.slice(3), winner: value });
        if (r.error) errors.push(r.error);
      }
    }
    const results = bracket.resultsOf(store, c.year);
    const total = ctx.form.get('title_total');
    for (let g = 0; g < bracket.GAMES; g++) {
      const value = ctx.form.get(`w${g}`);
      if (!value || results[g] === value) continue;
      const r = bracket.recordResult(store, c, { game: g, winner: value, source: 'admin', now: ctx.now, replace: true });
      if (r.error) errors.push(`Game ${g + 1}: ${r.error}`);
      Object.assign(results, bracket.resultsOf(store, c.year));
    }
    if (total) store.run('UPDATE bracket_challenges SET title_total = ? WHERE year = ?', Math.max(0, Math.min(400, Math.round(Number(total) || 0))), c.year);
    const closed = bracket.closeChallenge(store, bracket.challengeFor(store, c.year), ctx.now, notifier);
    flash(ctx, errors.length ? 'error' : 'ok', errors.length ? errors.join(' ') : closed ? `Results saved. ${c.name} is final.` : 'Results saved.');
    redirect(ctx, '/admin/bracket');
  }

  /** The streak game: your streak, today's Streak pick, and the streak boards. */
  function streakPage(ctx) {
    if (!signedIn(ctx)) return;
    const today = etDay(ctx.now);
    const pick = streakPickOn(store, ctx.user.id, today);
    const todays = pick ? ownPick(store, ctx.user.id, pick.id) : null;
    send(ctx, 200, social.streak(ctx, { mine: streakOf(store, ctx.user.id), todays, boards: Object.fromEntries(Object.entries(streakBoards(store)).map(([k, rows]) => [k, withLooks(rows)])) }));
  }

  function invitePage(ctx) {
    if (!signedIn(ctx)) return;
    const code = inviteCodeOf(store, ctx.user.id);
    send(ctx, 200, social.invite(ctx, { url: `${ctx.origin}/i/${code}`, ...inviteStats(store, ctx.user.id) }));
  }

  /** Players by the start of their screen name. */
  function searchPage(ctx) {
    const q = String(ctx.query.get('q') ?? '').trim().slice(0, 40);
    send(ctx, 200, social.search(ctx, { q, rows: withLooks(searchPlayers(store, q)) }));
  }

  // ---- admin ----------------------------------------------------------------

  /** Reported chat messages. Anyone who isn't an admin gets a plain 404. */
  function adminReports(ctx) {
    if (!isAdmin(ctx)) return notFound(ctx);
    send(ctx, 200, moreViews.adminReports(ctx, { list: reportedMessages(store), hideAfter: HIDE_AFTER_REPORTS, photos: reportedPhotos(store), photoHideAfter: PHOTO_HIDE_AFTER, blockDays: PHOTO_BLOCK_DAYS }));
  }

  function adminRestore(ctx, { id }) {
    if (!isAdmin(ctx)) return notFound(ctx);
    restoreMessage(store, Number(id));
    flash(ctx, 'ok', 'Restored. Its reports are cleared.');
    redirect(ctx, '/admin/reports');
  }

  function adminDelete(ctx, { id }) {
    if (!isAdmin(ctx)) return notFound(ctx);
    const result = removeMessage(store, { id: Number(id), now: ctx.now });
    flash(ctx, result.error ? 'error' : 'ok', result.error ?? 'Deleted.');
    redirect(ctx, '/admin/reports');
  }

  function groupsPage(ctx) {
    if (!signedIn(ctx)) return;
    send(ctx, 200, social.groups(ctx, { list: groupsOf(store, ctx.user.id), rooms: roomsOf(store, ctx.user.id), unread: unreadCounts(store, ctx.user.id) }));
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
    if (!group) {
      // An open local room shows anyone a Join button; its chat and board are for members.
      const room = store.get("SELECT * FROM friend_groups WHERE id = ? AND kind = 'local' AND archived_at IS NULL", Number(id));
      if (!room) return notFound(ctx);
      const members = store.get('SELECT COUNT(*) AS n FROM group_members WHERE group_id = ?', room.id).n;
      return send(ctx, 200, local.roomPreview(ctx, { room: { ...room, city: CITY[room.city_slug] ?? null }, members }));
    }
    const rows = withLooks(leaderboard(store, { groupId: group.id, sport: group.sport, period: periodOf(ctx.query) }, ctx.now));
    const chat = withLooks(messages(store, { groupId: group.id }), 'user_id');
    // Opening the group (or its chat refreshing) reads everything in it.
    markGroupRead(store, { groupId: group.id, userId: ctx.user.id, now: ctx.now });
    send(ctx, 200, social.group(ctx, {
      group,
      rows,
      members: withLooks(membersOf(store, group.id)),
      feed: withLooks(groupFeed(store, group, ctx.now), 'userId'),
      inviteUrl: group.invite_code ? `${origin(ctx)}/join/${group.invite_code}` : null,
      messages: chat,
      city: group.kind === 'local' ? CITY[group.city_slug] ?? null : null,
      home: group.kind === 'local' && store.get('SELECT home_city FROM users WHERE id = ?', ctx.user.id).home_city === group.city_slug,
      admin: isAdmin(ctx),
      tournaments: groupTournaments(store, group.id, ctx.user.id, ctx.now),
    }));
  }

  /** Trash talk: members only. */
  function groupChatPost(ctx, { id }) {
    if (!signedIn(ctx)) return;
    const group = groupFor(store, Number(id), ctx.user.id);
    if (!group) return notFound(ctx);
    if (group.archived_at) flash(ctx, 'error', 'This room is archived. Its chat is read-only.');
    else postChat(ctx, { groupId: group.id });
    redirect(ctx, `/groups/${group.id}#chat`);
  }

  function groupLeave(ctx, { id }) {
    if (!signedIn(ctx)) return;
    const group = groupFor(store, Number(id), ctx.user.id);
    if (!group) return notFound(ctx);
    leaveGroup(store, { groupId: group.id, userId: ctx.user.id });
    flash(ctx, 'ok', `You left ${group.name}.`);
    redirect(ctx, group.kind === 'local' ? '/local' : '/groups');
  }

  function groupDelete(ctx, { id }) {
    if (!signedIn(ctx)) return;
    const group = groupFor(store, Number(id), ctx.user.id);
    if (!group || !deleteGroup(store, { groupId: group.id, userId: ctx.user.id })) return notFound(ctx);
    flash(ctx, 'ok', `${group.name} is gone. Everyone's picks stay on their records.`);
    redirect(ctx, '/groups');
  }

  // ---- local rooms ------------------------------------------------------------

  const isLocal = (groupId) => Boolean(store.get("SELECT 1 AS x FROM friend_groups WHERE id = ? AND kind = 'local'", groupId));

  /** The directory: every open room by region and state, and a form to start one for your city. */
  function localPage(ctx, extra = {}, status = 200) {
    if (!signedIn(ctx)) return;
    send(ctx, status, local.directory(ctx, {
      rooms: localRooms(store, ctx.user.id),
      unread: unreadCounts(store, ctx.user.id),
      cities: cityGroups(),
      homeCity: store.get('SELECT home_city FROM users WHERE id = ?', ctx.user.id).home_city,
      city: CITY[ctx.query.get('city')] ? ctx.query.get('city') : '',
      ...extra,
    }));
  }

  /** Start the room for a city on the list. Confirmed emails only, three a day; a city that has one gets a link to it. */
  function localStart(ctx) {
    if (!signedIn(ctx)) return;
    const citySlug = ctx.form.get('city') ?? '';
    if (!ctx.user.verified) return localPage(ctx, { error: 'Confirm your email to start a room. The link is in your inbox.', city: citySlug }, 403);
    const result = startRoom(store, { citySlug, userId: ctx.user.id, now: ctx.now, limit: !isAdmin(ctx) });
    if (result.error) return localPage(ctx, { error: result.error, exists: result.existing ?? null, city: CITY[citySlug] ? citySlug : '' }, 400);
    flash(ctx, 'ok', `The ${CITY[citySlug].name} room is open, and you're its first member.`);
    redirect(ctx, `/groups/${result.id}`);
  }

  /** /local/san-diego-ca: the city's room, or the directory with that city ready to start. */
  function localCity(ctx, { slug }) {
    if (!signedIn(ctx)) return;
    if (!CITY[slug]) return notFound(ctx);
    const room = roomFor(store, slug);
    if (room?.archived_at) return notFound(ctx);
    redirect(ctx, room ? `/groups/${room.id}` : `/local?city=${slug}`, 302);
  }

  function roomJoin(ctx, { id }) {
    if (!signedIn(ctx)) return;
    const result = joinRoom(store, { groupId: Number(id), userId: ctx.user.id, now: ctx.now });
    if (result.error) return notFound(ctx);
    flash(ctx, 'ok', `You're in the ${result.room.name} room.`);
    redirect(ctx, safeNext(ctx.form.get('next')) ?? `/groups/${result.room.id}`);
  }

  /** Your city, from your profile: joins its room (starting it if need be) and makes it home. Blank clears it. */
  function homeCityPost(ctx) {
    if (!signedIn(ctx)) return;
    const result = setHomeCity(store, { userId: ctx.user.id, citySlug: ctx.form.get('city') ?? '', now: ctx.now, canStart: ctx.user.verified, limit: !isAdmin(ctx) });
    if (result.error) flash(ctx, 'error', result.error);
    else if (!result.city) flash(ctx, 'ok', 'City cleared. You stay in its room until you leave it.');
    else if (!result.room) flash(ctx, 'ok', `${result.city.label} is your city. Its room opens once you confirm your email.`);
    else flash(ctx, 'ok', `${result.city.label} is your city. You're in its room.`);
    redirect(ctx, safeNext(ctx.form.get('next')) ?? `/u/${encodeURIComponent(ctx.user.screenName)}`);
  }

  /** Admins: rename, archive and restore rooms, or start one without the daily limit. */
  function adminRooms(ctx) {
    if (!isAdmin(ctx)) return notFound(ctx);
    send(ctx, 200, local.adminRooms(ctx, { rooms: allRooms(store), cities: cityGroups() }));
  }

  function adminRoomStart(ctx) {
    if (!isAdmin(ctx)) return notFound(ctx);
    const result = startRoom(store, { citySlug: ctx.form.get('city') ?? '', userId: ctx.user.id, now: ctx.now, limit: false });
    flash(ctx, result.error ? 'error' : 'ok', result.error ?? 'Room started.');
    redirect(ctx, '/admin/rooms');
  }

  function adminRoomRename(ctx, { id }) {
    if (!isAdmin(ctx)) return notFound(ctx);
    const result = renameRoom(store, { groupId: Number(id), name: ctx.form.get('name') });
    flash(ctx, result.error ? 'error' : 'ok', result.error ?? `Renamed to ${result.name}.`);
    redirect(ctx, '/admin/rooms');
  }

  /** Archive (or, at /restore, put back) a room. */
  function adminRoomArchive(ctx, { id }) {
    if (!isAdmin(ctx)) return notFound(ctx);
    const archived = ctx.url.pathname.endsWith('/archive');
    if (!archiveRoom(store, { groupId: Number(id), now: ctx.now, archived })) return notFound(ctx);
    flash(ctx, 'ok', archived ? 'Archived. It is off the directory, and its chat is read-only.' : 'Restored. It is back on the directory.');
    redirect(ctx, '/admin/rooms');
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
    const player = store.get(
      `SELECT id, screen_name, created_at, bio, link_url, link_label, first_name, last_name, official, name_changed_at, home_city,
              theme, theme_team, theme_mode, theme_accent, theme_tint, photo, photo_hidden, cover, cover_hidden, name_color, name_icon
         FROM users WHERE screen_name = ?`,
      name,
    );
    if (!player) {
      // An old name points to the new one for 90 days. Not a 301: browsers
      // keep those forever, and the name is free again after that.
      const renamed = renamedTo(store, name, ctx.now);
      return renamed ? redirect(ctx, `/u/${encodeURIComponent(renamed)}`, 302) : notFound(ctx);
    }
    if (player.screen_name !== name) return redirect(ctx, `/u/${encodeURIComponent(player.screen_name)}`);
    const { picks, hidden } = publicPicks(store, player.id, { viewerId: ctx.user?.id, now: ctx.now });
    const own = ctx.user?.id === player.id;
    // Their look, for the banner and the team badge: a matched team, custom colors, or a preset.
    const style = styleOf(player);
    const look = { style, team: style && player.theme_team ? teamByKey(store, player.theme_team) : null, preset: style ? null : player.theme };
    const photo = {
      hidden: Boolean(player.photo && player.photo_hidden),
      reported: reportedBy(store, player.id, player.photo, ctx.user?.id),
      blockedUntil: own ? uploadBlockedUntil(store, player.id, ctx.now) : null,
      // Your own, or the official account's for an admin.
      upload: own ? '/photo' : player.official && isAdmin(ctx) ? '/admin/official/photo' : null,
      max: KINDS.avatar.max,
    };
    // The banner's cover photo: the same rules as the photo.
    const cover = {
      file: player.cover_hidden ? null : player.cover,
      hidden: Boolean(player.cover && player.cover_hidden),
      reported: reportedBy(store, player.id, player.cover, ctx.user?.id),
      blockedUntil: own ? uploadBlockedUntil(store, player.id, ctx.now, 'cover') : null,
      upload: own ? '/cover' : player.official && isAdmin(ctx) ? '/admin/official/cover' : null,
      max: KINDS.cover.max,
    };
    // How their name shows on the boards, checked the same way as on a board.
    const tag = nametagsFor(store, [player.id], catalog).get(player.id);
    send(ctx, 200, social.profile(ctx, {
      player: { ...player, photo: player.photo_hidden ? null : player.photo, nameColor: tag?.color ?? null, nameIcon: tag?.icon ?? null },
      nametag: own && !player.official ? nametagChoices(player) : null,
      look,
      photo,
      cover,
      teams: own ? teamsBySport(store) : null,
      record: record(store, player.id),
      bySport: recordBySport(store, player.id),
      split: breakdown(store, player.id),
      series: unitsSeries(store, player.id, ctx.now),
      last10: lastTen(store, player.id),
      rank: rankOf(store, player.id, ctx.now),
      follows: followCounts(store, player.id),
      following: isFollowing(store, ctx.user?.id, player.id),
      picks,
      hidden,
      nextChange: ctx.user?.id === player.id ? nextNameChange(player.name_changed_at, ctx.now) : null,
      badges: player.official ? [] : badgesOf(store, player.id),
      streak: player.official ? null : streakOf(store, player.id),
      cup: player.official ? null : cupLine(store, player.id, cupYear(ctx.now)),
      clv: clvSummary(store, player.id),
      home: homeOf(player.home_city),
      cities: ctx.user?.id === player.id ? cityGroups() : null,
    }));
  }

  /**
   * Everything the "Your name on the boards" picker needs: what's saved (an
   * earned icon whose badge is gone shows as none), the badges that unlock
   * icons, and every team logo. Starts a catalog refresh if one is due; never waits for it.
   */
  function nametagChoices(player) {
    catalog.refreshIfDue();
    const earned = earnedOf(store, player.id);
    const icon = resolveIcon(player.name_icon, { badges: earned, teams: catalog }) ? player.name_icon : null;
    return {
      color: resolveColor(player.name_color) ?? 'default',
      icon: icon ?? 'none',
      colors: NAME_COLORS,
      icons: ICONS.map((i) => ({ ...i, locked: Boolean(i.badge && !earned.has(i.badge)) })),
      leagues: catalog.leagues(),
    };
  }

  /** Save how your name shows on the boards: a color and an icon, each checked against its list. */
  function nametagPost(ctx) {
    if (!signedIn(ctx)) return;
    const back = `/u/${encodeURIComponent(ctx.user.screenName)}#nametag`;
    const result = saveNametag(store, { userId: ctx.user.id, color: ctx.form.get('color'), icon: ctx.form.get('icon'), teams: catalog });
    flash(ctx, result.error ? 'error' : 'ok', result.error ?? 'Saved. That\'s your name on the boards now.');
    redirect(ctx, back);
  }

  /** A player's city for their profile, with its room when that's open. */
  function homeOf(slug) {
    const city = CITY[slug];
    if (!city) return null;
    const room = roomFor(store, slug);
    return { city, room: room && !room.archived_at ? room : null };
  }

  function screenNamePost(ctx) {
    if (!signedIn(ctx)) return;
    const name = String(ctx.form.get('screen_name') ?? '').trim();
    const result = changeScreenName(store, { userId: ctx.user.id, name, now: ctx.now });
    if (result.error) {
      flash(ctx, 'error', result.error);
      return redirect(ctx, `/u/${encodeURIComponent(ctx.user.screenName)}`);
    }
    flash(ctx, 'ok', `You're ${result.name} now. Links to ${result.old} keep working for 90 days.`);
    redirect(ctx, `/u/${encodeURIComponent(result.name)}`);
  }

  function followPost(ctx, { name }) {
    if (!signedIn(ctx)) return;
    const player = store.get('SELECT id, screen_name FROM users WHERE screen_name = ?', name);
    if (!player) return notFound(ctx);
    const result = follow(store, { followerId: ctx.user.id, followeeId: player.id, now: ctx.now });
    flash(ctx, result.error ? 'error' : 'ok', result.error ?? `Following ${player.screen_name}. Their picks show in Following once each game starts.`);
    redirect(ctx, safeNext(ctx.form.get('next')) ?? `/u/${encodeURIComponent(player.screen_name)}`);
  }

  function unfollowPost(ctx, { name }) {
    if (!signedIn(ctx)) return;
    const player = store.get('SELECT id, screen_name FROM users WHERE screen_name = ?', name);
    if (!player) return notFound(ctx);
    unfollow(store, { followerId: ctx.user.id, followeeId: player.id });
    redirect(ctx, safeNext(ctx.form.get('next')) ?? `/u/${encodeURIComponent(player.screen_name)}`);
  }

  /** Who's on a heater: the best last ten over the past 30 days. */
  function hotPage(ctx) {
    const rows = withLooks(hotStreaks(store, ctx.now));
    const followed = followingAmong(store, ctx.user?.id, rows.map((r) => r.id));
    send(ctx, 200, social.hot(ctx, { rows, followed }));
  }

  /** Picks from everyone the player follows, once each game starts. */
  function followingPage(ctx) {
    if (!signedIn(ctx)) return;
    send(ctx, 200, social.following(ctx, { feed: withLooks(followFeed(store, ctx.user.id, ctx.now), 'userId'), people: withLooks(followingList(store, ctx.user.id)) }));
  }

  // ---- notifications ------------------------------------------------------

  /** The inbox. Opening it marks everything read. */
  function notificationsPage(ctx) {
    if (!signedIn(ctx)) return;
    const list = notifier.list(ctx.user.id);
    // Notes about a player (a follow, an invite) show that player's photo.
    const names = [...new Set(list.map((n) => /^\/u\/([^/?#]+)$/.exec(n.url ?? '')?.[1]).filter(Boolean).map((n) => { try { return decodeURIComponent(n); } catch { return null; } }).filter(Boolean))];
    const faces = new Map();
    for (const name of names.slice(0, 100)) {
      const row = store.get('SELECT screen_name, photo FROM users WHERE screen_name = ? AND photo IS NOT NULL AND photo_hidden = 0', name);
      if (row) faces.set(`/u/${encodeURIComponent(row.screen_name)}`, { screen_name: row.screen_name, photo: row.photo });
    }
    for (const n of list) if (n.kind !== 'photo') n.face = faces.get(n.url) ?? null;
    const prefs = store.get('SELECT notify_settled, notify_follows, notify_lines, notify_streak, notify_tournaments, notify_tournament_updates FROM users WHERE id = ?', ctx.user.id);
    const phones = store.get('SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?', ctx.user.id).n;
    notifier.markRead(ctx.user.id, ctx.now);
    ctx.unread = 0;
    send(ctx, 200, moreViews.notifications(ctx, { list, prefs, phones, pushKey: push?.publicKey() ?? null }));
  }

  function notifyPrefs(ctx) {
    if (!signedIn(ctx)) return;
    const on = (name) => (ctx.form.get(name) === 'on' ? 1 : 0);
    store.run(
      'UPDATE users SET notify_settled = ?, notify_follows = ?, notify_lines = ?, notify_streak = ?, notify_tournaments = ?, notify_tournament_updates = ? WHERE id = ?',
      on('settled'), on('follows'), on('lines'), on('streak'), on('tournaments'), on('tournament_updates'), ctx.user.id,
    );
    flash(ctx, 'ok', 'Saved.');
    redirect(ctx, '/notifications');
  }

  /** A phone turning push on: keep its subscription, tied to this player. */
  function pushSubscribe(ctx) {
    if (!signedIn(ctx)) return;
    const sub = { endpoint: ctx.form.get('endpoint') ?? '', p256dh: ctx.form.get('p256dh') ?? '', auth: ctx.form.get('auth') ?? '' };
    if (!push || !validSubscription(sub)) return send(ctx, 400, 'That subscription was turned down.');
    const count = store.get('SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?', ctx.user.id).n;
    if (count >= 10) store.run('DELETE FROM push_subscriptions WHERE id = (SELECT MIN(id) FROM push_subscriptions WHERE user_id = ?)', ctx.user.id);
    store.run(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
      ctx.user.id, sub.endpoint, sub.p256dh, sub.auth, ctx.now.toISOString(),
    );
    send(ctx, 204, '');
  }

  function pushUnsubscribe(ctx) {
    if (!signedIn(ctx)) return;
    store.run('DELETE FROM push_subscriptions WHERE user_id = ?', ctx.user.id);
    flash(ctx, 'ok', 'Phone notifications are off on every device.');
    redirect(ctx, '/notifications');
  }

  /** The service worker has to come from the site's root to cover every page. */
  function serviceWorker(ctx) {
    const file = assets.files.get('sw.js');
    ctx.res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': file.type, 'Cache-Control': 'no-cache' });
    ctx.res.end(file.body);
  }

  /**
   * Pick a look: a preset, a team's colors ("Match my team") or two colors of
   * your own ("Custom"), on a dark or light background. Team and custom
   * colors go through the readability guard before they're saved.
   */
  function themePost(ctx) {
    if (!signedIn(ctx)) return;
    const theme = ctx.form.get('theme');
    const back = `/u/${encodeURIComponent(ctx.user.screenName)}`;
    const mode = ctx.form.get('mode') === 'light' ? 'light' : 'dark';
    const save = (team, accent, tint) => store.run(
      "UPDATE users SET theme = 'custom', theme_team = ?, theme_mode = ?, theme_accent = ?, theme_tint = ? WHERE id = ?",
      team, mode, accent, tint, ctx.user.id,
    );
    if (THEMES.includes(theme)) {
      store.run('UPDATE users SET theme = ?, theme_team = NULL WHERE id = ?', theme, ctx.user.id);
    } else if (theme === 'team') {
      const team = teamByKey(store, ctx.form.get('team'));
      if (!team) {
        flash(ctx, 'error', 'Pick a team from the list.');
        return redirect(ctx, `${back}#color`);
      }
      const { accent, how } = teamAccent({ primary: team.color, alternate: team.alt }, mode);
      save(team.key, accent, team.color);
      flash(ctx, 'ok', how === 'alternate'
        ? `${team.name} colors are on. Their main color is hard to read here, so the accent is their other one.`
        : how ? `${team.name} colors are on, a shade ${how === 'lightened' ? 'lighter' : 'darker'} so they're easy to read.` : `${team.name} colors are on.`);
      return redirect(ctx, `${back}#color`);
    } else if (theme === 'custom') {
      const accent = cleanHex(ctx.form.get('accent'));
      const tint = cleanHex(ctx.form.get('tint'));
      if (!accent || !tint) {
        flash(ctx, 'error', 'Pick both colors with the color boxes.');
        return redirect(ctx, `${back}#color`);
      }
      const readable = customTokens({ mode, accent, tint }).accent;
      save(null, readable, tint);
      flash(ctx, 'ok', readable === accent ? 'Your colors are on.' : `Your colors are on. The accent is a shade ${mode === 'light' ? 'darker' : 'lighter'} so it's easy to read.`);
      return redirect(ctx, `${back}#color`);
    }
    redirect(ctx, back);
  }

  /**
   * A team or custom look's stylesheet. The colors are its name, matched
   * letter for letter, so it can be cached forever and can only ever hold
   * hex colors.
   */
  function themeSheet(ctx, { file }) {
    const style = parseSheet(file);
    if (!style) return notFound(ctx);
    const body = themeCss(style, { preview: style.preview });
    const etag = `"${crypto.createHash('sha256').update(body).digest('hex').slice(0, 16)}"`;
    const cache = 'public, max-age=31536000, immutable';
    if (ctx.req.headers['if-none-match'] === etag) {
      ctx.res.writeHead(304, { ETag: etag, 'Cache-Control': cache });
      return ctx.res.end();
    }
    ctx.res.writeHead(200, {
      ...SECURITY_HEADERS,
      'Content-Type': 'text/css; charset=utf-8',
      'Content-Length': Buffer.byteLength(body),
      ETag: etag,
      'Cache-Control': cache,
    });
    ctx.res.end(body);
  }

  // ---- profile photos and covers ------------------------------------------------

  /**
   * A profile photo or cover, by its random name. A name that isn't exactly
   * one of ours never touches the disk, and only a file someone has right now
   * is served. One hidden by reports is for admins only.
   */
  function mediaFile(ctx, { name }) {
    if (!MEDIA_NAME.test(name)) return notFound(ctx);
    const owner = mediaOwner(store, name);
    if (!owner || (owner.hidden && !isAdmin(ctx))) return notFound(ctx);
    let body;
    try {
      body = fs.readFileSync(path.join(media, name));
    } catch {
      return notFound(ctx);
    }
    ctx.res.writeHead(200, {
      ...SECURITY_HEADERS,
      'Content-Type': MEDIA_TYPES[name.split('.').pop()],
      'Content-Length': body.length,
      // A new photo gets a new name, so a name never changes what it shows.
      'Cache-Control': owner.hidden ? 'private, no-store' : 'public, max-age=31536000, immutable',
    });
    ctx.res.end(body);
  }

  // What the flash messages call each kind.
  const SAID = { avatar: { name: 'Photo', last: 'photo' }, cover: { name: 'Cover photo', last: 'cover photo' } };

  /** Store an uploaded photo (or cover) for `userId` and go back to `back`, saying what happened. */
  function takePhoto(ctx, userId, back, kind = 'avatar') {
    if (ctx.tooBig) {
      flash(ctx, 'error', tooBigText(kind));
      return redirect(ctx, back);
    }
    const until = uploadBlockedUntil(store, userId, ctx.now, kind);
    if (until) {
      flash(ctx, 'error', `An admin removed your last ${SAID[kind].last}. You can add a new one after ${dateLabel(until)}.`);
      return redirect(ctx, back);
    }
    const image = cleanImage(ctx.files?.get(KINDS[kind].field)?.data, kind);
    if (image.error) {
      flash(ctx, 'error', image.error);
    } else {
      savePhoto(store, media, userId, image, kind);
      flash(ctx, 'ok', `${SAID[kind].name} saved.`);
    }
    redirect(ctx, back);
  }

  /** Your own photo or cover: upload, or remove. */
  const ownUpload = (kind) => (ctx) => {
    if (!signedIn(ctx)) return;
    takePhoto(ctx, ctx.user.id, `/u/${encodeURIComponent(ctx.user.screenName)}#${KINDS[kind].anchor}`, kind);
  };

  const ownRemove = (kind) => (ctx) => {
    if (!signedIn(ctx)) return;
    clearPhoto(store, media, ctx.user.id, kind);
    flash(ctx, 'ok', `${SAID[kind].name} removed.`);
    redirect(ctx, `/u/${encodeURIComponent(ctx.user.screenName)}#${KINDS[kind].anchor}`);
  };

  /** Anyone signed in reporting someone else's photo or cover, once. */
  const reportPost = (kind) => (ctx, { name }) => {
    if (!signedIn(ctx)) return;
    const player = store.get('SELECT id, screen_name FROM users WHERE screen_name = ?', name);
    if (!player) return notFound(ctx);
    const result = reportPhoto(store, { ownerId: player.id, reporterId: ctx.user.id, now: ctx.now, kind });
    const what = kind === 'cover' ? 'a cover' : 'a photo';
    flash(ctx, result.error ? 'error' : 'ok', result.error ?? `Thanks. An admin will look at it. ${PHOTO_HIDE_AFTER} reports hide ${what} until then.`);
    redirect(ctx, `/u/${encodeURIComponent(player.screen_name)}`);
  };

  /** The official account has no login, so only an admin can give it a photo. */
  function officialTarget(ctx) {
    if (!isAdmin(ctx)) return null;
    const id = ensureOfficial(store, ctx.now);
    return id ? store.get('SELECT id, screen_name FROM users WHERE id = ?', id) : null;
  }

  const officialUpload = (kind) => (ctx) => {
    const official = officialTarget(ctx);
    if (!official) return notFound(ctx);
    takePhoto(ctx, official.id, `/u/${encodeURIComponent(official.screen_name)}#${KINDS[kind].anchor}`, kind);
  };

  const officialRemove = (kind) => (ctx) => {
    const official = officialTarget(ctx);
    if (!official) return notFound(ctx);
    clearPhoto(store, media, official.id, kind);
    flash(ctx, 'ok', `${SAID[kind].name} removed.`);
    redirect(ctx, `/u/${encodeURIComponent(official.screen_name)}#${KINDS[kind].anchor}`);
  };

  // The admin's buttons send the file name and its kind (a photo when not said).
  function adminPhotoRemove(ctx, { id }) {
    if (!isAdmin(ctx)) return notFound(ctx);
    const kind = kindOf(ctx.form.get('kind'));
    const result = removeReportedPhoto(store, media, { userId: Number(id), photo: ctx.form.get('photo') ?? '', now: ctx.now, notifier, kind });
    flash(ctx, result.error ? 'error' : 'ok', result.error ?? `${SAID[kind].name} removed. They've been told, and can't add another for ${PHOTO_BLOCK_DAYS} days.`);
    redirect(ctx, '/admin/reports#photos');
  }

  function adminPhotoDismiss(ctx, { id }) {
    if (!isAdmin(ctx)) return notFound(ctx);
    const kind = kindOf(ctx.form.get('kind'));
    const result = dismissPhoto(store, { userId: Number(id), photo: ctx.form.get('photo') ?? '', kind });
    flash(ctx, result.error ? 'error' : 'ok', result.error ?? 'Kept. Its reports are cleared.');
    redirect(ctx, '/admin/reports#photos');
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
    const files = filesOf(store, ctx.user.id);
    store.run('DELETE FROM users WHERE id = ?', ctx.user.id);
    for (const file of files) deleteFile(media, file);
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
    ['GET', '/theme/:file', themeSheet],
    ['GET', '/media/:name', mediaFile],
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
    ['GET', '/setup', setupForm],
    ['POST', '/setup', setupPost],
    ['POST', '/setup/skip', setupSkip],
    ['GET', '/games', gamesPage],
    ['GET', '/games/:id', gamePage],
    ['GET', '/games/:id/bb', sitePicksPage],
    ['POST', '/games/:id/follow', gameFollow],
    ['POST', '/games/:id/unfollow', gameUnfollow],
    ['GET', '/games/:id/alerts', gameAlertsPage],
    ['POST', '/settings/game-alerts', gameAlertsSettings],
    ['POST', '/bb/locks/dismiss', locksCardDismiss],
    ['POST', '/bb/settings', sitePicksSetting],
    ['POST', '/games/:id/chat', chatPost],
    ['POST', '/chat/:id/delete', chatDelete],
    ['POST', '/chat/:id/report', chatReport],
    ['GET', '/chat', chatHub],
    ['GET', '/pick', pickForm],
    ['POST', '/picks', pickPost],
    ['GET', '/picks', myPicks],
    ['POST', '/picks/:id/delete', pickDelete],
    ['POST', '/picks/:id/streak', pickStreak],
    ['GET', '/parlay', parlayPage],
    ['POST', '/parlay/legs', parlayLegAdd],
    ['POST', '/parlay/legs/:game/delete', parlayLegRemove],
    ['POST', '/parlays', parlayPost],
    ['POST', '/parlays/:id/delete', parlayDelete],
    ['GET', '/leaderboard', leaderboardPage],
    ['GET', '/search', searchPage],
    ['GET', '/contest', contestPage],
    ['GET', '/winners', winnersPage],
    ['GET', '/tournaments', tournamentsPage],
    ['GET', '/tournaments/new', (ctx) => tournamentNewForm(ctx)],
    ['GET', '/tournaments/survivor', (ctx) => redirect(ctx, '/survivor', 302)],
    ['GET', '/tournaments/pickem', (ctx) => redirect(ctx, '/pickem/nfl', 302)],
    ['GET', '/tournaments/cup', (ctx) => redirect(ctx, '/cup', 302)],
    ['GET', '/survivor', survivorPage],
    ['POST', '/survivor/join', survivorJoin],
    ['POST', '/survivor/pick', survivorPick],
    ['GET', '/pickem/nfl', (ctx) => pickemPage(ctx)],
    ['POST', '/pickem/nfl', pickemPost],
    ['GET', '/cup', cupPage],
    ['GET', '/leagues', leaguesPage],
    ['GET', '/leagues/new', (ctx) => leagueNewForm(ctx)],
    ['POST', '/leagues/new', leagueCreate],
    ['GET', '/leagues/:id', leaguePage],
    ['GET', '/l/:code', leagueInvite],
    ['POST', '/leagues/:id/join', leagueJoin],
    ['POST', '/leagues/:id/leave', leagueLeave],
    ['GET', '/bracket', (ctx) => bracketPage(ctx)],
    ['POST', '/bracket', bracketPost],
    ['GET', '/admin/bracket', (ctx) => adminBracket(ctx)],
    ['POST', '/admin/bracket/start', adminBracketStart],
    ['POST', '/admin/bracket/espn', adminBracketEspn],
    ['POST', '/admin/bracket/open', adminBracketOpen],
    ['POST', '/admin/bracket/field', adminBracketField],
    ['POST', '/admin/bracket/paste', adminBracketPaste],
    ['POST', '/admin/bracket/results', adminBracketResults],
    ['GET', '/tournaments/:slug/rules', prizeRules],
    ['GET', '/admin/tournaments/:slug/prize', (ctx, params) => adminPrizePage(ctx, params)],
    ['POST', '/admin/tournaments/:slug/prize', adminPrizeSave],
    ['POST', '/admin/tournaments/:slug/prize/review', adminPrizeReview],
    ['POST', '/admin/tournaments/:slug/prize/publish', adminPrizePublish],
    ['POST', '/admin/tournaments/:slug/prize/sent', adminPrizeSent],
    ['POST', '/tournaments/new', tournamentCreate],
    ['GET', '/tournaments/:slug', tournamentPage],
    ['GET', '/t/:code', tournamentInvite],
    ['POST', '/tournaments/:slug/join', tournamentJoin],
    ['POST', '/tournaments/:slug/leave', tournamentLeave],
    ['POST', '/tournaments/:slug/cancel', tournamentCancel],
    ['POST', '/tournaments/:slug/report', tournamentReport],
    ['POST', '/tournaments/:slug/chat', tournamentChatPost],
    ['GET', '/admin/tournaments', adminTournaments],
    ['POST', '/admin/tournaments', adminTournamentCreate],
    ['POST', '/admin/tournaments/:slug/cancel', adminTournamentCancel],
    ['POST', '/admin/tournaments/:slug/dismiss', adminTournamentDismiss],
    ['GET', '/streak', streakPage],
    ['GET', '/invite', invitePage],
    ['GET', '/i/:code', inviteLink],
    ['GET', '/admin/reports', adminReports],
    ['POST', '/admin/reports/:id/restore', adminRestore],
    ['POST', '/admin/reports/:id/delete', adminDelete],
    ['GET', '/admin/rooms', adminRooms],
    ['POST', '/admin/rooms', adminRoomStart],
    ['POST', '/admin/rooms/:id/rename', adminRoomRename],
    ['POST', '/admin/rooms/:id/archive', adminRoomArchive],
    ['POST', '/admin/rooms/:id/restore', adminRoomArchive],
    ['GET', '/local', (ctx) => localPage(ctx)],
    ['POST', '/local', localStart],
    ['GET', '/local/:slug', localCity],
    ['POST', '/groups/:id/join', roomJoin],
    ['POST', '/home-city', homeCityPost],
    ['POST', '/nametag', nametagPost],
    ['POST', '/admin/photos/:id/remove', adminPhotoRemove],
    ['POST', '/admin/photos/:id/dismiss', adminPhotoDismiss],
    ['POST', '/admin/official/photo', officialUpload('avatar'), { upload: 'avatar' }],
    ['POST', '/admin/official/photo/delete', officialRemove('avatar')],
    ['POST', '/admin/official/cover', officialUpload('cover'), { upload: 'cover' }],
    ['POST', '/admin/official/cover/delete', officialRemove('cover')],
    ['GET', '/groups', groupsPage],
    ['POST', '/groups', groupCreate],
    ['POST', '/groups/join', groupJoinByCode],
    ['GET', '/groups/:id', groupPage],
    ['POST', '/groups/:id/chat', groupChatPost],
    ['POST', '/groups/:id/leave', groupLeave],
    ['POST', '/groups/:id/delete', groupDelete],
    ['GET', '/join/:code', joinPage],
    ['POST', '/join/:code', joinPost],
    ['GET', '/u/:name', profilePage],
    ['POST', '/u/:name/follow', followPost],
    ['POST', '/u/:name/unfollow', unfollowPost],
    ['POST', '/u/:name/photo/report', reportPost('avatar')],
    ['POST', '/u/:name/cover/report', reportPost('cover')],
    ['GET', '/following', followingPage],
    ['GET', '/hot', hotPage],
    ['GET', '/notifications', notificationsPage],
    ['POST', '/notifications/settings', notifyPrefs],
    ['POST', '/push/subscribe', pushSubscribe],
    ['POST', '/push/unsubscribe', pushUnsubscribe],
    ['GET', '/sw.js', serviceWorker],
    ['GET', '/more', morePage],
    ['GET', '/install', (ctx) => send(ctx, 200, moreViews.install(ctx))],
    ['GET', '/live', livePage],
    ['POST', '/theme', themePost],
    ['POST', '/photo', ownUpload('avatar'), { upload: 'avatar' }],
    ['POST', '/photo/delete', ownRemove('avatar')],
    ['POST', '/cover', ownUpload('cover'), { upload: 'cover' }],
    ['POST', '/cover/delete', ownRemove('cover')],
    ['POST', '/bio', bioPost],
    ['POST', '/link', linkPost],
    ['POST', '/name', namePost],
    ['POST', '/screen-name', screenNamePost],
    ['POST', '/account/delete', deleteAccount],
    ['GET', '/verify', verify],
    ['POST', '/verify/resend', verifyResend],
    ['GET', '/terms', (ctx) => send(ctx, 200, legal.terms(ctx, { contact }))],
    ['GET', '/privacy', (ctx) => send(ctx, 200, legal.privacy(ctx, { contact }))],
  ].map(([method, pattern, handler, { upload = null } = {}]) => {
    const keys = [];
    const regex = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, key) => (keys.push(key), '([^/]+)'))}$`);
    return { method, regex, keys, handler, upload };
  });

  function match(method, pathname) {
    const verb = method === 'HEAD' ? 'GET' : method;
    for (const r of routes) {
      if (r.method !== verb) continue;
      const m = r.regex.exec(pathname);
      if (!m) continue;
      try {
        return { handler: r.handler, upload: r.upload, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
      } catch {
        return null;
      }
    }
    return null;
  }

  return async function handle(req, res) {
    const url = new URL(req.url, 'http://local');
    const ctx = { req, res, app, url, query: url.searchParams, now: now(), origin: null, cookies: [], cookieValues: {}, user: null, session: null, flash: null, form: null };
    try {
      ctx.origin = config.appUrl ?? origin(ctx);
      const route = match(req.method, url.pathname);
      if (!route) return notFound(ctx);

      const cookies = parseCookies(req.headers.cookie);
      ctx.cookieValues = cookies;
      ctx.session = auth.readSession(store, cookies.sid, ctx.now);
      ctx.user = ctx.session?.user ?? null;
      // The parlay bar, and the unread count on the bell.
      if (ctx.user?.screenName) {
        ctx.parlay = draftSummary(store, ctx.user.id, ctx.now);
        ctx.unread = notifier.unread(ctx.user.id);
        // The units pill in the header: looked up only when a page is drawn.
        const userId = ctx.user.id;
        ctx.myUnits = () => record(store, userId).units;
      }
      if (cookies.flash) {
        ctx.flash = readFlash(cookies.flash);
        setCookie(ctx, 'flash', '', 0);
      }

      if (req.method === 'POST') {
        if (!sameOrigin(req, config)) return send(ctx, 403, account.problem(ctx, { status: 403, text: 'That form came from another site.' }));
        // Photo and cover uploads may be bigger, and multipart. One that's too big is
        // read to the end (so the browser hears back) but not kept, and its
        // handler only says so: nothing changes, so there's no token to check.
        const body = await readBody(req, route.upload ? KINDS[route.upload].max + UPLOAD_ROOM : MAX_BODY, route.upload ? DRAIN_UPLOAD : DRAIN_FORM);
        if (body.tooBig && !route.upload) throw Object.assign(new Error('form too large'), { status: 413 });
        ctx.tooBig = Boolean(body.tooBig);
        const parsed = body.tooBig ? { fields: new URLSearchParams(), files: new Map() } : parseBody(body.data, req.headers['content-type'], route.upload);
        ctx.form = parsed.fields;
        ctx.files = parsed.files;
        if (!ctx.tooBig && ctx.session && !sameToken(ctx.form.get('_csrf'), ctx.session.csrf)) {
          return send(ctx, 403, account.problem(ctx, { status: 403, text: 'That form was out of date. Go back, reload the page, and try again.' }));
        }
      }
      await route.handler(ctx, route.params);
    } catch (err) {
      if (res.headersSent) return res.destroy(err);
      // The connection is already gone (a body far too big): nobody to answer.
      if (err.closed || !req.socket || req.socket.destroyed) return res.destroy();
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
    const { type, text, at, game } = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (typeof text !== 'string' || text.length >= 300) return null;
    const time = typeof at === 'string' && !Number.isNaN(Date.parse(at)) ? new Date(at).toISOString() : null;
    return { type: ['error', 'locked'].includes(type) ? type : 'ok', text, at: time, game: typeof game === 'string' && game.length < 100 ? game : null };
  } catch {
    return null;
  }
}

/**
 * A request body, up to `limit` bytes. Past that, keep reading up to `drain`
 * bytes without keeping any of it, and say it was too big. Past `drain`,
 * close the connection.
 */
async function readBody(req, limit, drain = 0) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      if (size > drain) {
        req.destroy();
        throw Object.assign(new Error('body far too large'), { closed: true });
      }
      continue;
    }
    chunks.push(chunk);
  }
  return size > limit ? { tooBig: true } : { data: Buffer.concat(chunks) };
}

/** Form fields (and, on upload routes, files) from a body. Anything else reads as an empty form. */
function parseBody(data, contentType = '', upload = false) {
  const type = String(contentType ?? '');
  const empty = () => ({ fields: new URLSearchParams(), files: new Map() });
  if (type.startsWith('application/x-www-form-urlencoded')) return { fields: new URLSearchParams(data.toString('utf8')), files: new Map() };
  if (upload && type.startsWith('multipart/form-data')) return parseMultipart(data, type) ?? empty();
  return empty();
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
