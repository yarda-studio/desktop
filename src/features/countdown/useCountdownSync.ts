import { useEffect } from "react";
import { selectPayload, useCountdown } from "./countdownStore";
import { emitCountdown } from "./relay";

/**
 * Keeps the output windows in step with the countdown store and finishes a
 * running timer when it reaches zero. Mounted once, by the presentation top bar,
 * so the timer keeps running whichever presentation tab is open.
 */
export function useCountdownSync() {
  useEffect(() => {
    emitCountdown(selectPayload(useCountdown.getState()));
    return useCountdown.subscribe((s) => emitCountdown(selectPayload(s)));
  }, []);

  const running = useCountdown((s) => s.status === "running");
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => useCountdown.getState().checkFinished(Date.now()), 250);
    return () => clearInterval(timer);
  }, [running]);
}
