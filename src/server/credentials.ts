// The credential layer (docs/hosted/02-credentials.md): the routes a team uses to store and bind credentials, the engine's per-slot
// check, and the three server paths that decrypt: lease (machine run), proxy (the request tool) and hand-off (the credential tool).
// Everything is scoped through the team's store; local mode is team "local" with no auth.
import { Hono, type Context, type MiddlewareHandler } from "hono";
import { Engine, MachineError, type CredentialCheck, type CredentialSlot, type Run } from "../engine/engine.ts";
import { provider, fill, injection, type Provider } from "../engine/providers.ts";
import { encrypt, decrypt } from "../engine/crypto.ts";
import type { SqliteStore, TeamStore, Credential } from "../engine/sqlite-store.ts";
import { sha256, type AuthEnv, type AuthUser } from "./auth.ts";

const fail = (c: Context, e: unknown) => {
  if (e instanceof MachineError) return c.json({ error: e.code, message: e.message, details: e.details }, e.code.endsWith("not_found") ? 404 : 400);
  throw e;
};
const newId = () => "cred_" + Math.random().toString(36).slice(2, 10);

// ---------- the engine's check ----------
/** Per slot: is it bound to a working credential? connect_url is the machine page, where the Credentials strip lives. */
export const checkFor = (scoped: TeamStore, baseUrl: string): CredentialCheck => (machine_id, slot) => {
  const { ok, name, account, reason } = scoped.credentialStatus(machine_id, slot.id);
  return ok ? { ok, name, account } : { ok, reason, connect_url: `${baseUrl}/#/machines/${machine_id}` };
};
export const engineFor = (scoped: TeamStore, baseUrl: string) => new Engine(scoped, checkFor(scoped, baseUrl));

/** The `mk_` key behind a bearer header, if any. The same key the MCP endpoint takes; the lease accepts it so the CLI can use it. */
export const keyOf = (store: SqliteStore, c: Context) => {
  const h = c.req.header("authorization") ?? "";
  return h.startsWith("Bearer ") ? store.apiKeyByHash(sha256(h.slice(7).trim())) : undefined;
};

// ---------- decrypt paths ----------
export interface Unlocked { slot: CredentialSlot; cred: Credential; fields: Record<string, string> }

/** The live slots of a running run with their secrets decrypted. Throws run_not_running / credential_unknown / credential_not_live
 *  from the engine. A slot that is unbound or whose credential is not ok blocks the run with credentials_missing, as begin would. */
export function unlock(scoped: TeamStore, engine: Engine, baseUrl: string, run_id: string, slot?: string): { run: Run; items: Unlocked[] } {
  const { run, slots } = engine.liveCredentials(run_id, slot);
  const check = checkFor(scoped, baseUrl);
  const status = slots.map((s) => ({ s, st: check(run.machine.id, s) }));
  const missing = status.filter((x) => !x.st.ok);
  if (missing.length) {
    const m = scoped.machine(run.machine.id, run.machine.version);
    const message = `credential(s) not connected: ${missing.map((x) => x.s.id).join(", ")}`;
    engine.fail(run_id, "credentials_missing", message, missing.map((x) => `Connect ${x.s.id} for ${m.name}${x.s.why ? ` (${x.s.why})` : ""}: ${x.st.connect_url}`));
    throw new MachineError("credentials_missing", `${message}; the run is now blocked until a member connects it`);
  }
  const bound = scoped.bindings(run.machine.id);
  const items = slots.map((s) => {
    const { sealed, ...cred } = scoped.sealedCredential(bound.find((b) => b.slot === s.id)!.credential_id)!;
    return { slot: s, cred, fields: JSON.parse(decrypt(sealed)) as Record<string, string> };
  });
  return { run, items };
}

/** One use goes on the run's timeline and bumps last_used_at. */
function used(scoped: TeamStore, engine: Engine, run_id: string, u: Unlocked, how: { via: "lease" | "proxy" | "handoff"; by: string; command?: string; request?: string; exposed?: true }) {
  engine.credentialUsed(run_id, { credential: { id: u.cred.id, slot: u.slot.id, provider: u.cred.provider, name: u.cred.name, account: u.cred.account ?? undefined }, ...how });
  scoped.touchCredential(u.cred.id);
}

/** "Authorization: Bearer ${token}" from the catalog, filled, as a headers object. */
function authHeader(p: Provider, fields: Record<string, string>): Record<string, string> {
  const line = fill(p.proxy!.header, fields);
  if (!line) throw new MachineError("credential_incomplete", `credential is missing a field the ${p.name} header needs`);
  const i = line.indexOf(":");
  return { [line.slice(0, i).trim()]: line.slice(i + 1).trim() };
}

