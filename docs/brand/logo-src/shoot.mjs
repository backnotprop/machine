// Screenshot an HTML or SVG file with Playwright (channel "chrome").
// Usage (run from repo root): node docs/brand/logo-src/shoot.mjs <in> <out.png> [width] [height|full] [bg]
// Exits non-zero if the page logs a console error or a page error.
import { chromium } from 'playwright';
import { resolve, join } from 'node:path';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const [inp, out, w = '1920', h = 'full', bg = ''] = process.argv.slice(2);
const width = Number(w);
const browser = await chromium.launch({ channel: 'chrome', args: ['--disable-gpu'] });
const page = await browser.newPage({ viewport: { width, height: h === 'full' ? 1080 : Number(h) }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()}`));
const url = 'file://' + resolve(inp);
if (inp.endsWith('.svg')) {
  // Show the SVG at an exact width, like an <img> would.
  const bgc = bg || '#08080a';
  const wrap = join(mkdtempSync(join(tmpdir(), 'shoot-')), 'wrap.html');
  writeFileSync(wrap, `<!doctype html><html><body style="margin:0;background:${bgc}"><img id="i" src="${url}" style="display:block;width:${width}px;height:auto"></body></html>`);
  await page.goto('file://' + wrap);
  await page.waitForFunction(() => document.getElementById('i').complete);
  const ok = await page.evaluate(() => document.getElementById('i').naturalWidth > 0);
  if (!ok) errors.push('svg failed to decode');
  const el = await page.$('#i');
  await el.screenshot({ path: out });
} else {
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.screenshot({ path: out, fullPage: h === 'full' });
}
await browser.close();
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('ok', out);
