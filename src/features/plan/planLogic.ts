import type { PlanItem, PlanKind } from "./api";

/**
 * Pure rules for the service plan, kept apart from the store and components so
 * ordering, timing and duration parsing can be tested without a browser or the
 * Tauri bridge. Type-only imports, so this file loads anywhere.
 */

/** Matches the limit the backend enforces on save. */
export const MAX_PLAN_ITEMS = 200;

let counter = 0;
export function newItemId(): string {
  counter += 1;
  return `s${Date.now().toString(36)}${counter}`;
}

const DEFAULT_TITLES: Record<PlanKind, string> = {
  verse: "Scripture",
  song: "Song",
  slide: "Slide",
  countdown: "Countdown",
  black: "Black screen",
  note: "Note",
};

/** A new plan item of `kind`, with sensible blanks for everything the caller doesn't set. */
export function makeItem(kind: PlanKind, patch: Partial<PlanItem> = {}): PlanItem {
  return {
    id: newItemId(),
    kind,
    title: DEFAULT_TITLES[kind],
    subtitle: "",
    ref_id: null,
    book: null,
    chapter: null,
    verse: null,
    module: null,
    duration_secs: null,
    note: "",
    ...patch,
  };
}

export const clampIndex = (i: number, count: number) => Math.min(Math.max(0, i), Math.max(0, count - 1));

export function moveItem(items: PlanItem[], id: string, dir: -1 | 1): PlanItem[] {
  const i = items.findIndex((x) => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= items.length) return items;
  const next = [...items];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

export function removeItem(items: PlanItem[], id: string): PlanItem[] {
  return items.some((x) => x.id === id) ? items.filter((x) => x.id !== id) : items;
}

/** Where the cursor should sit after item `id` is removed, so it keeps pointing at the same step. */
export function cursorAfterRemove(items: PlanItem[], activeIndex: number, id: string): number {
  const at = items.findIndex((x) => x.id === id);
  if (at < 0 || activeIndex < 0) return activeIndex;
  if (at < activeIndex) return activeIndex - 1;
  if (at === activeIndex) return -1;
  return activeIndex;
}

/** Where the cursor should sit after the items were reordered, so it follows the step it was on. */
export function cursorAfterReorder(before: PlanItem[], after: PlanItem[], activeIndex: number): number {
  const id = before[activeIndex]?.id;
  if (!id) return activeIndex;
  const at = after.findIndex((x) => x.id === id);
  return at < 0 ? -1 : at;
}

const secs = (item: PlanItem) => Math.max(0, item.duration_secs ?? 0);

/** When each step is planned to start, in seconds from the start of the plan. */
export function plannedStarts(items: PlanItem[]): number[] {
  let t = 0;
  return items.map((item) => {
    const start = t;
    t += secs(item);
    return start;
  });
}

export function totalSecs(items: PlanItem[]): number {
  return items.reduce((sum, item) => sum + secs(item), 0);
}

/**
 * How far behind (positive) or ahead (negative) the service is as it enters
 * step `index`, given how long it has actually been running.
 */
export function behindAtEntry(items: PlanItem[], index: number, elapsedSecs: number): number | null {
  const start = plannedStarts(items)[index];
  return start === undefined ? null : Math.round(elapsedSecs - start);
}

/** 65 -> "1:05", 3725 -> "1:02:05". */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${two(m)}:${two(sec)}` : `${m}:${two(sec)}`;
}

/** "+2:10 behind", "1:05 ahead" or "on time". */
export function formatBehind(behindSecs: number): string {
  if (Math.abs(behindSecs) < 5) return "on time";
  return behindSecs > 0 ? `${formatDuration(behindSecs)} behind` : `${formatDuration(-behindSecs)} ahead`;
}

/**
 * What a person types for a length: "4" is four minutes, "4:30" is 4 min 30 s,
 * "1:05:00" is an hour and five minutes. Empty means no planned length. Returns
 * undefined for anything unreadable, so the caller can leave the field alone.
 */
export function parseDuration(text: string): number | null | undefined {
  const t = text.trim();
  if (t === "") return null;
  const parts = t.split(":");
  if (parts.length > 3 || parts.some((p) => !/^\d{1,3}$/.test(p))) return undefined;
  const n = parts.map(Number);
  if (n.length === 1) return n[0] * 60;
  if (n.length === 2) return n[0] * 60 + n[1];
  return n[0] * 3600 + n[1] * 60 + n[2];
}

/**
 * Whether the plan is the thing a Next / Back press should move, given the tab
 * on screen: the step the plan last showed must belong to that tab. A cue
 * (countdown, black screen, note) belongs to any of the three output tabs. If
 * the operator has wandered off to another tab, that tab keeps its own stepping.
 */
export function planOwnsView(item: PlanItem | undefined, view: string): boolean {
  if (!item) return false;
  switch (item.kind) {
    case "verse": return view === "live";
    case "song": return view === "songs";
    case "slide": return view === "slides";
    default: return view === "live" || view === "songs" || view === "slides";
  }
}

/** The short text under a step's title: its own subtitle, or the passage for a verse. */
export function itemDetail(item: PlanItem): string {
  if (item.subtitle) return item.subtitle;
  if (item.kind === "verse" && item.module) return item.module;
  return "";
}
