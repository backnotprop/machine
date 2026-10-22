// The machine as a map: dagre for positions, our own SVG. It is the hero of the run page and the editor.
// One drawing, three sizes: inline (fits its frame, never below reading size), full screen (pan and zoom), and the thumb on machine rows.
import dagre from "@dagrejs/dagre";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { Machine } from "./api.ts";
import { clip } from "./api.ts";

export type Tone = "running" | "waiting" | "blocked" | "succeeded" | "failed" | "cancelled" | "select";
type Dir = "LR" | "TB";
interface P { x: number; y: number }
interface GNode { id: string; x: number; y: number; w: number; h: number; kind: string; title: string; outcome?: string; missing?: boolean }
interface GEdge { key: string; from: string; to: string; event: string; human: boolean; points: P[]; lx: number; ly: number; len: number }
export interface Layout { nodes: GNode[]; edges: GEdge[]; w: number; h: number; dir: Dir }

// What to light: the run's walk, or the editor's selection. `problems`: states the editor flags.
// `hl`: what the reader points at elsewhere on the page (a history chapter or move): a node, an edge, or both.
export interface View { current?: string; walked?: Set<string>; edges?: Set<string>; visits?: Map<string, number>; last?: string; tone?: Tone; selected?: string; problems?: Set<string>; hl?: { node?: string; edge?: string } | null }

// Average advance in px at the token sizes: Geist Mono 12 (--t-mono, ids), Geist Sans 13 (--t-sm, titles), Geist Mono 11 (--t-mono-sm, events).
const MONO = 7.2, SANS = 7.0, LBL = 6.6;
// The inline graph never draws type smaller than its tokens: below this scale it pans instead of shrinking.
const MIN_SCALE = 1, MAX_SCALE = 1.2;

function layoutMachine(m: Machine, dir: Dir, detail = false): Layout {
  // Labels take no room in the layout (dagre would give each its own rank and double the width);
  // instead the gap between ranks is sized to hold a typical label, and labels sit on the edge's midpoint.
  const lw = Object.values(m.states).flatMap((s) => Object.keys(s.on ?? {}).map((e) => e.length * LBL)).sort((a, b) => a - b);
  const typical = lw.length ? lw[Math.floor(lw.length * 0.7)] : 40;
  const ranksep = dir === "LR" ? (detail ? Math.min(170, Math.max(70, lw[lw.length - 1] + 34)) : Math.min(120, Math.max(60, typical + 26))) : detail ? 62 : 40;
  const g = new dagre.graphlib.Graph({ multigraph: true })
    .setGraph({ rankdir: dir, nodesep: dir === "TB" ? 36 : 24, ranksep, edgesep: 14, marginx: 24, marginy: 24 })
    .setDefaultEdgeLabel(() => ({}));
  const size = (id: string, title: string, kind: string) => {
    const glyph = kind === "decision" || kind === "wait" ? 16 : 0;
    return detail
      ? { width: Math.max(id.length * MONO + glyph, clip(title, 30).length * SANS) + 40, height: 54 }
      : { width: id.length * MONO + glyph + 34, height: dir === "TB" ? 32 : 36 };
  };
  for (const [id, s] of Object.entries(m.states)) g.setNode(id, { ...size(id, s.title, s.kind), kind: s.kind, title: s.title, outcome: s.outcome });
  for (const [from, s] of Object.entries(m.states))
    for (const [ev, t] of Object.entries(s.on ?? {})) {
      const to = t.to || "?";
      if (!g.hasNode(to)) g.setNode(to, { ...size(to + " ?", "", "task"), kind: "task", title: "not written yet", missing: true }); // half-written machine: draw the gap
      g.setEdge(from, to, { label: ev, width: 0, height: 0, human: t.actor === "human" }, `${from}:${ev}`);
    }
  try { dagre.layout(g); } catch { return { nodes: [], edges: [], w: 200, h: 80, dir }; }
  const gi = g.graph() as { width?: number; height?: number };
  const nodes = g.nodes().map((id) => { const n = g.node(id) as any; return { id, x: n.x, y: n.y, w: n.width, h: n.height, kind: n.kind, title: n.title, outcome: n.outcome, missing: n.missing }; });
  const edges: GEdge[] = g.edges().map((e) => { const d = g.edge(e) as any; const mid = midpoint(d.points); return { key: `${e.v}→${d.label}`, from: e.v, to: e.w, event: d.label, human: !!d.human, points: d.points, lx: mid.x, ly: mid.y, len: d.points.slice(1).reduce((a: number, q: P, i: number) => a + Math.hypot(q.x - d.points[i].x, q.y - d.points[i].y), 0) }; });
  placeLabels(nodes, edges, dir);
  return { nodes, edges, w: gi.width ?? 200, h: gi.height ?? 80, dir };
}

