// The machine editor. The graph is the stage; beside it one inspector: the machine's parts and its states as
// one list, the selected one open in place. The skill the agent reads is the stage's other face.
// Drafts live in the browser until published.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, isHosted, type Machine } from "./api.ts";
import { Block } from "./glyph.tsx";
import { Markdown, ProblemList, Sep } from "./parts.tsx";
import { validateMachine, type State } from "../engine/engine.ts";
import { renderSkill } from "../engine/render-skill.ts";
import { MachineGraph } from "./graph.tsx";
import { CredentialStrip } from "./credentials.tsx";
import { formatCredentials, formatEvents, formatFields, formatRequirements, parseCredentials, parseEvents, parseFields, parseRequirements } from "./lines.ts";
import { addAfter, connect, eventNameFor, removeState as removeOp, retitle } from "./machine-ops.ts";
import { PageHead } from "./page.tsx";

export const blank = (id = "new-machine"): Machine => ({
  id, version: 1, name: "New machine", description: "What this process does and when to use it.",
  inputs: {}, requirements: [], initial: "start",
  states: { start: { kind: "task", title: "Start", instructions: "What the agent does first.", on: { done: { to: "done" } } }, done: { kind: "final", title: "Done", outcome: "success" } },
});
export const draftKey = (id: string) => `machine:draft:${id}`;

// What gets published: no empty leftovers from the template, no "required: false".
export function clean(m: Machine): Machine {
  const c = structuredClone(m);
  const fields = (f?: Record<string, { required?: boolean; description?: string }>) => { for (const v of Object.values(f ?? {})) { if (!v.required) delete v.required; if (!v.description) delete v.description; } };
  fields(c.inputs); if (!Object.keys(c.inputs ?? {}).length) delete c.inputs;
  if (!c.requirements?.length) delete c.requirements;
  if (!c.credentials?.length) delete c.credentials;
  for (const s of Object.values(c.states)) {
    if (!s.instructions) delete s.instructions;
    if (!s.credentials?.length) delete s.credentials;
    if (!Object.keys(s.on ?? {}).length) delete s.on;
    fields(s.output); if (!Object.keys(s.output ?? {}).length) delete s.output;
    if (!s.requirements?.length) delete s.requirements;
    for (const t of Object.values(s.on ?? {})) if (!t.description) delete t.description;
  }
  return c;
}

type BlockId = "none" | "head" | "inputs" | "requirements" | "credentials" | `state:${string}`;

function Line({ label, value, onChange, hint, prose, focusKey }: { label: string; value: string; onChange: (v: string) => void; hint?: string; prose?: boolean; focusKey?: string }) {
  return <label className="field"><span className="k label">{label}</span><input className={prose ? "prose" : ""} value={value} onChange={(e) => onChange(e.target.value)} spellCheck={false} data-title-for={focusKey} />{hint ? <span className="hint">{hint}</span> : null}</label>;
}
// Under the stage: the quiet confirm for removing a state (Delete), or the one-time gesture hint.
export function StageFoot({ hint }: { hint: boolean }) {
  return hint ? <div className="stage-foot"><span className="hint">Hover a step for + and ×, drag between steps to connect, double-click a title to rename</span></div> : null;
}
function Area({ label, value, onChange, rows = 3, hint, prose }: { label: string; value: string; onChange: (v: string) => void; rows?: number; hint?: string; prose?: boolean }) {
  return (
    <label className="field"><span className="k label">{label}</span>
      <textarea className={prose ? "prose" : ""} value={value} rows={Math.max(rows, value.split("\n").length)} onChange={(e) => onChange(e.target.value)} spellCheck={false} />
      {hint ? <span className="hint">{hint}</span> : null}
    </label>
  );
}
const KindGlyph = ({ kind }: { kind: string }) => (
  <svg className={`kglyph k-${kind}`} width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
    {kind === "decision" ? <path d="M7 1.8 12.2 7 7 12.2 1.8 7Z" /> : kind === "wait" ? <path d="M2.5 9.5a4.5 4.5 0 0 1 9 0Z" /> : kind === "final" ? <rect x="1.5" y="4" width="11" height="6" rx="3" /> : <rect x="2.5" y="2.5" width="9" height="9" rx="2.4" />}
  </svg>
);
// One part of the machine in the inspector: a summary you can click or Tab to, and its fields open in place when selected.
function Part({ bid, sel, setSel, summary, children }: { bid: BlockId; sel: BlockId; setSel: (b: BlockId) => void; summary: ReactNode; children: ReactNode }) {
  const on = sel === bid;
  return (
    <div className={`blk${on ? " sel" : ""}`} data-blk={bid}>
      <button type="button" className="sum" aria-expanded={on} onClick={() => { if (!on) setSel(bid); }}>{summary}</button>
      {on ? <div className="body">{children}</div> : null}
    </div>
  );
}
// The workspace is sized by CSS to fill the viewport; the graph needs that height in pixels.
// A callback ref, so the observer attaches when the workspace mounts (after the machine loads), not on the first render.
export function useMeasuredHeight<T extends HTMLElement>() {
  const [h, setH] = useState(0);
  const ro = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: T | null) => {
    ro.current?.disconnect(); ro.current = null;
    if (!el) return;
    ro.current = new ResizeObserver(() => setH(el.getBoundingClientRect().height));
    ro.current.observe(el); setH(el.getBoundingClientRect().height);
  }, []);
  return [ref, h] as const;
}

