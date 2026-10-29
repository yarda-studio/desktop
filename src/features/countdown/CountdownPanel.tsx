import { useEffect, useRef } from "react";
import { useNow } from "../../lib/clock";
import { formatRemaining, remainingMs } from "./model";
import { useCountdown } from "./countdownStore";

/** Dropdown from the top bar's Timer button: set up, start and show a countdown. */
export default function CountdownPanel({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const s = useCountdown();
  const now = useNow(s.status === "running");
  const left = formatRemaining(remainingMs(s, now));
  const idle = s.status === "idle" || s.status === "finished";

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div ref={ref} role="dialog" aria-label="Countdown timer" className="absolute right-0 top-full mt-1 z-50 glass rounded-xl w-[300px] p-4 space-y-4">
      <div className="text-center">
        <p className="font-metadata-mono text-[44px] leading-none text-on-surface tabular-nums" aria-live="off">{idle && s.status === "idle" ? "—:——" : left}</p>
        <p className="mt-1.5 font-body-ui text-[12px] text-on-surface-variant">
          {s.status === "idle" ? "Not running" : s.status === "running" ? "Running" : s.status === "paused" ? "Paused" : "Time is up"}
        </p>
      </div>

      <label className="block">
        <span className="field-label">Message above the timer</span>
        <input value={s.title} onChange={(e) => s.setConfig({ title: e.target.value })} className="field-input" placeholder="Service starts in" />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="field-label">Count down</span>
          <select value={s.mode} onChange={(e) => s.setConfig({ mode: e.target.value === "clock" ? "clock" : "duration" })} disabled={!idle} className="field-input">
            <option value="duration">For a length of time</option>
            <option value="clock">To a time of day</option>
          </select>
        </label>
        {s.mode === "duration" ? (
          <label className="block">
            <span className="field-label">Minutes</span>
            <input
              type="number" min={1} max={600} value={s.minutes} disabled={!idle}
              onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) s.setConfig({ minutes: Math.min(600, Math.max(0, n)) }); }}
              className="field-input"
            />
          </label>
        ) : (
          <label className="block">
            <span className="field-label">Time</span>
            <input type="time" value={s.clock} disabled={!idle} onChange={(e) => e.target.value && s.setConfig({ clock: e.target.value })} className="field-input" />
          </label>
        )}
      </div>

      <div className="flex gap-2">
        {idle && <button onClick={s.start} className="flex-1 h-9 rounded-md btn-primary font-body-ui text-[13px] font-bold">Start</button>}
        {s.status === "running" && <button onClick={s.pause} className="flex-1 h-9 rounded-md ctl font-body-ui text-[13px] font-bold text-on-surface">Pause</button>}
        {s.status === "paused" && <button onClick={s.resume} className="flex-1 h-9 rounded-md btn-primary font-body-ui text-[13px] font-bold">Resume</button>}
        <button onClick={s.reset} disabled={s.status === "idle"} className="h-9 px-4 rounded-md ctl font-body-ui text-[13px] text-on-surface disabled:opacity-40">Reset</button>
      </div>

      <label className="flex items-start gap-2 font-body-ui text-[13px] text-on-surface">
        <input type="checkbox" checked={s.show} disabled={s.status === "idle"} onChange={(e) => s.setShow(e.target.checked)} className="accent-primary mt-0.5" />
        <span>
          Show on the output screen
          <span className="block text-[12px] text-on-surface-variant">Covers scripture, songs and slides. BLACK and the standby screen still win.</span>
        </span>
      </label>
    </div>
  );
}
