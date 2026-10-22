import { chromium } from '/Users/ramos/oss/machine/node_modules/playwright/index.mjs';
import { render, box, prism } from './iso.mjs';
import { PAL } from './marks.mjs';
const cube = (x, y, z, s, hot) => box(x, y, z, x + s, y + s, z + s, hot);
const G = (it, g) => (it.grp = g, it);
const V = {
  pull_now: [box(0, 0, 0, 3, 3, 1), box(1, 0, 1.5, 4, 3, 2.5, true), box(0, 0, 3, 3, 3, 4)],
  pull_thick: [box(0, 0, 0, 3, 3, 1), box(1, 0, 1.5, 4, 3, 3, true), box(0, 0, 3.5, 3, 3, 4.5)],
  pull_far: [box(0, 0, 0, 3, 3, 1), box(1.5, 0, 1.5, 4.5, 3, 3, true), box(0, 0, 3.5, 3, 3, 4.5)],
  track_now: [G(box(0, 0, 0, 4, 1, 2.5), 'b'), G(box(0, 1, 0, 4, 3, 1.5), 'b'), G(box(0, 3, 0, 4, 4, 2.5), 'b'), box(1, 1, 1.5, 3, 3, 3.5, true)],
  track_low: [G(box(0, 0, 0, 5, 1, 2.5), 'b'), G(box(0, 1, 0, 5, 3, 1.5), 'b'), G(box(0, 3, 0, 5, 4, 2), 'b'), box(2, 1, 1.5, 4, 3, 3.5, true)],
  track_long: [G(box(0, 0, 0, 5, 1, 2), 'b'), G(box(0, 1, 0, 5, 3, 1), 'b'), G(box(0, 3, 0, 5, 4, 2), 'b'), box(2.5, 1, 1, 4.5, 3, 3, true)],
  turn_now: [cube(0, 0, 0, 2), box(2, 0.5, 1, 3, 1.5, 2), cube(3, 0, 0, 2, true), box(3.5, 2, 1, 4.5, 3, 2), cube(3, 3, 0, 2)],
  turn_nobar: [cube(0, 0, 0, 2), cube(3, 0, 0, 2, true), cube(3, 3, 0, 2)],
};
const b = await chromium.launch({ channel: 'chrome', headless: true }); const pg = await b.newPage();
let h = '';
for (const [k, sc] of Object.entries(V)) {
  const r = render(sc, { pal: PAL.fav, size: 16, k: 2, gap: 0.5 });
  await pg.setContent(`<body style="margin:0"><svg width="16" height="16" viewBox="0 0 16 16">${r.svg}</svg></body>`);
  const d = (await (await pg.$('svg')).screenshot({ omitBackground: true })).toString('base64');
  h += `<div style="display:flex;gap:6px;align-items:center;color:#aaa">${k}<img src="data:image/png;base64,${d}" style="width:128px;image-rendering:pixelated;background:#35363a"><img src="data:image/png;base64,${d}" style="width:128px;image-rendering:pixelated;background:#fff"><span style="background:#35363a;padding:4px"><img src="data:image/png;base64,${d}"></span><span style="background:#fff;padding:4px"><img src="data:image/png;base64,${d}"></span></div>`;
}
await pg.setContent(`<body style="background:#111;font:12px monospace;display:flex;flex-wrap:wrap;gap:12px;padding:10px;width:1300px">${h}</body>`);
await pg.screenshot({ path: '/tmp/brand3/try.png', fullPage: true }); await b.close();
