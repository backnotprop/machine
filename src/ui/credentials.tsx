// Credentials: what agents may act with. One store per team; a machine declares slots; a stored credential is bound to
// a slot. This file holds the page (Needed, then Connected), the paste-a-token form, and the strip the machine page
// shows per slot. The form and the strip are shared so connecting from a run, a machine or the page is the same thing.
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError, credentials as store, firstName, latestOf, since, useMachines, useMe, useMembers, useRuns, type Credential, type Machine, type SlotStatus } from "./api.ts";
import { providers, type Provider } from "../engine/providers.ts";
import { Block } from "./glyph.tsx";
import { PageHead } from "./page.tsx";
import { Sep } from "./parts.tsx";

const catalog = providers as Record<string, Provider>;
export const providerName = (id: string) => catalog[id]?.name ?? id;
const staticProviders = Object.entries(catalog).filter(([, p]) => p.kind === "static");
const oauthProviders = Object.entries(catalog).filter(([, p]) => p.kind === "oauth");
/** Where an OAuth connect starts; the slot is carried so the callback binds it. */
export const oauthStart = (provider: string, target?: { machine: string; slot: string }) =>
  `/api/credentials/oauth/${provider}/start?return_to=${encodeURIComponent("/" + location.hash)}${target ? `&machine=${encodeURIComponent(target.machine)}&slot=${encodeURIComponent(target.slot)}` : ""}`;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const Chevron = () => <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M5.5 3.5 9 7l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const verifyText = (p?: Provider) => {
  const v = p?.verify;
  const how = v && "command" in v ? v.command.join(" ") : v ? `${v.method} ${v.path}` : null;
  return <>{how ? <>Checked with <code>{how}</code> before it is saved. </> : null}Stored encrypted; agents use it only inside a run of a machine that needs it, and every use is on that run's history.</>;
};

export type Target = { machine: string; slot: string };

/** Paste a token: provider from the catalog, a name the team sees, the provider's fields. Save verifies first; a 422 shows its reason here. */
export function PasteForm({ initial, target, compact, onSaved, onCancel }: { initial?: string; target?: Target; compact?: boolean; onSaved: (c: Credential) => void; onCancel: () => void }) {
  const [provider, setProvider] = useState(initial && catalog[initial]?.kind === "static" ? initial : staticProviders[0][0]);
  const [name, setName] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const first = useRef<HTMLInputElement>(null);
  const p = catalog[provider];
  const pf = p.fields ?? [];
  useEffect(() => { first.current?.focus(); }, []);
  const ready = name.trim() && pf.every((f) => f.optional || (fields[f.id] ?? "").trim());
  const save = async (e: FormEvent) => {
    e.preventDefault(); if (!ready || busy) return;
    setBusy(true); setErr("");
    try {
      const body: Record<string, string> = {}; for (const f of pf) if ((fields[f.id] ?? "").trim()) body[f.id] = fields[f.id].trim();
      const c = await store.create(provider, name.trim(), body);
      if (target) await store.bind(target.machine, target.slot, c.id).catch(() => {});
      onSaved(c);
    } catch (x) { setErr(x instanceof ApiError ? (x.detail ?? x.code) : String((x as Error).message)); setBusy(false); }
  };
  const field = (f: NonNullable<Provider["fields"]>[number], i: number) => (
    <label className="field" key={f.id}><span className="label">{f.label}{f.optional ? <span className="dim"> (optional)</span> : null}</span>
      <input type={f.secret ? "password" : "text"} value={fields[f.id] ?? ""} onChange={(e) => setFields((o) => ({ ...o, [f.id]: e.target.value }))} spellCheck={false} autoComplete="off" />
      {i === pf.length - 1 ? <span className="hint">{verifyText(p)}</span> : null}
    </label>
  );
  return (
    <form id="paste" className={`paste${compact ? " compact" : ""}`} onSubmit={save}>
      <div className="pair">
        <label className="field"><span className="label">Provider</span>
          <select value={provider} onChange={(e) => { setProvider(e.target.value); setFields({}); }}>{staticProviders.map(([id, x]) => <option key={id} value={id}>{x.name}</option>)}</select>
          <span className="hint">{staticProviders.map(([, x]) => x.name).slice(0, 3).join(", ")}, or any HTTP API.</span></label>
        <label className="field"><span className="label">Name</span><input ref={first} className="prose" value={name} onChange={(e) => setName(e.target.value)} placeholder={`${p.name} · ${target?.slot ?? "team"}`} /><span className="hint">How the team will see it.</span></label>
        {pf.length === 1 ? field(pf[0], 0) : null}
      </div>
      {pf.length > 1 ? <div className="fields">{pf.map(field)}</div> : null}
      <div className="form-foot">
        {err ? <span className="hint err"><Block tone="blocked" size={9} />{err}</span>
          : <span className="hint">{target ? <>Saved, it is bound to <code>{target.slot}</code> of this machine.</> : "Then bind it to a machine's slot from the machine page, or pick it when a run asks."}</span>}
        <div className="actions"><button type="button" className="pill quiet" onClick={onCancel}>Cancel</button><button className="pill primary" disabled={!ready || busy}>{busy ? "Checking…" : "Save"}</button></div>
      </div>
    </form>
  );
}

