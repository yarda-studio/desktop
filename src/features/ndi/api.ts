import { invoke } from "@tauri-apps/api/core";
import type { NdiStatus } from "./ndiLogic";

export const ndiApi = {
  status: () => invoke<NdiStatus>("ndi_status"),
  /** Start sending the presentation window as an NDI source; restarts under a new name if already on. */
  start: (name: string) => invoke<NdiStatus>("ndi_start", { name }),
  stop: () => invoke<NdiStatus>("ndi_stop"),
};
