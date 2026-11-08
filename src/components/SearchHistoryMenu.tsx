import { useEffect, useRef, useState } from "react";
import type { SearchHistoryEntry } from "../store/app";
import { parseScopedQuery, scopeLabel } from "../lib/searchScope";

/** How many recent searches the list shows. */
const SHOWN = 15;

interface Props {
  entries: SearchHistoryEntry[];
  /** Run this saved search again (it may carry a scope prefix such as "nt/grace"). */
  onPick: (query: string) => void;
  onClear: () => void;
}

/**
 * The history icon in the Live Show search bar: a list of recent searches, newest
 * first. Choosing one puts it back in the search box, with its book or testament
 * filter, and runs it.
 */
export default function SearchHistoryMenu({ entries, onPick, onClear }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!open) return;
    setAnchor(wrapRef.current?.getBoundingClientRect() ?? null);
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const recent = entries.slice(0, SHOWN);

  return (
    <div ref={wrapRef} className="shrink-0">
      <button
        data-tour="live-history"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`rounded-lg px-2 py-1 flex items-center shrink-0 ${open ? "ctl-active" : "ctl text-on-surface-variant"}`}
        title="Search history — your recent searches"
        aria-label="Search history"
      >
        <span className="material-symbols-outlined text-[18px]">history</span>
      </button>

      {open && anchor && (
        <div
          role="menu"
          aria-label="Recent searches"
          className="fixed z-[200] glass rounded-xl overflow-y-auto py-1"
          style={{ left: anchor.left, top: anchor.bottom + 4, width: 340, maxHeight: Math.max(160, window.innerHeight - anchor.bottom - 24) }}
        >
          {recent.length === 0 ? (
            <p className="px-3 py-2 font-body-ui text-[12px] text-on-surface-variant leading-relaxed">
              No searches yet. A word you search for and pick a verse from is kept here.
            </p>
          ) : (
            <>
              {recent.map((entry) => {
                const scoped = parseScopedQuery(entry.query);
                return (
                  <button
                    key={entry.query}
                    role="menuitem"
                    onClick={() => { onPick(entry.query); setOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-on-surface hover:bg-surface-container-low transition-colors"
                  >
                    <span className="material-symbols-outlined text-[16px] text-on-surface-variant shrink-0" aria-hidden="true">history</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-body-ui text-[13px]">{scoped ? scoped.text : entry.query}</span>
                      {entry.selectedRef && (
                        <span className="block truncate font-metadata-mono text-[11px] text-primary">
                          {entry.selectedRef.book} {entry.selectedRef.chapter}:{entry.selectedRef.verse}
                        </span>
                      )}
                    </span>
                    {scoped && (
                      <span className="shrink-0 rounded-md px-1.5 py-0.5 bg-secondary-container text-on-secondary-container font-body-ui text-[11px] max-w-[110px] truncate">
                        {scopeLabel(scoped.scope)}
                      </span>
                    )}
                  </button>
                );
              })}
              <button
                role="menuitem"
                onClick={() => { onClear(); setOpen(false); }}
                className="w-full px-3 py-1.5 mt-1 border-t border-outline-variant text-left font-body-ui text-[12px] text-error hover:bg-error-container/20 transition-colors"
              >
                Clear history
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
