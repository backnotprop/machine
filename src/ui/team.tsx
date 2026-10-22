// The team: members and their roles, invitations, agent keys, the plan line. Rows, not tables; owners get quiet
// links on hover; every removal confirms in place. The one thing shown once is a new key, on its own raised surface.
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ApiError, handle, since, teams, type ApiKey, type Invite, type Me, type Member } from "./api.ts";
import { Block } from "./glyph.tsx";
import { PageHead } from "./page.tsx";
import { Sep } from "./parts.tsx";
import { slug } from "./signin.tsx";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const errText = (e: unknown) => e instanceof ApiError
  ? (e.code === "last_owner" ? "The team needs one owner. Make someone else an owner first." : e.code === "owner_only" ? "Only an owner can do that." : e.detail ?? e.code)
  : String((e as Error).message);

/** A quiet link that asks once more in place, then does the thing; it reverts after 4 s. */
function Armed({ label, confirm, onDo }: { label: string; confirm: ReactNode; onDo: () => Promise<void> }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 4000); return () => clearTimeout(t); }, [armed]);
  return armed
    ? <button type="button" className="pill sm danger" onClick={() => onDo().finally(() => setArmed(false))}><Block tone="blocked" size={9} />{confirm}</button>
    : <button type="button" className="link" onClick={() => setArmed(true)}>{label}</button>;
}
const Err = ({ text }: { text: string }) => text ? <span className="hint err row-err"><Block tone="blocked" size={9} />{text}</span> : null;

function MemberRow({ m, me, owner, lastOwner, onChange }: { m: Member; me: Me; owner: boolean; lastOwner: boolean; onChange: () => void }) {
  const you = m.user_id === me.user!.id;
  const [err, setErr] = useState("");
  const act = (fn: () => Promise<unknown>) => fn().then(onChange).catch((e) => setErr(errText(e)));
  const first = m.name?.split(/\s+/)[0] ?? m.email;
  return (
    <div className="row plain">
      <span className="r-main">
        <span className="r-title">{m.name ?? m.email}{you ? <span className="dim you"> · you</span> : null}</span>
        <span className="r-sub">{m.email}</span>
        <Err text={err} />
      </span>
      <span className="r-side">
        <span className="r-role">{m.role === "owner" ? "Owner" : "Member"}</span>
        {owner && !you ? (
          <span className="r-links">
            <button type="button" className="link" onClick={() => act(() => teams.setRole(me.team!.id, m.user_id, m.role === "owner" ? "member" : "owner"))}>{m.role === "owner" ? "Make member" : "Make owner"}</button>
            {lastOwner ? null : <Armed label="Remove" confirm={`Remove ${first} for good`} onDo={() => act(() => teams.removeMember(me.team!.id, m.user_id))} />}
          </span>
        ) : null}
      </span>
    </div>
  );
}

/** The key, shown once: the secret, the Claude Code line, the CLI line, Copy and Done. */
function Once({ k, onDone }: { k: ApiKey & { secret: string }; onDone: () => void }) {
  const mcp = `${location.origin}/mcp`;
  const [copied, setCopied] = useState(false);
  const copy = () => navigator.clipboard.writeText(k.secret).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  return (
    <div className="once">
      <span className="label">Your new key <code>{k.name}</code>, shown once</span>
      <div className="key">{k.secret}</div>
      <span className="label">Add it to Claude Code</span>
      <div className="cmd">claude mcp add --transport http machine {mcp} --header <b>"Authorization: Bearer {k.secret}"</b></div>
      <span className="label">And on that computer, once</span>
      <div className="cmd">machine login <b>{k.secret}</b></div>
      <div className="form-foot"><span className="hint">Shown once. Lose it, make another.</span><div className="actions"><button type="button" className="pill" onClick={copy}>{copied ? "Copied" : "Copy"}</button><button type="button" className="pill primary" onClick={onDone}>Done</button></div></div>
    </div>
  );
}

