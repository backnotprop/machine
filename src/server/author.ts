// "Describe it": an ACP client inside the server. It spawns a local coding agent over stdio (Claude Code through Zed's
// adapter, Gemini CLI, OpenCode, Codex through codex-acp), gives it this server's MCP with two authoring tools
// (draft_machine, get_draft), and relays what the agent says and every draft it makes to the UI over /events.
// Sessions live in memory; each one's transcript is also written to MACHINE_HOME/author/<id>/transcript.json.
import * as acp from "@agentclientprotocol/sdk";
import { Hono, type Context } from "hono";
import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import Ajv2020, { type ErrorObject } from "ajv/dist/2020";
import { join, resolve, sep } from "node:path";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { MachineError, validateMachine, type Machine } from "../engine/engine.ts";
import type { SqliteStore } from "../engine/sqlite-store.ts";
import { agent as connectedAgent, agentsOf, deliver, hooks as connectHooks, interrupt, type Delivery, type HostOption } from "./connect.ts";
import schema from "../../schema/machine.schema.json";

// ---------- Agents installed on this machine ----------

interface AgentSpec { id: string; name: string; bin: string; cmd: string[]; env: Record<string, string>; login: string; available: boolean }
const claude = Bun.which("claude"), gemini = Bun.which("gemini"), opencode = Bun.which("opencode"), codex = Bun.which("codex");
// Adapters from npm run through `bun x`, which fetches them on first use and caches them.
export const agents: AgentSpec[] = [
  { id: "claude", name: "Claude Code", bin: "claude-agent-acp", available: !!claude,
    cmd: [process.execPath, "x", "@zed-industries/claude-agent-acp@0.23.1"], env: claude ? { CLAUDE_CODE_EXECUTABLE: claude } : {},
    login: "run `claude` in a terminal and log in" },
  { id: "gemini", name: "Gemini CLI", bin: "gemini", available: !!gemini, cmd: [gemini ?? "gemini", "--acp"], env: {},
    login: "run `gemini` in a terminal and sign in" },
  { id: "opencode", name: "OpenCode", bin: "opencode", available: !!opencode, cmd: [opencode ?? "opencode", "acp"], env: {},
    login: "run `opencode auth login`" },
  { id: "codex", name: "Codex", bin: "codex-acp", available: !!codex, cmd: [process.execPath, "x", "@zed-industries/codex-acp@0.16.0"], env: {},
    login: "run `codex login`" },
];
export const defaultAgent = agents.find((a) => a.available)?.id ?? null;

// ---------- Events for /events ----------

export type AuthorEventType = "author.message" | "author.tool" | "author.draft" | "author.turn" | "author.config";
type Listener = (type: AuthorEventType, data: Record<string, unknown>) => void;
const listeners = new Set<Listener>();
export function onAuthorEvent(fn: Listener) { listeners.add(fn); return () => { listeners.delete(fn); }; }
const emit = (type: AuthorEventType, data: Record<string, unknown>) => { for (const fn of listeners) fn(type, data); };

// ---------- Checking a draft: the JSON Schema, then the engine's validator ----------