// Labels of parallel edges land on the same spot, and long edges run through other labels: nudge each label along its
// edge and across it until it clears the nodes, the labels already placed, and every other edge's line.
type Box = { x: number; y: number; w: number; h: number };
const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
function segHits(p: P, q: P, b: Box) {
  // Liang–Barsky clip of segment pq against the box
  let t0 = 0, t1 = 1; const dx = q.x - p.x, dy = q.y - p.y;
  for (const [pp, qq] of [[-dx, p.x - b.x], [dx, b.x + b.w - p.x], [-dy, p.y - b.y], [dy, b.y + b.h - p.y]] as [number, number][]) {
    if (pp === 0) { if (qq < 0) return false; continue; }
    const r = qq / pp; if (pp < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return true;
}
function placeLabels(nodes: GNode[], edges: GEdge[], dir: Dir) {
  const boxes: Box[] = nodes.map((n) => ({ x: n.x - n.w / 2, y: n.y - n.h / 2, w: n.w, h: n.h }));
  for (const e of edges) {
    const text = fitLabel(e, dir);
    const w = text.length * LBL + 10, h = 17;
    const d = direction(e.points); const nx = -d.y, ny = d.x;
    // first along the edge itself (the label stays on its line), then across it, then anywhere nearby
    const tries: [number, number][] = [[0, 0]];
    for (const k of [18, 32, 48, 66]) tries.push([d.x * k, d.y * k], [-d.x * k, -d.y * k]);
    for (const k of [12, 20, 30, 42]) tries.push([nx * k, ny * k], [-nx * k, -ny * k]);
    for (const r of [24, 40, 60]) for (let a = 0; a < 8; a++) tries.push([Math.cos(a * Math.PI / 4) * (r + w / 3), Math.sin(a * Math.PI / 4) * r]);
    const cost = ([dx, dy]: [number, number]) => {
      const b = { x: e.lx + dx - w / 2, y: e.ly + dy - h / 2, w, h };
      let c = boxes.filter((o) => overlaps(b, o)).length * 3;
      for (const o of edges) if (o !== e) for (let i = 1; i < o.points.length; i++) if (segHits(o.points[i - 1], o.points[i], b)) { c += 1; break; }
      return c;
    };
    let best = tries[0], bestC = Infinity;
    for (const t of tries) { const c = cost(t); if (c < bestC) { best = t; bestC = c; } if (c === 0) break; }
    e.lx += best[0]; e.ly += best[1];
    boxes.push({ x: e.lx - w / 2, y: e.ly - h / 2, w, h });
  }
}

// The point halfway along a polyline, where the event's name sits.
function midpoint(p: P[]): P {
  const seg = p.slice(1).map((q, i) => Math.hypot(q.x - p[i].x, q.y - p[i].y));
  let half = seg.reduce((a, b) => a + b, 0) / 2;
  for (let i = 0; i < seg.length; i++) {
    if (half <= seg[i]) { const t = seg[i] ? half / seg[i] : 0; return { x: p[i].x + (p[i + 1].x - p[i].x) * t, y: p[i].y + (p[i + 1].y - p[i].y) * t }; }
    half -= seg[i];
  }
  return p[p.length - 1] ?? { x: 0, y: 0 };
}
// The unit direction of the polyline at its midpoint.
function direction(p: P[]): P {
  const seg = p.slice(1).map((q, i) => Math.hypot(q.x - p[i].x, q.y - p[i].y));
  let half = seg.reduce((a, b) => a + b, 0) / 2;
  for (let i = 0; i < seg.length; i++) { if (half <= seg[i] && seg[i]) return { x: (p[i + 1].x - p[i].x) / seg[i], y: (p[i + 1].y - p[i].y) / seg[i] }; half -= seg[i]; }
  return { x: 1, y: 0 };
}

// Choose the direction that reads largest in the space we have. Below the minimum scale, lay it out left to right at the minimum and pan.
function fit(m: Machine, W: number, maxH: number, maxScale: number, detail = false, minScale = 0) {
  const opts = (["LR", "TB"] as Dir[]).map((d) => { const l = layoutMachine(m, d, detail); return { l, s: Math.min(W / l.w, maxH / l.h, maxScale) }; });
  const pick = opts[0].s >= opts[1].s * 0.92 ? opts[0] : opts[1];
  if (pick.s >= minScale) return pick;
  return { l: opts[0].l, s: minScale };
}

// Polyline from dagre → one smooth path through the same points.
function smooth(p: P[]) {
  if (p.length < 3) return p.map((q, i) => `${i ? "L" : "M"}${q.x},${q.y}`).join(" ");
  let d = `M${p[0].x},${p[0].y}`;
  for (let i = 1; i < p.length - 1; i++) { const mx = (p[i].x + p[i + 1].x) / 2, my = (p[i].y + p[i + 1].y) / 2; d += ` Q${p[i].x},${p[i].y} ${mx},${my}`; }
  const l = p[p.length - 1]; return d + ` L${l.x},${l.y}`;
}

// On a short horizontal edge a long event name would run into the nodes; shorten it there (the full name is in the tooltip
// and in full screen, where the ranks are spaced for the longest name).
function fitLabel(e: GEdge, dir: Dir) {
  if (dir === "TB") return e.event;
  const room = Math.floor((e.len - 18) / LBL);
  return e.event.length <= room ? e.event : room < 4 ? "…" : e.event.slice(0, room - 1) + "…";
}

// `dock`: drawn small in the facts column; strokes keep their width, labels fade out as the scale (--k) drops,
// and the current step's name is set above its block at a size you can read.
// The current step's name in the dock, placed by MachineGraph where it touches no block (drawing units).
interface DockLabel { x: number; y: number; w: number; h: number; fs: number; r: number }
// Drawing by hand (editor and describe stage): a + at a step's exit adds the next step or, dragged, connects to another.
export interface Draw {
  onAdd: (from: string) => void; onConnect: (from: string, to: string, event: string) => void; onRetitle: (id: string, title: string) => void; eventName?: (from: string, to: string) => string;
  /** Removing a step: × on the node or Delete arms it; the confirm sits on the node until Remove, Keep, Escape or another selection. */
  armed?: string | null; onArm?: (id: string) => void; onRemove?: (id: string) => void; onKeep?: () => void;
}
interface DrawHooks { start: (from: string, e: React.PointerEvent) => void; retitle: (id: string) => void; arm?: (id: string) => void; armed?: string | null; drop?: string | null; line?: { x1: number; y1: number; x2: number; y2: number } | null }
function Drawing({ l, v, detail, onSelect, uid, edit, dock, dockLabel, onHover, hooks }: { l: Layout; v: View; detail?: boolean; onSelect?: (s: string) => void; uid: string; edit?: boolean; dock?: boolean; dockLabel?: DockLabel | null; onHover?: (id: string | null) => void; hooks?: DrawHooks }) {
  return (
    <>
      <defs>
        {["idle", "walked", "last", "hl"].map((k) => (
          <marker key={k} id={`${uid}-${k}`} className={`mk mk-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="9" markerHeight="9" orient="auto-start-reverse">
            <path d="M1,1.5 L9,5 L1,8.5 Z" />
          </marker>
        ))}
        <linearGradient id={`${uid}-lit`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" className="lit-a" /><stop offset="1" className="lit-b" /></linearGradient>
      </defs>
      <g className="edges">
        {l.edges.map((e) => {
          const walked = v.edges?.has(e.key), last = v.last === e.key;
          const cls = last ? "last" : walked ? "walked" : "idle";
          const draw = last && !e.human && !dock; // a person's dashed edge keeps its dash; it fades in instead of drawing
          const hl = v.hl?.edge === e.key;
          return (
            <g key={e.key} className={`e ${cls}${e.human ? " human" : ""}${hl ? " hl" : ""}`}>
              <path d={smooth(e.points)} markerEnd={`url(#${uid}-${hl ? "hl" : cls})`} className={draw ? "draw" : undefined} pathLength={draw ? 1 : undefined} key={last ? `last-${v.last}` : undefined} />
              <text x={e.lx} y={e.ly + 4} textAnchor="middle">{fitLabel(e, l.dir)}<title>{e.event}</title></text>
            </g>
          );
        })}
      </g>
      <g className="nodes">
        {l.nodes.map((n) => {
          const lit = n.id === v.current, sel = n.id === v.selected, walked = v.walked?.has(n.id);
          const cls = ["n", n.missing ? "missing" : lit ? "lit" : walked ? "walked" : "idle", sel ? "sel" : "", v.problems?.has(n.id) ? "prob" : "", v.hl?.node === n.id ? "hl" : "", hooks?.drop === n.id ? "drop" : "", hooks?.armed === n.id ? "armed" : "", `k-${n.kind}`].filter(Boolean).join(" ");
          const plus = hooks && !n.missing && n.kind !== "final" ? (l.dir === "LR" ? { x: n.w / 2 + 15, y: 0 } : { x: 0, y: n.h / 2 + 15 }) : null;
          const glyph = n.kind === "decision" || n.kind === "wait";
          const rx = n.kind === "final" ? n.h / 2 : Math.round(n.h * 0.3);
          const times = v.visits?.get(n.id) ?? 0;
          const tx = glyph ? 8 : 0, ty = detail ? -4 : 4.3;
          const gx = tx - (n.id.length * MONO) / 2 - 11, gy = detail ? -8 : 0;
          const label = n.missing ? `${n.id} ?` : n.id;
          const pick = onSelect && !n.missing ? () => onSelect(n.id) : undefined;
          return (
            <g key={n.id} className={cls} data-node={n.id} transform={`translate(${n.x},${n.y})`}
              onClick={pick ? (e) => { e.stopPropagation(); pick(); } : undefined}
              onPointerEnter={onHover ? () => onHover(n.id) : undefined} onPointerLeave={onHover ? () => onHover(null) : undefined}
              onDoubleClick={hooks && !n.missing ? (e) => { e.stopPropagation(); hooks.retitle(n.id); } : undefined}
              tabIndex={pick ? 0 : undefined} role={pick ? "button" : undefined} aria-label={pick ? `${n.id}: ${n.title}` : undefined}
              onKeyDown={pick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); pick(); } } : undefined}>
              <title>{n.title}</title>
              {plus ? <rect className="hit" x={Math.min(-n.w / 2, plus.x - 12) - 2} y={Math.min(-n.h / 2, plus.y - 12) - 2} width={Math.max(n.w / 2, plus.x + 12) - Math.min(-n.w / 2, plus.x - 12) + 4} height={Math.max(n.h / 2, plus.y + 12) - Math.min(-n.h / 2, plus.y - 12) + 4} /> : null}
              <rect className="halo" x={-n.w / 2 - 5} y={-n.h / 2 - 5} width={n.w + 10} height={n.h + 10} rx={rx + 5} />
              {lit && !edit && !dock ? <rect key={`${v.current}-${v.tone}`} className="ring" x={-n.w / 2} y={-n.h / 2} width={n.w} height={n.h} rx={rx}
                style={{ "--x": `${-n.w / 2}px`, "--y": `${-n.h / 2}px`, "--w": `${n.w}px`, "--h": `${n.h}px`, "--rx": `${rx}px` } as React.CSSProperties} /> : null}
              <rect className="nb" x={-n.w / 2} y={-n.h / 2} width={n.w} height={n.h} rx={rx} style={lit ? { fill: `url(#${uid}-lit)`, "--w0": `${n.w}px`, "--h0": `${n.h}px` } as React.CSSProperties : undefined} />
              {glyph ? (n.kind === "decision"
                ? <path className="kg" d={`M${gx - 4.5},${gy} l4.5,-4.5 l4.5,4.5 l-4.5,4.5 Z`} />
                : <path className="kg" d={`M${gx - 4.5},${gy + 2.5} a4.5,4.5 0 0 1 9,0`} />) : null}
              <text className="nl" x={tx} y={ty} textAnchor="middle">{label}</text>
              {detail ? <text className="nt" x={0} y={15} textAnchor="middle">{clip(n.title, 30)}</text> : null}
              {plus ? (
                <g className="plus" transform={`translate(${plus.x},${plus.y})`} role="button" aria-label={`Add a step after ${n.id}, or drag to connect`}
                  onPointerDown={(e) => { e.stopPropagation(); hooks!.start(n.id, e); }} onClick={(e) => e.stopPropagation()}>
                  <circle r={9} /><path d="M-3.5,0H3.5M0,-3.5V3.5" />
                </g>
              ) : null}
              {hooks?.arm && !n.missing ? (
                <g className="x" transform={`translate(${n.w / 2},${-n.h / 2})`} role="button" aria-label={`Remove ${n.id}`}
                  onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); hooks.arm!(n.id); }}>
                  <circle r={8} /><path d="M-3,-3L3,3M3,-3L-3,3" />
                </g>
              ) : null}
              {times > 1 ? (
                <g className="nv" transform={`translate(${n.w / 2 - 4},${-n.h / 2})`}>
                  <rect x={-13} y={-8} width={26} height={16} rx={8} /><text y={3.8} textAnchor="middle">{times}×</text>
                </g>
              ) : null}
            </g>
          );
        })}
      </g>
      {hooks?.line ? <path className="drag-line" d={`M${hooks.line.x1},${hooks.line.y1} L${hooks.line.x2},${hooks.line.y2}`} markerEnd={`url(#${uid}-hl)`} /> : null}
      {dock && dockLabel && v.current ? (
        <g className="dlab" transform={`translate(${dockLabel.x},${dockLabel.y})`} aria-hidden="true">
          <rect className="dlb" x={-dockLabel.w / 2} y={-dockLabel.h / 2} width={dockLabel.w} height={dockLabel.h} rx={dockLabel.r} />
          <text y={dockLabel.fs * 0.36} textAnchor="middle" fontSize={dockLabel.fs}>{v.current}</text>
        </g>
      ) : null}
    </>
  );
}