export function TeamPage({ me }: { me: Me }) {
  const team = me.team!;
  const owner = team.role === "owner";
  const [members, setMembers] = useState<Member[] | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [fresh, setFresh] = useState<(ApiKey & { secret: string }) | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [email, setEmail] = useState(""), [inviteErr, setInviteErr] = useState(""), [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null), [name, setName] = useState(team.name), [renameErr, setRenameErr] = useState("");
  const [keyErr, setKeyErr] = useState("");
  const loadMembers = () => teams.members(team.id).then(setMembers).catch(() => setMembers([]));
  const loadInvites = () => teams.invites(team.id).then(setInvites).catch(() => setInvites([]));
  const loadKeys = () => teams.keys(team.id).then(setKeys).catch(() => setKeys([]));
  useEffect(() => { loadMembers(); loadInvites(); loadKeys(); }, [team.id]);
  const owners = members?.filter((m) => m.role === "owner").length ?? 0;

  const invite = async (e: FormEvent) => {
    e.preventDefault(); if (!email.trim() || busy) return;
    setBusy(true); setInviteErr("");
    try { await teams.invite(team.id, email.trim()); setEmail(""); loadInvites(); } catch (x) { setInviteErr(errText(x)); } finally { setBusy(false); }
  };
  const makeKey = async (e: FormEvent) => {
    e.preventDefault(); const n = (newKey ?? "").trim(); if (!n || busy) return;
    setBusy(true); setKeyErr("");
    try { const k = await teams.makeKey(team.id, n); setFresh(k); setNewKey(null); loadKeys(); } catch (x) { setKeyErr(errText(x)); } finally { setBusy(false); }
  };
  const rename = async (e: FormEvent) => {
    e.preventDefault(); if (!name.trim()) return;
    try { await teams.rename(team.id, name.trim()); location.reload(); } catch (x) { setRenameErr(errText(x)); }
  };
  const n = (c: number, w: string) => `${c} ${w}${c === 1 ? "" : "s"}`;
  const sub = <><code>{slug(team.name)}</code><Sep />{members ? n(members.length, "member") : "…"}<Sep />{n(invites.length, "invitation")}<Sep />{n(keys.length, "agent key")}</>;
  const focusInvite = () => { const el = document.getElementById("invite-email"); el?.scrollIntoView({ block: "center", behavior: "smooth" }); el?.focus(); };
  return (
    <div className="page">
      <PageHead title={renaming === null ? team.name : <form className="inline-form rename" onSubmit={rename}><label className="field narrow"><span className="label">Team name</span><input className="prose" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></label><button className="pill primary">Save</button><button type="button" className="pill quiet" onClick={() => { setRenaming(null); setName(team.name); }}>Cancel</button><Err text={renameErr} /></form>}
        sub={sub}
        actions={owner ? <>{renaming === null ? <button className="pill quiet" onClick={() => setRenaming(team.name)}>Rename</button> : null}<button className="pill primary" onClick={focusInvite}>Invite</button></> : undefined} />

      <div className="sections">
        <section>
          <div className="sec-h"><h2 className="section-h">Members</h2><span className="quiet">Owners manage people and the team. Everyone does the work.</span></div>
          <div className="rows">
            {(members ?? []).map((m) => <MemberRow key={m.user_id} m={m} me={me} owner={owner} lastOwner={m.role === "owner" && owners <= 1} onChange={loadMembers} />)}
          </div>
        </section>

        <section>
          <div className="sec-h"><h2 className="section-h">Invitations</h2><span className="quiet">One email, one link. It ends on the sign-in page; the seat is ready when they arrive.</span></div>
          {owner ? (
            <form className="inline-form indent" onSubmit={invite}>
              <label className="field narrow"><span className="label">Email</span><input id="invite-email" className="prose" type="email" placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
              <button className="pill" disabled={!email.trim() || busy}>Invite</button>
              <Err text={inviteErr} />
            </form>
          ) : null}
          {invites.length ? (
            <div className="rows">
              {invites.map((i) => (
                <div className="row plain" key={i.id}>
                  <span className="r-main"><span className="r-title">{i.email}</span><span className="r-sub">sent {day(i.created_at)}<Sep />not accepted yet</span></span>
                  <span className="r-side">{owner ? <span className="r-links"><Armed label="Revoke" confirm="Revoke the invitation" onDo={() => teams.revokeInvite(team.id, i.id).then(loadInvites)} /></span> : null}</span>
                </div>
              ))}
            </div>
          ) : <p className="quiet indent">No one is waiting to join.</p>}
        </section>

        <section>
          <div className="sec-h"><h2 className="section-h">Agent keys</h2><span className="quiet">How an agent reaches the team.</span></div>
          <p className="ctx">An agent connects over MCP at <code>{location.origin}/mcp</code> with a key you make here. Runs it starts carry your name. The same key signs the <code>machine</code> CLI in, so <code>machine run</code> can lease the team's credentials to a command.</p>
          {fresh ? <Once k={fresh} onDone={() => setFresh(null)} /> : null}
          <div className="rows">
            {keys.map((k) => (
              <div className="row plain" key={k.id}>
                <span className="r-main"><span className="r-title">{k.name}</span><span className="r-sub"><code>{k.prefix}…</code><Sep />{handle(members ?? [], me.user!.id)}<Sep />made {day(k.created_at)}<Sep />{k.last_used_at ? `used ${since(k.last_used_at)}` : "never used"}</span></span>
                <span className="r-side"><Armed label="Revoke" confirm={`Revoke ${k.name} for good`} onDo={() => teams.revokeKey(team.id, k.id).then(loadKeys)} /></span>
              </div>
            ))}
            {newKey === null ? (
              <button type="button" className="row plain add-row" onClick={() => setNewKey("laptop")}><span className="r-main"><span className="r-title">+ New key</span></span></button>
            ) : (
              <form className="row plain" onSubmit={makeKey}>
                <span className="r-main"><div className="inline-form"><label className="field narrow"><span className="label">Name</span><input className="prose" value={newKey} onChange={(e) => setNewKey(e.target.value)} autoFocus placeholder="laptop" /></label><button className="pill primary" disabled={!newKey.trim() || busy}>Make key</button><button type="button" className="pill quiet" onClick={() => setNewKey(null)}>Cancel</button><Err text={keyErr} /></div><span className="hint">One per computer or job: <code>laptop</code>, <code>ci</code>.</span></span>
              </form>
            )}
          </div>
        </section>

        <section>
          <div className="sec-h"><h2 className="section-h">Plan</h2></div>
          <p className="quiet plan">Free while hosted machine is in preview. Nothing to pay yet.</p>
        </section>
      </div>
    </div>
  );
}
