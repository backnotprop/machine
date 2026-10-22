// Screenshots of every screen, against the local server on :7420 (read-only: writes are mocked).
// usage: node docs/design/scripts/shoot.mjs <outdir: before|after> [theme: light|dark|none] [width] [only-regex]
// Hosted screens (sign-in, team, hosted credentials) mock /api/me and friends, the way /tmp/machine-ui/shot-hosted.mjs did.
import { chromium } from "playwright";
const [outName = "before", theme = "none", widthArg = "1440", only = ""] = process.argv.slice(2);
const width = Number(widthArg), height = width < 600 ? 844 : 900;
const out = new URL(`../${outName}/`, import.meta.url).pathname;
const base = "http://localhost:7420";
const suffix = `${theme === "none" ? "" : `-${theme}`}${width === 1440 ? "" : `-${width}`}`;

// ---------- hosted mocks ----------
const members = [
  { user_id: "user_m", email: "michael@plannotator.dev", name: "Michael Ramos", role: "owner", created_at: "2026-10-12T10:00:00Z" },
  { user_id: "user_d", email: "dana@plannotator.dev", name: "Dana Whitfield", role: "member", created_at: "2026-10-15T10:00:00Z" },
  { user_id: "user_j", email: "jun@plannotator.dev", name: "Jun Park", role: "member", created_at: "2026-10-16T10:00:00Z" },
  { user_id: "user_p", email: "priya@plannotator.dev", name: "Priya Natarajan", role: "owner", created_at: "2026-10-17T10:00:00Z" },
];
const team = { id: "org_plannotator", name: "Plannotator", role: "owner" };
const ago = (min) => new Date(Date.now() - min * 60000).toISOString();
const at = (h, m) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.toISOString(); };
const creds = [
  { id: "cred_gh", provider: "github-app", kind: "oauth", name: "GitHub · michael", account: "michael", scopes: null, status: "ok", last_used_at: ago(3), created_by: "user_m", created_at: "2026-10-12T10:00:00Z", uses: [{ machine_id: "ship-fix", slot: "github" }, { machine_id: "plannotator-release", slot: "github" }] },
  { id: "cred_npm", provider: "npm", kind: "static", name: "npm publish token", account: "plannotator-bot", status: "ok", last_used_at: ago(120), created_by: "user_d", created_at: "2026-10-15T10:00:00Z", uses: [{ machine_id: "plannotator-release", slot: "npm" }] },
  { id: "cred_aws", provider: "aws", kind: "static", name: "AWS · deploy", account: "975050215161", status: "ok", last_used_at: null, created_by: "user_m", created_at: "2026-10-15T12:00:00Z", uses: [{ machine_id: "plannotator-release", slot: "aws" }] },
];
const slotsOf = {
  "ship-fix": [{ id: "github", provider: "github-app", why: "open and merge the PR", ok: true, credential_id: "cred_gh", name: "GitHub · michael", account: "michael" }],
  "plannotator-release": [
    { id: "github", provider: "github-app", why: "push the tag and open the release", ok: true, credential_id: "cred_gh", name: "GitHub · michael", account: "michael" },
    { id: "npm", provider: "npm", why: "publish", ok: true, credential_id: "cred_npm", name: "npm publish token", account: "plannotator-bot" },
    { id: "aws", provider: "aws", why: "invalidate the CDN", ok: true, credential_id: "cred_aws", name: "AWS · deploy", account: "975050215161" },
  ],
  "triage-issue": [{ id: "linear", provider: "http", why: "to read the issue and its thread", ok: false, credential_id: null, reason: "not connected", connect_url: `${base}/#/machines/triage-issue` }],
};
const triage = { id: "triage-issue", version: 1, name: "Triage an issue", description: "Read a Linear issue and its thread, then label and route it.", initial: "fetch_issue",
  credentials: [{ id: "linear", provider: "http", why: "to read the issue and its thread", base_url: "https://api.linear.app" }],
  states: { fetch_issue: { kind: "task", title: "Read the issue and its thread", instructions: "Use the request tool with the linear slot.", on: { read: { to: "label" } } }, label: { kind: "task", title: "Label and route it", on: { done: { to: "routed" } } }, routed: { kind: "final", title: "Routed", outcome: "success" } } };
const needs = [`Connect linear for Triage an issue (to read the issue and its thread): ${base}/#/machines/triage-issue`];
const triageRun = { id: "run_tr1age01", machine: { id: "triage-issue", version: 1 }, status: "blocked", state: "fetch_issue", inputs: { issue: "PLN-2003" }, preflight: [], by: "user_j",
  error: { code: "credentials_missing", message: "credential(s) not connected: linear", needs },
  history: [{ ts: ago(8), type: "begin", actor: "agent", to: "fetch_issue" }, { ts: ago(8), type: "error", actor: "agent", error: { code: "credentials_missing", message: "credential(s) not connected: linear", needs } }],
  agent: { name: "Claude Code" }, created_at: ago(8), updated_at: ago(8) };
