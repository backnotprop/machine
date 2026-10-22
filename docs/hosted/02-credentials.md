# Hosted: credentials

A team stores credentials once. A machine says which ones it needs. A run uses them, and every use is on the run's timeline. This is the part of the hosted service that a local `machine serve` cannot do.

What this borrows: Nango's connection row (one encrypted JSON blob, iv and tag beside it, refresh 15 minutes before expiry) and its header templates; executor's rule that the secret is rendered on the trusted side and its `node:crypto` key handling. What this does not borrow: executor's provider plugins and binding tables, Nango's connect-ui plumbing. Neither reference had a local lease; that part is new.

## 1. The model

One store per team. Two kinds cover every example machine in `examples/` (`gh`, `git push`, `npm publish`, `aws`, `curl` to an API):

| kind | what the member does | secret JSON stored |
|---|---|---|
| `static` | pastes values into a form | the fields the provider catalog names: `{ token }`, `{ username, password }`, `{ access_key_id, secret_access_key }` |
| `oauth` | clicks Connect, authorises in the provider | `{ access_token, refresh_token?, raw }`; for GitHub App only `{ installation_id }`, tokens are minted on demand |

Username+password and API key are both `static`; the difference is which fields the catalog asks for. There is no third kind.

**Provider catalog** (`src/engine/providers.ts`, a typed object, not YAML). One entry per provider, each with: `kind`, `fields` (static) or `authorize_url`, `token_url`, `scope_separator` (oauth, copied by hand from Nango's `providers.yaml`), `proxy: { base_url, header }` (`Authorization: Bearer ${token}`), `inject` (the env recipe in section 3b), and an optional `verify` request to run after save (`GET /user` on GitHub, `whoami` on npm, `sts get-caller-identity` on AWS). v1 entries: `github` (static token), `github-app` (oauth), `npm`, `aws`, `basic`, `http` (a bare bearer token for any API, with `base_url` supplied by the author).

**Tables** (added to `sqlite-store.ts`):

```sql
CREATE TABLE credentials (
  id          TEXT PRIMARY KEY,        -- cred_ + 8 random chars
  team_id     TEXT NOT NULL,
  provider    TEXT NOT NULL,           -- catalog key
  kind        TEXT NOT NULL,           -- static | oauth
  name        TEXT NOT NULL,           -- "GitHub · ramos", "npm publish token"
  account     TEXT,                    -- login / email / account id the provider reported; plaintext, for the UI
  scopes      TEXT,                    -- JSON array, oauth only
  secret_ct   TEXT NOT NULL,           -- base64 AES-256-GCM ciphertext of the secret JSON
  secret_iv   TEXT NOT NULL,           -- base64, 12 bytes
  secret_tag  TEXT NOT NULL,           -- base64, 16 bytes
  key_id      TEXT NOT NULL,           -- 'k1' in v1; lets a later script re-encrypt without a redesign
  expires_at  TEXT,                    -- oauth access token expiry; plaintext so refresh can decide without decrypting
  status      TEXT NOT NULL,           -- ok | refresh_failed | revoked
  last_used_at TEXT,
  created_by  TEXT NOT NULL,           -- member id
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE TABLE machine_credentials (     -- which stored credential fills which slot of which machine
  team_id TEXT NOT NULL, machine_id TEXT NOT NULL, slot TEXT NOT NULL, credential_id TEXT NOT NULL,
  PRIMARY KEY (team_id, machine_id, slot)
);
```

`machine_credentials` is a pointer and nothing else. Executor's v1 had a binding table that also held values and provider ids and it took a 1,200-line migration to undo; this one is two foreign keys.

**Encryption at rest.** `node:crypto`, which Bun ships: `createCipheriv("aes-256-gcm", key, randomBytes(12))`, 16-byte auth tag, all three parts base64. The whole secret JSON is encrypted as one string, like Nango's `encrypted_credentials`. Nothing in the plaintext columns is a secret.

- The key is `MACHINE_SECRET_KEY`, base64 of 32 bytes (`openssl rand -base64 32`). In production it lives in the host's secret store (Fly or Render secrets, injected as an env var), nowhere else. In development, if unset, the server generates `~/.machine/secret.key` with mode 0600 and uses that (executor did exactly this).
- On first use the server stores `sha256(key)` in a one-row `meta` table. If the key changes, the server refuses to start with a message naming the variable, as Nango does. No rotation code in v1; `key_id` is the hook for it.
- Decrypt happens only inside three server paths: refresh, proxy, lease. The UI never receives a secret after it is saved; the API returns `name`, `account`, `status`, `expires_at`.

## 2. How a machine declares a need

Addition to the definition (`schema/machine.schema.json`, `Machine` in `engine.ts`):

```json
"credentials": [
  { "id": "github", "provider": "github", "scopes": ["repo"], "why": "open and merge the PR" },
  { "id": "npm",    "provider": "npm",    "why": "publish", "handoff": false }
]
```

and on a state, optionally:

```json
"credentials": ["npm"]
```

- Machine level is the list of **slots**: `id` is the slot name the team binds a stored credential to; `provider` is a catalog key; `scopes` applies to oauth providers; `why` is shown to the member on the Connect button; `handoff` (default false) is whether section 3c may hand the raw value to the agent.
- State level says **when** a slot is live. While a run is in a state that lists credentials, only those slots can be leased or proxied. A state with no list can use every slot. So the npm token exists only during `publish`. This is one lookup in the engine, not a policy layer.
- `validateMachine` adds: unknown provider, state references an undeclared slot, duplicate slot ids.

**Preflight** does the credential check server-side, because only the server can see the store. The result gains:

```json
"credentials": [
  { "id": "github", "provider": "github", "ok": true,  "name": "GitHub · ramos", "account": "ramos" },
  { "id": "npm",    "provider": "npm",    "ok": false, "reason": "not connected", "connect_url": "https://app/.../machines/plannotator-release#credentials" }
]
```

`ok: false` when the slot is unbound, the credential is `revoked` or `refresh_failed`, or the member's own token cannot reach the team. The agent does not check anything itself; the existing `requirements` like `gh auth status` stay for the local-environment case and can be deleted from a machine once it uses a slot.

**Begin** follows the existing blocked path. If any slot is not ok, the run is created `blocked` with `error.code: "credentials_missing"` and `needs: ["Connect npm for Release Plannotator (publish): <connect_url>"]`. The agent prints the run link and stops, as it already does for a failed requirement. The member connects, presses unblock, and a session resumes from `get`. Nothing new to teach the agent.

**State cards** carry the live slots, so the agent knows how to use them without reading the whole skill:

```json
"credentials": [ { "id": "github", "provider": "github", "use": "machine run run_x -- gh ...   or the request tool" } ]
```

**UI.** The machine page gets a Credentials strip, one row per slot: `github · GitHub · repo · Connected as ramos · [change]` or `npm · npm · [Connect]`. Connect on a `static` provider opens a form with the catalog's fields and a Save that runs `verify` first and shows the account it found. Connect on an oauth provider redirects to `/api/credentials/oauth/:provider/start?machine=<id>&slot=<id>`; the callback at `/api/credentials/oauth/callback` exchanges the code, saves the row, binds the slot, and redirects back to the machine page. One redirect, no popup, no WebSocket; that is the whole of connect-ui we need. A team Credentials page lists every stored credential with name, provider, account, status, last used, which machines use it, and a Remove button. A blocked run's needs list renders the `connect_url` as a button so the fix is one click from the run page.

**Skill.** `render-skill.ts` adds a Credentials section: the slots, their providers, when they are live, and three rules: use `machine run` or the `request` tool; never ask the human for a token value; never print one.

## 3. The three ways an agent uses a credential

Ranked by how little of the secret the model can see.

### (a) Server-side use: the hosted server makes the call

MCP tool `request(run_id, credential, method, path, headers?, body?)`. The server looks up the run, confirms it is `running` and the slot is live in the current state, decrypts, refreshes if needed, builds the auth header from the catalog template, sends `method base_url + path`, and returns `{ status, headers, body }` (body truncated at a sane size, say 256 KB, with a note). The token never leaves the server. This is Nango's `/proxy` with the connection id replaced by the run id.

Covers: any step that is an API call (open an issue, post to Slack, read a Vercel deployment, dispatch a workflow). Works wherever the agent runs, including a cloud sandbox. Does not cover `gh`, `git push`, `npm publish`, `aws` and the rest of what the example machines actually do.

### (b) Local lease: the `machine` CLI injects the secret into a child process

```
machine login                                    # once; stores the member token in ~/.machine/credentials.json (0600)
machine run run_x -- gh pr create --fill         # the agent runs this instead of gh pr create
machine run run_x -- git push origin HEAD
machine run run_x -- npm publish
```

Mechanism:

1. `machine run` calls `POST /api/runs/:id/lease` with the member token and `{ command: "gh pr create" }`. The server checks the run is `running`, picks the slots live in the current state, decrypts, refreshes OAuth tokens that expire within 15 minutes, mints a fresh GitHub App installation token (they live one hour, which is the lease), appends a `credential` entry to the run history for each slot (section 4), and returns `{ credentials: [{ id, provider, fields }], expires_at }`. Nothing is written to the server's disk; nothing is written to the local disk except the npm case below, and that is removed on exit.
2. The CLI builds the child environment from each provider's `inject` recipe, spawns the command with `Bun.spawn({ cmd, env: { ...process.env, ...injected }, stdio: ["inherit", "inherit", "inherit"] })`, and exits with the child's code.

Recipes in v1:

| provider | injected |
|---|---|
| `github`, `github-app` | `GH_TOKEN`, `GITHUB_TOKEN`; and for plain git: `GIT_CONFIG_COUNT=1`, `GIT_CONFIG_KEY_0=credential.helper`, `GIT_CONFIG_VALUE_0='!f() { echo username=x-access-token; echo password=$GH_TOKEN; }; f'` so `git push` over HTTPS authenticates without touching the user's git config |
| `npm` | a temp `.npmrc` with `//registry.npmjs.org/:_authToken=<token>` (mode 0600) and `NPM_CONFIG_USERCONFIG` pointing at it; deleted on exit and on SIGINT/SIGTERM |
| `aws` | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN` if present. `credential_process` is the next step if a team wants role assumption; not in v1 |
| `basic`, `http` | `MACHINE_<SLOT>_<FIELD>` in upper case, e.g. `MACHINE_VERCEL_TOKEN`, for `curl -H "Authorization: Bearer $MACHINE_VERCEL_TOKEN"` |

The agent types the command, sees stdout and stderr, and never sees the token in its context. This is what the owner asked for: credentials in the environment for CLIs without exposing them to the model.

Be honest about the limit. The model can run `machine run run_x -- env` and read the value. The lease does not stop that; it makes it visible (a `credential` entry with `command: "env"` on the timeline) and short-lived (GitHub App tokens expire in an hour; static tokens do not, which is one reason to prefer the App). Only (a) keeps the secret off the agent's machine. State this in the product copy as "out of the model's context", not "impossible to see".

### (c) Plain hand-off: the agent asks and receives the value

MCP tool `credential(run_id, id)` returns the fields. Allowed only when the slot's declaration has `handoff: true`, and the history entry is written with `exposed: true` so the timeline marks it. For the cases the other two cannot serve: an SDK that only reads a token from a config file the agent must write, or an agent that cannot run the CLI. Last resort, and the author has to opt in per slot.

### Which to build first

(b), then (a), then (c). Every example machine in this repo runs on the person's computer and shells out to `gh`, `git`, `npm` and `aws`; a credential layer that cannot feed those is not usable on day one. (a) is second because it is the only one with real isolation and it is what cloud-run agents will need. (c) is an afternoon once the lease endpoint exists and should stay rare.

## 4. How this interacts with runs

Every use is a history entry, which makes it an SSE event and a timeline row with no new plumbing:

```ts
{ ts, type: "credential", actor: "agent",
  credential: { id: "cred_x", slot: "github", provider: "github", name: "GitHub · ramos", account: "ramos" },
  via: "lease" | "proxy" | "handoff",
  by: "member_id",                 // whose member token asked (lease) or whose MCP session (proxy, handoff)
  command?: "gh pr create",        // lease: argv of the child, no arguments beyond the program and subcommand
  request?: "POST /repos/x/y/pulls", // proxy
  exposed?: true }                 // handoff only
```

Timeline copy: "Used GitHub (ramos) for `gh pr create`", "Called GitHub: POST /repos/x/y/pulls → 201", "Handed npm token to the agent". The run page header counts them ("3 moves, 4 credential uses"). `credentials.last_used_at` is updated on each. The team Credentials page links each credential to its last runs by querying `events` for `type = 'credential'`.

Rules the engine enforces on a lease or proxy: run `running` (else `run_not_running`, the same error the agent already understands); slot live in the current state (else `credential_not_live` naming the states where it is); credential `status` ok (else the run is blocked with `credentials_missing`, which the member fixes by reconnecting and unblocking). Refresh failure marks the row `refresh_failed` and blocks the next run that needs it rather than failing the current call silently.

Connect, change and remove are not run events; they show on the credential's own page with who and when. Removing a credential that a machine binds leaves the slot unbound; the next preflight reports it.

## 5. Nango, or our own flows

**Do not embed Nango.** Self-hosted it needs Postgres and, for more than one instance, Redis, a second server, and its own dashboard, to hold a table we already have. Cloud Nango means the token lives with Nango, which contradicts "we store your credentials for you", and its connect-ui is iframe, popup and WebSocket plumbing around what for us is one redirect and one callback. Our own flow is about 150 lines for generic OAuth2 with refresh plus 80 for GitHub App installation tokens, and the data we want from Nango is the handful of `providers.yaml` entries (authorize URL, token URL, scope separator, header template), which we copy by hand. The trade-off is breadth: Nango knows 400 providers' quirks (Slack's comma-separated scopes, Google's `access_type=offline&prompt=consent`); we will learn them one provider at a time, and the first time a customer asks for provider ten we should reread this paragraph. Until then, every hour spent on Nango integration is an hour not spent on the lease CLI, which is the feature.

GitHub specifically: a **GitHub App**, not an OAuth App. Installation tokens last one hour and are scoped to the repositories the team chose, which is the lease model for free; there is no refresh token to store; `gh` and `git` accept them (`x-access-token`). The App's private key is one server env var, `MACHINE_GITHUB_APP_KEY`. Nango's `github-app` entry is the reference for the two URLs.

## 6. Decisions only the owner can make

1. **Where the agent runs in v1.** Local on the member's computer (build the lease first) or in a hosted sandbox (build the proxy first). Recommendation: local; it matches every machine you have and the way the evals run.
2. **GitHub: App, OAuth App, or paste a fine-grained PAT.** Recommendation: paste a PAT as a `static` credential in week one so the lease works immediately; the GitHub App is the first and only OAuth provider in v1. Add Slack or Google only when a machine of yours needs them.
3. **Ship the hand-off tool at all.** It is the one path where the model sees the secret. Recommendation: ship it, opt-in per slot, red on the timeline. A product without it will meet a tool that only reads a config file and the agent will improvise something worse.
4. **Master key custody.** One `MACHINE_SECRET_KEY` for the service (recommendation) or one key per team wrapped by a service key. Per-team keys buy a story, not safety, until a customer asks for it in writing.
5. **Team-shared or personal credentials.** The brief says team-level and the table is team-level; an OAuth connection is still one person's account, shown as `account`. Recommendation: team-level only, with `created_by` recorded, and the UI phrases it "Connected as ramos" so the team knows whose identity acts. Personal credentials later if anyone asks.
6. **How the CLI authenticates to the hosted server.** Paste a member token from the UI (`machine login` prompts for it) or an OAuth device-code flow like executor's. Recommendation: paste in v1; it is the same token `claude mcp add --transport http machine <url>/mcp --header "Authorization: Bearer ..."` needs anyway, so the member does one copy for both.
7. **Shape of the proxy.** Generic HTTP on the provider's `base_url` (recommendation; matches Nango and needs no per-provider code) or curated named actions. Curated actions are nicer in the state card and twenty times the work.
8. **Whether a state-level list restricts or only documents.** Recommendation: restricts, as written in section 2. If you would rather keep the engine ignorant of it, delete one `if` and the npm token is live for the whole run.

## 7. Build order

Each step is a few hours and ends with something you can click or run.

1. **Store and crypto.** `credentials` and `machine_credentials` tables, `meta` with the key fingerprint, `encrypt`/`decrypt` in `src/engine/crypto.ts`, `MACHINE_SECRET_KEY` with the dev key-file fallback. `src/engine/providers.ts` with `github` (static), `npm`, `aws`, `basic`, `http`. Routes: `GET/POST/DELETE /api/credentials`, `PUT /api/machines/:id/credentials/:slot`. Check: `curl` creates a credential, the row's secret columns are gibberish, the GET returns no secret.
2. **Declaration.** `credentials` on `Machine` and `State`, schema and `validateMachine` additions, preflight returns `credentials[]`, begin blocks with `credentials_missing`, the state card lists live slots, `render-skill.ts` adds the section. Check: `bun evals/run.ts changelog-blocked`-style case where a slot is unbound; the run is created blocked with the connect need and the agent stops.
3. **UI.** Credentials strip on the machine page with the static form and `verify`; the team Credentials page; the Connect button in a blocked run's needs. Check: bind a GitHub PAT to `ship-fix`, unblock the run from step 2, a fresh session resumes.
4. **Lease.** `POST /api/runs/:id/lease`, the history entry, `machine login`, `machine run <run_id> -- <cmd>` with the `github`, `npm`, `aws` and `http` recipes and temp-file cleanup. Check: an eval where the agent opens a PR with `machine run run_x -- gh pr create` against the stub `gh` in `evals/fixtures`, zero rejected calls, one `credential` entry in the history with `command: "gh pr create"`, and the token string absent from the eval transcript.
5. **Timeline.** Render `credential` entries in `run.tsx`, the count in the header, last runs on the credential page. Check: watch step 4's run live in the browser and see the use arrive.
6. **Proxy.** The `request` MCP tool with the catalog header templates and the 15-minute refresh rule. Check: a machine state that creates a GitHub issue through `request` only; the run history shows `via: proxy` and the agent's transcript contains no token.
7. **GitHub App.** The `github-app` provider: install redirect, callback with `installation_id`, installation token minting with the App's private key, refresh when under 15 minutes. Check: the same eval as step 4 with the slot bound to the App; the lease returns a token that expires within the hour.
8. **Generic OAuth2.** `/oauth/:provider/start` and `/oauth/callback` with PKCE, token exchange, refresh with the in-process lock and the re-read after acquiring it; `refresh_failed` status. One provider as the test (Slack, since its scope separator is the known trap). Check: connect, let the token expire, the next proxy call refreshes and succeeds.
9. **Hand-off.** The `credential` MCP tool gated on `handoff: true`, the `exposed` entry, the red timeline row. Check: a machine without `handoff` gets `credential_handoff_disabled`; one with it gets the value and the timeline says so.

Not in v1 and not planned until a run asks for it: key rotation, per-member credentials, `credential_process` for AWS roles, approval before a use, limits of any kind.
