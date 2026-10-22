// Describe it: the first way to make a machine. You say what the process is; an agent drafts it through the authoring
// tools; every draft is drawn on the stage as it arrives. You keep talking and the draft changes in front of you.
// From here the draft goes to the editor (to finish by hand) or straight to publishing.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgentMark } from "./agent-icons.tsx";
import { api, author, onAuthor, onConnectedAgents, useMe, type AuthorAgent, type Choice, type ConnectedAgent, type Machine, type TranscriptEntry } from "./api.ts";
import { blank, clean, draftKey, HINT_KEY, namedStates, StageFoot, useMeasuredHeight } from "./editor.tsx";
import { MachineGraph } from "./graph.tsx";
import { Block, EmptyPath } from "./glyph.tsx";
import { addAfter, connect, drawable, eventNameFor, removeState, retitle } from "./machine-ops.ts";
import { PageHead } from "./page.tsx";
import { Markdown, ProblemList, Sep } from "./parts.tsx";
import { validateMachine } from "../engine/engine.ts";

type Item =
  | { kind: "user"; text: string }
  | { kind: "agent"; text: string; open: boolean }
  | { kind: "tool"; id: string; title: string; status: string; message?: string; draft?: { states?: number; problems: number } }
  | { kind: "error"; text: string };

// A tool call as one quiet line.
function toolLine(t: Extract<Item, { kind: "tool" }>) {
  const name = t.title.replace(/^mcp__[a-z0-9_-]+__/, "");
  if (t.status === "denied") return `Not allowed: ${name.replace(/^denied: /, "")}`;
  if (t.status === "failed") return `${name} failed${t.message ? `: ${t.message}` : ""}`;
  if (name === "draft_machine") {
    if (!t.draft) return t.status === "completed" ? "Drafted" : "Drafting…";
    return `Drafted${t.draft.states !== undefined ? ` · ${t.draft.states} states` : ""} · ${t.draft.problems ? `${t.draft.problems} problem${t.draft.problems > 1 ? "s" : ""}` : "clean"}`;
  }
  if (name === "get_draft") return "Read the draft";
  if (/^ToolSearch$/i.test(name)) return "Looked up its tools";
  return name;
}

function fromTranscript(t: TranscriptEntry[], drafts: { problems: string[] }[], last: Machine | null): Item[] {
  let d = 0;
  const items: Item[] = t.map((e) => e.role === "tool"
    ? { kind: "tool", id: e.id, title: e.title, status: e.status, draft: /draft_machine$/.test(e.title) && drafts[d] ? { problems: drafts[d++].problems.length } : undefined }
    : e.role === "user" ? { kind: "user", text: e.text } : { kind: "agent", text: e.text, open: false });
  const lastDraft = [...items].reverse().find((i): i is Extract<Item, { kind: "tool" }> => i.kind === "tool" && !!i.draft);
  if (lastDraft && last) lastDraft.draft!.states = Object.keys(last.states).length;
  return items;
}

