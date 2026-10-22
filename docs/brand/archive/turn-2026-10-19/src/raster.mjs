// Point-sampled isometric rasterizer: whole-pixel edges by construction.
export const P = (x, y, z, k, ox, oy) => [(x - y) * k + ox, ((x + y) / 2 - z) * k + oy];
const inside = (pt, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) c = !c; } return c; };
const faces = ([x0, y0, z0, x1, y1, z1]) => [
  [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]],
  [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]],
  [[x1, y0, z1], [x1, y1, z1], [x1, y1, z0], [x1, y0, z0]],
];
// items in paint order: {b, hot, grp}. gap: 0 | 'n4' | 'n8' | 'h' (horizontal-only 1px)
export function raster({ W, k, ox, oy, items, pal, gap = 'n4' }) {
  const G = Array.from({ length: W }, () => Array(W).fill(null)), owner = Array.from({ length: W }, () => Array(W).fill(-1));
  items.forEach((it, idx) => {
    const fs = faces(it.b).map(f => f.map(v => P(...v, k, ox, oy)));
    const cov = [];
    for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) { const c = [i + .5, j + .5]; const fi = fs.findIndex(f => inside(c, f)); if (fi >= 0) cov.push([i, j, fi]); }
    const gg = it.gap ?? gap; const N = gg === 'n8' ? [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]] : gg === 'n4' ? [[1,0],[-1,0],[0,1],[0,-1]] : gg === 'h' ? [[1,0],[-1,0]] : [];
    for (const [i, j] of cov) for (const [di, dj] of N) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= W || b >= W) continue; const o = owner[b][a]; if (o >= 0 && o !== idx && !(it.grp && items[o].grp === it.grp)) { G[b][a] = null; owner[b][a] = -1; } }
    const c = it.hot ? pal.hot : pal.cold;
    for (const [i, j, fi] of cov) { G[j][i] = c[fi]; owner[j][i] = idx; }
  });
  return G;
}
export function toSVG(G, title = 'machine') {
  const W = G.length; let r = '';
  for (let j = 0; j < W; j++) { let i = 0; while (i < W) { const c = G[j][i]; if (!c) { i++; continue; } let e = i; while (e + 1 < W && G[j][e + 1] === c) e++; r += `<path d="M${i} ${j}h${e - i + 1}v1h-${e - i + 1}z" fill="${c}"/>`; i = e + 1; } }
  // merge by colour into one path each
  const by = {}; r.replace(/<path d="([^"]+)" fill="([^"]+)"\/>/g, (_, d, f) => { (by[f] ||= []).push(d); });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}" viewBox="0 0 ${W} ${W}" shape-rendering="crispEdges"><title>${title}</title>${Object.entries(by).map(([f, ds]) => `<path fill="${f}" d="${ds.join('')}"/>`).join('')}</svg>`;
}
export const ascii = G => G.map(row => row.map(c => c ? 'x' : '.').join('')).join('\n');
