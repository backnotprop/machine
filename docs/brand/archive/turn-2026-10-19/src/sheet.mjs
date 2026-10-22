// Writes docs/brand/final/index.html (the spec sheet) and screenshots it to sheet.png. Run after build.mjs.
import { writeFileSync, readFileSync } from 'fs';
import { chromium } from '/Users/ramos/oss/machine/node_modules/playwright/index.mjs';
import { hero, PAL } from './marks.mjs';
import { render, box } from './iso.mjs';
const OUT = '/Users/ramos/oss/machine/docs/brand/final';
const S = (inner, w, vb = '0 0 64 64') => `<svg width="${w}" height="${w}" viewBox="${vb}" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
const strip = f => readFileSync(`${OUT}/${f}`, 'utf8').replace(/<title>.*?<\/title>/, '').trim();
const cube = (x, y, s, hot) => box(x, y, 0, x + s, y + s, s, hot);
const r3 = render([cube(0, 0, 4), box(4, 1, 2.6, 7, 3, 4), cube(7, 0, 4, true), box(8, 4, 2.6, 10, 7, 4), cube(7, 7, 4)], { pal: PAL.hero, pad: 4, gap: 1.25, size: 64 }).svg;

const cands = [
  ['bridges', 'Bridges', true, 'Pitch 8.5 instead of 7, bridges 1.6 wide and level with the block tops: both transitions show, so it reads as a path.'],
  ['trace', 'Trace', false, 'No bridges, a thin graphite trace on the ground: from this angle the blocks hide most of it.'],
  ['close', 'Close', false, 'No bridges, a one-unit gap, the 16 px drawing at full size: true to the favicon, but it is the pile again.'],
];
const tabs = (light, src, scale = 1) => `<div class="tabs${light ? ' light' : ''}" style="zoom:${scale}"><div class="tab"><i></i><span>Pull requests</span></div><div class="tab on"><img src="${src}" width="16" height="16" alt=""><span>machine · Runs</span></div><div class="tab"><i class="sq"></i><span>Docs</span></div></div>`;
const tabs2 = light => `<div class="tabs x2${light ? ' light' : ''}"><div class="tab"><i></i><span>Pull requests</span></div><div class="tab on"><img src="favicon-32.png" width="32" height="32" alt=""><span>machine · Runs</span></div><div class="tab"><i class="sq"></i><span>Docs</span></div></div>`;
const lock = strip('lockup.svg').replace(/width="[\d.]+" height="32"/, 'height="44"');
const word = strip('wordmark.svg').replace(/width="[\d.]+" height="24"/, 'height="28"');

const css = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:#080808;color:#ededed;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif;-webkit-font-smoothing:antialiased}
main{width:1240px;margin:0 auto;padding:56px 0 88px;display:flex;flex-direction:column;gap:22px}
svg,img{display:block;flex:none}
code,figcaption,.k,.mono{font-family:ui-monospace,Menlo,monospace}
h1{font-size:22px;font-weight:600;letter-spacing:-.01em}
.lead{color:#a1a1a1;margin-top:4px}
section{background:#0e0e0e;border:1px solid #232323;border-radius:14px;overflow:hidden}
section>h2{font-size:13px;font-weight:600;padding:11px 18px;border-bottom:1px solid #1d1d1d;display:flex;gap:10px;align-items:baseline}
section>h2 span{font-weight:400;color:#6b6b6b;font-size:12px}
.pad{padding:20px 22px}
figure{display:flex;flex-direction:column;align-items:center;gap:8px}
figcaption{font-size:11px;color:#6b6b6b;white-space:nowrap}
.cands{display:grid;grid-template-columns:repeat(3,1fr) 200px;gap:14px;padding:20px 22px}
.cand{background:#0a0a0a;border:1px solid #1f1f1f;border-radius:10px;padding:16px;display:flex;flex-direction:column;align-items:center;gap:12px}
.cand.pick{border-color:#1d3a6e}
.cand h3{font-size:14px;font-weight:600;display:flex;gap:8px;align-items:center;align-self:flex-start}
.cand h3 b{font-size:11px;font-weight:500;color:#8dbbff;border:1px solid #1d3a6e;border-radius:999px;padding:0 8px}
.cand p{font-size:13px;color:#a1a1a1;align-self:flex-start}
.cand.ref{opacity:.7}
.why{padding:0 22px 20px;color:#c8c8c8;max-width:1040px}
.sizes{display:flex;align-items:flex-end;gap:40px;padding:24px 28px}
.px{position:relative;background:#35363a}
.px img{image-rendering:pixelated}
.px:after{content:"";position:absolute;inset:0;background-image:linear-gradient(to right,rgba(0,0,0,.18) 1px,transparent 1px),linear-gradient(to bottom,rgba(0,0,0,.18) 1px,transparent 1px);background-size:8px 8px}
.px.g4:after{background-size:4px 4px}
.chip{display:grid;place-items:center;border-radius:8px}
.row{display:flex;gap:28px;align-items:flex-end;flex-wrap:wrap}
.two{display:grid;grid-template-columns:1fr 1fr}
.two>div+div{border-left:1px solid #1d1d1d}
.tabs{display:flex;align-items:flex-end;gap:2px;height:38px;padding:4px 6px 0;background:#202124;border-radius:8px;width:max-content}
.tabs.light{background:#dee1e6}
.tab{display:flex;align-items:center;gap:8px;height:32px;padding:0 10px;width:150px;font-size:12px;color:#9aa0a6;border-radius:8px 8px 0 0;white-space:nowrap;overflow:hidden}
.tabs.light .tab{color:#5f6368}
.tab.on{background:#35363a;color:#e8eaed}.tabs.light .tab.on{background:#fff;color:#202124}
.tab i{width:16px;height:16px;border-radius:50%;background:#5f6368;flex:none}.tab i.sq{border-radius:3px}
.tabs.light .tab i{background:#9aa0a6}
.tabs.x2{height:76px;padding:8px 12px 0;gap:4px;border-radius:16px}
.tabs.x2 .tab{height:64px;width:300px;padding:0 20px;gap:16px;font-size:24px;border-radius:16px 16px 0 0}
.tabs.x2 .tab i{width:32px;height:32px}.tabs.x2 .tab i.sq{border-radius:6px}
.stack{display:flex;flex-direction:column;gap:10px}
.desk{background:linear-gradient(160deg,#2b3140,#1b1e26);border-radius:10px;padding:22px;display:flex;gap:28px;align-items:center}
.lk{display:flex;align-items:center;justify-content:center;height:150px}
.lk.dark{background:#0a0a0a;color:#ededed}.lk.white{background:#fff;color:#0a0a0a}
.lk .in{display:flex;flex-direction:column;align-items:center;gap:22px}
.rules{padding:16px 22px;display:grid;grid-template-columns:110px 1fr;gap:6px 16px;font-size:13.5px;color:#c8c8c8}
.rules dt{color:#6b6b6b;font-size:12px;padding-top:2px}
table{border-collapse:collapse;width:100%;font-size:13px}
td{padding:8px 22px;border-top:1px solid #1a1a1a;vertical-align:middle;color:#c8c8c8}
td:first-child{width:200px;color:#a1a1a1}
.sw{display:inline-flex;gap:6px;align-items:center;margin-right:16px}
.sw i{width:14px;height:14px;border-radius:3px;display:inline-block;border:1px solid rgba(255,255,255,.1)}
.files{padding:14px 22px;font-size:12px;color:#a1a1a1;columns:3;line-height:1.9}
.files code{color:#ededed}
`;
const sw = c => `<span class="sw"><i style="background:${c}"></i><code>${c}</code></span>`;
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>machine: Turn, final</title><link rel="icon" href="favicon.svg" type="image/svg+xml"><style>${css}</style></head><body><main>
<header><h1>machine · Turn, final</h1><p class="lead">Three states on a path that turns a corner. The corner state is the current one, lit in the UI blue. No outlines, three-face shading, graphite elsewhere.</p></header>

