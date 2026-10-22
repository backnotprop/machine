// Reference engine: the part that makes the path deterministic.
// The model reads SKILL.md for the map; this engine enforces the map.
// No dependencies. Storage is behind the RunStore interface.
import { provider } from "./providers.ts";

// ---------- Machine definition (authored in the UI) ----------

export type FieldType = "string" | "number" | "boolean" | "array" | "object";
export interface Field { type: FieldType; description?: string; required?: boolean; enum?: string[] }
export interface Requirement { id: string; description: string; check: string; required?: boolean }
export interface Transition { to: string; description?: string; actor?: "agent" | "human" }
/** A credential the machine needs; the team binds a stored credential to the slot id on the hosted server */
export interface CredentialSlot {
  id: string;
  /** key of the provider catalog (providers.ts) */
  provider: string;
  scopes?: string[];
  /** shown on the Connect button */
  why?: string;
  /** may the raw value be handed to the agent (the `credential` tool); default false */
  handoff?: boolean;
  /** `http` provider only: where the `request` tool sends calls */
  base_url?: string;
}
export interface State {
  kind: "task" | "decision" | "wait" | "final";
  title: string;
  instructions?: string;
  /** what a human wrote when they unblocked the run or fired an event, and the agent has not acted since; read it first */
  human_note?: string;
  requirements?: Requirement[];
  /** slots live while the run is in this state; absent means every slot */
  credentials?: string[];
  output?: Record<string, Field>;
  on?: Record<string, Transition>;
  outcome?: "success" | "failure"; // final only
}
export interface Machine {
  id: string;
  version: number;
  name: string;
  description: string;
  inputs?: Record<string, Field>;
  requirements?: Requirement[];
  credentials?: CredentialSlot[];
  initial: string;
  states: Record<string, State>;
}

// ---------- Run (instance) ----------

export type RunStatus = "running" | "waiting" | "blocked" | "succeeded" | "failed" | "cancelled";
export interface PreflightResult { id: string; ok: boolean; detail?: string }
export interface HistoryEntry {
  ts: string; type: "begin" | "transition" | "note" | "error" | "rejected" | "unblock" | "cancel" | "credential";
  actor: "agent" | "human" | "system";
  from?: string; event?: string; to?: string; payload?: unknown; note?: string; progress?: number;
  error?: RunError;
  /** type credential: one use of a stored credential by this run */
  credential?: { id: string; slot: string; provider: string; name: string; account?: string };
  via?: "lease" | "proxy" | "handoff";
  /** member whose token asked */
  by?: string;
  /** lease: program and subcommand of the child, no arguments */
  command?: string;
  /** proxy: "METHOD /path" */
  request?: string;
  /** handoff: the agent received the raw value */
  exposed?: boolean;
}
export interface RunError { code: string; message: string; needs?: string[] }
export interface Run {
  id: string;
  machine: { id: string; version: number };
  status: RunStatus;
  state: string;
  inputs: Record<string, unknown>;
  preflight: PreflightResult[];
  history: HistoryEntry[];
  error: RunError | null;
  agent?: { name?: string; session?: string };
  created_at: string;
  updated_at: string;
}

// What the agent gets back after begin/transition: everything needed for the next step, nothing more.
export interface StateCard {
  run_id: string;
  status: RunStatus;
  /** true only when the agent should act on this card */
  your_move: boolean;
  /** present when your_move is false: what to do instead (stop, wait for human, ...) */
  stop_reason?: string;
  state: string;
  kind: State["kind"];
  title: string;
  instructions?: string;
  /** what a human wrote when they unblocked the run or fired an event, and the agent has not acted since; read it first */
  human_note?: string;
  requirements?: Requirement[];
  /** hosted only: the slots live in this state and how to use them */
  credentials?: { id: string; provider: string; use: string }[];
  output?: Record<string, Field>;
  events: { name: string; to: string; description?: string; actor: "agent" | "human" }[];
  outcome?: "success" | "failure";
}

export class MachineError extends Error {
  constructor(public code: string, message: string, public details?: unknown) { super(message); }
}

// ---------- Validation of the definition itself ----------

