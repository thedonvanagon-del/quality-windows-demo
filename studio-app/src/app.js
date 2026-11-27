// The HTTP app: a tiny router, a per-request context, and the security basics
// (CSRF on every POST, strict headers, size-capped bodies).

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  clearCookieHeader, cookieHeader, COOKIE, createLimiter, createSession, csrfMatches, destroySession,
  findSession, isAdmin, parseCookies,
} from './auth.js';
import { html } from './html.js';
import { createNotifier } from './notify.js';
import { getSettings } from './settings.js';
import { layout, notFoundPage } from './views.js';
import { registerAccount } from './routes-account.js';
import { registerAdmin } from './routes-admin.js';
import { registerAuth } from './routes-auth.js';
import { registerBook } from './routes-book.js';
import { registerPublic } from './routes-public.js';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const TYPES = { '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const MAX_BODY = 100_000;

const HEADERS = {
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'geolocation=(), camera=(), microphone=()',
};

export function createApp({ store, config, mailer, now = () => new Date() }) {
  const tz = config.timezone;
  const notifier = createNotifier({ mailer, config, getSettings: () => getSettings(store), tz });
  const deps = {
    store, config, tz, notifier, now,
    loginLimiter: createLimiter(8, 15 * 60_000),
    codeLimiter: createLimiter(10, 60 * 60_000),
  };
  const flashes = new Map(); // session token hash → message, shown once

  const routes = [];
  const add = (method, pattern, handler) => {
    const names = [];
    const source = pattern.replace(/:(\w+)/g, (_, n) => (names.push(n), '([^/]+)'));
    routes.push({ method, regex: new RegExp(`^${source}$`), names, handler });
  };
  registerPublic(add, deps);
  registerAuth(add, deps);
  registerBook(add, deps);
  registerAccount(add, deps);
  registerAdmin(add, deps);

  add('GET', '/healthz', (ctx) => {
    store.get('SELECT 1 AS ok');
    ctx.send(200, 'ok\n', 'text/plain; charset=utf-8');
  });

  return async function handle(req, res) {
    let ctx;
    try {
      ctx = await makeContext(req, res);
      const path = ctx.url.pathname;
      if (req.method === 'GET' && path.startsWith('/static/')) return await serveStatic(ctx, path.slice(8));

      let matched = null;
      let pathExists = false;
      for (const r of routes) {
        const m = r.regex.exec(path);
        if (!m) continue;
        pathExists = true;
        if (r.method !== (req.method === 'HEAD' ? 'GET' : req.method)) continue;
        matched = { r, m };
        break;
      }
      if (!matched) {
        if (pathExists) return ctx.send(405, 'Method not allowed\n', 'text/plain; charset=utf-8');
        return ctx.page(notFoundPage(ctx), 404);
      }
      ctx.params = Object.fromEntries(matched.r.names.map((n, i) => {
        try { return [n, decodeURIComponent(matched.m[i + 1])]; } catch { return [n, '']; }
      }));

      if (req.method === 'POST') {
        await readForm(ctx);
        if (!csrfMatches(ctx.session, ctx.form._csrf)) {
          return ctx.page(layout(ctx, { title: 'Please try again', body: html`<section class="wrap narrow center page"><h1>That page timed out</h1><p>For your safety, forms expire. Go back, refresh, and try once more.</p><p><a class="btn" href="/">Back to the studio</a></p></section>` }), 403);
        }
      } else if (!ctx.session && req.method === 'GET') {
        ctx.ensureSession();
      }
      await matched.r.handler(ctx);
    } catch (err) {
      if (err.status === 413) return res.writeHead(413, { 'Content-Type': 'text/plain' }).end('Too large\n');
      console.error(`${req.method} ${req.url}: ${err.stack ?? err}`);
      if (res.headersSent) return res.end();
      try {
        const c = ctx ?? (await makeContext(req, res));
        c.page(layout(c, { title: 'Something went wrong', body: html`<section class="wrap narrow center page"><h1>Something went wrong</h1><p>That one is on us. Please try again in a moment.</p></section>` }), 500);
      } catch {
        res.writeHead(500, { 'Content-Type': 'text/plain' }).end('Server error\n');
      }
    }
  };

  async function makeContext(req, res) {
    const url = new URL(req.url, 'http://studio.local');
    const token = parseCookies(req.headers.cookie)[COOKIE];
    const proto = config.trustProxy ? String(req.headers['x-forwarded-proto'] ?? '').split(',')[0].trim() : req.socket.encrypted ? 'https' : 'http';
    const secure = proto === 'https';
    const cookies = [];
    const ctx = {
      req, res, url, query: url.searchParams, params: {}, form: Object.create(null),
      store, config, tz, notifier, now, deps,
      secure,
      session: findSession(store, token, now()),
      settings: getSettings(store),
      get user() { return this.session?.user ?? null; },
      get isAdmin() { return isAdmin(this.user, config); },
      ip: config.trustProxy ? String(req.headers['x-forwarded-for'] ?? '').split(',').pop().trim() || req.socket.remoteAddress : req.socket.remoteAddress,
      setCookie(value) { cookies.push(value); },
      ensureSession() {
        if (!this.session) this.signIn(null);
        return this.session;
      },
      csrfToken() { return this.ensureSession().csrf; },
      /** Starts a fresh session (a new token on sign-in, so an old one can't be reused). */
      signIn(userId) {
        const old = parseCookies(req.headers.cookie)[COOKIE];
        const pendingFlash = this.session ? flashes.get(this.session.tokenHash) : null;
        if (old && userId) destroySession(store, old);
        const s = createSession(store, userId, now());
        this.setCookie(cookieHeader(s.token, s.maxAgeSeconds, secure));
        this.session = findSession(store, s.token, now());
        if (pendingFlash) flashes.set(this.session.tokenHash, pendingFlash);
      },
      signOut() {
        destroySession(store, parseCookies(req.headers.cookie)[COOKIE]);
        this.setCookie(clearCookieHeader(secure));
        this.session = null;
      },
      flash(message) {
        flashes.set(this.ensureSession().tokenHash, message);
        if (flashes.size > 5000) flashes.delete(flashes.keys().next().value);
      },
      takeFlash() {
        const key = this.session?.tokenHash;
        const message = key ? flashes.get(key) : null;
        if (message) flashes.delete(key);
        return message ?? null;
      },
      send(status, body, type = 'text/html; charset=utf-8', extra = {}) {
        const headers = { ...HEADERS, 'Content-Type': type, 'Cache-Control': 'no-store', ...extra };
        if (secure) headers['Strict-Transport-Security'] = 'max-age=31536000';
        if (cookies.length) headers['Set-Cookie'] = cookies;
        res.writeHead(status, headers);
        res.end(req.method === 'HEAD' ? undefined : body);
      },
      page(view, status = 200) { this.send(status, String(view.s ?? view)); },
      redirect(location, message) {
        if (message) this.flash(message);
        this.send(303, '', 'text/plain; charset=utf-8', { Location: location });
      },
    };
    return ctx;
  }

  async function serveStatic(ctx, name) {
    if (!/^[a-zA-Z0-9._-]+$/.test(name) || name.startsWith('.')) return ctx.page(notFoundPage(ctx), 404);
    try {
      const data = await fs.readFile(path.join(PUBLIC_DIR, name));
      ctx.res.writeHead(200, { ...HEADERS, 'Content-Type': TYPES[path.extname(name)] ?? 'application/octet-stream', 'Cache-Control': 'public, max-age=3600' });
      ctx.res.end(ctx.req.method === 'HEAD' ? undefined : data);
    } catch {
      ctx.page(notFoundPage(ctx), 404);
    }
  }
}

async function readForm(ctx) {
  const chunks = [];
  let size = 0;
  for await (const chunk of ctx.req) {
    size += chunk.length;
    if (size > MAX_BODY) throw Object.assign(new Error('body too large'), { status: 413 });
    chunks.push(chunk);
  }
  const type = String(ctx.req.headers['content-type'] ?? '');
  if (!type.startsWith('application/x-www-form-urlencoded')) return;
  for (const [k, v] of new URLSearchParams(Buffer.concat(chunks).toString('utf8'))) {
    if (k in ctx.form) ctx.form[k] = [ctx.form[k], v].flat();
    else ctx.form[k] = v;
  }
}