const ajv = new Ajv2020({ allErrors: true, strict: false });
const schemaCheck = ajv.compile(schema);
const where = (p: string) => p.replace(/^\//, "").replaceAll("/", ".") || "the machine";

// Phrase schema errors so a model can act on them. The engine's validator already says the structural things
// (task needs instructions, final needs outcome, non-final needs events), so those schema errors are dropped.
function phrase(e: ErrorObject): string | null {
  const at = where(e.instancePath);
  const p = e.params as Record<string, any>;
  switch (e.keyword) {
    case "if": case "not": case "propertyNames": return null;
    case "required":
      if (/^\/states\/[^/]+$/.test(e.instancePath) && ["instructions", "outcome", "on"].includes(p.missingProperty)) return null;
      if (!e.instancePath && p.missingProperty === "version") return null;
      return e.instancePath ? `${at}: missing "${p.missingProperty}"` : `the machine is missing "${p.missingProperty}"`;
    case "additionalProperties": return `${at}: unknown property "${p.additionalProperty}"; remove it`;
    case "enum": return `${at} must be one of ${p.allowedValues.map((v: string) => `"${v}"`).join(", ")}`;
    case "pattern":
      if (e.instancePath === "/id") return null;
      if (e.propertyName) return `${at}: name "${e.propertyName}" must match ${p.pattern} (lowercase letters, digits, underscores)`;
      return `${at} must match ${p.pattern}${at === "id" ? " (kebab-case)" : ""}`;
    case "type": return `${at} must be ${p.type}`;
    default: return `${at} ${e.message}`;
  }
}

export function checkDraft(m: unknown): string[] {
  const out: string[] = [];
  if (!schemaCheck(m)) for (const e of schemaCheck.errors ?? []) { const s = phrase(e); if (s) out.push(s); }
  // Without an initial state the validator's "does not exist" and "unreachable" lines only repeat "missing initial".
  const noInitial = !(m as Machine | null)?.initial;
  try { out.push(...validateMachine(m as Machine).filter((s) => !(noInitial && /^initial state|unreachable from initial$/.test(s)))); }
  catch (e) { out.push(`the definition is too malformed to check the graph (${(e as Error).message}); send an object with id, version, name, description, initial and states`); }
  return [...new Set(out)];
}

// ---------- Sessions ----------

type Entry =
  | { ts: string; role: "user" | "agent"; text: string }
  | { ts: string; role: "tool"; id: string; title: string; status: string };
interface Session {
  id: string; agent: AgentSpec; machine_id: string | null; dir: string; dirs: string[];
  link: string | null; // a connected agent (connect.ts, a BYOA session id) drives this session instead of an ACP child
  status: "starting" | "idle" | "running" | "error" | "closed"; error?: string;
  transcript: Entry[]; draft: Machine | null; problems: string[]; drafts: { ts: string; problems: string[] }[];
  prompted: boolean; proc: Bun.Subprocess<"pipe", "pipe", "pipe">; conn?: acp.ClientConnection; acpSession?: string;
  config: Choice[]; effort: string | null; model: string | null; // config: the agent's session options we show (model, effort)
  chosen: Record<string, string>; // linked sessions: what the person picked here; the next message carries it to the agent's connector
  message?: string; // linked sessions: the wire's id of the last message sent, for Stop
  stderr: string; closing: boolean; open: boolean; // open: the last transcript entry is an agent message still receiving chunks
}
const sessions = new Map<string, Session>();
const now = () => new Date().toISOString();
const shim = join(import.meta.dir, "mcp-stdio-shim.ts");
const promptFile = join(import.meta.dir, "author-prompt.md");

let home = "", base = "", store: SqliteStore;
/** Called by serve(): where scratch dirs go, which store holds published machines, and this server's own URL. */
export function initAuthor(o: { home: string; port: number; store: SqliteStore }) { home = o.home; base = `http://localhost:${o.port}`; store = o.store; }

class HttpError extends Error { constructor(public status: 400 | 404 | 409 | 502, message: string) { super(message); } }

function view(s: Session) {
  return { id: s.id, agent: s.agent.id, agent_name: s.agent.name, link: s.link, machine_id: s.machine_id, status: s.status, error: s.error ?? null, prompted: s.prompted,
    config: s.config, transcript: s.transcript, draft: s.draft, problems: s.problems, drafts: s.drafts };
}

// ---------- Session options: which model, how much effort ----------
//
// ACP agents describe their switches as session config options (session/new returns them; session/set_config_option
// changes one). We show the ones that matter here: category "model" and "thought_level". Claude Code's adapter has no
// thought_level option yet; its effort is a start-up option (_meta.claudeCode.options.effort, the CLI's --effort),
// so for claude we add an "effort" choice ourselves and apply it by starting the ACP session again, which is only
// possible before the first prompt.

export type Choice = { id: string; name: string; category: "model" | "thought_level"; value: string; fixed?: boolean;
  options: { value: string; name: string; description?: string }[] };
const EFFORTS = [["low", "Low", "Quick answers, little thinking"], ["medium", "Medium", "Some thinking"], ["high", "High", "Thinks it through (default)"], ["max", "Max", "As much thinking as the model allows"]];
const SHOWN = new Set(["model", "thought_level"]);
function choices(s: Session, raw: acp.SessionConfigOption[] | undefined | null): Choice[] {
  const out: Choice[] = [];
  for (const o of raw ?? []) {
    if (o.type !== "select" || !SHOWN.has(o.category ?? "")) continue;
    const flat = o.options.flatMap((x) => "options" in x ? x.options : [x]).filter((x) => typeof x.value === "string" && typeof x.name === "string");
    out.push({ id: o.id, name: o.name, category: o.category as Choice["category"], value: o.currentValue,
      options: flat.map((x) => ({ value: x.value, name: x.name, ...(x.description ? { description: x.description } : {}) })) });
  }
  if (s.agent.id === "claude" && !out.some((c) => c.category === "thought_level"))
    out.push({ id: "effort", name: "Effort", category: "thought_level", value: s.effort ?? "high", fixed: s.prompted,
      options: EFFORTS.map(([value, name, description]) => ({ value, name, description })) });
  return out;
}

/** A connected agent's options as the designer's choices: the host's current value unless the person picked one here. */
const linkChoices = (options: HostOption[], chosen: Record<string, string>): Choice[] =>
  options.map((o) => ({ id: o.id, name: o.name, category: o.id === "model" ? "model" : "thought_level", value: chosen[o.id] ?? o.value, options: o.options }));

/** Change one option. Returns the session's options after the change. */
export async function configure(s: Session, id: string, value: string): Promise<Choice[]> {
  const c = s.config.find((x) => x.id === id);
  if (!c) throw new HttpError(400, `no option "${id}"; this session has: ${s.config.map((x) => x.id).join(", ") || "none"}`);
  if (!c.options.some((o) => o.value === value)) throw new HttpError(400, `"${value}" is not a choice for ${c.name}; choose one of ${c.options.map((o) => o.value).join(", ")}`);
  if (s.link) {
    // Kept here; the plugin applies it in the terminal right before the next message enters (a /model, a setModel, a model on the prompt).
    s.chosen[id] = value; s.config = s.config.map((x) => x.id === id ? { ...x, value } : x);
    persist(s); emit("author.config", { session: s.id, config: s.config });
    return s.config;
  }
  if (s.status === "running") throw new HttpError(409, "wait for the turn to finish");
  if (id === "effort" && s.agent.id === "claude") {
    if (s.prompted) throw new HttpError(409, "effort is set when the conversation starts; start a new conversation to change it");
    // Nothing has been said yet, so starting the agent over loses nothing (about two seconds).
    s.effort = value; s.closing = true; s.proc.kill(); s.conn?.close();
    await launch(s);
  } else {
    try {
      const r = await s.conn!.agent.request(acp.methods.agent.session.setConfigOption, { sessionId: s.acpSession!, configId: id, value });
      s.config = choices(s, r.configOptions);
      if (id === "model") s.model = value;
    } catch (e) { throw new HttpError(502, await explain(s, e)); }
  }
  persist(s);
  emit("author.config", { session: s.id, config: s.config });
  return s.config;
}
const persist = (s: Session) => writeFileSync(join(s.dir, "transcript.json"), JSON.stringify(view(s), null, 2) + "\n");

const tail = (s: Session) => s.stderr.split("\n").map((l) => l.trim()).filter(Boolean).slice(-3).join(" | ").slice(-400);

// A useful sentence for a failure: the process's exit and last stderr lines if it died, else the JSON-RPC error.
async function explain(s: Session, e: unknown): Promise<string> {
  await Promise.race([s.proc.exited, Bun.sleep(500)]);
  if (s.proc.exitCode !== null) return `${s.agent.bin} exited (code ${s.proc.exitCode})${tail(s) ? `: ${tail(s)}` : ""}`;
  const err = e as { code?: number; message?: string; data?: unknown };
  if (err.code === -32000) return `${s.agent.bin}: authentication required; ${s.agent.login}`;
  const data = err.data ? ` (${typeof err.data === "string" ? err.data : JSON.stringify(err.data)})` : "";
  return `${s.agent.bin}: ${err.message ?? String(e)}${data}`;
}

/** The agent process is gone or unusable: say so once. */
function dead(s: Session, message: string) {
  if (s.status === "error" || s.status === "closed") return;
  s.status = "error"; s.error = message; s.open = false;
  emit("author.turn", { session: s.id, status: "error", message });
  persist(s);
}

async function create(agentId?: string, machine_id?: string, effort?: string, link?: string): Promise<Session> {
  if (link) return createLinked(link, machine_id);
  const agent = agents.find((a) => a.id === (agentId ?? defaultAgent));
  if (!agent) throw new HttpError(400, agentId ? `unknown agent "${agentId}"; known: ${agents.map((a) => a.id).join(", ")}` : "no ACP agent installed (looked for claude, gemini, opencode, codex on PATH)");
  if (!agent.available) throw new HttpError(400, `${agent.name} is not installed (no ${agent.id} on PATH)`);
  const draft = machine_id ? store.machine(machine_id) : null;
  const id = "author_" + Math.random().toString(36).slice(2, 10);
  const dir = join(home, "author", id); mkdirSync(dir, { recursive: true });
  const s: Session = { id, agent, link: null, machine_id: machine_id ?? null, dir, dirs: [dir, realpathSync(dir)], status: "starting", transcript: [],
    draft, problems: draft ? checkDraft(draft) : [], drafts: [], prompted: false, proc: null as any, stderr: "", closing: false, open: false,
    config: [], effort: effort && EFFORTS.some(([v]) => v === effort) ? effort : null, model: null, chosen: {} };
  sessions.set(id, s);
  await launch(s);
  return s;
}

// A session driven by a connected agent (the person's own Claude Code, Pi or OpenCode, through its byoa connector): nothing is
// spawned; prompts go out on the wire and the agent draws through /mcp/author. One live session per agent:
// starting another closes the previous one, so the agent's draft_machine always lands in the designer that is open.
async function createLinked(link: string, machine_id?: string): Promise<Session> {
  const a = connectedAgent(link);
  if (!a) throw new HttpError(404, `no connected agent "${link}"; it may have gone`);
  for (const o of sessions.values()) if (o.link === link && !o.prompted) close(o);
  const draft = machine_id ? store.machine(machine_id) : null;
  const id = "author_" + Math.random().toString(36).slice(2, 10);
  const dir = join(home, "author", id); mkdirSync(dir, { recursive: true });
  const agent: AgentSpec = { id: a.host, name: a.name, bin: a.host, cmd: [], env: {}, login: "", available: true };
  const s: Session = { id, agent, link, machine_id: machine_id ?? null, dir, dirs: [dir], status: "idle", transcript: [],
    draft, problems: draft ? checkDraft(draft) : [], drafts: [], prompted: false, proc: null as any, stderr: "", closing: false, open: false,
    config: linkChoices(a.options, {}), effort: null, model: null, chosen: {} };
  sessions.set(id, s); persist(s);
  return s;
}
/** The live session a connected agent draws into: the newest one bound to it. */
const linked = (link: string) => [...sessions.values()].filter((s) => s.link === link && s.status !== "closed" && s.status !== "error").at(-1);
// The agent's settings changed (first sight, or the person changed the model in the terminal): the designer's pickers follow.
connectHooks.options = (link, options) => {
  const s = linked(link); if (!s) return;
  s.config = linkChoices(options, s.chosen); emit("author.config", { session: s.id, config: s.config });
};
// A message the designer sent over BYOA ended, as the connector reported it: the turn here ends the same way.
connectHooks.ended = (link, messageId, how, reason) => {
  const s = linked(link); if (!s || s.message !== messageId || s.status !== "running") return;
  s.status = "idle"; s.open = false;
  emit("author.message", { session: s.id, role: "agent", text: "", done: true });
  const status = how === "interrupted" || how === "withdrawn" ? "cancelled" : how === "done" ? "done" : "error";
  emit("author.turn", { session: s.id, status, ...(status === "error" ? { message: reason ? `${how}: ${reason}` : how === "gone" ? "the agent went away with this message" : "the agent's turn failed" } : {}) });
  persist(s);
};
// The agent's session went busy or idle (the drawing light); a designer message's end comes from its own events above.
connectHooks.turn = (link, status) => {
  const s = linked(link); if (!s) return;
  if (status === "running" && s.status === "idle") { s.status = "running"; emit("author.turn", { session: s.id, status: "running" }); }
  if (status === "done" && s.status === "running") {
    s.status = "idle"; s.open = false;
    emit("author.message", { session: s.id, role: "agent", text: "", done: true });
    emit("author.turn", { session: s.id, status: "done" });
    persist(s);
  }
};

/** Spawn the agent, initialize, open the ACP session with our MCP server. Throws HttpError(502) with a useful sentence. */
async function launch(s: Session) {
  const { agent, dir, id } = s;
  const proc = s.proc = Bun.spawn(agent.cmd, { cwd: dir, stdin: "pipe", stdout: "pipe", stderr: "pipe", env: { ...process.env, ...agent.env } });
  s.stderr = ""; s.closing = false; s.status = "starting";
  (async () => { const d = new TextDecoder(); for await (const c of proc.stderr) s.stderr = (s.stderr + d.decode(c)).slice(-8000); })();
  proc.exited.then((code) => { if (!s.closing && s.proc === proc) dead(s, `${agent.bin} exited (code ${code})${tail(s) ? `: ${tail(s)}` : ""}`); });

  const input = new WritableStream<Uint8Array>({ write(c) { proc.stdin.write(c); proc.stdin.flush(); }, close() { proc.stdin.end(); } });
  const conn = s.conn = acp.client({ name: "machine" })
    .onRequest(acp.methods.client.session.requestPermission, ({ params }) => permit(s, params))
    .onNotification(acp.methods.client.session.update, ({ params }) => update(s, params.update))
    .connect(acp.ndJsonStream(input, proc.stdout));
  try {
    const init = await conn.agent.request(acp.methods.agent.initialize, {
      protocolVersion: acp.PROTOCOL_VERSION, clientCapabilities: {}, clientInfo: { name: "machine", version: "0.0.1" } });
    const url = `${base}/mcp?author=${id}`;
    // MACHINE_AUTHOR_MCP=stdio forces the shim even for agents that speak HTTP MCP (to test the shim).
    const mcp: acp.McpServer = init.agentCapabilities?.mcpCapabilities?.http && process.env.MACHINE_AUTHOR_MCP !== "stdio"
      ? { type: "http", name: "machine", url, headers: [] }
      : { name: "machine", command: process.execPath, args: [shim, url], env: [] };
    // Claude Code's effort is a start-up option of its adapter (the CLI's --effort); other agents expose theirs as a config option.
    const meta = agent.id === "claude" && s.effort ? { claudeCode: { options: { effort: s.effort } } } : undefined;
    const r = await conn.agent.request(acp.methods.agent.session.new, { cwd: dir, mcpServers: [mcp], ...(meta ? { _meta: meta } : {}) });
    s.acpSession = r.sessionId; s.config = choices(s, r.configOptions);
    const model = s.config.find((c) => c.id === "model");
    if (s.model && model && model.value !== s.model && model.options.some((o) => o.value === s.model))
      s.config = choices(s, (await conn.agent.request(acp.methods.agent.session.setConfigOption, { sessionId: s.acpSession, configId: "model", value: s.model })).configOptions);
  } catch (e) {
    const message = await explain(s, e);
    dead(s, message); s.closing = true; proc.kill(); conn.close();
    throw new HttpError(502, message);
  }
  s.status = "idle"; persist(s);
}

// Permission: our two MCP tools and reads inside the scratch dir are allowed; everything else is denied.
const DENIED = "machine authoring only allows the draft_machine and get_draft tools and reading files in its scratch directory";
function pathsIn(raw: unknown): string[] {
  if (!raw || typeof raw !== "object") return [];
  const r = raw as Record<string, unknown>;
  return ["file_path", "path", "absolute_path", "filePath"].map((k) => r[k]).filter((v): v is string => typeof v === "string");
}
function permit(s: Session, p: acp.RequestPermissionRequest): acp.RequestPermissionResponse {
  const t = p.toolCall;
  const label = t.title ?? t.name ?? "a tool";
  const ours = /draft_machine|get_draft/.test(`${t.name ?? ""} ${t.title ?? ""}`);
  const paths = [...(t.locations ?? []).map((l) => l.path), ...pathsIn(t.rawInput)];
  const inside = paths.length > 0 && paths.every((x) => s.dirs.some((d) => { const r = resolve(d, x); return r === d || r.startsWith(d + sep); }));
  const allow = ours || ((t.kind === "read" || t.kind === "search") && inside);
  const opt = p.options.find((o) => o.kind === (allow ? "allow_once" : "reject_once")) ?? p.options.find((o) => o.kind.startsWith(allow ? "allow" : "reject"));
  if (!allow) {
    s.open = false;
    s.transcript.push({ ts: now(), role: "tool", id: t.toolCallId, title: `denied: ${label}`, status: "denied" });
    emit("author.tool", { session: s.id, id: t.toolCallId, title: `denied: ${label}`, status: "denied", message: DENIED });
  }
  return opt ? { outcome: { outcome: "selected", optionId: opt.optionId } } : { outcome: { outcome: "cancelled" } };
}

function update(s: Session, u: acp.SessionUpdate) {
  if (u.sessionUpdate === "agent_message_chunk" && u.content.type === "text" && u.content.text) {
    const last = s.transcript.at(-1);
    if (s.open && last?.role === "agent") last.text += u.content.text;
    else s.transcript.push({ ts: now(), role: "agent", text: u.content.text });
    s.open = true;
    emit("author.message", { session: s.id, role: "agent", text: u.content.text, done: false });
  } else if (u.sessionUpdate === "tool_call" || u.sessionUpdate === "tool_call_update") {
    s.open = false;
    let entry = s.transcript.find((e): e is Extract<Entry, { role: "tool" }> => e.role === "tool" && e.id === u.toolCallId && e.status !== "denied");
    if (!entry) { entry = { ts: now(), role: "tool", id: u.toolCallId, title: u.title ?? "tool", status: u.status ?? "pending" }; s.transcript.push(entry); }
    const before = `${entry.title}|${entry.status}`;
    if (u.title) entry.title = u.title;
    if (u.status) entry.status = u.status;
    if (u.sessionUpdate === "tool_call_update" && before === `${entry.title}|${entry.status}`) return;
    emit("author.tool", { session: s.id, id: entry.id, title: entry.title, status: entry.status });
  } else if (u.sessionUpdate === "config_option_update") {
    s.config = choices(s, u.configOptions);
    emit("author.config", { session: s.id, config: s.config });
  }
}

function preamble(s: Session, text: string) {
  const intro = readFileSync(promptFile, "utf8");
  const revising = s.machine_id
    ? `\n\n## This session\n\nYou are revising the published machine "${s.machine_id}". It is already the current draft: call get_draft to read it, keep its id, and call draft_machine with the whole revised definition after each change.\n`
    : "";
  const linkedNote = s.link
    ? `\n\n## Your connection\n\nYou are connected to the designer through your byoa connector's \`machine\` tool: draft_machine, get_draft and say are its actions (action: "draft_machine" | "get_draft" | "say"). What you print in the terminal does not reach the designer: reply with \`say\` (a few lines) and draw with \`draft_machine\`. When you are done, just end your turn.\n`
    : "";
  return `${intro}${revising}${linkedNote}\n\n## What the person said\n\n${text}`;
}

/** Hand a message to the linked agent. An agent that stopped polling gets it when it is back; the designer shows it waiting. */
async function send(s: Session, d: Delivery) {
  try { s.message = await deliver(s.link!, d); }
  catch (e) { s.status = "idle"; emit("author.turn", { session: s.id, status: "error", message: (e as Error).message }); }
}

function prompt(s: Session, text: string) {
  if (s.status === "running") throw new HttpError(409, "a turn is already running; wait for author.turn or cancel it");
  if (s.status !== "idle") throw new HttpError(409, `session is ${s.status}${s.error ? `: ${s.error}` : ""}`);
  const body = s.prompted ? text : preamble(s, text);
  s.prompted = true; s.open = false; s.status = "running";
  if (!s.link && s.config.some((c) => c.id === "effort" && !c.fixed)) { s.config = s.config.map((c) => c.id === "effort" ? { ...c, fixed: true } : c); emit("author.config", { session: s.id, config: s.config }); }
  s.transcript.push({ ts: now(), role: "user", text });
  emit("author.message", { session: s.id, role: "user", text, done: true });
  emit("author.turn", { session: s.id, status: "running" });
  persist(s);
  if (s.link) {
    // The connector frames the message (app, origin, who) and holds it until the session is idle.
    const wake = `Designer session ${s.id}.\n\n${body}`;
    void send(s, { id: "m_" + Math.random().toString(36).slice(2, 10), session: s.id, text: wake, ...(Object.keys(s.chosen).length ? { set: { ...s.chosen } } : {}) });
    return;
  }
  (async () => {
    try {
      const r = await s.conn!.agent.request(acp.methods.agent.session.prompt, { sessionId: s.acpSession!, prompt: [{ type: "text", text: body }] });
      s.open = false; s.status = "idle";
      emit("author.message", { session: s.id, role: "agent", text: "", done: true });
      const odd = r.stopReason !== "end_turn" && r.stopReason !== "cancelled";
      emit("author.turn", { session: s.id, status: r.stopReason === "cancelled" ? "cancelled" : "done", ...(odd ? { message: `the agent stopped: ${r.stopReason}` } : {}) });
    } catch (e) {
      const message = await explain(s, e);
      if (s.proc.exitCode !== null || s.closing) dead(s, message);
      else { s.open = false; s.status = "idle"; emit("author.turn", { session: s.id, status: "error", message }); }
    }
    if (!s.closing) persist(s);
  })();
}

function close(s: Session) {
  s.closing = true; s.status = "closed"; persist(s);
  s.conn?.close(); s.proc?.kill(); sessions.delete(s.id);
}
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => { for (const s of sessions.values()) close(s); process.exit(0); });

