// Geometry for every mark and wordmark. All marks live in a 64x64 box.
let N = 0;
export const u = () => 'k' + (++N);
export const lg = (id, stops, x1, y1, x2, y2, user = true) =>
  `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"${user ? ' gradientUnits="userSpaceOnUse"' : ''}>${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient>`;
const f = n => +n.toFixed(2);

// ---------- mitre polygons for orthogonal or angled strips ----------
export function mitre(pts, s) {
  const h = s / 2, out = [];
  const dir = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy); return [dx / l, dy / l]; };
  const nrm = d => [-d[1], d[0]];
  const inter = (p, d, q, e) => { const den = d[0] * e[1] - d[1] * e[0]; const t = ((q[0] - p[0]) * e[1] - (q[1] - p[1]) * e[0]) / den; return [p[0] + t * d[0], p[1] + t * d[1]]; };
  const off = (p, n, sg) => [p[0] + sg * h * n[0], p[1] + sg * h * n[1]];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], d = dir(a, b), n = nrm(d);
    const corner = (sg, end) => {
      const j = end ? i + 1 : i - 1;
      if (j < 0 || j > pts.length - 1 || (end && i + 1 === pts.length - 1)) return off(end ? b : a, n, sg);
      const a2 = end ? pts[i + 1] : pts[i - 1], b2 = end ? pts[i + 2] : pts[i];
      const d2 = dir(a2, b2), n2 = nrm(d2);
      return inter(off(end ? b : a, n, sg), d, off(a2, n2, sg), d2);
    };
    const s1 = corner(1, false), s2 = corner(-1, false), e1 = corner(1, true), e2 = corner(-1, true);
    out.push({ d: `M${f(s1[0])} ${f(s1[1])}L${f(e1[0])} ${f(e1[1])}L${f(e2[0])} ${f(e2[1])}L${f(s2[0])} ${f(s2[1])}Z`, vertical: Math.abs(d[1]) > Math.abs(d[0]), i });
  }
  return out;
}

// ================= 1 JIG =================
// 64 wide: walls 8, channels 6, tongues 8. Outer piece is a block m; inner piece is its counter.
const R8 = 'M8 0H56A8 8 0 0 1 64 8V56A8 8 0 0 1 56 64H8A8 8 0 0 1 0 56V8A8 8 0 0 1 8 0Z';
const R14 = 'M14 0H50A14 14 0 0 1 64 14V50A14 14 0 0 1 50 64H14A14 14 0 0 1 0 50V14A14 14 0 0 1 14 0Z';
const jigRound = b => ({
  hole: `M8 ${b}V15A7 7 0 0 1 15 8H21A7 7 0 0 1 28 15V49A1 1 0 0 0 29 50H35A1 1 0 0 0 36 49V15A7 7 0 0 1 43 8H49A7 7 0 0 1 56 15V${b}Z`,
  B: `M14 ${b}V15A1 1 0 0 1 15 14H21A1 1 0 0 1 22 15V49A7 7 0 0 0 29 56H35A7 7 0 0 0 42 49V15A1 1 0 0 1 43 14H49A1 1 0 0 1 50 15V${b}Z`,
});
export const JIG = {
  round: { ...jigRound(64), block: R8, t: '' },
  chamfer: { lit: true, hole: 'M8 64V15L15 8H21L28 15V50H36V15L43 8H49L56 15V64Z', B: 'M14 64V14H22V49L29 56H35L42 49V14H50V64Z', block: 'M8 0H56L64 8V56L56 64H8L0 56V8Z', t: '' },
  disc: { ...jigRound(80), block: 'M32 0A32 32 0 1 1 32 64A32 32 0 1 1 32 0Z', t: 'translate(32 32) scale(.84) translate(-32 -32)' },
  icon: { lit: true, ...jigRound(90), block: R14, t: 'translate(32 34) scale(.72) translate(-32 -32)' },
};
export function jig(g, mode, p) {
  const id = u(), T = g.t ? ` transform="${g.t}"` : '';
  const clip = `<clipPath id="${id}c"><path d="${g.block}"/></clipPath>`;
  const A = `<path fill-rule="evenodd" d="M-12 -12H76V76H-12Z${g.hole}"`;
  if (mode === 'mono') return `<defs>${clip}</defs><g clip-path="url(#${id}c)" fill="currentColor"><g${T}>${A}/><path d="${g.B}"/></g></g>`;
  if (mode === 'flat') return `<defs>${clip}</defs><g clip-path="url(#${id}c)"><g${T}>${A} fill="${p.fg}"/><path d="${g.B}" fill="${p.acc}"/></g></g>`;
  if (!g.lit) return `<defs>${clip}${lg(id + 'a', [[0, p.fg], [1, p.fg2]], 0, 0, 0, 64)}${lg(id + 'b', [[0, p.lit2], [1, p.lit1]], 0, 14, 0, 64)}</defs><g clip-path="url(#${id}c)"><g${T}>${A} fill="url(#${id}a)"/><path d="${g.B}" fill="url(#${id}b)"/></g></g>`;
  // lit: graphite block, the slot lit from inside
  return `<defs>${clip}${lg(id + 'g', [[0, p.g1], [1, p.g2]], 0, 0, 0, 64)}${lg(id + 'l', [[0, p.lit1], [.55, p.lit2], [1, p.lit3]], 0, 0, 64, 0)}${lg(id + 'h', [[0, 'rgba(255,255,255,.22)'], [.25, 'rgba(255,255,255,0)']], 0, 0, 0, 64)}</defs>`
    + `<g clip-path="url(#${id}c)"><rect x="-12" y="-12" width="88" height="88" fill="url(#${id}g)"/><g${T}><path d="${g.hole}" fill="url(#${id}l)"/><path d="${g.B}" fill="url(#${id}g)"/></g></g>`
    + `<path d="${g.block}" fill="none" stroke="url(#${id}h)" stroke-width="1"/>`;
}

