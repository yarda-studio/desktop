import { create } from "zustand";
import { remoteApi, type RemoteStatus } from "./api";

const OFF: RemoteStatus = { enabled: false, url: null, qr_svg: null };

function msg(e: unknown): string {
  return e instanceof Error ? e.message : typeof e === "string" ? e : "Something went wrong";
}

interface RemoteState {
  status: RemoteStatus;
  busy: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setEnabled: (enabled: boolean) => Promise<void>;
  resetAccess: () => Promise<void>;
}

export const useRemoteStore = create<RemoteState>((set) => {
  async function run(action: () => Promise<RemoteStatus>) {
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
    refresh: () => run(remoteApi.status),
    setEnabled: (enabled) => run(() => remoteApi.setEnabled(enabled)),
    resetAccess: () => run(remoteApi.resetAccess),
  };
});
