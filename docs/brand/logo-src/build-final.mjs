// Builds the final GT brand set into docs/brand/final/.
// Run from the repo root: node docs/brand/logo-src/build-final.mjs
import { writeFileSync, mkdirSync, existsSync, cpSync, mkdtempSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import { gtBadgeSVG, gtFlatSVG, gtMarkSVG, gtMark16SVG } from './gt.mjs';

const BRAND = new URL('..', import.meta.url).pathname;
const OUT = BRAND + 'final/';

// The previous final set ("Turn", 2026-10-19) shares file names with this one. Keep an intact copy first.
const ARCHIVE = BRAND + 'archive/turn-2026-10-19/';
if (existsSync(OUT + 'turn.svg') && !existsSync(ARCHIVE)) { mkdirSync(BRAND + 'archive', { recursive: true }); cpSync(OUT, ARCHIVE, { recursive: true }); console.log('archived previous final set to', ARCHIVE); }
mkdirSync(OUT, { recursive: true });

const files = {
  'gt-badge.svg': gtBadgeSVG('gt', 1180),
  'gt-badge-flat.svg': gtFlatSVG('#ededef'),
  'gt-badge-flat-light.svg': gtFlatSVG('#0a0a0c'),
  'gt-mark.svg': gtMarkSVG('gm'),
  'gt-mark-16.svg': gtMark16SVG('g16'),
  // 32 px drawing of the same mark: thicker bezel and pinline, larger M, no engine turning.
  'gt-mark-32.svg': gtMarkSVG('gs', { bezel: 15, pinInset: 24, pinW: 4.6, mHeight: 214, mBevel: 3, mRim: 2.6, rim: 3, finish: false, mDy: 5, width: 32 }),
};
for (const [f, svg] of Object.entries(files)) writeFileSync(OUT + f, svg);
console.log(Object.keys(files).join('\n'));

// ---- PNG exports: Playwright, one wrapper page per export, element screenshot at exact pixels.
const browser = await chromium.launch({ channel: 'chrome', args: ['--disable-gpu'] });
const errors = [];
async function shot(out, w, h, inner, bg = 'transparent') {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errors.push(`${out}: ${m.text()}`); });
  page.on('requestfailed', (r) => errors.push(`${out}: failed ${r.url()}`));
  const wrap = join(mkdtempSync(join(tmpdir(), 'gt-')), 'w.html');
  writeFileSync(wrap, `<!doctype html><html><body style="margin:0;background:transparent"><div id="f" style="position:relative;width:${w}px;height:${h}px;background:${bg};overflow:hidden">${inner}</div></body></html>`);
  await page.goto('file://' + wrap);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
  await (await page.$('#f')).screenshot({ path: OUT + out, omitBackground: bg === 'transparent' });
  await page.close();
  console.log(out, `${w}x${h}`);
}
const img = (f, x, y, w, h) => `<img src="file://${resolve(OUT + f)}" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px">`;

await shot('favicon-16.png', 16, 16, img('gt-mark-16.svg', 0, 0, 16, 16));
await shot('favicon-32.png', 32, 32, img('gt-mark-32.svg', 0, 0, 32, 32));
await shot('icon-192.png', 192, 192, img('gt-mark.svg', 0, 0, 192, 192));
await shot('icon-512.png', 512, 512, img('gt-mark.svg', 0, 0, 512, 512));
// iOS masks the touch icon with its own rounded square and fills transparency with black,
// so the plate sits inset on the product's bar colour.
await shot('apple-touch-icon.png', 180, 180, img('gt-mark.svg', 14, 14, 152, 152), '#0b0b0d');
const BH = Math.round((2360 * 220) / 1179.36);
await shot('gt-badge@2x.png', 2360, BH, img('gt-badge.svg', 0, 0, 2360, BH));
// The product top bar: 56 px high, #0b0b0d, badge 26 px high at the 44 px content inset (src/ui/styles.css .brand .badge).
const bw = Math.round((26 * 1179.36) / 220);
await shot('topbar.png', 240, 56, img('gt-badge.svg', 44, 15, bw, 26), '#0b0b0d');
await browser.close();
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