// ---------- inline: fills its frame's width, height from the graph; pans sideways instead of shrinking type ----------

const DOCK_INSET = 16, DOCK_BAND = 24, DOCK_BLOCK = 12, DOCK_FS = 11;
// Where the drawing and the current step's name go in a dock `bw` px wide. All geometry in screen px unless noted.
function dockLayout(l: Layout, bw: number, current?: string) {
  const k = Math.min((bw - 2 * DOCK_INSET) / l.w, (240 - 2 * DOCK_INSET - DOCK_BAND) / l.h, 1);
  const dh = l.h * k, h = Math.round(Math.max(104, dh + 2 * DOCK_INSET + DOCK_BAND));
  const free = h - 2 * DOCK_INSET - DOCK_BAND - dh; // extra height, split evenly
  const n = l.nodes.find((x) => x.id === current);
  let side: "above" | "below" = "above", label: DockLabel | null = null;
  if (n) {
    const tw = current!.length * DOCK_FS * 0.6 + 12, th = 18;
    const bs = Math.max(n.h * k, DOCK_BLOCK);
    const blocks = l.nodes.map((o) => { const w = Math.max(o.w * k, o.id === n.id ? DOCK_BLOCK : 0), hh = Math.max(o.h * k, o.id === n.id ? DOCK_BLOCK : 0); return { x: o.x * k - w / 2 - 3, y: o.y * k - hh / 2 - 3, w: w + 6, h: hh + 6 }; });
    const fits = (c: { x: number; y: number }, s: "above" | "below") => {
      const b = { x: c.x - tw / 2, y: c.y - th / 2, w: tw, h: th };
      const top = s === "above" ? -DOCK_BAND : 0, bottom = dh + (s === "below" ? DOCK_BAND : 0);
      return b.x >= 0 && b.x + b.w <= l.w * k && b.y >= top && b.y + b.h <= bottom && !blocks.some((o) => overlaps(b, o));
    };
    const cands: { c: { x: number; y: number }; s: "above" | "below" }[] = [];
    for (const s of ["above", "below"] as const) {
      const y = n.y * k + (s === "above" ? -1 : 1) * (bs / 2 + 4 + th / 2);
      for (const dx of [0, -tw / 3, tw / 3, -tw / 2, tw / 2, -tw, tw]) {
        const x = Math.min(Math.max(n.x * k + dx, tw / 2), l.w * k - tw / 2);
        cands.push({ c: { x, y }, s });
      }
    }
    const pick = cands.find((c) => fits(c.c, c.s)) ?? cands[0];
    side = pick.s;
    label = { x: pick.c.x / k, y: pick.c.y / k, w: tw / k, h: th / k, fs: DOCK_FS / k, r: 6 / k };
  }
  const oy = DOCK_INSET + (side === "above" ? DOCK_BAND : 0) + free / 2;
  return { k, h, oy, label };
}

