import { writeFileSync } from 'fs';
import { u, JIG, jig, LOOP, loop, VIA, via, CAR, car, CUBE, cube } from './geo.mjs';
import { WM } from './words.mjs';
const OUT = '/Users/ramos/oss/machine/docs/brand/round2';
const SHORT = (process.env.SHORT || 'jig,loop').split(',');

const S = (inner, w, h = w, vb = '0 0 64 64', cls = '') => `<svg${cls ? ` class="${cls}"` : ''} width="${w}" height="${h}" viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${inner}</svg>`;
const S128 = inner => S(inner, 128, 128, '0 0 128 128');
const wmSvg = (key, p, h) => { const { inner, vb } = WM[key](p); return S(inner, (h * vb[2] / vb[3]).toFixed(1), h, vb.join(' ')); };
const MONO = { fg: 'currentColor', acc: 'currentColor', f: 'currentColor', b: 'currentColor' };

const D = [
  {
    n: 1, key: 'jig', name: 'Jig',
    dark: { bg: '#060607', fg: '#f4f1eb', fg2: '#d8d2c6', acc: '#2f6bff', g1: '#34343a', g2: '#18181c', lit1: '#173cff', lit2: '#4f8bff', lit3: '#b9dcff', text: '#f2efe9' },
    light: { fg: '#0b0b0c', acc: '#2f6bff' },
    wmDark: { fg: '#f2efe9', acc: '#2f6bff' },
    hero: p => jig(JIG.round, 'hero', p),
    stmt: [
      'A solid block split by one channel that enters at the bottom, climbs, doubles back and leaves again; the two pieces interlock, and the outer one is an m.',
      'A jig is the plate a machinist clamps over a part so the cutter can only go where the slot allows, which is what a published definition does to an agent.',
      'Animated, a point of light enters the slot at the left, runs the whole channel once and leaves at the right, and the block stays still.',
    ],
    colour: 'Warm white m #f4f1eb, counter-piece in electric blue #2f6bff on near-black: sharper than the UI blue so the mark is never mistaken for a status dot. The app icon turns it round: a graphite block with the slot lit blue. On white: ink m, same blue.',
    chips: ['#060607', '#34343a', '#2f6bff', '#b9dcff', '#f2efe9'],
    wordNote: 'Rounded-square monoline, 9 units, corners on the same radius as the block; the middle leg of the m stops short of the baseline, like the hanging piece in the mark.',
    vars: [
      { id: '1a', name: 'Interlock', g: JIG.round, r: jig, note: '6-unit channel with round track corners between 8-unit walls; two-tone, the m in white and its counter in blue. Holds at 16 px: the slots stay open at 1.5 px.' },
      { id: '1b', name: 'Machined', g: JIG.chamfer, r: jig, note: 'Every corner cut at 45 degrees, block chamfered to match, shown lit: graphite block, blue light in the slot. Holds at 16 px, slightly crisper than 1a.' },
      { id: '1c', name: 'Puck', g: JIG.disc, r: jig, note: 'The same channel cut into a disc, scaled to 84 percent so the walls stay thick. At 16 px the slots close to about 1.2 px and start to fill in.' },
    ],
    icon: p => S(jig(JIG.icon, 'hero', p), 128),
    iconFlat: true,
  },
  {
    n: 2, key: 'loop', name: 'Loop',
    dark: { bg: '#0b0d08', fg: '#eef2e4', acc: '#c6f432', d1: '#3f6a06', d2: '#a8e021', d3: '#e2ff6a', text: '#eef2e4' },
    light: { fg: '#0b0d08', acc: '#0b0d08' },
    wmDark: { fg: '#eef2e4', acc: '#c6f432' },
    hero: p => loop(LOOP.base, 'hero', p),
    stmt: [
      'One line with one loop tied in it: the track may go round, but it crosses over itself and leaves in one direction only.',
      'Real processes loop (draft, review, revise, review again) and the tool still decides when the run may move on, so the mark is a loop that ends in a straight run, never a closed circle.',
      'Animated, a short bright segment travels the line, goes round the loop once, passes over its own track and runs out to the right.',
    ],
    colour: 'Acid lime #c6f432 on green-black #0b0d08: a signal colour no other dev tool owns and the only one that stays sharp at 16 px on dark. On white the line goes ink; lime is never set on white.',
    chips: ['#0b0d08', '#3f6a06', '#a8e021', '#c6f432', '#eef2e4'],
    wordNote: 'Round geometric monoline; the final e is drawn as a loop whose tail runs out along the baseline.',
    vars: [
      { id: '2a', name: 'Loop', g: LOOP.base, r: loop, note: '8-unit line, 4-unit gap where it passes over itself. Holds at 16 px: the gap closes to 1 px but the crossing still reads.' },
      { id: '2b', name: 'Heavy', g: LOOP.heavy, r: loop, note: '11-unit line, tighter loop, tails run to the edges. Strongest at 16 px; at 128 it starts to look like a pipe.' },
      { id: '2c', name: 'Tile', g: LOOP.tile, r: loop, note: 'The loop cut out of a lime tile, so it doubles as the app icon. Holds at 16 px as a tile with a hole in it; the crossing is lost.' },
    ],
    icon: p => S(loop(LOOP.tile, 'hero', p), 128),
  },
  {
    n: 3, key: 'via', name: 'Viaduct',
    dark: { bg: '#100e0b', fg: '#efe9dd', fg2: '#d9d0bf', acc: '#ff5a1f', acc2: '#ff7a3d', text: '#efe9dd' },
    light: { fg: '#15120f', acc: '#e8480c' },
    wmDark: { fg: '#efe9dd', acc: '#ff5a1f' },
    hero: p => via(VIA.base, 'hero', p),
    stmt: [
      'A lowercase m drawn low and wide as a bridge: two arches, three piers, and a rail carried across the top that runs past both ends.',
      'The arches are the structure a person draws; the rail is the line the agent rides, held up by that structure and never touching the ground.',
      'Animated, the rail slides in from the left and the piers rise to meet it, then a short orange pulse runs along the rail and off the edge.',
    ],
    colour: 'Warm white stone #efe9dd with a signal-orange rail #ff5a1f on warm black #100e0b: railway paint, warm where every other dev tool is cold. On white: ink m, orange rail.',
    chips: ['#100e0b', '#efe9dd', '#ff5a1f'],
    wordNote: 'Heavy letters with flat tops and arched counters; one orange rail runs over the whole word and the ascender of the h rises through it like a pylon.',
    vars: [
      { id: '3a', name: 'Two arches', g: VIA.base, r: via, note: 'Piers 10 units, arches 13.5 units, rail runs 4 units past each end. Holds at 16 px as a low m under a bar.' },
      { id: '3b', name: 'Three arches', g: VIA.three, r: via, note: 'Four piers and three arches: reads as a bridge first and a letter second. At 16 px the arches shrink to 3 px and the piers to 1.5.' },
      { id: '3c', name: 'Running rail', g: VIA.run, r: via, note: 'A narrower m and a rail that runs out past it to the right: the track continues. Holds at 16 px; asymmetry reads as motion.' },
    ],
    icon: p => S128(`<rect width="128" height="128" rx="29" fill="${p.bg}"/><rect x=".5" y=".5" width="127" height="127" rx="28.5" fill="none" stroke="rgba(255,255,255,.08)"/><svg x="26" y="24" width="76" height="76" viewBox="0 0 64 64">${via(VIA.base, 'hero', p)}</svg>`, 128),
  },
  {
    n: 4, key: 'car', name: 'Carriage',
    dark: { bg: '#0d0c12', fg: '#ecebf2', fg2: '#b9b7c6', acc: '#ff3d6e', accHi: '#ff7b9b', text: '#ecebf2' },
    light: { fg: '#0d0c12', acc: '#e8174e' },
    wmDark: { fg: '#ecebf2', acc: '#ff3d6e' },
    hero: p => car(CAR.dove, 'hero', p),
    stmt: [
      'The end view of a linear guide: a carriage whose dovetail slot wraps the head of a rail, so it can slide the length of the rail and cannot lift off it.',
      'This is how a machine tool keeps a cutting head on its line, and it is the product\'s promise drawn as two parts: the agent is the carriage, the definition is the rail.',
      'Animated, the view swings round to three-quarters and the carriage slides along the rail, stops at each state, and moves on.',
    ],
    colour: 'A hot red-pink #ff3d6e carriage on a cool steel rail #ecebf2, on violet-black #0d0c12: the moving part is the loud one. On white: ink rail, red carriage.',
    chips: ['#0d0c12', '#ecebf2', '#ff3d6e', '#ff7b9b'],
    wordNote: 'Round geometric monoline; the dot of the i is a small red carriage with a slot cut under it, sitting over the stem.',
    vars: [
      { id: '4a', name: 'Dovetail', g: CAR.dove, r: car, note: 'Dovetail slot, 2.5-unit clearance round the rail head. Holds at 16 px as a block on a stand; the dovetail itself is lost below 32.' },
      { id: '4b', name: 'T-slot', g: CAR.tee, r: car, note: 'A T-shaped rail in a T-slot: squarer, more like a fixture. At 16 px the slot closes up and it reads as a stamp.' },
      { id: '4c', name: 'Round rail', g: CAR.round, r: car, note: 'A round shaft in a bored carriage. The friendliest; at 16 px it is a block with a dot under it.' },
    ],
    icon: p => S128(`<rect width="128" height="128" rx="29" fill="${p.bg}"/><rect x=".5" y=".5" width="127" height="127" rx="28.5" fill="none" stroke="rgba(255,255,255,.1)"/><svg x="26" y="26" width="76" height="76" viewBox="0 0 64 64">${car(CAR.dove, 'hero', p)}</svg>`, 128),
  },
  {
    n: 5, key: 'pull', name: 'Pull',
    dark: { bg: '#0a0a0a', fg: '#ededed', acc: '#3b82f6', cold: ['#55555e', '#34343b', '#202026'], hot: ['#8dbbff', '#3b82f6', '#1f55c8'], text: '#ededed' },
    light: { fg: '#0a0a0a', acc: '#2563eb', cold: ['#e4e4e7', '#c4c4cc', '#a1a1aa'], hot: ['#93c5fd', '#3b82f6', '#1d4ed8'] },
    wmDark: { fg: '#ededed', acc: '#3b82f6' },
    hero: p => cube(CUBE.three, 'hero', p),
    stmt: [
      'A solid block cut into three slabs, with the middle one slid out along its own axis while the block above it stays where it was.',
      'The block is the definition, fixed and in order; the run is the one slab out of line, and it is the only thing lit, as the current state is the only blue thing in the UI.',
      'Animated, slabs slide out and back one after another, so a whole run plays as a short sequence of pulls on the same block.',
    ],
    colour: 'The product as it is: #0a0a0a, graphite slabs lit from the top left, and the UI accent #3b82f6 for the pulled slab, so the mark and the running dot are the same blue. On white: pale grey slabs, same blue.',
    chips: ['#0a0a0a', '#55555e', '#202026', '#3b82f6', '#8dbbff'],
    wordNote: 'Round geometric monoline; the stem of the i is the pulled slab, in blue and dropped 3 units out of line while its dot stays put.',
    vars: [
      { id: '5a', name: 'Three slabs', g: CUBE.three, r: cube, note: 'Three 11-unit slabs, the middle one out by 8. Holds at 16 px: a cube with a step in its right side.' },
      { id: '5b', name: 'Four slabs', g: CUBE.four, r: cube, note: 'Thinner slabs, the third pulled: more states, more like a run. At 16 px the gaps merge and the step carries it.' },
      { id: '5c', name: 'Pulled left', g: CUBE.left, r: cube, note: 'The slab slides out the left face instead, further. Reads more as motion; at 16 px the block looks lopsided.' },
    ],
    icon: p => S128(`<defs><linearGradient id="pi" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c1c20"/><stop offset="1" stop-color="#0b0b0c"/></linearGradient></defs><rect width="128" height="128" rx="29" fill="url(#pi)"/><rect x=".5" y=".5" width="127" height="127" rx="28.5" fill="none" stroke="rgba(255,255,255,.1)"/><svg x="24" y="24" width="80" height="80" viewBox="0 0 64 64">${cube(CUBE.three, 'hero', p)}</svg>`, 128),
  },
];