// A small menu in the composer: the agent, its model, its effort. Locked ones read as plain text with the reason in the title.
type Opt = { value: string; name: string; note?: string; icon?: boolean; disabled?: boolean; host?: string; sep?: boolean };
function Pick({ label, value, options, onChange, locked, icon, pending, extra, empty }: { label: string; value: string; options: Opt[]; onChange: (v: string) => void; locked?: string | false; icon?: boolean; pending?: boolean; extra?: React.ReactNode; empty?: string }) {
  const [open, setOpen] = useState(false);
  const cur = options.find((o) => o.value === value) ?? { value, name: value || empty || label };
  const face = <>{icon && cur.value ? <AgentMark name={cur.value} size={14} /> : null}{cur.name}{extra}</>;
  if (locked) return <span className={`agent-pick locked${icon ? "" : " txt"}`} title={locked}>{face}</span>;
  return (
    <div className="agent-pick-wrap" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false); }}>
      <button type="button" className={`agent-pick${pending ? " pending" : ""}`} aria-haspopup="listbox" aria-expanded={open} aria-busy={pending || undefined} aria-label={`${label}: ${cur.name}`} onClick={() => setOpen(!open)}>
        {face}
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2.5 4 5 6.5 7.5 4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open ? (
        <div className="agent-menu" role="listbox" aria-label={label}>
          {options.map((o) => o.sep ? <div className="grp" key={o.value}>{o.name}</div> : (
            <button type="button" role="option" key={o.value} aria-selected={o.value === value} disabled={o.disabled} className={o.value === value ? "on" : ""} data-host={o.host}
              onClick={() => { onChange(o.value); setOpen(false); }}>
              {icon ? <AgentMark name={o.value} size={14} /> : null}<span className="nm">{o.name}</span>{o.note ? <span className="dim">{o.note}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ---------- connect your agent: the person's own Claude Code, Pi or OpenCode, through the machine plugin ----------
const HOSTS: [string, string, string][] = [["claude-code", "Claude Code", "claude"], ["pi", "Pi", "pi"], ["opencode", "OpenCode", "opencode"]];
// A connected agent's id is the wire's `ses_…`; anything else is an ACP agent the server starts.
const isLink = (id: string) => id.startsWith("ses_");
const DOCKS = ["float", "side", "off"] as const; type Dock = typeof DOCKS[number]; const DOCK_KEY = "machine:describe:dock";
const short = (p: string) => p.replace(/^\/Users\/[^/]+|^\/home\/[^/]+/, "~");
const ago = (iso: string) => { const m = Math.round((Date.now() - Date.parse(iso)) / 60000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };
// What to run to connect each agent: install the published byoa connector, then one command inside the agent to connect
// (approved on the spot locally). Claude Code's lines are slash commands inside Claude Code; Pi's and OpenCode's first line
// is a terminal command. The Claude Code marketplace line needs github.com/plannotator/byoa to be public.
function lines(host: string, _hosted: boolean): string[] {
  const connect = `/byoa connect ${location.origin}`;
  if (host === "claude-code") return ["/plugin marketplace add plannotator/byoa", "/plugin install byoa@byoa", connect];
  if (host === "pi") return ["pi install npm:@plannotator/byoa-pi", connect];
  return ["opencode plugin add @plannotator/byoa-opencode", connect];
}
function Spinner() { return <span className="spin" aria-hidden>{Array.from({ length: 12 }, (_, i) => <i key={i} style={{ transform: `rotate(${i * 30}deg)`, animationDelay: `${(i - 11) / 12}s` }} />)}</span>; }

function ConnectStrip({ host, hosted, onBack }: { host: string; hosted: boolean; onBack: () => void }) {
  const [copied, setCopied] = useState<number | null>(null);
  const [, name] = HOSTS.find((h) => h[0] === host)!;
  const bin = host === "claude-code" ? "claude" : host;
  const all = lines(host, hosted);
  const copy = (text: string, i: number) => { navigator.clipboard?.writeText(text); setCopied(i); setTimeout(() => setCopied(null), 1200); };
  return (
    <div className="connect">
      <p>Once per computer{host === "claude-code" ? "" : ", in a terminal"}; then start <code>{bin}</code> in the repo this machine is about and run the last line there.</p>
      <div className="code-card">
        <div className="ch">Terminal<span className="sp" /><button type="button" onClick={() => copy(all.join("\n"), -1)}>{copied === -1 ? "Copied" : "Copy all"}</button></div>
        {all.map((l, i) => (
          <div className="ln" key={i}><span className="k">{i + 1}</span><code title={l}>{l}</code>
            <button type="button" onClick={() => copy(l, i)}>{copied === i ? "Copied" : "Copy"}</button></div>
        ))}
      </div>
      <div className="wait"><Spinner />Waiting for {name}…<a className="link" href="#" onClick={(e) => { e.preventDefault(); onBack(); }}>Cancel</a></div>
    </div>
  );
}

export function Describe({ query }: { query: URLSearchParams }) {
  const revise = query.get("revise");
  const { hosted, loaded } = useMe();
  const [agents, setAgents] = useState<AuthorAgent[]>([]);           // ACP children the server can start (local only)
  const [connected, setConnected] = useState<ConnectedAgent[]>([]);  // the person's own agents, through the plugin
  const [connecting, setConnecting] = useState<string | null>(null); // the host whose install lines are open
  const [agent, setAgent] = useState("");                            // a ConnectedAgent id (has slashes) or an ACP agent id
  const [session, setSession] = useState<string | null>(query.get("session"));
  const [closed, setClosed] = useState(false);
  const [prompted, setPrompted] = useState(false); // something was said in this conversation: agent and effort are now fixed
  const [config, setConfig] = useState<Choice[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [draft, setDraft] = useState<Machine | null>(null);
  const [serverProblems, setServerProblems] = useState<string[]>([]);
  const [edited, setEdited] = useState(false); // you changed the draft by hand since the agent's last draft
  const [running, setRunning] = useState(false);
  const [text, setText] = useState("");
  const [status, setStatus] = useState("");
  const [sel, setSel] = useState<string | undefined>();
  const [armed, setArmed] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [hint, setHint] = useState(() => !localStorage.getItem(HINT_KEY));
  // Where the conversation sits: floating over the bottom of the stage (default), beside it, or away (manual: draw by hand).
  const [dock, setDock] = useState<Dock>(() => { const d = localStorage.getItem(DOCK_KEY); return (DOCKS as readonly string[]).includes(d ?? "") ? d as Dock : "float"; });
  const setDockMode = (d: Dock) => { localStorage.setItem(DOCK_KEY, d); setDock(d); };
  const [ws, wsH] = useMeasuredHeight<HTMLDivElement>();
  const [fl, flH] = useMeasuredHeight<HTMLElement>();
  const sessionRef = useRef(session); sessionRef.current = session;
  const scroll = useRef<HTMLDivElement>(null), field = useRef<HTMLTextAreaElement>(null);

  // Connected agents come first; in local mode the ACP children are the fallback.
  useEffect(() => {
    if (!loaded) return;
    author.connected().then((c) => { setConnected(c); setAgent((cur) => cur || c.find((x) => x.connected)?.id || ""); }).catch(() => {});
    if (!hosted) author.agents().then(setAgents).catch(() => {});   // offered in the card and the picker, never picked by itself
  }, [loaded, hosted]);
  const promptedRef = useRef(prompted); promptedRef.current = prompted;
  const agentRef = useRef(agent); agentRef.current = agent;
  const configRef = useRef(config); configRef.current = config;
  const fail = (text: string) => setItems((x) => [...x, { kind: "error", text }]);
  // The agent runs from the moment the screen opens, so its model and effort are real choices before you type.
  // "closed" means the conversation on screen ended; the agent behind the composer is then already a fresh one,
  // and the next message carries the draft to it.
  const starting = useRef<Promise<string> | null>(null);
  const start = (id: string, effort?: string) => {
    const p = (async () => {
      const s = isLink(id) ? await author.start(undefined, revise ?? undefined, undefined, id) : await author.start(id || undefined, revise ?? undefined, effort);
      setSession(s.id); sessionRef.current = s.id; setPrompted(false); setConfig(s.config);
      history.replaceState(null, "", `#/machines/new?session=${s.id}${revise ? `&revise=${encodeURIComponent(revise)}` : ""}`);
      if (s.draft) setDraft((d) => d ?? drawable(s.draft));
      return s.id;
    })();
    starting.current = p;
    p.catch((e) => fail(`Could not start the agent: ${(e as Error).message}`)).finally(() => { if (starting.current === p) starting.current = null; });
    return p;
  };
  const fresh = (id: string, effort?: string) => {
    const old = sessionRef.current; sessionRef.current = null; setSession(null); setConfig([]);
    if (old && !promptedRef.current) author.close(old);
    return start(id, effort);
  };
  useEffect(() => { if (dock !== "off" && agent && !sessionRef.current && !starting.current) start(agent); }, [agent, dock]);
  // Leaving before saying anything: let the agent go.
  useEffect(() => () => { if (sessionRef.current && !promptedRef.current) author.close(sessionRef.current); }, []);
  const pickAgent = (id: string) => {
    if (id.startsWith("host:")) { setConnecting(id.slice(5)); return; }   // a host from the menu: show its lines and wait for it
    setConnecting(null);
    if (id !== agent) { setAgent(id); fresh(id); }
  };
  useEffect(() => onConnectedAgents((c) => {
    setConnected(c);
    // The agent we were waiting for appeared (or the first one, with nothing chosen yet): pick it and start with it.
    const fresh = c.find((x) => x.connected && (connecting ? x.host === connecting : !agentRef.current));
    if (fresh) pickAgent(fresh.id);
  }), [connecting, agent]);
  const link = isLink(agent) ? connected.find((a) => a.id === agent) : undefined;
  const effortOf = (c: Choice[]) => c.find((x) => x.id === "effort")?.value;
  // Changing an option: shown at once, settled by the server's answer (an effort change restarts the agent, about two
  // seconds); a message sent meanwhile waits for it.
  const [settling, setSettling] = useState<string | null>(null);
  const configuring = useRef<Promise<void> | null>(null);
  const pick = (option: string, value: string) => {
    const id = sessionRef.current; if (!id) return;
    setConfig((c) => c.map((x) => x.id === option ? { ...x, value } : x)); setSettling(option);
    const p = author.configure(id, option, value).then((r) => setConfig(r.config))
      .catch((e) => { fail((e as Error).message); return author.get(id).then((v) => setConfig(v.config)).catch(() => {}); })
      .finally(() => { setSettling((x) => x === option ? null : x); if (configuring.current === p) configuring.current = null; });
    configuring.current = p;
  };
  // Revising: start from the published machine. Reloading: come back to the conversation.
  useEffect(() => {
    if (session) {
      author.get(session).then((v) => {
        const d = drawable(v.draft);
        setAgent(v.link ?? v.agent); setDraft(d); setServerProblems(v.problems); setItems(fromTranscript(v.transcript, v.drafts, d));
        setPrompted(v.prompted || v.transcript.some((e) => e.role === "user")); setConfig(v.config ?? []);
        setRunning(v.status === "running");
        if (v.error) setItems((x) => [...x, { kind: "error", text: v.error! }]);
        if (v.status === "closed" || v.status === "error") { setClosed(true); fresh(v.agent, effortOf(v.config ?? [])); }
      }).catch(() => { setClosed(true); fresh(agentRef.current); });
    } else if (revise) api.machine(revise).then((m) => setDraft(m)).catch(() => {});
  }, []);

  // The stream: agent text in small chunks (batched to one update a frame), tool rows updated in place, drafts, turns.
  const pending = useRef("");
  const raf = useRef(0);
  const flush = useCallback(() => {
    raf.current = 0;
    const chunk = pending.current; pending.current = "";
    if (!chunk) return;
    setItems((x) => { const last = x.at(-1); return last?.kind === "agent" && last.open ? [...x.slice(0, -1), { ...last, text: last.text + chunk }] : [...x, { kind: "agent", text: chunk, open: true }]; });
  }, []);
  useEffect(() => onAuthor((type, d) => {
    if (d.session !== sessionRef.current) return;
    if (type === "author.message") {
      if (d.role === "user") { setItems((x) => [...x, { kind: "user", text: d.text }]); return; }
      if (d.text) { pending.current += d.text; if (!raf.current) raf.current = requestAnimationFrame(flush); }
      if (d.done) { cancelAnimationFrame(raf.current); raf.current = 0; flush(); setItems((x) => x.map((i) => i.kind === "agent" && i.open ? { ...i, open: false } : i)); }
    } else if (type === "author.tool") {
      // a tool call ends the agent's current paragraph; text after it is a new message
      if (raf.current) { cancelAnimationFrame(raf.current); raf.current = 0; flush(); }
      setItems((x) => x.map((i) => i.kind === "agent" && i.open ? { ...i, open: false } : i));
      setItems((x) => {
        const i = x.findIndex((it) => it.kind === "tool" && it.id === d.id);
        if (i < 0) return [...x, { kind: "tool", id: d.id, title: d.title, status: d.status, message: d.message }];
        const c = [...x]; c[i] = { ...(c[i] as Extract<Item, { kind: "tool" }>), title: d.title || (c[i] as any).title, status: d.status, message: d.message }; return c;
      });
    } else if (type === "author.draft") {
      const m = drawable(d.machine);
      setDraft(m); setServerProblems(d.problems); setEdited(false); setNotes([]);
      setItems((x) => {
        const c = [...x];
        for (let i = c.length - 1; i >= 0; i--) { const it = c[i]; if (it.kind === "tool" && /draft_machine$/.test(it.title) && !it.draft) { c[i] = { ...it, draft: { states: m ? Object.keys(m.states).length : 0, problems: d.problems.length } }; break; } }
        return c;
      });
    } else if (type === "author.config") {
      setConfig(d.config);
    } else if (type === "author.turn") {
      setRunning(d.status === "running");
      if (d.status === "error") { fail(d.message ?? "The agent stopped with an error."); setClosed(true); fresh(agentRef.current, effortOf(configRef.current)); }
      if (d.status === "cancelled") setItems((x) => [...x, { kind: "error", text: "Cancelled." }]);
    }
  }), [flush]);
  useEffect(() => { const el = scroll.current; if (el) el.scrollTop = el.scrollHeight; }, [items]);
  useEffect(() => { setArmed(null); }, [sel]);

  const problems = useMemo(() => (draft ? (edited ? validateMachine(draft) : serverProblems) : []), [draft, edited, serverProblems]);
  const probStates = useMemo(() => new Set(problems.flatMap(namedStates).filter((x) => draft?.states[x])), [problems, draft]);

  const send = async () => {
    const t = text.trim(); if (!t || running) return;
    if (!agent) return;
    setStatus("");
    let id = session;
    // Your hand edits (or a draft from a conversation that ended) go with the message, so the agent continues from them.
    const carry = draft && (edited || (closed && !revise)) ? `\n\nI changed the draft by hand. Continue from this definition:\n\`\`\`json\n${JSON.stringify(draft, null, 2)}\n\`\`\`` : "";
    try { if (configuring.current) await configuring.current; id = starting.current ? await starting.current : id ?? await start(agent, effortOf(config)); } catch { return; }
    setText("");
    try { await author.prompt(id!, t + carry); setRunning(true); setPrompted(true); setClosed(false); setEdited(false); }
    catch (e) { setItems((x) => [...x, { kind: "error", text: (e as Error).message }]); setText(t); }
  };
  const cancel = () => { if (session) author.cancel(session).catch(() => {}); };

  // Drawing on the stage edits the draft here; the next message carries it to the agent.
  const local = (m: Machine) => { setDraft(m); setEdited(true); if (hint) { localStorage.setItem(HINT_KEY, "1"); setHint(false); } };
  const draw = draft ? {
    onAdd: (from: string) => { const r = addAfter(draft, from); local(r.m); setSel(r.id); },
    onConnect: (from: string, to: string, ev: string) => local(connect(draft, from, to, ev)),
    onRetitle: (id: string, title: string) => local(retitle(draft, id, title)),
    eventName: (from: string, to: string) => eventNameFor(draft, from, to),
  } : undefined;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches("input,textarea,select") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (armed && (e.key === "Delete" || e.key === "Backspace" || e.key === "Enter")) { e.preventDefault(); remove(armed); return; }
      if (armed && e.key === "Escape") { e.preventDefault(); setArmed(null); return; }
      if ((e.key === "Delete" || e.key === "Backspace") && sel) { e.preventDefault(); setArmed(sel); }
      if (e.key === "Escape") setSel(undefined);
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [sel, armed, draft]);
  const remove = (id: string) => { if (!draft) return; const r = removeState(draft, id); local(r.m); setNotes((n) => [...r.removed, ...n].slice(0, 6)); setArmed(null); setSel(undefined); };

  const toEditor = () => {
    if (!draft) return;
    const m = { ...blank(draft.id), ...draft } as Machine;
    localStorage.setItem(draftKey(m.id), JSON.stringify(m));
    location.hash = `/machines/${m.id}`;
  };
  const publish = async () => {
    if (!draft || problems.length) return;
    setStatus("Publishing…");
    try { const r = await api.publish(clean(draft)); localStorage.removeItem(draftKey(draft.id)); location.hash = `/machines/${draft.id}`; setStatus(`Published v${r.version}`); }
    catch (e) { setStatus(`Could not publish: ${(e as Error).message}`); }
  };

  const nStates = draft ? Object.keys(draft.states).length : 0;
  const stageH = Math.max(440, wsH);
  const graphH = dock === "float" ? Math.max(160, stageH - 80 - flH) : stageH - 82;   // floating: the graph is centred in what is left above the panel
  const title = draft?.name ?? (revise ? `Change ${revise}` : "New machine");
  const sub = draft
    ? <><code>{draft.id}</code><Sep />{nStates} states<Sep />{edited ? "changed by hand" : revise && !session ? "published" : "draft"}</>
    : "Say what the process is. An agent drafts it and you watch it take shape.";
  const actions = <>
    {status ? <span className="status">{status}</span> : null}
    {dock === "off" ? <button className="pill quiet" onClick={() => setDockMode("float")}>Ask an agent</button> : null}
    <button className="pill quiet" disabled={!draft} onClick={toEditor}>Open in editor</button>
    <button className="pill primary" disabled={!draft || !!problems.length || running || (!session && !edited)} onClick={publish}>Publish</button>
  </>;
  const bar = (
    <div className="dock-bar">
      <button type="button" className="pill sm quiet" onClick={() => setDockMode(dock === "float" ? "side" : "float")}>{dock === "float" ? "Move to side" : "Float"}</button>
      <button type="button" className="pill sm quiet" onClick={() => setDockMode("off")}>Manual</button>
    </div>
  );
  const panel = dock === "off"
    ? (problems.length || notes.length ? <aside className="converse float only" ref={fl}><ProblemList problems={problems} notes={notes} okText="" /></aside> : null)
    : (
      <aside className={`inspector converse${dock === "float" ? " float" : ""}`} ref={fl}>
        {bar}
        <div className="talk" ref={scroll} aria-live="polite">
          {items.length === 0 ? (
            <div className="talk-intro">
              {connecting ? <ConnectStrip host={connecting} hosted={hosted} onBack={() => setConnecting(null)} /> : <>
                <p className="section-h">{!agent ? "Connect your agent" : revise ? "What should change?" : "What should the agent do?"}</p>
                <p className="quiet">{!agent
                  ? "The agent you already use draws the machine here, from your own terminal and repo. Pick it below."
                  : revise
                  ? "Say what to add, remove or change. The agent revises the published machine; you publish when it looks right."
                  : `Name the steps in plain words, where a person decides, and how it ends. For example: reproduce the bug, fix it, run the tests, open a PR; a person approves or asks for changes; merged is the good end.${link ? " You can also say it in the terminal: the same session draws here." : ""}`}</p>
                {revise ? null : <a className="link" href="#/machines/new/draw">Or draw it yourself</a>}
              </>}
            </div>
          ) : items.map((it, i) =>
            it.kind === "user" ? <div key={i} className="msg you"><span className="actor">You</span><p>{it.text.split("\n\nI changed the draft by hand.")[0]}</p></div>
            : it.kind === "agent" ? <div key={i} className={`msg agent${it.open ? " open" : ""}`}>{it.open ? <p className="stream">{it.text}</p> : <Markdown text={it.text} />}</div>
            : it.kind === "tool" ? <div key={i} className={`tool s-${it.status}`}><Block tone={it.status === "failed" || it.status === "denied" ? "blocked" : it.draft?.problems ? "waiting" : it.status === "completed" ? "check" : undefined} hollow={it.status === "pending" || it.status === "in_progress"} size={9} /><span>{toolLine(it)}</span></div>
            : <div key={i} className="msg err"><Block tone="blocked" size={9} /><span>{it.text}</span></div>)}
          {running && link && !link.connected ? <div className="queued"><i className="dot pulse" />Waiting for {link.name} to pick it up · last seen {ago(link.last_poll)}</div> : null}
        </div>
        <form className="composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <textarea ref={field} id="describe" value={text} onChange={(e) => setText(e.target.value)} rows={3} aria-label="Describe the process"
            placeholder={!agent ? "Connect an agent to describe the process" : closed ? "This conversation ended. Write to start a new one from the draft." : draft ? "Ask for a change" : "Describe the process"}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
          <div className="composer-row">
            <div className="picks">
              <Pick label="Agent" icon value={agent} empty="Connect your agent" onChange={pickAgent} locked={prompted && !closed && `This conversation is with ${link?.name ?? agents.find((a) => a.id === agent)?.name ?? agent}`}
                extra={link ? <><i className={`dot${link.connected ? "" : " off"}`} />{link.connected ? (link.cwd ? <code>{short(link.cwd)}</code> : null) : <span className="dim">last seen {ago(link.last_poll)}</span>}</> : null}
                options={[
                  ...connected.map((a) => ({ value: a.id, name: a.name, note: `${a.cwd ? short(a.cwd) : a.session.slice(0, 8)} · ${a.connected ? (a.busy ? "busy" : "connected") : `last seen ${ago(a.last_poll)}`}` })),
                  ...agents.map((a) => ({ value: a.id, name: a.name, disabled: !a.available, note: !a.available ? "not installed" : "start it here" })),
                  { value: "-", name: connected.length ? "Connect another" : "Connect your agent", sep: true },
                  ...HOSTS.map(([id, name]) => ({ value: `host:${id}`, name, host: id, note: connecting === id ? "waiting…" : undefined })),
                  { value: "host:other", name: "Other (MCP)", disabled: true, note: "soon" },
                ]} />
              {config.map((c) => (
                <Pick key={c.id} label={c.name} value={c.value} onChange={(v) => pick(c.id, v)} pending={settling === c.id}
                  locked={!!c.fixed && `${c.name} is set when a conversation starts`}
                  options={c.options.map((o) => ({ value: o.value, name: c.category === "thought_level" ? `${o.name} ${c.name.toLowerCase()}` : o.name, note: o.description }))} />
              ))}
            </div>
            {running ? (
              <span className="working"><span className="pulse"><AgentMark name={agent} size={14} /></span>{link ? <>{link.connected ? "Working in your terminal" : `Waiting for ${link.name}…`}{link.id.startsWith("ses_") ? <button type="button" className="pill sm quiet" onClick={cancel}>Stop</button> : null}</> : <>Working<button type="button" className="pill sm quiet" onClick={cancel}>Cancel</button></>}</span>
            ) : <button className="pill sm primary" disabled={!text.trim()}>Send</button>}
          </div>
        </form>
        <ProblemList problems={problems} notes={notes} okText={draft ? "Nothing to fix. Publish when ready." : "The draft's problems show here."} />
      </aside>
    );
  return (
    <div className={`page editor describe dock-${dock}`}>
      <PageHead back={revise ? { label: "Back to the machine", href: `#/machines/${revise}` } : { label: "Machines", href: "#/machines" }} title={title} sub={sub} actions={actions} />
      <div className="workspace" ref={ws}>
        <section className="frame stage-ed" data-tone="select">
          {draft ? (
            <>
              <MachineGraph machine={draft} minH={graphH} maxH={graphH} edit draw={running ? undefined : draw}
                view={{ problems: probStates, selected: sel, current: sel, tone: "select" }} onSelect={(s) => setSel(s)}
                full={{ readout: <div className="readout plain"><span className="rs">{draft.name}</span><span className="ra">{nStates} states</span></div> }} />
              <StageFoot hint={hint && !running} />
            </>
          ) : (
            <div className="stage-empty" style={dock === "float" ? { bottom: flH + 32 } : undefined}><EmptyPath n={5} />
              {dock === "off" ? <><p>Draw the process by hand</p><button className="pill primary" onClick={() => local(blank())}>Start with a first step</button></> : <p>Describe the process and watch it take shape</p>}
            </div>
          )}
          {dock === "float" ? panel : null}
        </section>
        {dock === "float" ? null : panel}
      </div>
    </div>
  );
}