<section><h2>1 · Refinement at large size <span>three candidates at 160 px, round three on the right for reference</span></h2>
<div class="cands">${cands.map(([k, n, pick, note]) => `<div class="cand${pick ? ' pick' : ''}"><h3>${n}${pick ? '<b>chosen</b>' : ''}</h3>${S(hero({ cand: k }), 160)}<p>${note}</p></div>`).join('')}
<div class="cand ref"><h3>Round three</h3>${S(r3, 160)}<p>Pitch 7: the bridge into the front block hides behind it.</p></div></div>
<p class="why">Bridges is round three's drawing with its two faults fixed. The space between states is now wider than a block is deep, so the three blocks stop packing into one lump. Both bridges sit level with the block tops, where nothing in front can hide them. Trace loses its line behind the blocks, and Close is the pile again. The 32 px drawing keeps both bridges. The 16 px drawing drops them and keeps the three states.</p></section>

<section><h2>2 · Sizes <span>the 32 and 16 are separate pixel drawings, not the vector scaled down</span></h2>
<div class="sizes">
<figure>${strip('turn.svg').replace('width="64" height="64"', 'width="160" height="160"')}<figcaption>160 · turn.svg</figcaption></figure>
<figure>${strip('turn.svg')}<figcaption>64 · turn.svg</figcaption></figure>
<figure><img src="favicon-32.png" width="32" height="32" alt=""><figcaption>32 · turn-32</figcaption></figure>
<figure><img src="favicon-16.png" width="16" height="16" alt=""><figcaption>16 · turn-16</figcaption></figure>
<figure><div class="px"><img src="favicon-16.png" width="128" height="128" alt=""></div><figcaption>16 px file at 8x</figcaption></figure>
<figure><div class="px g4"><img src="favicon-32.png" width="128" height="128" alt=""></div><figcaption>32 px file at 4x</figcaption></figure>
<figure><span style="color:#ededed">${strip('turn-mono.svg')}</span><figcaption>turn-mono, light</figcaption></figure>
<figure><span style="color:#0a0a0a;background:#fff;display:block;padding:6px;border-radius:6px">${strip('turn-mono.svg')}</span><figcaption>turn-mono, dark</figcaption></figure>
</div></section>