// ---------- MCP tools (registered on the same /mcp server as the run tools) ----------

const ok = (v: Record<string, unknown>) => ({ content: [{ type: "text" as const, text: JSON.stringify(v, null, 2) }], structuredContent: v });

export function draftMachine(author: string | null, input: unknown) {
  let m = input;
  if (typeof m === "string") {
    try { m = JSON.parse(m); }
    catch (e) { return { ok: false, problems: [`machine was a string that is not valid JSON (${(e as Error).message}); send the definition as an object`] }; }
  }
  const s = author ? sessions.get(author) : undefined;
  const id = (m as { id?: unknown } | null)?.id;
  if (s?.machine_id && id !== s.machine_id)
    return { ok: false, problems: [`id must stay "${s.machine_id}": this session revises that machine. Draft not stored; send it again with id "${s.machine_id}".`] };
  const problems = checkDraft(m);
  if (!s) return { ok: problems.length === 0, problems, note: author ? `no authoring session "${author}"; checked but not stored` : "not attached to an authoring session; checked but not stored" };
  s.draft = m as Machine; s.problems = problems; s.drafts.push({ ts: now(), problems });
  // A connected agent's plugin sends no tool_call updates (ACP does), so the draft itself is the tool row the person sees.
  if (s.link) {
    const id = "draft_" + s.drafts.length; s.open = false;
    s.transcript.push({ ts: now(), role: "tool", id, title: "draft_machine", status: "completed" });
    emit("author.tool", { session: s.id, id, title: "draft_machine", status: "completed" });
  }
  emit("author.draft", { session: s.id, machine: m, problems });
  persist(s);
  return { ok: problems.length === 0, problems };
}

