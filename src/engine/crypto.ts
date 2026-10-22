// Encryption at rest for stored credentials: AES-256-GCM over the whole secret JSON, parts base64.
// Key: MACHINE_SECRET_KEY (base64 of 32 bytes, `openssl rand -base64 32`), from the host's secret store in production.
// Development fallback when unset: a generated 0600 key file at <machine home>/secret.key.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Same resolution as the server: MACHINE_HOME, else ~/.machine. Kept here so the store never has to import the server.
export const home = process.env.MACHINE_HOME ?? join(process.env.HOME!, ".machine");
export const keyFile = join(home, "secret.key");
/** Stored beside every ciphertext; the hook for a later re-encrypt script. */
export const KEY_ID = "k1";

export interface Sealed { ct: string; iv: string; tag: string; key_id: string }

let cached: Buffer | undefined;
function key(): Buffer {
  if (cached) return cached;
  const env = process.env.MACHINE_SECRET_KEY;
  if (env) {
    const k = Buffer.from(env.trim(), "base64");
    if (k.length !== 32) throw new Error("MACHINE_SECRET_KEY must be base64 of 32 bytes (openssl rand -base64 32)");
    return (cached = k);
  }
  if (existsSync(keyFile)) {
    const k = Buffer.from(readFileSync(keyFile, "utf8").trim(), "base64");
    if (k.length !== 32) throw new Error(`${keyFile} is not base64 of 32 bytes; delete it to generate a new one (stored credentials become unreadable)`);
    return (cached = k);
  }
  mkdirSync(home, { recursive: true });
  const k = randomBytes(32);
  writeFileSync(keyFile, k.toString("base64") + "\n", { mode: 0o600 });
  return (cached = k);
}

export function encrypt(json: string): Sealed {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([c.update(json, "utf8"), c.final()]);
  return { ct: ct.toString("base64"), iv: iv.toString("base64"), tag: c.getAuthTag().toString("base64"), key_id: KEY_ID };
}

export function decrypt(s: Sealed): string {
  if (s.key_id !== KEY_ID) throw new Error(`credential was encrypted with key "${s.key_id}", this server has "${KEY_ID}"`);
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(s.iv, "base64"), { authTagLength: 16 });
  d.setAuthTag(Buffer.from(s.tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(s.ct, "base64")), d.final()]).toString("utf8");
}

/** sha256 of the key, hex. The store keeps it in `meta` and refuses to start if it changes. */
export const keyFingerprint = () => createHash("sha256").update(key()).digest("hex");