const gh = { id: "cred_gh", slot: "github", provider: "github-app", name: "GitHub · michael", account: "michael" };
const shipRun = { id: "run_k3m9x2pq", machine: { id: "ship-fix", version: 1 }, status: "waiting", state: "await_review", by: "user_m",
  inputs: { issue_url: "https://github.com/backnotprop/plannotator/issues/2003", repo_path: "/work/plannotator" },
  preflight: [{ id: "clean-tree", ok: true, detail: "git status --porcelain printed nothing." }, { id: "tests-run", ok: true, detail: "bun test starts and finishes in 1m 40s." }],
  error: null, agent: { name: "Claude Code" }, created_at: at(12, 3), updated_at: ago(4),
  history: [
    { ts: at(12, 3), type: "begin", actor: "agent", to: "reproduce" },
    { ts: at(12, 4), type: "transition", actor: "agent", from: "reproduce", event: "reproduced", to: "fix" },
    { ts: at(12, 4), type: "error", actor: "agent", error: { code: "ambiguous-fix", message: "Two fixes are possible.", needs: ["Two fixes are possible: a longer timer, or tying the toast to the store's clock. Which one do you want?"] } },
    { ts: at(12, 5), type: "unblock", actor: "human", by: "user_d", note: "Use the store clock, not a timer. There is a helper in inbox/clock.ts." },
    { ts: at(12, 7), type: "transition", actor: "agent", from: "fix", event: "fixed", to: "verify", note: "Replaced the toast's setTimeout with the inbox store's clock; added a regression test that opens the reply box mid-toast." },
    { ts: at(12, 9), type: "transition", actor: "agent", from: "verify", event: "pass", to: "open_pr", payload: { command: "bun test", passed: 212, failed: 0 } },
    { ts: at(12, 9), type: "credential", actor: "agent", credential: gh, via: "lease", by: "user_m", command: "gh pr create" },
    { ts: at(12, 10), type: "transition", actor: "agent", from: "open_pr", event: "opened", to: "await_review", note: "Opened PR #214 from fix/flaky-inbox-toast against main. 3 commits, 212 tests green.", payload: { pr_url: "https://github.com/backnotprop/plannotator/pull/214", commits: 3, base: "main" } },
  ] };
const summary = (r) => { const { history, ...s } = r; return s; };
const byFor = ["user_j", "user_m", "user_m", "user_d", "user_j"];

