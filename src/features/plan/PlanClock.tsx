import { useEffect, useState } from "react";
import { formatBehind, formatDuration, totalSecs } from "./planLogic";
import { usePlan } from "./planStore";

/**
 * The service clock: how long the service has run against the plan, how far
 * behind or ahead it was on reaching the current step, and how long that step
 * has been up against its planned length. Ticks only while the clock is running.
 */
export default function PlanClock() {
  const items = usePlan((s) => s.items);
  const activeIndex = usePlan((s) => s.activeIndex);
  const startedAt = usePlan((s) => s.startedAt);
  const enteredAt = usePlan((s) => s.enteredAt);
  const behindSecs = usePlan((s) => s.behindSecs);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startedAt === null) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const total = totalSecs(items);
  if (startedAt === null) {
    return total > 0 ? <span className="whitespace-nowrap">Planned {formatDuration(total)}</span> : null;
  }

  const current = items[activeIndex];
  const stepElapsed = enteredAt === null ? 0 : (now - enteredAt) / 1000;
  const stepPlanned = current?.duration_secs ?? 0;
  const stepOver = stepPlanned > 0 && stepElapsed > stepPlanned;

  return (
    <span className="flex items-center gap-3 whitespace-nowrap">
      <span>
        Elapsed {formatDuration((now - startedAt) / 1000)}
        {total > 0 && <span className="text-on-surface-variant"> of {formatDuration(total)}</span>}
      </span>
      {stepPlanned > 0 && (
        <span className={stepOver ? "text-error font-bold" : ""} title="Time on this step against its planned length">
          Step {formatDuration(stepElapsed)} / {formatDuration(stepPlanned)}
        </span>
      )}
      {behindSecs !== null && (
        <span className={behindSecs > 30 ? "text-error" : behindSecs < -30 ? "text-primary" : ""} title="How the service was running when this step began">
          {formatBehind(behindSecs)}
        </span>
      )}
    </span>
  );
}
