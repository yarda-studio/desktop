import { useEffect } from "react";
import { api } from "../lib/tauri";

/** Runs the host's background clock (which keeps timers moving on the second monitor) while `needed`. */
export function useClockTicks(needed: boolean) {
  useEffect(() => {
    api.setClockTicks(needed).catch(() => {});
    return () => { api.setClockTicks(false).catch(() => {}); };
  }, [needed]);
}
