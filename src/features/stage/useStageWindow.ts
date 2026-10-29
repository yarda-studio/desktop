import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { api } from "../../lib/tauri";
import { useStageStore } from "./stageStore";

/**
 * Opens and closes the stage display window and keeps `active` right when the
 * operator closes it with its own close button.
 */
export function useStageWindow() {
  const active = useStageStore((s) => s.active);
  const setActive = useStageStore((s) => s.setActive);

  useEffect(() => {
    const unlisten = listen("stage-closed", () => setActive(false));
    return () => { unlisten.then((f) => f()); };
  }, [setActive]);

  async function open(monitorIndex?: number) {
    await api.openStageWindow(monitorIndex).catch(() => {});
    setActive(true);
  }

  async function close() {
    await api.closeStageWindow().catch(() => {});
    setActive(false);
  }

  return { active, open, close };
}