<section><h2>3 · Browser tabs <span>favicon-16.png at 1x, favicon-32.png in a 2x tab (a retina tab strip drawn at double size)</span></h2>
<div class="pad stack"><div class="row" style="gap:16px">${tabs(false, 'favicon-16.png')}${tabs(true, 'favicon-16.png')}</div><figcaption style="align-self:flex-start">1x · 16 px file</figcaption>
<div style="height:8px"></div>${tabs2(false)}${tabs2(true)}<figcaption style="align-self:flex-start">2x · 32 px file</figcaption></div></section>

<section><h2>4 · App icon and product <span>icon-1024.png is the macOS squircle; touch and web icons are full-bleed tiles the OS rounds</span></h2>
<div class="pad row"><div class="desk"><figure><img src="icon-1024.png" width="200" height="200" alt=""><figcaption style="color:#9aa3b5">icon-1024 at 200</figcaption></figure><figure><img src="icon-1024.png" width="64" height="64" alt=""><figcaption style="color:#9aa3b5">64</figcaption></figure><figure><img src="icon-1024.png" width="32" height="32" alt=""><figcaption style="color:#9aa3b5">32</figcaption></figure></div>
<figure><img src="apple-touch-icon.png" width="120" height="120" style="border-radius:27px" alt=""><figcaption>apple-touch-icon, rounded by iOS</figcaption></figure>
<figure><img src="icon-192.png" width="96" height="96" style="border-radius:50%" alt=""><figcaption>icon-192, round mask</figcaption></figure></div></section>

