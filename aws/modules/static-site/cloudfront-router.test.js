const fs = require('fs');
const vm = require('vm');

const src = fs.readFileSync(require('path').join(__dirname, 'cloudfront-router.js'), 'utf8');
const ctx = { encodeURIComponent };
vm.createContext(ctx);
vm.runInContext(src + '\nthis.handler = handler;', ctx);

const ev = (host, uri, querystring = {}) => ({ request: { uri, querystring, headers: { host: { value: host } } } });

const APEX = 'nosyneighborscoffeeco.com';
const WWW = 'www.nosyneighborscoffeeco.com';

const cases = [
  ['root',                 ev(APEX, '/'),                    r => r.uri === '/index.html'],
  ['trailing slash',       ev(APEX, '/menu/'),               r => r.uri === '/menu/index.html'],
  ['extensionless',        ev(APEX, '/menu'),                r => r.uri === '/menu/index.html'],
  ['nested extensionless', ev(APEX, '/a/b'),                 r => r.uri === '/a/b/index.html'],
  ['css untouched',        ev(APEX, '/styles.css'),          r => r.uri === '/styles.css'],
  ['nested asset',         ev(APEX, '/assets/logo.svg'),     r => r.uri === '/assets/logo.svg'],
  ['404 page',             ev(APEX, '/404.html'),            r => r.uri === '/404.html'],
  ['dot in dir name',      ev(APEX, '/v1.2/guide'),          r => r.uri === '/v1.2/guide/index.html'],

  ['www redirects',        ev(WWW, '/menu'),
    r => r.statusCode === 301 && r.headers.location.value === `https://${APEX}/menu`],
  ['www keeps query',      ev(WWW, '/menu', { utm_source: { value: 'ig' } }),
    r => r.headers.location.value === `https://${APEX}/menu?utm_source=ig`],
  ['www root',             ev(WWW, '/'),
    r => r.headers.location.value === `https://${APEX}/`],
  ['www multi-value qs',   ev(WWW, '/x', { t: { value: 'a', multiValue: [{ value: 'a' }, { value: 'b' }] } }),
    r => r.headers.location.value === `https://${APEX}/x?t=a&t=b`],
  ['www valueless qs',     ev(WWW, '/x', { debug: { value: '' } }),
    r => r.headers.location.value === `https://${APEX}/x?debug`],
  ['apex not redirected',  ev(APEX, '/menu'),                r => r.statusCode === undefined],
];

let failed = 0;
for (const [name, event, check] of cases) {
  let out, ok = false, detail = '';
  try { out = ctx.handler(event); ok = check(out); }
  catch (e) { detail = ' threw: ' + e.message; }
  if (!ok) { failed++; detail = detail || ' got: ' + JSON.stringify(out); }
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : detail}`);
}
console.log(`\n${cases.length - failed}/${cases.length} passed`);
process.exit(failed ? 1 : 0);
