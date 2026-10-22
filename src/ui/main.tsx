import { createRoot } from "react-dom/client";
import { useEffect, useRef, useState } from "react";
import { Runs } from "./runs.tsx";
import { RunView } from "./run.tsx";
import { Machines } from "./machines.tsx";
import { Editor } from "./editor.tsx";
import { Describe } from "./describe.tsx";
import { Credentials } from "./credentials.tsx";
import { TeamPage } from "./team.tsx";
import { CreateTeam, Invited, SignIn, SignOut } from "./signin.tsx";
import { teams, useConnected, useMe, useRuns, type Me } from "./api.ts";
import { Block, needsYouPhrase } from "./glyph.tsx";

// #/machines/new is describing a new machine (or, with ?revise=<id>, a change); #/machines/new/draw is the blank editor.
// Hosted mode has no describe-it (it spawns local agents), so #/machines/new is the blank editor there.
type Route = { screen: "runs" } | { screen: "run"; id: string } | { screen: "machines" } | { screen: "editor"; id: string } | { screen: "describe"; query: URLSearchParams }
  | { screen: "credentials" } | { screen: "team" } | { screen: "newteam"; query: URLSearchParams };
function route(hosted: boolean): Route {
  const [path, q] = location.hash.replace(/^#\/?/, "").split("?");
  const [a, b, c] = path.split("/");
  if (a === "machines" && b === "new" && (c === "draw" || hosted)) return { screen: "editor", id: "new" };
  if (a === "machines" && b === "new") return { screen: "describe", query: new URLSearchParams(q ?? "") };
  if (a === "runs" && b) return { screen: "run", id: b };
  if (a === "machines" && b) return { screen: "editor", id: b };
  if (a === "machines") return { screen: "machines" };
  if (a === "credentials") return { screen: "credentials" };
  if (a === "teams" && b === "new") return { screen: "newteam", query: new URLSearchParams(q ?? "") };
  if (a === "team") return { screen: "team" };
  return { screen: "runs" };
}

// Where the editor's back link goes: the run you came from, or the machine list.
let from: { label: string; href: string } | null = null;
let current = location.hash;
window.addEventListener("hashchange", () => {
  const prev = current; current = location.hash;
  if (/^#\/machines\/./.test(current)) { if (/^#\/runs\/./.test(prev)) from = { label: "Back to the run", href: prev }; else if (!/^#\/machines\/./.test(prev)) from = null; }
});

// The theme switch on the bar: System follows the OS, Light and Dark pin it. The stored "theme" key is what the init
// script in index.html reads, so the choice holds across loads and tabs; window.__theme is that script's apply function.
const THEMES = [["system", "System"], ["light", "Light"], ["dark", "Dark"]] as const;
function ThemeSwitch() {
  const [t, setT] = useState(() => { const s = localStorage.getItem("theme"); return s === "light" || s === "dark" ? s : "system"; });
  const pick = (v: string) => { if (v === "system") localStorage.removeItem("theme"); else localStorage.setItem("theme", v); (window as unknown as { __theme?: () => void }).__theme?.(); setT(v); };
  return (
    <div className="seg" role="radiogroup" aria-label="Theme">
      {THEMES.map(([v, l]) => <button type="button" role="radio" aria-checked={t === v} key={v} className={t === v ? "on" : ""} onClick={() => pick(v)}>{l}</button>)}
    </div>
  );
}

// The team pill beside the brand: the switcher and the account in one menu. Hosted only.
function TeamMenu({ me }: { me: Me }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("pointerdown", off); window.addEventListener("keydown", key);
    return () => { window.removeEventListener("pointerdown", off); window.removeEventListener("keydown", key); };
  }, [open]);
  const go = (h: string) => { setOpen(false); location.hash = h; };
  const pick = async (id: string) => { setOpen(false); if (id === me.team?.id) return; await teams.switch(id).catch(() => {}); location.hash = "/"; location.reload(); };
  return (
    <div className="team-wrap" ref={wrap}>
      <button type="button" className="pill sm quiet team-pill" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        {me.team?.name ?? "No team"}<svg className="chev" width="12" height="12" viewBox="0 0 14 14" aria-hidden="true"><path d="M3.5 5.5 7 9l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open ? (
        <div className="menu" role="menu">
          {me.teams.map((t) => <button type="button" role="menuitemradio" aria-checked={t.id === me.team?.id} key={t.id} className={t.id === me.team?.id ? "on" : ""} onClick={() => pick(t.id)}>{t.name}{t.id === me.team?.id ? <Block size={9} /> : null}</button>)}
          {me.teams.length ? <hr /> : null}
          {me.team ? <button type="button" role="menuitem" onClick={() => go("/team")}>Team</button> : null}
          <button type="button" role="menuitem" onClick={() => go("/teams/new")}>New team</button>
          <hr />
          <span>{me.user!.email}</span>
          <SignOut className="item" />
        </div>
      ) : null}
    </div>
  );
}

