import { useEffect, useMemo, useRef, useState } from "react";
import { BOOK_GROUPS } from "../lib/books";
import { findBooks } from "../data/books";
import { sameScope, scopeLabel, scopesLabel, type SearchScope } from "../lib/searchScope";

interface Props {
  /** Active filters; a verse matching any one of them is included. */
  filters: SearchScope[];
  /** Add the filter, or remove it if it is already active. */
  onToggle: (scope: SearchScope) => void;
  onRemove: (scope: SearchScope) => void;
  onClear: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recent: SearchScope[];
  wholeWord: boolean;
  onWholeWordChange: (on: boolean) => void;
}

const OT_SCOPE: SearchScope = { kind: "testament", testament: "OT" };
const NT_SCOPE: SearchScope = { kind: "testament", testament: "NT" };
const bookScope = (book: string): SearchScope => ({ kind: "books", books: [book], label: book });

/**
 * Filter button for the Live Show search bar. It shows the filter icon, or the number of
 * active filters once there are any. Its popup lists the active filters (remove one, or
 * clear all) above a picker for OT / NT / books, with type-to-find (`rom`), arrow keys and
 * Enter, recently used filters, and a whole-word toggle. Picking toggles, so several can be
 * active at once. Open it from the search box with Alt+F.
 */