// Docking: when the run page scrolls past the hero, the same drawing travels into the facts column and stays there.
// `slot` is the place in the column (its `.dock-box` is the target); `on` says whether it should be docked now.
export interface Dock { on: boolean; slot: RefObject<HTMLElement | null> }
type Geo = { l: number; t: number; w: number; h: number; r: number; ox: number; oy: number; k: number };
const mixGeo = (a: Geo, b: Geo, e: number): Geo => Object.fromEntries(Object.keys(a).map((k) => [k, a[k as keyof Geo] + (b[k as keyof Geo] - a[k as keyof Geo]) * e])) as Geo;
const DOCK_MS = 440;
const easeOut = (p: number) => 1 - Math.pow(1 - p, 5); // close to --ease, cubic-bezier(.22, 1, .36, 1)
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export function MachineGraph({ machine, view, minH = 240, maxH = 520, onSelect, full, actions, edit, dock, onNodeHover, draw, whole }: {
  machine: Machine; view: View; minH?: number; maxH?: number; onSelect?: (s: string) => void; edit?: boolean;
  /** Always show the whole machine: shrink below reading size rather than pan. */
  whole?: boolean;
  full: { readout?: ReactNode; extra?: (close: () => void) => ReactNode; hud?: boolean }; actions?: ReactNode;
  dock?: Dock; onNodeHover?: (id: string | null) => void; draw?: Draw;
}) {
  const ref = useRef<HTMLDivElement>(null), svgRef = useRef<SVGSVGElement>(null);
  const [W, setW] = useState(0);
  const [open, setOpen] = useState(false);
  const uid = "g" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const duid = "d" + useId().replace(/[^a-zA-Z0-9]/g, "");
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth)); ro.observe(el); setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const { l, s } = useMemo(() => fit(machine, Math.max(W - 48, 200), maxH - 24, MAX_SCALE, false, whole ? 0 : MIN_SCALE), [machine, W, maxH, whole]);
  const contentH = l.h * s + 24, contentW = l.w * s + 48;
  const H = Math.max(minH, contentH > maxH && s <= MIN_SCALE ? contentH : Math.min(maxH, contentH));
  const svgW = Math.max(W, contentW), pans = contentW > W + 1;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches("input,textarea,select") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "f") { e.preventDefault(); setOpen(true); }
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, []);
  const vw = svgW / s, vh = H / s, x0 = -(vw - l.w) / 2, y0 = -(vh - l.h) / 2;
  // When the machine is wider than the frame, keep the step that matters in view.
  const focus = view.current ?? view.selected;
  useLayoutEffect(() => {
    const el = ref.current; if (!el || !pans) return;
    const n = l.nodes.find((x) => x.id === focus);
    if (n) el.scrollTo({ left: (n.x - x0) * s - W / 2, behavior: el.scrollLeft && !reduced() ? "smooth" : "auto" });
  }, [focus, pans, l, s, W, x0]);

  // ----- drawing by hand -----
  // Drag from a +: a line follows the pointer; drop on a step to connect (then name the event inline), drop anywhere else
  // or just click to add a new step after this one. Double-click a step to retitle it in place.
  const [line, setLine] = useState<{ from: string; x1: number; y1: number; x2: number; y2: number; moved: boolean } | null>(null);
  const [drop, setDrop] = useState<string | null>(null);
  const [ask, setAsk] = useState<{ kind: "event"; from: string; to: string; value: string } | { kind: "title"; id: string; value: string } | null>(null);
  const toUser = (cx: number, cy: number) => {
    const sv = svgRef.current; const ctm = sv?.getScreenCTM(); if (!sv || !ctm) return { x: 0, y: 0 };
    const p = new DOMPoint(cx, cy).matrixTransform(ctm.inverse()); return { x: p.x, y: p.y };
  };
  const nodeAt = (cx: number, cy: number) => (document.elementFromPoint(cx, cy)?.closest("[data-node]") as SVGElement | null)?.dataset.node ?? null;
  const hooks: DrawHooks | undefined = draw && edit ? {
    drop, line, armed: draw.armed, arm: draw.onArm,
    retitle: (id) => setAsk({ kind: "title", id, value: machine.states[id]?.title ?? id }),
    start: (from, e) => {
      e.preventDefault();
      const n = l.nodes.find((x) => x.id === from)!;
      const sx = l.dir === "LR" ? n.x + n.w / 2 + 15 : n.x, sy = l.dir === "LR" ? n.y : n.y + n.h / 2 + 15;
      const x0 = e.clientX, y0 = e.clientY;
      setLine({ from, x1: sx, y1: sy, x2: sx, y2: sy, moved: false });
      const move = (ev: PointerEvent) => {
        const moved = Math.hypot(ev.clientX - x0, ev.clientY - y0) > 5;
        const p = toUser(ev.clientX, ev.clientY);
        setLine((L) => L && { ...L, x2: p.x, y2: p.y, moved: L.moved || moved });
        const t = nodeAt(ev.clientX, ev.clientY); setDrop(t && t !== from ? t : null);
      };
      const up = (ev: PointerEvent) => {
        window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
        const moved = Math.hypot(ev.clientX - x0, ev.clientY - y0) > 5;
        const to = nodeAt(ev.clientX, ev.clientY);
        setLine(null); setDrop(null);
        if (moved && to && to !== from && machine.states[to]) setAsk({ kind: "event", from, to, value: draw.eventName?.(from, to) ?? to });
        else draw.onAdd(from);
      };
      window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    },
  } : undefined;
  // Where an inline field sits, in the scrolling view's coordinates.
  const at = (x: number, y: number) => ({ left: (x - x0) * s, top: (y - y0) * s });
  const askPos = (() => {
    if (!ask) return null;
    if (ask.kind === "title") { const n = l.nodes.find((x) => x.id === ask.id); return n ? { ...at(n.x, n.y), w: Math.max(n.w * s, 160) } : null; }
    const a = l.nodes.find((x) => x.id === ask.from), b = l.nodes.find((x) => x.id === ask.to);
    return a && b ? { ...at((a.x + b.x) / 2, (a.y + b.y) / 2), w: 180 } : null;
  })();
  const armedPos = (() => {
    if (!draw?.armed || !edit) return null;
    const n = l.nodes.find((x) => x.id === draw.armed); return n ? at(n.x, n.y + n.h / 2 + 10) : null;
  })();
  const commit = () => {
    if (!ask || !draw) return;
    const v = ask.value.trim();
    if (v) { if (ask.kind === "event") draw.onConnect(ask.from, ask.to, v); else draw.onRetitle(ask.id, v); }
    setAsk(null);
  };

  // ----- docking -----
  const [phase, setPhase] = useState<"hero" | "going" | "docked" | "back">("hero");
  const win = useRef<HTMLDivElement>(null), fsvg = useRef<SVGSVGElement>(null);
  const cur = useRef<Geo | null>(null);
  const geo = useRef({ x0, y0, s, l }); geo.current = { x0, y0, s, l };
  // The dock's fit: a 16px inset on every side, a band for the current step's name above or below the drawing (whichever
  // side lets the name touch no block), and the box as tall as that needs, within 104 to 240px.
  const [slotW, setSlotW] = useState(0);
  // Passive effects: the slot lives later in the tree, so its ref is attached only after this component's layout effects.
  useEffect(() => {
    const slot = dock?.slot.current; if (!slot) return;
    const ro = new ResizeObserver(() => setSlotW(slot.getBoundingClientRect().width)); ro.observe(slot); setSlotW(slot.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, [dock?.slot]);
  const dockFit = useMemo(() => dockLayout(l, slotW || 380, view.current), [l, slotW, view.current]);
  const dockH = useRef(dockFit.h); dockH.current = dockFit.h;
  const dockFitRef = useRef(dockFit); dockFitRef.current = dockFit;
  useEffect(() => { dock?.slot.current?.style.setProperty("--dock-h", `${dockFit.h}px`); }, [dock?.slot, dockFit.h]);
  const heroGeo = useCallback((): Geo | null => {
    const gv = ref.current, sv = svgRef.current; if (!gv || !sv) return null;
    const g = gv.getBoundingClientRect(), r = sv.getBoundingClientRect(), { x0, y0, s } = geo.current;
    return { l: g.left, t: g.top, w: g.width, h: g.height, r: 0, ox: r.left - x0 * s, oy: r.top - y0 * s, k: s };
  }, []);
  const dockGeo = useCallback((): Geo | null => {
    const box = dock?.slot.current?.querySelector(".dock-box"); if (!box) return null;
    const b = box.getBoundingClientRect(), f = dockFitRef.current, { l } = geo.current;
    return { l: b.left, t: b.top, w: b.width, h: f.h, r: 16, ox: b.left + (b.width - l.w * f.k) / 2, oy: b.top + f.oy, k: f.k };
  }, [dock?.slot]);
  const apply = useCallback((g: Geo) => {
    const w = win.current, f = fsvg.current; if (!w || !f) return;
    cur.current = g;
    Object.assign(w.style, { left: `${g.l}px`, top: `${g.t}px`, width: `${g.w}px`, height: `${g.h}px`, borderRadius: `${g.r}px` });
    f.style.transform = `translate(${g.ox - g.l}px, ${g.oy - g.t}px) scale(${g.k})`;
    f.style.setProperty("--k", String(g.k));
  }, []);
  useEffect(() => {
    if (!dock) return;
    if (dock.on && (phase === "hero" || phase === "back")) setPhase("going");
    else if (!dock.on && (phase === "docked" || phase === "going")) setPhase("back");
  }, [dock?.on, phase]);
  // The travel: one drawing, moved from the hero's rect to the dock's (and back) by translate and scale, read live each frame
  // so scrolling during the move still lands it. Under reduced motion it cross-fades in place instead.
  useLayoutEffect(() => {
    if (phase !== "going" && phase !== "back") return;
    const going = phase === "going";
    const target = going ? dockGeo : heroGeo;
    const from = cur.current ?? (going ? heroGeo() : dockGeo());
    if (!from) { setPhase(going ? "docked" : "hero"); return; }
    if (reduced()) {
      const t = target(); if (t) apply(t);
      win.current?.classList.toggle("fading", !going);
      const id = setTimeout(() => { if (!going) cur.current = null; setPhase(going ? "docked" : "hero"); }, 320);
      return () => clearTimeout(id);
    }
    apply(from);
    let raf = 0; const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / DOCK_MS), to = target();
      if (to) apply(mixGeo(from, to, easeOut(p)));
      if (p < 1) raf = requestAnimationFrame(step);
      else { if (!going) cur.current = null; setPhase(going ? "docked" : "hero"); }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [phase]);
  // Docked: follow the column (it is sticky, but it scrolls into place first and leaves at the end of the page).
  useEffect(() => {
    if (phase !== "docked") return;
    let raf = 0;
    const follow = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { const g = dockGeo(); if (g) apply(g); }); };
    follow();
    window.addEventListener("scroll", follow, { passive: true }); window.addEventListener("resize", follow);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("scroll", follow); window.removeEventListener("resize", follow); };
  }, [phase, dockGeo, apply]);
  const away = phase !== "hero";

  // Pointing at a step elsewhere on the page: bring it into the hero's view if the hero pans (never scrolls the page).
  const hlId = view.hl?.node ?? l.edges.find((e) => e.key === view.hl?.edge)?.to;
  useEffect(() => {
    const el = ref.current; if (!el || !pans || away || !hlId) return;
    const n = l.nodes.find((x) => x.id === hlId); if (!n) return;
    const x = (n.x - x0) * s;
    if (x < el.scrollLeft + 60 || x > el.scrollLeft + el.clientWidth - 60) el.scrollTo({ left: x - el.clientWidth / 2, behavior: reduced() ? "auto" : "smooth" });
  }, [hlId, pans, away]);

  return (
    <>
      <div className="tools">
        {actions}
        <button className="pill sm ghost" onClick={() => setOpen(true)} title="Full screen (f)">
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M1 4.5V1h3.5M7.5 1H11v3.5M11 7.5V11H7.5M4.5 11H1V7.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Full screen
        </button>
      </div>
      <div className={`gview${pans ? " pans" : ""}${away ? " away" : ""}`} ref={ref} style={{ height: H }}>
        {W ? (
          <svg ref={svgRef} width={svgW} height={H} viewBox={`${x0} ${y0} ${vw} ${vh}`} className={`graph${onSelect ? " pick" : ""}${edit ? " edit" : ""}`}>
            <Drawing l={l} v={view} onSelect={onSelect} uid={uid} edit={edit} onHover={onNodeHover} hooks={hooks} />
          </svg>
        ) : null}
        {armedPos && draw ? (
          <div className="ask-inline confirm" style={{ left: armedPos.left, top: armedPos.top }} role="alertdialog" aria-label={`Remove ${draw.armed}?`}>
            <button className="pill sm danger" autoFocus onClick={() => draw.onRemove?.(draw.armed!)}>Remove <code>{draw.armed}</code></button>
            <button className="pill sm quiet" onClick={() => draw.onKeep?.()}>Keep it</button>
          </div>
        ) : null}
        {ask && askPos ? (
          <div className="ask-inline" style={{ left: askPos.left, top: askPos.top, width: askPos.w }}>
            {ask.kind === "event" ? <span className="label">Event from <code>{ask.from}</code> to <code>{ask.to}</code></span> : <span className="label">Title of <code>{ask.id}</code></span>}
            <input autoFocus value={ask.value} spellCheck={false} className={ask.kind === "event" ? "mono" : ""}
              onChange={(e) => setAsk({ ...ask, value: e.target.value } as typeof ask)} onBlur={() => setAsk(null)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setAsk(null); } }}
              onFocus={(e) => e.currentTarget.select()} />
          </div>
        ) : null}
      </div>
      {dock && away ? createPortal(
        <div className={`dockfloat${phase === "docked" ? " docked" : ""}${phase === "going" && reduced() ? " fadein" : ""}`} ref={win} data-tone={view.tone}
          role="button" tabIndex={phase === "docked" ? 0 : -1} aria-label="The machine. Open full screen" title="Open full screen (f)"
          onClick={() => setOpen(true)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(true); } }}>
          <svg ref={fsvg} className="graph dockg" width={l.w} height={l.h} viewBox={`0 0 ${l.w} ${l.h}`}>
            <Drawing l={l} v={view} uid={duid} dock dockLabel={dockFit.label} onHover={onNodeHover} />
          </svg>
        </div>, document.body) : null}
      {open ? <FullGraph machine={machine} view={view} edit={edit} onSelect={onSelect} onClose={() => setOpen(false)} readout={full.readout} extra={full.extra} hud={full.hud} /> : null}
    </>
  );
}

