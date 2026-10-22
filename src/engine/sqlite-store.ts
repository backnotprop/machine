// SQLite-backed store. Runs are a row plus an append-only events table; machines are versioned JSON.
// Every machine and run belongs to a team (team "local" in local mode); teams, members and API keys live here too.
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { MachineError, validateMachine, type Machine, type Run, type RunStore, type HistoryEntry } from "./engine.ts";
import { keyFingerprint, keyFile, type Sealed } from "./crypto.ts";

export type RunListener = (run: Run, appended: HistoryEntry[], team_id: string) => void;
export type Role = "owner" | "member";
export interface Team { id: string; name: string; created_at: string }
export interface Member { team_id: string; user_id: string; email: string; name: string | null; role: Role; created_at: string }
export interface ApiKey { id: string; team_id: string; user_id: string; name: string; prefix: string; created_at: string; last_used_at: string | null }
/** A stored credential without its secret columns: what every list and GET returns. */
export interface Credential {
  id: string; provider: string; kind: "static" | "oauth"; name: string; account: string | null; scopes: string[] | null;
  expires_at: string | null; status: "ok" | "refresh_failed" | "revoked"; last_used_at: string | null; created_by: string; created_at: string; updated_at: string;
}
/** The store's answer for one slot of one machine; the server adds connect_url. */
export interface SlotStatus { ok: boolean; credential_id?: string; name?: string; account?: string; reason?: string }
const CRED_COLS = "id, provider, kind, name, account, scopes, expires_at, status, last_used_at, created_by, created_at, updated_at";
const cred = (r: any): Credential => ({ ...r, scopes: r.scopes ? JSON.parse(r.scopes) : null });

const now = () => new Date().toISOString();

/** The RunStore for one team: the same queries with `team_id = ?`. The engine holds one of these and sees nothing else. */
export class TeamStore implements RunStore {
  constructor(public db: Database, public team_id: string, protected listeners: Set<RunListener>) {}

  machines(): Machine[] {
    return this.db.query<{ json: string }, [string]>("SELECT json FROM machines WHERE team_id = ? ORDER BY id, version").all(this.team_id).map((r) => JSON.parse(r.json));
  }
  machine(id: string, version?: number): Machine {
    const row = version
      ? this.db.query<{ json: string }, [string, string, number]>("SELECT json FROM machines WHERE team_id = ? AND id = ? AND version = ?").get(this.team_id, id, version)
      : this.db.query<{ json: string }, [string, string]>("SELECT json FROM machines WHERE team_id = ? AND id = ? ORDER BY version DESC LIMIT 1").get(this.team_id, id);
    if (!row) throw new MachineError("machine_not_found", `no machine "${id}"${version ? ` version ${version}` : ""}`);
    return JSON.parse(row.json);
  }
  saveMachine(m: Machine) {
    const errs = validateMachine(m);
    if (errs.length) throw new MachineError("invalid_machine", errs.join("; "), errs);
    this.db.query("INSERT OR REPLACE INTO machines (team_id, id, version, json, created_at) VALUES (?, ?, ?, ?, ?)").run(this.team_id, m.id, m.version, JSON.stringify(m), now());
  }

