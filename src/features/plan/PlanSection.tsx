import { useState, type ReactNode } from "react";
import PlanClock from "./PlanClock";
import PlanList from "./PlanList";
import { usePlan } from "./planStore";

const MODE_KEY = "scriptura.plan.mode";
type Mode = "plan" | "schedule";

function readMode(): Mode {
  try { return localStorage.getItem(MODE_KEY) === "plan" ? "plan" : "schedule"; } catch { return "schedule"; }
}

/**
 * The left column of Live, Songs and Slides: the service plan and this tab's
 * schedule in one panel with a Plan | Schedule switch.
 *
 *  - Plan is the saved running order for the whole service (shared by every tab,
 *    with timings, notes and cues). Back / next, "Now / Next" and the clock stay
 *    in view in both modes so you can keep stepping while looking at either list.
 *  - Schedule is this tab's own queue of things to take live; each tab passes it
 *    in as `children`.
 *
 * Loading the plan and the Shift+Page Down / Page Up keys belong to PlanController,
 * which runs once, so each tab can show this without doing that work again.
 */
export default function PlanSection({ children, scheduleCount }: { children: ReactNode; scheduleCount?: number }) {
  const items = usePlan((s) => s.items);
  const activeIndex = usePlan((s) => s.activeIndex);
  const error = usePlan((s) => s.error);
  const [mode, setModeState] = useState<Mode>(readMode);

  function setMode(next: Mode) {
    setModeState(next);
    try { localStorage.setItem(MODE_KEY, next); } catch { /* not critical */ }
  }

  const current = items[activeIndex];
  const upcoming = items[activeIndex + 1];
  const summary = current
    ? `Now: ${current.title}${upcoming ? `  ·  Next: ${upcoming.title}` : "  ·  Last step"}`
    : items[0] ? `Not started  ·  First: ${items[0].title}` : "Plan is empty";

  const tab = (id: Mode, label: string, icon: string, count?: number) => {
    const on = mode === id;
    return (
      <button
        role="tab"
        aria-selected={on}
        onClick={() => setMode(id)}
        className={`seg-tab relative z-10 flex min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1.5 font-bold transition-colors duration-200 active:scale-[0.97] ${
          on ? "text-on-surface" : "text-on-surface-variant hover:text-on-surface"
        }`}
      >
        <span className="seg-ico material-symbols-outlined !text-[16px] shrink-0" aria-hidden="true">{icon}</span>
        <span className="shrink-0">{label}</span>
        {count !== undefined && <span key={count} className="seg-count motion-swap shrink-0 rounded-full bg-on-surface/10 px-1.5 text-[11px] font-semibold leading-[18px] text-on-surface-variant">{count}</span>}
      </button>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col font-body-ui text-[12px] text-on-surface">
      <div className="seg shrink-0 px-3 pt-2.5">
        <div role="tablist" aria-label="Plan or schedule" className="seg-tabs relative w-full items-center gap-0.5 rounded-lg bg-surface-container p-0.5">
          {/* The pill that slides under the active tab: tabs are equal width, so it moves one tab + one gap. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-0.5 left-0.5 top-0.5 w-[calc(50%-3px)] rounded-md bg-surface shadow-sm transition-transform duration-[340ms] ease-[cubic-bezier(0.4,0.05,0.15,1)] motion-reduce:transition-none"
            style={{ transform: mode === "plan" ? "translateX(0)" : "translateX(calc(100% + 2px))" }}
          />
          {tab("plan", "Plan", "list_alt", items.length)}
          {tab("schedule", "Schedule", "queue_music", scheduleCount)}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 px-3 pb-2 pt-2">
        <div className="min-w-0 flex-1">
          <p key={summary} className="motion-swap truncate text-on-surface-variant" title={summary}>{summary}</p>
          <div className="text-on-surface-variant"><PlanClock /></div>
        </div>
        <span className="flex shrink-0 overflow-hidden rounded-md ctl">
          <button onClick={() => void usePlan.getState().step(-1)} disabled={items.length === 0} className="px-2 py-0.5 hover:bg-on-surface/10 disabled:opacity-35" aria-label="Previous step" title="Previous step (Shift+Page Up)">
            <span className="material-symbols-outlined !text-[18px]">chevron_left</span>
          </button>
          <button onClick={() => void usePlan.getState().step(1)} disabled={items.length === 0} className="border-l border-outline-variant px-2 py-0.5 hover:bg-on-surface/10 disabled:opacity-35" aria-label="Next step" title="Next step (Shift+Page Down)">
            <span className="material-symbols-outlined !text-[18px]">chevron_right</span>
          </button>
        </span>
      </div>
      <div className="shrink-0 border-b border-outline-variant" />

      {error && (
        <div role="alert" className="flex shrink-0 items-center gap-2 border-b border-outline-variant px-3 py-1.5 text-error">
          <span className="min-w-0 flex-1">{error}</span>
          <button onClick={() => usePlan.getState().dismissError()} className="ghost rounded px-1.5 py-0.5 text-on-surface-variant">Dismiss</button>
        </div>
      )}

      {mode === "plan" ? (
        // The steps and the cue buttons scroll together inside the column, steps first.
        <div key="plan" role="tabpanel" aria-label="Service plan" className="motion-from-left min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          <PlanList />
        </div>
      ) : (
        // Each panel slides in from the side its tab is on, so the switch reads as one surface moving.
        <div key="schedule" role="tabpanel" aria-label="Schedule" className="motion-from-right flex min-h-0 flex-1 flex-col overflow-x-hidden">{children}</div>
      )}
    </div>
  );
}
