// The run page. The machine is the stage; the run's state is drawn on it (the HUD), and what it asks of you
// sits in the same frame, pointing at the step it stopped on. Under it, the story of the run, newest first.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from "react";
import { AgentMark } from "./agent-icons.tsx";
import { api, firstName, handle, hhmm, human, isLive, since, span, stepAge, useMe, useMembers, useRun, walk, when, type HistoryEntry, type Machine, type Member, type Run } from "./api.ts";
import { MachineGraph, type Tone } from "./graph.tsx";
import { Block, Progress, statusWord } from "./glyph.tsx";
import { PageHead } from "./page.tsx";
import { Clamp, Count, Facts as FactRows, KV, Quiet, Quote, Rich, Sep } from "./parts.tsx";
import { providerName } from "./credentials.tsx";
import { needText } from "./runs.tsx";

const Agent = ({ name, size = 15 }: { name: string; size?: number }) => <span className="agent-inline"><AgentMark name={name} size={size} />{name}</span>;
const payloadOf = (h?: HistoryEntry) => (h?.payload && typeof h.payload === "object" && Object.keys(h.payload).length ? h.payload as Record<string, unknown> : null);
const Chevron = () => <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M5.5 3.5 9 7l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
/** A need that carries a connect link ("Connect linear for X (why): https://…") becomes the sentence plus a Connect pill. */
function Need({ text, machine }: { text: string; machine: Machine }) {
  const url = /https?:\/\/\S+$/.exec(text)?.[0];
  const slot = /^Connect (\S+) for /.exec(text)?.[1];
  const provider = slot ? machine.credentials?.find((c) => c.id === slot)?.provider : undefined;
  if (!url) return <p><Rich text={text} /></p>;
  return <p className="need-link"><Rich text={needText(text)} /><a className="pill sm" href={url}>Connect {provider ? providerName(provider) : slot ?? ""}<Chevron /></a></p>;
}
/** "GitHub · michael": the provider, then the account the credential acts as (its name when there is none). */
const CredName = ({ c }: { c: NonNullable<HistoryEntry["credential"]> }) => <>{providerName(c.provider)}{c.account ? <><Sep />{c.account}</> : c.name ? <><Sep />{c.name}</> : null}</>;

function Cancel({ id }: { id: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 4000); return () => clearTimeout(t); }, [armed]);
  return armed
    ? <button className="pill danger" onClick={() => api.cancel(id)}><Block tone="blocked" size={9} />Cancel the run for good</button>
    : <button className="pill quiet" onClick={() => setArmed(true)}>Cancel run</button>;
}

// ---------- the ask: one surface for each kind of turn ----------

function useSend() {
  const [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const send = async (fn: () => Promise<unknown>) => {
    setBusy(true); setErr("");
    try { await fn(); } catch (e) { setErr(String((e as Error).message).replace(/^\{.*"message":"([^"]+)".*$/, "$1")); } finally { setBusy(false); }
  };
  return { busy, err, send };
}
const submitOnMeta = (go: () => void) => (e: ReactKeyboardEvent) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); go(); } };
const Hint = ({ err, children }: { err: string; children: ReactNode }) => <span className="hint">{err ? <span className="err"><Block tone="blocked" size={9} />{err}</span> : children}</span>;