/** One line per slot a machine declares, with what the team bound to it. On the machine page. */
export function CredentialStrip({ machine, published }: { machine: Machine; published: boolean }) {
  const slots = machine.credentials ?? [];
  const [status, setStatus] = useState<SlotStatus[] | null>(null);
  const [creds, setCreds] = useState<Credential[]>([]);
  const [changing, setChanging] = useState<string | null>(null);
  const [form, setForm] = useState<string | null>(null);
  const load = useCallback(() => {
    if (!published) return;
    store.slots(machine.id).then(setStatus).catch(() => setStatus([]));
    store.list().then(setCreds).catch(() => setCreds([]));
  }, [machine.id, published]);
  useEffect(load, [load]);
  if (!slots.length) return null;
  if (!published) return <span className="hint">Publish the machine, then bind the team's credentials to these slots here.</span>;
  const byId = new Map((status ?? []).map((s) => [s.id, s]));
  return (
    <ul className="cred-strip">
      {slots.map((slot) => {
        const st = byId.get(slot.id);
        const p = catalog[slot.provider];
        const same = creds.filter((c) => c.provider === slot.provider && c.status !== "revoked");
        const pick = (id: string) => (id ? store.bind(machine.id, slot.id, id) : store.unbind(machine.id, slot.id)).then(() => { setChanging(null); load(); });
        return (
          <li key={slot.id} className={`cs-row${st && !st.ok ? " unbound" : ""}`}>
            <div className="cs-line">
              <code>{slot.id}</code><Sep />{providerName(slot.provider)}{slot.scopes?.length ? <><Sep /><span className="dim">{slot.scopes.join(", ")}</span></> : null}
              {!status ? null : st?.ok ? <><Sep /><span>Connected as <code>{st.account ?? st.name}</code></span>{changing === slot.id ? null : <button type="button" className="link" onClick={() => setChanging(slot.id)}>change</button>}</>
                : <><Sep /><span className="dim">{st?.reason === "not connected" || !st?.reason ? "nothing connected yet" : st.reason}</span>
                  {p?.kind === "oauth" ? <a className="pill sm" href={oauthStart(slot.provider, { machine: machine.id, slot: slot.id })}>Connect {p.name}</a>
                    : <button type="button" className="pill sm" onClick={() => setForm(form === slot.id ? null : slot.id)}>Connect {p?.name ?? slot.provider}</button>}
                  {same.length ? <button type="button" className="link" onClick={() => setChanging(slot.id)}>bind a stored one</button> : null}</>}
            </div>
            {slot.why ? <span className="hint">{slot.why}</span> : null}
            {changing === slot.id ? (
              <label className="field"><span className="label">Bound credential</span>
                <select defaultValue={st?.credential_id ?? ""} onChange={(e) => pick(e.target.value)}>
                  <option value="">Nothing</option>
                  {same.map((c) => <option key={c.id} value={c.id}>{c.name}{c.account ? ` · ${c.account}` : ""}</option>)}
                </select>
                <span className="hint">Stored {providerName(slot.provider)} credentials. Paste a new one on the Credentials page.</span>
              </label>
            ) : null}
            {form === slot.id ? <PasteForm compact initial={slot.provider} target={{ machine: machine.id, slot: slot.id }} onSaved={() => { setForm(null); load(); }} onCancel={() => setForm(null)} /> : null}
          </li>
        );
      })}
    </ul>
  );
}

