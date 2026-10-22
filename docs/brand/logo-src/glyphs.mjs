// The drawn letterforms: one squared, chamfered construction for "machine" and "MACHINE".
// Every glyph is a set of orthogonal (plus diagonal for M, N) contours with tagged corners;
// a style decides which tags get a 45-degree chamfer and how big.
//
// Tags: o = outer corner of the letter's box, b = foot at the baseline, f = inner foot,
//       i = counter corner, t = terminal corner, s = always sharp, A = peak of A, a = counter under that peak,
//       x = the acute crotch where a diagonal meets a stem (M, N); a small flat there keeps the bevel mitre short.
import { chamfer, translate, area } from './geom.mjs';

function solve(f, lo, hi) { for (let k = 0; k < 80; k++) { const m = (lo + hi) / 2; (f(lo) - 0) * (f(m) - 0) <= 0 ? (hi = m) : (lo = m); } return (lo + hi) / 2; }

// p: { X: height, A: ascender above X (lower case), tv, th, td (diagonal), w: {letter: width}, bar: crossbar centre (0..1) }
export function lower(p) {
  const { X, A, tv, th } = p, W = p.w;
  const g = {};
  { const w = W.m, mx = w / 2;
    g.m = [[[0, X, 'b'], [0, 0, 'o'], [w, 0, 'o'], [w, X, 'b'], [w - tv, X, 'f'], [w - tv, th, 'i'], [mx + tv / 2, th, 'i'], [mx + tv / 2, X, 'f'], [mx - tv / 2, X, 'f'], [mx - tv / 2, th, 'i'], [tv, th, 'i'], [tv, X, 'f']]]; }
  { const w = W.n; g.n = [[[0, X, 'b'], [0, 0, 'o'], [w, 0, 'o'], [w, X, 'b'], [w - tv, X, 'f'], [w - tv, th, 'i'], [tv, th, 'i'], [tv, X, 'f']]]; }
  { const w = W.h; g.h = [[[0, X, 'b'], [0, -A, 'k'], [tv, -A, 't'], [tv, 0, 's'], [w, 0, 'o'], [w, X, 'b'], [w - tv, X, 'f'], [w - tv, th, 'i'], [tv, th, 'i'], [tv, X, 'f']]]; }
  { const dh = p.dot ?? tv; g.i = [[[0, X, 'b'], [0, 0, 'k'], [tv, 0, 'k'], [tv, X, 'b']], [[0, -A + dh, 'd'], [0, -A, 'd'], [tv, -A, 'd'], [tv, -A + dh, 'd']]]; }
  { const w = W.c; g.c = [[[0, X, 'o'], [0, 0, 'o'], [w, 0, 't'], [w, th, 's'], [tv, th, 'i'], [tv, X - th, 'i'], [w, X - th, 's'], [w, X, 't']]]; }
  { const w = W.e, y1 = X * (p.bar ?? 0.5) - th / 2;
    g.e = [[[0, X, 'o'], [0, 0, 'o'], [w, 0, 'o'], [w, y1 + th, 's'], [tv, y1 + th, 'i'], [tv, X - th, 'i'], [w, X - th, 's'], [w, X, 't']],
           [[tv, th, 'i'], [tv, y1, 'i'], [w - tv, y1, 'i'], [w - tv, th, 'i']]]; }
  { const w = W.a, bt = X * (p.bowl ?? 0.42);
    g.a = [[[0, 0, 't'], [w, 0, 'o'], [w, X, 'b'], [0, X, 'o'], [0, bt, 'o'], [w - tv, bt, 'i'], [w - tv, th, 'i'], [0, th, 't']],
           [[tv, bt + th, 'i'], [tv, X - th, 'i'], [w - tv, X - th, 'i'], [w - tv, bt + th, 'i']]]; }
  return g;
}

