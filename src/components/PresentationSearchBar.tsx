import { forPlatform } from "../lib/platform";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useAppStore, type VerseRef } from "../store/app";
import { api, type SearchResult } from "../lib/tauri";
import { sanitizeSnippet } from "../lib/sanitize";
import { routeQuery, ASK_PREFIX, WORD_PREFIX, type QueryRoute } from "../lib/searchRouting";
import { useScriptureInput } from "../hooks/useScriptureInput";
import { useAiSearchStore } from "../store/aiSearchStore";
import { useSearchFilterStore } from "../store/searchFilterStore";
import {
  loadRecentScopes, parseScopedQuery, parseSlashScope, rememberScope, sameScope, scopeLabel, scopesLabel, scopesOptions,
  scopesPrefix, slashCandidates, type SearchScope,
} from "../lib/searchScope";
import ScriptureSuggestions from "./ScriptureSuggestions";
import SearchHistoryMenu from "./SearchHistoryMenu";
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
  const { primaryModule, showStrongs, setShowStrongs, searchHistory, clearSearchHistory } = useAppStore();
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
  const [filters, setFilters] = useState<SearchScope[]>([]);
  const [slashActive, setSlashActive] = useState(0);
  const [slashMoved, setSlashMoved] = useState(false);
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
  // A typed prefix (ot/, john/) counts as one more filter alongside the chosen ones.
  const scopes: SearchScope[] = route.kind === "word" && route.scope && !filters.some((f) => sameScope(f, route.scope!))
    ? [...filters, route.scope]
    : filters;
  const scopeKey = JSON.stringify(scopes);
  useEffect(() => {
    useSearchFilterStore.getState().setCount(filters.length);
    return () => useSearchFilterStore.getState().setCount(0);
  }, [filters.length]);
  // "/1pe", "/c": what the text after the slash could mean as a filter, shown as you type.
  const candidates = useMemo(() => slashCandidates(value, baseRef), [value, baseRef.book, baseRef.chapter]);
  const exactSlash = useMemo(() => parseSlashScope(value, baseRef), [value, baseRef.book, baseRef.chapter]);
  const showCandidates = open && candidates.length > 0;
  useEffect(() => { setSlashActive(0); setSlashMoved(false); }, [value]);

  // Debounced word search against the current Bible module.
  useEffect(() => {
    pageRef.current = 0;
    if (!wordText || !primaryModule) { setResults([]); setSettled(""); setHasMore(false); return; }
    let cancelled = false;
    const timer = setTimeout(() => {
      api.search(wordText, { modules: [primaryModule], page_size: PAGE_SIZE, whole_word: wholeWord, ...scopesOptions(scopes) })
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
    api.search(wordText, { modules: [primaryModule], page: next, page_size: PAGE_SIZE, whole_word: wholeWord, ...scopesOptions(scopes) })
      .then((r) => { pageRef.current = next; setResults((prev) => [...prev, ...r]); setHasMore(r.length === PAGE_SIZE); })
      .catch(() => setHasMore(false))
      .finally(() => setLoadingMore(false));
  }

  /** Add a filter (no-op if already active). */
  function addFilter(next: SearchScope) {
    setFilters((cur) => (cur.some((f) => sameScope(f, next)) ? cur : [...cur, next]));
    setRecentScopes(rememberScope(next));
    inputRef.current?.focus();
  }

  function toggleFilter(next: SearchScope) {
    if (filters.some((f) => sameScope(f, next))) setFilters(filters.filter((f) => !sameScope(f, next)));
    else addFilter(next);
  }

  function commitCandidate(c: SearchScope) {
    addFilter(c);
    setValue("");
    setResults([]);
  }

  /** Run a saved search again, with its book or testament filter if it had one. */
  function runHistory(query: string) {
    const scoped = parseScopedQuery(query);
    if (scoped) {
      setFilters([scoped.scope]);
      setRecentScopes(rememberScope(scoped.scope));
      setValue(scoped.text);
    } else {
      setValue(query);
    }
    setRect(inputRef.current?.getBoundingClientRect() ?? null);
    setOpen(true);
    inputRef.current?.focus();
  }

  function reset() {
    setValue("");
    setResults([]);
    setOpen(false);
  }

  function pick(r: SearchResult) {
    // Saved with its scope prefix so the history view can re-run it scoped.
    if (wordText) useAppStore.getState().addToSearchHistory(scopesPrefix(scopes) + wordText);
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
    if (e.altKey && e.shiftKey && e.code === "KeyF") { e.preventDefault(); setFilters([]); setMenuOpen(false); return; }
    if (e.altKey && e.code === "KeyF") { e.preventDefault(); setMenuOpen((o) => !o); return; }
    // Backspace on an empty box drops the scope chip.
    if (e.key === "Backspace" && !value && filters.length > 0) { setFilters(filters.slice(0, -1)); return; }

    // "/john", "/nt", "/c" shows matching filters as you type. Arrows move, Space or Enter
    // adds one. Space only commits when the text names a filter outright (or you arrowed to
    // one), so "/lord of hosts" still types spaces.
    if (candidates.length > 0 && !e.nativeEvent.isComposing) {
      const n = candidates.length;
      if (e.key === "ArrowDown") { e.preventDefault(); setSlashMoved(true); setSlashActive((i) => (i + 1) % n); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setSlashMoved(true); setSlashActive((i) => (i - 1 + n) % n); return; }
      if (e.key === "Enter" || (e.key === " " && (slashMoved || exactSlash))) {
        e.preventDefault();
        commitCandidate(candidates[slashActive].scope);
        return;
      }
    }

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
        title={forPlatform("Ask Scripture — find verses by describing them (Ctrl+Shift+K, or start the search bar with ?)")}
        aria-label={`Ask Scripture ${aiOpen ? "open" : "closed"}`}
      >
        <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
        <span className="font-body-ui font-medium text-[12px] hidden xl:inline">Ask</span>
      </button>

      <SearchHistoryMenu entries={searchHistory} onPick={runHistory} onClear={clearSearchHistory} />

      <div className="relative flex-1 min-w-[220px]">
        <span className={`material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-[18px] pointer-events-none select-none ${route.kind === "ask" ? "text-primary" : "text-on-surface-variant"}`}>
          {ui.icon}
        </span>
        <input
          ref={inputRef}
          className="w-full pl-8 pr-24 py-1 focus:outline-none text-body-ui font-body-ui transition-colors placeholder:text-on-surface-variant field rounded-lg"
          placeholder={forPlatform(`Verse (jn 3:16), a word, or ${ASK_PREFIX} to ask  (Ctrl+K)`)}
          value={value}
          onChange={(e) => {
            // "ot/" or "john,romans/" typed: lift the scope out of the text into a filter.
            const scoped = parseScopedQuery(e.target.value.trimStart());
            if (scoped) {
              addFilter(scoped.scope);
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
          filters={filters}
          onToggle={toggleFilter}
          onRemove={(f) => setFilters(filters.filter((x) => !sameScope(x, f)))}
          onClear={() => { setFilters([]); inputRef.current?.focus(); }}
          open={menuOpen}
          onOpenChange={setMenuOpen}
          recent={recentScopes}
          wholeWord={wholeWord}
          onWholeWordChange={setWholeWord}
        />

        {showCandidates && (
          <div className="absolute top-full left-0 right-0 mt-1 z-[200] glass rounded-2xl py-1 font-body-ui text-body-ui">
            <p className="px-3 pt-1 pb-0.5 font-metadata-mono text-[10px] uppercase tracking-widest text-on-surface-variant">
              Filter search to…{filters.length > 0 ? " (adds to current filters)" : ""}
            </p>
            {candidates.map((c, i) => (
              <button
                key={JSON.stringify(c.scope)}
                onMouseDown={(e) => { e.preventDefault(); commitCandidate(c.scope); }}
                onMouseEnter={() => { setSlashActive(i); setSlashMoved(true); }}
                className={`w-full flex items-center justify-between px-3 py-1.5 text-left transition-colors ${i === slashActive ? "bg-secondary-container text-on-secondary-container" : "text-on-surface hover:bg-surface-container-low"}`}
              >
                <span>{c.label}{c.hint && <span className="ml-2 text-[12px] text-on-surface-variant">{c.hint}</span>}</span>
                {i === slashActive && (slashMoved || exactSlash || i === 0) && (
                  <span className="rounded-md px-2 py-0.5 text-[12px] bg-surface-container-high text-on-surface-variant">{slashMoved || exactSlash ? "Space" : "Enter"}</span>
                )}
              </button>
            ))}
          </div>
        )}

        {open && isReference && !bookOnly && (
          <ScriptureSuggestions
            suggestions={nav.suggestions}
            previewText={nav.previewText}
            showDropdown={nav.showDropdown}
            spaceAccepts={nav.spaceAccepts}
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

        {open && !showCandidates && route.kind === "word" && !wordText && route.scope && (
          <Hint icon="filter_list" kbd="Type">
            <span className="text-primary">{scopeLabel(route.scope)}</span>
            <span className="text-on-surface-variant ml-2">· type a word to search only here</span>
          </Hint>
        )}

        {open && !showCandidates && route.kind === "word" && wordText && rect && (
          <div
            data-tour="live-search-results"
            className="fixed z-[200] glass rounded-xl overflow-y-auto"
            style={{ left: rect.left, top: rect.bottom + 4, width: Math.max(rect.width, 420), maxHeight: Math.max(160, window.innerHeight - rect.bottom - 24) }}
          >
            {settled !== wordText && results.length === 0 ? (
              <p className="px-3 py-2 font-body-ui text-[12px] text-on-surface-variant">Searching…</p>
            ) : results.length === 0 ? (
              <p className="px-3 py-2 font-body-ui text-[12px] text-on-surface-variant">No matches in {scopes.length === 0 ? primaryModule : `${scopesLabel(scopes)} (${primaryModule})`}.</p>
            ) : (
              <>
              <p className="px-3 pt-1.5 pb-0.5 font-metadata-mono text-[10px] uppercase tracking-widest text-on-surface-variant">
                {results.length}{hasMore ? "+" : ""} {results.length === 1 && !hasMore ? "match" : "matches"} · {scopesLabel(scopes)}{wholeWord ? " · whole words" : ""}
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
