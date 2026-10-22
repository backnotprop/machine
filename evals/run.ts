#!/usr/bin/env bun
// End-to-end evaluation: a fresh Claude Code session gets a published skill and the MCP server, runs a machine
// in a throwaway repo, and we check what actually happened against the run's history in the server's database.
//
//   bun evals/run.ts                      run every case in evals/cases
//   bun evals/run.ts changelog-happy      run one
//   bun evals/run.ts changelog-happy 5    run one five times (M4: look for drift and rejected calls across runs)
//
// Requires the `claude` CLI on PATH (uses your login; no API key).
import { mkdtempSync, readdirSync, rmSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { SqliteStore } from "../src/engine/sqlite-store.ts";
import { renderSkill } from "../src/engine/render-skill.ts";

interface Case {
  name: string;
  machine: string;                 // path to machine json, relative to repo
  inputs: Record<string, string>;  // "$FIXTURE" is replaced with the fixture dir
  setup: string;                   // bash run inside the fixture dir before the agent starts
  expect: { status: string; state: string; max_rejected?: number; file_exists?: string[]; file_absent?: string[] };
  judge?: { question: string; files: string[] };  // optional: a second Claude session grades the produced files against this question
  env?: Record<string, string>;    // extra env for the agent; "$FIXTURE" and "$PATH" are replaced
  max_turns?: number;              // default 60
  prompt_suffix?: string;          // default "Do not commit."
  // Optional second phase: after the first session leaves the run blocked, run `setup`, unblock the run with `note`
  // (as the human would from the UI), and start a fresh session that resumes from `get`. `expect` then applies to the end.
  then?: { setup?: string; note: string; expect: Case["expect"]; max_turns?: number };
}

const root = resolve(import.meta.dir, "..");
const only = process.argv[2];
const repeat = Number(process.argv[3] ?? 1);
const cases: Case[] = readdirSync(join(root, "evals/cases")).filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(join(root, "evals/cases", f), "utf8")))
  .filter((c) => !only || c.name === only)
  .flatMap((c) => Array.from({ length: repeat }, (_, i) => repeat > 1 ? { ...c, name: `${c.name}#${i + 1}` } : c));

const results: { name: string; ok: boolean; status: string; state: string; rejected: number; transitions: number; turns: number; seconds: number; cost: number; judge: string; notes: string[] }[] = [];

// The judge is another Claude Code session with no tools: it reads the produced files and answers yes/no with reasons.
function judge(c: Case, fixture: string): { verdict: string; reasons: string; cost: number } {
  if (!c.judge) return { verdict: "-", reasons: "", cost: 0 };
  const files = c.judge.files.map((f) => `--- ${f} ---\n${(() => { try { return readFileSync(join(fixture, f), "utf8"); } catch { return "(missing)"; } })()}`).join("\n\n");
  const commits = Bun.spawnSync(["git", "log", "--oneline", "--decorate"], { cwd: fixture }).stdout.toString();
  const prompt = `You are grading the output of an automated process. Answer strictly from the material below.\n\nQuestion: ${c.judge.question}\n\nGit log of the repository:\n${commits}\n\nFiles produced:\n${files}`;
  const schema = JSON.stringify({ type: "object", properties: { pass: { type: "boolean" }, reasons: { type: "string" } }, required: ["pass", "reasons"] });
  const p = Bun.spawnSync(["claude", "-p", prompt, "--output-format", "json", "--json-schema", schema, "--allowedTools", "", "--max-turns", "1"], { stdout: "pipe", stderr: "pipe" });
  try { const out = JSON.parse(p.stdout.toString()); const so = out.structured_output ?? {}; return { verdict: so.pass ? "pass" : "FAIL", reasons: String(so.reasons ?? ""), cost: Number(out.total_cost_usd ?? 0) }; }
  catch { return { verdict: "error", reasons: p.stderr.toString().slice(0, 200), cost: 0 }; }
}

