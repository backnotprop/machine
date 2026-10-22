// Custom wordmarks for "machine". Baseline y=36 (viaduct: 40), x-height top y=0.
import { mitre, u, lg } from './geo.mjs';
const WORD = 'machine';

function assemble(L, gaps, paint, extra) {
  let x = 0; const parts = [];
  for (let k = 0; k < WORD.length; k++) {
    const ch = WORD[k], l = L[ch];
    parts.push(`<g transform="translate(${x} 0)">${l.draw(paint)}</g>`);
    x += l.w + (k < WORD.length - 1 ? (gaps[ch + WORD[k + 1]] ?? 8) : 0);
  }
  return { x, parts: parts.join('') };
}

// ---- round geometric monoline (Loop, Pull) ----
const RR = 14.6, C50 = [18 + RR * Math.cos(50 * Math.PI / 180), RR * Math.sin(50 * Math.PI / 180)];
const cTop = `${C50[0].toFixed(2)} ${(18 - C50[1]).toFixed(2)}`, cBot = `${C50[0].toFixed(2)} ${(18 + C50[1]).toFixed(2)}`;
const st = (c, s = 8) => `fill="none" stroke="${c}" stroke-width="${s}" stroke-linecap="butt" stroke-linejoin="round"`;
const ROUND = (tail = 0) => ({
  m: { w: 56, draw: p => `<path d="M4 36V16A12 12 0 0 1 28 16V36M28 16A12 12 0 0 1 52 16V36" ${st(p.fg)}/>` },
  a: { w: 36, draw: p => `<circle cx="18" cy="18" r="${RR}" ${st(p.fg)}/><path d="M32 0V36" ${st(p.fg)}/>` },
  c: { w: 32, draw: p => `<path d="M${cTop}A${RR} ${RR} 0 1 0 ${cBot}" ${st(p.fg)}/>` },
  h: { w: 36, draw: p => `<path d="M4 -16V36M4 18A14 14 0 0 1 32 18V36" ${st(p.fg)}/>` },
  i: { w: 8, draw: p => `<path d="M4 0V36" ${st(p.fg)}/><circle cx="4" cy="-11" r="5" fill="${p.fg}"/>` },
  n: { w: 36, draw: p => `<path d="M4 36V18A14 14 0 0 1 32 18V36" ${st(p.fg)}/>` },
  e: tail
    ? { w: 36, draw: p => `<path d="M${18 - RR} 18H${18 + RR}A${RR} ${RR} 0 0 0 18 ${18 - RR}A${RR} ${RR} 0 0 0 ${18 - RR} 18A${RR} ${RR} 0 0 0 18 ${18 + RR}H${36 + tail}" ${st(p.acc)}/>` }
    : { w: 36, draw: p => `<path d="M${18 - RR} 18H${18 + RR}A${RR} ${RR} 0 1 0 ${cBot}" ${st(p.fg)}/>` },
});
const RGAP = { ma: 6, ac: 6, ch: 9, hi: 9, in: 9, ne: 7 };

// ---- rounded-square monoline (Jig): s=9, corner radius 10 on the centreline ----
const q9 = c => st(c, 9);
const SQR = {
  m: { w: 56, draw: p => `<path d="M4.5 36V14.5A10 10 0 0 1 14.5 4.5H41.5A10 10 0 0 1 51.5 14.5V36M28 6V27" ${q9(p.fg)}/>` },
  a: { w: 36, draw: p => `<rect x="4.5" y="4.5" width="27" height="27" rx="10" ${q9(p.fg)}/><path d="M31.5 4.5V36" ${q9(p.fg)}/>` },
  c: { w: 33, draw: p => `<path d="M32 4.5H14.5A10 10 0 0 0 4.5 14.5V21.5A10 10 0 0 0 14.5 31.5H32" ${q9(p.fg)}/>` },
  h: { w: 36, draw: p => `<path d="M4.5 -16V36M4.5 4.5H21.5A10 10 0 0 1 31.5 14.5V36" ${q9(p.fg)}/>` },
  i: { w: 9, draw: p => `<path d="M4.5 0V36" ${q9(p.fg)}/><rect x="0" y="-15" width="9" height="9" rx="2" fill="${p.fg}"/>` },
  n: { w: 36, draw: p => `<path d="M4.5 36V14.5A10 10 0 0 1 14.5 4.5H21.5A10 10 0 0 1 31.5 14.5V36" ${q9(p.fg)}/>` },
  e: { w: 36, draw: p => `<path d="M4.5 18H31.5V14.5A10 10 0 0 0 21.5 4.5H14.5A10 10 0 0 0 4.5 14.5V21.5A10 10 0 0 0 14.5 31.5H32" ${q9(p.fg)}/>` },
};
const QGAP = { ma: 7, ac: 7, ch: 9, hi: 9, in: 9, ne: 7 };

