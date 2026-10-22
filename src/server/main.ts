// One process: MCP for agents at /mcp, JSON API and SSE for the UI, static UI files.
// Local mode (no WORKOS_API_KEY): no auth, everything is team "local". Hosted mode: AuthKit sessions on /api, bearer keys on /mcp (auth.ts).
import { Hono, type Context } from "hono";
import { streamSSE } from "hono/streaming";
import { createMcpHonoApp } from "@modelcontextprotocol/hono";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { MachineError, validateMachine, type Machine } from "../engine/engine.ts";
import { SqliteStore } from "../engine/sqlite-store.ts";
import { renderSkill } from "../engine/render-skill.ts";
import { authorApi, initAuthor, onAuthorEvent, registerAuthorTools } from "./author.ts";
import { onAgents, useByoa, watch } from "./connect.ts";
import { initByoa, LOCAL } from "./byoa.ts";
import { META } from "@plannotator/byoa-protocol";
import { hostedAuth, type AuthEnv } from "./auth.ts";
import { bearerLease, credentialRoutes, engineFor, handoff, keyOf, lease, proxy } from "./credentials.ts";

export const home = process.env.MACHINE_HOME ?? join(process.env.HOME!, ".machine");
export const store = new SqliteStore(join(home, "machine.db"));
store.checkSecretKey(); // refuses to start if MACHINE_SECRET_KEY changed; stored credentials would be unreadable
const port = Number(process.env.PORT ?? 7420);
export const hosted = !!process.env.WORKOS_API_KEY;
const publicUrl = process.env.MACHINE_PUBLIC_URL;
if (hosted && !publicUrl) throw new Error("hosted mode: MACHINE_PUBLIC_URL is not set");
const baseUrl = publicUrl ?? `http://localhost:${port}`;
const auth = hosted ? hostedAuth(store) : null;
const local = store.forTeam("local");
// Connect your agent over BYOA (byoa.ts): pairing, sessions and the connector's poll are the SDK's doors on /byoa/*; the
// designer reads and sends through connect.ts. Local: a pairing is approved on the spot, so `/byoa connect <url>` in the
// agent is one command. Hosted: the person is the signed-in member's team.
const byoa = initByoa({ origin: baseUrl, db: store.db, local: !hosted, authenticate: async (req) => auth ? auth.identify(req) : LOCAL });
useByoa(byoa);

// ---------- MCP ----------
const json = (v: unknown) => JSON.stringify(v, null, 2);
const ok = (v: unknown) => ({ content: [{ type: "text" as const, text: json(v) }], structuredContent: v as Record<string, unknown> });
const run = async (fn: () => unknown) => {
  try { return ok(await fn()); }
  catch (e) {
    if (e instanceof MachineError) return { isError: true, content: [{ type: "text" as const, text: json({ error: e.code, message: e.message, details: e.details }) }] };
    throw e;
  }
};
const record = z.record(z.string(), z.unknown());

