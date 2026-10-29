import { normalizeBookName } from "../data/books";
import { BOOK_GROUPS, NT_BOOKS, OT_BOOKS } from "./books";

/**
 * Scope prefixes for the Live Show text search: `ot/love`, `nt/grace`, `psalm/shepherd`,
 * `1jn/abide`, `john,romans/grace`, `gospels/faith`. Everything before the first "/" names
 * where to search (comma-separated for several); everything after is the search text.
 */
export type SearchScope =
  | { kind: "all" }
  | { kind: "testament"; testament: "OT" | "NT" }
  | { kind: "books"; books: string[]; label: string };

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
  return "All books";
}

/** The SearchOptions fields that express a scope. */
export function scopeOptions(scope: SearchScope): { testament?: "OT" | "NT"; book_filter?: string[] } {
  if (scope.kind === "testament") return { testament: scope.testament };
  if (scope.kind === "books") return { book_filter: scope.books };
  return {};
}

export function sameScope(a: SearchScope, b: SearchScope): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** The typed form of a scope ("nt/", "1 John/"), used to save scoped searches in history. */
export function scopePrefix(scope: SearchScope): string {
  if (scope.kind === "testament") return `${scope.testament.toLowerCase()}/`;
  if (scope.kind === "books") return `${scope.books.join(",")}/`;
  return "";
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