export default function SearchScopeMenu({ filters, onToggle, onRemove, onClear, open, onOpenChange, recent, wholeWord, onWholeWordChange }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const findRef = useRef<HTMLInputElement>(null);
  const [find, setFind] = useState("");
  const [cursor, setCursor] = useState(0);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const count = filters.length;
  const active = count > 0 || wholeWord;

  useEffect(() => {
    if (!open) return;
    setFind("");
    setCursor(0);
    setAnchor(wrapRef.current?.getBoundingClientRect() ?? null);
    findRef.current?.focus();
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) onOpenChange(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, onOpenChange]);

  // The flat, keyboard-navigable list of choices, narrowed by the find box.
  const items = useMemo(() => {
    const q = find.trim().toLowerCase();
    const matches = new Set(q ? findBooks(q) : []);
    const keep = (book: string) => !q || matches.has(book) || book.toLowerCase().includes(q);
    const quick: { label: string; scope: SearchScope }[] = [
      { label: "Old Testament", scope: OT_SCOPE },
      { label: "New Testament", scope: NT_SCOPE },
    ].filter((i) => !q || i.label.toLowerCase().includes(q) || (q === "ot" && i.scope === OT_SCOPE) || (q === "nt" && i.scope === NT_SCOPE));
    const groups = BOOK_GROUPS
      .map((g) => ({ label: g.label, books: g.books.filter(keep) }))
      .filter((g) => g.books.length > 0);
    const flat = [...quick.map((i) => i.scope), ...groups.flatMap((g) => g.books.map(bookScope))];
    return { quick, groups, flat };
  }, [find]);

  // Stays open so several filters can be picked in a row.
  function choose(next: SearchScope) {
    onToggle(next);
  }

  function onFindKey(e: React.KeyboardEvent) {
    const n = items.flat.length;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); setCursor((c) => (c + 1) % Math.max(n, 1)); }
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); setCursor((c) => (c - 1 + n) % Math.max(n, 1)); }
    else if (e.key === "Enter") { e.preventDefault(); if (items.flat[cursor]) choose(items.flat[cursor]); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onOpenChange(false); }
  }

  const isCursor = (s: SearchScope) => items.flat[cursor] !== undefined && sameScope(items.flat[cursor], s);
  const rowCls = (s: SearchScope, extra: string) =>
    `${extra} ${filters.some((f) => sameScope(f, s)) ? "btn-primary" : isCursor(s) ? "bg-secondary-container text-on-secondary-container" : "text-on-surface hover:bg-surface-container-high"}`;

  return (
    <div ref={wrapRef} className="absolute right-1 inset-y-0 flex items-center">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-pressed={active}
        aria-expanded={open}
        aria-label={count ? `${count} search ${count === 1 ? "filter" : "filters"} active: ${scopesLabel(filters)}` : "Search filters"}
        title={`${count ? `${scopesLabel(filters)} — ` : ""}Filter search (Alt+F, or type /john then Space, /c for this chapter)`}
        className={`rounded-md p-0.5 flex items-center justify-center min-w-[22px] ${active ? "text-primary" : "text-on-surface-variant hover:text-on-surface"}`}
      >
        {count > 0
          ? <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-on-primary font-body-ui font-bold text-[11px] leading-[18px] text-center">{count}</span>
          : <span className="material-symbols-outlined text-[18px]">filter_list</span>}
      </button>

      {open && anchor && (
        // Fixed so the console's clipped containers can't cut it off; opens upward from the icon.
        <div
          className="fixed z-[210] w-[340px] max-w-[90vw] overflow-y-auto p-2.5 bg-surface-container border border-outline-variant shadow-xl rounded-2xl"
          style={{
            right: Math.max(8, window.innerWidth - anchor.right),
            bottom: window.innerHeight - anchor.top + 8,
            maxHeight: Math.min(360, Math.max(160, anchor.top - 16)),
          }}
        >
          {count > 0 && (
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <span className="font-body-ui font-medium text-[12px] text-on-surface-variant">Active filters · matches any</span>
                <button type="button" onClick={onClear} className="font-body-ui font-medium text-[12px] text-primary hover:underline">Clear all</button>
              </div>
              <div className="flex flex-wrap gap-1">
                {filters.map((f) => (
                  <span key={JSON.stringify(f)} className="flex items-center gap-1 rounded-lg pl-2 pr-1 py-0.5 bg-secondary-container text-on-secondary-container font-body-ui text-[12px]">
                    {scopeLabel(f)}
                    <button type="button" onClick={() => onRemove(f)} aria-label={`Remove ${scopeLabel(f)} filter`} className="flex items-center">
                      <span className="material-symbols-outlined text-[14px] leading-none">close</span>
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          <input
            ref={findRef}
            value={find}
            onChange={(e) => { setFind(e.target.value); setCursor(0); }}
            onKeyDown={onFindKey}
            placeholder="Find a book… (Enter to pick)"
            spellCheck={false}
            autoComplete="off"
            className="w-full mb-3 px-2 py-1 rounded-lg field font-body-ui text-[12px] focus:outline-none"
          />

          {!find && recent.length > 0 && (
            <div className="mb-3">
              <div className="font-body-ui font-medium text-[12px] text-on-surface-variant mb-1">Recent</div>
              <div className="flex flex-wrap gap-1">
                {recent.map((r) => (
                  <button key={JSON.stringify(r)} onClick={() => choose(r)} className={rowCls(r, "px-2 py-0.5 rounded-md font-body-ui text-[12px]")}>
                    {scopeLabel(r)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-1 mb-3 flex-wrap">
            {items.quick.map((i) => (
              <button key={i.label} className={rowCls(i.scope, "px-2.5 py-0.5 rounded-md font-body-ui text-[12px] font-medium")} onClick={() => choose(i.scope)}>
                {i.label}
              </button>
            ))}
          </div>

          {items.groups.map((group) => (
            <div key={group.label} className="mb-2">
              <div className="font-body-ui font-medium text-[12px] text-on-surface-variant mb-1">{group.label}</div>
              <div className="flex flex-wrap gap-x-1 gap-y-0.5">
                {group.books.map((book) => (
                  <button key={book} onClick={() => choose(bookScope(book))} className={rowCls(bookScope(book), "px-1.5 py-0.5 rounded font-body-ui text-[12px]")}>
                    {book}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {items.flat.length === 0 && <p className="font-body-ui text-[12px] text-on-surface-variant">No matching book.</p>}

          <label className="mt-2 pt-2 border-t border-outline-variant flex items-center gap-2 cursor-pointer font-body-ui text-[12px] text-on-surface">
            <input type="checkbox" className="accent-primary" checked={wholeWord} onChange={(e) => onWholeWordChange(e.target.checked)} />
            Whole words only <span className="text-on-surface-variant">("love" won't match "loved"; quote "a phrase" for exact wording)</span>
          </label>
        </div>
      )}
    </div>
  );
}
