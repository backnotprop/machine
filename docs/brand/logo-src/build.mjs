// Builds docs/brand/logos/*.svg and docs/brand/logo-competition.html.
// Run from the repo root: node docs/brand/logo-src/build.mjs
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { lower, upper, setWord } from './glyphs.mjs';
import { d, bbox, translate, skew, scale, mapPts, inset, rect, ngon, chamfer, r2, area } from './geom.mjs';
import { bevelled, linear, vgrad, GRADS, RAMPS, label, svgDoc, missingLabels } from './metal.mjs';

const ROOT = new URL('..', import.meta.url).pathname; // docs/brand/
const LOGOS = [];
const logo = (n, slug, name, line, bg, fn, type) => LOGOS.push({ n, slug, name, line, bg, fn, type });

import { LX, lowStyle, UX, upStyle } from './styles.mjs';
import { gtBadgeSVG } from './gt.mjs';

const ids = (n) => (s) => `l${n}-${s}`;

// ---------- 01 Extended Chrome ----------
logo('01', 'extended-chrome', 'Extended Chrome', 'Squared extended lower case, chamfered, in mirror chrome with a hard horizon.', 'dark', (n) => {
  const id = ids(n);
  const wd = setWord('machine', lower(LX), LX, lowStyle());
  const top = -LX.A, bot = LX.X;
  const defs = vgrad(id('face'), top + 4, bot - 4, GRADS.chrome);
  const body = bevelled(wd.contours, { bevel: 4.2, rim: 1.6, rimColor: '#050607', face: `url(#${id('face')})`, rampName: 'chrome' });
  const pad = 14;
  return svgDoc([-pad, top - pad, wd.width + pad * 2, bot - top + pad * 2], body, defs, 'machine');
}, 'Drawn');

// ---------- 02 Machined ----------
logo('02', 'machined', 'Machined', 'Extended capitals cut with a deep bevel; every facet shaded by its angle to one light.', 'dark', (n) => {
  const id = ids(n);
  const wd = setWord('MACHINE', upper(UX), UX, upStyle({ gap: 26 }));
  const defs = vgrad(id('face'), 0, UX.X, GRADS.satin);
  const body = bevelled(wd.contours, { bevel: 7, rim: 1.4, rimColor: '#050607', face: `url(#${id('face')})`, rampName: 'chrome' });
  const pad = 14;
  return svgDoc([-pad, -pad, wd.width + pad * 2, UX.X + pad * 2], body, defs, 'MACHINE');
}, 'Drawn');


// ---------- shared pieces ----------
const BLUE_RAMP = [[-1, '#0a2559'], [-0.4, '#1b4fb3'], [0.2, '#3b82f6'], [0.7, '#8fbcff'], [1, '#e2eeff']];
RAMPS.blue = BLUE_RAMP;
RAMPS.oxblood = [[-1, '#120302'], [-0.3, '#3a0b07'], [0.3, '#6e1a10'], [1, '#a8432c']];
RAMPS.enamel = [[-1, '#06112b'], [0, '#0f2a66'], [1, '#3a69c4']];
const GBLUE = [[0, '#b9d6ff'], [0.45, '#5b9bff'], [0.52, '#3b82f6'], [0.525, '#2a6ce0'], [1, '#3f86f7']];

function pathBBox(dd) {
  const n = dd.match(/-?\d+(\.\d+)?/g).map(Number); let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i + 1 < n.length; i += 2) { x0 = Math.min(x0, n[i]); x1 = Math.max(x1, n[i]); y0 = Math.min(y0, n[i + 1]); y1 = Math.max(y1, n[i + 1]); }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}
import { fontPaths } from './metal.mjs';
import { facets as facetsOf } from './geom.mjs';
import { facing } from './metal.mjs';
import { ramp } from './geom.mjs';

// Shaded side walls for a solid pushed back along (ex, ey).
function extrude(contours, ex, ey, rampName) {
  const back = [], front = [];
  for (const c of contours) for (let i = 0; i < c.length; i++) {
    const p = c[i], q = c[(i + 1) % c.length], dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1, out = [dy / l, -dx / l];
    const quad = [p, q, [q[0] + ex, q[1] + ey], [p[0] + ex, p[1] + ey]];
    const col = ramp(RAMPS[rampName], Math.round(facing(out) * 8) / 8);
    (out[0] * ex + out[1] * ey > 0 ? front : back).push(`<path d="${d([quad])}" fill="${col}" stroke="${col}" stroke-width="0.4"/>`);
  }
  return `<path d="${d(translate(contours, ex, ey))}" fill="${ramp(RAMPS[rampName], -0.6)}"/>` + back.join('') + front.join('');
}

// Bevel facets only (for holes and sockets), lit as if the surface slopes into the shape.
function holeBevel(contours, depth, rampName, fill) {
  let s = `<path d="${d(contours)}" fill="${fill}"/>`;
  const buckets = new Map();
  for (const c of contours) for (const f of facetsOf(c, -depth).facets) {
    const col = ramp(RAMPS[rampName], Math.round(facing([-f.out[0], -f.out[1]]) * 12) / 12);
    buckets.set(col, (buckets.get(col) ?? '') + d([f.pts]));
  }
  for (const [col, pd] of buckets) s += `<path d="${pd}" fill="${col}"/>`;
  return s;
}

const brushed = (id, w = 2.2, op = 0.05) => `<pattern id="${id}" patternUnits="userSpaceOnUse" width="400" height="${w}"><rect width="400" height="${w * 0.35}" fill="#fff" opacity="${op}"/><rect y="${w * 0.6}" width="400" height="${w * 0.2}" fill="#000" opacity="${op * 1.4}"/></pattern>`;

