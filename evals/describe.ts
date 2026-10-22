#!/usr/bin/env bun
// M5 check, "describe it": a real ACP agent drafts a machine from a plain description through the authoring API,
// and every draft arrives over /events. We assert on the drafts the server stored, not on what the agent says.
//
//   bun evals/describe.ts            the default agent (claude if installed); falls back to the next one that starts
//   bun evals/describe.ts gemini     one agent: claude | gemini | opencode | codex
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Machine } from "../src/engine/engine.ts";
import { checkDraft } from "../src/server/author.ts";

const DESCRIBE = "A process to ship a bug fix: reproduce it, write the fix, prove it with the test suite, open a PR, then a person reviews and approves or asks for changes; merged is the good end, abandoned if they reject.";
const REVISE = "Add a step before the PR where the agent updates the changelog.";
const TURN_MS = 4 * 60_000;

const root = resolve(import.meta.dir, "..");
const only = process.argv[2];
const home = mkdtempSync(join(tmpdir(), "machine-describe-home-"));
const port = Number(process.env.EVAL_PORT ?? 7500 + Math.floor(Math.random() * 400));
const base = `http://127.0.0.1:${port}`;
const server = Bun.spawn(["bun", join(root, "src/server/main.ts")], { env: { ...process.env, MACHINE_HOME: home, PORT: String(port) }, stdout: "ignore", stderr: "inherit" });
for (let t = Date.now(); ; await Bun.sleep(100)) {
  try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { }
  if (Date.now() - t > 8000) throw new Error(`server did not come up at ${base}`);
}

// The UI's view: every author.* event from /events, in order.
type Ev = { type: string; data: any; at: number };
const events: Ev[] = [];
(async () => {
  const reader = (await fetch(`${base}/events`)).body!.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  for (; ;) {
    const { value, done } = await reader.read(); if (done) return;
    buf += value;
    for (let i = buf.indexOf("\n\n"); i >= 0; i = buf.indexOf("\n\n")) {
      const block = buf.slice(0, i); buf = buf.slice(i + 2);
      let type = "", data = "";
      for (const l of block.split("\n")) { if (l.startsWith("event:")) type = l.slice(6).trim(); else if (l.startsWith("data:")) data += l.slice(5).trim(); }
      if (type.startsWith("author.")) events.push({ type, data: JSON.parse(data), at: Date.now() });
    }
  }
})();

const post = (path: string, body: unknown) => fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

// Pick the agent: the one asked for, else the default, falling back down the list if one fails to start.
const list: { id: string; available: boolean; default: boolean }[] = await (await fetch(`${base}/api/author/agents`)).json();
const order = only ? [only] : list.filter((a) => a.available).sort((a, b) => Number(b.default) - Number(a.default)).map((a) => a.id);
let session = "", agent = "";
const startFailures: string[] = [];
for (const id of order) {
  const r = await post("/api/author/sessions", { agent: id });
  const b = await r.json();
  if (r.ok) { session = b.id; agent = id; break; }
  startFailures.push(`${id}: ${b.error}`); console.log(`could not start ${id}: ${b.error}`);
}
if (!session) { server.kill(); console.log("no agent started"); process.exit(1); }
console.log(`agent ${agent}${startFailures.length ? ` (fallback; ${startFailures.join("; ")})` : list.find((a) => a.id === agent)?.default ? " (default)" : ""} · session ${session} · ${base}`);

async function turn(text: string) {
  const from = events.length, t0 = Date.now();
  const r = await post(`/api/author/sessions/${session}/prompt`, { text });
  if (!r.ok) return { end: { status: "error", message: (await r.json()).error }, evs: [] as Ev[], seconds: 0 };
  while (Date.now() - t0 < TURN_MS) {
    const evs = events.slice(from).filter((e) => e.data.session === session);
    const end = evs.find((e) => e.type === "author.turn" && e.data.status !== "running");
    if (end) return { end: end.data as { status: string; message?: string }, evs, seconds: (Date.now() - t0) / 1000 };
    await Bun.sleep(250);
  }
  await post(`/api/author/sessions/${session}/cancel`, {});
  return { end: { status: "timeout", message: `no author.turn done within ${TURN_MS / 1000}s` }, evs: events.slice(from), seconds: TURN_MS / 1000 };
}

const states = (m: Machine) => Object.entries(m.states ?? {});
const label = (m: Machine, id: string) => `${id} ${m.states[id]?.title ?? ""}`;
type Result = { name: string; ok: boolean; moves: number; seconds: number; states: number; problems: string; notes: string[] };
const results: Result[] = [];