  run(id: string): Run {
    const row = this.db.query<{ json: string }, [string, string]>("SELECT json FROM runs WHERE team_id = ? AND id = ?").get(this.team_id, id);
    if (!row) throw new MachineError("run_not_found", `no run "${id}"`);
    const run = JSON.parse(row.json) as Run;
    run.history = this.events(id);
    return run;
  }
  events(run_id: string, after = 0): HistoryEntry[] {
    return this.db.query<{ json: string }, [string, number]>("SELECT json FROM events WHERE run_id = ? AND seq > ? ORDER BY seq").all(run_id, after).map((r) => JSON.parse(r.json));
  }
  saveRun(r: Run) {
    r.updated_at = now();
    const { history, ...rest } = r;
    const have = this.db.query<{ n: number }, [string]>("SELECT COUNT(*) AS n FROM events WHERE run_id = ?").get(r.id)!.n;
    const appended = history.slice(have);
    this.db.transaction(() => {
      this.db.query("INSERT OR REPLACE INTO runs (team_id, id, machine_id, version, status, state, json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(this.team_id, r.id, r.machine.id, r.machine.version, r.status, r.state, JSON.stringify(rest), r.created_at, r.updated_at);
      appended.forEach((e, i) => this.db.query("INSERT INTO events (run_id, seq, ts, type, json) VALUES (?, ?, ?, ?, ?)").run(r.id, have + i + 1, e.ts, e.type, JSON.stringify(e)));
    })();
    for (const fn of this.listeners) fn(r, appended, this.team_id);
  }
  runs(): Run[] {
    return this.db.query<{ id: string }, [string]>("SELECT id FROM runs WHERE team_id = ? ORDER BY updated_at DESC").all(this.team_id).map((r) => this.run(r.id));
  }
  /** Cheap listing for the UI: no history. */
  runSummaries() {
    return this.db.query<{ id: string; machine_id: string; version: number; status: string; state: string; json: string; created_at: string; updated_at: string }, [string]>(
      "SELECT id, machine_id, version, status, state, json, created_at, updated_at FROM runs WHERE team_id = ? ORDER BY updated_at DESC").all(this.team_id)
      .map((r) => ({ id: r.id, machine: { id: r.machine_id, version: r.version }, status: r.status, state: r.state, error: JSON.parse(r.json).error ?? null, agent: JSON.parse(r.json).agent, created_at: r.created_at, updated_at: r.updated_at }));
  }

  // ---------- credentials (secret columns leave this class only through sealedCredential) ----------
  credentials(): (Credential & { uses: { machine_id: string; slot: string }[] })[] {
    const uses = this.db.query<{ machine_id: string; slot: string; credential_id: string }, [string]>("SELECT machine_id, slot, credential_id FROM machine_credentials WHERE team_id = ? ORDER BY machine_id, slot").all(this.team_id);
    return this.db.query<any, [string]>(`SELECT ${CRED_COLS} FROM credentials WHERE team_id = ? ORDER BY created_at`).all(this.team_id)
      .map((r) => ({ ...cred(r), uses: uses.filter((u) => u.credential_id === r.id).map(({ machine_id, slot }) => ({ machine_id, slot })) }));
  }
  credential(id: string): Credential | undefined {
    const r = this.db.query<any, [string, string]>(`SELECT ${CRED_COLS} FROM credentials WHERE team_id = ? AND id = ?`).get(this.team_id, id);
    return r ? cred(r) : undefined;
  }
  createCredential(c: { id: string; provider: string; kind: Credential["kind"]; name: string; account?: string | null; scopes?: string[] | null; sealed: Sealed; expires_at?: string | null; created_by: string }): Credential {
    const t = now();
    this.db.query("INSERT INTO credentials (id, team_id, provider, kind, name, account, scopes, secret_ct, secret_iv, secret_tag, key_id, expires_at, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ok', ?, ?, ?)")
      .run(c.id, this.team_id, c.provider, c.kind, c.name, c.account ?? null, c.scopes ? JSON.stringify(c.scopes) : null, c.sealed.ct, c.sealed.iv, c.sealed.tag, c.sealed.key_id, c.expires_at ?? null, c.created_by, t, t);
    return this.credential(c.id)!;
  }
  /** Removing a credential unbinds every slot that pointed at it; the next preflight reports the slot. */
  deleteCredential(id: string) {
    this.db.transaction(() => {
      this.db.query("DELETE FROM machine_credentials WHERE team_id = ? AND credential_id = ?").run(this.team_id, id);
      this.db.query("DELETE FROM credentials WHERE team_id = ? AND id = ?").run(this.team_id, id);
    })();
  }
  /** The ciphertext parts for decrypt. Only the lease, proxy and handoff paths call this. */
  sealedCredential(id: string): (Credential & { sealed: Sealed }) | undefined {
    const r = this.db.query<any, [string, string]>(`SELECT ${CRED_COLS}, secret_ct, secret_iv, secret_tag, key_id FROM credentials WHERE team_id = ? AND id = ?`).get(this.team_id, id);
    if (!r) return undefined;
    const { secret_ct, secret_iv, secret_tag, key_id, ...rest } = r;
    return { ...cred(rest), sealed: { ct: secret_ct, iv: secret_iv, tag: secret_tag, key_id } };
  }
  touchCredential(id: string) { this.db.query("UPDATE credentials SET last_used_at = ? WHERE team_id = ? AND id = ?").run(now(), this.team_id, id); }

  bindings(machine_id: string): { slot: string; credential_id: string }[] {
    return this.db.query<{ slot: string; credential_id: string }, [string, string]>("SELECT slot, credential_id FROM machine_credentials WHERE team_id = ? AND machine_id = ? ORDER BY slot").all(this.team_id, machine_id);
  }
  bind(machine_id: string, slot: string, credential_id: string) {
    this.db.query("INSERT OR REPLACE INTO machine_credentials (team_id, machine_id, slot, credential_id) VALUES (?, ?, ?, ?)").run(this.team_id, machine_id, slot, credential_id);
  }
  unbind(machine_id: string, slot: string) { this.db.query("DELETE FROM machine_credentials WHERE team_id = ? AND machine_id = ? AND slot = ?").run(this.team_id, machine_id, slot); }
  /** Is this slot bound to a credential that works? ok:false for unbound, revoked or refresh_failed. */
  credentialStatus(machine_id: string, slot: string): SlotStatus {
    const b = this.bindings(machine_id).find((x) => x.slot === slot);
    const c = b && this.credential(b.credential_id);
    if (!c) return { ok: false, reason: "not connected" };
    if (c.status !== "ok") return { ok: false, credential_id: c.id, name: c.name, account: c.account ?? undefined, reason: c.status === "revoked" ? "revoked" : "refresh failed" };
    return { ok: true, credential_id: c.id, name: c.name, account: c.account ?? undefined };
  }
}

function open(path: string) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { create: true, strict: true });
  db.exec("PRAGMA journal_mode = WAL");
  // Schema version in PRAGMA user_version. 0 is the pre-team shape (or an empty file); 1 adds teams, members, api_keys and team_id;
  // 2 adds credentials, machine_credentials and meta (docs/hosted/02-credentials.md section 1).
  if (db.query<{ user_version: number }, []>("PRAGMA user_version").get()!.user_version < 1) {
    const old = db.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'machines'").get();
    db.transaction(() => {
      if (old) {
        // SQLite cannot alter a primary key, so machines is rebuilt; everything that exists lands in team "local".
        db.exec(`
          ALTER TABLE runs ADD COLUMN team_id TEXT NOT NULL DEFAULT 'local';
          CREATE TABLE machines_v1 (team_id TEXT NOT NULL DEFAULT 'local', id TEXT NOT NULL, version INTEGER NOT NULL, json TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (team_id, id, version));
          INSERT INTO machines_v1 (team_id, id, version, json, created_at) SELECT 'local', id, version, json, created_at FROM machines;
          DROP TABLE machines;
          ALTER TABLE machines_v1 RENAME TO machines;
        `);
      }
      db.exec(`
        CREATE TABLE IF NOT EXISTS machines (team_id TEXT NOT NULL DEFAULT 'local', id TEXT NOT NULL, version INTEGER NOT NULL, json TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (team_id, id, version));
        CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, machine_id TEXT NOT NULL, version INTEGER NOT NULL, status TEXT NOT NULL, state TEXT NOT NULL,
          json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, team_id TEXT NOT NULL DEFAULT 'local');
        CREATE TABLE IF NOT EXISTS events (run_id TEXT NOT NULL, seq INTEGER NOT NULL, ts TEXT NOT NULL, type TEXT NOT NULL, json TEXT NOT NULL, PRIMARY KEY (run_id, seq));
        CREATE INDEX IF NOT EXISTS runs_updated ON runs (updated_at DESC);
        CREATE INDEX IF NOT EXISTS runs_team ON runs (team_id, updated_at DESC);
        CREATE TABLE IF NOT EXISTS teams (id TEXT PRIMARY KEY, name TEXT NOT NULL, stripe_customer_id TEXT, created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS members (team_id TEXT NOT NULL REFERENCES teams(id), user_id TEXT NOT NULL, email TEXT NOT NULL, name TEXT,
          role TEXT NOT NULL CHECK (role IN ('owner','member')), created_at TEXT NOT NULL, PRIMARY KEY (team_id, user_id));
        CREATE TABLE IF NOT EXISTS api_keys (id TEXT PRIMARY KEY, team_id TEXT NOT NULL REFERENCES teams(id), user_id TEXT NOT NULL, name TEXT NOT NULL,
          prefix TEXT NOT NULL, hash TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, last_used_at TEXT);
        INSERT OR IGNORE INTO teams (id, name, created_at) VALUES ('local', 'Local', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
        PRAGMA user_version = 1;
      `);
    })();
  }
  if (db.query<{ user_version: number }, []>("PRAGMA user_version").get()!.user_version < 2) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS credentials (
        id          TEXT PRIMARY KEY,        -- cred_ + 8 random chars
        team_id     TEXT NOT NULL,
        provider    TEXT NOT NULL,           -- catalog key
        kind        TEXT NOT NULL,           -- static | oauth
        name        TEXT NOT NULL,
        account     TEXT,                    -- login / email / account id the provider reported; plaintext, for the UI
        scopes      TEXT,                    -- JSON array, oauth only
        secret_ct   TEXT NOT NULL,           -- base64 AES-256-GCM ciphertext of the secret JSON
        secret_iv   TEXT NOT NULL,           -- base64, 12 bytes
        secret_tag  TEXT NOT NULL,           -- base64, 16 bytes
        key_id      TEXT NOT NULL,           -- 'k1' in v1
        expires_at  TEXT,                    -- oauth access token expiry
        status      TEXT NOT NULL,           -- ok | refresh_failed | revoked
        last_used_at TEXT,
        created_by  TEXT NOT NULL,           -- member id
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS machine_credentials (     -- which stored credential fills which slot of which machine
        team_id TEXT NOT NULL, machine_id TEXT NOT NULL, slot TEXT NOT NULL, credential_id TEXT NOT NULL,
        PRIMARY KEY (team_id, machine_id, slot)
      );
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      PRAGMA user_version = 2;
    `);
  }
  return db;
}

/** The whole database. As a RunStore it is team "local" (what the CLI and the evals use); forTeam() scopes to any other team. */
export class SqliteStore extends TeamStore {
  constructor(public path: string) { super(open(path), "local", new Set()); }

  onChange(fn: RunListener) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  forTeam(team_id: string): TeamStore { return new TeamStore(this.db, team_id, this.listeners); }

  /** The server calls this at startup: the first run records sha256 of the secret key in `meta`; a different key later refuses to start,
   *  since every stored credential would be unreadable. */
  checkSecretKey() {
    const fp = keyFingerprint();
    const row = this.db.query<{ value: string }, [string]>("SELECT value FROM meta WHERE key = 'key_fingerprint'").get(fp);
    if (!row) { this.db.query("INSERT INTO meta (key, value) VALUES ('key_fingerprint', ?)").run(fp); return; }
    if (row.value !== fp) throw new Error(`MACHINE_SECRET_KEY is not the key this database was first used with (${this.path}); stored credentials cannot be decrypted with it. ` +
      `Restore the original MACHINE_SECRET_KEY${process.env.MACHINE_SECRET_KEY ? "" : ` (or the key file ${keyFile})`}, or delete the credentials and the \`meta\` row to start over.`);
  }

  // ---------- teams and members ----------
  team(id: string) { return this.db.query<Team, [string]>("SELECT id, name, created_at FROM teams WHERE id = ?").get(id) ?? undefined; }
  createTeam(id: string, name: string) { this.db.query("INSERT INTO teams (id, name, created_at) VALUES (?, ?, ?)").run(id, name, now()); }
  renameTeam(id: string, name: string) { this.db.query("UPDATE teams SET name = ? WHERE id = ?").run(name, id); }
  /** The teams a user belongs to, oldest first, with their role in each. */
  teamsFor(user_id: string): (Team & { role: Role })[] {
    return this.db.query<Team & { role: Role }, [string]>(
      "SELECT t.id, t.name, t.created_at, m.role FROM members m JOIN teams t ON t.id = m.team_id WHERE m.user_id = ? ORDER BY t.created_at").all(user_id);
  }
  member(team_id: string, user_id: string) { return this.db.query<Member, [string, string]>("SELECT * FROM members WHERE team_id = ? AND user_id = ?").get(team_id, user_id) ?? undefined; }
  members(team_id: string): Member[] { return this.db.query<Member, [string]>("SELECT * FROM members WHERE team_id = ? ORDER BY created_at").all(team_id); }
  addMember(m: Omit<Member, "created_at">) {
    this.db.query("INSERT OR IGNORE INTO members (team_id, user_id, email, name, role, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(m.team_id, m.user_id, m.email, m.name, m.role, now());
  }
  setRole(team_id: string, user_id: string, role: Role) { this.db.query("UPDATE members SET role = ? WHERE team_id = ? AND user_id = ?").run(role, team_id, user_id); }
  owners(team_id: string) { return this.db.query<{ n: number }, [string]>("SELECT COUNT(*) AS n FROM members WHERE team_id = ? AND role = 'owner'").get(team_id)!.n; }
  /** Removing a person also revokes their keys for that team. */
  removeMember(team_id: string, user_id: string) {
    this.db.transaction(() => {
      this.db.query("DELETE FROM api_keys WHERE team_id = ? AND user_id = ?").run(team_id, user_id);
      this.db.query("DELETE FROM members WHERE team_id = ? AND user_id = ?").run(team_id, user_id);
    })();
  }
  /** Once per sign-in: the user's active WorkOS memberships become their rows here. New teams/rows are inserted (as member),
   *  existing rows keep their role, and rows for organizations they are no longer in are removed. */
  syncMemberships(user: { id: string; email: string; name: string | null }, orgs: { id: string; name: string }[]) {
    this.db.transaction(() => {
      for (const o of orgs) {
        this.db.query("INSERT OR IGNORE INTO teams (id, name, created_at) VALUES (?, ?, ?)").run(o.id, o.name, now());
        this.addMember({ team_id: o.id, user_id: user.id, email: user.email, name: user.name, role: "member" });
      }
      this.db.query("UPDATE members SET email = ?, name = ? WHERE user_id = ?").run(user.email, user.name, user.id);
      const keep = orgs.map((o) => o.id);
      for (const t of this.teamsFor(user.id)) if (!keep.includes(t.id)) this.removeMember(t.id, user.id);
    })();
  }

  // ---------- API keys (bearer tokens for /mcp) ----------
  createApiKey(k: { id: string; team_id: string; user_id: string; name: string; prefix: string; hash: string }): ApiKey {
    const created_at = now();
    this.db.query("INSERT INTO api_keys (id, team_id, user_id, name, prefix, hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(k.id, k.team_id, k.user_id, k.name, k.prefix, k.hash, created_at);
    return { id: k.id, team_id: k.team_id, user_id: k.user_id, name: k.name, prefix: k.prefix, created_at, last_used_at: null };
  }
  apiKey(id: string) { return this.db.query<ApiKey, [string]>("SELECT id, team_id, user_id, name, prefix, created_at, last_used_at FROM api_keys WHERE id = ?").get(id) ?? undefined; }
  apiKeys(team_id: string, user_id?: string): ApiKey[] {
    return user_id
      ? this.db.query<ApiKey, [string, string]>("SELECT id, team_id, user_id, name, prefix, created_at, last_used_at FROM api_keys WHERE team_id = ? AND user_id = ? ORDER BY created_at").all(team_id, user_id)
      : this.db.query<ApiKey, [string]>("SELECT id, team_id, user_id, name, prefix, created_at, last_used_at FROM api_keys WHERE team_id = ? ORDER BY created_at").all(team_id);
  }
  apiKeyByHash(hash: string) { return this.db.query<{ id: string; team_id: string; user_id: string }, [string]>("SELECT id, team_id, user_id FROM api_keys WHERE hash = ?").get(hash) ?? undefined; }
  touchApiKey(id: string) { this.db.query("UPDATE api_keys SET last_used_at = ? WHERE id = ?").run(now(), id); }
  deleteApiKey(id: string) { this.db.query("DELETE FROM api_keys WHERE id = ?").run(id); }
}
