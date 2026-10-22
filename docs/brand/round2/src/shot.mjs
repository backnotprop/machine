import { chromium } from '/Users/ramos/oss/machine/node_modules/playwright/index.mjs';
const OUT = '/Users/ramos/oss/machine/docs/brand/round2';
const b = await chromium.launch({ channel: 'chrome', headless: true });
const p1 = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await p1.goto('file://' + OUT + '/index.html');
await p1.screenshot({ path: OUT + '/sheet.png', fullPage: true });
const p2 = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await p2.goto('file://' + OUT + '/index.html');
const heroes = await p2.$$('.hero');
for (let i = 0; i < heroes.length; i++) await heroes[i].screenshot({ path: `${OUT}/hero-${i + 1}.png` });
if (process.argv[2]) { // extra crops: selector
  const els = await p2.$$(process.argv[2]);
  for (let i = 0; i < els.length; i++) await els[i].screenshot({ path: `/tmp/brand2/crop-${i}.png` });
}
await b.close();
console.log('shots', heroes.length);