// ================= 2 LOOP =================
const LP = 'M2 52H14C20 52 26 46 32 40C38 34 48 30 48 22A16 16 0 0 0 16 22C16 30 26 34 32 40C38 46 44 52 50 52H62';
const LO = 'M16 22C16 30 26 34 32 40C38 46 44 52 50 52H62';
export const LOOP = {
  base: { path: LP, over: LO, cut: 'M27 35L37 45', sw: 8, t: 'translate(0 3)' },
  heavy: { path: 'M0 52H14C20 52 26 46 32 40C38 34 47 30 47 23A15 15 0 0 0 17 23C17 30 26 34 32 40C38 46 44 52 50 52H64', over: 'M17 23C17 30 26 34 32 40C38 46 44 52 50 52H64', cut: 'M26 34L38 46', sw: 11, t: 'translate(0 2)' },
  tile: { path: 'M-6 52H14C20 52 26 46 32 40C38 34 48 30 48 22A16 16 0 0 0 16 22C16 30 26 34 32 40C38 46 44 52 50 52H70', over: 'M16 22C16 30 26 34 32 40C38 46 44 52 50 52H70', cut: 'M27 35L37 45', sw: 8, t: 'translate(0 1)', tile: R14 },
};
export function loop(g, mode, p) {
  const id = u(), sw = g.sw, gap = sw + 8;
  const st = c => `fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="butt" stroke-linejoin="round"`;
  if (g.tile) {
    const m = `<mask id="${id}m" maskUnits="userSpaceOnUse" x="-10" y="-10" width="84" height="84"><rect x="-10" y="-10" width="84" height="84" fill="#fff"/><g transform="${g.t}"><path d="${g.path}" ${st('#000')}/><path d="${g.cut}" stroke="#fff" stroke-width="${gap}"/><path d="${g.over}" ${st('#000')}/></g></mask>`;
    const fill = mode === 'mono' ? 'currentColor' : mode === 'flat' ? p.acc : `url(#${id}g)`;
    return `<defs>${m}${mode === 'hero' ? lg(id + 'g', [[0, p.d2], [1, p.d1]], 0, 0, 64, 64) : ''}</defs><path d="${g.tile}" fill="${fill}" mask="url(#${id}m)"/>`;
  }
  const c = mode === 'mono' ? 'currentColor' : mode === 'flat' ? p.acc : `url(#${id}g)`;
  const m = `<mask id="${id}m" maskUnits="userSpaceOnUse" x="-10" y="-10" width="84" height="84"><rect x="-10" y="-10" width="84" height="84" fill="#fff"/><path d="${g.cut}" stroke="#000" stroke-width="${gap}"/></mask>`;
  const gr = mode === 'hero' ? lg(id + 'g', [[0, p.d1], [.6, p.d2], [1, p.d3]], 0, 0, 64, 0) : '';
  return `<defs>${m}${gr}</defs><g transform="${g.t}"><path d="${g.path}" ${st(c)} mask="url(#${id}m)"/><path d="${g.over}" ${st(c)}/></g>`;
}