async function waitFor(url: string, ms = 8000) {
  const t = Date.now();
  while (Date.now() - t < ms) { try { if ((await fetch(url)).ok) return; } catch { } await Bun.sleep(100); }
  throw new Error(`server did not come up at ${url}`);
}

for (const c of cases) {
  const home = mkdtempSync(join(tmpdir(), "machine-eval-home-"));
  const fixture = mkdtempSync(join(tmpdir(), "machine-eval-fixture-"));
  // EVAL_MACHINE overrides the case's definition file, e.g. with one published from the editor.
  const machine = JSON.parse(readFileSync(process.env.EVAL_MACHINE ?? join(root, c.machine), "utf8"));
  if (process.env.EVAL_MACHINE) console.log(`using ${process.env.EVAL_MACHINE} (${machine.id}@${machine.version})`);
  new SqliteStore(join(home, "machine.db")).saveMachine(machine);

  const port = Number(process.env.EVAL_PORT ?? 7500 + Math.floor(Math.random() * 400));
  if (process.env.EVAL_PORT) console.log(`watch at http://127.0.0.1:${port}/`);
  const server = Bun.spawn(["bun", join(root, "src/server/main.ts")], { env: { ...process.env, MACHINE_HOME: home, PORT: String(port) }, stdout: "ignore", stderr: "pipe" });
  await waitFor(`http://127.0.0.1:${port}/api/health`);

  const skillDir = join(fixture, ".claude/skills", machine.id); mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), renderSkill(machine));
  Bun.spawnSync(["bash", "-lc", c.setup], { cwd: fixture, env: { ...process.env, FIXTURE: fixture, ROOT: root } });
  const inputs = Object.fromEntries(Object.entries(c.inputs).map(([k, v]) => [k, v.replace("$FIXTURE", fixture)]));
  const mcpConfig = JSON.stringify({ mcpServers: { machine: { type: "http", url: `http://127.0.0.1:${port}/mcp` } } });

  const prompt = `Carry out the "${machine.id}" skill in ${fixture}. Read ${join(skillDir, "SKILL.md")} and follow it exactly.
Inputs: ${JSON.stringify(inputs)}
Do the work for real inside ${fixture} only. ${c.prompt_suffix ?? "Do not commit."} When the skill says to stop, stop and summarise what happened in three lines.`;
  const env = { ...process.env, ...Object.fromEntries(Object.entries(c.env ?? {}).map(([k, v]) => [k, v.replace("$FIXTURE", fixture).replace("$PATH", process.env.PATH ?? "")])) };

  const session = (prompt: string, maxTurns: number) => Bun.spawnSync(["claude", "-p", prompt, "--output-format", "json", "--permission-mode", "bypassPermissions",
    "--mcp-config", mcpConfig, "--strict-mcp-config",
    "--allowedTools", "Bash,Read,Write,Edit,Glob,Grep,mcp__machine__*", "--add-dir", fixture, "--max-turns", String(maxTurns)],
    { cwd: fixture, env, stdout: "pipe", stderr: "pipe" });
  const t0 = Date.now();
  let proc = session(prompt, c.max_turns ?? 60);
  let out: any = {}; try { out = JSON.parse(proc.stdout.toString()); } catch { }
  let cost = Number(out.total_cost_usd ?? 0);
  let turns = Number(out.num_turns ?? 0);
  const notes: string[] = [];
  let expect = c.expect;

  if (c.then) {
    // The human's turn: fix what was asked, unblock with a note, and let a new session pick the run up from `get`.
    const first = (await (await fetch(`http://127.0.0.1:${port}/api/runs`)).json())[0];
    if (!first || first.status !== "blocked") notes.push(`phase 1 ended ${first?.status}/${first?.state}, expected blocked`);
    else {
      if (c.then.setup) Bun.spawnSync(["bash", "-lc", c.then.setup], { cwd: fixture, env: { ...process.env, FIXTURE: fixture, ROOT: root } });
      await fetch(`http://127.0.0.1:${port}/api/runs/${first.id}/unblock`, { method: "POST", body: JSON.stringify({ note: c.then.note }) });
      const resume = `Run ${first.id} of the "${machine.id}" skill in ${fixture} was blocked and a person has just unblocked it. Read ${join(skillDir, "SKILL.md")}. Call the machine get tool with that run_id and continue the run from the card it returns, following the skill exactly. ${c.prompt_suffix ?? "Do not commit."} When the skill says to stop, stop and summarise what happened in three lines.`;
      proc = session(resume, c.then.max_turns ?? c.max_turns ?? 60);
      let out2: any = {}; try { out2 = JSON.parse(proc.stdout.toString()); } catch { }
      cost += Number(out2.total_cost_usd ?? 0); turns += Number(out2.num_turns ?? 0); out = { ...out, result: `${out.result}\n--- resumed ---\n${out2.result}` };
      expect = c.then.expect;
    }
  }
  const seconds = Math.round((Date.now() - t0) / 100) / 10;
  server.kill();

  const store = new SqliteStore(join(home, "machine.db"));
  const runs = store.runs();
  const run = runs[0];
  if (runs.length !== 1) notes.push(`expected 1 run, found ${runs.length}`);
  const rejected = run?.history.filter((h) => h.type === "rejected").length ?? 0;
  const transitions = run?.history.filter((h) => h.type === "transition").length ?? 0;
  let ok = !!run && run.status === expect.status && run.state === expect.state;
  if (!ok) notes.push(`got ${run?.status}/${run?.state}, expected ${expect.status}/${expect.state}`);
  if (expect.max_rejected !== undefined && rejected > expect.max_rejected) { ok = false; notes.push(`${rejected} rejected calls`); }
  for (const f of expect.file_exists ?? []) if (!Bun.file(join(fixture, f)).size) { ok = false; notes.push(`missing ${f}`); }
  for (const f of expect.file_absent ?? []) if (Bun.file(join(fixture, f)).size) { ok = false; notes.push(`should not exist: ${f}`); }
  if (proc.exitCode !== 0) notes.push(`claude exited ${proc.exitCode}: ${proc.stderr.toString().slice(0, 200)}`);
  for (const h of run?.history ?? []) if (h.type === "rejected") notes.push(`rejected ${h.event} from ${h.from}: ${h.error?.code}`);
  const j = ok ? judge(c, fixture) : { verdict: "-", reasons: "", cost: 0 };
  cost += j.cost;
  if (j.verdict === "FAIL" || j.verdict === "error") { ok = false; notes.push(`judge: ${j.reasons}`); }

  results.push({ name: c.name, ok, status: run?.status ?? "-", state: run?.state ?? "-", rejected, transitions, turns, seconds, cost, judge: j.verdict, notes });
  writeFileSync(join(root, "evals/last-" + c.name.replace("#", "-") + ".json"), JSON.stringify({ case: c, fixture, home, run, agent_result: out.result, num_turns: turns, cost, seconds, judge: j }, null, 2));
  rmSync(fixture, { recursive: true, force: true });
}

const pad = (s: string | number, n: number, r = false) => (r ? String(s).padStart(n) : String(s).padEnd(n));
console.log(`\n${pad("case", 20)} ${pad("ok", 4)} ${pad("status", 10)} ${pad("state", 14)} ${pad("moves", 5, true)} ${pad("rej", 4, true)} ${pad("turns", 5, true)} ${pad("sec", 6, true)} ${pad("usd", 6, true)} ${pad("judge", 6)}`);
console.log("-".repeat(90));
for (const r of results) {
  console.log(`${pad(r.name, 20)} ${pad(r.ok ? "yes" : "NO", 4)} ${pad(r.status, 10)} ${pad(r.state, 14)} ${pad(r.transitions, 5, true)} ${pad(r.rejected, 4, true)} ${pad(r.turns, 5, true)} ${pad(r.seconds, 6, true)} ${pad(r.cost.toFixed(2), 6, true)} ${pad(r.judge, 6)}`);
  for (const n of r.notes) console.log(`${pad("", 20)} · ${n}`);
}
process.exit(results.every((r) => r.ok) ? 0 : 1);