export function validateMachine(m: Machine): string[] {
  const errs: string[] = [];
  if (!m.id || !/^[a-z0-9][a-z0-9-]*$/.test(m.id)) errs.push("id must be kebab-case");
  if (!Number.isInteger(m.version) || m.version < 1) errs.push("version must be a positive integer");
  if (!m.states || Object.keys(m.states).length === 0) errs.push("states must not be empty");
  if (!m.states?.[m.initial]) errs.push(`initial state "${m.initial}" does not exist`);
  const finals = Object.values(m.states ?? {}).filter((s) => s.kind === "final");
  if (finals.length === 0) errs.push("at least one final state is required");
  for (const [id, s] of Object.entries(m.states ?? {})) {
    if (s.kind === "final") {
      if (!s.outcome) errs.push(`final state "${id}" needs outcome: success | failure`);
      if (s.on && Object.keys(s.on).length) errs.push(`final state "${id}" must not have transitions`);
      continue;
    }
    if (!s.on || Object.keys(s.on).length === 0) errs.push(`state "${id}" has no transitions and is not final`);
    for (const [ev, t] of Object.entries(s.on ?? {})) {
      if (!m.states[t.to]) errs.push(`state "${id}" event "${ev}" targets unknown state "${t.to}"`);
      if (s.kind === "wait" && t.actor !== "human") errs.push(`wait state "${id}" event "${ev}" must have actor: human`);
      if (s.kind !== "wait" && t.actor === "human") errs.push(`state "${id}" event "${ev}" has actor: human but state kind is not wait`);
    }
    if (s.kind === "task" && !s.instructions) errs.push(`task state "${id}" needs instructions`);
  }
  // Reachability: every state reachable from initial.
  const seen = new Set<string>(); const stack = [m.initial];
  while (stack.length) { const cur = stack.pop()!; if (seen.has(cur)) continue; seen.add(cur);
    for (const t of Object.values(m.states?.[cur]?.on ?? {})) stack.push(t.to); }
  for (const id of Object.keys(m.states ?? {})) if (!seen.has(id)) errs.push(`state "${id}" is unreachable from initial`);
  // Credentials: known providers, unique slot ids, states only name declared slots.
  const slots = new Set<string>();
  for (const c of m.credentials ?? []) {
    if (!c.id || !/^[a-z0-9][a-z0-9_-]*$/.test(c.id)) errs.push(`credential slot id "${c.id}" must be lowercase letters, digits, - or _`);
    if (slots.has(c.id)) errs.push(`duplicate credential slot "${c.id}"`);
    slots.add(c.id);
    const p = provider(c.provider);
    if (!p) errs.push(`credential slot "${c.id}" uses unknown provider "${c.provider}"`);
    else if (!p.proxy?.base_url && p.proxy && !c.base_url) errs.push(`credential slot "${c.id}" (${c.provider}) needs base_url`);
  }
  for (const [id, s] of Object.entries(m.states ?? {}))
    for (const c of s.credentials ?? []) if (!slots.has(c)) errs.push(`state "${id}" references undeclared credential slot "${c}"`);
  return errs;
}

/** The slots live in a state: the state's list, or every slot when it has none. */
export const liveSlots = (m: Machine, state: string): CredentialSlot[] =>
  (m.credentials ?? []).filter((c) => !m.states[state]?.credentials || m.states[state].credentials!.includes(c.id));

// ---------- Field checks (shared by inputs and state outputs) ----------

export function checkFields(spec: Record<string, Field> | undefined, value: unknown): string[] {
  if (!spec) return [];
  const errs: string[] = [];
  const obj = (value ?? {}) as Record<string, unknown>;
  if (typeof obj !== "object" || Array.isArray(obj)) return ["payload must be an object"];
  for (const [k, f] of Object.entries(spec)) {
    const v = obj[k];
    if (v === undefined || v === null) { if (f.required) errs.push(`missing required field "${k}"`); continue; }
    const t = Array.isArray(v) ? "array" : typeof v;
    if (t !== f.type) errs.push(`field "${k}" must be ${f.type}, got ${t}`);
    if (f.enum && !f.enum.includes(String(v))) errs.push(`field "${k}" must be one of ${f.enum.join(", ")}`);
  }
  for (const k of Object.keys(obj)) if (!(k in spec)) errs.push(`unexpected field "${k}"`);
  return errs;
}