// ================= 3 VIADUCT =================
export const VIA = {
  base: { m: 'M4 24H60V48H50.5V38A6.75 6.75 0 0 0 37 38V48H27V38A6.75 6.75 0 0 0 13.5 38V48H4Z', rail: 'M0 16H64V21H0Z' },
  three: { m: 'M2 24H62V48H56V36A6 6 0 0 0 44 36V48H38V36A6 6 0 0 0 26 36V48H20V36A6 6 0 0 0 8 36V48H2Z', rail: 'M0 16H64V21H0Z' },
  run: { m: 'M2 24H46V50H38V37A5 5 0 0 0 28 37V50H20V37A5 5 0 0 0 10 37V50H2Z', rail: 'M2 16H64V21H2Z' },
};
export function via(g, mode, p) {
  if (mode === 'mono') return `<g fill="currentColor"><path d="${g.m}"/><path d="${g.rail}"/></g>`;
  if (mode === 'flat') return `<path d="${g.m}" fill="${p.fg}"/><path d="${g.rail}" fill="${p.acc}"/>`;
  const id = u();
  return `<defs>${lg(id + 'r', [[0, p.acc], [1, p.acc2]], 0, 0, 64, 0)}${lg(id + 'm', [[0, p.fg], [1, p.fg2]], 0, 20, 0, 60)}</defs><path d="${g.m}" fill="url(#${id}m)"/><path d="${g.rail}" fill="url(#${id}r)"/>`;
}

// ================= 4 CARRIAGE =================
// Front view of a linear guide: a carriage that wraps a rail head and can only slide along it.
export const CAR = {
  dove: { car: 'M10 8H54L60 14V38H42L46 24H18L22 38H4V14Z', rail: 'M21.5 27.5H42.5L40.4 35H37V50H52V58H12V50H27V35H23.6Z' },
  tee: { car: 'M10 8H54L60 14V38H39V31H48V20H16V31H25V38H4V14Z', rail: 'M19.5 23.5H44.5V28H35.5V50H52V58H12V50H28.5V28H19.5Z' },
  round: { car: 'M10 8H54L60 14V38H41.6A11 11 0 1 0 22.4 38H4V14Z', rail: 'M32 25.4A7.5 7.5 0 1 1 31.99 25.4ZM28.5 38H35.5V50H52V58H12V50H28.5Z' },
};
export function car(g, mode, p) {
  if (mode === 'mono') return `<g fill="currentColor"><path d="${g.car}"/><path d="${g.rail}"/></g>`;
  if (mode === 'flat') return `<path d="${g.car}" fill="${p.acc}"/><path d="${g.rail}" fill="${p.fg}"/>`;
  const id = u();
  return `<defs>${lg(id + 'c', [[0, p.accHi], [1, p.acc]], 0, 6, 0, 42)}${lg(id + 'r', [[0, p.fg], [1, p.fg2]], 0, 28, 0, 58)}</defs><path d="${g.car}" fill="url(#${id}c)"/><path d="${g.rail}" fill="url(#${id}r)"/><path d="${g.car}" fill="none" stroke="rgba(255,255,255,.25)" stroke-width=".6"/>`;
}

// ================= 5 CUBE (Pull) =================
// An isometric block of slabs with one slab slid out along its axis.
function cubeSlabs({ n = 3, h = 11, g = 2.5, cx = 28, top = 13, pull = 1, dx = 8, dy = 4 }) {
  const W = 22, H = 11, out = [];
  for (let i = n - 1; i >= 0; i--) {
    const hot = i === pull, x = cx + (hot ? dx : 0), c = top + i * (h + g) + (hot ? dy : 0);
    out.push({ hot, top: `M${x} ${c - H}L${x + W} ${c}L${x} ${c + H}L${x - W} ${c}Z`, left: `M${x - W} ${c}L${x} ${c + H}V${c + H + h}L${x - W} ${c + h}Z`, right: `M${x} ${c + H}L${x + W} ${c}V${c + h}L${x} ${c + H + h}Z` });
  }
  return out;
}
export const CUBE = {
  three: cubeSlabs({}),
  four: cubeSlabs({ n: 4, h: 7.5, g: 2.5, top: 13.5, pull: 2, dx: 8, dy: 4 }),
  left: cubeSlabs({ cx: 36, pull: 1, dx: -10, dy: 5 }),
};
export function cube(g, mode, p) {
  const id = u(); let defs = '';
  const body = g.map((s, i) => {
    const later = g.slice(i + 1).map(o => [o.top, o.left, o.right].map(d => `<path d="${d}" fill="#000" stroke="#000" stroke-width="${mode === 'mono' ? 3 : 2}" stroke-linejoin="round"/>`).join('')).join('');
    let M = '';
    if (later) { defs += `<mask id="${id}m${i}" maskUnits="userSpaceOnUse" x="-8" y="-8" width="80" height="80"><rect x="-8" y="-8" width="80" height="80" fill="#fff"/>${later}</mask>`; M = ` mask="url(#${id}m${i})"`; }
    const c = mode === 'mono' ? ['currentColor', 'currentColor', 'currentColor'] : s.hot ? p.hot : p.cold;
    return `<g${M}><path d="${s.top}" fill="${c[0]}"/><path d="${s.left}" fill="${c[1]}"/><path d="${s.right}" fill="${c[2]}"/></g>`;
  }).join('');
  return `<defs>${defs}</defs>${body}`;
}