/** POST /api/runs/:id/lease body { command }. Every slot live in the current state, decrypted, one timeline entry each. */
export async function lease(c: Context, scoped: TeamStore, baseUrl: string, by: string) {
  const run_id = c.req.param("id")!, engine = engineFor(scoped, baseUrl);
  const b = await c.req.json().catch(() => ({}));
  const command = String(b.command ?? "").split(/\s+/).filter(Boolean).slice(0, 3).join(" ");
  try {
    const { run, items } = unlock(scoped, engine, baseUrl, run_id);
    if (!items.length) {
      // Nothing live here but the machine does declare slots: say where they are live, with the engine's own message.
      const m = scoped.machine(run.machine.id, run.machine.version);
      if (m.credentials?.length) engine.liveCredentials(run_id, m.credentials[0].id);
    }
    for (const u of items) used(scoped, engine, run_id, u, { via: "lease", by, command });
    return c.json({ credentials: items.map((u) => ({ id: u.slot.id, credential_id: u.cred.id, provider: u.cred.provider, fields: u.fields })),
      expires_at: new Date(Date.now() + 3600e3).toISOString() });
  } catch (e) { return fail(c, e); }
}

/** Hosted: a bearer `mk_` key answers the lease here; no header falls through to the session-authenticated route. */
export const bearerLease = (store: SqliteStore, baseUrl: string): MiddlewareHandler => async (c, next) => {
  if (!c.req.header("authorization")) return next();
  const k = keyOf(store, c);
  if (!k) return c.json({ error: "unauthorized" }, 401, { "WWW-Authenticate": "Bearer" });
  store.touchApiKey(k.id);
  return lease(c, store.forTeam(k.team_id), baseUrl, k.user_id);
};

const LIMIT = 256 * 1024;
/** The `request` tool: the server makes the call with the auth header from the catalog; the body comes back truncated at 256 KB. */
export async function proxy(scoped: TeamStore, engine: Engine, baseUrl: string, by: string,
  a: { run_id: string; credential: string; method: string; path: string; headers?: Record<string, string>; body?: string }) {
  const { items: [u] } = unlock(scoped, engine, baseUrl, a.run_id, a.credential);
  const p = provider(u!.cred.provider)!;
  if (!p.proxy) throw new MachineError("credential_no_proxy", `${p.name} has no API proxy; use machine run`);
  const base = p.proxy.base_url ?? u!.slot.base_url;
  if (!base) throw new MachineError("credential_no_base_url", `slot "${u!.slot.id}" has no base_url`);
  const method = a.method.toUpperCase(), path = a.path.startsWith("/") ? a.path : "/" + a.path;
  used(scoped, engine, a.run_id, u!, { via: "proxy", by, request: `${method} ${path}` });
  const r = await fetch(base.replace(/\/$/, "") + path, { method, headers: { accept: "application/json", ...(a.headers ?? {}), ...authHeader(p, u!.fields) },
    body: method === "GET" || method === "HEAD" ? undefined : a.body });
  const text = await r.text();
  return { status: r.status, headers: Object.fromEntries(r.headers), body: text.slice(0, LIMIT), ...(text.length > LIMIT ? { note: `body truncated to 256 KB of ${text.length}` } : {}) };
}

/** The `credential` tool: the raw fields, only for slots declared with handoff: true; the timeline entry says exposed. */
export function handoff(scoped: TeamStore, engine: Engine, baseUrl: string, by: string, run_id: string, id: string) {
  const { slots: [slot] } = engine.liveCredentials(run_id, id);
  if (!slot!.handoff) throw new MachineError("credential_handoff_disabled", `slot "${id}" is not declared with handoff: true; use machine run or the request tool`);
  const { items: [u] } = unlock(scoped, engine, baseUrl, run_id, id);
  used(scoped, engine, run_id, u!, { via: "handoff", by, exposed: true });
  return { id: u!.slot.id, provider: u!.cred.provider, fields: u!.fields };
}