// ---------- Store ----------
// The engine only needs these six operations; see sqlite-store.ts.
export interface RunStore {
  machines(): Machine[];
  machine(id: string, version?: number): Machine;
  saveMachine(m: Machine): void;
  run(id: string): Run;
  saveRun(r: Run): void;
  runs(): Run[];
}

// Answered by the hosted store: is this machine's slot bound to a credential that works? Absent in local mode,
// where the engine then says nothing about credentials and behaves as before.
export interface CredentialStatus { ok: boolean; name?: string; account?: string; reason?: string; connect_url?: string }
export type CredentialCheck = (machine_id: string, slot: CredentialSlot) => CredentialStatus;

const now = () => new Date().toISOString();
export const newId = () => "run_" + Math.random().toString(36).slice(2, 10);

// ---------- Engine: the tool surface ----------

export class Engine {
  constructor(private store: RunStore, private credentials?: CredentialCheck) {}

  // The store's answer per slot, in declaration order. Empty when there is no store answer (local mode) or no slots.
  private credentialStatus(m: Machine) {
    if (!this.credentials) return [];
    return (m.credentials ?? []).map((c) => ({ id: c.id, provider: c.provider, ...this.credentials!(m.id, c) }));
  }

  /** Pure. Tells the agent what to check before begin; validates inputs. */
  preflight(machine_id: string, inputs: Record<string, unknown>) {
    const m = this.store.machine(machine_id);
    const input_errors = checkFields(m.inputs, inputs);
    const credentials = this.credentialStatus(m);
    return { machine: { id: m.id, version: m.version, name: m.name }, inputs_ok: input_errors.length === 0,
      input_errors, requirements: (m.requirements ?? []).map((r) => ({ ...r, required: r.required !== false })),
      ...(credentials.length ? { credentials } : {}) };
  }

  begin(machine_id: string, inputs: Record<string, unknown>, preflight: PreflightResult[], agent?: Run["agent"]): StateCard {
    const m = this.store.machine(machine_id);
    const input_errors = checkFields(m.inputs, inputs);
    if (input_errors.length) throw new MachineError("invalid_inputs", input_errors.join("; "), input_errors);
    const reqs = m.requirements ?? [];
    const reported = new Map(preflight.map((p) => [p.id, p]));
    const unknown = preflight.filter((p) => !reqs.some((r) => r.id === p.id)).map((p) => p.id);
    if (unknown.length) throw new MachineError("unknown_requirement", `preflight reports unknown requirement(s): ${unknown.join(", ")}`);
    const missing = reqs.filter((r) => r.required !== false && !reported.has(r.id)).map((r) => r.id);
    if (missing.length) throw new MachineError("preflight_incomplete", `preflight missing result(s) for: ${missing.join(", ")}`, missing);
    const failed = reqs.filter((r) => r.required !== false && reported.get(r.id)?.ok === false);
    const unbound = this.credentialStatus(m).filter((c) => !c.ok);

    const run: Run = { id: newId(), machine: { id: m.id, version: m.version }, status: "running", state: m.initial,
      inputs, preflight, history: [], error: null, agent, created_at: now(), updated_at: now() };
    run.history.push({ ts: now(), type: "begin", actor: "agent", to: m.initial });
    if (failed.length || unbound.length) {
      run.status = "blocked";
      const why = (c: typeof unbound[number]) => m.credentials!.find((s) => s.id === c.id)?.why;
      run.error = failed.length
        ? { code: "preflight_failed", message: `required check(s) failed: ${failed.map((f) => f.id).join(", ")}${unbound.length ? `; credential(s) not connected: ${unbound.map((c) => c.id).join(", ")}` : ""}` }
        : { code: "credentials_missing", message: `credential(s) not connected: ${unbound.map((c) => c.id).join(", ")}` };
      run.error.needs = [
        ...failed.map((f) => `${f.description}${reported.get(f.id)?.detail ? ` (${reported.get(f.id)!.detail})` : ""}`),
        ...unbound.map((c) => `Connect ${c.id} for ${m.name}${why(c) ? ` (${why(c)})` : ""}: ${c.connect_url ?? c.reason ?? "not connected"}`),
      ];
      run.history.push({ ts: now(), type: "error", actor: "agent", error: run.error });
    }
    this.store.saveRun(run);
    return this.card(run, m);
  }

