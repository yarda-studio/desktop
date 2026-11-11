import { findBooks, normalizeBookName } from "../data/books";
import { BOOK_GROUPS, NT_BOOKS, OT_BOOKS } from "./books";

/**
 * Scope prefixes for the Live Show text search: `ot/love`, `nt/grace`, `psalm/shepherd`,
 * `1jn/abide`, `john,romans/grace`, `gospels/faith`. Everything before the first "/" names
 * where to search (comma-separated for several); everything after is the search text.
 */
export type SearchScope =
  | { kind: "all" }
  | { kind: "testament"; testament: "OT" | "NT" }
  | { kind: "books"; books: string[]; label: string }
  | { kind: "chapter"; book: string; chapter: number };

export const ALL_SCOPE: SearchScope = { kind: "all" };

export interface ScopedQuery {
  scope: SearchScope;
  text: string;
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// Group names and common nicknames → the books they cover.
const GROUP_ALIASES: Record<string, string[]> = (() => {
  const map: Record<string, string[]> = {};
  for (const g of BOOK_GROUPS) map[squash(g.label)] = g.books;
  const groupBooks = (label: string) => BOOK_GROUPS.find((g) => g.label === label)?.books ?? [];
  map.law = map.torah = groupBooks("Pentateuch");
  map.poetry = map.wisdom = groupBooks("Poetry & Wisdom");
  map.gospel = groupBooks("Gospels");
  map.paul = map.pauline = map.pauls = map.paulsepistles = groupBooks("Paul's Epistles");
  map.epistles = [...groupBooks("Paul's Epistles"), ...groupBooks("General Epistles")];
  map.prophets = [...groupBooks("Major Prophets"), ...groupBooks("Minor Prophets")];
  map.generalepistles = groupBooks("General Epistles");
  return map;
})();

/** One comma-separated part → books, or null when it names nothing we know. */
function resolvePart(part: string): string[] | null {
  const key = squash(part);
  if (key === "ot") return OT_BOOKS;
  if (key === "nt") return NT_BOOKS;
  if (GROUP_ALIASES[key]) return GROUP_ALIASES[key];
  const book = normalizeBookName(part);
  return book ? [book] : null;
}

/** Splits "prefix/text" when the prefix names OT, NT, books or a book group; otherwise null. */
export function parseScopedQuery(raw: string): ScopedQuery | null {
  const slash = raw.indexOf("/");
  if (slash <= 0) return null; // no slash, or the leading "/" force-text prefix

  const prefix = raw.slice(0, slash).trim();
  const text = raw.slice(slash + 1).trim();
  const parts = prefix.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;

  if (parts.length === 1) {
    const key = squash(parts[0]);
    if (key === "ot") return { scope: { kind: "testament", testament: "OT" }, text };
    if (key === "nt") return { scope: { kind: "testament", testament: "NT" }, text };
  }

  const books: string[] = [];
  for (const part of parts) {
    const resolved = resolvePart(part);
    if (!resolved) return null;
    for (const b of resolved) if (!books.includes(b)) books.push(b);
  }
  const label = parts.length === 1 && books.length > 1
    ? (BOOK_GROUPS.find((g) => squash(g.label) === squash(parts[0]))?.label ?? parts[0].charAt(0).toUpperCase() + parts[0].slice(1))
    : books.length <= 3 ? books.join(", ") : `${books.length} books`;
  return { scope: { kind: "books", books, label }, text };
}

export function scopeLabel(scope: SearchScope): string {
  if (scope.kind === "testament") return scope.testament === "OT" ? "Old Testament" : "New Testament";
  if (scope.kind === "books") return scope.label;
  if (scope.kind === "chapter") return `${scope.book} ${scope.chapter}`;
  return "All books";
}

/** Label for a set of filters, joined with "or" since a verse only has to match one. */
export function scopesLabel(scopes: SearchScope[]): string {
  return scopes.length === 0 ? "All books" : scopes.map(scopeLabel).join(", ");
}

/**
 * The SearchOptions fields for a set of filters. Filters are OR'd: testaments and books
 * merge into one `book_filter`, chapters go in `chapter_filters`, and the backend matches
 * a verse that is in any of them. No filters means no restriction.
 */
export function scopesOptions(scopes: SearchScope[]): { book_filter?: string[]; chapter_filters?: [string, number][] } {
  const books: string[] = [];
  const chapters: [string, number][] = [];
  for (const s of scopes) {
    if (s.kind === "testament") for (const b of s.testament === "OT" ? OT_BOOKS : NT_BOOKS) { if (!books.includes(b)) books.push(b); }
    else if (s.kind === "books") for (const b of s.books) { if (!books.includes(b)) books.push(b); }
    else if (s.kind === "chapter") chapters.push([s.book, s.chapter]);
  }
  return {
    ...(books.length ? { book_filter: books } : {}),
    ...(chapters.length ? { chapter_filters: chapters } : {}),
  };
}

export function sameScope(a: SearchScope, b: SearchScope): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** The typed form of a set of filters ("nt,john/"), used to save scoped searches in history. */
export function scopesPrefix(scopes: SearchScope[]): string {
  const parts: string[] = [];
  for (const s of scopes) {
    if (s.kind === "testament") parts.push(s.testament.toLowerCase());
    else if (s.kind === "books") parts.push(...s.books);
    else if (s.kind === "chapter") parts.push(s.book); // history can't re-run a chapter; falls back to the book
  }
  return parts.length ? `${[...new Set(parts)].join(",")}/` : "";
}

// ── Recently used scopes (a per-viewer convenience; fails soft without storage) ──

const RECENT_KEY = "scriptura.recentSearchScopes";
const RECENT_MAX = 5;

export function loadRecentScopes(): SearchScope[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((s) => s && typeof s.kind === "string" && s.kind !== "all").slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

export function rememberScope(scope: SearchScope): SearchScope[] {
  if (scope.kind === "all") return loadRecentScopes();
  const next = [scope, ...loadRecentScopes().filter((s) => !sameScope(s, scope))].slice(0, RECENT_MAX);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
  return next;
}

/**
 * "/john", "/nt", "/c" typed in the search bar, then Space: the same filter as "john/".
 * `/c` (or `/ch`) means the chapter currently on screen. Null when the text after the
 * slash isn't a scope, so Space just types a space.
 */
export function parseSlashScope(raw: string, current: { book: string; chapter: number }): SearchScope | null {
  const s = raw.trimStart();
  if (!s.startsWith("/")) return null;
  const name = s.slice(1).trim();
  if (!name) return null;
  const key = squash(name);
  if (key === "c" || key === "ch" || key === "chapter") return { kind: "chapter", book: current.book, chapter: current.chapter };
  const exact = parseScopedQuery(`${name}/`)?.scope;
  if (exact) return exact;
  // "1 t": a number plus letters picks the first matching book in canon order (1 Thessalonians).
  if (/^\d\s*[a-z]/i.test(name)) {
    const first = findBooks(name)[0];
    if (first) return { kind: "books", books: [first], label: first };
  }
  return null;
}

export interface SlashCandidate {
  label: string;
  hint?: string;
  scope: SearchScope;
}

/**
 * What the text after a leading "/" could mean as a filter, best match first: the exact
 * reading (what Space would commit), then other books that start with it. `/c` offers the
 * current chapter. Empty when the text isn't (the start of) a filter name.
 */
export function slashCandidates(raw: string, current: { book: string; chapter: number }): SlashCandidate[] {
  const s = raw.trimStart();
  if (!s.startsWith("/")) return [];
  const name = s.slice(1).trim();
  if (!name) return [];
  const key = squash(name);
  const out: SlashCandidate[] = [];
  const push = (c: SlashCandidate) => { if (!out.some((o) => sameScope(o.scope, c.scope))) out.push(c); };

  if (key.length >= 1 && "chapter".startsWith(key)) {
    push({ label: `${current.book} ${current.chapter}`, hint: "this chapter", scope: { kind: "chapter", book: current.book, chapter: current.chapter } });
  }
  const exact = parseScopedQuery(`${name}/`)?.scope;
  if (exact) push({ label: scopeLabel(exact), hint: exact.kind === "books" && exact.books.length > 1 ? `${exact.books.length} books` : undefined, scope: exact });
  if (key.length >= 1 && ("ot".startsWith(key) || "nt".startsWith(key))) {
    for (const t of ["OT", "NT"] as const) if (t.toLowerCase().startsWith(key)) push({ label: scopeLabel({ kind: "testament", testament: t }), scope: { kind: "testament", testament: t } });
  }
  if (key.length >= 2) {
    for (const g of BOOK_GROUPS) if (squash(g.label).startsWith(key)) push({ label: g.label, hint: `${g.books.length} books`, scope: { kind: "books", books: g.books, label: g.label } });
  }
  for (const b of findBooks(name).slice(0, 8)) push({ label: b, scope: { kind: "books", books: [b], label: b } });
  return out;
}
