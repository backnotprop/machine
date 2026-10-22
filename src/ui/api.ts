// Data layer: JSON API plus one SSE stream. Types mirror src/engine/engine.ts.
import { useEffect, useState } from "react";
import type { Machine, Run, StateCard, HistoryEntry } from "../engine/engine.ts";
export type { Machine, Run, StateCard, HistoryEntry };

export interface RunSummary {
  id: string; machine: { id: string; version: number }; status: Run["status"]; state: string;
  error: Run["error"]; agent?: Run["agent"]; created_at: string; updated_at: string;
  /** hosted: the member whose key started the run */
  by?: string;
}

// A 401 from anywhere means the session ended: the app shows the sign-in gate (hosted only; local never answers 401).
let signedOut = false; const gateListeners = new Set<(g: boolean) => void>();
const gate = (res: Response) => { if (res.status === 401 && !signedOut) { signedOut = true; for (const l of gateListeners) l(true); } return res; };
const j = async <T,>(r: Promise<Response>): Promise<T> => { const res = gate(await r); if (!res.ok) throw new Error(await res.text()); return res.json(); };
export const api = {
  runs: () => j<RunSummary[]>(fetch("/api/runs")),
  run: (id: string) => j<Run>(fetch(`/api/runs/${id}`)),
  machines: () => j<Machine[]>(fetch("/api/machines")),
  machine: (id: string, version?: number) => j<Machine>(fetch(`/api/machines/${id}${version ? `?version=${version}` : ""}`)),
  importMachine: (m: unknown) => jpost<{ id: string; version: number; name: string }>("/api/machines/import", m),
  publish: (m: Machine) => j<{ id: string; version: number; path: string }>(fetch(`/api/machines/${m.id}/publish`, { method: "POST", body: JSON.stringify(m) })),
  transition: (id: string, event: string, note?: string) => j<StateCard>(fetch(`/api/runs/${id}/transition`, { method: "POST", body: JSON.stringify({ event, note }) })),
  unblock: (id: string, note?: string) => j<StateCard>(fetch(`/api/runs/${id}/unblock`, { method: "POST", body: JSON.stringify({ note }) })),
  cancel: (id: string) => j<unknown>(fetch(`/api/runs/${id}/cancel`, { method: "POST", body: "{}" })),
};

type Listener = (summary: RunSummary, appended: HistoryEntry[]) => void;
const listeners = new Set<Listener>();
let source: EventSource | null = null;
function ensureStream() {
  if (source) return;
  source = new EventSource("/events");
  source.onopen = () => setConnected(true);
  source.onerror = () => setConnected(false);
  for (const t of ["author.message", "author.tool", "author.draft", "author.turn", "author.config"] as const)
    source.addEventListener(t, (e) => { const d = JSON.parse((e as MessageEvent).data); for (const l of authorListeners) l(t, d); });
  source.addEventListener("connect.agents", (e) => { const d = JSON.parse((e as MessageEvent).data) as ConnectedAgent[]; for (const l of agentListeners) l(d); });
  source.addEventListener("run", (e) => {
    const { run, appended } = JSON.parse((e as MessageEvent).data);
    const summary: RunSummary = { id: run.id, machine: run.machine, status: run.status, state: run.state, error: run.error, agent: run.agent, created_at: run.created_at, updated_at: run.updated_at };
    for (const l of listeners) l(summary, appended);
  });
}
// Connection state, shown only when it drops.
let connected = true; const connListeners = new Set<(c: boolean) => void>();
function setConnected(c: boolean) { if (c !== connected) { connected = c; for (const l of connListeners) l(c); } }
export function useConnected() {
  const [c, setC] = useState(connected);
  useEffect(() => { ensureStream(); connListeners.add(setC); return () => { connListeners.delete(setC); }; }, []);
  return c;
}
// ---------- describe it: the authoring API (src/server/author.ts) ----------
export type AuthorEvent =
  | ["author.message", { session: string; role: "agent" | "user"; text: string; done: boolean }]
  | ["author.tool", { session: string; id: string; title: string; status: string; message?: string }]
  | ["author.draft", { session: string; machine: unknown; problems: string[] }]
  | ["author.turn", { session: string; status: "running" | "done" | "cancelled" | "error"; message?: string }]
  | ["author.config", { session: string; config: Choice[] }];