const tagline = 'Processes you draw. Agents follow them. A tool keeps them on the rails.';

function card(d, v) {
  const p = d.dark;
  return `<article class="card">
  <header><span class="id">${v.id}</span><h3>${v.name}</h3></header>
  <div class="stage" style="background:${p.bg}">
    <figure>${S(v.r(v.g, 'hero', p), 128)}<figcaption>128</figcaption></figure>
    <div class="smalls">
      <figure>${S(v.r(v.g, 'flat', p), 32)}<figcaption>32</figcaption></figure>
      <figure>${S(v.r(v.g, 'flat', p), 16)}<figcaption>16</figcaption></figure>
    </div>
  </div>
  <div class="monorow">
    <div class="m dk">${S(v.r(v.g, 'mono'), 48)}${S(v.r(v.g, 'mono'), 16)}</div>
    <div class="m lt">${S(v.r(v.g, 'mono'), 48)}${S(v.r(v.g, 'mono'), 16)}</div>
    <span class="lab">one colour</span>
  </div>
  <div class="lockw">${S(v.r(v.g, 'flat', { ...p, ...d.light }), 40)}${wmSvg(d.key, d.light, 30)}</div>
  <p class="note">${v.note}</p>
</article>`;
}

function tabs(d, light) {
  const p = light ? { ...d.dark, ...d.light } : d.dark;
  const v = d.vars[0];
  return `<div class="tabs${light ? ' light' : ''}">
    <div class="tab"><i class="o1"></i><span>Pull requests</span></div>
    <div class="tab on">${S(v.r(v.g, 'flat', p), 16)}<span>machine</span></div>
    <div class="tab"><i class="o2"></i><span>Docs</span></div>
  </div>`;
}