function judge(name: string, t: Awaited<ReturnType<typeof turn>>, extra: (m: Machine, notes: string[]) => void): Machine | null {
  const drafts = t.evs.filter((e) => e.type === "author.draft");
  const notes: string[] = [];
  if (t.end.status !== "done") notes.push(`turn ended ${t.end.status}${t.end.message ? `: ${t.end.message}` : ""}`);
  if (!drafts.length) notes.push("no draft_machine call in this turn");
  const m = drafts.at(-1)?.data.machine as Machine | undefined;
  if (m) {
    const last = drafts.at(-1)!.data.problems as string[];
    const again = checkDraft(m);
    if (last.length || again.length) notes.push(`final draft has problems: ${[...new Set([...last, ...again])].join("; ")}`);
    extra(m, notes);
  }
  results.push({ name, ok: notes.length === 0, moves: drafts.length, seconds: Math.round(t.seconds * 10) / 10, states: m ? states(m).length : 0,
    problems: drafts.map((d) => d.data.problems.length).join(",") || "-", notes });
  return m ?? null;
}

// Turn 1: the description.
const t1 = await turn(DESCRIBE);
const m1 = judge("describe", t1, (m, notes) => {
  const all = states(m);
  if (all.length < 5) notes.push(`only ${all.length} states`);
  const waits = all.filter(([, s]) => s.kind === "wait");
  if (waits.length !== 1) notes.push(`expected exactly one wait state, found ${waits.length} (${waits.map(([id]) => id).join(", ")})`);
  for (const [id, s] of waits) for (const [ev, t] of Object.entries(s.on ?? {})) if (t.actor !== "human") notes.push(`wait ${id} event ${ev} is not actor human`);
  if (!all.some(([, s]) => s.kind === "final" && s.outcome === "success")) notes.push("no success final");
  if (!all.some(([, s]) => s.kind === "final" && s.outcome === "failure")) notes.push("no failure final");
  if (!all.some(([, s]) => s.kind === "task" && /test/i.test(s.instructions ?? ""))) notes.push("no task state whose instructions mention tests");
});

// Turn 2: a revision, if the first turn left a draft to revise.
if (m1) {
  const t2 = await turn(REVISE);
  judge("revise", t2, (m, notes) => {
    const before = new Set(Object.keys(m1.states)), after = Object.keys(m.states);
    if (after.length !== before.size + 1) notes.push(`expected ${before.size + 1} states, found ${after.length}`);
    const added = after.filter((id) => !before.has(id));
    if (added.length !== 1) { notes.push(`expected one new state, found ${added.join(", ") || "none"}`); return; }
    const n = added[0];
    const preds = states(m).filter(([, s]) => Object.values(s.on ?? {}).some((t) => t.to === n)).map(([id]) => id);
    const succs = Object.values(m.states[n].on ?? {}).map((t) => t.to);
    const verifyLike = (id: string) => /verif|test|prove|suite|check/i.test(label(m, id));
    const prLike = (id: string) => /(^|[_\s])pr($|[_\s])|pull request/i.test(label(m, id));
    if (!preds.some(verifyLike)) notes.push(`new state ${n} is entered from ${preds.join(", ") || "nothing"}, none verify-like`);
    if (!succs.some(prLike)) notes.push(`new state ${n} leads to ${succs.join(", ") || "nothing"}, none PR-like`);
    if (!/changelog/i.test(`${label(m, n)} ${m.states[n].instructions ?? ""}`)) notes.push(`new state ${n} does not mention the changelog`);
    console.log(`new state: ${preds.join("/")} → ${n} → ${succs.join("/")}`);
  });
}

const view = await (await fetch(`${base}/api/author/sessions/${session}`)).json();
writeFileSync(join(root, "evals/last-describe.json"), JSON.stringify({ agent, session, home, results, view, events: events.filter((e) => e.type !== "author.message") }, null, 2));
await fetch(`${base}/api/author/sessions/${session}`, { method: "DELETE" });
server.kill();

const pad = (s: string | number, n: number, r = false) => (r ? String(s).padStart(n) : String(s).padEnd(n));
console.log(`\n${pad("turn", 10)} ${pad("ok", 4)} ${pad("agent", 9)} ${pad("moves", 5, true)} ${pad("sec", 6, true)} ${pad("states", 6, true)}  problems at each draft`);
console.log("-".repeat(72));
for (const r of results) {
  console.log(`${pad(r.name, 10)} ${pad(r.ok ? "yes" : "NO", 4)} ${pad(agent, 9)} ${pad(r.moves, 5, true)} ${pad(r.seconds, 6, true)} ${pad(r.states, 6, true)}  ${r.problems}`);
  for (const n of r.notes) console.log(`${pad("", 10)} · ${n}`);
}
process.exit(results.length === 2 && results.every((r) => r.ok) ? 0 : 1);