type AuthorListener = (type: AuthorEvent[0], data: any) => void;
const authorListeners = new Set<AuthorListener>();
export function onAuthor(l: AuthorListener) { ensureStream(); authorListeners.add(l); return () => { authorListeners.delete(l); }; }
export interface AuthorAgent { id: string; name: string; available: boolean; default: boolean }
/** An agent connected through its plugin (src/server/connect.ts). id has slashes: `${team}/${host}/${session}`. connected: polled in the last 30 s. */
export interface ConnectedAgent { id: string; host: string; name: string; cwd: string; session: string; busy: boolean; connected: boolean; last_poll: string; options?: { id: string; name: string; value: string; options: { value: string; name: string }[] }[] }
const agentListeners = new Set<(a: ConnectedAgent[]) => void>();
export function onConnectedAgents(l: (a: ConnectedAgent[]) => void) { ensureStream(); agentListeners.add(l); return () => { agentListeners.delete(l); }; }
/** A session option the agent lets you set: which model, how much effort. fixed: can no longer change in this conversation. */
export interface Choice { id: string; name: string; category: "model" | "thought_level"; value: string; fixed?: boolean; options: { value: string; name: string; description?: string }[] }
export type TranscriptEntry = { ts: string; role: "agent" | "user"; text: string } | { ts: string; role: "tool"; id: string; title: string; status: string };
export interface AuthorSession { id: string; agent: string; agent_name?: string; link?: string | null; machine_id: string | null; status: "starting" | "idle" | "running" | "error" | "closed"; error: string | null; prompted: boolean; config: Choice[]; transcript: TranscriptEntry[]; draft: unknown; problems: string[]; drafts: { ts: string; problems: string[] }[] }
const jpost = async <T,>(url: string, body?: unknown, method = "POST"): Promise<T> => {
  const res = gate(await fetch(url, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }));
  const b = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(b.error ?? `${res.status}`, res.status, b.message ?? b.reason);
  return b as T;
};
export class ApiError extends Error { constructor(public code: string, public status: number, public detail?: string) { super(detail ?? code); } }

// ---------- who you are: /api/me (src/server/auth.ts). Local mode: user null, team "local"; hosted: 401 when signed out ----------
export interface Team { id: string; name: string; role: "owner" | "member" }
export interface Me { user: { id: string; email: string; name: string | null } | null; team: Team | null; teams: Team[] }
export interface Member { user_id: string; email: string; name: string | null; role: "owner" | "member"; created_at: string }
export interface Invite { id: string; email: string; expires_at: string; created_at: string }
export interface ApiKey { id: string; name: string; prefix: string; created_at: string; last_used_at: string | null }
let me: Me | null = null, meLoaded = false, meFetch: Promise<void> | null = null; const meListeners = new Set<() => void>();
export const isHosted = () => me?.user !== null && me?.user !== undefined;
export function useMe() {
  const [, bump] = useState(0);
  const [out, setOut] = useState(signedOut);
  useEffect(() => {
    const l = () => bump((n) => n + 1); meListeners.add(l); gateListeners.add(setOut);
    meFetch ??= fetch("/api/me").then(async (res) => { gate(res); if (res.ok) me = await res.json(); }).catch(() => {}).finally(() => { meLoaded = true; for (const x of meListeners) x(); });
    return () => { meListeners.delete(l); gateListeners.delete(setOut); };
  }, []);
  return { me, loaded: meLoaded, signedOut: out, hosted: isHosted() };
}
export const teams = {
  create: (name: string) => jpost<Team>("/api/teams", { name }),
  switch: (id: string) => jpost<{ team: string }>(`/api/teams/${id}/switch`, {}),
  rename: (id: string, name: string) => jpost<{ id: string; name: string }>(`/api/teams/${id}`, { name }, "PUT"),
  members: (id: string) => j<Member[]>(fetch(`/api/teams/${id}/members`)),
  setRole: (id: string, user_id: string, role: Member["role"]) => jpost<{ user_id: string; role: string }>(`/api/teams/${id}/members/${user_id}`, { role }, "PUT"),
  removeMember: (id: string, user_id: string) => jpost<{ ok: true }>(`/api/teams/${id}/members/${user_id}`, undefined, "DELETE"),
  invites: (id: string) => j<Invite[]>(fetch(`/api/teams/${id}/invites`)),
  invite: (id: string, email: string) => jpost<Invite>(`/api/teams/${id}/invites`, { email }),
  revokeInvite: (id: string, inv: string) => jpost<{ ok: true }>(`/api/teams/${id}/invites/${inv}`, undefined, "DELETE"),
  keys: (id: string) => j<ApiKey[]>(fetch(`/api/teams/${id}/keys`)),
  makeKey: (id: string, name: string) => jpost<ApiKey & { secret: string }>(`/api/teams/${id}/keys`, { name }),
  revokeKey: (id: string, key: string) => jpost<{ ok: true }>(`/api/teams/${id}/keys/${key}`, undefined, "DELETE"),
};
// The team's members, for naming who did what. Local mode has none; hosted mode loads them once.
let membersCache: Member[] | null = null;
export function useMembers() {
  const [ms, setMs] = useState<Member[]>(membersCache ?? []);
  useEffect(() => { if (membersCache || !me?.team || !me.user) return; teams.members(me.team.id).then((m) => { membersCache = m; setMs(m); }).catch(() => {}); }, [me?.team?.id]);
  return ms;
}
/** The short name a member goes by in rows: the local part of their email ("michael"), or the id as given when it is not a member. */
export const handle = (members: Member[], id?: string | null) => { if (!id) return null; const m = members.find((x) => x.user_id === id); return m ? m.email.split("@")[0] : id; };
/** A member's first name, for sentences ("Dana unblocked it"). */
export const firstName = (members: Member[], id?: string | null) => { if (!id) return null; const m = members.find((x) => x.user_id === id); return m ? (m.name?.split(/\s+/)[0] || m.email.split("@")[0]) : id; };