function situ(d) {
  const p = d.dark, v = d.vars[0];
  return `<div class="situ">
  <figure class="cell icon"><div class="desk">${d.icon(p)}</div><figcaption>App icon, 128</figcaption></figure>
  <figure class="cell"><div class="tabset">${tabs(d, false)}${tabs(d, true)}</div><figcaption>Tab favicon, 16 in a 32 px strip</figcaption></figure>
  <figure class="cell"><div class="side">
      <div class="brand">${S(v.r(v.g, 'flat', { ...p, bg: '#0a0a0a' }), 18)}${wmSvg(d.key, d.wmDark, 15)}</div>
      <div class="nav on"><span>Runs</span><b>1</b></div>
      <div class="nav"><span>Machines</span></div>
    </div><figcaption>Sidebar brand row, 220 px</figcaption></figure>
  <figure class="cell"><div class="social" style="background:${p.bg};color:${p.text}">
      <div class="sm">${S(d.hero(p), 104)}</div>
      <div class="st">${wmSvg(d.key, d.wmDark, 30)}<p>${tagline}</p></div>
    </div><figcaption>Social card, 1200 x 630 at 36%</figcaption></figure>
</div>`;
}

function hero(d) {
  const p = d.dark;
  return `<section class="dir" id="d${d.n}">
  <div class="hero" style="background:${p.bg};color:${p.text}">
    <div class="hm">${S(d.hero(p), 280)}</div>
    <div class="hc">
      <div class="hn"><span>0${d.n}</span><h2>${d.name}</h2></div>
      <div class="lock">${S(d.vars[0].r(d.vars[0].g, 'hero', p), 64)}${wmSvg(d.key, d.wmDark, 46)}</div>
      <p class="stmt">${d.stmt.join(' ')}</p>
      <div class="pal">${d.chips.map(c => `<i style="background:${c}"></i>`).join('')}<span>${d.colour}</span></div>
      <p class="wn">Wordmark: ${d.wordNote}</p>
    </div>
  </div>
  <div class="vars">${d.vars.map(v => card(d, v)).join('')}</div>
  ${situ(d)}
</section>`;
}

