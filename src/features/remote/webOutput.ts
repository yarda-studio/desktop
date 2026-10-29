import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

export interface OutputStatus {
  enabled: boolean;
  output_url: string | null;
  alpha_url: string | null;
  stage_url: string | null;
}

const OFF: OutputStatus = { enabled: false, output_url: null, alpha_url: null, stage_url: null };

function msg(e: unknown): string {
  return e instanceof Error ? e.message : typeof e === "string" ? e : "Something went wrong";
}

interface WebOutputState {
  status: OutputStatus;
  busy: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setEnabled: (enabled: boolean) => Promise<void>;
  resetAccess: () => Promise<void>;
}

/** The browser-source pages for video mixers (OBS, vMix, …) served by the app. */
export const useWebOutput = create<WebOutputState>((set) => {
  async function run(action: () => Promise<OutputStatus>) {
    set({ busy: true, error: null });
    try {
      set({ status: await action(), busy: false });
    } catch (e) {
      set({ busy: false, error: msg(e) });
    }
  }
  return {
    status: OFF,
    busy: false,
    error: null,
    refresh: () => run(() => invoke<OutputStatus>("output_status")),
    setEnabled: (enabled) => run(() => invoke<OutputStatus>("output_set_enabled", { enabled })),
    resetAccess: () => run(() => invoke<OutputStatus>("output_reset_access")),
  };
});
