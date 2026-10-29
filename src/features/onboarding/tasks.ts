import { matchesCombo } from "./keys";
import { subscribeSnapshot, takeSnapshot, type Snap } from "./snapshot";

/**
 * Things a step can ask the user to actually do. Each detector watches for the real
 * action (typing into the real input, clicking the real control, the app's state
 * really changing) — nothing is simulated, so what the user learns is what the app does.
 */
export type Detector =
  /** Text is typed into an input inside `selector`. `test` sees the current value. */
  | { kind: "type"; selector: string; test?: (value: string) => boolean }
  /** Enter is pressed in an input inside `selector`. `test` sees the current value. */
  | { kind: "enter"; selector: string; test?: (value: string) => boolean }
  /** A click (or mousedown/dblclick) lands inside `selector`. */
  | { kind: "click"; selector: string; on?: "click" | "mousedown" | "dblclick"; shift?: boolean }
  /** A keyboard shortcut is pressed (the app still receives it). */
  | { kind: "key"; keys: string[] }
  /** An element matching `selector` is on screen. */
  | { kind: "appear"; selector: string }
  /** The text of the element at `selector` differs from when the task began. */
  | { kind: "change"; selector: string }
  /** The app state satisfies `test`, compared with the state when the task began. */
  | { kind: "state"; test: (now: Snap, base: Snap) => boolean };

export interface TourTask {
  /** Imperative, shown as a checklist row: "Type a reference, e.g. rom 8:28". */
  prompt: string;
  /** Completes when ANY of these fires. */
  done: Detector | Detector[];
}

export const typed = (selector: string, test?: (v: string) => boolean): Detector => ({ kind: "type", selector, test });
export const submitted = (selector: string, test?: (v: string) => boolean): Detector => ({ kind: "enter", selector, test });
export const clicked = (selector: string, opts: { on?: "click" | "mousedown" | "dblclick"; shift?: boolean } = {}): Detector =>
  ({ kind: "click", selector, ...opts });
export const pressed = (...keys: string[]): Detector => ({ kind: "key", keys });
export const appears = (selector: string): Detector => ({ kind: "appear", selector });
export const changes = (selector: string): Detector => ({ kind: "change", selector });
export const when = (test: (now: Snap, base: Snap) => boolean): Detector => ({ kind: "state", test });

const POLL_MS = 150;

function isVisible(el: Element | null): el is HTMLElement {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

/** Starts watching for `d`. Calls `onDone` once it fires; returns the stop function. */
export function watch(d: Detector, base: Snap, onDone: () => void): () => void {
  switch (d.kind) {
    case "type": {
      const on = (e: Event) => {
        const el = e.target as HTMLInputElement | HTMLTextAreaElement | null;
        if (!el?.closest?.(d.selector)) return;
        if (!d.test || d.test(el.value ?? "")) onDone();
      };
      window.addEventListener("input", on, true);
      return () => window.removeEventListener("input", on, true);
    }
    case "enter": {
      const on = (e: KeyboardEvent) => {
        const el = e.target as HTMLInputElement | HTMLTextAreaElement | null;
        if (e.key !== "Enter" || !el?.closest?.(d.selector)) return;
        if (!d.test || d.test(el.value ?? "")) onDone();
      };
      window.addEventListener("keydown", on, true);
      return () => window.removeEventListener("keydown", on, true);
    }
    case "click": {
      const type = d.on ?? "click";
      const on = (e: MouseEvent) => {
        if (!(e.target as Element | null)?.closest?.(d.selector)) return;
        if (d.shift && !e.shiftKey) return;
        onDone();
      };
      window.addEventListener(type, on, true);
      return () => window.removeEventListener(type, on, true);
    }
    case "key": {
      const on = (e: KeyboardEvent) => { if (matchesCombo(e, d.keys)) onDone(); };
      window.addEventListener("keydown", on, true);
      return () => window.removeEventListener("keydown", on, true);
    }
    case "appear": {
      const id = window.setInterval(() => { if (isVisible(document.querySelector(d.selector))) onDone(); }, POLL_MS);
      return () => window.clearInterval(id);
    }
    case "change": {
      let first: string | null = null;
      const id = window.setInterval(() => {
        const el = document.querySelector(d.selector);
        if (!el) return;
        const text = el.textContent ?? "";
        if (first === null) first = text;
        else if (text !== first) onDone();
      }, POLL_MS);
      return () => window.clearInterval(id);
    }
    case "state": {
      const check = () => { if (d.test(takeSnapshot(), base)) onDone(); };
      return subscribeSnapshot(check);
    }
  }
}