// The skill as the agent reads it, rendered: front matter as a quiet block, then the markdown.
function Skill({ text }: { text: string }) {
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(text);
  return <article className="skill">{fm ? <pre className="fm">{fm[1]}</pre> : null}<Markdown text={fm ? text.slice(fm[0].length) : text} /></article>;
}
const kindHint: Record<string, string> = { task: "The agent works, then fires one of the events.", decision: "The agent picks one of the events.", wait: "A person picks the event from the run page.", final: "The run ends here." };
// The JSON face: a syntax error becomes one problem naming the line.
function jsonProblem(text: string, e: Error) {
  const pos = /position (\d+)/.exec(e.message)?.[1], line = /line (\d+)/.exec(e.message)?.[1];
  const at = line ?? (pos ? String(text.slice(0, Number(pos)).split("\n").length) : null);
  return `The JSON does not parse${at ? ` at line ${at}` : ""}: ${e.message.replace(/\s*\(line \d+ column \d+\)/, "").replace(/ in JSON at position \d+/, "")}`;
}
export const HINT_KEY = "machine:hint:draw";
// The states named in a problem line, so the graph and the list can mark them.
export const namedStates = (p: string) => [...p.matchAll(/"([a-z0-9_]+)"/g)].map((x) => x[1]);

export function Editor({ id, back }: { id: string; back: { label: string; href: string } }) {
  const [m, setM] = useState<Machine | null>(null);
  const [published, setPublished] = useState<Machine | null>(null);
  const [sel, setSel] = useState<BlockId>(id === "new" ? "head" : "none");
  const [pane, setPane] = useState<"graph" | "skill" | "json">("graph");
  const [notes, setNotes] = useState<string[]>([]);
  const [json, setJson] = useState<{ text: string; err: string | null } | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const [focusTitle, setFocusTitle] = useState<string | null>(null);
  const [hint, setHint] = useState(() => !localStorage.getItem(HINT_KEY));
  const [status, setStatus] = useState<string>("");
  const [text, setText] = useState<Record<string, string>>({});
  const [lineErrors, setLineErrors] = useState<Record<string, string[]>>({});
  const [ws, wsH] = useMeasuredHeight<HTMLDivElement>();
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const draft = localStorage.getItem(draftKey(id));
    if (id === "new") { setM(draft ? JSON.parse(draft) : blank()); return; }
    api.machine(id).then((srv) => { setPublished(srv); setM(draft ? JSON.parse(draft) : srv); }).catch(() => setM(draft ? JSON.parse(draft) : blank(id)));
  }, [id]);
  useEffect(() => { if (m) localStorage.setItem(draftKey(id), JSON.stringify(m)); }, [m, id]);

  const update = useCallback((fn: (m: Machine) => Machine) => setM((prev) => prev ? fn(structuredClone(prev)) : prev), []);
  const setState = (sid: string, fn: (s: State) => void) => update((mm) => { fn(mm.states[sid]); return mm; });
  const buf = (key: string, fallback: string) => text[key] ?? fallback;
  const edit = (key: string, value: string, apply: (v: string) => string[]) => { setText((t) => ({ ...t, [key]: value })); setLineErrors((e) => ({ ...e, [key]: apply(value) })); };

  const problems = useMemo(() => m ? [...(json?.err ? [json.err] : []), ...validateMachine(m), ...Object.values(lineErrors).flat()] : [], [m, lineErrors, json?.err]);
  const dirty = m && published ? JSON.stringify(clean(m)) !== JSON.stringify(clean(published)) : true;
  const order: BlockId[] = useMemo(() => m ? ["head", "inputs", "requirements", "credentials", ...Object.keys(m.states).map((s) => `state:${s}` as BlockId)] : [], [m]);

  const publish = useCallback(async () => {
    if (!m) return;
    if (problems.length) { setStatus(`Fix ${problems.length} problem${problems.length > 1 ? "s" : ""} first`); return; }
    setStatus("Publishing…");
    try {
      const r = await api.publish(clean(m));
      setPublished({ ...m, version: r.version }); setM({ ...m, version: r.version });
      localStorage.removeItem(draftKey(id));
      setStatus(`Published v${r.version}. The skill is at ${r.path}`);
      if (id === "new") location.hash = `/machines/${m.id}`;
    } catch (e) { setStatus(`Could not publish: ${(e as Error).message}`); }
  }, [m, problems.length, id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches("input,textarea,select")) { if (e.key === "Escape") (e.target as HTMLElement).blur(); return; }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const i = sel === "none" ? -1 : order.indexOf(sel);
      if (e.key === "j" || e.key === "ArrowDown") { e.preventDefault(); setSel(order[Math.min(i + 1, order.length - 1)]); }
      if (e.key === "k" || e.key === "ArrowUp") { e.preventDefault(); setSel(order[Math.max(i - 1, 0)]); }
      if (e.key === "Escape" && sel !== "none") { setSel("none"); return; }
      if (e.key === "s") setPane((p) => p === "graph" ? "skill" : "graph");
      if (armed && (e.key === "Delete" || e.key === "Backspace" || e.key === "Enter")) { e.preventDefault(); removeState(armed); return; }
      if (armed && e.key === "Escape") { e.preventDefault(); setArmed(null); return; }
      if ((e.key === "Delete" || e.key === "Backspace") && sel.startsWith("state:")) { e.preventDefault(); setArmed(sel.slice(6)); }
      if (e.key === "Escape" && sel === "none") location.hash = back.href.slice(1);
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [order, sel, back.href, armed]);
  // The confirm sits on the node until Remove, Keep, Escape or another selection.
  useEffect(() => { setArmed(null); }, [sel]);
  // A step added on the canvas opens in the inspector with its title ready to type.
  useEffect(() => { if (!focusTitle) return; const el = list.current?.querySelector<HTMLInputElement>(`[data-title-for="${focusTitle}"]`); if (el) { el.focus(); el.select(); setFocusTitle(null); } });
  // The JSON face shows the live definition unless you are typing in it.
  useEffect(() => { if (pane === "json" && m && document.activeElement?.id !== "json-face") setJson({ text: JSON.stringify(m, null, 2), err: null }); }, [pane, m]);
  useEffect(() => { list.current?.querySelector(".blk.sel")?.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); }, [sel]);

  if (!m) return <div className="loading" />;

  const addState = () => {
    let n = 1; while (m.states[`state_${n}`]) n++;
    const sid = `state_${n}`;
    update((mm) => { mm.states[sid] = { kind: "task", title: "New state", instructions: "", on: {} }; return mm; });
    setSel(`state:${sid}`);
  };
  const renameState = (from: string, to: string) => {
    if (!to || to === from || !/^[a-z0-9_]+$/.test(to) || m.states[to]) return;
    update((mm) => {
      const states: Machine["states"] = {};
      for (const [k, v] of Object.entries(mm.states)) states[k === from ? to : k] = v;
      for (const s of Object.values(states)) for (const t of Object.values(s.on ?? {})) if (t.to === from) t.to = to;
      if (mm.initial === from) mm.initial = to;
      mm.states = states; return mm;
    });
    setSel(`state:${to}`);
  };
  const removeState = (sid: string) => { const r = removeOp(m, sid); setM(r.m); setNotes((n) => [...r.removed, ...n].slice(0, 6)); setArmed(null); setSel("none"); };
  const used = () => { if (hint) { localStorage.setItem(HINT_KEY, "1"); setHint(false); } };
  const draw = {
    onAdd: (from: string) => { const r = addAfter(m, from); setM(r.m); setSel(`state:${r.id}`); setFocusTitle(r.id); used(); },
    onConnect: (from: string, to: string, event: string) => { setM(connect(m, from, to, event)); setSel(`state:${from}`); used(); },
    onRetitle: (id: string, title: string) => { setM(retitle(m, id, title)); },
    eventName: (from: string, to: string) => eventNameFor(m, from, to),
    armed, onArm: (id: string) => { setSel(`state:${id}`); setTimeout(() => setArmed(id), 0); }, onRemove: (id: string) => removeState(id), onKeep: () => setArmed(null),
  };
  const onJson = (text: string) => {
    try { const parsed = JSON.parse(text); setJson({ text, err: null }); if (parsed && typeof parsed === "object" && parsed.states) setM(parsed); }
    catch (e) { setJson({ text, err: jsonProblem(text, e as Error) }); }
  };
  const focusProblem = (p: string) => { const mm = /"([a-z0-9_]+)"/.exec(p); if (mm && m.states[mm[1]]) setSel(`state:${mm[1]}`); };
  const selState = sel.startsWith("state:") ? sel.slice(6) : undefined;
  const out = selState ? Object.entries(m.states[selState]?.on ?? {}) : [];
  const nStates = Object.keys(m.states).length;
  const stageH = Math.max(440, wsH);
  const probStates = new Set(problems.flatMap(namedStates).filter((x) => m.states[x]));

  const sub = <><code>{m.id}</code><Sep />{published ? (dirty ? <>Draft<Sep />published v{published.version}</> : `Published v${published.version}`) : "Draft, not published yet"}<Sep />{nStates} states</>;
  // Describe-it spawns local agents; hosted mode has no such thing (01-teams-and-signin.md §5.4).
  const describe = published && !isHosted() ? <a className="pill quiet" href={`#/machines/new?revise=${encodeURIComponent(m.id)}`}>Describe a change</a> : null;
  const action = published && !dirty
    ? <>{describe}<span className="status"><Block tone="check" size={9} />{status || `Published v${published.version}`}</span></>
    : <>{describe}{status ? <span className="status">{status}</span> : null}<button className="pill primary" disabled={!!problems.length} onClick={publish}>{published ? `Publish v${published.version + 1}` : "Publish"}</button></>;
  return (
    <div className="page editor">
      <PageHead back={back} title={m.name} sub={sub} actions={action} />
      <div className="workspace" ref={ws}>
        <section className="frame stage-ed" data-tone="select">
          <div className="stage-bar">
            <div className="switch" role="tablist" aria-label="Stage">
              <button role="tab" id="tab-graph" aria-controls="stage-panel" aria-selected={pane === "graph"} className={pane === "graph" ? "on" : ""} onClick={() => setPane("graph")}>Machine</button>
              <button role="tab" id="tab-skill" aria-controls="stage-panel" aria-selected={pane === "skill"} className={pane === "skill" ? "on" : ""} onClick={() => setPane("skill")}>Skill</button>
              <button role="tab" id="tab-json" aria-controls="stage-panel" aria-selected={pane === "json"} className={pane === "json" ? "on" : ""} onClick={() => setPane("json")}>JSON</button>
            </div>
          </div>
          <div id="stage-panel" role="tabpanel" aria-labelledby={`tab-${pane}`}>
            {pane === "graph" ? (
              <>
                <MachineGraph machine={m} minH={stageH - 82} maxH={stageH - 82} whole
                  edit view={{ current: selState, selected: selState, edges: new Set(out.map(([e]) => `${selState}→${e}`)), walked: new Set(out.map(([, t]) => t.to)), tone: "select", problems: probStates }}
                  onSelect={(s) => setSel(`state:${s}`)} draw={draw}
                  full={{ readout: <div className="readout plain"><span className="rs">{m.name}</span><span className="ra">{nStates} states<Sep />click a state to edit it</span></div> }} />
                <StageFoot hint={hint} />
              </>
            ) : pane === "skill" ? (
              <div className="skill-pane"><Skill text={renderSkill(m)} /></div>
            ) : (
              <div className="json-pane">
                <textarea id="json-face" className="json" spellCheck={false} aria-label="The machine as JSON" value={json?.text ?? JSON.stringify(m, null, 2)}
                  onChange={(e) => onJson(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); const t = e.currentTarget, a = t.selectionStart, b = t.selectionEnd; const v = t.value.slice(0, a) + "  " + t.value.slice(b); onJson(v); requestAnimationFrame(() => { t.selectionStart = t.selectionEnd = a + 2; }); } }} />
              </div>
            )}
          </div>
        </section>
        <aside className="inspector" ref={list}>
          <div className="insp-scroll">
            <div className="insp-group">
              <Part bid="head" sel={sel} setSel={setSel} summary={<><span className="s-k">Machine</span><span className="s-t">{m.name}</span></>}>
                <Line label="Name" prose value={m.name} onChange={(v) => update((mm) => ({ ...mm, name: v }))} />
                <Area label="Description" prose value={m.description} rows={2} onChange={(v) => update((mm) => ({ ...mm, description: v }))} hint="Becomes the skill's description. Say when to use it." />
                <div className="pair">
                  <Line label="ID" value={m.id} onChange={(v) => update((mm) => ({ ...mm, id: v }))} />
                  <Line label="Initial" value={m.initial} onChange={(v) => update((mm) => ({ ...mm, initial: v }))} />
                </div>
              </Part>
              <Part bid="inputs" sel={sel} setSel={setSel} summary={<><span className="s-k">Inputs</span><span className="s-t mono">{Object.keys(m.inputs ?? {}).join(", ") || "None"}</span></>}>
                <Area label="Fields" value={buf("inputs", formatFields(m.inputs))} hint="One per line: name · type · required · description" onChange={(v) => edit("inputs", v, (t) => { const r = parseFields(t); update((mm) => ({ ...mm, inputs: r.value })); return r.errors; })} />
              </Part>
              <Part bid="requirements" sel={sel} setSel={setSel} summary={<><span className="s-k">Checks</span><span className="s-t mono">{(m.requirements ?? []).map((r) => r.id).join(", ") || "None"}</span></>}>
                <Area label="Checks" value={buf("requirements", formatRequirements(m.requirements))} hint="One per line: id · what must be true · how the agent checks it" onChange={(v) => edit("requirements", v, (t) => { const r = parseRequirements(t); update((mm) => ({ ...mm, requirements: r.value })); return r.errors; })} />
              </Part>
              <Part bid="credentials" sel={sel} setSel={setSel} summary={<><span className="s-k">Credentials</span><span className="s-t mono">{(m.credentials ?? []).map((c) => c.id).join(", ") || "None"}</span></>}>
                <Area label="Slots" value={buf("credentials", formatCredentials(m.credentials))} hint="One per line: id · provider · why the agent needs it. The team binds a stored credential to each slot." onChange={(v) => edit("credentials", v, (t) => { const r = parseCredentials(t, m.credentials); update((mm) => ({ ...mm, credentials: r.value })); return r.errors; })} />
                <CredentialStrip machine={m} published={!!published} />
              </Part>
            </div>
            <div className="insp-h"><span className="label">States</span><span className="quiet">{nStates}<Sep />starts at <code>{m.initial}</code></span></div>
            <div className="insp-group">
              {Object.entries(m.states).map(([sid, s]) => (
                <Part key={sid} bid={`state:${sid}`} sel={sel} setSel={setSel} summary={<><KindGlyph kind={s.kind} /><code className="s-id">{sid}</code><span className="s-t">{s.title}</span>{sid === m.initial ? <span className="tag">start</span> : null}{probStates.has(sid) ? <Block tone="waiting" size={9} /> : null}</>}>
                  <div className="pair">
                    <label className="field"><span className="k label">ID</span><input key={sid} defaultValue={sid} spellCheck={false} onBlur={(e) => renameState(sid, e.target.value.trim())} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} /></label>
                    <label className="field"><span className="k label">Kind</span>
                      <select value={s.kind} onChange={(e) => setState(sid, (st) => { st.kind = e.target.value as State["kind"]; if (st.kind === "final") { st.on = {}; st.outcome ??= "success"; } else delete st.outcome; })}>
                        <option value="task">Task</option><option value="decision">Decision</option>
                        <option value="wait">Wait for a person</option><option value="final">Final</option>
                      </select>
                    </label>
                  </div>
                  <span className="hint">{kindHint[s.kind]}</span>
                  <Line label="Title" prose value={s.title} onChange={(v) => setState(sid, (st) => { st.title = v; })} focusKey={sid} />
                  {s.kind === "final" ? (
                    <label className="field"><span className="k label">Outcome</span><select value={s.outcome ?? "success"} onChange={(e) => setState(sid, (st) => { st.outcome = e.target.value as State["outcome"]; })}><option value="success">Success</option><option value="failure">Failure</option></select></label>
                  ) : (
                    <>
                      {s.kind !== "wait" ? <Area label="Instructions" prose value={s.instructions ?? ""} onChange={(v) => setState(sid, (st) => { st.instructions = v; })} /> : null}
                      {s.kind !== "wait" ? <Area label="Report" rows={2} value={buf(`out:${sid}`, formatFields(s.output))} hint="What the agent hands over to leave: name · type · required · description" onChange={(v) => edit(`out:${sid}`, v, (t) => { const r = parseFields(t); setState(sid, (st) => { st.output = r.value; }); return r.errors; })} /> : null}
                      <Area label="Events" rows={2} value={buf(`on:${sid}`, formatEvents(s.on))} hint={s.kind === "wait" ? "event (human) → target · when" : "event → target · when to fire it"} onChange={(v) => edit(`on:${sid}`, v, (t) => { const r = parseEvents(t); if (s.kind === "wait") for (const x of Object.values(r.value)) x.actor = "human"; setState(sid, (st) => { st.on = r.value; }); return r.errors; })} />
                      {m.credentials?.length && s.kind !== "wait" ? <Line label="Credentials live here" value={buf(`cred:${sid}`, (s.credentials ?? []).join(", "))} hint="Slot ids, comma-separated. Empty means every slot is live in this state." onChange={(v) => edit(`cred:${sid}`, v, (t) => { const ids = t.split(/[,\s]+/).filter(Boolean); setState(sid, (st) => { st.credentials = ids; }); return ids.filter((x) => !m.credentials!.some((c) => c.id === x)).map((x) => `state "${sid}": no credential slot "${x}"`); })} /> : null}
                    </>
                  )}
                  <div className="blk-foot"><button type="button" className="link" onClick={() => removeState(sid)}>Remove this state</button></div>
                </Part>
              ))}
              <div className="blk add"><button type="button" className="sum" onClick={addState}>+ Add state</button></div>
            </div>
          </div>
          <ProblemList problems={problems} notes={notes} onPick={focusProblem} okText={`Nothing to fix.${dirty ? " Publish when ready." : ""}`} />
        </aside>
      </div>
    </div>
  );
}
