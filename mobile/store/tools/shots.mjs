// Store screenshots from the demo (npm run demo on BASE), as the app shows
// them: the app's user agent (no Get the app prompts) and no launch screen.
// With STANDIN_LOGOS=1 (ESPN's logo server out of reach, as when the
// committed set was made), team logos are stand-ins: a circle in a color
// from the team's abbreviation. Without it, the real logos load.
//   node shots.mjs <outDir> <width> <height> <scale>
// The committed sets: 440 956 3 (6.9" iPhone, 1320×2868), 428 926 3 (6.5",
// 1284×2778), 360 720 3 (Google Play phone, 1080×2160). Start a fresh demo for
// each (it locks a pick), then save them as RGB (no alpha) for the stores.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
// Playwright, installed globally (npm i -g playwright && npx playwright install chromium).
const require = createRequire(`${execSync('npm root -g').toString().trim()}/`);
const { chromium } = require('playwright');

const [outDir, w, h, scale] = process.argv.slice(2);
const BASE = process.env.BASE ?? 'http://localhost:3460';
fs.mkdirSync(outDir, { recursive: true });

const logo = (abbr) => {
  let hash = 0;
  for (const c of abbr) hash = (hash * 31 + c.charCodeAt(0)) % 360;
  const text = abbr.toUpperCase().slice(0, 4);
  const size = text.length > 3 ? 150 : 190;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500" viewBox="0 0 500 500"><circle cx="250" cy="250" r="235" fill="hsl(${hash},62%,42%)" stroke="hsl(${hash},62%,72%)" stroke-width="18"/><text x="250" y="${250 + size * 0.36}" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="${size}" text-anchor="middle" fill="#fff">${text}</text></svg>`;
};

const browser = await chromium.launch();
const ua = `Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 LockBoxApp LockBoxPush`;
const context = await browser.newContext({ viewport: { width: Number(w), height: Number(h) }, deviceScaleFactor: Number(scale), isMobile: true, hasTouch: true, userAgent: ua });
await context.addCookies([{ name: 'bb_seen', value: '1', url: BASE }]);
if (process.env.STANDIN_LOGOS) {
  await context.route('https://a.espncdn.com/**', (route) => {
    const abbr = (route.request().url().split('/').pop() ?? 'x').replace(/\.png.*$/, '');
    route.fulfill({ status: 200, contentType: 'image/svg+xml', body: logo(abbr) });
  });
}
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const shot = async (name) => {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${outDir}/${name}.png` });
};

await page.goto(`${BASE}/login`);
await page.fill('input[name=email]', 'demo@example.com');
await page.fill('input[name=password]', 'letmein123');
await Promise.all([page.waitForNavigation(), page.click('form button[type=submit], form button:not([type])')]);
await context.addCookies([{ name: 'bb_seen', value: '1', url: BASE }]);

// 1. The board.
await page.goto(`${BASE}/games`);
await shot('01-board');

// 2. The pick slip, over the board.
await page.locator('a.pbtn[href^="/pick?"]:visible').nth(2).click();
await page.waitForSelector('dialog.sheet .slip form[data-odds]');
await page.locator('dialog.sheet .slip button', { hasText: /^\s*2u\s*$/ }).first().click().catch(() => {});
await shot('02-pick-slip');

// 3. Locked: the ticket on the card.
await Promise.all([page.waitForNavigation(), page.locator('dialog.sheet .slip form[data-odds] button', { hasText: /Lock it in/i }).first().click()]);
await page.waitForTimeout(400);
const ticket = page.locator('.locked-ticket').first();
await ticket.scrollIntoViewIfNeeded();
await page.evaluate(() => window.scrollBy(0, -140));
await shot('03-locked');

// 4. A profile: the record card.
const me = await page.locator('a.user-chip').getAttribute('href');
await page.goto(`${BASE}${me}`);
await shot('04-profile');

// 5. The leaderboard.
await page.goto(`${BASE}/leaderboard`);
await shot('05-leaderboard');

// 6. Tournaments.
await page.goto(`${BASE}/tournaments`);
await shot('06-tournaments');

await browser.close();
if (errors.length) {
  console.error(`page errors: ${errors.join(' | ')}`);
  process.exitCode = 1;
}
console.log(`saved to ${outDir}`);