  transition(run_id: string, event: string, payload?: unknown, note?: string, actor: "agent" | "human" = "agent"): StateCard {
    try { return this.applyTransition(run_id, event, payload, note, actor); }
    catch (e) {
      if (e instanceof MachineError && actor === "agent" && e.code !== "run_not_found") {
        const run = this.store.run(run_id);
        run.history.push({ ts: now(), type: "rejected", actor, from: run.state, event, payload, error: { code: e.code, message: e.message } });
        this.store.saveRun(run);
      }
      throw e;
    }
  }

  private applyTransition(run_id: string, event: string, payload: unknown, note: string | undefined, actor: "agent" | "human"): StateCard {
    const run = this.store.run(run_id);
    const m = this.store.machine(run.machine.id, run.machine.version);
    const state = m.states[run.state];
    if (actor === "agent" && run.status !== "running")
      throw new MachineError("run_not_running", `run is ${run.status}; ${this.hint(run)}`);
    if (actor === "human" && run.status !== "waiting" && run.status !== "running")
      throw new MachineError("run_not_running", `run is ${run.status}`);
    const t = state.on?.[event];
    if (!t) throw new MachineError("invalid_event", `event "${event}" is not allowed from state "${run.state}". Allowed: ${Object.keys(state.on ?? {}).join(", ") || "(none)"}`);
    const needed = t.actor ?? "agent";
    if (needed !== actor) throw new MachineError("wrong_actor", `event "${event}" must be fired by ${needed}, not ${actor}`);
    if (actor === "agent") {
      const errs = checkFields(state.output, payload);
      if (errs.length) throw new MachineError("invalid_payload", `payload for state "${run.state}" is invalid: ${errs.join("; ")}`, errs);
    }
    run.history.push({ ts: now(), type: "transition", actor, from: run.state, event, to: t.to, payload, note });
    run.state = t.to;
    const next = m.states[t.to];
    run.status = next.kind === "final" ? (next.outcome === "success" ? "succeeded" : "failed") : next.kind === "wait" ? "waiting" : "running";
    this.store.saveRun(run);
    return this.card(run, m);
  }

  note(run_id: string, note: string, progress?: number) {
    const run = this.store.run(run_id);
    if (run.status === "succeeded" || run.status === "failed" || run.status === "cancelled")
      throw new MachineError("run_finished", `run is ${run.status}`);
    if (progress !== undefined && (typeof progress !== "number" || progress < 0 || progress > 100))
      throw new MachineError("invalid_progress", "progress is a percentage 0-100");
    run.history.push({ ts: now(), type: "note", actor: "agent", note, progress });
    this.store.saveRun(run);
    return { ok: true, state: run.state, status: run.status };
  }

  /** Agent cannot proceed. Blocked by default (human can fix and unblock); fatal moves to failed. */
  fail(run_id: string, code: string, message: string, needs?: string[], fatal = false) {
    const run = this.store.run(run_id);
    if (run.status !== "running") throw new MachineError("run_not_running", `run is ${run.status}`);
    run.error = { code, message, needs };
    run.status = fatal ? "failed" : "blocked";
    run.history.push({ ts: now(), type: "error", actor: "agent", error: run.error });
    this.store.saveRun(run);
    return { ok: true, status: run.status, state: run.state };
  }

  /** Human action from the UI after fixing what the agent needed. */
  unblock(run_id: string, note?: string): StateCard {
    const run = this.store.run(run_id);
    if (run.status !== "blocked") throw new MachineError("run_not_blocked", `run is ${run.status}`);
    run.status = "running"; run.error = null;
    run.history.push({ ts: now(), type: "unblock", actor: "human", note });
    this.store.saveRun(run);
    return this.card(run, this.store.machine(run.machine.id, run.machine.version));
  }

  cancel(run_id: string, note?: string) {
    const run = this.store.run(run_id);
    run.status = "cancelled"; run.history.push({ ts: now(), type: "cancel", actor: "human", note });
    this.store.saveRun(run); return { ok: true };
  }

