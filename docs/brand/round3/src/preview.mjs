import { chromium } from '/Users/ramos/oss/machine/node_modules/playwright/index.mjs';
import { render } from './iso.mjs';
import { MARKS, PAL } from './marks.mjs';
const keys = Object.keys(MARKS); const G16 = +(process.env.G16 || 0.75);
const S = (inner, w, vb = 64) => `<svg width="${w}" height="${w}" viewBox="0 0 ${vb} ${vb}" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
const b = await chromium.launch({ channel: 'chrome', headless: true });
const pg = await b.newPage({ deviceScaleFactor: 1 });
const png = async svg => { await pg.setContent(`<body style="margin:0">${svg}</body>`); return (await (await pg.$('svg')).screenshot({ omitBackground: true })).toString('base64'); };
const rows = [];
for (const k of keys) {
  const m = MARKS[k];
  const a = await png(S(render(m.hero(), { pal: PAL.fav, pad: 1, gap: 1.25 }).svg, 16));
  const r16 = m.s16 ? render(m.s16(), { pal: PAL.fav, size: 16, k: 2, gap: G16 }) : render(m.hero(), { pal: PAL.fav, size: 16, pad: 1, gap: 1.25 });
  const c = await png(S(r16.svg, 16, 16));
  const im = (d, bg) => `<img src="data:image/png;base64,${d}" style="width:128px;image-rendering:pixelated;background:${bg}">`;
  const nat = d => `<span style="background:#2b2b2b;padding:4px"><img src="data:image/png;base64,${d}"></span><span style="background:#fff;padding:4px"><img src="data:image/png;base64,${d}"></span>`;
  rows.push(`<div style="background:#111;padding:8px;width:440px"><div>${k} · 16 extent ${r16.extent.w}x${r16.extent.h} @${r16.extent.x},${r16.extent.y}</div><div style="display:flex;gap:8px;align-items:center">${S(render(m.hero(), { pal: PAL.hero, pad: 4 }).svg, 140)}<div>${nat(a)} scaled<br>${nat(c)} drawn</div></div><div style="display:flex;gap:8px">${im(a, '#2b2b2b')}${im(c, '#2b2b2b')}${im(c, '#fff')}</div></div>`);
}
const p2 = await b.newPage({ viewport: { width: 1400, height: 800 }, deviceScaleFactor: 1 });
await p2.setContent(`<body style="margin:0;background:#0a0a0a;color:#aaa;font:12px monospace;display:flex;flex-wrap:wrap;gap:10px;padding:10px">${rows.join('')}</body>`);
await p2.screenshot({ path: '/tmp/brand3/preview.png', fullPage: true });
await b.close();