// ---- fold: square strips cut into mitred panels ----
function foldLetter(lines, p, dot) {
  const polys = lines.flatMap(pts => mitre(pts, 8));
  const col = q => q.vertical ? p.f : p.b;
  return polys.map(q => `<path d="${q.d}" fill="${col(q)}"/>`).join('') + (dot ? `<rect x="0" y="-16" width="8" height="8" fill="${p.f}"/>` : '');
}
const FOLDL = {
  m: { w: 56, draw: p => foldLetter([[[4, 36], [4, 4], [52, 4], [52, 36]], [[28, 8], [28, 36]]], p) },
  a: { w: 32, draw: p => foldLetter([[[28, 0], [28, 36]], [[24, 32], [4, 32], [4, 4], [24, 4]]], p) },
  c: { w: 30, draw: p => foldLetter([[[30, 4], [4, 4], [4, 32], [30, 32]]], p) },
  h: { w: 32, draw: p => foldLetter([[[4, -16], [4, 36]], [[8, 4], [28, 4], [28, 36]]], p) },
  i: { w: 8, draw: p => foldLetter([[[4, 0], [4, 36]]], p, true) },
  n: { w: 32, draw: p => foldLetter([[[4, 36], [4, 4], [28, 4], [28, 36]]], p) },
  e: { w: 32, draw: p => foldLetter([[[30, 32], [4, 32], [4, 4], [28, 4], [28, 18], [8, 18]]], p) },
};

// ---- viaduct: heavy, flat tops, arched counters, x-height 40 ----
const VIAL = {
  m: { w: 62, draw: p => `<path d="M0 0H62V40H52V18A8 8 0 0 0 36 18V40H26V18A8 8 0 0 0 10 18V40H0Z" fill="${p.fg}"/>` },
  a: { w: 40, draw: p => `<path fill-rule="evenodd" d="M20 0H40V40H20A20 20 0 0 1 20 0ZM20 10A10 10 0 1 0 20 30A10 10 0 1 0 20 10Z" fill="${p.fg}"/>` },
  c: { w: 37, draw: p => `<path d="M37 0H20A20 20 0 0 0 20 40H37V30H20A10 10 0 0 1 20 10H37Z" fill="${p.fg}"/>` },
  h: { w: 36, draw: p => `<path d="M0 -20H10V0H36V40H26V18A8 8 0 0 0 10 18V40H0Z" fill="${p.fg}"/>` },
  i: { w: 10, draw: p => `<path d="M0 0H10V40H0Z" fill="${p.fg}"/>` },
  n: { w: 36, draw: p => `<path d="M0 0H36V40H26V18A8 8 0 0 0 10 18V40H0Z" fill="${p.fg}"/>` },
  e: { w: 38, draw: p => `<path fill-rule="evenodd" d="M20 0H38V24H10.83A10 10 0 0 0 20 30H38V40H20A20 20 0 0 1 20 0ZM20 10H28V17H10.46A10 10 0 0 1 20 10Z" fill="${p.fg}"/>` },
};
const VGAP = { ma: 6, ac: 6, ch: 8, hi: 7, in: 7, ne: 6 };

// Returns { inner, vb:[x,y,w,h] }
export const WM = {
  jig(p) {
    const { x, parts } = assemble(SQR, QGAP, p);
    return { inner: parts, vb: [0, -16, x, 52] };
  },
  loop(p) {
    const tail = 12;
    const { x, parts } = assemble(ROUND(tail), RGAP, p);
    return { inner: parts, vb: [0, -16, x + tail, 52] };
  },
  via(p) {
    const { x, parts } = assemble(VIAL, VGAP, p);
    const rail = `<path d="M-6 -8H${x + 16}V-3H-6Z" fill="${p.acc}"/>`;
    return { inner: rail + parts, vb: [-6, -20, x + 22, 60] };
  },
  car(p) {
    const L = { ...ROUND(0), i: { w: 19, draw: q => `<path d="M9.5 0V36" ${st(q.fg)}/><path d="M1.5 -17H17.5V-3H13.5V-8H5.5V-3H1.5Z" fill="${q.acc}"/>` } };
    const { x, parts } = assemble(L, { ma: 6, ac: 6, ch: 9, hi: 4, in: 4, ne: 7 }, p);
    return { inner: parts, vb: [0, -17, x, 53] };
  },
  fold(p) {
    const q = { f: p.fg, b: p.acc };
    const { x, parts } = assemble(FOLDL, SGAP, q);
    return { inner: parts, vb: [0, -16, x, 52] };
  },
  pull(p) {
    const L = { ...ROUND(0), i: { w: 8, draw: q => `<path d="M0 3H8V39H0Z" fill="${q.acc}"/><circle cx="4" cy="-11" r="5" fill="${q.fg}"/>` } };
    const { x, parts } = assemble(L, RGAP, p);
    return { inner: parts, vb: [0, -16, x, 55] };
  },
};