function screw(x, y, r, id, rot = 30) {
  const a = (rot * Math.PI) / 180, dx = Math.cos(a) * r * 0.62, dy = Math.sin(a) * r * 0.62;
  return `<circle cx="${r2(x)}" cy="${r2(y)}" r="${r2(r + 1)}" fill="#050607"/><circle cx="${r2(x)}" cy="${r2(y)}" r="${r2(r)}" fill="url(#${id})"/>` +
    `<path d="M${r2(x - dx)} ${r2(y - dy)}L${r2(x + dx)} ${r2(y + dy)}" stroke="#121417" stroke-width="${r2(r * 0.26)}" stroke-linecap="round"/>`;
}
const screwGrad = (id) => `<radialGradient id="${id}" cx="0.38" cy="0.32" r="0.75"><stop offset="0" stop-color="#f2f4f6"/><stop offset="0.45" stop-color="#9aa1a9"/><stop offset="1" stop-color="#3a3f46"/></radialGradient>`;

function chromeLower(id, o = {}) {
  const P = o.P ?? LX;
  const wd = setWord('machine', lower(P), P, lowStyle(o.style ?? {}));
  let cs = wd.contours;
  if (o.skew) cs = skew(cs, o.skew, P.X);
  if (o.at) cs = mapPts(cs, (x, y) => [o.at[0] + x * (o.scale ?? 1), o.at[1] + y * (o.scale ?? 1)]);
  const s = o.scale ?? 1, y0 = (o.at?.[1] ?? 0) - P.A * s, y1 = (o.at?.[1] ?? 0) + P.X * s;
  const defs = vgrad(id('wface'), y0 + 3 * s, y1 - 3 * s, o.grad ?? GRADS.chrome);
  const body = bevelled(cs, { bevel: (o.bevel ?? 4.2) * s, rim: (o.rim ?? 1.6) * s, rimColor: o.rimColor ?? '#050607', face: `url(#${id('wface')})`, rampName: o.ramp ?? 'chrome', base: o.base });
  return { body, defs, width: wd.width * s, contours: cs, top: y0, bot: y1 };
}

// ---------- 03 Inline ----------
logo('03', 'inline', 'Inline', 'Monoline extended letters with an engraved inline channel, leaning forward 10°.', 'dark', (n) => {
  const id = ids(n);
  const P = { ...LX, tv: 21, th: 21, dot: 21, w: { ...LX.w, i: 21 } };
  const wd = setWord('machine', lower(P), P, lowStyle({ gap: 20, sizes: { t: 0, d: 0, i: 4, o: 18, k: 0 } }));
  const cs = skew(wd.contours, 10, P.X);
  const defs = vgrad(id('face'), -P.A + 2, P.X - 2, GRADS.chrome) + vgrad(id('ch'), -P.A, P.X, [[0, '#15181d'], [1, '#07080a']]);
  let body = bevelled(cs, { bevel: 2.6, rim: 1.5, rimColor: '#050607', face: `url(#${id('face')})`, rampName: 'chrome' });
  // The channel: inset each stroke, then shade its walls like a groove.
  const chans = cs.filter((c) => Math.abs(area(c)) > 900).map((c) => inset(c, 7.6));
  body += holeBevel(chans, 1.6, 'hole', `url(#${id('ch')})`);
  const pad = 16, b = bbox(cs);
  return svgDoc([b.x0 - pad, b.y0 - pad, b.w + pad * 2, b.h + pad * 2], body, defs, 'machine');
}, 'Drawn');

// ---------- 04 GT Badge (the pick; the drawing lives in gt.mjs) ----------
logo('04', 'gt-badge', 'GT Badge', 'Number-plate chamfered enamel badge, chrome bezel, italic capitals and a red pinline.', 'dark', (n) => gtBadgeSVG('l04'), 'Drawn');

// ---------- 05 Livery ----------
logo('05', 'livery', 'Livery', 'Forward-leaning chrome capitals led in by three speed stripes, one of them machine blue.', 'dark', (n) => {
  const id = ids(n);
  const wd = setWord('MACHINE', upper(UX), UX, upStyle({ gap: 22 }));
  const lean = 15, th = UX.th;
  const bands = [[6, 18, 150, 'chrome'], [41, 59, 300, 'blue'], [82, 94, 220, 'chrome']];
  const stripes = bands.map(([y0, y1, L]) => [[-30 - L, y0], [-30, y0], [-30, y1], [-30 - L, y1]]);
  const all = skew([...stripes, ...wd.contours], lean, UX.X);
  const defs = vgrad(id('face'), 2, UX.X - 2, GRADS.chrome) + vgrad(id('blue'), 41, 41 + th, [[0, '#9cc4ff'], [0.5, '#3b82f6'], [1, '#1d5bd0']]);
  let body = '';
  bands.forEach(([, , , kind], i) => {
    body += kind === 'blue'
      ? bevelled([all[i]], { bevel: 3, rim: 1.6, rimColor: '#03060c', face: `url(#${id('blue')})`, rampName: 'blue', base: '#2a6ce0' })
      : bevelled([all[i]], { bevel: 3, rim: 1.6, rimColor: '#050607', face: `url(#${id('face')})`, rampName: 'chrome' });
  });
  body += bevelled(all.slice(3), { bevel: 4.6, rim: 1.6, rimColor: '#050607', face: `url(#${id('face')})`, rampName: 'chrome' });
  const b = bbox(all), pad = 14;
  return svgDoc([b.x0 - pad, b.y0 - pad, b.w + pad * 2, b.h + pad * 2], body, defs, 'MACHINE');
}, 'Drawn');