function Blocked({ run, title, machine }: { run: Run; title: string; machine: Machine }) {
  const [note, setNote] = useState("");
  const { busy, err, send } = useSend();
  const needs = run.error?.needs ?? [];
  const go = () => { if (!busy) send(() => api.unblock(run.id, note.trim() || undefined)); };
  return (
    <div className="ask-grid">
      <div className="ask-main">
        <div className="kind">{needs.length ? `blocked · the agent needs ${needs.length === 1 ? "one answer" : `${needs.length} answers`}` : "blocked · the agent needs you"}</div>
        <h2>{title}</h2>
        {needs.length ? <ol className="needs">{needs.map((n, i) => <li key={i}><Count n={i + 1} /><Need text={n} machine={machine} /></li>)}</ol> : null}
        {run.error?.message ? <div className="why"><span className="label">Why <code>{run.error.code}</code></span><Clamp text={run.error.message} lines={needs.length ? 2 : 5} /></div> : null}
      </div>
      <form className="answer" onSubmit={(e) => { e.preventDefault(); go(); }}>
        <label className="label" htmlFor="reply">Your answer</label>
        <textarea id="reply" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={submitOnMeta(go)} rows={5}
          placeholder={needs.length > 1 ? needs.map((_, i) => `${i + 1}. `).join("\n") : "What you decided, or what you fixed."} />
        <div className="answer-foot">
          <Hint err={err}>The agent reads this first when it resumes.</Hint>
          <button className="pill primary" disabled={busy}>{note.trim() ? "Resume the run" : "Resume without a note"}</button>
        </div>
      </form>
    </div>
  );
}

function Waiting({ run, machine }: { run: Run; machine: Machine }) {
  const s = machine.states[run.state];
  const choices = Object.entries(s.on ?? {}).filter(([, t]) => t.actor === "human");
  const [pick, setPick] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const { busy, err, send } = useSend();
  const group = useRef<HTMLDivElement>(null);
  const last = [...run.history].reverse().find((h) => h.type === "transition");
  const report = payloadOf(last);
  const go = () => { if (pick && !busy) send(() => api.transition(run.id, pick, note.trim() || undefined)); };
  // A radio group: arrows move the choice, Tab leaves the group.
  const onArrow = (e: ReactKeyboardEvent) => {
    const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!d) return; e.preventDefault();
    const i = Math.max(0, choices.findIndex(([ev]) => ev === pick));
    const next = (pick === null ? 0 : (i + d + choices.length) % choices.length);
    setPick(choices[next][0]);
    group.current?.querySelectorAll<HTMLButtonElement>(".choice")[next]?.focus();
  };
  return (
    <div className="ask-grid">
      <div className="ask-main">
        <div className="kind">your decision · {choices.length} choice{choices.length === 1 ? "" : "s"}</div>
        <h2>{s.title}</h2>
        {last?.note ? <Clamp text={last.note} lines={3} /> : <p className="lede">The agent stopped here. It does nothing until you choose.</p>}
        {report ? <div className="handed"><span className="label">Report from <code>{last!.from}</code></span><KV obj={report} /></div> : null}
      </div>
      <form className="answer" onSubmit={(e) => { e.preventDefault(); go(); }}>
        <span className="label" id="choose">Choose what happens next</span>
        <div className="choices" role="radiogroup" aria-labelledby="choose" ref={group} onKeyDown={onArrow}>
          {choices.map(([ev, t], i) => (
            <button type="button" key={ev} role="radio" aria-checked={pick === ev} tabIndex={pick === ev || (pick === null && i === 0) ? 0 : -1} className={`choice${pick === ev ? " on" : ""}`} onClick={() => setPick(ev)}>
              <span className="tick" aria-hidden="true" />
              <span className="cn">{human(ev)}</span>
              <span className="ct">then <code>{t.to}</code>{machine.states[t.to] ? <><Sep />{machine.states[t.to].title}</> : null}</span>
              {t.description ? <span className="cd">{t.description}</span> : null}
            </button>
          ))}
        </div>
        <textarea id="reply" aria-label="A note for the agent" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={submitOnMeta(go)} rows={2} placeholder="A note for the agent (optional)" />
        <div className="answer-foot">
          <Hint err={err}>{pick ? "The agent gets your note with the decision." : "Nothing moves until you send."}</Hint>
          <button className="pill primary" disabled={!pick || busy}>{pick ? `Send “${human(pick)}”` : "Choose one"}</button>
        </div>
      </form>
    </div>
  );
}

