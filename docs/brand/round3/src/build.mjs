import { writeFileSync } from 'fs';
import { chromium } from '/Users/ramos/oss/machine/node_modules/playwright/index.mjs';
import { render } from './iso.mjs';
import { MARKS, PAL } from './marks.mjs';
import { WM } from '/Users/ramos/oss/machine/docs/brand/round2/src/words.mjs';
import { TEXT, ORDER, TOP } from './text.mjs';
const OUT = '/Users/ramos/oss/machine/docs/brand/round3';
const S = (inner, w, vb = 64, extra = '') => `<svg width="${w}" height="${w}" viewBox="0 0 ${vb} ${vb}" xmlns="http://www.w3.org/2000/svg"${extra}>${inner}</svg>`;
const G16 = 0.5;
const hero = (k, pal = PAL.hero, pad = 4) => render(MARKS[k].hero(), { pal, pad, gap: 1.25 }).svg;
const s16 = k => MARKS[k].s16 ? render(MARKS[k].s16(), { pal: PAL.fav, size: 16, k: 2, gap: G16 }).svg : render(MARKS[k].hero(), { pal: PAL.fav, size: 16, pad: 1, gap: 1.25 }).svg;
const s32 = k => render(MARKS[k].hero(), { pal: PAL.fav, size: 32, pad: 1, gap: 0.75 }).svg;

// ---------- favicon PNGs ----------
const br = await chromium.launch({ channel: 'chrome', headless: true });
const pg = await br.newPage({ viewport: { width: 200, height: 200 }, deviceScaleFactor: 1 });
for (const k of ORDER) {
  for (const [n, svg] of [[16, S(s16(k), 16, 16)], [32, S(s32(k), 32, 32)]]) {
    await pg.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
    await (await pg.$('svg')).screenshot({ path: `${OUT}/fav/${k}-${n}.png`, omitBackground: true });
  }
}
await br.close();

// ---------- pieces ----------
const sq = (() => { const c = 64, a = 52, n = 5, p = []; for (let i = 0; i < 128; i++) { const t = i / 128 * Math.PI * 2, ct = Math.cos(t), st = Math.sin(t); p.push([c + a * Math.sign(ct) * Math.abs(ct) ** (2 / n), c + a * Math.sign(st) * Math.abs(st) ** (2 / n)]); } return 'M' + p.map(q => q.map(v => v.toFixed(2)).join(' ')).join('L') + 'Z'; })();
const icon = k => S(`<path d="${sq}" fill="#18181b"/><path d="${sq}" fill="none" stroke="rgba(255,255,255,.09)" stroke-width="1"/><svg x="27" y="27" width="74" height="74" viewBox="0 0 64 64">${hero(k, PAL.hero, 3)}</svg>`, 128, 128);
const wm = (() => { const { inner, vb } = WM.pull({ fg: '#ededed', acc: '#3b82f6' }); const h = 15; return `<svg width="${(h * vb[2] / vb[3]).toFixed(1)}" height="${h}" viewBox="${vb.join(' ')}" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`; })();
const tabs = (k, light) => `<div class="tabs${light ? ' light' : ''}"><div class="tab"><i class="o1"></i><span>Pull requests</span></div><div class="tab on"><img src="fav/${k}-16.png" width="16" height="16" alt=""><span>machine · Runs</span></div><div class="tab"><i class="o2"></i><span>Docs</span></div></div>`;
const side = k => `<div class="side"><div class="brand"><img src="fav/${k}-16.png" width="16" height="16" alt="">${wm}</div><div class="nav on"><span>Runs</span><b>1</b></div><div class="nav"><span>Machines</span></div></div>`;

