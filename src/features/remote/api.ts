import { invoke } from "@tauri-apps/api/core";

export interface RemoteStatus {
  enabled: boolean;
  /** The pairing link, while the server is running. */
  url: string | null;
  /** The same link as an SVG QR code. */
  qr_svg: string | null;
}

export type RemoteAction = "next" | "prev" | "black" | "clear" | "standby" | "timer-toggle" | "timer-reset";

export const remoteApi = {
  status: () => invoke<RemoteStatus>("remote_status"),
  setEnabled: (enabled: boolean) => invoke<RemoteStatus>("remote_set_enabled", { enabled }),
  resetAccess: () => invoke<RemoteStatus>("remote_reset_access"),
  publishState: (json: string) => invoke<void>("remote_publish_state", { json }),
};