// ---------- credentials: the team store, and the slots each machine declares (02-credentials.md) ----------
export interface Credential { id: string; provider: string; kind: "static" | "oauth"; name: string; account?: string | null; scopes?: string[] | null; status: "ok" | "refresh_failed" | "revoked"; expires_at?: string | null; last_used_at?: string | null; created_by: string; created_at: string }
export interface SlotStatus { id: string; provider: string; ok: boolean; name?: string; account?: string; reason?: string; connect_url?: string; credential_id?: string; why?: string }
export const credentials = {
  list: () => j<Credential[]>(fetch("/api/credentials")),
  create: (provider: string, name: string, fields: Record<string, string>) => jpost<Credential>("/api/credentials", { provider, name, fields }),
  remove: (id: string) => jpost<{ ok: true }>(`/api/credentials/${id}`, undefined, "DELETE"),
  slots: (machine: string) => j<SlotStatus[]>(fetch(`/api/machines/${machine}/credentials`)),
  bind: (machine: string, slot: string, credential_id: string) => jpost<unknown>(`/api/machines/${machine}/credentials/${slot}`, { credential_id }, "PUT"),
  unbind: (machine: string, slot: string) => jpost<unknown>(`/api/machines/${machine}/credentials/${slot}`, undefined, "DELETE"),
};
export const author = {
  agents: () => j<AuthorAgent[]>(fetch("/api/author/agents")),
  connected: () => j<ConnectedAgent[]>(fetch("/api/author/connected")),
  /** connect: a ConnectedAgent id; the session is then driven by that agent instead of an ACP child. */
  start: (agent?: string, machine_id?: string, effort?: string, connect?: string) => jpost<{ id: string; agent: string; config: Choice[]; draft: unknown; problems: string[] }>("/api/author/sessions", { agent, machine_id, effort, connect }),
  configure: (id: string, option: string, value: string) => jpost<{ config: Choice[] }>(`/api/author/sessions/${id}/config`, { id: option, value }),
  close: (id: string) => fetch(`/api/author/sessions/${id}`, { method: "DELETE", keepalive: true }).catch(() => {}),
  get: (id: string) => j<AuthorSession>(fetch(`/api/author/sessions/${id}`)),
  prompt: (id: string, text: string) => jpost<{ ok: boolean }>(`/api/author/sessions/${id}/prompt`, { text }),
  cancel: (id: string) => jpost<{ ok: boolean }>(`/api/author/sessions/${id}/cancel`, {}),
};

export function onRun(l: Listener) { ensureStream(); listeners.add(l); return () => { listeners.delete(l); }; }

export function useRuns() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  useEffect(() => {
    api.runs().then(setRuns);
    return onRun((s) => setRuns((prev) => [s, ...prev.filter((r) => r.id !== s.id)]));
  }, []);
  return runs;
}

export function useRun(id: string | null) {
  const [run, setRun] = useState<Run | null>(null);
  const [machine, setMachine] = useState<Machine | null>(null);
  useEffect(() => {
    if (!id) return;
    setRun(null);
    api.run(id).then((r) => { setRun(r); api.machine(r.machine.id, r.machine.version).then(setMachine); });
    return onRun((s, appended) => {
      if (s.id !== id) return;
      setRun((prev) => prev ? { ...prev, ...s, history: [...prev.history, ...appended] } : prev);
    });
  }, [id]);
  return { run, machine };
}

// ---------- shared reads for the lists ----------