function card(k, i) {
  const t = TEXT[k];
  return `<article class="card" id="${k}">
  <header><span class="num">${String(i + 1).padStart(2, '0')}</span><h3>${t.name}</h3><span class="badge${t.own ? ' own' : ''}">${t.own ? 'own 16 px drawing' : 'hero holds at 16 px'}</span></header>
  <div class="stage">
    <figure>${S(hero(k), 160)}<figcaption>160</figcaption></figure>
    <figure>${S(hero(k), 64)}<figcaption>64</figcaption></figure>
    <figure><div class="px"><img src="fav/${k}-16.png" width="128" height="128" alt=""></div><figcaption>16 px file at 8x</figcaption></figure>
    <figure><div class="desk">${icon(k)}</div><figcaption>macOS icon, 128</figcaption></figure>
  </div>
  <div class="row2">
    <figure class="tabset">${tabs(k, false)}${tabs(k, true)}<figcaption>16 px file in a tab, dark and light</figcaption></figure>
    <figure class="x32"><div class="pair"><span class="dk"><img src="fav/${k}-32.png" width="32" height="32" alt=""></span><span class="lt"><img src="fav/${k}-32.png" width="32" height="32" alt=""></span></div><figcaption>32 px file</figcaption></figure>
  </div>
  <div class="row3">
    <figure>${side(k)}<figcaption>Sidebar, 220 px</figcaption></figure>
    <dl><dt>Reads as</dt><dd>${t.read}</dd><dt>Weak spot</dt><dd>${t.weak}</dd><dt>16 px</dt><dd>${t.n16}</dd></dl>
  </div>
</article>`;
}

const verdict = `<section class="verdict"><h2>Verdict</h2>
<div class="tops">${TOP.map(([k, line], i) => `<article class="top3"><div class="tv">${S(hero(k), 112)}<div class="tf"><img src="fav/${k}-16.png" width="16" height="16" alt=""><img src="fav/${k}-16.png" width="64" height="64" class="pix" alt=""></div></div><div><div class="tn"><span>${i + 1}</span><h3>${TEXT[k].name}</h3></div><p>${line}</p><code>${k}.svg · ${k}-16.svg</code></div></article>`).join('')}</div>
<h3 class="sh">All marks at 16 px, the real files</h3>
<div class="strip">${['dk', 'lt'].map(c => `<div class="srow ${c}">${ORDER.map(k => `<figure><img src="fav/${k}-16.png" width="16" height="16" alt=""><figcaption>${TEXT[k].name}</figcaption></figure>`).join('')}</div>`).join('')}
<div class="srow big">${ORDER.map(k => `<figure><img src="fav/${k}-16.png" width="64" height="64" class="pix" alt=""><figcaption>${TEXT[k].name}</figcaption></figure>`).join('')}</div></div>
</section>`;

