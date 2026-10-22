#!/usr/bin/env bun
// machine serve | add <machine.json> | publish <id> [skills-dir] | render <id> | runs
//         login [--url <url>] [mk_key]      sign the CLI in to a server (local needs no key)
//         run <run_id> -- <command...>      lease the run's live credentials into one command's environment
//         push <machine.json | skill dir>   import a machine into the server you are logged in to
import { join } from "node:path";
import { tmpdir, constants } from "node:os";
import { mkdirSync, writeFileSync, readFileSync, existsSync, chmodSync, mkdtempSync, rmSync } from "node:fs";
const argv = process.argv.slice(2);
const [cmd, a, b] = argv;
const home = process.env.MACHINE_HOME ?? join(process.env.HOME!, ".machine");
const baseUrl = `http://localhost:${process.env.PORT ?? 7420}`;
const credsFile = join(home, "credentials.json");
const usage = () => { console.error("machine serve | add <file> | publish <id> [skills-dir] | render <id> | runs | login [--url <url>] [mk_key] | run <run_id> -- <command...> | push <machine.json | skill dir>"); process.exit(2); };

if (cmd === "serve") { (await import("./server/main.ts")).serve(); }
else if (cmd === "login") await login();
else if (cmd === "run") await runWithLease();
else if (cmd === "push") await push();
else {
  const { store } = await import("./server/main.ts");
  const { renderSkill } = await import("./engine/render-skill.ts");
  if (cmd === "add") { const m = JSON.parse(readFileSync(a, "utf8")); store.saveMachine(m); console.log(`${m.id}@${m.version}`); }
  else if (cmd === "render") process.stdout.write(renderSkill(store.machine(a), { baseUrl }));
  else if (cmd === "publish") {
    const m = store.machine(a); const dir = join(b ?? join(process.env.HOME!, ".claude/skills"), m.id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "SKILL.md"), renderSkill(m, { baseUrl })); writeFileSync(join(dir, "machine.json"), JSON.stringify(m, null, 2) + "\n");
    console.log(`${m.id}@${m.version} → ${dir}`);
  }
  else if (cmd === "runs") for (const r of store.runSummaries()) console.log(`${r.id}  ${r.machine.id}@${r.machine.version}  ${r.status.padEnd(9)} ${r.state}`);
  else usage();
}

/** { url, token? } at <home>/credentials.json, mode 0600. A local server needs no token; a hosted one takes the member's mk_ key. */
async function login() {
  const i = argv.indexOf("--url");
  const url = (i > 0 ? argv[i + 1] : undefined)?.replace(/\/$/, "") ?? baseUrl;
  let token = argv.slice(1).find((x, j) => x.startsWith("mk_") && argv[j] !== "--url");
  // The local default needs no key. Any other server: paste the member's mk_ key (empty answer: a server without auth).
  if (!token && i > 0) {
    process.stderr.write(`Paste your machine key for ${url} (Team → Agent keys; empty if the server has no auth): `);
    token = (await readLine()).trim() || undefined;
  }
  mkdirSync(home, { recursive: true });
  writeFileSync(credsFile, JSON.stringify({ url, ...(token ? { token } : {}) }, null, 2) + "\n", { mode: 0o600 });
  chmodSync(credsFile, 0o600);
  console.log(`${url}${token ? "" : " (no key)"} → ${credsFile}`);
}

function readLine() {
  return new Promise<string>((resolve) => {
    let buf = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (d) => { buf += d; const i = buf.indexOf("\n"); if (i >= 0) { process.stdin.pause(); resolve(buf.slice(0, i)); } });
    process.stdin.on("end", () => resolve(buf));
  });
}

/** POST /api/machines/import with the file (or the machine.json inside a published skill folder) to the server from `machine login`. */
async function push() {
  if (!a) usage();
  const file = existsSync(join(a, "machine.json")) ? join(a, "machine.json") : a;
  const m = JSON.parse(readFileSync(file, "utf8"));
  const cfg: { url: string; token?: string } = existsSync(credsFile) ? JSON.parse(readFileSync(credsFile, "utf8")) : { url: baseUrl };
  const r = await fetch(`${cfg.url}/api/machines/import`, { method: "POST", body: JSON.stringify(m),
    headers: { "content-type": "application/json", ...(cfg.token ? { authorization: `Bearer ${cfg.token}` } : {}) } }).catch((e) => { console.error(`machine push: ${cfg.url} unreachable: ${e.message}`); process.exit(1); });
  const body: any = await r.json().catch(() => ({}));
  if (!r.ok) { console.error(`machine push: ${body.error ?? r.status}${body.message ? `: ${body.message}` : ""}`); process.exit(1); }
  console.log(`${body.id}@${body.version} → ${cfg.url}`);
}

/** POST /api/runs/:id/lease, build the child's environment from the catalog recipes, run it, clean up. Prints nothing of its own on success. */
async function runWithLease() {
  const sep = argv.indexOf("--"), run_id = argv[1];
  if (!run_id || run_id === "--" || sep < 0 || sep + 1 >= argv.length) usage();
  const command = argv.slice(sep + 1);
  // What the timeline shows: the program and its subcommand words, never the arguments.
  const summary: string[] = [];
  for (const w of command) { if (summary.length && !/^[a-z][a-z0-9-]*$/.test(w)) break; summary.push(w); if (summary.length === 3) break; }
  const cfg: { url: string; token?: string } = existsSync(credsFile) ? JSON.parse(readFileSync(credsFile, "utf8")) : { url: baseUrl };
  const die = (msg: string, code = 1): never => { console.error(`machine run: ${msg}`); process.exit(code); };

  const r = await fetch(`${cfg.url}/api/runs/${run_id}/lease`, { method: "POST", body: JSON.stringify({ command: summary.join(" ") }),
    headers: { "content-type": "application/json", ...(cfg.token ? { authorization: `Bearer ${cfg.token}` } : {}) } }).catch((e) => die(`${cfg.url} unreachable: ${e.message}`));
  const body: any = await r.json().catch(() => ({}));
  if (!r.ok) die(`${body.error ?? r.status}${body.message ? `: ${body.message}` : ""}`);

  const { injection } = await import("./engine/providers.ts");
  const env: Record<string, string | undefined> = { ...process.env };
  let dir: string | undefined;
  for (const c of body.credentials as { id: string; provider: string; fields: Record<string, string> }[]) {
    const inj = injection(c.provider, c.id, c.fields);
    Object.assign(env, inj.env);
    for (const f of inj.files) {
      dir ??= mkdtempSync(join(tmpdir(), "machine-lease-"));
      const p = join(dir, f.name); writeFileSync(p, f.content, { mode: 0o600 }); env[f.env] = p;
    }
  }
  const cleanup = () => { if (dir) { rmSync(dir, { recursive: true, force: true }); dir = undefined; } };
  process.on("exit", cleanup);
  let child: ReturnType<typeof Bun.spawn>;
  try { child = Bun.spawn(command, { env, stdio: ["inherit", "inherit", "inherit"] }); }
  catch (e) { cleanup(); die(`${command[0]}: ${(e as Error).message}`, 127); }
  for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => child.kill(sig));
  await child!.exited;
  cleanup();
  process.exit(child!.exitCode ?? (child!.signalCode ? 128 + (constants.signals[child!.signalCode as keyof typeof constants.signals] ?? 0) : 1));
}
