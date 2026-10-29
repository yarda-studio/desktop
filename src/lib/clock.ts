import { useEffect, useState } from "react";

const listeners = new Set<(now: number) => void>();

function install() {
  // Driven by the Rust clock ticker (see spawn_clock_ticker): a page's own timers
  // are throttled when its window isn't focused, an eval() from the host is not.
  window.__scripturaTick = (now) => listeners.forEach((l) => l(now));
}

/**
 * The current time in ms, refreshed while `active`. Uses the host's ticks when
 * they arrive and a local timer as a fallback, so it also works in the main
 * window and when the ticker is off.
 */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    install();
    listeners.add(setNow);
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => {
      listeners.delete(setNow);
      clearInterval(timer);
    };
  }, [active]);
  return now;
}
