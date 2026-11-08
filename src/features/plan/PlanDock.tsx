import { useEffect, useState } from "react";
import PlanClock from "./PlanClock";
import PlanList from "./PlanList";
import { usePlan } from "./planStore";

const OPEN_KEY = "scriptura.plan.open";

function readOpen(): boolean {
  try { return localStorage.getItem(OPEN_KEY) === "1"; } catch { return false; }
}

/** True when the key press is going into a text field, so it must not move the plan. */
function typingIn(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}

/**
 * The service plan, docked above the Live, Songs and Slides tabs so one running
 * order drives all three. A thin strip when closed (what is on, what is next,
 * the clock, back and next); the editable list when open.
 */
export default function PlanDock() {
  const items = usePlan((s) => s.items);
  const activeIndex = usePlan((s) => s.activeIndex);
  const error = usePlan((s) => s.error);
  const [open, setOpen] = useState(readOpen);

  useEffect(() => { void usePlan.getState().load(); }, []);

  // Shift+Page Down / Page Up: next / previous step of the plan. The tabs listen
  // for plain Page Down / Page Up on the window, so this listens first (capture)
  // and stops the key there, otherwise a tab would step as well.
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

  function toggle() {
    const next = !open;
    setOpen(next);
    try { localStorage.setItem(OPEN_KEY, next ? "1" : "0"); } catch { /* not critical */ }
  }

  const current = items[activeIndex];
  const upcoming = items[activeIndex + 1];
  const summary = current
    ? `Now: ${current.title}${upcoming ? `  ·  Next: ${upcoming.title}` : "  ·  Last step"}`
    : items[0] ? `Not started  ·  First: ${items[0].title}` : "Empty";

  return (
    <section aria-label="Service plan" className="shrink-0 mx-2.5 mt-2.5 panel rounded-2xl overflow-hidden">
      <div className="flex items-center gap-3 px-3 py-1.5 font-body-ui text-[12px] text-on-surface">
        <button onClick={toggle} aria-expanded={open} className="ghost flex shrink-0 items-center gap-1.5 rounded px-1.5 py-0.5 font-bold" title="Show or hide the plan">
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">list_alt</span>
          Plan
          <span className="font-normal text-on-surface-variant">{items.length} {items.length === 1 ? "step" : "steps"}</span>
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">{open ? "expand_less" : "expand_more"}</span>
        </button>
        <span className="min-w-0 flex-1 truncate text-on-surface-variant" title={summary}>{summary}</span>
        <PlanClock />
        <span className="flex shrink-0 overflow-hidden rounded-md ctl">
          <button onClick={() => void usePlan.getState().step(-1)} disabled={items.length === 0} className="px-2 py-1 hover:bg-on-surface/10 disabled:opacity-35" aria-label="Previous step" title="Previous step (Shift+Page Up)">
            <span className="material-symbols-outlined text-[18px]">chevron_left</span>
          </button>
          <button onClick={() => void usePlan.getState().step(1)} disabled={items.length === 0} className="border-l border-outline-variant px-2 py-1 hover:bg-on-surface/10 disabled:opacity-35" aria-label="Next step" title="Next step (Shift+Page Down)">
            <span className="material-symbols-outlined text-[18px]">chevron_right</span>
          </button>
        </span>
      </div>

      {error && (
        <div role="alert" className="flex items-center gap-2 border-t border-outline-variant px-3 py-1.5 font-body-ui text-[12px] text-error">
          <span className="min-w-0 flex-1">{error}</span>
          <button onClick={() => usePlan.getState().dismissError()} className="ghost rounded px-1.5 py-0.5 text-on-surface-variant">Dismiss</button>
        </div>
      )}

      {open && (
        <div className="flex max-h-[40vh] min-h-0 flex-col border-t border-outline-variant">
          <PlanList />
        </div>
      )}
    </section>
  );
}
