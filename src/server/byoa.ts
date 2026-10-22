// Machine on the BYOA wire (@plannotator/byoa-server, from plannotator/byoa): pairing, sessions, the connector's long poll and the
// UI feed are the SDK's. This file adds what Machine needs around it: a durable sqlite store for pairings and
// connections (a restart must not disconnect anyone; live sessions stay in memory and the connector registers
// again), the person each request acts as (local: everyone is "local"; hosted: the team the signed-in member is
// on, so the whole team sees its agents, as with Machine keys), and the one-command local pairing (autoApprove).
import { createByoa, memoryStore, type Byoa, type ByoaStore, type ByoaUser, type ConnectionRecord, type PairingRecord } from "@plannotator/byoa-server";
import type { Database } from "bun:sqlite";

export const LOCAL: ByoaUser = { userId: "local", displayName: "you" };

export function initByoa(o: { origin: string; db: Database; local: boolean; authenticate: (req: Request) => Promise<ByoaUser | null> }): Byoa {
  return createByoa({
    app: { id: "machine", name: "Machine", origin: o.origin },
    authenticate: o.authenticate,
    store: sqliteByoaStore(o.db),
    mcpPath: "/mcp/author",                 // the authoring tools only; the run tools stay on /mcp with Machine keys
    settings: ["model", "effort"],
    ...(o.local ? { autoApprove: () => LOCAL } : {}),
  });
}

/** Pairings and connections in Machine's own database; hubs (live sessions, held polls, queues) from the SDK's memory store. */
export function sqliteByoaStore(db: Database): ByoaStore {
  db.exec(`CREATE TABLE IF NOT EXISTS byoa_pairings (id TEXT PRIMARY KEY, user_code_hash TEXT NOT NULL, device_code_hash TEXT NOT NULL, status TEXT NOT NULL, expires_at INTEGER NOT NULL, json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS byoa_connections (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token_hash TEXT NOT NULL, revoked_at INTEGER, json TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS byoa_connections_user ON byoa_connections (user_id);
    CREATE INDEX IF NOT EXISTS byoa_connections_token ON byoa_connections (token_hash);`);
  const live = memoryStore();
  const pairing = (id: string): PairingRecord | null => { const r = db.query<{ json: string }, [string]>("SELECT json FROM byoa_pairings WHERE id = ?").get(id); return r ? JSON.parse(r.json) : null; };
  const savePairing = (p: PairingRecord) => db.query("INSERT OR REPLACE INTO byoa_pairings (id, user_code_hash, device_code_hash, status, expires_at, json) VALUES (?, ?, ?, ?, ?, ?)")
    .run(p.id, p.user_code_hash, p.device_code_hash, p.status, p.expires_at, JSON.stringify(p));
  const connection = (sql: string, arg: string): ConnectionRecord | null => { const r = db.query<{ json: string }, [string]>(sql).get(arg); return r ? JSON.parse(r.json) : null; };
  const saveConnection = (c: ConnectionRecord) => db.query("INSERT OR REPLACE INTO byoa_connections (id, user_id, token_hash, revoked_at, json) VALUES (?, ?, ?, ?, ?)")
    .run(c.id, c.user_id, c.token_hash, c.revoked_at, JSON.stringify(c));
  return {
    pairings: {
      insert(p) {
        db.query("DELETE FROM byoa_pairings WHERE expires_at <= ?").run(p.created_at);
        if (db.query("SELECT 1 FROM byoa_pairings WHERE user_code_hash = ?").get(p.user_code_hash)) return false;
        savePairing(p); return true;
      },
      findByUserCode(hash, now) {
        const r = db.query<{ json: string }, [string, number]>("SELECT json FROM byoa_pairings WHERE user_code_hash = ? AND status = 'pending' AND expires_at > ?").get(hash, now);
        return r ? JSON.parse(r.json) : null;
      },
      findByDeviceCode(hash) {
        const r = db.query<{ json: string }, [string]>("SELECT json FROM byoa_pairings WHERE device_code_hash = ?").get(hash);
        return r ? JSON.parse(r.json) : null;
      },
      notePoll(id, now) { const p = pairing(id); if (!p) return null; const previous = p.last_poll_at; p.last_poll_at = now; savePairing(p); return previous; },
      decide(id, decision, approver, now) {
        const p = pairing(id); if (!p || p.status !== "pending" || p.expires_at <= now) return false;
        p.status = decision; p.approved_by = approver; savePairing(p); return true;
      },
      collect(id, c, now) {
        return db.transaction(() => {
          const p = pairing(id); if (!p || p.status !== "approved" || p.expires_at <= now) return false;
          p.status = "collected"; savePairing(p); saveConnection(c); return true;
        })();
      },
    },
    connections: {
      byTokenHash: (hash) => connection("SELECT json FROM byoa_connections WHERE token_hash = ?", hash),
      get: (id) => connection("SELECT json FROM byoa_connections WHERE id = ?", id),
      listByUser: (userId) => db.query<{ json: string }, [string]>("SELECT json FROM byoa_connections WHERE user_id = ? ORDER BY rowid").all(userId).map((r) => JSON.parse(r.json)),
      revoke(id, now) { const c = connection("SELECT json FROM byoa_connections WHERE id = ?", id); if (!c) return null; c.revoked_at ??= now; saveConnection(c); return c; },
      touch(id, now) { const c = connection("SELECT json FROM byoa_connections WHERE id = ?", id); if (c) { c.last_seen_at = now; saveConnection(c); } },
    },
    hub: live.hub,
  };
}