// Import: a machine.json (from a published skill folder, another team, or an example) becomes the next version of that id here.
function importMachine(s: { machines(): Machine[]; saveMachine(m: Machine): void }, body: unknown) {
  const m = (body && typeof body === "object" && "machine" in (body as any) ? (body as any).machine : body) as Machine;
  if (!m || typeof m !== "object" || typeof m.id !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(m.id)) throw new MachineError("invalid_machine", "a machine.json with an id like ship-fix is required");
  if (!m.version) m.version = 1;   // the version is ours to assign
  const problems = validateMachine(m);
  if (problems.length) throw new MachineError("invalid_machine", problems.join("; "), { problems });
  const latest = s.machines().filter((x) => x.id === m.id).map((x) => x.version).sort((a, b) => b - a)[0] ?? 0;
  m.version = latest + 1; s.saveMachine(m);
  return { id: m.id, version: m.version, name: m.name };
}
// One server per request, scoped to the caller's team (the bearer middleware puts it in authInfo.clientId and the key's member in
// authInfo.extra.by; local mode has neither). The engine checks credential slots against this team's store.
const mcp = createMcpHandler(({ requestInfo, authInfo }) => {
  const scoped = authInfo ? store.forTeam(authInfo.clientId) : local;
  const by = String(authInfo?.extra?.by ?? "local");
  const engine = engineFor(scoped, baseUrl);
  const s = new McpServer({ name: "machine", version: "0.0.1" });
  s.registerTool("list_machines", { description: "List the machines (processes) you can run, with their inputs." },
    async () => ok(scoped.machines().map((m) => ({ id: m.id, version: m.version, name: m.name, description: m.description, inputs: m.inputs ?? {} }))));
  s.registerTool("import_machine", {
    description: "Import a machine into this team: pass the contents of a machine.json (from a published skill folder, an example, or another team). Validated, stored as the next version of its id, and runnable at once.",
    inputSchema: z.object({ machine: record }),
  }, async ({ machine }) => run(() => importMachine(scoped, machine)));
  s.registerTool("preflight", {
    description: "Step 1. Validate inputs and get the requirements you must check yourself before begin. Does not run the checks.",
    inputSchema: z.object({ machine_id: z.string(), inputs: record.default({}) }),
  }, async ({ machine_id, inputs }) => run(() => engine.preflight(machine_id, inputs)));
  s.registerTool("begin", {
    description: "Step 2. Start a run with the inputs and your preflight results. Returns the first state card. If a required check failed the run is created blocked; stop.",
    inputSchema: z.object({ machine_id: z.string(), inputs: record.default({}),
      preflight: z.array(z.object({ id: z.string(), ok: z.boolean(), detail: z.string().optional() })).default([]),
      agent: z.object({ name: z.string().optional(), session: z.string().optional() }).optional() }),
  }, async ({ machine_id, inputs, preflight, agent }) => run(() => engine.begin(machine_id, inputs, preflight, agent)));
  s.registerTool("transition", {
    description: "Fire one of the events listed on your current state card, with the state's output payload. Returns the next card. Rejected if the event, payload, or timing is not allowed.",
    inputSchema: z.object({ run_id: z.string(), event: z.string(), payload: record.optional(), note: z.string().optional() }),
  }, async ({ run_id, event, payload, note }) => run(() => engine.transition(run_id, event, payload, note, "agent")));
  s.registerTool("note", {
    description: "Report progress inside the current state without moving. progress is a percentage 0-100.",
    inputSchema: z.object({ run_id: z.string(), note: z.string(), progress: z.number().optional() }),
  }, async ({ run_id, note, progress }) => run(() => engine.note(run_id, note, progress)));
  s.registerTool("fail", {
    description: "You cannot complete the current state. Give a short code, a plain message, and needs: what a human must provide or fix. The run becomes blocked (or failed if fatal). Then stop.",
    inputSchema: z.object({ run_id: z.string(), code: z.string(), message: z.string(), needs: z.array(z.string()).optional(), fatal: z.boolean().optional() }),
  }, async ({ run_id, code, message, needs, fatal }) => run(() => engine.fail(run_id, code, message, needs, fatal)));
  s.registerTool("get", {
    description: "The current state card for a run. Use it to resume after a human unblocked or decided; if they wrote a note, the card carries it as human_note.",
    inputSchema: z.object({ run_id: z.string() }),
  }, async ({ run_id }) => run(() => engine.get(run_id)));
  s.registerTool("request", {
    description: "Call a provider's API with one of the run's live credentials (credential is the slot id from the state card). The server adds the auth header; you never see the token. path is relative to the provider's API base (GitHub: /repos/o/r/issues). Returns { status, headers, body }.",
    inputSchema: z.object({ run_id: z.string(), credential: z.string(), method: z.string(), path: z.string(), headers: z.record(z.string(), z.string()).optional(), body: z.string().optional() }),
  }, async (a) => run(() => proxy(scoped, engine, baseUrl, by, a)));
  s.registerTool("credential", {
    description: "Last resort: the raw fields of a live credential, only for slots the machine declares with handoff: true. The timeline marks the run as having exposed it. Prefer machine run or request.",
    inputSchema: z.object({ run_id: z.string(), id: z.string() }),
  }, async ({ run_id, id }) => run(() => handoff(scoped, engine, baseUrl, by, run_id, id)));
  // Authoring: draft_machine, get_draft, say. /mcp?author=<session> ties the calls to an ACP describe-it session (local only);
  registerAuthorTools(s, requestInfo, authInfo?.clientId ?? "local");
  return s;
});

