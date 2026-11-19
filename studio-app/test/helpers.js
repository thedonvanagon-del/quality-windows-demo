import http from 'node:http';

import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { openStore } from '../src/db.js';
import { seedIfEmpty } from '../src/seed.js';

// Friday 6 Nov 2026, noon in Santa Barbara (PST, UTC-8). Studio hours: Tue-Fri 10-5, Sat 9-2.
export const NOW = new Date('2026-11-06T20:00:00Z');

export async function makeApp({ adminEmails = ['owner@example.com'], now = NOW } = {}) {
  const store = openStore(':memory:');
  seedIfEmpty(store);
  const outbox = [];
  const mailer = { configured: true, send: async (m) => { outbox.push(m); } };
  const clock = { now };
  const config = { ...loadConfig({}), adminEmails, appUrl: 'http://studio.test' };
  const server = http.createServer(createApp({ store, config, mailer, now: () => clock.now }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  server.unref(); // a failed test must not keep the runner alive
  const base = `http://127.0.0.1:${server.address().port}`;

  function client() {
    const jar = new Map();
    let csrf = null;
    async function request(method, path, form) {
      const headers = { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') };
      let body;
      if (method === 'POST') {
        headers['content-type'] = 'application/x-www-form-urlencoded';
        const params = new URLSearchParams();
        for (const [k, v] of Object.entries({ _csrf: csrf, ...form })) {
          if (v == null) continue;
          for (const item of [v].flat()) params.append(k, item);
        }
        body = params.toString();
      }
      const res = await fetch(base + path, { method, headers, body, redirect: 'manual' });
      for (const c of res.headers.getSetCookie()) {
        const [pair] = c.split(';');
        const i = pair.indexOf('=');
        const name = pair.slice(0, i);
        const value = pair.slice(i + 1);
        if (/Max-Age=0/i.test(c)) jar.delete(name);
        else jar.set(name, value);
      }
      const text = await res.text();
      const m = /name="_csrf" value="([^"]+)"/.exec(text);
      if (m) csrf = m[1];
      return { status: res.status, location: res.headers.get('location'), headers: res.headers, text };
    }
    const c = {
      get: (path) => request('GET', path),
      post: (path, form = {}) => request('POST', path, form),
      /** Follows redirects (GET) until a page. */
      async follow(res) {
        let r = res;
        for (let i = 0; i < 5 && r.location; i += 1) r = await c.get(r.location);
        return r;
      },
      async signIn(email) {
        await c.get('/login');
        await c.post('/login/code', { email, next: '/account' });
        const mail = outbox.filter((m) => m.to === email).at(-1);
        const code = /(\d{6}) is your sign-in code/.exec(mail.subject)[1];
        const res = await c.post('/login/verify', { email, code, next: '/account' });
        // Sign-in starts a fresh session with a fresh CSRF token. A browser picks it up by
        // loading the next page; so does this.
        await c.get('/account');
        return res;
      },
    };
    return c;
  }

  return { store, outbox, clock, base, client, close: () => new Promise((resolve) => server.close(resolve)) };
}

/** Pulls the open times (as the hrefs the page links to) from a times page. */
export function slotLinks(html) {
  return [...html.matchAll(/class="slot" href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
}
