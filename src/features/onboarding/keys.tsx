import type { KeyboardEvent as ReactKeyboardEvent } from "react";

export const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

const LABELS: Record<string, string> = {
  mod: IS_MAC ? "⌘" : "Ctrl",
  alt: IS_MAC ? "⌥" : "Alt",
  shift: IS_MAC ? "⇧" : "Shift",
  left: "←", right: "→", up: "↑", down: "↓",
  plus: "+", minus: "−",
};

/** A single key cap. Accepts the tokens used in steps.ts ("mod", "shift", "left"…) or a literal like "K". */
export function Kbd({ k }: { k: string }) {
  return (
    <span className="inline-flex items-center justify-center min-w-[24px] text-on-surface px-1.5 py-0.5 field rounded-md font-metadata-mono text-[12px]">
      {LABELS[k] ?? k}
    </span>
  );
}

export function KeyCombo({ keys }: { keys: string[] }) {
  return (
    <span className="inline-flex items-center gap-1">
      {keys.map((k, i) => <Kbd key={i} k={k} />)}
    </span>
  );
}

const CODE_FOR: Record<string, string> = {
  left: "ArrowLeft", right: "ArrowRight", up: "ArrowUp", down: "ArrowDown",
  plus: "Equal", minus: "Minus",
};

/** True when `e` is the combo (e.g. ["mod","k"]). Exact on modifiers so Ctrl+Shift+K isn't read as Ctrl+K. */
export function matchesCombo(e: KeyboardEvent | ReactKeyboardEvent, keys: string[]): boolean {
  const key = keys[keys.length - 1];
  const want = { mod: keys.includes("mod"), shift: keys.includes("shift"), alt: keys.includes("alt") };
  if ((e.ctrlKey || e.metaKey) !== want.mod || e.shiftKey !== want.shift || e.altKey !== want.alt) return false;
  const code = CODE_FOR[key] ?? (/^[a-z]$/i.test(key) ? `Key${key.toUpperCase()}` : /^\d$/.test(key) ? `Digit${key}` : key);
  return e.code === code;
}
