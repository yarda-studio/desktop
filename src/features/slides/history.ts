/**
 * Undo and redo for the slide editor, as plain functions on plain data so the
 * rules can be tested without React or the Tauri bridge.
 *
 * A snapshot is what the editor shows (the whole draft and the page being
 * edited). Drafts are never changed in place, so a snapshot costs a reference.
 * Call `record` with the state from BEFORE an edit is applied.
 */

/** Snapshots kept. Older ones are dropped. */
export const HISTORY_LIMIT = 100;
/** Edits with the same key closer together than this are one undo step (a drag, a burst of typing). */
export const COALESCE_MS = 800;

export interface History<T> {
  past: T[];
  future: T[];
  /** What the last recorded edit was, so a repeat of it can join the same step. */
  lastKey: string | null;
  lastAt: number;
}

export function emptyHistory<T>(): History<T> {
  return { past: [], future: [], lastKey: null, lastAt: 0 };
}

/**
 * Note that an edit is about to be applied to `before`. An edit with a `key`
 * that repeats the previous one within `COALESCE_MS` joins its undo step;
 * anything else starts a new step. Any new edit clears the redo list.
 */
export function record<T>(h: History<T>, before: T, key: string | null, now: number): History<T> {
  if (key !== null && key === h.lastKey && now - h.lastAt < COALESCE_MS && h.past.length > 0) {
    return { ...h, future: [], lastAt: now };
  }
  const past = [...h.past, before];
  if (past.length > HISTORY_LIMIT) past.splice(0, past.length - HISTORY_LIMIT);
  return { past, future: [], lastKey: key, lastAt: now };
}

/** Step back. `null` when there is nothing to undo. */
export function undo<T>(h: History<T>, present: T): { history: History<T>; state: T } | null {
  const state = h.past[h.past.length - 1];
  if (state === undefined) return null;
  return { state, history: { past: h.past.slice(0, -1), future: [present, ...h.future], lastKey: null, lastAt: 0 } };
}

/** Step forward again. `null` when there is nothing to redo. */
export function redo<T>(h: History<T>, present: T): { history: History<T>; state: T } | null {
  const state = h.future[0];
  if (state === undefined) return null;
  return { state, history: { past: [...h.past, present], future: h.future.slice(1), lastKey: null, lastAt: 0 } };
}

/** The same history with every snapshot passed through `fn` (used to give a newly saved slide's id to older snapshots). */
export function mapHistory<T>(h: History<T>, fn: (s: T) => T): History<T> {
  return { ...h, past: h.past.map(fn), future: h.future.map(fn) };
}