<section><h2>5 · Wordmark and lockup <span>round two's letterforms; the dot on the i is the lit state</span></h2>
<div class="two"><div class="lk dark"><div class="in">${lock}${word}</div></div><div class="lk white"><div class="in">${lock}${word}</div></div></div></section>

<section><h2>6 · Social card and product <span>social.png, 1200 x 630 · in-app.png, the sidebar at 2x with Mark at 20 px</span></h2><div class="pad row" style="align-items:flex-start"><img src="social.png" width="600" height="315" alt="" style="border:1px solid #262626;border-radius:8px"><img src="in-app.png" width="560" alt="" style="border:1px solid #262626;border-radius:8px"></div></section>

<section><h2>7 · Rules and colour</h2>
<dl class="rules"><dt>Clear space</dt><dd>A quarter of the mark's width on every side; in the lockup the gap between the mark and the word is half the mark's height.</dd>
<dt>Minimum size</dt><dd>Vector mark 18 px and up (below 24 px use the ui palette, as the sidebar does); at 16 and 32 px always use turn-16 and turn-32.</dd></dl>
<table>
<tr><td>Lit state (the only blue)</td><td>${sw('#8dbbff')}${sw('#3b82f6')}${sw('#1f55c8')}<span class="mono" style="color:#6b6b6b">top · left · right, front face is the UI accent</span></td></tr>
<tr><td>Graphite, 64 px and up</td><td>${sw('#55555e')}${sw('#34343b')}${sw('#202026')}</td></tr>
<tr><td>Graphite, sidebar 18 to 24 px</td><td>${sw('#7c7c86')}${sw('#53535c')}${sw('#38383f')}</td></tr>
<tr><td>Graphite, 16 and 32 px</td><td>${sw('#a2a2ac')}${sw('#73737d')}${sw('#53535c')}${sw('#9cc6ff')}${sw('#2257cc')}<span class="mono" style="color:#6b6b6b">lighter so the dark face holds on a #35363a tab</span></td></tr>
<tr><td>Graphite, on the icon tile</td><td>${sw('#73737d')}${sw('#4b4b54')}${sw('#303037')}<span class="mono" style="color:#6b6b6b">tile #26262b to #151518</span></td></tr>
<tr><td>Ground and text</td><td>${sw('#0a0a0a')}${sw('#ededed')}${sw('#a1a1a1')}</td></tr>
</table></section>

<section><h2>8 · Files <span>docs/brand/final; favicons and app icons also in src/ui/public</span></h2>
<div class="files">${['turn.svg', 'turn-mono.svg', 'turn-16.svg', 'turn-32.svg', 'favicon.svg', 'favicon-16.png', 'favicon-32.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-1024.png', 'icon-1024.svg', 'wordmark.svg', 'lockup.svg', 'social.png', 'in-app.png', 'sheet.png', 'src/build.mjs', 'src/sheet.mjs'].map(f => `<div><code>${f}</code></div>`).join('')}</div></section>
</main></body></html>`;
writeFileSync(`${OUT}/index.html`, html);

const b = await chromium.launch({ channel: 'chrome', headless: true });
const p = await b.newPage({ viewport: { width: 1320, height: 900 }, deviceScaleFactor: 1 });
const ext = []; p.on('request', r => { if (!r.url().startsWith('file://') && !r.url().startsWith('data:')) ext.push(r.url()); });
const broken = []; p.on('requestfailed', r => broken.push(r.url()));
await p.goto(`file://${OUT}/index.html`); await p.waitForTimeout(300);
await p.screenshot({ path: `${OUT}/sheet.png`, fullPage: true });
const secs = await p.$$('section'); for (let i = 0; i < secs.length; i++) await secs[i].screenshot({ path: `/tmp/brand4/sec-${i + 1}.png` });
console.log('external', ext.length, 'failed', broken, 'height', await p.evaluate(() => document.body.scrollHeight));
await b.close();