// ---------- the page ----------

type Need = { m: Machine; s: SlotStatus; why?: string };
function Remove({ c, onDone }: { c: Credential; onDone: () => void }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 4000); return () => clearTimeout(t); }, [armed]);
  return armed
    ? <button type="button" className="pill sm danger" onClick={() => store.remove(c.id).then(onDone)}><Block tone="blocked" size={9} />Remove {c.name} for good</button>
    : <button type="button" className="link" onClick={() => setArmed(true)}>Remove</button>;
}

export function Credentials() {
  const { me, hosted } = useMe();
  const machines = latestOf(useMachines());
  const runs = useRuns();
  const members = useMembers();
  const [creds, setCreds] = useState<Credential[] | null>(null);
  const [slots, setSlots] = useState<Record<string, SlotStatus[]>>({});
  const [form, setForm] = useState<{ provider?: string; target?: Target } | null>(null);
  const [saved, setSaved] = useState<string>("");
  const load = useCallback(() => {
    store.list().then(setCreds).catch(() => setCreds([]));
    for (const m of machines) if (m.credentials?.length) store.slots(m.id).then((s) => setSlots((o) => ({ ...o, [m.id]: s }))).catch(() => {});
  }, [machines.map((m) => m.id).join(",")]);
  useEffect(load, [load]);
  const needed: Need[] = machines.flatMap((m) => (slots[m.id] ?? []).filter((s) => !s.ok).map((s) => ({ m, s, why: m.credentials?.find((x) => x.id === s.id)?.why })));
  const usedBy = (c: Credential) => machines.flatMap((m) => (slots[m.id] ?? []).filter((s) => s.ok && (s.credential_id ? s.credential_id === c.id : s.name === c.name)).map((s) => ({ m, s })));
  const liveIn = (m: Machine, slot: string) => Object.entries(m.states).filter(([, s]) => s.credentials?.includes(slot)).map(([id]) => id);
  const connect = (n: Need) => {
    const p = catalog[n.s.provider];
    if (p?.kind === "oauth") { location.href = oauthStart(n.s.provider, { machine: n.m.id, slot: n.s.id }); return; }
    setForm({ provider: n.s.provider, target: { machine: n.m.id, slot: n.s.id } });
    requestAnimationFrame(() => document.getElementById("paste")?.scrollIntoView({ block: "start", behavior: "smooth" }));
  };
  const blockedOn = (m: Machine) => runs.filter((r) => r.status === "blocked" && r.machine.id === m.id && r.error?.code === "credentials_missing").length;
  const list = (creds ?? []).filter((c) => c.status !== "revoked");
  const whose = hosted && me?.team ? `${me.team.name}'s behalf` : "your behalf";
  const sub = <>What agents may act with on {whose}<Sep />{list.length} connected{needed.length ? <><Sep />{needed.length} needed</> : null}</>;
  const onSaved = (c: Credential) => { setForm(null); setSaved(c.account ? `Saved ${c.name} as ${c.account}.` : `Saved ${c.name}.`); load(); };
  return (
    <div className="page">
      <PageHead title="Credentials" sub={sub} actions={<>
        {oauthProviders.map(([id, p]) => <a key={id} className="pill" href={oauthStart(id)}>Connect {p.name}</a>)}
        <button className="pill primary" onClick={() => { setForm(form ? null : {}); setSaved(""); }}>Paste a token</button>
      </>} />
      {form ? <PasteForm key={`${form.provider}-${form.target?.slot}`} initial={form.provider} target={form.target} onSaved={onSaved} onCancel={() => setForm(null)} /> : null}
      {saved ? <p className="status saved"><Block tone="check" size={9} />{saved}</p> : null}

      {needed.length ? (
        <section className="group">
          <h2 className="eyebrow label">Needed<span className="n">{needed.length}</span></h2>
          <div className="rows">
            {needed.map((n) => {
              const b = blockedOn(n.m);
              return (
                <a key={`${n.m.id}:${n.s.id}`} className="row needed" href="#/credentials" onClick={(e) => { e.preventDefault(); connect(n); }}>
                  <span className="r-glyph r-stat"><Block tone="waiting" size={12} /></span>
                  <span className="r-main">
                    <span className="r-title">{n.m.name} needs <code>{n.s.id}</code></span>
                    <span className="r-sub">{providerName(n.s.provider)}{n.why ? <><Sep />{n.why}</> : null}<Sep />{n.s.reason && n.s.reason !== "not connected" ? n.s.reason : "nothing connected yet"}</span>
                    {b ? <span className="r-ask">{b === 1 ? "One run is" : `${b} runs are`} blocked until it is.</span> : null}
                  </span>
                  <span className="r-side"><span className="pill sm primary">Connect {providerName(n.s.provider)}<Chevron /></span></span>
                </a>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="group">
        <h2 className="eyebrow label">Connected<span className="n">{list.length}</span></h2>
        {creds && !list.length ? (
          <div className="empty"><p className="e-t">Nothing connected yet</p><p>Paste a token for GitHub, npm, AWS or any HTTP API. A machine that declares a slot for it can then use it inside a run, and every use goes on that run's history.</p><button className="pill primary" onClick={() => setForm({})}>Paste a token</button></div>
        ) : (
          <div className="rows">
            {list.map((c) => {
              const uses = usedBy(c);
              const bad = c.status === "refresh_failed";
              return (
                <div key={c.id} className="row">
                  <span className="r-glyph r-stat"><Block tone={bad ? "waiting" : undefined} size={10} /></span>
                  <span className="r-main">
                    <span className="r-title">{c.name}</span>
                    <span className="r-sub">{c.kind === "oauth" ? "Connection" : "Token"}<Sep />{providerName(c.provider)}{c.account ? <> as <code>{c.account}</code></> : null}
                      {c.scopes?.length ? <><Sep />{c.scopes.join(", ")}</> : null}
                      <Sep />{c.kind === "oauth" ? `connected ${day(c.created_at)}` : <>pasted by {firstName(members, c.created_by) ?? "a member"}, {day(c.created_at)}</>}</span>
                    {uses.length ? (
                      <span className="r-sub used">Used by {uses.map(({ m, s }, i) => { const live = liveIn(m, s.id); return <span key={`${m.id}:${s.id}`} className="use">{i ? ", " : null}<a href={`#/machines/${m.id}`}>{m.name}</a> <code>{s.id}</code>{live.length ? <><Sep />live only in {live.map((x, j) => <span key={x}>{j ? ", " : null}<code>{x}</code></span>)}</> : null}</span>; })}</span>
                    ) : <span className="r-sub dim">No machine binds it yet.</span>}
                  </span>
                  <span className="r-side">
                    {bad ? <><span className="r-time">needs reconnecting</span><a className="pill sm" href={oauthStart(c.provider)}>Reconnect</a></>
                      : <><span className="r-time">{c.last_used_at ? `used ${since(c.last_used_at)}` : "never used"}</span><Remove c={c} onDone={load} /></>}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        {list.length ? <p className="quiet after-rows">Removing one leaves its slots empty; the next run that needs them blocks and says so. Runs that used it keep the record.</p> : null}
      </section>
    </div>
  );
}