// ---------- 06 Competition Plate ----------
logo('06', 'competition-plate', 'Competition Plate', 'A chrome-rimmed white enamel plate with a blue start band, lettered in gloss black.', 'dark', (n) => {
  const id = ids(n);
  const band = 120, padL = 54, padR = 64, padY = 46, top = -LX.A - padY, bot = LX.X + padY;
  const w = chromeLower(id, { grad: GRADS.gun, ramp: 'dark', rim: 0, bevel: 3.4, at: [band + padL, 0] });
  const W = band + padL + w.width + padR, H = bot - top;
  const plate = [chamfer(rect(0, top, W, H, 'o'), () => 30)];
  const inner = inset(plate[0], 9);
  const defs = w.defs + vgrad(id('enamel'), top, bot, [[0, '#fbfbf8'], [0.55, '#ecebe6'], [1, '#d6d5cf']]) +
    vgrad(id('band'), top, bot, [[0, '#3f7fe8'], [0.5, '#1f58c4'], [1, '#143f96']]) + vgrad(id('blk'), 0, 40, GRADS.chrome) +
    `<clipPath id="${id('clip')}"><path d="${d([inner])}"/></clipPath>`;
  let body = bevelled(plate, { bevel: 9, rim: 2, rimColor: '#030405', face: `url(#${id('enamel')})`, rampName: 'chrome' });
  body += `<g clip-path="url(#${id('clip')})"><rect x="0" y="${top}" width="${band}" height="${H}" fill="url(#${id('band')})"/><path d="M${band} ${top}V${bot}" stroke="#0b2f7a" stroke-width="1.5"/></g>`;
  const cy = (top + bot) / 2, s = 40, blk = [chamfer(rect(band / 2 - s / 2 + 4, cy - s / 2, s, s, 'o'), () => 9)];
  body += bevelled(translate(blk, 0, 0), { bevel: 4, rim: 1.4, rimColor: '#0a1f52', face: '#f4f5f7', rampName: 'steel' });
  body += w.body;
  const pad = 10;
  return svgDoc([-pad, top - pad, W + pad * 2, H + pad * 2], body, defs, 'machine');
}, 'Drawn');

// ---------- 07 Cobra Script ----------
function scriptLayers(id, dd, tf, b, k) {
  // k: scale of the script relative to font units. Strokes are in font units (scaled by tf).
  return `<g transform="${tf}">` +
    `<path d="${dd}" fill="#050607" stroke="#050607" stroke-width="${44}" stroke-linejoin="round"/>` +
    `<path d="${dd}" fill="none" stroke="url(#${id('rim')})" stroke-width="${24}" stroke-linejoin="round"/>` +
    `<path d="${dd}" fill="url(#${id('sface')})"/>` +
    `</g>`;
}
const scriptDefs = (id, b) => linear(id('sface'), 0, b.y0, 0, b.y1, [[0, '#ffffff'], [0.25, '#e6eaee'], [0.5, '#a3abb4'], [0.56, '#6a727c'], [0.565, '#1d2128'], [0.66, '#3a4048'], [0.86, '#9aa1a9'], [1, '#e3e7eb']]) +
  linear(id('rim'), 0, b.y0, 0, b.y1, [[0, '#3c424a'], [0.45, '#8f969e'], [0.55, '#dfe3e7'], [1, '#ffffff']]);

logo('07', 'cobra-script', 'Cobra Script', 'Fender-script chrome in the AC Cobra manner, with a tapered speed line underneath.', 'dark', (n) => {
  const id = ids(n);
  const g = fontPaths.script; if (!g) return null;
  const b = pathBBox(g.d);
  // Speed line under the word, in the same chrome: tapered at both ends, leaning with the script.
  const y = b.y1 + 70, x0 = b.x0 + 180, x1 = b.x1 + 60;
  // Fat in the middle, needle-thin at both ends, rising slightly to the right.
  const swash = `M${x0} ${y + 6}C${x0 + 700} ${y - 30} ${x1 - 900} ${y - 64} ${x1} ${y - 120}C${x1 - 820} ${y - 20} ${x0 + 700} ${y + 30} ${x0} ${y + 6}Z`;
  const all = g.d + swash;
  const bb = { x0: b.x0, y0: b.y0, x1: x1, y1: y + 30 };
  const defs = scriptDefs(id, b);
  const body = scriptLayers(id, all, '', b);
  const pad = 40;
  return svgDoc([bb.x0 - pad, bb.y0 - pad, bb.x1 - bb.x0 + pad * 2, bb.y1 - bb.y0 + pad * 2], body, defs, 'machine');
}, 'SignPainter HouseScript Semibold (macOS system font), converted to outlines');

