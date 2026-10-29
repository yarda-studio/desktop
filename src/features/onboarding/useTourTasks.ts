import { useEffect, useState } from "react";
import { takeSnapshot } from "./snapshot";
import { watch } from "./tasks";
import type { TourStep } from "./steps";

/**
 * Runs a step's tasks one after another. Only the current task is being watched, so
 * an earlier action can't complete a later task by accident.
 */
export function useTourTasks(step: TourStep) {
  const tasks = step.tasks ?? [];
  // Keyed by step id so a stale index from the previous step is never applied to this one.
  const [progress, setProgress] = useState({ id: step.id, index: 0 });
  const index = progress.id === step.id ? progress.index : 0;

  useEffect(() => {
    if (index >= tasks.length) return;
    const base = takeSnapshot();
    let fired = false;
    const advance = () => {
      if (fired) return;
      fired = true;
      setProgress({ id: step.id, index: index + 1 });
    };
    const detectors = Array.isArray(tasks[index].done) ? tasks[index].done : [tasks[index].done];
    const stops = detectors.map((d) => watch(d, base, advance));
    return () => stops.forEach((stop) => stop());
    // `tasks` is derived from `step`; the step id + index fully determine what to watch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id, index]);

  return { index, total: tasks.length, complete: index >= tasks.length };
}