// ---------- full screen: the whole window is the machine; pan, zoom, Escape leaves ----------

function FullGraph({ machine, view, edit, onSelect, onClose, readout, extra, hud }: { machine: Machine; view: View; edit?: boolean; onSelect?: (s: string) => void; onClose: () => void; readout?: ReactNode; extra?: (close: () => void) => ReactNode; hud?: boolean }) {
  const l = useMemo(() => fit(machine, innerWidth - 120, innerHeight - 220, 4, true).l, [machine]);
  const uid = "f" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const box = useRef<HTMLDivElement>(null), close = useRef<HTMLButtonElement>(null);
  const fitT = useCallback(() => {
    const W = innerWidth, H = innerHeight; const k = Math.min((W - 120) / l.w, (H - 170) / l.h, 1.6);
    return { k, x: (W - l.w * k) / 2, y: (H - l.h * k) / 2 + 4 };
  }, [l]);
  // Open at a zoom you can read. If the whole machine would be smaller than that, start on the current step, but never
  // leave an empty side while the drawing runs off the other: on each axis, centre what fits and clamp what does not.
  const startT = useCallback(() => {
    const f = fitT(); if (f.k >= 0.85) return f;
    const k = 0.95, n = l.nodes.find((x) => x.id === view.current) ?? l.nodes.find((x) => x.id === view.selected);
    const cx = n ? n.x : l.w / 2, cy = n ? n.y : l.h / 2;
    const axis = (size: number, view0: number, view1: number, c: number) => {
      const avail = view1 - view0;
      if (size <= avail) return view0 + (avail - size) / 2;
      return Math.min(view0, Math.max(view1 - size, (view0 + view1) / 2 - c));
    };
    return { k, x: axis(l.w * k, 60, innerWidth - 60, cx * k), y: axis(l.h * k, 90, innerHeight - 80, cy * k) };
  }, [fitT, l, view.current, view.selected]);
  const [t, setT] = useState(startT);
  const [ease, setEase] = useState(false);
  const zoom = useCallback((f: number, px = innerWidth / 2, py = innerHeight / 2, smooth = true) => {
    setEase(smooth);
    setT((t) => { const k = Math.min(4, Math.max(0.15, t.k * f)); return { k, x: px - (px - t.x) * (k / t.k), y: py - (py - t.y) * (k / t.k) }; });
  }, []);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches("input,textarea,select")) return;
      const k = e.key;
      if (k === "Escape" || k === "f") { onClose(); }
      else if (k === "+" || k === "=") zoom(1.25);
      else if (k === "-" || k === "_") zoom(0.8);
      else if (k === "0") { setEase(true); setT(fitT()); }
      else return;
      e.preventDefault(); e.stopImmediatePropagation();
    };
    window.addEventListener("keydown", onKey, true);
    const el = box.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) zoom(Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY, false);
      else { setEase(false); setT((t) => ({ ...t, x: t.x - e.deltaX, y: t.y - e.deltaY })); }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    const onResize = () => { setEase(false); setT(fitT()); };
    window.addEventListener("resize", onResize);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey, true); el.removeEventListener("wheel", onWheel); window.removeEventListener("resize", onResize); document.body.style.overflow = ""; before?.focus?.(); };
  }, [onClose, zoom, fitT]);
  const drag = useRef<{ x: number; y: number } | null>(null);
  return createPortal(
    <div className={`full${hud ? " hud-on" : ""}`} data-tone={view.tone} ref={box} role="dialog" aria-modal="true" aria-label="Machine, full screen">
      <div className="hud" data-tone={view.tone} aria-hidden="true"><i className="c tl" /><i className="c tr" /><i className="c bl" /><i className="c br" /></div>
      <svg className={`graph canvas${edit ? " edit" : ""}${onSelect ? " pick" : ""}${drag.current ? " grabbing" : ""}`} width="100%" height="100%"
        onPointerDown={(e) => { if ((e.target as Element).closest("[data-node]")) return; drag.current = { x: e.clientX, y: e.clientY }; (e.currentTarget as Element).setPointerCapture(e.pointerId); setEase(false); }}
        onPointerMove={(e) => { const d = drag.current; if (!d) return; const dx = e.clientX - d.x, dy = e.clientY - d.y; drag.current = { x: e.clientX, y: e.clientY }; setT((t) => ({ ...t, x: t.x + dx, y: t.y + dy })); }}
        onPointerUp={() => { drag.current = null; }}>
        <g className={ease ? "ease" : ""} style={{ transform: `translate(${t.x}px,${t.y}px) scale(${t.k})` }}>
          <Drawing l={l} v={view} detail edit={edit} onSelect={onSelect ? (s) => { onSelect(s); onClose(); } : undefined} uid={uid} />
        </g>
      </svg>
      <div className="full-top">
        <div className="full-title">{readout}</div>
        <div className="full-tools">
          <div className="pills">
            <button onClick={() => zoom(0.8)} aria-label="Zoom out">−</button>
            <button className="pct" onClick={() => { setEase(true); setT(fitT()); }} aria-label="Fit to screen" title="Fit (0)">{Math.round(t.k * 100)}%</button>
            <button onClick={() => zoom(1.25)} aria-label="Zoom in">+</button>
          </div>
          <button className="pill sm ghost" ref={close} onClick={onClose}>Close</button>
        </div>
      </div>
      <div className="full-bottom">
        <div className="legend">
          {edit ? <>
            <span><svg width="26" height="8" aria-hidden="true"><path d="M1 4H25" className="lg out" /></svg>ways out of the selected state</span>
            <span><svg width="26" height="8" aria-hidden="true"><path d="M1 4H25" className="lg edit" /></svg>an event</span>
            <span><svg width="26" height="8" aria-hidden="true"><path d="M1 4H25" className="lg edit human" /></svg>a person decides</span>
          </> : <>
            <span><svg width="26" height="8" aria-hidden="true"><path d="M1 4H25" className="lg walked" /></svg>walked</span>
            <span><svg width="26" height="8" aria-hidden="true"><path d="M1 4H25" className="lg idle" /></svg>not taken</span>
            <span><svg width="26" height="8" aria-hidden="true"><path d="M1 4H25" className="lg human" /></svg>a person decides</span>
          </>}
          <span className="dim">drag to pan · pinch or ⌘ scroll to zoom · 0 fits</span>
        </div>
        {extra?.(onClose)}
      </div>
    </div>,
    document.body,
  );
}

