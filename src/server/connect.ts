// Connect your agent, on the BYOA wire (byoa.ts, @plannotator/byoa-server). The person's agent runs the universal `byoa` connector:
// its sessions come from the SDK (one subscription per person, kept for the life of the process), a designer message goes
// out with byoa.send() and the connector holds it until the session is idle, the message's own events end the designer's
// turn, Stop is byoa.interrupt(), and the agent draws through the authoring tools on /mcp/author (its token names the
// person, _meta the session). Ids are the SDK's stable `ses_…`, the same across a reconnect. The person is the team.
import type { Byoa, UiConnection, UiSession } from "@plannotator/byoa-server";

/** One thing the host can set for its session: the choices and the one in force ("" when the host cannot tell). */
export interface HostOption { id: string; name: string; value: string; options: { value: string; name: string }[] }
/** A designer message for the agent; `set` is what the person chose in the designer's pickers, applied before the message enters. */
export interface Delivery { id: string; session: string; text: string; set?: Record<string, string> }
/** What the UI's picker shows. connected: not gone (the wire's 60 s). */
export interface AgentView { id: string; host: string; name: string; cwd: string; session: string; busy: boolean; connected: boolean; last_poll: string; options: HostOption[] }

const HOSTS: Record<string, string> = { "claude-code": "Claude Code", pi: "Pi", opencode: "OpenCode", codex: "Codex", gemini: "Gemini CLI" };

type Listener = (team: string, agents: AgentView[]) => void;
const listeners = new Set<Listener>();
/** The team's list changed (an agent appeared, went busy or idle, changed a setting, went gone). */
export function onAgents(fn: Listener) { listeners.add(fn); return () => { listeners.delete(fn); }; }

// Hooks the authoring code sets: a turn started or ended in the agent's session; the agent's settings changed; a message the
// designer sent ended (done, error, interrupted, withdrawn before a poll took it, or gone with the session).
export type Ended = "done" | "error" | "interrupted" | "withdrawn" | "gone";
export const hooks: { turn: (agentId: string, status: "running" | "done") => void; options: (agentId: string, options: HostOption[]) => void; ended: (agentId: string, messageId: string, how: Ended, reason?: string) => void } = { turn: () => {}, options: () => {}, ended: () => {} };

let byoa: Byoa | null = null;
export function useByoa(b: Byoa) { byoa = b; }
/** Per person (the team): the latest session list from the SDK, and how each session looked last time, to tell a turn's start
 * and end and a change of settings. */
const wire = new Map<string, { views: AgentView[]; seen: Map<string, { busy: boolean; options: string }> }>();
const view = (c: UiConnection, s: UiSession): AgentView => ({
  id: s.id, host: s.host, name: HOSTS[s.host] ?? s.host, cwd: s.workspace.path ?? s.workspace.folder_name ?? "", session: s.id,
  busy: s.state === "busy", connected: s.state !== "gone", last_poll: s.last_seen_at,
  options: s.capabilities.settings.map((o) => ({ id: o.id, name: o.name, value: o.value ?? "", options: o.choices.map((x) => ({ value: x.value, name: x.name })) })),
});
/** Follow the person's sessions on the wire. The SDK replays the list first, then sends it again on every change. */
export function watch(team: string) {
  if (!byoa || wire.has(team)) return;
  const w = { views: [] as AgentView[], seen: new Map<string, { busy: boolean; options: string }>() };
  wire.set(team, w);
  byoa.subscribe(team, (e) => {
    if (e.type === "event") {
      const t = e.event.type;
      if (t === "done" || t === "error" || t === "interrupted" || t === "withdrawn") hooks.ended(e.session_id, e.message_id, t, "reason" in e.event && typeof e.event.reason === "string" ? e.event.reason : undefined);
      return;
    }
    if (e.type === "gone") { hooks.ended(e.session_id, e.message_id, "gone", e.reason); return; }
    if (e.type !== "sessions") return;
    w.views = e.connections.flatMap((c) => c.sessions.map((s) => view(c, s)));
    for (const v of w.views) {
      const was = w.seen.get(v.id), options = JSON.stringify(v.options);
      w.seen.set(v.id, { busy: v.busy, options });
      if (was && was.busy !== v.busy) hooks.turn(v.id, v.busy ? "running" : "done");
      if (!was || was.options !== options) hooks.options(v.id, v.options);
    }
    const list = agentsOf(team); for (const fn of listeners) fn(team, list);
  });
}
export const agentsOf = (team: string) => { watch(team); return [...(wire.get(team)?.views ?? [])].sort((a, b) => b.last_poll.localeCompare(a.last_poll)); };
/** The agent by id: what the designer needs to bind to it (host, name, cwd, options). */
export const agent = (id: string): AgentView | null => { for (const w of wire.values()) { const v = w.views.find((x) => x.id === id); if (v) return v; } return null; };
const teamOf = (agentId: string) => [...wire].find(([, w]) => w.views.some((v) => v.id === agentId))?.[0];

/** A designer message for the agent; returns the wire's message id. The hub keeps it, even for a session that stopped
 * polling, and the connector holds it until the session is idle. Throws when the agent is unknown or the SDK refuses. */
export async function deliver(agentId: string, d: Delivery): Promise<string> {
  const team = teamOf(agentId);
  if (!byoa || !team) throw new Error(`no connected agent "${agentId}"`);
  const r = await byoa.send(team, agentId, { text: d.text, kind: "chat", ...(d.set && Object.keys(d.set).length ? { set: d.set } : {}) });
  if ("error" in r) throw new Error(r.error_description);
  return r.message_id;
}
/** Stop a message's turn: withdrawn before a poll took it, interrupted while it runs, or already finished. */
export async function interrupt(agentId: string, messageId: string) {
  const team = teamOf(agentId);
  if (!byoa || !team) throw new Error(`no connected agent "${agentId}"`);
  return byoa.interrupt(team, agentId, messageId);
}
