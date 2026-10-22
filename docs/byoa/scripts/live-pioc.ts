// Live proof of Machine over BYOA on real Pi or real OpenCode 2, offline: the host in a pty under a throwaway HOME with the
// byoa connector loaded and Machine's echo model (docs/byoa/scripts/echo-machine-model.ts) as its model, Machine's server on
// :7420, the designer driven through its API. The pty, the wait helpers and the expect script come from the connector
// team's kit (/Users/ramos/byoa/connectors/pi/scripts/live-kit.ts).
//   node docs/byoa/scripts/live-pioc.ts pi        (pi from PATH; PI_BIN to override)
//   node docs/byoa/scripts/live-pioc.ts opencode  (OPENCODE_BIN, else the 2.1.2 the connector team installed under /tmp/byoa-pioc)
// Steps: /byoa connect (one command, approved on the spot) → the tool reaches the next session (Pi: /new; OpenCode: a restart and
// a first prompt) → a designer session bound to it, a setting picked → the prompt enters as a turn → draft_machine and say land
// → the host's screen shows the provenance line. Writes docs/byoa/live-<host>-byoa.log.
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Tty, until, sleep } from "/Users/ramos/byoa/connectors/pi/scripts/live-kit.ts";

const host = process.argv[2] as "pi" | "opencode";
if (host !== "pi" && host !== "opencode") { console.error("usage: node docs/byoa/scripts/live-pioc.ts pi|opencode"); process.exit(2); }
const URL_ = "http://localhost:7420", BYOA = "/Users/ramos/byoa", REPO = "/Users/ramos/oss/machine";
const ROOT = `/tmp/machine-pioc/${host}`, HOME = join(ROOT, "home"), WORK = join(ROOT, "work", "acme");
const lines: string[] = []; const say = (s: string) => { const l = `${new Date().toISOString().slice(11, 19)} ${s}`; lines.push(l); console.log(l); };
rmSync(ROOT, { recursive: true, force: true });
for (const d of [HOME, join(ROOT, "tmp"), join(ROOT, "agent"), join(HOME, ".config", "opencode"), WORK]) mkdirSync(d, { recursive: true });
execFileSync("git", ["init", "-q", "-b", "main"], { cwd: WORK }); writeFileSync(join(WORK, "README.md"), "# acme\n");

// The model: Machine's echo, started here unless one already answers.
const MODEL = "http://127.0.0.1:4598/v1";
const up = async (u: string) => { try { await fetch(u, { signal: AbortSignal.timeout(1000) }); return true; } catch { return false; } };
const children: ReturnType<typeof spawn>[] = []; process.on("exit", () => { for (const c of children) c.kill("SIGTERM"); });
if (!(await up(`${MODEL}/models`))) { children.push(spawn(process.execPath, [join(REPO, "docs/byoa/scripts/echo-machine-model.ts")], { env: { ...process.env, PORT: "4598", ECHO_LOG: join(ROOT, "echo.jsonl") }, stdio: "ignore" })); await until("the echo model", 10_000, () => up(`${MODEL}/models`)); }

const api = async (path: string, body?: unknown) => { const r = await fetch(URL_ + path, body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); return r.json() as Promise<any>; };
type Agent = { id: string; host: string; connected: boolean; cwd: string; options: { id: string; name: string; value: string; options: { value: string; name: string }[] }[] };
const connected = async (besides: string[] = []): Promise<Agent | undefined> => ((await api("/api/author/connected")) as Agent[]).find((a) => a.host === host && a.connected && !besides.includes(a.id));
const credential = join(HOME, ".byoa", "credentials", host, "http_localhost_7420.json");

