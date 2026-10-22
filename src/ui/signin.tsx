// Hosted mode's front door: the sign-in gate (any 401), then the first run on the same surface:
// Create a team (no seat yet) or the invited welcome (a seat is waiting; the person just arrived).
import { useState } from "react";
import { ApiError, teams, type Me } from "./api.ts";
import { Block, EmptyPath } from "./glyph.tsx";

/** The address a team will have: its name, slugged. */
export const slug = (name: string) => name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const loginHref = () => `/auth/login?return_to=${encodeURIComponent("/" + (location.hash || ""))}`;

export function SignIn() {
  return (
    <div className="page">
      <div className="signin">
        <img className="badge" src="/brand/gt-badge.svg" alt="machine" height={44} />
        <p>State machines for coding agents.</p>
        <EmptyPath n={4} />
        <a className="pill primary" href={loginHref()}>Sign in</a>
        <span className="hint">Opens WorkOS. If someone invited you, use the email the invitation came to.</span>
      </div>
    </div>
  );
}

export function SignOut({ className = "link", children = "Sign out" }: { className?: string; children?: string }) {
  return <form method="post" action="/auth/logout" className="signout"><button type="submit" className={className}>{children}</button></form>;
}

export function CreateTeam() {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const go = async (e: React.FormEvent) => {
    e.preventDefault(); if (!name.trim() || busy) return;
    setBusy(true); setErr("");
    try { await teams.create(name.trim()); location.hash = "/"; location.reload(); }
    catch (x) { setErr(x instanceof ApiError ? x.detail ?? x.code : String((x as Error).message)); setBusy(false); }
  };
  return (
    <div className="page">
      <form className="empty welcome" onSubmit={go}>
        <p className="e-t">Create a team</p>
        <p>Your machines, runs, agents and credentials live in a team. Invite people after.</p>
        <label className="field"><span className="label">Name</span><input className="prose" value={name} onChange={(e) => setName(e.target.value)} placeholder="Plannotator" autoFocus />
          <span className="hint">{name.trim() ? <>Its address will be <code>{location.host}/{slug(name)}</code></> : "The name the team sees in the bar."}</span></label>
        <div className="form-foot">
          <button className="pill primary" disabled={!name.trim() || busy}>Create team</button>
          {err ? <span className="hint err"><Block tone="blocked" size={9} />{err}</span> : null}
        </div>
      </form>
    </div>
  );
}

/** The person arrived through an invitation: the seat exists already, so this is one button into the team. */
export function Invited({ me, team, by }: { me: Me; team: string; by?: string | null }) {
  const t = me.teams.find((x) => x.name === team) ?? me.teams[0];
  const join = async () => { if (t) await teams.switch(t.id).catch(() => {}); location.hash = "/"; location.reload(); };
  return (
    <div className="page">
      <div className="empty welcome">
        <p className="e-t">{by ? `${by} invited you to ${team}` : `You are invited to ${team}`}</p>
        <p>You will see the team's runs and machines, answer runs that need someone, and connect your own agents.</p>
        <div className="form-foot" style={{ width: "100%" }}><button className="pill primary" onClick={join}>Join {team}</button><SignOut>Not you? Sign out</SignOut></div>
      </div>
    </div>
  );
}