function App() {
  const { me, loaded, signedOut, hosted } = useMe();
  const [r, setR] = useState<Route>(() => route(false));
  const runs = useRuns();
  const online = useConnected();
  const blocked = runs.filter((x) => x.status === "blocked").length, waiting = runs.filter((x) => x.status === "waiting").length;
  useEffect(() => { const on = () => { setR(route(hosted)); window.scrollTo(0, 0); }; on(); window.addEventListener("hashchange", on); return () => window.removeEventListener("hashchange", on); }, [hosted]);
  // The bar gets its hairline only once something scrolls under it.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => { const on = () => setScrolled(scrollY > 4); on(); window.addEventListener("scroll", on, { passive: true }); return () => window.removeEventListener("scroll", on); }, []);
  const go = (h: string) => { location.hash = h; };
  if (!loaded) return <div className="loading" />;
  // Signed out (hosted): the gate. No team yet: create one. Both on the sign-in surface, with the brand alone in the bar.
  const gate = signedOut ? <SignIn /> : hosted && (!me?.team || r.screen === "newteam")
    ? (r.screen === "newteam" && r.query.get("invited") && me?.teams.length ? <Invited me={me!} team={r.query.get("invited")!} by={r.query.get("by")} /> : <CreateTeam />)
    : null;
  if (gate) return (
    <>
      <nav className="bar" aria-label="Main"><a className="brand" href="#/"><img className="badge" src="/brand/gt-badge.svg" alt="machine" height={22} /></a><div /><div className="bar-r"><ThemeSwitch /></div></nav>
      <main className="screen s-signin">{gate}</main>
    </>
  );
  const onRuns = r.screen === "runs" || r.screen === "run";
  const onCreds = r.screen === "credentials";
  const onMachines = !onRuns && !onCreds && r.screen !== "team";
  return (
    <>
      <nav className={`bar${scrolled ? " scrolled" : ""}`} aria-label="Main">
        <div className="bar-l">
          <a className="brand" href="#/"><img className="badge" src="/brand/gt-badge.svg" alt="machine" height={22} /></a>
          {hosted && me ? <TeamMenu me={me} /> : null}
        </div>
        <div className="switch">
          <a href="#/" className={onRuns ? "on" : ""} aria-current={onRuns ? "page" : undefined}>Runs
            {blocked ? <span className="need"><Block tone="blocked" size={9} />{blocked}</span> : null}
            {waiting ? <span className="need"><Block tone="waiting" size={9} />{waiting}</span> : null}
            {blocked + waiting ? <span className="vh">, {needsYouPhrase(blocked + waiting)}</span> : null}
          </a>
          <a href="#/machines" className={onMachines ? "on" : ""} aria-current={onMachines ? "page" : undefined}>Machines</a>
          <a href="#/credentials" className={onCreds ? "on" : ""} aria-current={onCreds ? "page" : undefined}>Credentials</a>
        </div>
        <div className="bar-r">{online ? null : <span className="offline" role="status"><Block hollow size={9} />Reconnecting to {location.host}…</span>}<ThemeSwitch /></div>
      </nav>
      <main className={`screen s-${r.screen === "describe" ? "editor" : r.screen}`} key={r.screen === "run" || r.screen === "editor" ? r.id : r.screen === "describe" ? `d${r.query.get("revise") ?? ""}` : r.screen}>
        {r.screen === "run" ? <RunView id={r.id} onBack={() => go("/")} />
          : r.screen === "machines" ? <Machines onOpen={(id) => go(`/machines/${id}`)} onNew={() => go("/machines/new")} />
          : r.screen === "editor" ? <Editor id={r.id} back={from ?? { label: "Machines", href: "#/machines" }} />
          : r.screen === "describe" ? <Describe query={r.query} />
          : r.screen === "credentials" ? <Credentials />
          : r.screen === "team" ? <TeamPage me={me!} />
          : <Runs onOpen={(id) => go(`/runs/${id}`)} />}
      </main>
    </>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