export function upper(p) {
  const { X: H, tv, th } = p, W = p.w, td = p.td ?? th * 1.1;
  const g = {};
  const ym = H * (p.bar ?? 0.5) - th / 2;
  { const w = W.C; g.C = [[[0, H, 'o'], [0, 0, 'o'], [w, 0, 't'], [w, th, 's'], [tv, th, 'i'], [tv, H - th, 'i'], [w, H - th, 's'], [w, H, 't']]]; }
  { const w = W.E, we = w * 0.9; g.E = [[[0, H, 'o'], [0, 0, 'o'], [w, 0, 't'], [w, th, 's'], [tv, th, 'i'], [tv, ym, 's'], [we, ym, 't'], [we, ym + th, 't'], [tv, ym + th, 's'], [tv, H - th, 'i'], [w, H - th, 's'], [w, H, 't']]]; }
  { const w = W.H; g.H = [[[0, H, 'b'], [0, 0, 'o'], [tv, 0, 't'], [tv, ym, 's'], [w - tv, ym, 's'], [w - tv, 0, 't'], [w, 0, 'o'], [w, H, 'b'], [w - tv, H, 't'], [w - tv, ym + th, 's'], [tv, ym + th, 's'], [tv, H, 't']]]; }
  { g.I = [[[0, H, 'b'], [0, 0, 'k'], [tv, 0, 'k'], [tv, H, 'b']]]; }
  { const w = W.A, yb = H * (p.abar ?? 0.56) - th / 2;
    g.A = [[[0, H, 'b'], [0, 0, 'A'], [w, 0, 'A'], [w, H, 'b'], [w - tv, H, 'f'], [w - tv, yb + th, 's'], [tv, yb + th, 's'], [tv, H, 'f']],
           [[tv, th, 'a'], [tv, yb, 's'], [w - tv, yb, 's'], [w - tv, th, 'a']]]; }
  { // N: left stem, diagonal from top left to bottom right, right stem. Solve the depth so the diagonal is td thick.
    const w = W.N, dn = p.dn ?? td * 0.55, run = w - 2 * tv - dn;
    const dist = (y) => (run * (H - y) + y * dn) / Math.hypot(run, y) - td;
    const yN = solve(dist, 1, H - 1);
    g.N = [[[0, H, 'b'], [0, 0, 'o'], [tv + dn, 0, 's'], [w - tv, yN, 'x'], [w - tv, 0, 't'], [w, 0, 'o'], [w, H, 'b'], [w - tv - dn, H, 's'], [tv, H - yN, 'x'], [tv, H, 't']]]; }
  { // M: two stems and a V that reaches vy deep.
    const w = W.M, dm = p.dm ?? td * 0.55, vy = H * (p.vy ?? 0.6), run = w / 2 - tv - dm, D = Math.hypot(run, vy);
    const k = (td * D - vy * dm) / run, yv = k + (vy * (w / 2 - tv)) / run;
    if (yv > H * 0.95 || k < 0) console.warn(`M: V too deep (yv ${yv.toFixed(1)}, k ${k.toFixed(1)})`);
    g.M = [[[0, H, 'b'], [0, 0, 'o'], [tv + dm, 0, 's'], [w / 2, vy, 's'], [w - tv - dm, 0, 's'], [w, 0, 'o'], [w, H, 'b'], [w - tv, H, 'f'], [w - tv, k, 'x'], [w / 2, yv, 's'], [tv, k, 'x'], [tv, H, 'f']]]; }
  return g;
}

// Lay out a word. style.size(tag, pos) -> chamfer; style.gap; style.kern {pair: dx}; style.side {letter: [left, right]}.
export function setWord(word, glyphs, p, style) {
  let x = 0; const out = []; let prev = null;
  for (const ch of word) {
    const w = (p.w[ch] ?? p.tv);
    const side = style.side?.[ch] ?? [0, 0];
    if (prev) x += style.gap + (style.kern?.[prev + ch] ?? 0);
    x += side[0];
    const cs = glyphs[ch].map((c) => chamfer(c, style.size));
    for (const c of cs) if (area(c) === 0) throw new Error('degenerate ' + ch);
    out.push({ ch, x, w, contours: translate(cs, x) });
    x += w + side[1];
    prev = ch;
  }
  return { letters: out, width: x, contours: out.flatMap((l) => l.contours) };
}
