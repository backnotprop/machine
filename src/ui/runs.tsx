// Runs: what needs you first, then what is moving, then what ended. Rows, not a table:
// the run's path glyph, one primary line, one quiet line, the time.
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AgentMark } from "./agent-icons.tsx";
import { ahead, handle, words, machineFor, needsYou, since, span, useMachines, useMe, useMembers, useRunDetails, useRuns, type Machine, type Member, type Run, type RunSummary } from "./api.ts";
import { EmptyPath, PathGlyph, needsYouPhrase } from "./glyph.tsx";
import { PageHead, useListKeys } from "./page.tsx";
import { Rich, Sep } from "./parts.tsx";

const Chevron = () => <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M5.5 3.5 9 7l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;

/** A blocked run's first need, as the row quotes it. A credential need carries its connect link; the row keeps the sentence and drops the URL. */
export const needText = (n: string) => n.replace(/:\s*https?:\/\/\S+\s*$/, ".").replace(/\.\.$/, ".");

function Row({ r, full, m, i, sel, members, onOpen }: { r: RunSummary; full?: Run; m?: Machine; i: number; sel: boolean; members: Member[]; onOpen: (id: string) => void }) {
  const st = m?.states[r.state];
  const name = m?.name ?? r.machine.id;
  const left = ahead(m, r.state).length;
  const title = st?.title ? <span className="ell">{st.title}</span> : null;
  const credential = r.status === "blocked" && r.error?.code === "credentials_missing";
  let sub: ReactNode, ask: string | null = null;
  if (r.status === "blocked") { sub = <>Blocked at <code>{r.state}</code><Sep />{title}</>; ask = r.error?.needs?.[0] ?? r.error?.message ?? null; }
  else if (r.status === "waiting") {
    const ev = Object.keys(st?.on ?? {});
    sub = <>Your decision at <code>{r.state}</code><Sep />{title}</>;
    ask = ev.length ? `Choose ${ev.map(words).join(" or ")}.` : null;
  }
  else if (r.status === "running") sub = <>At <code>{r.state}</code><Sep />{title}{left ? <><Sep /><span className="dim">{left} step{left === 1 ? "" : "s"} to go</span></> : null}</>;
  else if (r.status === "succeeded") sub = <><span className="ell">{st?.title ?? r.state}</span><Sep /><span className="dim">took {span(r.created_at, r.updated_at)}</span></>;
  else if (r.status === "failed") sub = <>Failed at <code>{r.state}</code>{r.error ? <><Sep /><span className="dim ell">{r.error.message}</span></> : null}</>;
  else sub = <>Cancelled at <code>{r.state}</code></>;
  if (credential && ask) {
    // "Connect linear for Triage an issue (why): <url>" → the sentence, then what is missing.
    const slot = /^Connect (\S+) for /.exec(ask)?.[1];
    ask = needText(ask) + (slot ? ` Nothing is bound to its \`${slot}\` slot.` : "");
  }
  const more = (r.error?.needs?.length ?? 0) - 1;
  const by = handle(members, r.by);
  return (
    <a className={`row t-${r.status}${needsYou(r.status) ? " big" : ""}${sel ? " sel" : ""}${credential ? " cred" : ""}`} data-row={i} href={`#/runs/${r.id}`} onClick={(e) => { e.preventDefault(); onOpen(r.id); }}>
      <span className="r-glyph">{full ? <PathGlyph run={full} machine={m} width={150} /> : <EmptyPath width={150} n={4} />}</span>
      <span className="r-main">
        <span className="r-title">{name}</span>
        <span className="r-sub">{sub}</span>
        {ask ? <span className="r-ask"><Rich text={ask} /></span> : null}
        {more > 0 ? <span className="r-more">and {more} more question{more === 1 ? "" : "s"}</span> : null}
      </span>
      <span className="r-side">
        <span className="r-time">{since(r.updated_at)}</span>
        {r.agent?.name ? <span className="r-agent"><AgentMark name={r.agent.name} size={14} />{r.agent.name}{by ? <><Sep />{by}</> : null}</span> : by ? <span className="r-agent">{by}</span> : null}
        {needsYou(r.status) ? <span className="pill sm primary">{r.status === "blocked" ? "Answer" : "Decide"}<Chevron /></span> : null}
      </span>
    </a>
  );
}

export function Runs({ onOpen }: { onOpen: (id: string) => void }) {
  const runs = useRuns();
  const machines = useMachines();
  const members = useMembers();
  const { hosted } = useMe();
  const details = useRunDetails(runs.map((r) => r.id));
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 30000); return () => clearInterval(t); }, []);
  const by = (a: RunSummary, b: RunSummary) => b.updated_at.localeCompare(a.updated_at);
  const groups = [
    { key: "you", label: "Needs you", runs: runs.filter((r) => needsYou(r.status)).sort((a, b) => Number(b.status === "blocked") - Number(a.status === "blocked") || by(a, b)) },
    { key: "moving", label: "Running", runs: runs.filter((r) => r.status === "running").sort(by) },
    { key: "done", label: "Finished", runs: runs.filter((r) => ["succeeded", "failed", "cancelled"].includes(r.status)).sort(by) },
  ].filter((g) => g.runs.length);
  const flat = groups.flatMap((g) => g.runs);
  const open = useCallback((i: number) => flat[i] && onOpen(flat[i].id), [flat, onOpen]);
  const sel = useListKeys(flat.length, open);
  const nYou = groups.find((g) => g.key === "you")?.runs.length ?? 0, nRun = runs.filter((r) => r.status === "running").length;
  const sub = runs.length === 0 ? null
    : <>{nYou ? needsYouPhrase(nYou) : "Nothing needs you"}{nRun ? <><Sep />{nRun} running</> : null}<Sep />{runs.length - nYou - nRun} finished</>;
  let i = 0;
  return (
    <div className="page">
      <PageHead title="Runs" sub={sub} />
      {runs.length === 0 ? (
        <div className="empty">
          <EmptyPath n={4} />
          <p className="e-t">No runs yet</p>
          {hosted
            ? <><p>Connect an agent, publish a machine, then ask the agent to run it. Each run shows up here as it starts and stays live while it moves.</p><a className="pill" href="#/team">Connect an agent</a></>
            : <><p>Publish a machine, then ask an agent to run it, for example <code>use the changelog-draft skill</code>. Each run shows up here as it starts and stays live while it moves.</p><a className="pill" href="#/machines">Go to machines</a></>}
        </div>
      ) : groups.map((g) => (
        <section key={g.key} className="group">
          <h2 className="eyebrow label">{g.label}<span className="n">{g.runs.length}</span></h2>
          <div className="rows">{g.runs.map((r) => { const idx = i++; return <Row key={r.id} r={r} full={details.get(r.id)} m={machineFor(machines, r.machine)} i={idx} sel={sel === idx} members={members} onOpen={onOpen} />; })}</div>
        </section>
      ))}
    </div>
  );
}
