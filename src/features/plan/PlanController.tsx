import { useEffect } from "react";
import { usePlan } from "./planStore";

/** True when the key press is going into a text field, so it must not move the plan. */
function typingIn(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}

/**
 * The service plan's behind-the-scenes work, mounted once while the Live, Songs
 * and Slides tabs are showing: it loads the plan, and makes Shift+Page Down /
 * Page Up step it. It draws nothing; each tab's PlanSection is the plan you see.
 */
export default function PlanController() {
  useEffect(() => { void usePlan.getState().load(); }, []);

  // The tabs listen for plain Page Down / Page Up on the window, so this listens
  // first (capture) and stops the key there, otherwise a tab would step as well.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key !== "PageDown" && e.key !== "PageUp") return;
      if (typingIn(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      void usePlan.getState().step(e.key === "PageDown" ? 1 : -1);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  return null;
}