async function hostedRoutes(p, state) {
  await p.route("**/api/me", (r) => state.me === 401 ? r.fulfill({ status: 401, json: { error: "unauthorized" } }) : r.fulfill({ json: state.me }));
  await p.route("**/api/teams/*/members", (r) => r.fulfill({ json: members }));
  await p.route("**/api/teams/*/invites", (r) => r.fulfill({ json: [{ id: "inv_1", email: "sam@tldraw.com", expires_at: ago(-10000), created_at: "2026-10-18T09:00:00Z" }] }));
  await p.route("**/api/teams/*/keys", (r) => r.request().method() === "POST"
    ? r.fulfill({ status: 201, json: { id: "key_new", name: JSON.parse(r.request().postData()).name, prefix: "mk_7Hq2v", created_at: new Date().toISOString(), secret: "mk_7Hq2vNc4xR9tLm3pWz8KdY5sBf1Ge0JaQ6Xy2Lp" } })
    : r.fulfill({ json: [{ id: "key_1", name: "laptop", prefix: "mk_7Hq2v", created_at: "2026-10-12T10:00:00Z", last_used_at: ago(3) }, { id: "key_2", name: "ci", prefix: "mk_Qe91x", created_at: "2026-10-15T10:00:00Z", last_used_at: ago(120) }] }));
  await p.route("**/api/credentials", (r) => r.fulfill({ json: creds }));
  await p.route(/\/api\/machines\/([^/?]+)\/credentials$/, (r) => { const id = /machines\/([^/?]+)\//.exec(r.request().url())[1]; r.fulfill({ json: slotsOf[id] ?? [] }); });
  await p.route("**/api/machines", async (r) => { const ms = await (await r.fetch()).json(); for (const m of ms) { if (slotsOf[m.id]) m.credentials = slotsOf[m.id].map(({ id, provider, why }) => ({ id, provider, why })); if (m.id === "plannotator-release" && m.states.publish) m.states.publish.credentials = ["npm"]; } ms.push(triage); r.fulfill({ json: ms }); });
  await p.route(/\/api\/machines\/triage-issue(\?.*)?$/, (r) => r.fulfill({ json: triage }));
  await p.route("**/api/runs", async (r) => { const rs = await (await r.fetch()).json(); rs.forEach((x, i) => { x.by = byFor[i % byFor.length]; }); r.fulfill({ json: [summary(triageRun), summary(shipRun), ...rs] }); });
  await p.route("**/api/runs/run_tr1age01", (r) => r.fulfill({ json: triageRun }));
  await p.route("**/api/runs/run_k3m9x2pq", (r) => r.fulfill({ json: shipRun }));
}
// describe-it: never start a real agent
async function authorRoutes(p) {
  await p.route("**/api/author/sessions", (r) => r.fulfill({ json: { id: "s_mock", agent: "claude", config: [{ id: "model", name: "Model", value: "opus", options: [{ value: "opus", name: "Opus" }] }], draft: null, problems: [] } }));
  await p.route("**/api/author/sessions/**", (r) => r.fulfill({ json: { ok: true } }));
}

const me = { user: { id: "user_m", email: "michael@plannotator.dev", name: "Michael Ramos" }, team, teams: [team, { id: "org_tldraw", name: "tldraw", role: "member" }] };
const scenes = [
  { name: "01-runs", hash: "/" },
  { name: "02-runs-hosted", hash: "/", hosted: true },
  { name: "03-run-blocked", hash: "/runs/run_8y031ugp" },
  { name: "04-run-waiting", hash: "/runs/run_k3m9x2pq", hosted: true },
  { name: "05-run-blocked-credential", hash: "/runs/run_tr1age01", hosted: true },
  { name: "06-run-succeeded", hash: "/runs/run_0z7zj2kr" },
  { name: "07-run-fullscreen", hash: "/runs/run_8y031ugp", full: false, act: async (p) => { await p.keyboard.press("f"); await p.waitForTimeout(700); } },
  { name: "08-machines", hash: "/machines" },
  { name: "09-editor", hash: "/machines/ship-fix", full: false },
  { name: "10-editor-selected", hash: "/machines/ship-fix", full: false, act: async (p) => { await p.locator(".inspector .blk .sum").nth(2).click(); await p.waitForTimeout(500); } },
  { name: "11-editor-skill", hash: "/machines/ship-fix", full: false, act: async (p) => { await p.click("#tab-skill"); await p.waitForTimeout(400); } },
  { name: "12-editor-json", hash: "/machines/ship-fix", full: false, act: async (p) => { await p.click("#tab-json"); await p.waitForTimeout(400); } },
  { name: "13-describe", hash: "/machines/new", full: false, author: true },
  { name: "14-credentials", hash: "/credentials" },
  { name: "15-credentials-hosted", hash: "/credentials", hosted: true, act: async (p) => { await p.click(".actions .pill.primary, .actions .btn-primary"); await p.waitForTimeout(400); } },
  { name: "16-editor-credentials-hosted", hash: "/machines/plannotator-release", hosted: true, full: false, act: async (p) => { await p.click(".blk[data-blk=credentials] .sum"); await p.waitForTimeout(500); } },
  { name: "17-team", hash: "/team", hosted: true, act: async (p) => { await p.click(".team-pill"); await p.waitForTimeout(400); } },
  { name: "18-signin", hash: "/", hosted: true, me: 401 },
  { name: "19-create-team", hash: "/", hosted: true, me: { ...me, team: null, teams: [] } },
];
const narrow = new Set(["01-runs", "02-runs-hosted", "04-run-waiting", "08-machines", "09-editor", "17-team", "18-signin"]);

const b = await chromium.launch({ channel: "chrome", headless: true, args: ["--disable-gpu"] });
let problems = 0;
for (const s of scenes) {
  if (only && !new RegExp(only).test(s.name)) continue;
  if (width < 600 && !narrow.has(s.name)) continue;
  const ctx = await b.newContext({ viewport: { width, height }, deviceScaleFactor: 1, colorScheme: theme === "none" ? "dark" : theme });
  if (theme !== "none") await ctx.addInitScript((t) => { try { localStorage.setItem("theme", t); } catch {} }, theme);
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(`pageerror: ${e.message}`));
  p.on("console", (m) => { if (m.type() === "error") errs.push(`console: ${m.text()}`); });
  if (s.hosted) await hostedRoutes(p, { me: s.me ?? me });
  if (s.author) await authorRoutes(p);
  await p.goto(`${base}/#${s.hash}`, { waitUntil: "networkidle" }).catch(() => {});
  await p.waitForTimeout(1000);
  if (s.act) await s.act(p).catch((e) => errs.push(`act: ${e.message.split("\n")[0]}`));
  await p.screenshot({ path: `${out}${s.name}${suffix}.png`, fullPage: s.full !== false });
  // 401s are the sign-in gate working, not errors
  const real = errs.filter((e) => !(s.me === 401 && /401/.test(e)));
  problems += real.length;
  console.log(`${s.name}${suffix}${real.length ? `  !! ${real.join(" | ")}` : ""}`);
  await ctx.close();
}
await b.close();
console.log(problems ? `${problems} console problem(s)` : "console clean");
