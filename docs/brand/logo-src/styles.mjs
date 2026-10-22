// The letter systems shared by the competition build and the final GT set.
export const LX = { X: 100, A: 40, tv: 22, th: 19, dot: 22, bar: 0.5, bowl: 0.42, w: { m: 196, n: 124, h: 124, a: 122, c: 116, e: 122, i: 22 } };
export const lowStyle = (o = {}) => ({
  gap: o.gap ?? 18,
  size: (tag, pos) => {
    const s = { o: 16, k: 6, b: 0, f: 0, i: 6, t: 5, s: 0, d: 6, ...(o.sizes ?? {}) }[tag] ?? 0;
    if (o.only && ['o', 'b', 'k'].includes(tag) && !o.only.includes(pos)) return 0;
    return s;
  },
  side: o.side, kern: o.kern,
});
export const UX = { X: 100, tv: 21, th: 18, td: 20, bar: 0.5, abar: 0.58, w: { M: 168, A: 134, C: 126, H: 134, I: 21, N: 138, E: 120 } };
export const upStyle = (o = {}, P = UX) => {
  const t = (P.tv + P.th) / 2, A = o.A ?? 34;
  const sizes = { o: 14, k: 5, b: 0, f: 0, i: 5, t: 0, s: 0, x: 0, A, a: Math.max(0, A + t * Math.SQRT2 - P.tv - P.th), ...(o.sizes ?? {}) };
  return { gap: o.gap ?? 22, size: (tag, pos) => (o.only && ['o', 'b', 'A', 'k'].includes(tag) && !o.only.includes(pos) ? 0 : sizes[tag] ?? 0), kern: o.kern, side: o.side };
};

