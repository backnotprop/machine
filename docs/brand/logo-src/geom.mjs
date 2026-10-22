// Polygon geometry for the drawn letterforms.
// A contour is [[x, y, tag?], ...] in y-down space. Outer contours run clockwise on screen
// (positive shoelace area), counters run the other way, so "inward" always points into material.

export const r2 = (n) => Math.round(n * 100) / 100;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const len = (v) => Math.hypot(v[0], v[1]);
const nrm = (v) => { const l = len(v) || 1; return [v[0] / l, v[1] / l]; };

export function area(c) {
  let a = 0;
  for (let i = 0; i < c.length; i++) { const p = c[i], q = c[(i + 1) % c.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return a / 2;
}

// Where a convex corner points: 'tl' | 'tr' | 'bl' | 'br'.
function cornerPos(prev, p, next) {
  const u = nrm(sub(prev, p)), v = nrm(sub(next, p));
  const o = [-(u[0] + v[0]), -(u[1] + v[1])];
  return (o[1] < 0 ? 't' : 'b') + (o[0] < 0 ? 'l' : 'r');
}

// Replace tagged corners by 45-degree cuts. size(tag, pos) -> length along each edge.
export function chamfer(c, size) {
  const out = [];
  for (let i = 0; i < c.length; i++) {
    const prev = c[(i - 1 + c.length) % c.length], p = c[i], next = c[(i + 1) % c.length];
    const s = p[2] ? size(p[2], cornerPos(prev, p, next)) : 0;
    if (!s) { out.push([p[0], p[1]]); continue; }
    const u = nrm(sub(prev, p)), v = nrm(sub(next, p));
    out.push([p[0] + u[0] * s, p[1] + u[1] * s], [p[0] + v[0] * s, p[1] + v[1] * s]);
  }
  return out;
}

export const mapPts = (contours, f) => contours.map((c) => c.map((p) => { const q = f(p[0], p[1]); return p.length > 2 ? [q[0], q[1], p[2]] : q; }));
export const translate = (contours, dx, dy = 0) => mapPts(contours, (x, y) => [x + dx, y + dy]);
export const scale = (contours, s, ox = 0, oy = 0) => mapPts(contours, (x, y) => [ox + x * s, oy + y * s]);
// Forward lean: positive angle leans the tops right, about the baseline y0.
export const skew = (contours, deg, y0 = 0) => { const t = Math.tan((deg * Math.PI) / 180); return mapPts(contours, (x, y) => [x + (y0 - y) * t, y]); };

// Offset every edge into the material by d and re-intersect neighbours.
export function inset(c, d) {
  const n = c.length, lines = [];
  for (let i = 0; i < n; i++) {
    const p = c[i], q = c[(i + 1) % n], dir = nrm(sub(q, p)), nm = [-dir[1], dir[0]];
    lines.push({ p: [p[0] + nm[0] * d, p[1] + nm[1] * d], dir, nm });
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = lines[(i - 1 + n) % n], b = lines[i];
    const den = a.dir[0] * b.dir[1] - a.dir[1] * b.dir[0];
    if (Math.abs(den) < 1e-9) { out.push([c[i][0] + b.nm[0] * d, c[i][1] + b.nm[1] * d]); continue; }
    const w = sub(b.p, a.p), t = (w[0] * b.dir[1] - w[1] * b.dir[0]) / den;
    out.push([a.p[0] + a.dir[0] * t, a.p[1] + a.dir[1] * t]);
  }
  return out;
}

// Facets between a contour and its inset: [{pts, out:[nx,ny]}], out = outward normal of the edge.
export function facets(c, d) {
  const q = inset(c, d), n = c.length, res = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, dir = nrm(sub(c[j], c[i]));
    res.push({ pts: [c[i], c[j], q[j], q[i]], out: [dir[1], -dir[0]] });
  }
  return { facets: res, inner: q };
}

export const d = (contours) => contours.map((c) => 'M' + c.map((p) => `${r2(p[0])} ${r2(p[1])}`).join('L') + 'Z').join('');

export function bbox(contours) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of contours) for (const [x, y] of c) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

// Regular polygon helpers for symbols.
export function ngon(cx, cy, r, n, rot = 0, ccw = false) {
  const pts = [];
  for (let i = 0; i < n; i++) { const a = rot + (i * 2 * Math.PI) / n; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return ccw ? pts.reverse() : pts;
}
export function rect(x, y, w, h, tag = 'o', ccw = false) {
  const p = [[x, y, tag], [x + w, y, tag], [x + w, y + h, tag], [x, y + h, tag]];
  return ccw ? p.reverse() : p;
}

// Colour ramp interpolation. stops: [[t, '#rrggbb'], ...]
export function ramp(stops, t) {
  t = Math.max(stops[0][0], Math.min(stops[stops.length - 1][0], t));
  for (let i = 0; i < stops.length - 1; i++) {
    const [a, ca] = stops[i], [b, cb] = stops[i + 1];
    if (t >= a && t <= b) {
      const k = (t - a) / (b - a || 1), A = hex(ca), B = hex(cb);
      return '#' + A.map((v, j) => Math.round(v + (B[j] - v) * k).toString(16).padStart(2, '0')).join('');
    }
  }
  return stops[stops.length - 1][1];
}
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
