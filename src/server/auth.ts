// Hosted mode only: sign-in with WorkOS AuthKit (sealed-session cookie), teams, members, invitations and API keys.
// A WorkOS organization is a team; membership is authorized against our `members` table on every request, never against
// WorkOS (a revoked membership does not end a WorkOS session). WorkOS is synced once per sign-in and on every change we make.
import { Hono, type Context, type MiddlewareHandler } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { WorkOS } from "@workos-inc/node";
import { createHash } from "node:crypto";
import type { SqliteStore, TeamStore, Role } from "../engine/sqlite-store.ts";

export interface AuthUser { id: string; email: string; name: string | null }
export type AuthEnv = { Variables: { user: AuthUser; team: string; role: Role; scoped: TeamStore } };

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const b64url = (n: number) => Buffer.from(crypto.getRandomValues(new Uint8Array(n))).toString("base64url");
const env = (k: string) => { const v = process.env[k]; if (!v) throw new Error(`hosted mode: ${k} is not set`); return v; };

const SESSION = { httpOnly: true, secure: true, sameSite: "Lax" as const, path: "/" };
const WEEK = 7 * 24 * 3600, YEAR = 365 * 24 * 3600;

export function hostedAuth(store: SqliteStore) {
  const clientId = env("WORKOS_CLIENT_ID"), redirectUri = env("WORKOS_REDIRECT_URI"), cookiePassword = env("WORKOS_COOKIE_PASSWORD");
  const workos = new WorkOS(env("WORKOS_API_KEY"), { clientId });
  const um = workos.userManagement;
  const pick = (u: { id: string; email: string; name: string | null; firstName: string | null; lastName: string | null }): AuthUser =>
    ({ id: u.id, email: u.email, name: u.name ?? ([u.firstName, u.lastName].filter(Boolean).join(" ") || null) });

  /** Pick the team cookie: keep it if it is one of the user's teams, else the oldest team, else nothing. */
  const settle = (c: Context, user_id: string) => {
    const teams = store.teamsFor(user_id);
    const t = teams.find((x) => x.id === getCookie(c, "machine_team")) ?? teams[0];
    if (t) setCookie(c, "machine_team", t.id, { ...SESSION, maxAge: YEAR });
    return t;
  };

  // ---------- /auth ----------
  const routes = new Hono();
  routes.get("/login", (c) => {
    const nonce = b64url(16);
    setCookie(c, "wos-state", nonce, { ...SESSION, maxAge: 600 });
    const state = Buffer.from(JSON.stringify({ nonce, return_to: c.req.query("return_to") ?? "/" })).toString("base64url");
    return c.redirect(um.getAuthorizationUrl({ provider: "authkit", clientId, redirectUri, state }));
  });
  routes.get("/callback", async (c) => {
    const raw = c.req.query("state"), code = c.req.query("code");
    // No state: the flow started at WorkOS (an accepted invitation lands here via the Initiate login URI). Start over.
    if (!raw || !code) return c.redirect("/auth/login");
    let state: { nonce?: string; return_to?: string } = {};
    try { state = JSON.parse(Buffer.from(raw, "base64url").toString()); } catch { }
    if (!state.nonce || state.nonce !== getCookie(c, "wos-state")) return c.text("sign-in state mismatch; start again at /auth/login", 400);
    deleteCookie(c, "wos-state", { path: "/" });
    const { user, sealedSession } = await um.authenticateWithCode({ clientId, code, session: { sealSession: true, cookiePassword } });
    if (!sealedSession) return c.text("WorkOS returned no session", 502);
    const u = pick(user);
    const orgs = await um.listOrganizationMemberships({ userId: u.id, statuses: ["active"] }).then((l) => l.autoPagination());
    store.syncMemberships(u, orgs.map((m) => ({ id: m.organizationId, name: m.organizationName })));
    setCookie(c, "wos-session", sealedSession, { ...SESSION, maxAge: WEEK });
    const team = settle(c, u.id);
    const to = state.return_to && state.return_to.startsWith("/") && !state.return_to.startsWith("//") ? state.return_to : "/";
    return c.redirect(team ? to : "/#/teams/new");
  });
  routes.post("/logout", async (c) => {
    const sealed = getCookie(c, "wos-session");
    deleteCookie(c, "wos-session", { path: "/" }); deleteCookie(c, "machine_team", { path: "/" });
    let to = "/";
    if (sealed) try { to = await um.loadSealedSession({ sessionData: sealed, cookiePassword }).getLogoutUrl(); } catch { }
    return c.redirect(to, 303);
  });

  // ---------- middlewares ----------
  const unauthorized = (c: Context) => c.req.path.startsWith("/api") || c.req.path.startsWith("/events")
    ? c.json({ error: "unauthorized" }, 401)
    : c.redirect(`/auth/login?return_to=${encodeURIComponent(c.req.path)}`);

  /** wos-session → c.user. A stale session is refreshed once and the cookie re-set; anything else is signed out. */
  const requireUser: MiddlewareHandler<AuthEnv> = async (c, next) => {
    const sealed = getCookie(c, "wos-session");
    if (!sealed) return unauthorized(c);
    const session = um.loadSealedSession({ sessionData: sealed, cookiePassword });
    const r = await session.authenticate();
    if (r.authenticated) c.set("user", pick(r.user));
    else {
      if (r.reason === "no_session_cookie_provided") return unauthorized(c);
      const f = await session.refresh();
      if (!f.authenticated || !f.sealedSession) { deleteCookie(c, "wos-session", { path: "/" }); return unauthorized(c); }
      setCookie(c, "wos-session", f.sealedSession, { ...SESSION, maxAge: WEEK });
      c.set("user", pick(f.user));
    }
    await next();
  };
  /** machine_team → c.team/role/scoped, re-checked against members every time. No team at all → 404 no_team. */
  const requireTeam: MiddlewareHandler<AuthEnv> = async (c, next) => {
    const t = settle(c, c.get("user").id);
    if (!t) return c.json({ error: "no_team" }, 404);
    c.set("team", t.id); c.set("role", t.role); c.set("scoped", store.forTeam(t.id));
    await next();
  };
  /** Bearer `mk_…` key on /mcp → c.team. */
  const mcpBearer: MiddlewareHandler = async (c, next) => {
    const h = c.req.header("authorization") ?? "";
    const secret = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
    const row = secret ? store.apiKeyByHash(sha256(secret)) : undefined;
    if (!row) return c.json({ error: "unauthorized" }, 401, { "WWW-Authenticate": "Bearer" });
    store.touchApiKey(row.id);
    c.set("team", row.team_id);
    await next();
  };

  const me = (c: Context<AuthEnv>) => {
    const user = c.get("user"), teams = store.teamsFor(user.id);
    const t = teams.find((x) => x.id === getCookie(c, "machine_team")) ?? teams[0] ?? null;
    return c.json({ user, team: t && { id: t.id, name: t.name, role: t.role }, teams: teams.map((x) => ({ id: x.id, name: x.name, role: x.role })) });
  };

  // ---------- /api/teams (after requireUser; membership of :id is checked here, not from the cookie) ----------
  const teams = new Hono<AuthEnv>();
  teams.onError((e, c) => c.json({ error: "workos_error", message: e.message }, 502));
  teams.post("/", async (c) => {
    const user = c.get("user"); const name = String((await c.req.json().catch(() => ({}))).name ?? "").trim();
    if (!name) return c.json({ error: "name_required" }, 400);
    const org = await workos.organizations.createOrganization({ name });
    await um.createOrganizationMembership({ organizationId: org.id, userId: user.id });
    store.createTeam(org.id, org.name);
    store.addMember({ team_id: org.id, user_id: user.id, email: user.email, name: user.name, role: "owner" });
    setCookie(c, "machine_team", org.id, { ...SESSION, maxAge: YEAR });
    return c.json({ id: org.id, name: org.name, role: "owner" }, 201);
  });
  teams.use("/:id/*", async (c, next) => {
    const m = store.member(c.req.param("id")!, c.get("user").id);
    if (!m) return c.json({ error: "not_a_member" }, 403);
    c.set("team", m.team_id); c.set("role", m.role); c.set("scoped", store.forTeam(m.team_id));
    await next();
  });
  const owner: MiddlewareHandler<AuthEnv> = async (c, next) => c.get("role") === "owner" ? next() : c.json({ error: "owner_only" }, 403);
  const id = (c: Context<AuthEnv>) => c.get("team");

  teams.post("/:id/switch", (c) => { setCookie(c, "machine_team", id(c), { ...SESSION, maxAge: YEAR }); return c.json({ team: id(c) }); });
  teams.put("/:id", owner, async (c) => {
    const name = String((await c.req.json().catch(() => ({}))).name ?? "").trim();
    if (!name) return c.json({ error: "name_required" }, 400);
    await workos.organizations.updateOrganization({ organization: id(c), name });
    store.renameTeam(id(c), name);
    return c.json({ id: id(c), name });
  });

  teams.get("/:id/members", (c) => c.json(store.members(id(c)).map(({ team_id, ...m }) => m)));
  teams.put("/:id/members/:user_id", owner, async (c) => {
    const user_id = c.req.param("user_id"), role = (await c.req.json().catch(() => ({}))).role as Role;
    if (role !== "owner" && role !== "member") return c.json({ error: "bad_role" }, 400);
    const m = store.member(id(c), user_id);
    if (!m) return c.json({ error: "not_found" }, 404);
    if (m.role === "owner" && role === "member" && store.owners(id(c)) <= 1) return c.json({ error: "last_owner" }, 409);
    store.setRole(id(c), user_id, role);
    return c.json({ user_id, role });
  });
  teams.delete("/:id/members/:user_id", owner, async (c) => {
    const user_id = c.req.param("user_id"), m = store.member(id(c), user_id);
    if (!m) return c.json({ error: "not_found" }, 404);
    if (m.role === "owner" && store.owners(id(c)) <= 1) return c.json({ error: "last_owner" }, 409);
    const ms = await um.listOrganizationMemberships({ organizationId: id(c), userId: user_id }).then((l) => l.autoPagination());
    for (const x of ms) await um.deleteOrganizationMembership(x.id);
    store.removeMember(id(c), user_id);
    return c.json({ ok: true });
  });

  teams.get("/:id/invites", async (c) => {
    const list = await um.listInvitations({ organizationId: id(c) }).then((l) => l.autoPagination());
    return c.json(list.filter((i) => i.state === "pending").map((i) => ({ id: i.id, email: i.email, expires_at: i.expiresAt, created_at: i.createdAt })));
  });
  teams.post("/:id/invites", owner, async (c) => {
    const email = String((await c.req.json().catch(() => ({}))).email ?? "").trim();
    if (!email) return c.json({ error: "email_required" }, 400);
    const i = await um.sendInvitation({ email, organizationId: id(c), inviterUserId: c.get("user").id });
    return c.json({ id: i.id, email: i.email, expires_at: i.expiresAt, created_at: i.createdAt }, 201);
  });
  teams.delete("/:id/invites/:inv", owner, async (c) => { await um.revokeInvitation(c.req.param("inv")); return c.json({ ok: true }); });

  teams.get("/:id/keys", (c) => c.json(store.apiKeys(id(c), c.get("user").id).map(({ team_id, user_id, ...k }) => k)));
  teams.post("/:id/keys", async (c) => {
    const name = String((await c.req.json().catch(() => ({}))).name ?? "").trim();
    if (!name) return c.json({ error: "name_required" }, 400);
    const secret = "mk_" + b64url(32);
    const k = store.createApiKey({ id: "key_" + Math.random().toString(36).slice(2, 10), team_id: id(c), user_id: c.get("user").id, name, prefix: secret.slice(0, 8), hash: sha256(secret) });
    return c.json({ id: k.id, name: k.name, prefix: k.prefix, created_at: k.created_at, secret }, 201);
  });
  teams.delete("/:id/keys/:key", (c) => {
    const k = store.apiKey(c.req.param("key"));
    if (!k || k.team_id !== id(c)) return c.json({ error: "not_found" }, 404);
    if (k.user_id !== c.get("user").id && c.get("role") !== "owner") return c.json({ error: "owner_only" }, 403);
    store.deleteApiKey(k.id);
    return c.json({ ok: true });
  });

  /** The signed-in member and their team from a raw request (the BYOA doors, outside Hono's middleware): the team is the
   * person BYOA sees, so every member of the team sees the team's agents; a stale session is not refreshed here. */
  const identify = async (req: Request): Promise<{ userId: string; displayName: string } | null> => {
    const cookies = Object.fromEntries((req.headers.get("cookie") ?? "").split(/;\s*/).map((kv) => { const i = kv.indexOf("="); return i > 0 ? [kv.slice(0, i), decodeURIComponent(kv.slice(i + 1))] : [kv, ""]; }));
    if (!cookies["wos-session"]) return null;
    const r = await um.loadSealedSession({ sessionData: cookies["wos-session"], cookiePassword }).authenticate();
    if (!r.authenticated) return null;
    const u = pick(r.user), teams = store.teamsFor(u.id);
    const t = teams.find((x) => x.id === cookies["machine_team"]) ?? teams[0];
    return t ? { userId: t.id, displayName: u.name ?? u.email } : null;
  };

  return { workos, routes, requireUser, requireTeam, mcpBearer, me, teams, identify };
}
