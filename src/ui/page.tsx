// The page head every screen uses: a back link that names where it goes, one title, one quiet line, actions on the right.
import type { ReactNode } from "react";

export function PageHead({ back, title, sub, actions }: { back?: { label: string; href: string }; title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="top">
      {back ? <a className="back" href={back.href}><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M8.5 3.5 5 7l3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>{back.label}</a> : null}
      <div className="head-row">
        <div className="head-text"><h1>{title}</h1>{sub ? <div className="sub">{sub}</div> : null}</div>
        {actions ? <div className="actions">{actions}</div> : null}
      </div>
    </header>
  );
}

// Lists move with j/k (or arrows) and open with Enter; the selection is drawn only once a key was pressed.
import { useEffect, useState } from "react";
export function useListKeys(count: number, open: (i: number) => void, extra?: (e: KeyboardEvent) => void) {
  const [sel, setSel] = useState(-1);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches("input,textarea,select") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "j" || e.key === "ArrowDown") { e.preventDefault(); setSel((i) => Math.min(i + 1, count - 1)); }
      else if (e.key === "k" || e.key === "ArrowUp") { e.preventDefault(); setSel((i) => Math.max(i - 1, 0)); }
      else if (e.key === "Enter" && sel >= 0) open(sel);
      else extra?.(e);
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [count, sel, open, extra]);
  useEffect(() => { if (sel >= 0) document.querySelector(`[data-row="${sel}"]`)?.scrollIntoView({ block: "nearest" }); }, [sel]);
  return sel;
}
