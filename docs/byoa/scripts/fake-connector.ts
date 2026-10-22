// A stand-in agent on the real @byoa/connector-core, for proving Machine's BYOA side end to end without an agent:
//   bun docs/byoa/scripts/fake-connector.ts [origin=http://localhost:7420] [host_session=fake-1] [cwd=$PWD] [home=~/.machine/fake-byoa]
// It pairs with the server the way the real connectors do (locally approved on the spot, one command), registers one
// "claude-code" session, polls, and when a designer message arrives it "runs a turn": busy, the proxied `machine` tool
// (draft_machine with a five-state machine, then say), done. Settings the designer sets are applied before the turn
// and logged (`set model=opus`). The credential lives under `home`, so a restart keeps the connection and the session id.
import { Connector, type FilePort, type HostAdapter, type HostSession, type HttpPort, type SessionHandle } from "@plannotator/byoa-connector-core";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

const [origin = "http://localhost:7420", hostSession = "fake-1", cwd = process.cwd(), home = join(process.env.MACHINE_HOME ?? join(homedir(), ".machine"), "fake-byoa")] = process.argv.slice(2);
const log = (t: string) => console.log(`${new Date().toISOString().slice(11, 23)} ${t}`);

const MACHINE = {
  id: "ship-fix", version: 1, name: "Ship a fix", description: "Triage an issue, fix it, run the tests, get a review, merge.",
  initial: "triage",
  states: {
    triage: { kind: "task", title: "Triage the issue", instructions: "Read the issue and reproduce it. Do not change code yet.", on: { triaged: { to: "build" } } },
    build: { kind: "task", title: "Implement the fix", instructions: "Make the smallest change that fixes it.", on: { fixed: { to: "verify" } } },
    verify: { kind: "decision", title: "Run the tests", instructions: "Run the test suite.", output: { verdict: { type: "string", required: true, enum: ["pass", "fail"] } }, on: { pass: { to: "review" }, fail: { to: "build" } } },
    review: { kind: "wait", title: "Wait for review", on: { approved: { to: "ship", actor: "human" }, changes_requested: { to: "build", actor: "human" } } },
    ship: { kind: "final", title: "Merged", outcome: "success" },
  },
};

// ---- ports: Node's fetch (no redirects) and real files under `home` ----
const http: HttpPort = async (r) => {
  const res = await fetch(r.url, { method: r.method, headers: r.headers, body: r.body, redirect: "manual", signal: AbortSignal.timeout(30_000) });
  const headers: Record<string, string> = {}; res.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
  return { status: res.status, text: await res.text(), headers, url: res.url };
};
const files: FilePort = {
  async read(path) { if (!existsSync(path)) return null; return { text: readFileSync(path, "utf8"), mode: statSync(path).mode & 0o777 }; },
  async writePrivate(path, text) { mkdirSync(dirname(path), { recursive: true, mode: 0o700 }); chmodSync(dirname(path), 0o700); const tmp = path + ".tmp"; writeFileSync(tmp, text, { mode: 0o600 }); renameSync(tmp, path); },
  async remove(path) { rmSync(path, { force: true }); },
  async list(dir) { return existsSync(dir) ? readdirSync(dir) : []; },
};

// ---- the host: one interactive "claude-code" with one session ----
const host: HostAdapter = { host: "claude-code", hostVersion: "2.1.306", machineName: "fake-mbp", isInteractive: () => true, display: (d) => { if (d.toast) log(`[${d.toast.level}] ${d.toast.text}`); } };
const current: Record<string, string> = { model: "sonnet", effort: "high" };
let busy = false, aborted = false, handle: SessionHandle | null = null;
const session: HostSession = {
  hostSessionId: () => hostSession,
  workspace: () => ({ folder_name: cwd.split("/").pop() ?? cwd, path: cwd }),
  busy: () => busy,
  blocked: () => false,
  async abort() { aborted = true; busy = false; log("abort"); },
  settings: () => [
    { id: "model", name: "Model", value: current.model, choices: [{ value: "opus", name: "Opus" }, { value: "sonnet", name: "Sonnet" }, { value: "haiku", name: "Haiku" }] },
    { id: "effort", name: "Effort", value: current.effort, choices: [{ value: "low", name: "Low" }, { value: "medium", name: "Medium" }, { value: "high", name: "High" }] },
  ],
  async applySetting(id, value) { current[id] = value; log(`set ${id}=${value}`); },
  async submit(text) {
    log(`\n--- turn ---\n${text.slice(0, 300)}…\n`);
    busy = true; aborted = false; handle!.turnStarted(text);
    void (async () => {
      try {
        await Bun.sleep(1000);   // "thinking": long enough for a Stop from the designer to land
        if (aborted) { handle!.turnEnded("interrupted"); log("turn interrupted"); return; }
        const tools = await handle!.tools();
        const machine = tools.find((t) => t.name === "machine");
        if (!machine) throw new Error(`no proxied machine tool (have: ${tools.map((t) => t.name).join(", ") || "none"})`);
        handle!.tool("machine", "draft_machine");
        const d = await machine.call({ action: "draft_machine", machine: MACHINE });
        log(`draft_machine → ${d.isError ? "error " : ""}${d.text.slice(0, 160)}`);
        await machine.call({ action: "say", text: "Drew it: triage, build, verify, a wait for review, merged. Failing tests go back to build. Say if the review should also be able to abandon it." });
        await Bun.sleep(300);
        busy = false; handle!.turnEnded("done"); log("turn done");
      } catch (e) { busy = false; handle!.turnEnded("error", (e as Error).message); log(`turn failed: ${(e as Error).message}`); }
    })();
  },
};

const connector = new Connector({ host, http, files, now: () => Date.now(), home });
await connector.start();
if (!/connected/i.test(await connector.status()) || !(await connector.status()).includes(origin.replace(/^https?:\/\//, ""))) log(await connector.connect(origin));
handle = connector.attach(session);
let last = "";
log(`fake byoa connector · claude-code · session ${hostSession} · ${cwd} → ${origin} · home ${home}`);
setInterval(async () => {
  await connector.tick();
  const s = await connector.status(); if (s !== last) { last = s; log(`status: ${s.replace(/\n/g, " | ")}`); }
}, 1000);