// ---------- HTTP ----------
// Hosted: bind to all interfaces and allow the public hostname; the default localhost DNS-rebinding check would 403 every request.
const app = createMcpHonoApp(hosted ? { host: "0.0.0.0", allowedHosts: [new URL(publicUrl!).hostname] } : {});
app.all("/.well-known/byoa", async (c: Context) => (await byoa.handle(c.req.raw)) ?? c.notFound());
app.all("/byoa/*", async (c: Context) => (await byoa.handle(c.req.raw)) ?? c.notFound());
// The authoring tools for a BYOA-connected agent (draft_machine, get_draft, say): the connection token names the person and
// _meta["dev.byoa/session"] the session, so the call lands in the designer session that agent is drawing into.
const authorMcp = createMcpHandler(({ authInfo }) => {
  const s = new McpServer({ name: "machine-designer", version: "0.0.1" });
  registerAuthorTools(s, undefined, authInfo?.clientId ?? "local", typeof authInfo?.extra?.link === "string" ? authInfo.extra.link : undefined);
  return s;
});
app.all("/mcp/author", async (c: Context) => {
  const body = c.get("parsedBody") as { params?: { _meta?: Record<string, unknown> } } | undefined;
  const sessionId = body?.params?._meta?.[META.session];
  const who = await byoa.verifyBearer(c.req.raw, typeof sessionId === "string" ? { sessionId } : {});
  if (!who) return c.json({ error: "unauthorized" }, 401, { "WWW-Authenticate": "Bearer" });
  return authorMcp.fetch(c.req.raw, { parsedBody: body, authInfo: { token: "", clientId: who.userId, scopes: [], extra: { link: who.sessionId } } });
});
if (auth) app.use("/mcp", auth.mcpBearer);
app.all("/mcp", (c: Context) => mcp.fetch(c.req.raw, { parsedBody: c.get("parsedBody"), authInfo: auth ? { token: "", clientId: c.get("team"), scopes: [], extra: { by: keyOf(store, c)?.user_id } } : undefined }));
// The lease with the member's mk_ key (what the machine CLI stores at login). Registered before /api so it answers ahead of the session middleware.
if (auth) app.post("/api/runs/:id/lease", bearerLease(store, baseUrl));

const api = new Hono<AuthEnv>();
const fail = (c: Context, e: unknown) => {
  if (e instanceof MachineError) return c.json({ error: e.code, message: e.message, details: e.details }, e.code.endsWith("not_found") ? 404 : 400);
  throw e;
};
api.get("/health", (c) => c.json({ ok: true, home, machines: store.machines().length }));
if (auth) {
  api.use("*", auth.requireUser);
  api.get("/me", auth.me);
  api.route("/teams", auth.teams);
  api.use("*", auth.requireTeam);
} else {
  api.use("*", async (c, next) => { c.set("team", "local"); c.set("role", "owner"); c.set("scoped", local); await next(); });
  api.get("/me", (c) => { const t = { id: "local", name: "Local", role: "owner" }; return c.json({ user: null, team: t, teams: [t] }); });
}
const engineOf = (c: Context<AuthEnv>) => engineFor(c.get("scoped"), baseUrl);
const skillOpts = hosted ? { baseUrl, header: "Authorization: Bearer <your machine key>" } : { baseUrl };