/** The session a tools/call is for: /mcp?author=<session> (an ACP child), or the BYOA session the call's token and _meta
 * named on /mcp/author (link, checked by main.ts). */
function sessionOf(req: Request | undefined, team: string, link?: string): { author: string | null; s: Session | undefined } {
  if (link) { const s = linked(link); return { author: s?.id ?? link, s }; }
  const author = req ? new URL(req.url).searchParams.get("author") : null;
  if (author) return { author, s: sessions.get(author) };
  return { author: null, s: undefined };
}
export function registerAuthorTools(server: McpServer, req?: Request, team = "local", link?: string) {
  const { author, s: found } = sessionOf(req, team, link);
  server.registerTool("say", {
    description: "Authoring tool (connected agents). A short note for the person beside the drawing: what you drew, what you chose, one question at most. A few lines.",
    inputSchema: z.object({ text: z.string() }),
  }, async ({ text }) => {
    const s = found && sessions.get(found.id);
    if (!s) return ok({ ok: false, note: author ? `no authoring session for "${author}"` : "not attached to an authoring session" });
    s.open = false; s.transcript.push({ ts: now(), role: "agent", text });
    emit("author.message", { session: s.id, role: "agent", text, done: true });
    persist(s);
    return ok({ ok: true });
  });
  server.registerTool("draft_machine", {
    description: "Authoring tool (used while a person describes a machine in the editor; not part of running one). " +
      "Send the whole machine definition, partial is fine. It is checked against the schema and the validator, stored as this " +
      "session's current draft, and drawn for the person. Returns ok and problems: fix each problem and call again.",
    inputSchema: z.object({ machine: z.union([z.record(z.string(), z.unknown()), z.string()]).describe("The full machine definition JSON") }),
  }, async ({ machine }) => ok(draftMachine(found?.id ?? author, machine)));
  server.registerTool("get_draft", {
    description: "Authoring tool. The current draft of this authoring session and its problems (draft is null before the first draft_machine).",
  }, async () => {
    const s = found && sessions.get(found.id);
    return ok(s ? { draft: s.draft, problems: s.problems } : { draft: null, problems: [], note: "not attached to an authoring session" });
  });
}

