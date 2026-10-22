// The status language. A run is drawn the way the mark draws the machine: blocks on a path, one lit.
// Graphite blocks are the steps the run walked, in order; the lit block is where it is now, in the colour
// of what it is doing; hollow blocks are the shortest way still ahead to a good end. No dots, no pills.
import type { Machine, Run } from "./api.ts";
import { ahead, walk } from "./api.ts";

const B = 8, GAP = 3, LIT = 12, AHEAD_W = 4 * (B + GAP);

// With `width`, the lit block sits at the same x in every row, so a list's statuses line up in one column:
// the walk trails off to the left, what is ahead to the right.
export function PathGlyph({ run, machine, width }: { run: Pick<Run, "status" | "state" | "history">; machine?: Machine; width?: number }) {
  const { states } = walk(run.history);
  const live = run.status === "running" || run.status === "waiting" || run.status === "blocked";
  const AHEAD = 4;
  const litX = width ? width - AHEAD * (B + GAP) - LIT - 1 : 0;
  const max = width ? Math.floor((litX - 1) / (B + GAP)) : 11;
  const before = states.slice(0, -1);
  const cut = before.length > max ? before.length - max + 1 : 0;
  const rest = live ? ahead(machine, run.state).slice(0, AHEAD) : [];
  const items: { cls: string; x: number; size: number; title: string }[] = [];
  let x = width ? litX - (before.length - cut) * (B + GAP) : cut ? 11 : 1;
  for (const s of before.slice(cut)) { items.push({ cls: "w", x, size: B, title: s }); x += B + GAP; }
  items.push({ cls: "lit", x, size: LIT, title: run.state }); x += LIT + GAP;
  for (const s of rest) { items.push({ cls: "a", x, size: B, title: s }); x += B + GAP; }
  const w = width ?? x - GAP + 1, h = LIT + 2;
  const moreX = width ? litX - (before.length - cut) * (B + GAP) - 10 : 1;
  return (
    <svg className={`glyph t-${run.status}`} width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${run.status} at ${run.state}, step ${states.length}`}>
      {cut ? [0, 1, 2].map((i) => <rect key={i} className="more" x={moreX + i * 3} y={h / 2 - 1} width={2} height={2} rx={1} />) : null}
      {items.map((it, i) => <rect key={i} className={it.cls} x={it.x} y={(h - it.size) / 2} width={it.size} height={it.size} rx={it.size / 3.6}><title>{it.title}</title></rect>)}
    </svg>
  );
}

// One lit block, for counts, step headers, checks and status lines. No tone: a graphite block. Hollow: an outline.
export const Block = ({ tone, size = 10, hollow }: { tone?: string; size?: number; hollow?: boolean }) => (
  <svg className={`block t-${tone ?? "none"}${hollow ? " hollow" : ""}`} width={size} height={size} viewBox="0 0 10 10" aria-hidden="true"><rect x="0.65" y="0.65" width="8.7" height="8.7" rx="2.6" /></svg>
);

// While a run's history loads, or where there is nothing yet: a few hollow blocks on the path.
export const EmptyPath = ({ n = 4, width }: { n?: number; width?: number }) => {
  const w = width ?? n * (B + GAP) - GAP + 2, x0 = width ? width - AHEAD_W - LIT - 1 : 1;
  return (
    <svg className="glyph wait" width={w} height={LIT + 2} viewBox={`0 0 ${w} ${LIT + 2}`} aria-hidden="true">
      {Array.from({ length: n }, (_, i) => <rect key={i} className="a" x={x0 + i * (B + GAP)} y={(LIT + 2 - B) / 2} width={B} height={B} rx={B / 3.6} />)}
    </svg>
  );
};

// Progress as ten blocks, the same vocabulary as the path.
export const Progress = ({ value }: { value: number }) => (
  <svg className="progress" width={10 * 9 - 3} height={6} aria-label={`${value}%`}>
    {Array.from({ length: 10 }, (_, i) => <rect key={i} x={i * 9} y={0} width={6} height={6} rx={1.6} className={i < Math.round(value / 10) ? "on" : ""} />)}
  </svg>
);

// One name per status, used by the readout, the subtitle, the rows and the nav.
export const statusWord: Record<Run["status"], string> = { running: "Running", waiting: "Your decision", blocked: "Blocked", succeeded: "Succeeded", failed: "Failed", cancelled: "Cancelled" };
/** "1 needs you" / "3 need you". */
export const needsYouPhrase = (n: number) => `${n} need${n === 1 ? "s" : ""} you`;
