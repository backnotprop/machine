// Machines: each row carries the machine's own shape, with the steps where its live runs stand lit.
import { useCallback, useEffect, useRef, useState } from "react";
import { api, latestOf, needsYou, since, useRuns, type Machine } from "./api.ts";
import { Thumb, type Tone } from "./graph.tsx";
import { Block, EmptyPath, needsYouPhrase } from "./glyph.tsx";
import { PageHead, useListKeys } from "./page.tsx";
import { Sep } from "./parts.tsx";

export function Machines({ onOpen, onNew }: { onOpen: (id: string) => void; onNew: () => void }) {
  const [machines, setMachines] = useState<Machine[] | null>(null);
  const runs = useRuns();
  useEffect(() => { api.machines().then(setMachines); }, []);
  const latest = latestOf(machines ?? []).sort((a, b) => {
    const la = runs.find((r) => r.machine.id === a.id)?.updated_at ?? "", lb = runs.find((r) => r.machine.id === b.id)?.updated_at ?? "";
    return lb.localeCompare(la) || a.name.localeCompare(b.name);
  });
  const open = useCallback((i: number) => latest[i] && onOpen(latest[i].id), [latest, onOpen]);
  const extra = useCallback((e: KeyboardEvent) => { if (e.key === "n") onNew(); }, [onNew]);
  const sel = useListKeys(latest.length, open, extra);
  const empty = machines && latest.length === 0;
  // Import: a machine.json from a published skill folder, an example, or another team; opens the machine when it lands.
  const file = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const importFile = async (f: File | undefined) => {
    if (!f) return; setProblem(null);
    try { const m = JSON.parse(await f.text()); const r = await api.importMachine(m); onOpen(r.id); }
    catch (e) { setProblem(e instanceof Error ? e.message : "not a machine.json"); }
    if (file.current) file.current.value = "";
  };
  const importBtn = <button className="pill" onClick={() => file.current?.click()}>Import</button>;
  const input = <input ref={file} type="file" accept=".json,application/json" hidden onChange={(e) => importFile(e.target.files?.[0])} />;
  return (
    <div className="page">
      <PageHead title="Machines" sub="The processes your agents follow. Publish one and it becomes a skill."
        actions={empty ? undefined : <>{importBtn}<button className="pill primary" onClick={onNew}>New machine</button></>} />
      {input}
      {problem ? <p className="problem" role="alert">Import failed: {problem}</p> : null}
      {empty ? (
        <div className="empty"><EmptyPath n={4} /><p className="e-t">No machines yet</p><p>A machine is a process an agent follows: states, the events between them, and what to report at each. Describe your first one and watch it take shape.</p><div className="actions">{importBtn}<button className="pill primary" onClick={onNew}>New machine</button></div></div>
      ) : (
        <div className="rows">
          {latest.map((m, i) => {
            const mine = runs.filter((r) => r.machine.id === m.id);
            const live = mine.filter((r) => r.status === "running" || needsYou(r.status));
            const lit = new Map<string, Tone>(live.map((r) => [r.state, r.status as Tone]));
            const you = mine.filter((r) => needsYou(r.status)).sort((a, b) => Number(b.status === "blocked") - Number(a.status === "blocked"));
            const states = Object.keys(m.states).length;
            // The row is one link (stretched over the row); the "needs you" link sits above it, so nothing interactive is nested.
            return (
              <div key={m.id} className={`row mrow${sel === i ? " sel" : ""}`} data-row={i}>
                <span className="r-thumb"><Thumb machine={m} lit={lit} /></span>
                <span className="r-main">
                  <a className="r-title row-link" href={`#/machines/${m.id}`} onClick={(e) => { e.preventDefault(); onOpen(m.id); }}>{m.name}</a>
                  <span className="r-sub"><span className="ell">{m.description}</span></span>
                </span>
                <span className="r-side">
                  {you.length ? <a className="r-flag" href={`#/runs/${you[0].id}`}><Block tone={you[0].status} size={9} />{needsYouPhrase(you.length)}<span className="arrow" aria-hidden="true">→</span></a>
                    : <span className="r-time">{mine[0] ? `ran ${since(mine[0].updated_at)}` : "never run"}</span>}
                  <span className="r-meta">{states} states<Sep />{mine.length} run{mine.length === 1 ? "" : "s"}<Sep />v{m.version}</span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
