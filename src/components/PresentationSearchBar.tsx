import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useAppStore, type VerseRef } from "../store/app";
import { api, type SearchResult } from "../lib/tauri";
import { sanitizeSnippet } from "../lib/sanitize";
import { routeQuery, ASK_PREFIX, WORD_PREFIX, type QueryRoute } from "../lib/searchRouting";
import { useScriptureInput } from "../hooks/useScriptureInput";
import { useAiSearchStore } from "../store/aiSearchStore";
import {
  ALL_SCOPE, loadRecentScopes, parseScopedQuery, rememberScope, scopeLabel, scopeOptions, scopePrefix,
  type SearchScope,
} from "../lib/searchScope";
import ScriptureSuggestions from "./ScriptureSuggestions";
import SearchScopeMenu from "./SearchScopeMenu";

export interface PresentationSearchBarHandle {
  /** Focus the search input. */
  focus: () => void;
}

interface Props {
  baseRef: VerseRef;
  onNavigate: (ref: VerseRef) => void;
}

const PAGE_SIZE = 40;

const ROUTE_UI: Record<QueryRoute["kind"], { icon: string; label: string }> = {
  empty: { icon: "auto_stories", label: "" },
  reference: { icon: "auto_stories", label: "Verse" },
  word: { icon: "search", label: "Text" },
  ask: { icon: "auto_awesome", label: "Ask AI" },
};

/**
 * The Live Show console's search bar: one input, no modes. What's typed decides what
 * happens (see lib/searchRouting.ts), and the icon and tag at the right edge show what
 * it decided. `jn 3:16` jumps to a verse, `love your enemies` searches the text,
 * `/john` forces a text search, `nt/grace` or `john,romans/grace` limit it to those books,
 * `"good shepherd"` matches an exact phrase, and `? verses about hope` asks the AI.
 */