function Working({ run, machine }: { run: Run; machine: Machine }) {
  const s = machine.states[run.state];
  const arrived = run.history.findLastIndex((h) => h.type === "begin" || h.type === "transition" || h.type === "unblock");
  const note = run.history.slice(arrived + 1).findLast((h) => h.type === "note");
  const next = Object.entries(s.on ?? {});
  return (
    <div className="ask-grid">
      <div className="ask-main">
        <div className="kind">running · the agent is working</div>
        <h2>{s.title}</h2>
        {s.instructions ? <Clamp text={s.instructions} lines={3} /> : null}
      </div>
      <div className="answer">
        <span className="label">Latest from the agent</span>
        {note ? <div className="latest">{note.progress !== undefined ? <div className="prog"><Progress value={note.progress} /><span>{note.progress}%</span></div> : null}<Clamp text={note.note ?? ""} lines={4} /><span className="hint">{since(note.ts)}</span></div>
          : <Quiet>Nothing yet in this step. Moves arrive here as the agent makes them.</Quiet>}
        {next.length ? <div className="next"><span className="label">It can leave by</span>{next.map(([ev, t]) => <span key={ev} className="ev"><code>{ev}</code><span className="arrow">→</span><code>{t.to}</code></span>)}</div> : null}
      </div>
    </div>
  );
}

function Finished({ run, machine }: { run: Run; machine: Machine }) {
  const s = machine.states[run.state];
  const last = [...run.history].reverse().find((h) => h.type === "transition");
  const report = payloadOf(last);
  const cancel = run.history.findLast((h) => h.type === "cancel");
  const midFail = run.status === "failed" && s.kind !== "final";
  const title = run.status === "cancelled" ? "Cancelled by you" : midFail ? `Failed at ${s.title}` : s.title;
  return (
    <div className="ask-grid">
      <div className="ask-main">
        <div className="kind">{run.status} · {since(run.updated_at)}</div>
        <h2>{title}</h2>
        {midFail && run.error ? <Clamp text={run.error.message} lines={3} /> : null}
        <p className="lede">
          {run.status === "cancelled" && cancel?.note ? <><Quote>{cancel.note}</Quote> </> : null}
          Took {span(run.created_at, run.updated_at)}, {walk(run.history).states.length} steps{run.agent?.name ? <>, by <Agent name={run.agent.name} /></> : null}.
          {midFail && run.error ? <> Failed at <code>{run.state}</code> with <code>{run.error.code}</code>.</> : null}
        </p>
      </div>
      <div className="answer">
        {report ? <><span className="label">Report from <code>{last!.from}</code></span><KV obj={report} /></> : <Quiet>No report at the end.</Quiet>}
        {last?.note ? <Clamp text={last.note} lines={3} /> : null}
      </div>
    </div>
  );
}

// ---------- the leader: the ask points at its node ----------
// It drops straight down from the node to a socket on the ask. If anything of the graph sits in the way, only the socket is drawn.