// ---------- 08 AC Roundel ----------
logo('08', 'ac-roundel', 'AC Roundel', 'A chrome-ringed, engine-turned blue enamel roundel crossed by the chrome script.', 'dark', (n) => {
  const id = ids(n);
  const g = fontPaths.script; if (!g) return null;
  const b = pathBBox(g.d);
  const R = 520, ring = 64, cx = (b.x0 + b.x1) / 2 + 30, cy = -250;
  const circ = (r) => `M${r2(cx - r)} ${r2(cy)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
  const defs = scriptDefs(id, b) +
    linear(id('ring'), 0, cy - R, 0, cy + R, [[0, '#ffffff'], [0.2, '#d9dee3'], [0.47, '#8a929b'], [0.5, '#2a2f36'], [0.56, '#3d434b'], [0.8, '#a2a9b1'], [1, '#eef1f3']]) +
    linear(id('ringIn'), 0, cy - R, 0, cy + R, [[0, '#2a2f36'], [0.5, '#8a929b'], [1, '#f4f6f8']]) +
    `<radialGradient id="${id('enamel')}" gradientUnits="userSpaceOnUse" cx="${cx - 60}" cy="${cy - 110}" r="${R * 1.2}"><stop offset="0" stop-color="#2d63c4"/><stop offset="0.6" stop-color="#143a8a"/><stop offset="1" stop-color="#091c4a"/></radialGradient>` +
    linear(id('gloss'), 0, cy - R, 0, cy, [[0, '#fff', 0.2], [1, '#fff', 0]]);
  let body = `<path d="${circ(R + 8)}" fill="#030405"/>` +
    `<path d="${circ(R)}${circ(R - ring)}" fill="url(#${id('ring')})" fill-rule="evenodd"/>` +
    `<path d="${circ(R - ring)}" fill="url(#${id('enamel')})"/>`;
  for (let r = 22; r < R - ring; r += 22) body += `<path d="${circ(r)}" fill="none" stroke="#ffffff" stroke-opacity="0.05" stroke-width="5"/>`;
  body += `<path d="${circ(R - ring - 5)}" fill="none" stroke="url(#${id('ringIn')})" stroke-width="10"/>`;
  body += `<path d="M${cx - R} ${cy - R}H${cx + R}V${cy - 60}C${cx + 220} ${cy - 160} ${cx - 220} ${cy - 160} ${cx - R} ${cy - 60}Z" fill="url(#${id('gloss')})" clip-path="url(#${id('cl')})"/>`;
  const defs2 = `<clipPath id="${id('cl')}"><path d="${circ(R - ring)}"/></clipPath>`;
  body += scriptLayers(id, g.d, '', b);
  const x0 = Math.min(b.x0, cx - R) - 40, x1 = Math.max(b.x1, cx + R) + 40;
  return svgDoc([x0, cy - R - 40, x1 - x0, 2 * R + 80], body, defs + defs2, 'machine');
}, 'SignPainter HouseScript Semibold (macOS system font), converted to outlines');

// ---------- 09 Rock Block ----------
logo('09', 'rock-block', 'Rock Block', 'Heavy condensed capitals with knife-cut corners, gold chrome on an oxblood extrusion.', 'dark', (n) => {
  const id = ids(n);
  const P = { X: 100, tv: 27, th: 22, td: 21, bar: 0.5, abar: 0.6, dm: 3, dn: 10, vy: 0.36, w: { M: 116, A: 84, C: 74, H: 84, I: 27, N: 88, E: 70 } };
  const st = upStyle({ gap: 9, A: 22, only: ['tl', 'br'], sizes: { o: 20, k: 12, b: 20, t: 0, i: 4 } }, P);
  const wd = setWord('MACHINE', upper(P), P, st);
  const cs = wd.contours;
  const defs = vgrad(id('face'), 3, P.X - 3, GRADS.gold);
  let body = `<path d="${d(translate(cs, 9, 11))}" fill="#000" stroke="#000" stroke-width="4" stroke-linejoin="miter"/>`;
  body += extrude(cs, 9, 11, 'oxblood');
  body += bevelled(cs, { bevel: 5, rim: 1.4, rimColor: '#120802', face: `url(#${id('face')})`, rampName: 'gold', base: '#a8741f' });
  const b = bbox(cs), pad = 16;
  return svgDoc([b.x0 - pad, b.y0 - pad, b.w + 9 + pad * 2, b.h + 11 + pad * 2], body, defs, 'MACHINE');
}, 'Drawn');

// ---------- 10 Trace ----------
logo('10', 'trace', 'Trace', 'Monoline letters with 45° bends like a circuit trace; the e runs out into the lit state node.', 'dark', (n) => {
  const id = ids(n);
  const T = 7, B = 93, c = 15, w = 62, G = 36, asc = 44, mid = 52;
  let x = 0; const segs = [];
  const P = (s) => segs.push(s);
  P(`M${x} ${B}V${T + c}L${x + c} ${T}H${x + 58 - c}L${x + 58} ${T + c}V${B}M${x + 58} ${T + c}L${x + 58 + c} ${T}H${x + 116 - c}L${x + 116} ${T + c}V${B}`); x += 116 + G;
  P(`M${x + 4} ${T}H${x + w - c}L${x + w} ${T + c}V${B}M${x + w} ${mid}H${x + c}L${x} ${mid + c}V${B - c}L${x + c} ${B}H${x + w}`); x += w + G;
  P(`M${x + w} ${T}H${x + c}L${x} ${T + c}V${B - c}L${x + c} ${B}H${x + w}`); x += w + G;
  P(`M${x} ${B}V${T - asc}M${x} ${T}H${x + w - c}L${x + w} ${T + c}V${B}`); x += w + G;
  const ix = x; P(`M${x} ${B}V${T}`); x += G;
  P(`M${x} ${B}V${T + c}L${x + c} ${T}H${x + w - c}L${x + w} ${T + c}V${B}`); x += w + G;
  const railEnd = x + w + 74;
  P(`M${x} ${mid}H${x + w}V${T + c}L${x + w - c} ${T}H${x + c}L${x} ${T + c}V${B - c}L${x + c} ${B}H${railEnd}`);
  const dd = segs.join('');
  const S = 15;
  const defs = vgrad(id('al'), T - asc - 8, B + 8, [[0, '#f6f8fa'], [0.3, '#d5dae0'], [0.56, '#9aa2ab'], [0.585, '#4b525b'], [0.75, '#7d858e'], [1, '#c9ced4']]) + vgrad(id('blue'), B - 22, B + 22, GBLUE);
  let body = `<g fill="none" stroke-linejoin="miter">` +
    `<path d="${dd}" stroke="#040506" stroke-width="${S + 3.6}" stroke-linecap="square"/>` +
    `<path d="${dd}" stroke="url(#${id('al')})" stroke-width="${S}" stroke-linecap="square"/>` +
    `<path d="${dd}" stroke="#ffffff" stroke-opacity="0.38" stroke-width="1.6" transform="translate(-2.2 -3)"/></g>`;
  body += bevelled([chamfer(rect(ix - S / 2 - 1, T - asc, S + 2, S + 2, 'o'), () => 3.5)], { bevel: 2.4, rim: 1.8, rimColor: '#040506', face: `url(#${id('al')})`, rampName: 'chrome' });
  const nd = 42; const node = [chamfer(rect(railEnd, B - nd / 2, nd, nd, 'o'), () => 9)];
  body += bevelled(node, { bevel: 4.4, rim: 1.8, rimColor: '#03060c', face: `url(#${id('blue')})`, rampName: 'blue', base: '#2a6ce0' });
  const pad = 18;
  return svgDoc([-S / 2 - pad, T - asc - pad, railEnd + nd + S / 2 + pad * 2, B + nd / 2 - (T - asc) + pad * 2], body, defs, 'machine');
}, 'Drawn');

// ---------- 11 Instrument Panel ----------
logo('11', 'instrument-panel', 'Instrument Panel', 'Black anodised faceplate, engraved letters, four status lamps with RUN lit.', 'dark', (n) => {
  const id = ids(n);
  const wd = setWord('machine', lower(LX), LX, lowStyle({ gap: 20 }));
  const px0 = -84, py0 = -LX.A - 76, px1 = wd.width + 84, py1 = 268;
  const panel = [chamfer(rect(px0, py0, px1 - px0, py1 - py0, 'o'), () => 22)];
  const defs = vgrad(id('ano'), py0, py1, [[0, '#24272c'], [0.5, '#16181b'], [1, '#0d0e10']]) + brushed(id('br'), 2.4, 0.035) +
    vgrad(id('paint'), -LX.A, LX.X, [[0, '#f4f6f8'], [1, '#c5cad0']]) + screwGrad(id('scr')) + vgrad(id('blue'), 0, 30, GBLUE) +
    `<radialGradient id="${id('halo')}"><stop offset="0" stop-color="#3b82f6" stop-opacity="0.45"/><stop offset="1" stop-color="#3b82f6" stop-opacity="0"/></radialGradient>` +
    vgrad(id('off'), 0, 30, [[0, '#30343a'], [1, '#1c1e22']]);
  let body = bevelled(panel, { bevel: 8, rim: 1.6, rimColor: '#000', face: `url(#${id('ano')})`, rampName: 'dark' });
  body += `<path d="${d([inset(panel[0], 8)])}" fill="url(#${id('br')})"/>`;
  // Engraved, paint-filled letters: the top wall of the cut sits in shadow.
  body += `<path d="${d(translate(wd.contours, 0, -1.8))}" fill="#000"/><path d="${d(wd.contours)}" fill="url(#${id('paint')})"/>`;
  // Hairline, then four lamps.
  const ly = 178, names = ['IDLE', 'RUN', 'BLOCKED', 'DONE'], step = wd.width / 4;
  body += `<path d="M0 ${ly - 34}H${wd.width}" stroke="#ffffff" stroke-opacity="0.12" stroke-width="1.5"/>`;
  names.forEach((nm, i) => {
    const x = i * step, on = nm === 'RUN', s = 26;
    const lamp = [chamfer(rect(x, ly, s, s, 'o'), () => 5)];
    if (on) body += `<circle cx="${x + s / 2}" cy="${ly + s / 2}" r="${s * 1.6}" fill="url(#${id('halo')})"/>`;
    body += bevelled(translate(lamp, 0, 0), { bevel: 3, rim: 1.4, rimColor: '#000', face: on ? `url(#${id('blue')})` : `url(#${id('off')})`, rampName: on ? 'blue' : 'dark', base: on ? '#2a6ce0' : '#26292e' });
    body += label(`mono500|80|${nm}`, x + s + 16, ly + s / 2 + 6.5, 19, { fill: on ? '#d9dce1' : '#7d828b' }).svg;
  });
  for (const [x, y] of [[px0 + 32, py0 + 32], [px1 - 32, py0 + 32], [px0 + 32, py1 - 32], [px1 - 32, py1 - 32]]) body += screw(x, y, 10, id('scr'), 35);
  const pad = 8;
  return svgDoc([px0 - pad, py0 - pad, px1 - px0 + pad * 2, py1 - py0 + pad * 2], body, defs, 'machine');
}, 'Drawn; lamp labels in Geist Mono 500 (OFL, from node_modules), converted to outlines');

// ---------- 12 Stencil Plate ----------
logo('12', 'stencil-plate', 'Stencil Plate', 'Die-cut capitals through a brushed steel plate, with stencil bridges and rivets.', 'dark', (n) => {
  const id = ids(n);
  const wd = setWord('MACHINE', upper(UX), UX, upStyle({ gap: 30 }));
  const padX = 76, padY = 56, x0 = -padX, y0 = -padY, W = wd.width + padX * 2, H = UX.X + padY * 2;
  const plate = [chamfer(rect(x0, y0, W, H, 'o'), () => 26)];
  const g = 8, bands = [];
  for (const L of wd.letters) {
    const { x, w, ch } = L, tv = UX.tv;
    if ('CEHMN'.includes(ch)) bands.push(x + tv + 0.5);
    if ('HMN'.includes(ch)) bands.push(x + w - tv - g - 0.5);
    if (ch === 'A') bands.push(x + w / 2 - g / 2);
  }
  bands.sort((a, b) => a - b);
  let clip = '', cur = x0;
  for (const b of bands) { clip += `<rect x="${r2(cur)}" y="${y0}" width="${r2(b - cur)}" height="${H}"/>`; cur = b + g; }
  clip += `<rect x="${r2(cur)}" y="${y0}" width="${r2(x0 + W - cur)}" height="${H}"/>`;
  const defs = vgrad(id('steel'), y0, y0 + H, [[0, '#d9dde1'], [0.48, '#a2a9b0'], [0.5, '#8a9199'], [1, '#b4bac0']]) + brushed(id('br'), 2.2, 0.06) +
    vgrad(id('void'), 0, UX.X, [[0, '#020203'], [1, '#0d0e11']]) + screwGrad(id('scr')) + `<clipPath id="${id('br2')}">${clip}</clipPath>`;
  let body = bevelled(plate, { bevel: 7, rim: 1.6, rimColor: '#030405', face: `url(#${id('steel')})`, rampName: 'steel' });
  body += `<path d="${d([inset(plate[0], 7)])}" fill="url(#${id('br')})"/>`;
  body += `<g clip-path="url(#${id('br2')})">${holeBevel(wd.contours, 4, 'hole', `url(#${id('void')})`)}</g>`;
  for (const [x, y] of [[x0 + 30, y0 + 30], [x0 + W - 30, y0 + 30], [x0 + 30, y0 + H - 30], [x0 + W - 30, y0 + H - 30]]) body += `<circle cx="${x}" cy="${y}" r="11" fill="#2a2e33"/><circle cx="${x}" cy="${y - 0.6}" r="9" fill="url(#${id('scr')})"/>`;
  const pad = 8;
  return svgDoc([x0 - pad, y0 - pad, W + pad * 2, H + pad * 2], body, defs, 'MACHINE');
}, 'Drawn');

// ---------- 13 Drawing Sheet (light) ----------
logo('13', 'drawing-sheet', 'Drawing Sheet', 'The wordmark as a dimensioned engineering drawing: gunmetal letters on a gridded sheet.', 'light', (n) => {
  const id = ids(n);
  const w = chromeLower(id, { grad: GRADS.gun, ramp: 'dark', rimColor: '#14161a', rim: 1.4, bevel: 3.8 });
  const W = w.width, X0 = -190, Y0 = -170, X1 = W + 120, Y1 = 270, ink = '#2b3a52';
  let grid = '';
  for (let x = Math.ceil(X0 / 10) * 10; x <= X1; x += 10) grid += `M${x} ${Y0}V${Y1}`;
  for (let y = Math.ceil(Y0 / 10) * 10; y <= Y1; y += 10) grid += `M${X0} ${y}H${X1}`;
  let major = '';
  for (let x = Math.ceil(X0 / 50) * 50; x <= X1; x += 50) major += `M${x} ${Y0}V${Y1}`;
  for (let y = Math.ceil(Y0 / 50) * 50; y <= Y1; y += 50) major += `M${X0} ${y}H${X1}`;
  const arrow = (x, y, dir) => { const a = 9, b = 3.2; const [dx, dy] = { l: [-1, 0], r: [1, 0], u: [0, -1], d: [0, 1] }[dir]; return `<path d="M${x} ${y}L${x - dx * a - dy * b} ${y - dy * a - dx * b}L${x - dx * a + dy * b} ${y - dy * a + dx * b}Z" fill="${ink}"/>`; };
  const ln = (dd, sw = 1.1, extra = '') => `<path d="${dd}" fill="none" stroke="${ink}" stroke-width="${sw}"${extra}/>`;
  const T = (txt, x, y, sz = 15, anchor = 'start') => label(`mono500|40|${txt}`, x, y, sz, { anchor, fill: ink }).svg;
  let ann = '';
  // x-height and ascender on the left
  ann += ln(`M-12 0H-92M-12 ${LX.X}H-92M-12 ${-LX.A}H-92`, 0.8);
  ann += ln(`M-76 0V${LX.X}`) + arrow(-76, 0, 'u') + arrow(-76, LX.X, 'd') + T('100', -84, 56, 15, 'end');
  ann += ln(`M-76 ${-LX.A}V0`) + arrow(-76, -LX.A, 'u') + arrow(-76, 0, 'd') + T('40', -84, -14, 15, 'end');
  // stem width over the m
  ann += ln(`M0 -10V-66M${LX.tv} -10V-66`, 0.8) + ln(`M-30 -56H${LX.tv + 30}`) + arrow(0, -56, 'r') + arrow(LX.tv, -56, 'l') + T('22', LX.tv + 36, -51);
  // chamfer callout from the a's top right corner
  const ax = 196 + 18 + 122 - 6, ay = 6;
  ann += ln(`M${ax} ${ay}L${ax + 46} -78H${ax + 190}`) + `<circle cx="${ax}" cy="${ay}" r="2.6" fill="${ink}"/>` + T('C16 x 45°', ax + 52, -86);
  // overall length
  ann += ln(`M0 ${LX.X + 12}V${LX.X + 74}M${W} ${LX.X + 12}V${LX.X + 74}`, 0.8) + ln(`M0 ${LX.X + 60}H${W}`) + arrow(0, LX.X + 60, 'l') + arrow(W, LX.X + 60, 'r');
  ann += `<rect x="${W / 2 - 92}" y="${LX.X + 48}" width="184" height="24" fill="#efeee9"/>` + T('934 ±0.05', W / 2, LX.X + 66, 16, 'middle');
  // title block
  const tbx = W - 330, tby = Y1 - 78;
  ann += `<rect x="${tbx}" y="${tby}" width="430" height="62" fill="#efeee9" stroke="${ink}" stroke-width="1.2"/>` + ln(`M${tbx} ${tby + 31}H${tbx + 430}M${tbx + 250} ${tby + 31}V${tby + 62}`, 0.9);
  ann += T('MACHINE / WORDMARK', tbx + 14, tby + 22, 15) + T('DWG 001', tbx + 14, tby + 53, 13) + T('SCALE 1:1', tbx + 264, tby + 53, 13);
  const defs = w.defs;
  const body = `<rect x="${X0}" y="${Y0}" width="${X1 - X0}" height="${Y1 - Y0}" fill="#efeee9"/>` +
    `<path d="${grid}" stroke="#2b3a52" stroke-opacity="0.07" stroke-width="0.8"/><path d="${major}" stroke="#2b3a52" stroke-opacity="0.13" stroke-width="1"/>` +
    ann + w.body;
  return svgDoc([X0, Y0, X1 - X0, Y1 - Y0], body, defs, 'machine');
}, 'Drawn; dimensions in Geist Mono 500 (OFL), converted to outlines');

// ---------- 14 Hex Node ----------
function hexSymbol(id, cx, cy, R, o = {}) {
  const hex = chamfer(ngon(cx, cy, R, 6, 0).map((p) => [...p, 'o']), () => R * 0.1);
  const s = R * 0.62, sock = rect(cx - s / 2, cy - s / 2, s, s, 'o', true);
  const sockC = chamfer(sock, () => s * 0.16);
  const defs = vgrad(id('hface'), cy - R, cy + R, o.grad ?? GRADS.chrome) + vgrad(id('void'), cy - s / 2, cy + s / 2, [[0, '#010101'], [1, '#0c0d10']]) + vgrad(id('blue'), cy - s / 3, cy + s / 3, GBLUE);
  let body = bevelled([hex, sockC], { bevel: R * 0.15, rim: o.rim ?? 1.8, rimColor: '#040506', face: `url(#${id('hface')})`, rampName: o.ramp ?? 'chrome' });
  body += `<path d="${d([inset(sockC, R * 0.15)])}" fill="url(#${id('void')})"/>`;
  const b = s * 0.42, blk = [chamfer(rect(cx - b / 2, cy - b / 2, b, b, 'o'), () => b * 0.18)];
  body += bevelled(blk, { bevel: b * 0.12, rim: 1.2, rimColor: '#020611', face: `url(#${id('blue')})`, rampName: 'blue', base: '#2a6ce0' });
  return { defs, body };
}
logo('14', 'hex-node', 'Hex Node', 'A machined hex nut whose socket holds the lit state, beside the extended chrome wordmark.', 'dark', (n) => {
  const id = ids(n);
  const R = 82, cy = (-LX.A + LX.X) / 2, sym = hexSymbol(id, 0, cy, R);
  const w = chromeLower(id, { at: [R + 58, 0] });
  const pad = 14;
  return svgDoc([-R - pad, cy - R * 0.866 - pad, R + 58 + w.width + R + pad * 2, R * 1.732 + pad * 2], sym.body + w.body, sym.defs + w.defs, 'machine');
}, 'Drawn');

// ---------- 15 Flywheel (light) ----------
logo('15', 'flywheel', 'Flywheel', 'A toothed flywheel in dark steel around a lit hub, with the gunmetal wordmark, on a light ground.', 'light', (n) => {
  const id = ids(n);
  const R = 84, cy = (-LX.A + LX.X) / 2, cx = 0, teeth = 54;
  const pts = [];
  for (let k = 0; k < teeth; k++) {
    const a = (k / teeth) * Math.PI * 2, s = (Math.PI * 2) / teeth;
    for (const [f, r] of [[0.08, R - 5], [0.22, R], [0.58, R], [0.72, R - 5]]) pts.push([cx + r * Math.cos(a + f * s), cy + r * Math.sin(a + f * s)]);
  }
  const holes = [], spokes = 5, r1 = 27, r2 = 56, half = 6.5;
  for (let k = 0; k < spokes; k++) {
    const a0 = (k / spokes) * Math.PI * 2 - Math.PI / 2, a1 = a0 + (Math.PI * 2) / spokes, win = [];
    const o0 = a0 + Math.asin(half / r2), o1 = a1 - Math.asin(half / r2), i0 = a0 + Math.asin(half / r1), i1 = a1 - Math.asin(half / r1);
    for (let j = 0; j <= 14; j++) { const t = o0 + ((o1 - o0) * j) / 14; win.push([cx + r2 * Math.cos(t), cy + r2 * Math.sin(t)]); }
    for (let j = 0; j <= 6; j++) { const t = i1 + ((i0 - i1) * j) / 6; win.push([cx + r1 * Math.cos(t), cy + r1 * Math.sin(t)]); }
    holes.push(area(win) > 0 ? win.reverse() : win);
  }
  const hubS = 34, hub = chamfer(rect(cx - hubS / 2, cy - hubS / 2, hubS, hubS, 'o', true), () => 6);
  const ringIn = ngon(cx, cy, R - 16, 72, 0, true), ringIn2 = ngon(cx, cy, R - 22, 72, 0);
  const defs = vgrad(id('disc'), cy - R, cy + R, [[0, '#8d949c'], [0.3, '#5a6169'], [0.5, '#2f343b'], [0.505, '#1b1e23'], [0.75, '#3e444c'], [1, '#6f767e']]) +
    vgrad(id('rimg'), cy - R, cy + R, [[0, '#c9ced3'], [0.5, '#5d646c'], [0.505, '#2a2e34'], [1, '#8a9198']]) + vgrad(id('blue'), cy - 12, cy + 12, GBLUE) +
    vgrad(id('void'), cy - 20, cy + 20, [[0, '#0b0c0e'], [1, '#1d2025']]);
  // Toothed rim ring, then the inner web with lightening holes and the hub socket.
  let body = bevelled([pts, ringIn], { bevel: 3, rim: 1.4, rimColor: '#0e0f12', face: `url(#${id('rimg')})`, rampName: 'dark', base: '#3b4048' });
  body += bevelled([ringIn2, ...holes, hub], { bevel: 3.2, rim: 0, rimColor: '#0e0f12', face: `url(#${id('disc')})`, rampName: 'dark', base: '#3b4048' });
  body += `<path d="${d([inset(hub, 3.2)])}" fill="url(#${id('void')})"/>`;
  const b = 18, blk = [chamfer(rect(cx - b / 2, cy - b / 2, b, b, 'o'), () => 3.5)];
  body += bevelled(blk, { bevel: 2.4, rim: 1, rimColor: '#020611', face: `url(#${id('blue')})`, rampName: 'blue', base: '#2a6ce0' });
  const w = chromeLower(id, { at: [R + 56, 0], grad: GRADS.gun, ramp: 'dark', rimColor: '#14161a', rim: 1.4 });
  const pad = 14;
  return svgDoc([-R - pad, cy - R - pad, R + 56 + w.width + R + pad * 2, 2 * R + pad * 2], body + w.body, defs + w.defs, 'machine');
}, 'Drawn');

// ---------- 16 Node Tile ----------
logo('16', 'node-tile', 'Node Tile', 'An app-icon tile with a chrome state, a machined edge and the lit next state; tracked capitals.', 'dark', (n) => {
  const id = ids(n);
  const S = 150, x0 = 0, y0 = 0, r = 36;
  const defs = vgrad(id('tile'), 0, S, [[0, '#2b2e34'], [0.5, '#1a1c20'], [1, '#101114']]) + vgrad(id('blk'), 24, 76, GRADS.chrome) + vgrad(id('blue'), 76, 126, GBLUE) +
    vgrad(id('edge'), 40, 110, [[0, '#d9dde2'], [1, '#6f767e']]) + vgrad(id('wface'), 0, 100, GRADS.satin) + linear(id('rimhi'), 0, 0, 0, S, [[0, '#fff', 0.22], [0.3, '#fff', 0.04], [1, '#fff', 0]]);
  let body = `<rect x="${x0}" y="${y0}" width="${S}" height="${S}" rx="${r}" fill="url(#${id('tile')})"/><rect x="${x0 + 0.75}" y="${y0 + 0.75}" width="${S - 1.5}" height="${S - 1.5}" rx="${r - 0.75}" fill="none" stroke="url(#${id('rimhi')})" stroke-width="1.5"/>`;
  const a = [chamfer(rect(26, 26, 48, 48, 'o'), () => 10)], bq = [chamfer(rect(78, 78, 46, 46, 'o'), () => 10)];
  const e = `M50 74V92L59 101H78`;
  body += `<path d="${e}" fill="none" stroke="#050607" stroke-width="11"/><path d="${e}" fill="none" stroke="url(#${id('edge')})" stroke-width="7"/>`;
  body += bevelled(a, { bevel: 6, rim: 1.6, rimColor: '#050607', face: `url(#${id('blk')})`, rampName: 'chrome' });
  body += bevelled(bq, { bevel: 6, rim: 1.6, rimColor: '#020611', face: `url(#${id('blue')})`, rampName: 'blue', base: '#2a6ce0' });
  const k = 0.56, wd = setWord('MACHINE', upper(UX), UX, upStyle({ gap: 46 }));
  const cs = mapPts(wd.contours, (x, y) => [S + 64 + x * k, S / 2 - (UX.X * k) / 2 + y * k]);
  const defs2 = vgrad(id('wf'), S / 2 - (UX.X * k) / 2, S / 2 + (UX.X * k) / 2, GRADS.chrome);
  body += bevelled(cs, { bevel: 2.6, rim: 1.2, rimColor: '#050607', face: `url(#${id('wf')})`, rampName: 'chrome' });
  const pad = 8;
  return svgDoc([-pad, -pad, S + 64 + wd.width * k + pad * 2, S + pad * 2], body, defs + defs2, 'MACHINE');
}, 'Drawn');

// ---------- main ----------
const only = process.argv[2] ? process.argv[2].split(',') : null;
mkdirSync(ROOT + 'logos', { recursive: true });
const built = [];
for (const L of LOGOS) {
  if (only && !only.includes(L.n)) continue;
  const svg = L.fn(L.n);
  if (!svg) { console.log('skipped', L.n); continue; }
  const file = `logos/${L.n}-${L.slug}.svg`;
  writeFileSync(ROOT + file, svg);
  built.push({ ...L, file, svg });
}

// ---------- the competition page ----------
const GROUP = { '01': 'Angular metallic', '02': 'Angular metallic', '03': 'Angular metallic', '04': 'Race car', '05': 'Race car', '06': 'Race car',
  '07': 'Old-school AC', '08': 'Old-school AC', '09': 'AC rock lettering', '10': '70s technical', '11': '70s technical', '12': '70s technical', '13': '70s technical',
  '14': 'Symbol + wordmark', '15': 'Symbol + wordmark', '16': 'Symbol + wordmark' };
if (!only) {
  const font = (f) => readFileSync(new URL('../../../node_modules/@fontsource/' + f, import.meta.url)).toString('base64');
  const ff = (fam, w, f) => `@font-face{font-family:"${fam}";font-weight:${w};src:url(data:font/woff2;base64,${font(f)}) format("woff2")}`;
  const strip = (svg) => svg.replace(/^<svg /, '<svg class="mark" ').replace(/ width="\d+" height="\d+"/, '');
  const tiles = built.map((b) => `
  <article class="tile${b.bg === 'light' ? ' light' : ''}">
    <div class="stage">${strip(b.svg)}</div>
    <div class="cap"><span class="num">${b.n}</span><div><h2>${b.name}<span class="grp">${GROUP[b.n]}</span></h2><p>${b.line}</p></div></div>
  </article>`).join('');
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>machine: logo competition</title>
<style>
${ff('Geist', 400, 'geist-sans/files/geist-sans-latin-400-normal.woff2')}
${ff('Geist', 500, 'geist-sans/files/geist-sans-latin-500-normal.woff2')}
${ff('Geist Mono', 500, 'geist-mono/files/geist-mono-latin-500-normal.woff2')}
*{box-sizing:border-box;margin:0}
html{background:#08080a;color:#ededef;font:400 14.5px/1.45 Geist,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
body{max-width:1840px;margin:0 auto;padding:56px 40px 64px}
header{display:flex;align-items:baseline;justify-content:space-between;gap:24px;margin-bottom:36px}
h1{font-weight:500;font-size:30px;letter-spacing:-0.03em}
header p{color:#a3a3ad;font-size:14.5px}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:28px 24px}
.stage{height:250px;border-radius:22px;background:#0e0e11;display:flex;align-items:center;justify-content:center}
.light .stage{background:#ecebe6}
.mark{width:370px;height:auto;display:block}
.cap{display:flex;gap:14px;padding:14px 6px 0}
.num{font:500 12px/20px "Geist Mono",ui-monospace,monospace;color:#85858f;letter-spacing:.06em;padding-top:1px}
h2{font-weight:500;font-size:14.5px;display:flex;gap:10px;align-items:baseline}
.grp{font:500 11px "Geist Mono",ui-monospace,monospace;color:#85858f;letter-spacing:.06em;text-transform:uppercase}
.cap p{color:#a3a3ad;font-size:13px;margin-top:2px}
</style></head>
<body>
<header><h1>machine — logo competition</h1><p>${built.length} directions for a metallic, angular wordmark. Every mark is shown 370 px wide. Pick a number.</p></header>
<main class="grid">${tiles}
</main>
</body></html>
`;
  writeFileSync(ROOT + 'logo-competition.html', html);
  console.log('logo-competition.html');
}
if (missingLabels.size) console.log('MISSING LABELS:\n' + [...missingLabels].map((k) => JSON.stringify(k)).join(' '));
console.log(built.map((b) => b.file).join('\n'));
export { LOGOS, built };