let tty: Tty, env: Record<string, string>;
if (host === "pi") {
  const PI = realpathSync(process.env.PI_BIN ?? execFileSync("/bin/sh", ["-c", "command -v pi"], { encoding: "utf8" }).trim());
  const EXT = join(BYOA, "connectors/pi/src/index.ts");
  writeFileSync(join(ROOT, "agent", "models.json"), JSON.stringify({ providers: { echo: { baseUrl: MODEL, api: "openai-completions", apiKey: "test-model-key", models: [{ id: "echo-1", name: "Echo" }] } } }));
  env = { HOME, TMPDIR: join(ROOT, "tmp"), PATH: `${dirname(process.execPath)}:${dirname(PI)}:/usr/bin:/bin`, TERM: "xterm-256color", LANG: "en_US.UTF-8", COLUMNS: "160", LINES: "40", PI_CODING_AGENT_DIR: join(ROOT, "agent"), PI_OFFLINE: "1", PI_SKIP_VERSION_CHECK: "1", PI_TELEMETRY: "0" };
  say(`pi ${execFileSync(PI, ["--version"], { env, encoding: "utf8" }).trim()} (${PI}), extension ${EXT}`);
  tty = new Tty(ROOT, WORK, env, [PI, "-e", EXT, "--provider", "echo", "--model", "echo-1"]);
  await until("Pi's TUI", 60_000, () => /echo-1/.test(tty.screen()));
} else {
  const OC = process.env.OPENCODE_BIN ?? "/tmp/byoa-pioc/pkgs/opencode/node_modules/.bin/opencode2";
  if (!existsSync(OC)) throw new Error(`no OpenCode 2 at ${OC}; run the connector team's live.ts once or set OPENCODE_BIN`);
  writeFileSync(join(HOME, ".config", "opencode", "opencode.json"), JSON.stringify({ model: "echo/echo-1", providers: { echo: { package: "@opencode/ai/providers/openai-compatible", settings: { baseURL: MODEL, apiKey: "test-model-key" }, models: { "echo-1": { modelID: "echo-1", name: "Echo" } } } }, plugins: [join(BYOA, "connectors/opencode")] }));
  env = { HOME, TMPDIR: join(ROOT, "tmp"), PATH: `${dirname(process.execPath)}:/usr/bin:/bin`, TERM: "xterm-256color", COLORTERM: "truecolor", LANG: "en_US.UTF-8", XDG_CONFIG_HOME: join(HOME, ".config"), XDG_DATA_HOME: join(HOME, ".local/share"), XDG_STATE_HOME: join(HOME, ".local/state"), XDG_CACHE_HOME: join(HOME, ".cache"), OPENCODE_DISABLE_AUTOUPDATE: "1", OPENCODE_DISABLE_MODELS_FETCH: "1" };
  say(`${execFileSync(OC, ["--version"], { env, encoding: "utf8" }).trim()} (${OC}), plugin ${join(BYOA, "connectors/opencode")}`);
  tty = new Tty(ROOT, WORK, env, [OC, "--standalone"]);
  await until("OpenCode's TUI", 60_000, () => /Echo|echo-1/.test(tty.screen())); await sleep(3_000);
}
let code = 1;
try {
  // 1. connect: one command; the slash menu may take the first Enter.
  await tty.type(`/byoa connect ${URL_}`);
  await until("the credential", 5_000, () => existsSync(credential)).catch(() => tty.type(""));
  await until("the credential", 15_000, () => existsSync(credential));
  // 2. the proxied tool reaches the next session. Pi: this session is on the wire now; /new brings the tool. OpenCode: a session
  // exists once the person writes in it, and tools are fixed when the TUI starts, so: restart, then a first prompt.
  let agent: Agent;
  if (host === "pi") {
    const first = await until("the session in the designer", 30_000, () => connected());
    say(`connected: ${first.id}; settings: ${first.options.map((o) => `${o.id}=${o.value || "(none)"} [${o.options.map((x) => x.name).join(", ")}]`).join("; ")}`);
    await tty.type("/new"); agent = await until("a new session after /new", 30_000, () => connected([first.id]));
  } else {
    say("credential saved; restarting OpenCode so the tool is in its session");
    await tty.stop(); tty = new Tty(join(ROOT, "second"), WORK, env, [(process.env.OPENCODE_BIN ?? "/tmp/byoa-pioc/pkgs/opencode/node_modules/.bin/opencode2"), "--standalone"]);
    await until("OpenCode's TUI again", 60_000, () => /Echo|echo-1/.test(tty.screen())); await sleep(3_000);
    await tty.type("hello from the person");
    agent = await until("the session after the restart and a first prompt", 60_000, () => connected());
    say(`connected: ${agent.id}; settings: ${agent.options.map((o) => `${o.id}=${o.value || "(none)"} [${o.options.map((x) => x.name).join(", ")}]`).join("; ")}`);
  }
  say(`session with the tool: ${agent.id}`);
  // 3. the designer: bind, pick a setting the host offers, send.
  const s = await api("/api/author/sessions", { connect: agent.id });
  const pick = (s.config as Agent["options"]).find((c) => c.options.some((o) => /low|minimal|off/i.test(o.value) || /low|minimal|off/i.test(o.name)));
  if (pick) { const o = pick.options.find((x) => /low|minimal|off/i.test(x.value) || /low|minimal|off/i.test(x.name))!; await api(`/api/author/sessions/${s.id}/config`, { id: pick.id, value: o.value }); say(`picked ${pick.id}=${o.value}`); }
  else say(`no low setting to pick; config: ${JSON.stringify(s.config.map((c: any) => [c.id, c.value]))}`);
  await api(`/api/author/sessions/${s.id}/prompt`, { text: "Triage the issue, implement the fix, run the tests, then a person reviews. Changes requested goes back to the fix. Merged is the end." });
  say("prompt sent; waiting for the turn");
  const v = await until("the draft and the end of the turn", 120_000, async () => { const v = await api(`/api/author/sessions/${s.id}`); return v.draft && v.status === "idle" && v.transcript.some((e: any) => e.role === "agent") ? v : null; });
  say(`status ${v.status}; draft states: ${Object.keys(v.draft.states).join(", ")}; problems ${JSON.stringify(v.problems)}`);
  for (const e of v.transcript) say(`   ${e.role} ${(e.text ?? e.title ?? "").slice(0, 140).replace(/\n/g, " ")}`);
  // The host's screen: the provenance line (Pi keeps it in view) or the proxied tool's own row (OpenCode scrolls the line away).
  await until("the provenance line or the tool row on screen", 10_000, () => /\[BYOA\] Machine \(localhost:7420\)|machine \[action=draft_machine\]/.test(tty.screen()));
  const screen = tty.screen().split("\n").map((l) => l.trim()).filter((l) => /BYOA|Machine|machine|ECHO/.test(l)).slice(-8);
  say(`screen: ${JSON.stringify(screen)}`);
  code = 0;
} catch (e) {
  say(`FAIL: ${(e as Error).message}`); say(`screen tail: ${tty!.screen().slice(-1500)}`);
} finally {
  await tty!.stop().catch(() => {});
  writeFileSync(join(REPO, `docs/byoa/live-${host}-byoa.log`), lines.join("\n") + "\n");
  process.exit(code);
}
