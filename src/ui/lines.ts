// The editor edits structured parts as lines of text, one item per line, parts separated by " · ".
// This keeps the editor a text surface and the definition the source of truth.
import type { CredentialSlot, Field, Requirement, Transition } from "../engine/engine.ts";

const SEP = " · ";
const split = (line: string) => line.split(/\s*·\s*/).map((s) => s.trim());
const TYPES = new Set(["string", "number", "boolean", "array", "object"]);

// fields:  name · type · required · description        (required is literally "required" or omitted; enum as "string(a|b)")
export function formatFields(f: Record<string, Field> | undefined) {
  return Object.entries(f ?? {}).map(([k, v]) =>
    [k, v.enum ? `${v.type}(${v.enum.join("|")})` : v.type, v.required ? "required" : null, v.description ?? null].filter((x) => x !== null).join(SEP)).join("\n");
}
export function parseFields(text: string): { value: Record<string, Field>; errors: string[] } {
  const value: Record<string, Field> = {}; const errors: string[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim(); if (!line) continue;
    const [name, typeSpec = "string", ...rest] = split(line);
    if (!/^[a-z0-9_]+$/.test(name)) { errors.push(`field "${name}": use snake_case`); continue; }
    const m = /^(\w+)(?:\((.*)\))?$/.exec(typeSpec);
    const type = m?.[1] ?? typeSpec;
    if (!TYPES.has(type)) { errors.push(`field "${name}": unknown type "${typeSpec}"`); continue; }
    const f: Field = { type: type as Field["type"] };
    if (m?.[2]) f.enum = m[2].split("|").map((s) => s.trim()).filter(Boolean);
    const parts = [...rest];
    if (parts[0] === "required") { f.required = true; parts.shift(); }
    if (parts.length) f.description = parts.join(SEP);
    value[name] = f;
  }
  return { value, errors };
}

// requirements:  id · description · check
export function formatRequirements(r: Requirement[] | undefined) {
  return (r ?? []).map((x) => [x.id, x.description, x.check, x.required === false ? "optional" : null].filter((v) => v !== null).join(SEP)).join("\n");
}
export function parseRequirements(text: string): { value: Requirement[]; errors: string[] } {
  const value: Requirement[] = []; const errors: string[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim(); if (!line) continue;
    const [id, description, check, flag] = split(line);
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id ?? "")) { errors.push(`requirement "${id}": use kebab-case`); continue; }
    if (!description || !check) { errors.push(`requirement "${id}": needs id · description · check`); continue; }
    value.push({ id, description, check, ...(flag === "optional" ? { required: false } : {}) });
  }
  return { value, errors };
}

// credentials (slots):  id · provider · why the agent needs it        append "(handoff)" to the provider to allow the raw value to reach the agent
export function formatCredentials(c: CredentialSlot[] | undefined) {
  return (c ?? []).map((s) => [s.id, `${s.provider}${s.handoff ? " (handoff)" : ""}`, s.why ?? null].filter((v) => v !== null).join(SEP)).join("\n");
}
export function parseCredentials(text: string, prev: CredentialSlot[] = []): { value: CredentialSlot[]; errors: string[] } {
  const value: CredentialSlot[] = []; const errors: string[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim(); if (!line) continue;
    const [id, prov, ...rest] = split(line);
    if (!/^[a-z0-9_]+$/.test(id ?? "")) { errors.push(`credential "${id}": use snake_case`); continue; }
    const m = /^([a-z0-9-]+)\s*(\(handoff\))?$/.exec(prov ?? "");
    if (!m) { errors.push(`credential "${id}": needs id · provider · why`); continue; }
    const old = prev.find((s) => s.id === id);
    value.push({ ...(old?.scopes ? { scopes: old.scopes } : {}), ...(old?.base_url ? { base_url: old.base_url } : {}), id, provider: m[1], ...(m[2] ? { handoff: true } : {}), ...(rest.length ? { why: rest.join(SEP) } : {}) });
  }
  return { value, errors };
}

// events:  event → target · description        append "(human)" to the event for human-only
export function formatEvents(on: Record<string, Transition> | undefined) {
  return Object.entries(on ?? {}).map(([ev, t]) => [`${ev}${t.actor === "human" ? " (human)" : ""} → ${t.to}`, t.description ?? null].filter((v) => v !== null).join(SEP)).join("\n");
}
export function parseEvents(text: string): { value: Record<string, Transition>; errors: string[] } {
  const value: Record<string, Transition> = {}; const errors: string[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim(); if (!line) continue;
    const [head, ...rest] = split(line);
    const m = /^([a-z0-9_]+)\s*(\(human\))?\s*(?:→|->)\s*([a-z0-9_]+)$/.exec(head);
    if (!m) { errors.push(`event line "${head}": write "event → target"`); continue; }
    const t: Transition = { to: m[3] };
    if (m[2]) t.actor = "human";
    if (rest.length) t.description = rest.join(SEP);
    value[m[1]] = t;
  }
  return { value, errors };
}
