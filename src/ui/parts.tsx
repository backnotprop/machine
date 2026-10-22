// Small shared pieces: the separator, prose with inline code, the clamp, key/value, quotes, counts.
// One implementation each, so every screen says things the same way.
import { Fragment, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Marked, type Tokens } from "marked";
import { Block } from "./glyph.tsx";

/** The dot between phrases: a 3px block, the mark's vocabulary at its smallest. */
export const Sep = () => <span className="sep" aria-hidden="true" />;

/** Joins phrases with Sep, skipping empty ones. */
export function Phrases({ children }: { children: ReactNode[] }) {
  const parts = children.filter((c) => c !== null && c !== undefined && c !== false && c !== "");
  return <>{parts.map((p, i) => <Fragment key={i}>{i ? <Sep /> : null}{p}</Fragment>)}</>;
}

/** Prose with `backtick` spans set as code, and "quoted" ids from the engine set as code. */
export function Rich({ text, quotes = false }: { text: string; quotes?: boolean }) {
  const re = quotes ? /`([^`]+)`|"([a-z0-9_-]+)"/g : /`([^`]+)`/g;
  const out: ReactNode[] = []; let last = 0, m: RegExpExecArray | null, k = 0;
  while ((m = re.exec(text))) { if (m.index > last) out.push(text.slice(last, m.index)); out.push(<code key={k++}>{m[1] ?? m[2]}</code>); last = m.index + m[0].length; }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

/** Long prose folds to a few lines with a quiet way to read the rest. CSS does the folding; nothing is cut in JS. */
export function Clamp({ text, lines = 3 }: { text: string; lines?: number }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false), [over, setOver] = useState(false);
  useLayoutEffect(() => { const el = ref.current; if (el && !open) setOver(el.scrollHeight > el.clientHeight + 2); }, [text, open]);
  return (
    <div className="clamp">
      <p ref={ref} style={open ? undefined : { WebkitLineClamp: lines }} className={open ? "" : "clamped"}><Rich text={text} /></p>
      {over || open ? <button className="link" onClick={() => setOpen(!open)}>{open ? "Show less" : "Read all"}</button> : null}
    </div>
  );
}

export const Quote = ({ children }: { children: ReactNode }) => <q className="quote">{children}</q>;
export const Count = ({ n }: { n: number }) => <span className="count">{n}</span>;
export const Quiet = ({ children }: { children: ReactNode }) => <p className="quiet">{children}</p>;

const fmt = (v: unknown) => (Array.isArray(v) ? v.map(String).join(", ") : typeof v === "object" && v ? JSON.stringify(v) : String(v));
// Values that are names the tool uses (ids, paths, URLs, numbers, flags, lists of those) are code; sentences are prose.
const isCode = (v: unknown) => typeof v === "number" || typeof v === "boolean" || (Array.isArray(v) ? v.every((x) => !/\s/.test(String(x))) : typeof v === "object" && v !== null ? true : !/\s/.test(String(v)));

/** Key/value. `inset` for payloads (a recessed surface), `stacked` for the facts column. Keys are the tool's names, so mono. */
export function KV({ obj, variant = "inset" }: { obj: Record<string, unknown>; variant?: "inset" | "stacked" }) {
  const e = Object.entries(obj);
  if (!e.length) return null;
  return (
    <dl className={`kv ${variant}`}>
      {e.map(([k, v]) => { const t = fmt(v); return <div key={k}><dt>{k}</dt><dd className={isCode(v) ? "code" : "prose"}>{t === "" ? <span className="dim">empty</span> : t}</dd></div>; })}
    </dl>
  );
}

/** Facts: sentence-case labels over values. */
export function Facts({ rows }: { rows: [string, ReactNode, boolean?][] }) {
  return (
    <dl className="kv stacked">
      {rows.map(([k, v, code]) => <div key={k}><dt className="lbl">{k}</dt><dd className={code ? "code" : ""}>{v}</dd></div>)}
    </dl>
  );
}

// Markdown from an agent or the skill: rendered, with raw HTML shown as text.
const md = new Marked({ gfm: true, renderer: { html: (t: Tokens.HTML | Tokens.Tag) => t.text.replace(/&/g, "&amp;").replace(/</g, "&lt;") } });
export function Markdown({ text, className = "md" }: { text: string; className?: string }) {
  const html = useMemo(() => md.parse(text) as string, [text]);
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** The problems footer the editor and the describe screen share: what stops publishing, then notes on what changed. */
export function ProblemList({ problems, notes = [], onPick, okText = "Nothing to fix." }: { problems: string[]; notes?: string[]; onPick?: (p: string) => void; okText?: string }) {
  const [all, setAll] = useState(false);
  return (
    <div className="problems" role="status">
      {problems.length ? (
        <><span className="p-h"><Block tone="waiting" size={9} />{problems.length} problem{problems.length > 1 ? "s" : ""} before you can publish</span>
          {(all ? problems : problems.slice(0, 4)).map((p, i) => <button type="button" className="p" key={i} onClick={() => onPick?.(p)}><Rich text={p[0].toUpperCase() + p.slice(1)} quotes /></button>)}
          {problems.length > 4 ? <button type="button" className="link" onClick={() => setAll(!all)}>{all ? "Show fewer" : `Show ${problems.length - 4} more`}</button> : null}</>
      ) : <span className="quiet">{okText}</span>}
      {notes.map((n, i) => <span className="p-note" key={`n${i}`}><Rich text={n} /></span>)}
    </div>
  );
}
