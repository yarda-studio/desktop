import { create } from "zustand";

export type SyncStatus = "idle" | "syncing" | "synced" | "offline" | "quota_exceeded" | "error";

export interface SyncState {
  status: SyncStatus;
  lastSyncedAt: Date | null;
  storageUsedBytes: number;
  storageLimitBytes: number;
  errorMessage: string | null;
  showMergePrompt: boolean;

  setStatus: (status: SyncStatus) => void;
  setLastSyncedAt: (date: Date | null) => void;
  setStorageUsage: (usedBytes: number, limitBytes: number) => void;
  setError: (msg: string | null) => void;
  setShowMergePrompt: (show: boolean) => void;
  reset: () => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  status: "idle",
  lastSyncedAt: null,
  storageUsedBytes: 0,
  storageLimitBytes: 500 * 1024 * 1024, // 500 MB default Pro limit
  errorMessage: null,
  showMergePrompt: false,

  setStatus: (status) => set({ status }),
  setLastSyncedAt: (date) => set({ lastSyncedAt: date }),
  setStorageUsage: (usedBytes, limitBytes) =>
    set({ storageUsedBytes: usedBytes, storageLimitBytes: limitBytes }),
  setError: (msg) => set({ errorMessage: msg }),
  setShowMergePrompt: (show) => set({ showMergePrompt: show }),
  reset: () =>
    set({
      status: "idle",
      lastSyncedAt: null,
      storageUsedBytes: 0,
      errorMessage: null,
      showMergePrompt: false,
    }),
}));