// ---------- verify after save ----------
async function verify(id: string, p: Provider, fields: Record<string, string>): Promise<{ ok: true; account?: string } | { ok: false; reason: string }> {
  const v = p.verify;
  if (!v) return { ok: true };
  if ("command" in v) {
    try {
      const r = Bun.spawnSync(v.command, { env: { ...process.env, ...injection(id, "verify", fields).env }, stdout: "pipe", stderr: "pipe" });
      if (r.exitCode !== 0) return { ok: false, reason: (r.stderr.toString().trim() || `${v.command.join(" ")} exited ${r.exitCode}`).slice(0, 300) };
      let out: any = {}; try { out = JSON.parse(r.stdout.toString()); } catch { }
      return { ok: true, account: v.account && out[v.account] !== undefined ? String(out[v.account]) : undefined };
    } catch (e) { return { ok: false, reason: `${v.command[0]} could not run on the server: ${(e as Error).message}` }; }
  }
  const r = await fetch(p.proxy!.base_url + v.path, { method: v.method, headers: { accept: "application/json", ...authHeader(p, fields) } }).catch((e) => e as Error);
  if (r instanceof Error) return { ok: false, reason: `${v.method} ${v.path}: ${r.message}` };
  if (!r.ok) return { ok: false, reason: `${v.method} ${p.proxy!.base_url}${v.path} answered ${r.status}` };
  const out: any = await r.json().catch(() => ({}));
  return { ok: true, account: v.account && out[v.account] !== undefined ? String(out[v.account]) : undefined };
}

// ---------- /api/credentials and /api/machines/:id/credentials (after the team middleware) ----------
export function credentialRoutes() {
  const r = new Hono<AuthEnv>();
  const who = (c: Context<AuthEnv>) => (c.get("user") as AuthUser | undefined)?.id ?? "local";

  r.get("/credentials", (c) => c.json(c.get("scoped").credentials()));
  r.post("/credentials", async (c) => {
    const b = await c.req.json().catch(() => ({}));
    const p = provider(String(b.provider));
    if (!p) return c.json({ error: "unknown_provider", message: `no provider "${b.provider}"` }, 400);
    if (p.kind !== "static") return c.json({ error: "connect_flow_unavailable", message: "connect flow not available yet" }, 422);
    const fields: Record<string, string> = {};
    for (const f of p.fields!) {
      const v = String(b.fields?.[f.id] ?? "").trim();
      if (v) fields[f.id] = v; else if (!f.optional) return c.json({ error: "field_required", message: `${f.label} is required` }, 400);
    }
    const v = await verify(b.provider, p, fields);
    if (!v.ok) return c.json({ error: "verify_failed", message: v.reason }, 422);
    const account = v.account ?? fields.username ?? null;
    const name = String(b.name ?? "").trim() || `${p.name}${account ? ` · ${account}` : ""}`;
    const cred = c.get("scoped").createCredential({ id: newId(), provider: b.provider, kind: "static", name, account, sealed: encrypt(JSON.stringify(fields)), created_by: who(c) });
    return c.json({ ...cred, uses: [] }, 201);
  });
  r.delete("/credentials/:id", (c) => {
    const s = c.get("scoped"), id = c.req.param("id");
    if (!s.credential(id)) return c.json({ error: "credential_not_found" }, 404);
    s.deleteCredential(id);
    return c.json({ ok: true });
  });

  /** One row per declared slot: the declaration plus the store's answer (same shape as preflight's credentials[]). */
  const slots = (c: Context<AuthEnv>, machine_id: string) => {
    const s = c.get("scoped"), m = s.machine(machine_id);
    return (m.credentials ?? []).map((slot) => { const { credential_id, ...st } = s.credentialStatus(machine_id, slot.id); return { ...slot, credential_id: credential_id ?? null, ...st }; });
  };
  r.get("/machines/:id/credentials", (c) => { try { return c.json(slots(c, c.req.param("id"))); } catch (e) { return fail(c, e); } });
  r.put("/machines/:id/credentials/:slot", async (c) => {
    try {
      const s = c.get("scoped"), id = c.req.param("id"), slot = c.req.param("slot");
      const decl = s.machine(id).credentials?.find((x) => x.id === slot);
      if (!decl) return c.json({ error: "slot_not_found", message: `machine "${id}" has no credential slot "${slot}"` }, 404);
      const credential_id = String((await c.req.json().catch(() => ({}))).credential_id ?? "");
      const cred = s.credential(credential_id);
      if (!cred) return c.json({ error: "credential_not_found" }, 404);
      if (cred.provider !== decl.provider) return c.json({ error: "provider_mismatch", message: `slot "${slot}" wants ${decl.provider}, credential is ${cred.provider}` }, 400);
      s.bind(id, slot, credential_id);
      return c.json(slots(c, id).find((x) => x.id === slot));
    } catch (e) { return fail(c, e); }
  });
  r.delete("/machines/:id/credentials/:slot", (c) => { c.get("scoped").unbind(c.req.param("id"), c.req.param("slot")); return c.json({ ok: true }); });
  return r;
}
