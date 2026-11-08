import type { SlidePage } from "./api";

/**
 * Pure helpers for the pages of a free-form slide. Kept apart from the stores
 * and components so the rules (never zero pages, a cap, how stepping crosses a
 * slide boundary) can be tested without a browser or the Tauri bridge.
 * Type-only imports, so this file loads anywhere.
 */

/** Matches the limit the backend enforces on save. */
export const MAX_PAGES = 50;

let counter = 0;
export function newPageId(): string {
  counter += 1;
  return `p${Date.now().toString(36)}${counter}`;
}

export const clampIndex = (i: number, count: number) => Math.min(Math.max(0, i), Math.max(0, count - 1));

/** Insert `page` at `at` (end of list when out of range). Returns the new list and where the page landed. */
export function insertPage(pages: SlidePage[], at: number, page: SlidePage): { pages: SlidePage[]; index: number } {
  if (pages.length >= MAX_PAGES) return { pages, index: clampIndex(at, pages.length) };
  const index = Math.min(Math.max(0, at), pages.length);
  return { pages: [...pages.slice(0, index), page, ...pages.slice(index)], index };
}

/** A copy of page `i` placed right after it, with a fresh page id. */
export function duplicatePage(pages: SlidePage[], i: number): { pages: SlidePage[]; index: number } {
  const source = pages[i];
  if (!source) return { pages, index: clampIndex(i, pages.length) };
  const copy: SlidePage = { ...source, id: newPageId(), elements: source.elements.map((e) => ({ ...e })) };
  return insertPage(pages, i + 1, copy);
}

/** Remove page `i`. A slide always keeps at least one page, so the last one is never removed. */
export function removePage(pages: SlidePage[], i: number): { pages: SlidePage[]; index: number } {
  if (pages.length <= 1 || i < 0 || i >= pages.length) return { pages, index: clampIndex(i, pages.length) };
  const next = pages.filter((_, n) => n !== i);
  return { pages: next, index: clampIndex(i, next.length) };
}

/** Move page `i` one place earlier (-1) or later (+1). */
export function movePage(pages: SlidePage[], i: number, dir: -1 | 1): { pages: SlidePage[]; index: number } {
  const j = i + dir;
  if (i < 0 || i >= pages.length || j < 0 || j >= pages.length) return { pages, index: clampIndex(i, pages.length) };
  const next = [...pages];
  [next[i], next[j]] = [next[j], next[i]];
  return { pages: next, index: j };
}

/**
 * Where a step lands when it stays inside the slide: the new page index, or
 * `null` when it would run off either end and the caller should move to the
 * neighbouring scheduled slide instead.
 */
export function stepWithin(page: number, count: number, delta: -1 | 1): number | null {
  const next = page + delta;
  return next >= 0 && next < count ? next : null;
}

/** The plain text of a page's text boxes, one box per line. */
export function pageText(page: SlidePage | undefined): string {
  if (!page) return "";
  return page.elements.filter((e) => e.kind === "text").map((e) => e.text.trim()).filter(Boolean).join("\n");
}
