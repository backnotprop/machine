// Isometric (2:1) solids renderer. Plan axes: +x goes screen down-right, +y goes screen down-left, +z up.
// Viewer sits at +x +y +z: visible faces are top (z1), left (y1 face) and right (x1 face).
let N = 0; const uid = () => 'i' + (++N);
const r2 = n => +(+n).toFixed(2);
export const P = (x, y, z, k = 1) => [(x - y) * k, (x + y) * k / 2 - z * k];

export function box(x0, y0, z0, x1, y1, z1, hot = false) { return { kind: 'box', b: [x0, y0, z0, x1, y1, z1], hot }; }
// extruded polygon. axis 'z': pts are [x,y], extruded z0..z1. axis 'y': pts are [x,z], extruded y0..y1. axis 'x': pts are [y,z].
export function prism(pts, a0, a1, hot = false, axis = 'z') {
  const A = pts.map(p => p[0]), B = pts.map(p => p[1]);
  const lo = [Math.min(...A), Math.min(...B)], hi = [Math.max(...A), Math.max(...B)];
  const b = axis === 'z' ? [lo[0], lo[1], a0, hi[0], hi[1], a1] : axis === 'y' ? [lo[0], a0, lo[1], hi[0], a1, hi[1]] : [a0, lo[0], lo[1], a1, hi[0], hi[1]];
  return { kind: 'prism', pts, a0, a1, axis, b, hot };
}
const mix = (a, b, t) => {
  const h = s => [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16));
  const A = h(a), B = h(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
};

// faces in plan space -> list of {pts3d, shade:'top'|'left'|'right'|t}
function faces(it) {
  const [x0, y0, z0, x1, y1, z1] = it.b;
  if (it.kind === 'box') return [
    { p: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], s: 0 },
    { p: [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], s: 1 },
    { p: [[x1, y0, z1], [x1, y1, z1], [x1, y1, z0], [x1, y0, z0]], s: 2 },
  ];
  const to3 = (p, a) => it.axis === 'z' ? [p[0], p[1], a] : it.axis === 'y' ? [p[0], a, p[1]] : [a, p[0], p[1]];
  const ai = it.axis === 'z' ? 2 : it.axis === 'y' ? 1 : 0;
  const pts = it.pts, n = pts.length;
  let area = 0; for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
  const sides = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    let u = b[1] - a[1], v = -(b[0] - a[0]); if (area < 0) { u = -u; v = -v; }
    const L = Math.hypot(u, v); u /= L; v /= L;
    const nn = [0, 0, 0]; const others = [0, 1, 2].filter(j => j !== ai); nn[others[0]] = u; nn[others[1]] = v;
    if (nn[0] + nn[1] + nn[2] <= 1e-6) continue;
    const w = [Math.max(0, nn[2]), Math.max(0, nn[1]), Math.max(0, nn[0])], ws = w[0] + w[1] + w[2];
    const p3 = [to3(a, it.a1), to3(b, it.a1), to3(b, it.a0), to3(a, it.a0)];
    sides.push({ p: p3, s: w.map(x => x / ws), d: p3.reduce((t, q) => t + q[0] + q[1] + q[2], 0) });
  }
  sides.sort((u, v) => u.d - v.d);
  const cap = [0, 0, 0]; cap[ai === 2 ? 0 : ai === 1 ? 1 : 2] = 1;
  return [...sides, { p: pts.map(q => to3(q, it.a1)), s: cap }];
}

function wmix(c, w) {
  if (c[0] === 'currentColor') return c[0];
  const h = s => [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16));
  const v = [0, 1, 2].map(j => Math.round(c.reduce((t, s, i) => t + h(s)[j] * w[i], 0)));
  return '#' + v.map(x => x.toString(16).padStart(2, '0')).join('');
}

