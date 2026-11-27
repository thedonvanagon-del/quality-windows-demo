const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
(async () => {
  const only = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
  const dir = path.resolve('svg');
  for (const f of fs.readdirSync(dir).sort()) {
    if (only.length && !only.includes(f.slice(0, 2))) continue;
    fs.writeFileSync('page.html', `<html><body style="margin:0;background:transparent">${fs.readFileSync(path.join(dir, f), 'utf8')}</body></html>`);
    await page.goto('file://' + path.resolve('page.html'));
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      for (const g of document.querySelectorAll('g[data-max]')) {
        const max = +g.dataset.max, x = +g.dataset.x, y = +g.dataset.y;
        const w = g.getBBox().width;
        if (w > max) { const k = max / w; g.setAttribute('transform', `translate(${x},${y}) scale(${k}) translate(${-x},${-y})`); }
      }
    });
    await page.screenshot({ path: 'art/' + f.replace('.svg', '.png'), omitBackground: true, clip: { x: 0, y: 0, width: 1200, height: 1000 } });
  }
  await browser.close();
  console.log('rendered');
})();