const shortText = {
  jig: { why: 'It is the only mark with a real second reading (a block, a slot, then an m), it explains the product without a literal picture of it, and it survives 16 px in one colour where Viaduct and Carriage turn into a bar and a stamp.', open: 'Some people will see only a letter in a box at first; the two-tone hero and the lit icon are two treatments and we have to pick one; the short middle leg in the wordmark needs a test at body sizes.' },
  loop: { why: 'It is the one people would put on a laptop: a single line with a single crossing, it moves while standing still, and it carries the idea (loops allowed, one way out) without leaning on the letter m the way Jig and Viaduct do.', open: 'At a glance it can read as a ribbon or a cursive l; lime next to a blue product is a bet nobody has tested in the UI; and the e that runs out in the wordmark still looks a little like a cursor.' },
  via: { why: '', open: '' }, car: { why: '', open: '' }, pull: { why: '', open: '' },
};
Object.assign(shortText, JSON.parse(process.env.SHORTTEXT || '{}'));

function shortlist() {
  return `<section class="short"><h2>Shortlist</h2><div class="picks">${SHORT.map(k => {
    const d = D.find(x => x.key === k), p = d.dark, v = d.vars[0], t = shortText[k];
    return `<article class="pick">
      <div class="pv" style="background:${p.bg}">${S(d.hero(p), 160)}</div>
      <div class="pt"><div class="hn"><span>0${d.n}</span><h3>${d.name}</h3></div>
      <p><b>Why it wins.</b> ${t.why}</p><p><b>Unresolved.</b> ${t.open}</p>
      <div class="pm"><span class="m dk">${S(v.r(v.g, 'mono'), 32)}${S(v.r(v.g, 'mono'), 16)}</span><span class="m lt">${S(v.r(v.g, 'mono'), 32)}${S(v.r(v.g, 'mono'), 16)}</span>
      <code>${k}.svg · ${k}-hero.svg · ${k}-wordmark.svg</code></div></div>
    </article>`;
  }).join('')}</div></section>`;
}