// ---------- thumb: the machine's shape as blocks, for list rows ----------
// Blocks keep one size on every row (8px, a live step 10px); a big machine packs its ranks closer instead of shrinking its blocks.

const TB = 7, TL = 10;
export function Thumb({ machine, lit, w = 150, h = 52 }: { machine: Machine; lit?: Map<string, Tone>; w?: number; h?: number }) {
  const l = useMemo(() => {
    const g = new dagre.graphlib.Graph().setGraph({ rankdir: "LR", nodesep: 5, ranksep: 12, marginx: 0, marginy: 0, ranker: "longest-path" }).setDefaultEdgeLabel(() => ({}));
    for (const id of Object.keys(machine.states)) g.setNode(id, { width: TB, height: TB });
    for (const [from, s] of Object.entries(machine.states)) for (const t of Object.values(s.on ?? {})) if (machine.states[t.to] && t.to !== from) g.setEdge(from, t.to);
    dagre.layout(g);
    const gi = g.graph() as { width?: number; height?: number };
    return { g, w: gi.width ?? TB, h: gi.height ?? TB };
  }, [machine]);
  // squeeze positions (not blocks) to fit; anchor the drawing to the right edge of its column
  const sx = Math.min(1, (w - TL - 2) / Math.max(1, l.w - TB)), sy = Math.min(1, (h - TL - 2) / Math.max(1, l.h - TB));
  const dw = (l.w - TB) * sx, dh = (l.h - TB) * sy;
  const ox = w - TL / 2 - 1 - dw, oy = (h - dh) / 2;
  const pos = (id: string) => { const n = l.g.node(id) as P; return { x: ox + (n.x - TB / 2) * sx, y: oy + (n.y - TB / 2) * sy }; };
  return (
    <svg className="thumb" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      {l.g.edges().map((e) => { const a = pos(e.v), b = pos(e.w); if (b.x <= a.x) return null; // forward edges only: the shape, not the loops
        return <path key={e.v + e.w} d={`M${a.x},${a.y} C${(a.x + b.x) / 2},${a.y} ${(a.x + b.x) / 2},${b.y} ${b.x},${b.y}`} />; })}
      {l.g.nodes().map((id) => { const p = pos(id); const t = lit?.get(id); const k = machine.states[id]?.kind; const s = t ? TL : TB;
        return <rect key={id} className={t ? `on t-${t}` : k === "final" ? "fin" : ""} x={p.x - s / 2} y={p.y - s / 2} width={s} height={s} rx={k === "final" ? s / 2 : s * 0.28} />; })}
    </svg>
  );
}