const PresentationSearchBar = forwardRef<PresentationSearchBarHandle, Props>(function PresentationSearchBar(
  { baseRef, onNavigate }, ref,
) {
  const { primaryModule, showStrongs, setShowStrongs } = useAppStore();
  const aiOpen = useAiSearchStore((s) => s.open);

  // Same persistence path as Settings → "Show Strong's numbers".
  function toggleStrongs() {
    const next = !showStrongs;
    setShowStrongs(next);
    api.setPreferences({ show_strongs: next }).catch(() => {});
  }

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [settled, setSettled] = useState("");
  const [active, setActive] = useState(0);
  const [menuScope, setMenuScope] = useState<SearchScope>(ALL_SCOPE);
  const [menuOpen, setMenuOpen] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [recentScopes, setRecentScopes] = useState<SearchScope[]>(loadRecentScopes);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const pageRef = useRef(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }));

  const route = useMemo(() => routeQuery(value), [value]);
  const ui = ROUTE_UI[route.kind];
  const nav = useScriptureInput({ value, setValue, setOpen, inputRef, baseRef, goTo: onNavigate });
  const isReference = route.kind === "reference";
  const wordText = route.kind === "word" ? route.text : "";
  // A typed prefix (ot/, john/) wins over the filter menu's selection.
  const scope: SearchScope = route.kind === "word" && route.scope ? route.scope : menuScope;
  const scopeKey = JSON.stringify(scope);

  // Debounced word search against the current Bible module.
  useEffect(() => {
    pageRef.current = 0;
    if (!wordText || !primaryModule) { setResults([]); setSettled(""); setHasMore(false); return; }
    let cancelled = false;
    const timer = setTimeout(() => {
      api.search(wordText, { modules: [primaryModule], page_size: PAGE_SIZE, whole_word: wholeWord, ...scopeOptions(scope) })
        .then((r) => { if (!cancelled) { setResults(r); setActive(0); setHasMore(r.length === PAGE_SIZE); } })
        .catch(() => { if (!cancelled) { setResults([]); setHasMore(false); } })
        .finally(() => { if (!cancelled) setSettled(wordText); });
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wordText, primaryModule, scopeKey, wholeWord]);

  function loadMore() {
    if (!hasMore || loadingMore || !primaryModule) return;
    const next = pageRef.current + 1;
    setLoadingMore(true);
    api.search(wordText, { modules: [primaryModule], page: next, page_size: PAGE_SIZE, whole_word: wholeWord, ...scopeOptions(scope) })
      .then((r) => { pageRef.current = next; setResults((prev) => [...prev, ...r]); setHasMore(r.length === PAGE_SIZE); })
      .catch(() => setHasMore(false))
      .finally(() => setLoadingMore(false));
  }

  function changeScope(next: SearchScope) {
    setMenuScope(next);
    setRecentScopes(rememberScope(next));
    inputRef.current?.focus();
  }

  function reset() {
    setValue("");
    setResults([]);
    setOpen(false);
  }

  function pick(r: SearchResult) {
    // Saved with its scope prefix so the history view can re-run it scoped.
    if (wordText) useAppStore.getState().addToSearchHistory(scopePrefix(scope) + wordText);
    onNavigate({ book: r.book, chapter: r.chapter, verse: r.verse });
    reset();
  }

  function askAi() {
    if (route.kind !== "ask") return;
    useAiSearchStore.getState().ask(route.text);
    reset();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") { reset(); return; }
    if (e.altKey && e.code === "KeyF") { e.preventDefault(); setMenuOpen((o) => !o); return; }
    // Backspace on an empty box drops the scope chip.
    if (e.key === "Backspace" && !value && menuScope.kind !== "all") { setMenuScope(ALL_SCOPE); return; }

    if (isReference) {
      if (e.key === " ") nav.handleSpace(e);
      else if (e.key === "Enter" && nav.canNavigate) { e.preventDefault(); nav.navigate(); }
    } else if (route.kind === "word") {
      if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
      else if (e.key === "Enter" && results[active]) { e.preventDefault(); pick(results[active]); }
    } else if (route.kind === "ask" && e.key === "Enter") {
      e.preventDefault();
      askAi();
    }
  }

  // A full book name with no chapter ("john") is ambiguous with a word; Enter opens the
  // book, and this row says how to search the text for it instead.
  const bookOnly = isReference && nav.matchedBook && !nav.previewText && value.trim().toLowerCase() === nav.matchedBook.toLowerCase()
    ? nav.matchedBook
    : null;

  return (
    <div className="flex items-center gap-2 min-w-0">
      <button
        data-tour="live-strongs"
        onClick={toggleStrongs}
        aria-pressed={showStrongs}
        className={`rounded-lg px-2 py-1 flex items-center gap-1.5 shrink-0 ${showStrongs ? "ctl-active" : "ctl text-on-surface-variant"}`}
        title={showStrongs ? "Strong's concordance on — click to turn off" : "Strong's concordance off — click to turn on"}
        aria-label={`Strong's concordance ${showStrongs ? "on" : "off"}`}
      >
        <span className="material-symbols-outlined text-[18px]">tag</span>
        <span className="font-body-ui font-medium text-[12px] hidden xl:inline">Strong's</span>
      </button>

      <button
        data-tour="live-ask"
        onClick={() => useAiSearchStore.getState().toggle()}
        aria-pressed={aiOpen}
        className={`rounded-lg px-2 py-1 flex items-center gap-1.5 shrink-0 ${aiOpen ? "ctl-active" : "ctl text-on-surface-variant"}`}
        title="Ask Scripture — find verses by describing them (Ctrl+Shift+K, or start the search bar with ?)"
        aria-label={`Ask Scripture ${aiOpen ? "open" : "closed"}`}
      >
        <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
        <span className="font-body-ui font-medium text-[12px] hidden xl:inline">Ask</span>
      </button>

      {menuScope.kind !== "all" && (
        <span className="shrink-0 flex items-center gap-1 rounded-lg pl-2 pr-1 py-1 bg-secondary-container text-on-secondary-container font-body-ui text-[12px] max-w-[160px]">
          <span className="truncate">{scopeLabel(menuScope)}</span>
          <button
            type="button"
            onClick={() => { setMenuScope(ALL_SCOPE); inputRef.current?.focus(); }}
            aria-label={`Remove ${scopeLabel(menuScope)} filter`}
            className="flex items-center"
          >
            <span className="material-symbols-outlined text-[14px] leading-none">close</span>
          </button>
        </span>
      )}

      <div className="relative flex-1 min-w-[220px]">
        <span className={`material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-[18px] pointer-events-none select-none ${route.kind === "ask" ? "text-primary" : "text-on-surface-variant"}`}>
          {ui.icon}
        </span>
        <input
          ref={inputRef}
          className="w-full pl-8 pr-24 py-1 focus:outline-none text-body-ui font-body-ui transition-colors placeholder:text-on-surface-variant field rounded-lg"
          placeholder={`Verse (jn 3:16), a word, or ${ASK_PREFIX} to ask  (Ctrl+K)`}
          value={value}
          onChange={(e) => {
            // "ot/" or "john,romans/" typed: lift the scope out of the text into the chip.
            const scoped = parseScopedQuery(e.target.value.trimStart());
            if (scoped) {
              changeScope(scoped.scope);
              setValue(scoped.text);
            } else {
              setValue(e.target.value);
            }
            setRect(inputRef.current?.getBoundingClientRect() ?? null);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          onFocus={() => { setRect(inputRef.current?.getBoundingClientRect() ?? null); setOpen(true); }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          spellCheck={false}
          autoComplete="off"
        />
        {ui.label && (
          <span className={`absolute right-9 top-1/2 -translate-y-1/2 font-body-ui font-medium text-[12px] pointer-events-none select-none ${route.kind === "ask" ? "text-primary" : "text-on-surface-variant"}`}>
            {ui.label}
          </span>
        )}

        <SearchScopeMenu
          scope={menuScope}
          onChange={changeScope}
          open={menuOpen}
          onOpenChange={setMenuOpen}
          recent={recentScopes}
          wholeWord={wholeWord}
          onWholeWordChange={setWholeWord}
        />

        {open && isReference && !bookOnly && (
          <ScriptureSuggestions
            suggestions={nav.suggestions}
            previewText={nav.previewText}
            showDropdown={nav.showDropdown}
            onPick={nav.applyBook}
          />
        )}

        {open && bookOnly && (
          <Hint icon="arrow_forward" kbd="Enter">
            <span className="text-primary">{bookOnly} 1</span>
            <span className="text-on-surface-variant ml-2">· {WORD_PREFIX}{value.trim().toLowerCase()} searches the text</span>
          </Hint>
        )}

        {open && route.kind === "ask" && (
          <Hint icon="auto_awesome" kbd="Enter">
            {route.text
              ? <span className="text-primary truncate">Ask: “{route.text}”</span>
              : <span className="text-on-surface-variant">Describe what you're looking for, e.g. {ASK_PREFIX} verses about hope</span>}
          </Hint>
        )}

        {open && route.kind === "word" && !wordText && route.scope && (
          <Hint icon="filter_list" kbd="Type">
            <span className="text-primary">{scopeLabel(route.scope)}</span>
            <span className="text-on-surface-variant ml-2">· type a word to search only here</span>
          </Hint>
        )}

        {open && route.kind === "word" && wordText && rect && (
          <div
            data-tour="live-search-results"
            className="fixed z-[200] glass rounded-xl overflow-y-auto"
            style={{ left: rect.left, top: rect.bottom + 4, width: Math.max(rect.width, 420), maxHeight: Math.max(160, window.innerHeight - rect.bottom - 24) }}
          >
            {settled !== wordText && results.length === 0 ? (
              <p className="px-3 py-2 font-body-ui text-[12px] text-on-surface-variant">Searching…</p>
            ) : results.length === 0 ? (
              <p className="px-3 py-2 font-body-ui text-[12px] text-on-surface-variant">No matches in {scope.kind === "all" ? primaryModule : `${scopeLabel(scope)} (${primaryModule})`}.</p>
            ) : (
              <>
              <p className="px-3 pt-1.5 pb-0.5 font-metadata-mono text-[10px] uppercase tracking-widest text-on-surface-variant">
                {results.length}{hasMore ? "+" : ""} {results.length === 1 && !hasMore ? "match" : "matches"} · {scopeLabel(scope)}{wholeWord ? " · whole words" : ""}
              </p>
              {results.map((r, i) => (
                <button
                  key={`${r.book}-${r.chapter}-${r.verse}`}
                  onMouseDown={(e) => { e.preventDefault(); pick(r); }}
                  onMouseEnter={() => setActive(i)}
                  className={`w-full text-left px-3 py-1.5 transition-colors ${i === active ? "bg-secondary-container text-on-secondary-container" : "text-on-surface hover:bg-surface-container-low"}`}
                >
                  <span className="font-metadata-mono text-[12px] font-bold text-primary mr-2">{r.book} {r.chapter}:{r.verse}</span>
                  <span
                    className="font-body-ui text-[12px] line-clamp-2 [&_mark]:bg-primary/25 [&_mark]:text-inherit [&_mark]:rounded-sm"
                    dangerouslySetInnerHTML={{ __html: sanitizeSnippet(r.text) }}
                  />
                </button>
              ))}
              {hasMore && (
                <button
                  onMouseDown={(e) => { e.preventDefault(); loadMore(); }}
                  disabled={loadingMore}
                  className="w-full px-3 py-1.5 font-body-ui text-[12px] text-primary hover:bg-surface-container-low"
                >
                  {loadingMore ? "Loading…" : "Load more"}
                </button>
              )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

function Hint({ icon, kbd, children }: { icon: string; kbd: string; children: React.ReactNode }) {
  return (
    <div className="absolute top-full left-0 right-0 mt-1 z-[200] px-3 py-1.5 flex items-center gap-2 glass rounded-2xl font-body-ui text-body-ui">
      <span className="material-symbols-outlined text-[14px] text-primary shrink-0">{icon}</span>
      <span className="min-w-0 truncate">{children}</span>
      <kbd className="font-metadata-mono text-[12px] text-secondary ml-auto shrink-0 bg-surface-container px-1.5 py-0.5 rounded">{kbd}</kbd>
    </div>
  );
}

export default PresentationSearchBar;