function Leader({ frame, ask, node, tone, on }: { frame: RefObject<HTMLElement | null>; ask: RefObject<HTMLElement | null>; node: string; tone: Tone; on: boolean }) {
  const [g, setG] = useState<{ x: number; y1: number; y2: number; line: boolean } | null>(null);
  useLayoutEffect(() => {
    const calc = () => {
      const f = frame.current, a = ask.current;
      const n = f?.querySelector(`.gview [data-node="${CSS.escape(node)}"] .nb`);
      if (!f || !a || !n) return setG(null);
      const fr = f.getBoundingClientRect(), nr = n.getBoundingClientRect(), ar = a.getBoundingClientRect();
      const gv = f.querySelector(".gview")!.getBoundingClientRect();
      const cx = nr.left + nr.width / 2;
      const x = Math.min(Math.max(cx, ar.left + 40, gv.left + 24), ar.right - 40, gv.right - 24) - fr.left;
      const y1 = nr.bottom - fr.top + 6, y2 = ar.top - fr.top;
      const blocked = [...f.querySelectorAll(".gview [data-node] .nb, .gview .e text")].some((el) => {
        if (el === n) return false; const r = el.getBoundingClientRect();
        return r.left - 4 < x + fr.left && x + fr.left < r.right + 4 && r.bottom > nr.bottom && r.top < ar.top;
      });
      setG({ x, y1, y2, line: !blocked && Math.abs(cx - fr.left - x) < 1 });
    };
    calc();
    const t = setTimeout(calc, 60);
    const ro = new ResizeObserver(calc); if (frame.current) ro.observe(frame.current);
    const gv = frame.current?.querySelector(".gview"); gv?.addEventListener("scroll", calc, { passive: true });
    return () => { clearTimeout(t); ro.disconnect(); gv?.removeEventListener("scroll", calc); };
  }, [node, tone]);
  if (!g) return null;
  return (
    <svg className={`leader${on ? "" : " off"}`} data-tone={tone} aria-hidden="true">
      {g.line && g.y2 - g.y1 > 14 ? <path className="ll" d={`M${g.x},${g.y1} V${g.y2 - 6}`} /> : null}
      <rect className="lt" x={g.x - 4} y={g.y2 - 4} width={8} height={8} rx={2.2} />
    </svg>
  );
}

// ---------- the story: steps newest first, each step's moves newest first ----------

interface Chapter { state: string; beats: { h: HistoryEntry; i: number }[]; start: string; end?: string; arrive?: string }
function chapters(run: Run): Chapter[] {
  const out: Chapter[] = [];
  run.history.forEach((h, i) => {
    if (h.type === "begin") { out.push({ state: h.to!, beats: [{ h, i }], start: h.ts }); return; }
    const cur = out[out.length - 1]; if (!cur) return;
    cur.beats.push({ h, i });
    if (h.type === "transition") { cur.end = h.ts; out.push({ state: h.to!, beats: [], start: h.ts, arrive: `${h.from}→${h.event}` }); }
  });
  return out.reverse().map((c) => ({ ...c, beats: [...c.beats].reverse() }));
}

