// Google Play's 1024×500 feature graphic, drawn as a page and captured.
//   node feature.mjs <out.png> <crest.png (transparent)> <picks-app/public>
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
// Playwright, installed globally (npm i -g playwright && npx playwright install chromium).
const require = createRequire(`${execSync('npm root -g').toString().trim()}/`);
const { chromium } = require('playwright');

const [out, crest, fonts] = process.argv.slice(2);
const b64 = (f) => fs.readFileSync(f).toString('base64');
const page = `<!doctype html><html><head><style>
@font-face { font-family: Brand; src: url(data:font/woff2;base64,${b64(`${fonts}/black-ops-one-latin-400-normal.woff2`)}) format('woff2'); }
@font-face { font-family: Cond; font-weight: 700; src: url(data:font/woff2;base64,${b64(`${fonts}/barlow-condensed-latin-700-normal.woff2`)}) format('woff2'); }
@font-face { font-family: Barlow; font-weight: 600; src: url(data:font/woff2;base64,${b64(`${fonts}/barlow-latin-600-normal.woff2`)}) format('woff2'); }
html, body { margin: 0; width: 1024px; height: 500px; overflow: hidden; }
body { background: radial-gradient(circle at 22% 50%, #16244d 0%, #0a1228 62%); color: #fff; display: flex; align-items: center; gap: 44px; padding: 0 64px; box-sizing: border-box; position: relative; }
body::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 8px; background: #ffb020; }
img { width: 300px; height: auto; filter: drop-shadow(0 12px 30px rgba(0,0,0,.5)); }
h1 { font: 400 96px/1 Brand; margin: 0; letter-spacing: 0.03em; }
.by { font: 700 30px/1 Cond; color: #ffb020; letter-spacing: 0.14em; margin: 10px 0 26px; }
p { font: 600 30px/1.3 Barlow; color: #c9d3ee; margin: 0; max-width: 560px; }
</style></head><body><img src="data:image/png;base64,${b64(crest)}"><div><h1>LOCKBOX</h1><div class="by">BY BOOKIEBULLIES.COM</div><p>Free pick'em and pick tracker. Picks lock at the start and grade off final scores.</p></div></body></html>`;
const browser = await chromium.launch();
const p = await browser.newPage({ viewport: { width: 1024, height: 500 } });
await p.setContent(page);
await p.waitForTimeout(300);
await p.screenshot({ path: out });
await browser.close();