const css = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:#080808;color:#ededed;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif;-webkit-font-smoothing:antialiased}
main{width:1320px;margin:0 auto;padding:56px 0 96px}
svg{display:block;flex:none}
code,.id,figcaption,.hn span,.lab{font-family:ui-monospace,Menlo,monospace}
.top{display:flex;gap:24px;align-items:flex-end;padding-bottom:32px;border-bottom:1px solid #222}
.top h1{font-size:20px;font-weight:600;letter-spacing:-.01em}
.top p{color:#a1a1a1;max-width:820px;margin-top:6px}
.top .meta{margin-left:auto;font:12px ui-monospace,Menlo,monospace;color:#666}
.dir{margin-top:80px}
.hero{display:grid;grid-template-columns:560px 1fr;min-height:500px;border-radius:20px;overflow:hidden;border:1px solid rgba(255,255,255,.06)}
.hm{display:grid;place-items:center}
.hc{padding:52px 64px 52px 8px;display:flex;flex-direction:column;justify-content:center;gap:22px}
.hn{display:flex;align-items:baseline;gap:12px}
.hn span{font-size:12px;opacity:.55}
.hn h2{font-size:30px;font-weight:600;letter-spacing:-.02em}
.lock{display:flex;align-items:center;gap:22px}
.stmt{font-size:15px;line-height:1.65;max-width:600px;opacity:.86}
.pal{display:flex;align-items:center;gap:6px;font-size:12.5px;line-height:1.5;opacity:.9;max-width:640px}
.pal i{width:26px;height:26px;border-radius:6px;flex:none;box-shadow:inset 0 0 0 1px rgba(255,255,255,.16)}
.pal span{margin-left:10px;opacity:.8}
.wn{font-size:12.5px;opacity:.6;max-width:600px}
.vars{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:16px}
.card{background:#0e0e0e;border:1px solid #232323;border-radius:14px;overflow:hidden;display:flex;flex-direction:column}
.card header{display:flex;gap:10px;align-items:baseline;padding:12px 16px;border-bottom:1px solid #1d1d1d}
.card .id{font-size:12px;color:#666}.card h3{font-size:14px;font-weight:600}
.stage{display:flex;align-items:center;justify-content:center;gap:40px;padding:28px 16px}
.stage figure{display:flex;flex-direction:column;align-items:center;gap:8px}
.smalls{display:flex;align-items:flex-end;gap:22px}
figcaption{font-size:11px;color:#777}
.hero figcaption{color:inherit;opacity:.5}
.monorow{display:flex;align-items:center;gap:8px;padding:12px 16px;border-top:1px solid #1d1d1d}
.m{display:flex;align-items:center;gap:14px;padding:8px 12px;border-radius:8px}
.m.dk{background:#141414;color:#ededed}.m.lt{background:#f4f4f4;color:#0a0a0a}
.lab{font-size:11px;color:#666;margin-left:auto}
.lockw{display:flex;align-items:center;gap:14px;padding:18px 20px;background:#fff;color:#0a0a0a}
.note{padding:12px 16px 16px;color:#a1a1a1;font-size:13px;line-height:1.5}
.situ{display:grid;grid-template-columns:172px 372px 254px 1fr;gap:16px;margin-top:16px;align-items:stretch}
.cell{background:#0e0e0e;border:1px solid #232323;border-radius:14px;padding:16px;display:flex;flex-direction:column;justify-content:space-between;gap:12px}
.desk{display:grid;place-items:center;flex:1;background:radial-gradient(circle at 30% 20%,#2a2d36,#15161a);border-radius:10px;padding:14px}
.desk svg{filter:drop-shadow(0 6px 10px rgba(0,0,0,.45))}
.tabset{display:flex;flex-direction:column;gap:10px;justify-content:center;flex:1}
.tabs{display:flex;align-items:flex-end;gap:2px;height:40px;padding:4px 6px 0;background:#1b1b1b;border-radius:8px}
.tabs.light{background:#dedede}
.tab{display:flex;align-items:center;gap:8px;height:32px;padding:0 10px;width:118px;font-size:12px;color:#9a9a9a;border-radius:8px 8px 0 0;white-space:nowrap;overflow:hidden}
.tabs.light .tab{color:#555}
.tab.on{background:#2b2b2b;color:#ededed}.tabs.light .tab.on{background:#fff;color:#111}
.tab i{width:16px;height:16px;border-radius:50%;background:#555;flex:none}.tab i.o2{border-radius:4px;background:#4a4a4a}
.tabs.light .tab i{background:#9a9a9a}
.side{width:220px;background:#0a0a0a;border:1px solid #262626;border-radius:10px;padding:10px;flex:1}
.brand{display:flex;align-items:center;gap:9px;height:36px;padding:0 8px;margin-bottom:8px;color:#ededed}
.nav{display:flex;justify-content:space-between;align-items:center;height:32px;padding:0 10px;border-radius:6px;font-size:13px;color:#a1a1a1}
.nav.on{background:#161616;color:#ededed}.nav b{font-weight:500;font-size:11px;background:#262626;border-radius:999px;padding:0 7px}
.social{width:432px;height:227px;border-radius:10px;display:flex;align-items:center;gap:24px;padding:0 30px;border:1px solid rgba(255,255,255,.08)}
.st{display:flex;flex-direction:column;gap:14px}.st p{font-size:12.5px;line-height:1.45;opacity:.75;max-width:220px}
.short{margin-top:96px;padding-top:40px;border-top:1px solid #222}
.short>h2{font-size:22px;font-weight:600;margin-bottom:20px}
.picks{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.pick{display:grid;grid-template-columns:240px 1fr;background:#0e0e0e;border:1px solid #232323;border-radius:14px;overflow:hidden}
.pv{display:grid;place-items:center;min-height:260px}
.pt{padding:24px;display:flex;flex-direction:column;gap:12px;font-size:13.5px;color:#c8c8c8}
.pt h3{font-size:20px;font-weight:600;color:#ededed}
.pt b{color:#ededed;font-weight:600}
.pm{display:flex;align-items:center;gap:10px;margin-top:auto;flex-wrap:wrap}
.pm code{font-size:11px;color:#777}
`;

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>machine: identity, round two</title><style>${css}</style></head><body><main>
<div class="top"><div><h1>machine · identity, round two</h1><p>Five directions, each one idea. Round one's node-and-edge marks are retired. Every mark is drawn on a 64-unit grid and checked at 128, 32 and 16 px, in colour and in one colour. Wordmarks are drawn as paths, no fonts.</p></div><div class="meta">5 directions · 15 variations · 2026-10-19</div></div>
${D.map(hero).join('\n')}
${shortlist()}
</main></body></html>`;
writeFileSync(`${OUT}/index.html`, html);

// standalone files for the shortlist
for (const k of SHORT) {
  const d = D.find(x => x.key === k), v = d.vars[0];
  const file = (inner, vb = '0 0 64 64', w = 64, h = 64) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${vb}">${inner}</svg>\n`;
  writeFileSync(`${OUT}/${k}.svg`, file(`<title>machine</title>${v.r(v.g, 'mono')}`));
  writeFileSync(`${OUT}/${k}-hero.svg`, file(`<title>machine</title>${d.hero(d.dark)}`));
  const w = WM[k]({ fg: 'currentColor', acc: d.wmDark.acc });
  writeFileSync(`${OUT}/${k}-wordmark.svg`, file(`<title>machine</title>${w.inner}`, w.vb.join(' '), w.vb[2], w.vb[3]));
}
console.log('built', SHORT);