function Beat({ h, agent, state, members, meId }: { h: HistoryEntry; agent?: string; state: string; members: Member[]; meId?: string }) {
  const human = h.actor === "human";
  // Another member's move is named ("Dana unblocked it"); yours still says "You".
  const them = human && !!h.by && !!meId && h.by !== meId ? firstName(members, h.by) : null;
  const who = them ?? "You";
  let head: ReactNode, body: ReactNode = null, cls = "";
  switch (h.type) {
    case "begin": head = <>Started the run</>; break;
    case "transition": {
      const p = payloadOf(h);
      head = <>{human ? `${who} chose` : "Moved on with"} <code>{h.event}</code> <span className="arrow">→</span> <code>{h.to}</code></>;
      body = <>{h.note ? (human ? <p><Quote>{h.note}</Quote></p> : <Clamp text={h.note} lines={3} />) : null}{p ? <KV obj={p} /> : null}</>;
      cls = "move"; break;
    }
    case "note": head = h.progress !== undefined ? <span className="prog"><Progress value={h.progress} /><span>{h.progress}%</span></span> : null; body = <Clamp text={h.note ?? ""} lines={3} />; cls = "note"; break;
    case "error": head = <><Block tone="blocked" size={9} />Blocked <code>{h.error?.code}</code></>; body = <>{h.error?.needs?.length ? <ol className="needs small">{h.error.needs.map((n, i) => <li key={i}><Count n={i + 1} /><p><Rich text={needText(n)} /></p></li>)}</ol> : null}<Clamp text={h.error?.message ?? ""} lines={2} /></>; cls = "stop"; break;
    case "rejected": head = <>Tried <code>{h.event}</code>, the machine refused <code>{h.error?.code}</code></>; body = <Quiet><Rich text={h.error?.message ?? ""} quotes /></Quiet>; cls = "refused"; break;
    case "unblock": head = <>{who} unblocked it</>; body = h.note ? <p><Quote>{h.note}</Quote></p> : <Quiet>No note.</Quiet>; break;
    case "cancel": head = <>{who} cancelled the run</>; body = h.note ? <p><Quote>{h.note}</Quote></p> : null; break;
    case "credential": {
      // One use of a stored credential: leased into a command, called from the server, or handed to the agent (red: the model saw it).
      const c = h.credential; const by = handle(members, h.by);
      if (!c) break;
      const slot = <>slot <code>{c.slot}</code></>;
      if (h.via === "handoff") { head = <><Block tone="blocked" size={9} />Handed the {c.name} to the agent</>; body = <p className="bq">{slot}<Sep />the model saw the value{by ? <><Sep />asked by {by}</> : null}</p>; cls = "cred handoff"; }
      else if (h.via === "proxy") { head = <>Called <CredName c={c} />{h.request ? <>: <code>{h.request}</code></> : null}</>; body = <p className="bq">Made from the server{by ? <><Sep />for {by}</> : null}<Sep />{slot}<Sep />the token never left it</p>; cls = "cred"; }
      else { head = <>Used <CredName c={c} />{h.command ? <> for <code>{h.command}</code></> : null}</>; body = <p className="bq">Leased to the command{by ? <> on {by}'s computer</> : null}<Sep />{slot}<Sep />the token stayed out of the model's context</p>; cls = "cred"; }
      break;
    }
  }
  return (
    <li className={`beat ${human ? (them ? "them" : "you") : "agent"} ${cls}`} tabIndex={0}
      {...(h.type === "transition" ? { "data-he": `${h.from}→${h.event}` } : { "data-hn": state })}>
      <div className="who"><span className="actor">{human ? who : h.actor === "system" ? "System" : <><AgentMark name={agent} size={14} />Agent</>}</span><time>{hhmm(h.ts)}</time></div>
      <div className="what">{head ? <div className="bh">{head}</div> : null}{body}</div>
    </li>
  );
}

// Pointing at the story points at the machine: a chapter lights its state and the move that opened it; a move lights its edge.
type Hl = { node?: string; edge?: string } | null;
const hlOf = (t: EventTarget | null): Hl => {
  const el = (t as Element | null)?.closest?.("[data-hn],[data-he]") as HTMLElement | null;
  return el ? { node: el.dataset.hn, edge: el.dataset.he } : null;
};
function Story({ run, machine, tone, onHl, marked, members, meId }: { run: Run; machine: Machine; tone: Tone; onHl: (h: Hl) => void; marked: string | null; members: Member[]; meId?: string }) {
  const cs = useMemo(() => chapters(run), [run.history.length]);
  const moves = run.history.filter((h) => h.type === "transition").length;
  const uses = run.history.filter((h) => h.type === "credential").length;
  const live = isLive(run.status);
  return (
    <section className="story" onPointerOver={(e) => onHl(hlOf(e.target))} onPointerLeave={() => onHl(null)}
      onFocus={(e) => onHl(hlOf(e.target))} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) onHl(null); }}>
      <div className="sec-h"><h3 className="section-h">History</h3><span className="quiet">newest first<Sep />{moves} move{moves === 1 ? "" : "s"}{uses ? <><Sep />{uses} credential use{uses === 1 ? "" : "s"}</> : null}</span></div>
      <ol className="chapters hist">
        {cs.map((c, ci) => {
          const st = machine.states[c.state];
          const now = ci === 0;
          return (
            <li key={cs.length - ci} className={`chapter${now ? " now" : ""}${marked === c.state ? " marked" : ""}`} data-hn={c.state} data-he={c.arrive}>
              <div className="ch-h" tabIndex={0}>
                <Block tone={now ? tone : undefined} size={now ? 12 : 10} />
                <span className="ch-t">{st?.title ?? c.state}</span><code>{c.state}</code>
                <span className="ch-m">{now ? (live ? `for ${span(c.start, new Date().toISOString())}` : `ended ${hhmm(run.updated_at)}`) : <>{hhmm(c.start)}<Sep />{span(c.start, c.end ?? c.start)}</>}</span>
              </div>
              {c.beats.length ? <ol className="beats">{c.beats.map(({ h, i }) => <Beat key={i} h={h} agent={run.agent?.name} state={c.state} members={members} meId={meId} />)}</ol> : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Facts({ run, machine, slot, docked, caption, by }: { run: Run; machine: Machine; slot: RefObject<HTMLDivElement | null>; docked: boolean; caption: ReactNode; by: string | null }) {
  // What this run used, by slot: "GitHub · michael · 1 use, 12:09".
  const used = new Map<string, { c: NonNullable<HistoryEntry["credential"]>; n: number; last: string }>();
  for (const h of run.history) if (h.type === "credential" && h.credential) { const u = used.get(h.credential.slot); if (u) { u.n++; u.last = h.ts; } else used.set(h.credential.slot, { c: h.credential, n: 1, last: h.ts }); }
  return (
    <aside className="facts">
      <div className={`dock-slot${docked ? " open" : ""}`} ref={slot} aria-hidden={!docked}><div className="dock-in"><div className="dock-box" />{caption}</div></div>
      {Object.keys(run.inputs).length ? <section><h3 className="section-h">Inputs</h3><KV obj={run.inputs} variant="stacked" /></section> : null}
      {run.preflight.length ? (
        <section><h3 className="section-h">Checks</h3>
          <ul className="checks">{run.preflight.map((p) => (
            <li key={p.id} className={p.ok ? "ok" : "bad"}><Block tone={p.ok ? "check" : "blocked"} size={9} /><div><code>{p.id}</code><span className="cw">{p.ok ? "passed" : "failed"}</span>{p.detail ? <Clamp text={p.detail} lines={2} /> : null}</div></li>
          ))}</ul>
        </section>
      ) : null}
      {used.size ? (
        <section><h3 className="section-h">Credentials</h3>
          <dl className="kv stacked">{[...used].map(([slot, u]) => <div key={slot}><dt className="lbl">{slot}</dt><dd><CredName c={u.c} /><Sep /><span className="dim">{u.n} use{u.n === 1 ? "" : "s"}, {hhmm(u.last)}</span></dd></div>)}</dl>
        </section>
      ) : null}
      <section><h3 className="section-h">Run</h3>
        {run.agent?.name ? <div className="fact-agent"><AgentMark name={run.agent.name} size={18} tile /><span><span className="fa-n">{run.agent.name}</span>{by ? <span className="fa-s">started by {by}</span> : run.agent.session ? <span className="fa-s">{run.agent.session}</span> : null}</span></div> : null}
        <FactRows rows={[["Run", run.id, true], ["Machine", `${machine.id} v${run.machine.version}`, true], ["Started", when(run.created_at)], ["Updated", since(run.updated_at)]]} />
      </section>
    </aside>
  );
}

// ---------- page ----------

function useNarrow(px: number) {
  const q = `(max-width: ${px}px)`;
  const [n, setN] = useState(() => matchMedia(q).matches);
  useEffect(() => { const m = matchMedia(q); const on = () => setN(m.matches); m.addEventListener("change", on); return () => m.removeEventListener("change", on); }, [q]);
  return n;
}

export function RunView({ id, onBack }: { id: string; onBack: () => void }) {
  const { run, machine } = useRun(id);
  const members = useMembers();
  const { me } = useMe();
  const frame = useRef<HTMLElement>(null), ask = useRef<HTMLDivElement>(null);
  const [, tick] = useState(0);
  const narrow = useNarrow(1240);
  // Dock: once the hero graph has scrolled up under the bar, it travels into the facts column (wider than 1100 only).
  const slot = useRef<HTMLDivElement>(null);
  const [docked, setDocked] = useState(false);
  const [hl, setHl] = useState<Hl>(null), [marked, setMarked] = useState<string | null>(null);
  const loaded = !!run && !!machine;
  useEffect(() => {
    if (!loaded) return;
    let raf = 0;
    const check = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => {
      const g = frame.current?.querySelector(".gview"); if (!g) return;
      const b = g.getBoundingClientRect().bottom, wide = innerWidth > 1100;
      setDocked((d) => wide && (d ? b < 64 + 72 : b < 64 + 32));
    }); };
    check();
    window.addEventListener("scroll", check, { passive: true }); window.addEventListener("resize", check);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("scroll", check); window.removeEventListener("resize", check); };
  }, [loaded]);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 30000); return () => clearInterval(t); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches("input,textarea,select")) { if (e.key === "Escape") (e.target as HTMLElement).blur(); return; }
      if (e.key === "Escape") onBack();
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [onBack]);
  const w = useMemo(() => walk(run?.history ?? []), [run?.history.length]);
  const hud = run?.status === "blocked" || run?.status === "waiting";
  // The HUD keeps the tone it came in with until it has faded out, so leaving "blocked" fades red, not blue.
  const [hudTone, setHudTone] = useState<Tone | null>(null);
  useEffect(() => { if (hud && run) setHudTone(run.status as Tone); }, [hud, run?.status]);
  if (!run || !machine) return <div className="loading" />;
  const tone = run.status as Tone;
  const s = machine.states[run.state];
  const readoutParts = <><Block tone={tone} size={11} /><span className="rs">{statusWord[run.status]}</span><span className="ra">at {run.state}</span><span className="rt">{stepAge(run)}</span></>;
  const readout = <div className="readout">{readoutParts}</div>;
  const by = handle(members, (run as Run & { by?: string }).by);
  const sub = (
    <>{statusWord[run.status]} at <code>{run.state}</code> {stepAge(run)}<Sep />started {hhmm(run.created_at)}{run.agent?.name ? <> by <Agent name={run.agent.name} /></> : null}{by ? <><Sep />{by}</> : null}</>
  );
  return (
    <div className="page run">
      <PageHead back={{ label: "Runs", href: "#/" }} title={machine.name} sub={sub}
        actions={<>{isLive(run.status) ? <Cancel id={run.id} /> : null}<a className="pill" href={`#/machines/${run.machine.id}`}>Open machine</a></>} />
      <section className={`frame${hud ? " hud-on" : ""}`} data-tone={tone} ref={frame}>
        <div className="hud" data-tone={hudTone ?? tone} aria-hidden="true"><i className="c tl" /><i className="c tr" /><i className="c bl" /><i className="c br" /></div>
        {readout}
        <MachineGraph machine={machine} view={{ current: run.state, walked: new Set(w.states), edges: w.edges, visits: w.visits, last: w.last, tone, hl }}
          dock={{ on: docked, slot }} onNodeHover={setMarked}
          minH={170} maxH={hud && narrow ? 320 : 460}
          full={{ readout, hud, extra: hud ? (close) => <button className="pill primary" onClick={() => { close(); setTimeout(() => document.getElementById("reply")?.focus(), 30); }}>{run.status === "blocked" ? "Answer the agent" : "Decide"}</button> : undefined }} />
        {hudTone ? <Leader frame={frame} ask={ask} node={run.state} tone={hudTone} on={hud && !docked} /> : null}
        <div className={`ask now t-${run.status}`} ref={ask} key={run.status}>
          {run.status === "blocked" ? <Blocked run={run} title={s.title} machine={machine} />
            : run.status === "waiting" ? <Waiting run={run} machine={machine} />
            : run.status === "running" ? <Working run={run} machine={machine} />
            : <Finished run={run} machine={machine} />}
        </div>
      </section>
      <div className="below">
        <Story run={run} machine={machine} tone={tone} onHl={setHl} marked={marked} members={members} meId={me?.user?.id} />
        <Facts run={run} machine={machine} slot={slot} docked={docked} by={by} caption={<div className="readout static dock-cap" data-tone={tone}>{readoutParts}</div>} />
      </div>
    </div>
  );
}