  get(run_id: string): StateCard { const run = this.store.run(run_id); return this.card(run, this.store.machine(run.machine.id, run.machine.version)); }

  /** Lease and proxy: the slots this run may use right now. Throws run_not_running, credential_not_live (naming where it is). */
  liveCredentials(run_id: string, slot?: string): { run: Run; slots: CredentialSlot[] } {
    const run = this.store.run(run_id);
    if (run.status !== "running") throw new MachineError("run_not_running", `run is ${run.status}; ${this.hint(run)}`);
    const m = this.store.machine(run.machine.id, run.machine.version);
    const live = liveSlots(m, run.state);
    if (slot === undefined) return { run, slots: live };
    const s = live.find((c) => c.id === slot);
    if (s) return { run, slots: [s] };
    const where = Object.keys(m.states).filter((id) => ["task", "decision"].includes(m.states[id].kind) && liveSlots(m, id).some((c) => c.id === slot));
    if (!where.length) throw new MachineError("credential_unknown", `machine "${m.id}" has no credential slot "${slot}"`);
    throw new MachineError("credential_not_live", `credential "${slot}" is not live in state "${run.state}"; it is live in: ${where.join(", ")}`);
  }

  /** One use of a credential (lease, proxy or handoff) goes on the timeline. */
  credentialUsed(run_id: string, use: Pick<HistoryEntry, "credential" | "via" | "by" | "command" | "request" | "exposed">) {
    const run = this.store.run(run_id);
    run.history.push({ ts: now(), type: "credential", actor: "agent", ...use });
    this.store.saveRun(run);
  }

  private hint(run: Run) {
    if (run.status === "blocked") return `error ${run.error?.code}: ${run.error?.message}. Wait for a human to unblock.`;
    if (run.status === "waiting") return "a human must fire the next event from the UI.";
    return "it is finished.";
  }

  // The latest note a human left (on unblock or a human-fired event) that the agent has not acted on yet.
  private humanNote(run: Run): string | undefined {
    for (let i = run.history.length - 1; i >= 0; i--) {
      const h = run.history[i];
      if (h.actor === "agent" && (h.type === "begin" || h.type === "transition" || h.type === "note")) return undefined;
      if ((h.type === "unblock" || (h.type === "transition" && h.actor === "human")) && h.note) return h.note;
    }
    return undefined;
  }

  private card(run: Run, m: Machine): StateCard {
    const s = m.states[run.state];
    const base = { run_id: run.id, status: run.status, state: run.state, kind: s.kind, title: s.title, outcome: s.outcome,
      ...(run.error ? { error: run.error } : {}) };
    if (run.status !== "running") {
      const stop_reason =
        run.status === "blocked" ? `Stop. The run is blocked (${run.error?.code}: ${run.error?.message}). A human must resolve: ${(run.error?.needs ?? []).join("; ") || "see message"}. Do not try to fix this yourself; do not transition. When they unblock the run, \`get\` returns this state again with their note in \`human_note\`.` :
        run.status === "waiting" ? `Stop. A human decides the next step from the UI (${Object.keys(s.on ?? {}).join(" or ")}). Report anything they need to know with note, then end your turn.` :
        `Stop. The run is finished with status ${run.status}. Nothing further to do.`;
      return { ...base, your_move: false, stop_reason, events: [] };
    }
    const events = Object.entries(s.on ?? {}).map(([name, t]) => ({ name, to: t.to, description: t.description, actor: t.actor ?? "agent" }));
    const human_note = this.humanNote(run);
    const credentials = this.credentials ? liveSlots(m, run.state).map((c) => ({ id: c.id, provider: c.provider,
      use: `machine run ${run.id} -- ${(provider(c.provider)?.cli ?? "<command>").replaceAll("<SLOT>", c.id.toUpperCase().replace(/[^A-Z0-9]/g, "_"))}${provider(c.provider)?.proxy ? "; or the request tool" : ""}` })) : [];
    return { ...base, your_move: true, instructions: s.instructions, ...(human_note ? { human_note } : {}), requirements: s.requirements,
      ...(credentials.length ? { credentials } : {}), output: s.output, events };
  }
}
