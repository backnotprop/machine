# Hosted machine: teams and sign-in

The brief: teams and members, every member sees the team's runs, nothing more. Basecamp-style seating. Billing later, not now.

What this is grounded in: `src/server/main.ts` (one Hono app: `/mcp`, `/api`, `/events`, static `dist/`), `src/engine/sqlite-store.ts` (three tables: `machines`, `runs`, `events`), `src/engine/engine.ts` (`Engine` holds only a `RunStore`), `src/ui/main.tsx` (hash router, two nav items), and executor v2's `apps/cloud/src/auth/*` (what it did with WorkOS, and what it over-built).

What is taken from executor v2, because it was simple and proven there:

- A WorkOS organization *is* the team; our row uses the WorkOS org id as its primary key (`organizations.id` in executor's `drizzle/0000_v2_baseline.sql`).
- Membership is authorized against **our** table on every request, never against WorkOS (executor's `auth/organization.ts` explains why: WorkOS does not end a session when a membership is revoked).
- One `listOrganizationMemberships` call in the sign-in callback refreshes the user's rows (executor's `auth/handlers.ts` callback).
- Local mode has exactly one principal and one credential (executor's `apps/local/src/identity.ts`); here local has zero credentials, as today.

What is deliberately **not** taken: the membership mirror with Events API reconciler, webhooks and cron; the org-slug URL scheme; WorkOS-issued API keys; MCP OAuth with AuthKit as authorization server; seat reporting to a billing service; admin MFA. Each of those is a day or more and none is needed for "members see the team's runs".

---

## 1. The model

Three new tables, two touched tables, one constant for local mode. All in `src/engine/sqlite-store.ts`.

### Tables

```
teams
  id                 TEXT PRIMARY KEY      -- the WorkOS organization id (org_…); 'local' in local mode
  name               TEXT NOT NULL
  stripe_customer_id TEXT                  -- NULL until billing; nothing reads it yet
  created_at         TEXT NOT NULL

members
  team_id     TEXT NOT NULL REFERENCES teams(id)
  user_id     TEXT NOT NULL                -- the WorkOS user id (user_…)
  email       TEXT NOT NULL                -- copied from the WorkOS user at sign-in
  name        TEXT                         -- "First Last" from WorkOS, may be NULL
  role        TEXT NOT NULL CHECK (role IN ('owner','member'))
  created_at  TEXT NOT NULL
  PRIMARY KEY (team_id, user_id)

api_keys
  id           TEXT PRIMARY KEY            -- 'key_' + random
  team_id      TEXT NOT NULL REFERENCES teams(id)
  user_id      TEXT NOT NULL               -- the member who minted it
  name         TEXT NOT NULL               -- "laptop", "ci"
  prefix       TEXT NOT NULL               -- first 8 chars of the secret, shown in the UI
  hash         TEXT NOT NULL UNIQUE        -- sha256 of the full secret; the secret itself is never stored
  created_at   TEXT NOT NULL
  last_used_at TEXT
```

No `invites` table: invitations live in WorkOS (section 2). No `users` table: `members` carries email and name, and a person with no team is not interesting to us. No `sessions` table: the session is WorkOS's sealed cookie.

### Changed tables

```
machines   + team_id TEXT NOT NULL DEFAULT 'local'     PRIMARY KEY becomes (team_id, id, version)
runs       + team_id TEXT NOT NULL DEFAULT 'local'     + INDEX runs_team ON runs (team_id, updated_at DESC)
events     unchanged (reached only through a run the caller already owns)
```

`team_id` is a **column**, not a field in `runs.json`: `schema/run.schema.json` has `additionalProperties: false`, and the evals validate run JSON against it. The `Run` type in `engine.ts` does not change.

### Migration

SQLite cannot alter a primary key, so `machines` is rebuilt. Use `PRAGMA user_version` as the schema version; today it is 0. In the `SqliteStore` constructor, after the existing `CREATE TABLE IF NOT EXISTS` block:

```sql
-- user_version 0 → 1, in one transaction
ALTER TABLE runs ADD COLUMN team_id TEXT NOT NULL DEFAULT 'local';
CREATE INDEX IF NOT EXISTS runs_team ON runs (team_id, updated_at DESC);

CREATE TABLE machines_v1 (team_id TEXT NOT NULL DEFAULT 'local', id TEXT NOT NULL, version INTEGER NOT NULL,
  json TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (team_id, id, version));
INSERT INTO machines_v1 (team_id, id, version, json, created_at) SELECT 'local', id, version, json, created_at FROM machines;
DROP TABLE machines;
ALTER TABLE machines_v1 RENAME TO machines;

CREATE TABLE IF NOT EXISTS teams (...);        -- as above
CREATE TABLE IF NOT EXISTS members (...);
CREATE TABLE IF NOT EXISTS api_keys (...);
INSERT OR IGNORE INTO teams (id, name, created_at) VALUES ('local', 'Local', strftime('%Y-%m-%dT%H:%M:%fZ','now'));

PRAGMA user_version = 1;
```

A fresh database gets the v1 shape directly and `user_version = 1`. An existing `~/.machine/machine.db` migrates on first start and every existing machine and run lands in team `local`. Nothing else in local mode notices.

### Scoping in code

`Engine` only holds a `RunStore`, so scoping is one method on the store and no change to the engine:

```ts
// sqlite-store.ts
forTeam(team_id: string): RunStore & { runSummaries(); events() }
  // same queries with "AND team_id = ?" / INSERT with team_id; saveRun stamps the column
```

`main.ts` builds `new Engine(store.forTeam(team))` per request (it is a one-field object, free to construct). Local mode uses `store.forTeam("local")` everywhere, which is today's behaviour. The `onChange` listener gains a third argument, `team_id`, so `/events` can filter.

---

## 2. Sign-in with AuthKit

Hosted AuthKit UI, official SDK `@workos-inc/node`, sealed-session cookie. No custom auth screens. Everything is in a new `src/server/auth.ts` mounted from `main.ts`; the WorkOS client is `new WorkOS(WORKOS_API_KEY, { clientId: WORKOS_CLIENT_ID })`.

Hosted mode is on when `WORKOS_API_KEY` is set. Otherwise the server runs exactly as today (section 3).

### Routes

| Route | What it does |
|---|---|
| `GET /auth/login` | Set a 10-minute `wos-state` cookie with a random nonce. Redirect to `workos.userManagement.getAuthorizationUrl({ provider: "authkit", clientId, redirectUri: WORKOS_REDIRECT_URI, state })`. Accept `?return_to=` and carry it inside `state` (executor's `encodeLoginState`). |
| `GET /auth/callback` | The path of `WORKOS_REDIRECT_URI`. If `state` is missing (the request started at WorkOS, e.g. an accepted invitation), redirect to `/auth/login` and start over. Else compare `state` to the cookie, then `authenticateWithCode({ clientId, code, session: { sealSession: true, cookiePassword: WORKOS_COOKIE_PASSWORD } })` → `{ user, sealedSession }`. Then **sync memberships** (below), set cookies, redirect to `return_to` or `/`. |
| `POST /auth/logout` | `loadSealedSession({ sessionData: cookie, cookiePassword }).getLogOutUrl()`; clear both cookies; redirect to that URL. WorkOS then sends the browser to the Sign-out URI configured in the dashboard. |
| `GET /api/me` | `{ user: { id, email, name }, team: { id, name, role }, teams: [{ id, name, role }] }`. The UI's first request. 401 when signed out. |

### Cookies

- `wos-session`: the sealed session from WorkOS. `httpOnly, secure, sameSite=lax, path=/`, 7 days. Verified per request by `loadSealedSession(...).authenticate()`; when that fails for any reason other than `no_session_cookie_provided`, call `session.refresh()` once and re-set the cookie, else treat as signed out.
- `machine_team`: the current team id. `httpOnly, secure, sameSite=lax, path=/`, 1 year. Changed by `POST /api/teams/:id/switch`. **Not a trust boundary**: every request re-checks `members(team_id, user_id)`.

Two middlewares in `auth.ts`:

```ts
requireUser   // reads wos-session → c.set("user", { id, email, name })      → 401 JSON on /api, 302 /auth/login on pages
requireTeam   // reads machine_team, SELECT role FROM members WHERE team_id=? AND user_id=?
              // missing or not a member → first team by created_at, or 404 { error: "no_team" } so the UI shows "Create a team"
              // → c.set("team", id), c.set("role", role), c.set("scoped", store.forTeam(id))
```

### A WorkOS organization is a team

Teams live in **both** places, with WorkOS as the source of the id and ours as the source of role and the list we authorize against:

- `POST /api/teams { name }` → `workos.organizations.createOrganization({ name })` → `INSERT teams (id = org.id, name)` → `workos.userManagement.createOrganizationMembership({ organizationId, userId })` → `INSERT members (role = 'owner')` → set `machine_team`.
- Why not teams only in our DB: WorkOS invitations (below) need an organization to invite into. That one feature is worth the second write.
- The WorkOS role slug is left at its default (`member`) for everyone; `members.role` is ours. The WorkOS `org_id` claim in the session is ignored; `machine_team` picks the team.

### First run

After the callback, a user with zero rows in `members` is sent to `/#/teams/new`, one field (team name), which calls `POST /api/teams`. There is no personal workspace; the person makes a team of one and that is their seat.

### Membership sync, once per sign-in

In the callback, after authenticating:

```ts
const list = await workos.userManagement.listOrganizationMemberships({ userId: user.id, statuses: ["active"] });
// for each: INSERT OR IGNORE teams (id = organizationId, name = organizationName); INSERT OR IGNORE members (role = 'member')
// then: DELETE FROM members WHERE user_id = ? AND team_id NOT IN (list)   -- removed in the WorkOS dashboard → gone here too
```

`INSERT OR IGNORE` keeps an existing `owner` row an owner. This is the whole reconciliation story. Executor's Events API reconciler, webhook and cron existed so a dashboard revocation lands within seconds instead of at the person's next sign-in; for a team of a few people, next sign-in is fine, and every change made through our UI writes both sides immediately.

### Invitations: WorkOS's, not ours

Pick: **WorkOS invitations**. Reason: WorkOS sends the email, hosts the accept screen inside AuthKit, creates the user if needed and the membership on accept, and expires the token. Our own table would mean sending email ourselves (no email provider in this stack today), a token column, an accept page and an expiry job. Four things for nothing.

| Route | Owner only | Calls |
|---|---|---|
| `GET /api/teams/:id/invites` | no | `workos.userManagement.listInvitations({ organizationId })`, pending only |
| `POST /api/teams/:id/invites { email }` | yes | `workos.userManagement.sendInvitation({ email, organizationId, inviterUserId })` |
| `DELETE /api/teams/:id/invites/:inv` | yes | `workos.userManagement.revokeInvitation(inv)` |

How the invitee gets in: the email link goes to AuthKit, they sign in or sign up, WorkOS marks the membership active, then sends them to our **Initiate login URI** (`/auth/login`) because the flow did not start in our app. `/auth/login` runs the normal flow; the callback's membership sync inserts their `members` row with `role = 'member'`. No code on our side touches the invitation token.

### Dashboard settings and env vars

In the WorkOS dashboard for your environment (I cannot log in; these are the settings the Node quickstart at https://workos.com/docs/authkit/vanilla/nodejs names):

| Setting (in the environment's **Redirects** tab) | Value |
|---|---|
| Redirect URI | `https://<host>/auth/callback` (add `http://localhost:7420/auth/callback` in the staging environment for dev) |
| Initiate login URI | `https://<host>/auth/login` (invitation acceptance lands here; see above) |
| Sign-out URI | `https://<host>/` |

Also: enable the sign-in methods you want (email + password, Magic Auth, Google) under the environment's authentication settings; nothing else. No roles to add (the default `member` slug is enough), no webhooks, no SSO.

| Env var | Where it comes from |
|---|---|
| `WORKOS_API_KEY` | the environment's API key (`sk_…`), server only |
| `WORKOS_CLIENT_ID` | the environment's client id (`client_…`) |
| `WORKOS_REDIRECT_URI` | `https://<host>/auth/callback`, must equal the dashboard value exactly |
| `WORKOS_COOKIE_PASSWORD` | `openssl rand -base64 32`; rotating it signs everyone out |
| `MACHINE_PUBLIC_URL` | `https://<host>`; used in the rendered skill's `claude mcp add` line and in redirects |

---

## 3. Agents on `/mcp`: a per-member API key

Simplest safe option: a bearer key the member creates in the UI and pastes into their MCP config. No OAuth, no device flow, no JWKS. (Executor's MCP OAuth with AuthKit as authorization server, `apps/cloud/src/mcp/auth.ts`, is the upgrade path if a client ever refuses static headers. Claude Code does not: `claude mcp add --transport http machine https://<host>/mcp --header "Authorization: Bearer mk_…"`.)

Per **member**, scoped to one team, because: revoking a person revokes their keys with one `DELETE FROM api_keys WHERE team_id=? AND user_id=?`; a shared team key would have to be rotated and re-pasted by everyone when anyone leaves; and `runs.agent` can later carry who started a run without a new concept.

- `POST /api/teams/:id/keys { name }` → secret `mk_` + 32 random bytes base64url; store `prefix`, `hash = sha256(secret)`; return the secret **once**.
- `GET /api/teams/:id/keys` → own keys (id, name, prefix, created_at, last_used_at).
- `DELETE /api/teams/:id/keys/:key` → own key, or any key if owner.

### Server middleware

In `main.ts`, before `app.all("/mcp", …)`:

```ts
app.use("/mcp", async (c, next) => {
  if (!hosted) { c.set("team", "local"); return next(); }
  const h = c.req.header("authorization") ?? "";
  const secret = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  const row = secret && store.apiKeyByHash(sha256(secret));          // SELECT team_id, id FROM api_keys WHERE hash = ?
  if (!row) return c.json({ error: "unauthorized" }, 401, { "WWW-Authenticate": "Bearer" });
  store.touchApiKey(row.id);                                        // last_used_at
  c.set("team", row.team_id);
  return next();
});
app.all("/mcp", (c) => mcp.fetch(c.req.raw, { parsedBody: c.get("parsedBody"), authInfo: { token: "", clientId: c.get("team"), scopes: [] } }));
```

The `createMcpHandler` factory already receives `{ requestInfo }` (a `Request`; `author.ts` reads `?author=` from it). Read the team from `authInfo.clientId` (or re-read the header from `requestInfo.headers`) and build `new Engine(store.forTeam(team))` for that request's tools. Every tool then sees only that team's machines and runs; a `run_id` from another team is `run_not_found`.

Two more hosted-only lines in `main.ts`:

- `createMcpHonoApp({ host: "0.0.0.0", allowedHosts: [new URL(MACHINE_PUBLIC_URL).hostname] })`: today the default `127.0.0.1` host turns on the localhost DNS-rebinding check, which would 403 every hosted request.
- `renderSkill(m, { baseUrl: MACHINE_PUBLIC_URL })` on `GET /api/machines/:id/skill`, so the skill's registration line points at the hosted server and says to add the `--header`.

### Local `machine serve`: unchanged

`hosted = !!process.env.WORKOS_API_KEY`. When false: no auth middleware, no cookies, `/mcp` open on localhost as now, every request is team `local`, the UI never shows sign-in. `src/cli.ts` is untouched. The only visible change locally is the one-time migration.

---

## 4. UI, minimum

Hash routes as in `src/ui/main.tsx`; the existing screens keep their files. New ones follow `PageHead`, rows, pills from `DESIGN.md`; no new components.

| Screen | Route | API behind it |
|---|---|---|
| Signed-out gate | any route while `/api/me` is 401 | the app renders one pill, "Sign in", linking to `/auth/login?return_to=<hash>` (hosted only) |
| Create a team (first run) | `#/teams/new` | `POST /api/teams` |
| Team switcher | in the top bar, next to the brand, only when `teams.length > 1` | `/api/me`, `POST /api/teams/:id/switch` then reload |
| Runs | `#/` (exists) | `GET /api/runs`, now scoped by `requireTeam` |
| Run | `#/runs/:id` (exists) | `GET /api/runs/:id`, human actions, all scoped |
| Machines, editor, describe | exist | `GET/PUT /api/machines…`, scoped. `POST /api/machines/:id/publish` in hosted mode only bumps the version (no `~/.claude/skills` write on the server); the editor's "View skill" pane shows the `claude mcp add … --header` line and a download |
| Members | `#/team` | `GET /api/teams/:id/members`, `GET/POST/DELETE …/invites`, `DELETE …/members/:user_id` (owner), `PUT …/members/:user_id { role }` (owner), `PUT /api/teams/:id { name }` (owner) |
| Your keys | `#/team/keys` (a section of Members is enough) | `GET/POST/DELETE /api/teams/:id/keys`, secret shown once in a mono field with copy |
| Sign out | a quiet link in the bar | `POST /auth/logout` |

`/events` (SSE) stays one stream per tab; the server filters `run` events by the third `onChange` argument against `c.get("team")`, and `author.*` events by the session's team. The UI's `api.ts` needs one addition: on any 401, go to the signed-out gate.

Full route list, server side, all under `requireUser` + `requireTeam` except where noted:

```
GET  /auth/login  GET /auth/callback  POST /auth/logout      public
GET  /api/me                                                 requireUser only
POST /api/teams                                              requireUser only
POST /api/teams/:id/switch
GET  /api/teams/:id/members   DELETE …/members/:user_id   PUT …/members/:user_id   PUT /api/teams/:id
GET  /api/teams/:id/invites   POST …/invites   DELETE …/invites/:inv
GET  /api/teams/:id/keys      POST …/keys      DELETE …/keys/:key
GET  /api/runs …  GET/PUT/POST /api/machines …  /api/author …   (existing, now scoped)
GET  /events                                                 (existing, now filtered)
ALL  /mcp                                                    bearer key, not cookie
```

---

## 5. Decisions only the owner can make

### 5.1 Hosting target

The server as written depends on `Bun.serve`, `bun:sqlite`, `Bun.file`, long-lived SSE streams, and (for describe-it) spawning `claude`/`gemini` child processes. That rules out the Workers runtime without a rewrite.

| Option | What changes | Notes |
|---|---|---|
| **A. One Bun container with a volume** (Fly.io, Railway, Render, a Hetzner box) | nothing but auth; `MACHINE_HOME` on the volume | Same binary as local. Put Cloudflare DNS/proxy in front if you want the CF edge. SQLite with Litestream to R2 for backups if you want belt and braces. |
| B. Cloudflare Containers | same code, but a Durable Object fronts the container and SSE/idle behaviour is newer ground | Uses your CF experience, costs a learning curve on a still-new product. |
| C. Cloudflare Workers + D1/Durable Objects (executor's `host-cloudflare` shape) | rewrite `sqlite-store.ts` for D1, replace `Bun.serve` and `Bun.file`, drop describe-it | Weeks, not hours; the opposite of the brief. |

**Recommendation: A.** Fly.io or Railway, one machine, one volume, `bun src/cli.ts serve`. Revisit only if you need more than one region or instance.

### 5.2 SQLite or Postgres for the hosted DB

| Option | For | Against |
|---|---|---|
| **SQLite on the volume** (as now) | zero change; the store is 75 lines; WAL handles the write rate of a few teams easily | single instance only; backups are your job (Litestream, or a nightly `sqlite3 .backup` to R2) |
| Postgres (your shared `:5433` locally, managed in prod) | multi-instance later; managed backups | a second store implementation (`pg-store.ts`) and a second code path to keep in sync; `bun:sqlite` is synchronous and the engine assumes that (every `store.*` call is sync), so Postgres means making `RunStore` async through the engine and the MCP tools |

**Recommendation: SQLite.** The `RunStore` interface is the seam; port when a hosting decision forces it, not before. The one thing to do now: keep `team_id` on every query so the port is mechanical.

### 5.3 Do local runs sync up to the team, or is the hosted server the only server for teams?

| Option | Shape |
|---|---|
| **Hosted is the only team server** | An agent on anyone's laptop points at `https://<host>/mcp` with their key. `machine serve` stays single-player and offline. No sync protocol. |
| Local serve forwards to the team | Every `saveRun` also POSTs to the hosted server; needs idempotent upserts, event seq reconciliation, offline queueing, and a way to say which team a local run belongs to. |

**Recommendation: hosted only.** The run already lives wherever the MCP endpoint is; choosing the endpoint *is* choosing local or team. A later `machine pull <id>` CLI command (download a team machine's `SKILL.md` into `~/.claude/skills` with a key) covers the real need, which is getting the skill onto the laptop, not getting runs off it.

### 5.4 Things hit on the way

- **Describe-it in hosted mode.** `author.ts` spawns local agent CLIs that are logged in with *your* accounts. On a server that is either your account for every team or nothing. Options: ship hosted v1 with draw + JSON only (describe-it stays local); or later run the Claude path on the server with an API key through the Agent SDK. **Recommendation: hosted v1 without describe-it**, hidden behind `hosted`.
- **Who may invite.** Owner only (as specified above) or any member (Basecamp lets any member add people in most setups). **Recommendation: owner only**, one line to change later.
- **Domain.** The Redirect URI, Initiate login URI and `MACHINE_PUBLIC_URL` all pin to it, so pick it before the dashboard settings are entered. Two WorkOS environments (staging with localhost URIs, production with the domain) is the normal setup.
- **Invitation email sender.** WorkOS sends from its own domain unless you configure email sending under a custom domain in the dashboard. Fine for v1.
- **A leaving owner.** Refuse to remove or demote the last owner (one `SELECT COUNT(*)`), rather than build transfer-of-ownership. Deleting a team: owner only, deletes the WorkOS organization then our rows; or leave it out of v1 entirely.
- **Billing hook, for later.** `teams.stripe_customer_id` is the only column reserved. Seats = `SELECT COUNT(*) FROM members WHERE team_id = ?`. Nothing else to prepare.

---

## 6. Build order

Each step leaves the local mode working and the evals passing. Each is a few hours.

1. **Schema.** `sqlite-store.ts`: `user_version` migration, `teams`/`members`/`api_keys`, `team_id` on `machines` and `runs`, `forTeam()`, third `onChange` argument. `main.ts` uses `store.forTeam("local")` and `new Engine(...)` per request. Run `bun evals/run.ts changelog-happy`; same result as before.
2. **Hosted switch and MCP keys.** `hosted` flag, `createMcpHonoApp` host/allowedHosts, the `/mcp` bearer middleware, `apiKeyByHash`/`touchApiKey`, `MACHINE_PUBLIC_URL` into `renderSkill`. Test with a row inserted by hand and `claude mcp add … --header`.
3. **AuthKit.** `bun add @workos-inc/node`. `src/server/auth.ts`: `/auth/login`, `/auth/callback` (with membership sync), `/auth/logout`, `requireUser`, `requireTeam`, `GET /api/me`. Dashboard: the three redirect settings; env: the five variables. Sign in once in the browser, see `wos-session` set.
4. **Teams and members API.** `POST /api/teams`, `switch`, members, invites, keys routes. Create a team, invite a second address, accept it in another browser, see the member row appear on their sign-in.
5. **UI.** Signed-out gate, create-team screen, team switcher in the bar, Members screen with invites and keys, sign-out link, 401 handling in `api.ts`, hide describe-it when hosted, publish shows the `claude mcp add` line. Scope `/events`.
6. **Deploy.** Dockerfile (`oven/bun`, `bun install --production`, `bunx vite build`, `bun src/cli.ts serve`), a volume at `MACHINE_HOME`, the env vars, the production WorkOS environment. Point a laptop's Claude Code at it with a key and run `changelog-draft` end to end; watch it in the hosted UI from a second member's browser.

Check for the whole thing: two people, two browsers, one team; one of them starts a run from their laptop over MCP with their own key; the other watches it move and fires a human event. Nothing in `src/cli.ts` or the evals changed.

## Getting machines in (decided 2026-10-21)

Hosted is the only team server; local runs never sync up. Machines move by import, three ways, all landing as the next version of the machine's id in the team:

- `machine push <machine.json | skill folder>` from the CLI after `machine login` (a skill folder is read for its `machine.json`).
- The **Import** button on the Machines page (pick a machine.json; opens the machine when it lands, shows the validation problems when it doesn't).
- The `import_machine` agent tool on `/mcp`, so "import this machine into our team" works from a chat.

All three validate the definition first and assign the version themselves. Route: `POST /api/machines/import`.