function order(items) {
  const n = items.length, before = items.map(() => new Set());
  const sb = items.map(it => { const q = faces(it).flatMap(f => f.p.map(v => P(...v))); const xs = q.map(v => v[0]), ys = q.map(v => v[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; });
  const over = (a, b) => a[0] < b[2] - 1e-6 && b[0] < a[2] - 1e-6 && a[1] < b[3] - 1e-6 && b[1] < a[3] - 1e-6;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (!over(sb[i], sb[j])) continue;
    const A = items[i].b, B = items[j].b; let rel = 0;
    for (const ax of [2, 0, 1]) { if (A[ax + 3] <= B[ax] + 1e-6) { rel = -1; break; } if (B[ax + 3] <= A[ax] + 1e-6) { rel = 1; break; } }
    if (!rel) { const c = b => b[0] + b[1] + b[2] + b[3] + b[4] + b[5]; rel = c(A) <= c(B) ? -1 : 1; }
    if (rel < 0) before[j].add(i); else before[i].add(j);
  }
  const out = [], done = new Set();
  const key = i => { const b = items[i].b; return b[0] + b[1] + b[3] + b[4] + (b[2] + b[5]) * .01; };
  while (out.length < n) {
    const ready = items.map((_, i) => i).filter(i => !done.has(i) && [...before[i]].every(j => done.has(j)));
    const pick = (ready.length ? ready : items.map((_, i) => i).filter(i => !done.has(i))).sort((a, b) => key(a) - key(b))[0];
    done.add(pick); out.push(pick);
  }
  return { idx: out, sb };
}

// Render scene. opts: { size, k (fixed scale, integer snapping), pad, gap, pal:{cold:[t,l,r], hot:[t,l,r]}, mono }
export function render(items, o) {
  const size = o.size ?? 64, gap = o.gap ?? 1.25, pal = o.pal;
  const { idx, sb } = order(items);
  // projection
  const all = items.flatMap(it => faces(it).flatMap(f => f.p.map(v => P(...v))));
  const mnx = Math.min(...all.map(v => v[0])), mxx = Math.max(...all.map(v => v[0]));
  const mny = Math.min(...all.map(v => v[1])), mxy = Math.max(...all.map(v => v[1]));
  let s, ox, oy;
  if (o.k) { s = o.k; ox = Math.floor((size - (mxx - mnx) * s) / 2) - mnx * s; oy = Math.floor((size - (mxy - mny) * s) / 2 + (o.dy || 0)) - mny * s; }
  else { const pad = o.pad ?? 4; s = Math.min((size - 2 * pad) / (mxx - mnx), (size - 2 * pad) / (mxy - mny)); ox = (size - (mxx - mnx) * s) / 2 - mnx * s; oy = (size - (mxy - mny) * s) / 2 - mny * s + (o.dy || 0); }
  const T = v => { const q = P(...v); return [r2(q[0] * s + ox), r2(q[1] * s + oy)]; };
  const path = f => 'M' + f.p.map(v => T(v).join(' ')).join('L') + 'Z';
  const id = uid(); let defs = '', body = '';
  const groups = idx.map(i => ({ i, fs: faces(items[i]).map(f => ({ d: path(f), s: f.s })) }));
  const extent = { w: r2((mxx - mnx) * s), h: r2((mxy - mny) * s), x: r2(mnx * s + ox), y: r2(mny * s + oy) };
  groups.forEach((g, gi) => {
    const later = groups.slice(gi + 1).filter(h => { if (items[g.i].grp && items[g.i].grp === items[h.i].grp) return false; const a = sb[g.i], b = sb[h.i]; return a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]; });
    let M = '';
    if (later.length && gap > 0) {
      defs += `<mask id="${id}m${gi}" maskUnits="userSpaceOnUse" x="-8" y="-8" width="${size + 16}" height="${size + 16}"><rect x="-8" y="-8" width="${size + 16}" height="${size + 16}" fill="#fff"/>${later.map(h => h.fs.map(f => `<path d="${f.d}" fill="#000" stroke="#000" stroke-width="${gap * 2}" stroke-linejoin="${o.join || 'round'}"/>`).join('')).join('')}</mask>`;
      M = ` mask="url(#${id}m${gi})"`;
    }
    const c = o.mono ? ['currentColor', 'currentColor', 'currentColor'] : items[g.i].hot ? pal.hot : pal.cold;
    const col = sh => Array.isArray(sh) ? wmix(c, sh) : c[sh];
    body += `<g${M}>${g.fs.map(f => `<path d="${f.d}" fill="${col(f.s)}"/>`).join('')}</g>`;
  });
  return { svg: (defs ? `<defs>${defs}</defs>` : '') + body, extent };
}
