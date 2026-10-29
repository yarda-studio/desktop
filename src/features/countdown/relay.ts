import { invoke } from "@tauri-apps/api/core";
import type { CountdownPayload } from "./model";

export function emitCountdown(payload: CountdownPayload) {
  invoke("relay_countdown", { payload }).catch(console.error);
}

/** For an output window: apply the latest countdown now and on every change. */
export function listenCountdown(cb: (c: CountdownPayload) => void): () => void {
  window.__scripturaApplyCountdown = (state) => cb(state as CountdownPayload);
  invoke<CountdownPayload | null>("get_countdown_state")
    .then((c) => { if (c) cb(c); })
    .catch(() => {});
  return () => { delete window.__scripturaApplyCountdown; };
}
