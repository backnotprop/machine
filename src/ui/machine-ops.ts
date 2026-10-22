// Edits the canvas gestures make, as pure functions on a machine: add a step after another, connect two steps,
// retitle one, remove one. Shared by the editor and the describe stage, so a gesture means the same thing in both.
import type { Machine } from "./api.ts";

const freeId = (taken: Record<string, unknown>, base: string) => { if (!taken[base]) return base; let n = 2; while (taken[`${base}_${n}`]) n++; return `${base}_${n}`; };
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "next";

/** A new task after `from`, entered by an event named for leaving `from` ("done", or "done_2" if taken). Returns the new id. */
export function addAfter(m: Machine, from: string): { m: Machine; id: string; event: string } {
  const c = structuredClone(m);
  const id = freeId(c.states, "step");
  const src = c.states[from];
  const event = freeId(src.on ?? {}, "done");
  c.states[id] = { kind: "task", title: "New step", instructions: "", on: {} };
  src.on = { ...(src.on ?? {}), [event]: { to: id, ...(src.kind === "wait" ? { actor: "human" as const } : {}) } };
  return { m: c, id, event };
}

/** The default name for an event from `from` to `to`: the target's id, unless `from` already uses it. */
export const eventNameFor = (m: Machine, from: string, to: string) => freeId(m.states[from]?.on ?? {}, slug(to));

/** Connect `from` to `to` with `event` (an event of a wait state is fired by a person). */
export function connect(m: Machine, from: string, to: string, event: string): Machine {
  const c = structuredClone(m);
  const src = c.states[from]; if (!src) return m;
  const name = slug(event);
  src.on = { ...(src.on ?? {}), [name]: { to, ...(src.kind === "wait" ? { actor: "human" as const } : {}) } };
  return c;
}

export function retitle(m: Machine, id: string, title: string): Machine {
  const c = structuredClone(m);
  if (c.states[id]) c.states[id].title = title;
  return c;
}

/** Remove a state and every event that led to it. Returns the events removed, so the editor can list them. */
export function removeState(m: Machine, id: string): { m: Machine; removed: string[] } {
  const c = structuredClone(m);
  delete c.states[id];
  const removed: string[] = [];
  for (const [sid, s] of Object.entries(c.states)) for (const [ev, t] of Object.entries(s.on ?? {})) if (t.to === id) { delete s.on![ev]; removed.push(`Removed event \`${ev}\` from \`${sid}\`: it led to \`${id}\``); }
  if (c.initial === id) c.initial = Object.keys(c.states)[0] ?? "";
  return { m: c, removed };
}

/** A draft from an agent may be partial; make sure the drawing has what it needs. */
export function drawable(d: unknown): Machine | null {
  if (!d || typeof d !== "object") return null;
  const m = d as Machine;
  if (!m.states || typeof m.states !== "object" || !Object.keys(m.states).length) return null;
  const states: Machine["states"] = {};
  for (const [id, s] of Object.entries(m.states)) {
    if (!s || typeof s !== "object") continue;
    const on: Record<string, { to: string; actor?: "agent" | "human" }> = {};
    for (const [ev, t] of Object.entries((s as any).on ?? {})) if (t && typeof t === "object" && typeof (t as any).to === "string") on[ev] = t as any;
    states[id] = { ...(s as any), kind: (s as any).kind ?? "task", title: (s as any).title ?? id, on };
  }
  return { ...m, id: m.id ?? "new-machine", name: m.name ?? "New machine", states } as Machine;
}
