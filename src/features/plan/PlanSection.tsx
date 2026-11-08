import { useState } from "react";
import PlanClock from "./PlanClock";
import PlanList from "./PlanList";
import { usePlan } from "./planStore";

const OPEN_KEY = "scriptura.plan.open";

function readOpen(): boolean {
  try { return localStorage.getItem(OPEN_KEY) === "1"; } catch { return false; }
}

/**
 * The service plan, at the top of each tab's Schedule column so one running
 * order drives Live, Songs and Slides. Closed it is two short lines (what is on,
 * what is next, back and next, the clock); open it is the editable list, kept to
 * the column so it never pushes the Preview and Live panels around.
 *
 * Loading the plan and the Shift+Page Down / Page Up keys belong to PlanController,
 * which runs once, so each tab can show this without doing that work again.
 */
export default function PlanSection() {
  const items = usePlan((s) => s.items);
  const activeIndex = usePlan((s) => s.activeIndex);
  const error = usePlan((s) => s.error);
  const [open, setOpen] = useState(readOpen);

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
    <section aria-label="Service plan" className="flex max-h-[60%] shrink-0 flex-col border-b border-outline-variant font-body-ui text-[12px] text-on-surface">
      <div className="flex items-center gap-2 px-3 pt-2">
        <button onClick={toggle} aria-expanded={open} className="ghost flex min-w-0 flex-1 items-center justify-start gap-1 overflow-hidden whitespace-nowrap rounded px-1 py-0.5 font-bold" title="Show or hide the plan">
          <span className="material-symbols-outlined !text-[18px] shrink-0" aria-hidden="true">list_alt</span>
          <span className="shrink-0">Plan</span>
          <span className="min-w-0 truncate font-normal text-on-surface-variant">{items.length} {items.length === 1 ? "step" : "steps"}</span>
          <span className="material-symbols-outlined !text-[18px] shrink-0" aria-hidden="true">{open ? "expand_less" : "expand_more"}</span>
        </button>
        <span className="flex shrink-0 overflow-hidden rounded-md ctl">
          <button onClick={() => void usePlan.getState().step(-1)} disabled={items.length === 0} className="px-2 py-0.5 hover:bg-on-surface/10 disabled:opacity-35" aria-label="Previous step" title="Previous step (Shift+Page Up)">
            <span className="material-symbols-outlined !text-[18px]">chevron_left</span>
          </button>
          <button onClick={() => void usePlan.getState().step(1)} disabled={items.length === 0} className="border-l border-outline-variant px-2 py-0.5 hover:bg-on-surface/10 disabled:opacity-35" aria-label="Next step" title="Next step (Shift+Page Down)">
            <span className="material-symbols-outlined !text-[18px]">chevron_right</span>
          </button>
        </span>
      </div>
      <div className="px-3 pb-2 pt-1">
        <p className="truncate text-on-surface-variant" title={summary}>{summary}</p>
        <div className="text-on-surface-variant"><PlanClock /></div>
      </div>

      {error && (
        <div role="alert" className="flex items-center gap-2 border-t border-outline-variant px-3 py-1.5 text-error">
          <span className="min-w-0 flex-1">{error}</span>
          <button onClick={() => usePlan.getState().dismissError()} className="ghost rounded px-1.5 py-0.5 text-on-surface-variant">Dismiss</button>
        </div>
      )}

      {open && (
        // The steps and the cue buttons scroll together inside the column, steps first.
        <div className="min-h-0 flex-1 overflow-y-auto border-t border-outline-variant">
          <PlanList />
        </div>
      )}
    </section>
  );
}