api.get("/machines", (c) => c.json(c.get("scoped").machines()));
api.get("/machines/:id", (c) => { try { return c.json(c.get("scoped").machine(c.req.param("id"), c.req.query("version") ? Number(c.req.query("version")) : undefined)); } catch (e) { return fail(c, e); } });
api.get("/machines/:id/skill", (c) => { try { return c.text(renderSkill(c.get("scoped").machine(c.req.param("id")), skillOpts)); } catch (e) { return fail(c, e); } });
api.post("/machines/import", async (c) => { try { return c.json(importMachine(c.get("scoped"), await c.req.json())); } catch (e) { return fail(c, e); } });
api.put("/machines/:id", async (c) => {
  try {
    const s = c.get("scoped"), m = await c.req.json(); m.id = c.req.param("id");
    const latest = s.machines().filter((x) => x.id === m.id).map((x) => x.version).sort((a, b) => b - a)[0] ?? 0;
    m.version = latest + 1; s.saveMachine(m); return c.json({ id: m.id, version: m.version });
  } catch (e) { return fail(c, e); }
});
// Publish: store as the next version and write SKILL.md + machine.json where Claude Code finds skills (local only; hosted just bumps the version).
export const skillsDir = process.env.MACHINE_SKILLS_DIR ?? join(process.env.HOME!, ".claude/skills");
api.post("/machines/:id/publish", async (c) => {
  try {
    const s = c.get("scoped"), m = await c.req.json(); m.id = c.req.param("id");
    const latest = s.machines().filter((x) => x.id === m.id).map((x) => x.version).sort((a, b) => b - a)[0] ?? 0;
    m.version = latest + 1; s.saveMachine(m);
    if (hosted) return c.json({ id: m.id, version: m.version, path: null });
    const dir = join(skillsDir, m.id); mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "SKILL.md"), renderSkill(m)); writeFileSync(join(dir, "machine.json"), JSON.stringify(m, null, 2) + "\n");
    return c.json({ id: m.id, version: m.version, path: dir });
  } catch (e) { return fail(c, e); }
});
api.get("/runs", (c) => c.json(c.get("scoped").runSummaries()));
api.get("/runs/:id", (c) => { try { return c.json(c.get("scoped").run(c.req.param("id"))); } catch (e) { return fail(c, e); } });
api.post("/runs/:id/transition", async (c) => { try { const b = await c.req.json(); return c.json(engineOf(c).transition(c.req.param("id"), b.event, undefined, b.note, "human")); } catch (e) { return fail(c, e); } });
api.post("/runs/:id/unblock", async (c) => { try { const b = await c.req.json().catch(() => ({})); return c.json(engineOf(c).unblock(c.req.param("id"), b.note)); } catch (e) { return fail(c, e); } });
api.post("/runs/:id/cancel", async (c) => { try { const b = await c.req.json().catch(() => ({})); return c.json(engineOf(c).cancel(c.req.param("id"), b.note)); } catch (e) { return fail(c, e); } });
api.post("/runs/:id/lease", (c) => lease(c, c.get("scoped"), baseUrl, hosted ? c.get("user").id : "local"));
api.route("/", credentialRoutes());
api.route("/author", authorApi);   // hosted: connected agents only (the UI offers no ACP spawn there)
app.route("/api", api);
if (auth) app.route("/auth", auth.routes);

// Live feed: one event per saveRun, carrying the run summary and the appended history entries. Hosted: only the session's team.
const events = (c: Context) => streamSSE(c, async (stream) => {
  const team = auth ? c.get("team") : "local";
  watch(team);   // the team's BYOA sessions, from now on
  let seq = 0;
  const off = store.onChange((r, appended, team_id) => {
    if (team_id !== team) return;
    const { history, ...summary } = r;
    stream.writeSSE({ event: "run", id: String(++seq), data: JSON.stringify({ run: summary, appended }) });
  });
  // Describe-it sessions: author.message, author.tool, author.draft, author.turn (see author.ts). Local only.
  const offAuthor = onAuthorEvent((type, data) => { stream.writeSSE({ event: type, id: String(++seq), data: JSON.stringify(data) }); });
  // Connected agents (connect.ts, the BYOA wire): the team's list whenever it changes, so the designer's picker follows the terminal.
  const offAgents = onAgents((t, agents) => { if (t === team) stream.writeSSE({ event: "connect.agents", id: String(++seq), data: JSON.stringify(agents) }); });
  stream.onAbort(() => { off(); offAuthor(); offAgents(); });
  while (!stream.aborted) { await stream.writeSSE({ event: "ping", data: "" }); await stream.sleep(5000); }
});
if (auth) app.get("/events", auth.requireUser, auth.requireTeam, events); else app.get("/events", events);

const ui = join(import.meta.dir, "../../dist");
app.get("/*", async (c) => {
  const p = c.req.path === "/" ? "/index.html" : c.req.path;
  const f = Bun.file(join(ui, p));
  if (await f.exists()) return new Response(f);
  const index = Bun.file(join(ui, "index.html"));
  return (await index.exists()) ? new Response(index) : c.text("machine: no UI built yet. API at /api, MCP at /mcp.", 404);
});

export function serve(p = port) {
  const server = Bun.serve({ port: p, hostname: hosted ? "0.0.0.0" : undefined, fetch: app.fetch, idleTimeout: 30 });
  initAuthor({ home, port: server.port!, store });
  console.log(`machine · ${hosted ? publicUrl : `http://localhost:${server.port}`}  mcp ${baseUrl}/mcp  home ${home}${hosted ? "  hosted" : ""}`);
  return server;
}
if (import.meta.main) serve();