let machinesCache: Machine[] | null = null;
export function useMachines() {
  const [ms, setMs] = useState<Machine[]>(machinesCache ?? []);
  useEffect(() => { api.machines().then((m) => { machinesCache = m; setMs(m); }); }, []);
  return ms;
}
// Latest version of each machine, plus a lookup for a run's exact version.
export const latestOf = (ms: Machine[]) => Object.values(ms.reduce<Record<string, Machine>>((acc, m) => { if (!acc[m.id] || acc[m.id].version < m.version) acc[m.id] = m; return acc; }, {}));
export const machineFor = (ms: Machine[], ref: { id: string; version: number }) => ms.find((m) => m.id === ref.id && m.version === ref.version) ?? ms.find((m) => m.id === ref.id);

// Full runs (with history) for the list glyphs. Cached across screens, extended by the SSE stream.
const details = new Map<string, Run>();
export function useRunDetails(ids: string[]) {
  const [, bump] = useState(0);
  const key = ids.join(",");
  useEffect(() => {
    let live = true;
    for (const id of ids) if (!details.has(id)) api.run(id).then((r) => { details.set(id, r); if (live) bump((n) => n + 1); });
    const off = onRun((s, appended) => {
      const prev = details.get(s.id);
      if (prev) details.set(s.id, { ...prev, ...s, history: [...prev.history, ...appended] });
      else api.run(s.id).then((r) => details.set(s.id, r));
      bump((n) => n + 1);
    });
    return () => { live = false; off(); };
  }, [key]);
  return details;
}

// ---------- the walk: what a run has done, in order ----------

export interface Walk { states: string[]; edges: Set<string>; visits: Map<string, number>; last?: string }
export function walk(history: HistoryEntry[]): Walk {
  const states: string[] = []; const edges = new Set<string>(); const visits = new Map<string, number>(); let last: string | undefined;
  const visit = (s: string) => { states.push(s); visits.set(s, (visits.get(s) ?? 0) + 1); };
  for (const h of history) {
    if (h.type === "begin" && h.to) visit(h.to);
    if (h.type === "transition" && h.to) { last = `${h.from}→${h.event}`; edges.add(last); visit(h.to); }
  }
  return { states, edges, visits, last };
}

// Shortest way from a state to a successful end: the steps still ahead of a live run.
export function ahead(m: Machine | undefined, from: string): string[] {
  if (!m?.states[from]) return [];
  const prev = new Map<string, string>([[from, ""]]); const q = [from];
  while (q.length) {
    const cur = q.shift()!; const s = m.states[cur];
    if (s && s.kind === "final" && s.outcome === "success" && cur !== from) {
      const out: string[] = []; for (let c = cur; c !== from; c = prev.get(c)!) out.unshift(c); return out;
    }
    for (const t of Object.values(s?.on ?? {})) if (m.states[t.to] && !prev.has(t.to)) { prev.set(t.to, cur); q.push(t.to); }
  }
  return [];
}

export const needsYou = (s: Run["status"]) => s === "blocked" || s === "waiting";
export const isLive = (s: Run["status"]) => s === "running" || s === "waiting" || s === "blocked";

// ---------- time ----------
export const since = (iso: string) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  return s < 45 ? "just now" : s < 3600 ? `${Math.max(1, Math.round(s / 60))}m ago` : s < 86400 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`;
};
export const span = (a: string, b: string) => {
  const s = Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 1000);
  const r = Math.round(s);
  return r < 60 ? `${r}s` : r < 3600 ? `${Math.floor(r / 60)}m ${r % 60}s` : `${Math.floor(r / 3600)}h ${Math.floor((r % 3600) / 60)}m`;
};
export const hhmm = (iso: string) => new Date(iso).toTimeString().slice(0, 5);
/** A date and a 24-hour time, "Oct 20, 12:06". */
export const when = (iso: string) => `${new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${hhmm(iso)}`;
/** When the run arrived at the step it is on now. */
export const arrivedAt = (run: Pick<Run, "history" | "created_at">) => run.history.findLast((h) => h.type === "begin" || h.type === "transition" || h.type === "unblock")?.ts ?? run.created_at;
/** How long a live run has been at its step ("for 16h 48m"), or how long ago a finished one ended ("14h ago"). One phrase for the subtitle and the readout. */
export const stepAge = (run: Pick<Run, "status" | "history" | "created_at" | "updated_at">) => isLive(run.status) ? `for ${span(arrivedAt(run), new Date().toISOString())}` : since(run.updated_at);

// ---------- text ----------
export const words = (ev: string) => ev.replace(/_/g, " ");
export const human = (ev: string) => { const t = words(ev); return t[0].toUpperCase() + t.slice(1); };
export const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
