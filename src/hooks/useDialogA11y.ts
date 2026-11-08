import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal-dialog behaviour for a container: moves focus inside on open, keeps Tab
 * cycling within it (WCAG 2.4.3 / 2.1.2), closes on Escape, and returns focus to
 * whatever opened it. Layout and markup stay with the caller.
 *
 * `initialFocus: "container"` starts focus on the dialog itself (give it
 * `tabIndex={-1}`) instead of its first control. Use it when the first control is
 * a choice that would look picked just from having focus, as on the welcome screen.
 */
export function useDialogA11y(
  ref: RefObject<HTMLElement>,
  active: boolean,
  onClose: () => void,
  options: { initialFocus?: "first" | "container" } = {},
) {
  const initialFocus = options.initialFocus ?? "first";
  // Callers pass inline handlers; keep the latest in a ref so the effect (and its
  // focus restore on cleanup) only runs when the dialog opens or closes.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!active) return;
    const root = ref.current;
    if (!root) return;
    const opener = document.activeElement as HTMLElement | null;

    if (!root.contains(document.activeElement)) {
      const first = initialFocus === "container" ? null : root.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? root).focus({ preventScroll: true });
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab" || !root) return;
      const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      );
      if (items.length === 0) { e.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;
      // Focus on the dialog itself counts as outside the list: Shift+Tab from it wraps to the last control.
      if (e.shiftKey && (current === first || current === root || !root.contains(current))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (current === last || !root.contains(current))) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, [ref, active, initialFocus]);
}