const css = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:#080808;color:#ededed;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif;-webkit-font-smoothing:antialiased}
main{width:1320px;margin:0 auto;padding:56px 0 96px}
svg,img{display:block;flex:none}
code,.num,figcaption,.badge,.tn span{font-family:ui-monospace,Menlo,monospace}
.top{padding-bottom:28px;border-bottom:1px solid #222}
.top h1{font-size:20px;font-weight:600;letter-spacing:-.01em}
.top p{color:#a1a1a1;max-width:900px;margin-top:6px}
.top p+p{color:#777;margin-top:2px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:32px}
.card{background:#0e0e0e;border:1px solid #232323;border-radius:14px;overflow:hidden}
.card header{display:flex;gap:10px;align-items:baseline;padding:12px 16px;border-bottom:1px solid #1d1d1d}
.num{font-size:12px;color:#666}.card h3{font-size:15px;font-weight:600}
.badge{margin-left:auto;font-size:11px;color:#a1a1a1;border:1px solid #333;border-radius:999px;padding:1px 9px}
.badge.own{color:#8dbbff;border-color:#1d3a6e}
figure{display:flex;flex-direction:column;align-items:center;gap:8px}
figcaption{font-size:11px;color:#6b6b6b;white-space:nowrap}
.stage{display:flex;align-items:flex-end;justify-content:space-between;padding:20px 22px 16px;background:#0a0a0a}
.px{width:128px;height:128px;background:#35363a;position:relative}
.px img,.pix{image-rendering:pixelated}
.px:after{content:"";position:absolute;inset:0;background-image:linear-gradient(to right,rgba(0,0,0,.16) 1px,transparent 1px),linear-gradient(to bottom,rgba(0,0,0,.16) 1px,transparent 1px);background-size:8px 8px}
.desk{width:128px;height:128px;background:#2a2c33;border-radius:8px}
.desk svg{filter:drop-shadow(0 3px 5px rgba(0,0,0,.45))}
.row2{display:flex;align-items:flex-end;gap:20px;padding:16px 22px;border-top:1px solid #1d1d1d}
.tabset{align-items:stretch;gap:6px}
.tabs{display:flex;align-items:flex-end;gap:2px;height:38px;padding:4px 6px 0;background:#202124;border-radius:8px}
.tabs.light{background:#dee1e6}
.tab{display:flex;align-items:center;gap:8px;height:32px;padding:0 10px;width:132px;font-size:12px;color:#9aa0a6;border-radius:8px 8px 0 0;white-space:nowrap;overflow:hidden}
.tabs.light .tab{color:#5f6368}
.tab.on{background:#35363a;color:#e8eaed}.tabs.light .tab.on{background:#fff;color:#202124}
.tab i{width:16px;height:16px;border-radius:50%;background:#5f6368;flex:none}.tab i.o2{border-radius:3px}
.tabs.light .tab i{background:#9aa0a6}
.x32 .pair{display:flex;gap:6px}.pair span{display:grid;place-items:center;width:52px;height:52px;border-radius:8px}
.pair .dk{background:#35363a}.pair .lt{background:#fff}
.row3{display:flex;gap:22px;padding:16px 22px 20px;border-top:1px solid #1d1d1d;align-items:flex-start}
.side{width:220px;background:#0a0a0a;border:1px solid #262626;border-radius:10px;padding:10px}
.brand{display:flex;align-items:center;gap:9px;height:36px;padding:0 8px;margin-bottom:6px}
.nav{display:flex;justify-content:space-between;align-items:center;height:32px;padding:0 10px;border-radius:6px;font-size:13px;color:#a1a1a1}
.nav.on{background:#161616;color:#ededed}.nav b{font-weight:500;font-size:11px;background:#262626;border-radius:999px;padding:0 7px}
dl{font-size:13px;line-height:1.5;color:#a1a1a1;display:grid;grid-template-columns:76px 1fr;gap:6px 12px}
dt{color:#6b6b6b;font-size:12px;padding-top:1px}dd{color:#c8c8c8}
.verdict{margin-top:72px;padding-top:36px;border-top:1px solid #222}
.verdict>h2{font-size:22px;font-weight:600;margin-bottom:18px}
.tops{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.top3{background:#0e0e0e;border:1px solid #232323;border-radius:14px;padding:18px;display:flex;flex-direction:column;gap:14px}
.tv{display:flex;align-items:center;justify-content:space-between;background:#0a0a0a;border-radius:10px;padding:10px 18px}
.tf{display:flex;align-items:center;gap:14px;background:#35363a;border-radius:8px;padding:10px}
.tn{display:flex;gap:10px;align-items:baseline;margin-bottom:6px}.tn span{font-size:12px;color:#666}.tn h3{font-size:17px;font-weight:600}
.top3 p{font-size:13.5px;color:#c8c8c8}.top3 code{display:block;margin-top:10px;font-size:11px;color:#6b6b6b}
.sh{font-size:14px;font-weight:600;margin:36px 0 12px}
.strip{display:flex;flex-direction:column;gap:8px}
.srow{display:flex;justify-content:space-between;padding:14px 28px;border-radius:10px}
.srow figure{width:96px}
.srow.dk{background:#35363a}.srow.dk figcaption{color:#9aa0a6}
.srow.lt{background:#fff}.srow.lt figcaption{color:#5f6368}
.srow.big{background:#0e0e0e;border:1px solid #232323}
`;

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>machine: identity, round three</title><style>${css}</style></head><body><main>
<div class="top"><h1>machine · identity, round three</h1>
<p>Round two's Pull, redrawn so the blocks read as a state machine: each block is a state, each bar between blocks is a transition, and the one blue block is the current state.</p>
<p>How to read a card: the mark at 160 and 64 px, the 16 px favicon file at 8x with no smoothing, the macOS icon, the real 16 and 32 px files in browser tabs, and the product sidebar.</p></div>
<div class="grid">${ORDER.map(card).join('\n')}</div>
${verdict}
</main></body></html>`;
writeFileSync(`${OUT}/index.html`, html);

for (const [k] of TOP) {
  writeFileSync(`${OUT}/${k}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><title>machine</title>${hero(k)}</svg>\n`);
  writeFileSync(`${OUT}/${k}-16.svg`, `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><title>machine</title>${s16(k)}</svg>\n`);
}
console.log('built', ORDER.length);