// ---------- HTTP: mounted at /api/author ----------

export const authorApi = new Hono();
const fail = (c: Context, e: unknown) => {
  if (e instanceof HttpError) return c.json({ error: e.message }, e.status);
  if (e instanceof MachineError) return c.json({ error: e.message }, e.code.endsWith("not_found") ? 404 : 400);
  throw e;
};
const get = (id: string) => {
  const s = sessions.get(id);
  if (!s) throw new HttpError(404, `no live authoring session "${id}"`);
  return s;
};

authorApi.get("/agents", (c) => c.json(agents.map((a) => ({ id: a.id, name: a.name, available: a.available, default: a.id === defaultAgent }))));
authorApi.get("/connected", (c) => c.json(agentsOf((c as any).get("team") ?? "local")));
authorApi.get("/sessions", (c) => c.json([...sessions.values()].map((s) => ({ id: s.id, agent: s.agent.id, machine_id: s.machine_id, status: s.status }))));
authorApi.post("/sessions", async (c) => {
  try {
    const b = await c.req.json().catch(() => ({}));
    const s = await create(b.agent, b.machine_id, b.effort, typeof b.connect === "string" ? b.connect : undefined);
    return c.json({ id: s.id, agent: s.agent.id, config: s.config, draft: s.draft, problems: s.problems });
  } catch (e) { return fail(c, e); }
});
authorApi.get("/sessions/:id", (c) => {
  const id = c.req.param("id");
  const s = sessions.get(id);
  if (s) return c.json(view(s));
  // Not live (server restarted, or deleted): the transcript file still shows the conversation.
  const f = join(home, "author", id, "transcript.json");
  if (!/^author_[a-z0-9]+$/.test(id) || !existsSync(f)) return c.json({ error: `no authoring session "${id}"` }, 404);
  const saved = JSON.parse(readFileSync(f, "utf8"));
  return c.json({ ...saved, status: "closed" });
});
authorApi.post("/sessions/:id/prompt", async (c) => {
  try {
    const s = get(c.req.param("id"));
    const { text } = await c.req.json().catch(() => ({ text: "" }));
    if (typeof text !== "string" || !text.trim()) throw new HttpError(400, "text is required");
    prompt(s, text);
    return c.json({ ok: true });
  } catch (e) { return fail(c, e); }
});
authorApi.post("/sessions/:id/config", async (c) => {
  try {
    const s = get(c.req.param("id"));
    const { id, value } = await c.req.json().catch(() => ({}));
    if (typeof id !== "string" || typeof value !== "string") throw new HttpError(400, "id and value are required");
    return c.json({ config: await configure(s, id, value) });
  } catch (e) { return fail(c, e); }
});
authorApi.post("/sessions/:id/cancel", async (c) => {
  try {
    const s = get(c.req.param("id"));
    // Linked: the outcome comes back as the message's own event (withdrawn, or interrupted once the connector aborts): connectHooks.ended.
    if (s.link) { if (s.status === "running" && s.message) await interrupt(s.link, s.message); }
    else if (s.status === "running") await s.conn!.agent.notify(acp.methods.agent.session.cancel, { sessionId: s.acpSession! });
    return c.json({ ok: true, status: s.status });
  } catch (e) { return fail(c, e); }
});
authorApi.delete("/sessions/:id", (c) => {
  try { close(get(c.req.param("id"))); return c.json({ ok: true }); } catch (e) { return fail(c, e); }
});
