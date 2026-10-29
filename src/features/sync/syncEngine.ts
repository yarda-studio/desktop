import { api } from "../../lib/tauri.ts";
import { getSupabase } from "../../lib/supabase.ts";
import { useEntitlementStore } from "../entitlements/entitlementStore.ts";
import { fetchRemoteSyncRecords, fetchSyncUsage, pushSyncBatch } from "./api.ts";
import { useSyncStore } from "./syncStore.ts";

let isSyncRunning = false;
let syncTimeout: ReturnType<typeof setTimeout> | null = null;
let periodicInterval: ReturnType<typeof setInterval> | null = null;
let consecutiveFailures = 0;

export async function syncNow(): Promise<void> {
  if (isSyncRunning) return;

  const entitlements = useEntitlementStore.getState();
  if (!entitlements.has("sync")) {
    useSyncStore.getState().setStatus("idle");
    return;
  }

  const supabase = getSupabase();
  if (!supabase) {
    useSyncStore.getState().setStatus("idle");
    return;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    useSyncStore.getState().setStatus("idle");
    return;
  }

  isSyncRunning = true;
  useSyncStore.getState().setStatus("syncing");
  useSyncStore.getState().setError(null);

  try {
    // 1. Push local dirty records in batches of <= 200
    let hasMoreDirty = true;
    while (hasMoreDirty) {
      const dirty = await api.getDirtySyncRecords(200);
      if (dirty.length === 0) {
        hasMoreDirty = false;
        break;
      }

      const result = await pushSyncBatch(dirty);

      // Mark the pushed records clean in local SQLite
      const cleanKeys = dirty.map((r) => ({
        collection: r.collection,
        record_id: r.record_id,
        client_updated_at: r.client_updated_at,
      }));
      await api.markSyncRecordsClean(cleanKeys);

      if (dirty.length < 200 || result.accepted === 0) {
        hasMoreDirty = false;
      }
    }

    // 2. Pull remote records in batches of <= 500
    let hasMoreRemote = true;
    while (hasMoreRemote) {
      const cursor = await api.getSyncCursor();
      const remoteRecords = await fetchRemoteSyncRecords(cursor);

      if (remoteRecords.length === 0) {
        hasMoreRemote = false;
        break;
      }

      await api.applyRemoteSyncRecords(remoteRecords);

      if (remoteRecords.length < 500) {
        hasMoreRemote = false;
      }
    }

    // 3. Update storage usage
    const usedBytes = await fetchSyncUsage();
    const limitMb = entitlements.entitlements?.sync_storage_mb ?? 500;
    useSyncStore
      .getState()
      .setStorageUsage(usedBytes, limitMb * 1024 * 1024);

    // 4. Update status
    useSyncStore.getState().setStatus("synced");
    useSyncStore.getState().setLastSyncedAt(new Date());
    consecutiveFailures = 0;
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    consecutiveFailures++;

    if (errorMsg.includes("sync_not_included")) {
      useSyncStore.getState().setStatus("idle");
      useSyncStore
        .getState()
        .setError("Cloud sync is not included in your current plan.");
    } else if (errorMsg.includes("cap") || errorMsg.includes("quota")) {
      useSyncStore.getState().setStatus("quota_exceeded");
      useSyncStore
        .getState()
        .setError("Sync storage quota exceeded.");
    } else {
      // Degrade gracefully to offline
      useSyncStore.getState().setStatus("offline");
      useSyncStore
        .getState()
        .setError("Sync unavailable offline. Local changes will sync when connected.");

      // Exponential backoff retry: 5s, 10s, 20s, up to 60s
      const delayMs = Math.min(5000 * Math.pow(2, consecutiveFailures - 1), 60000);
      if (syncTimeout) clearTimeout(syncTimeout);
      syncTimeout = setTimeout(() => {
        void syncNow();
      }, delayMs);
    }
  } finally {
    isSyncRunning = false;
  }
}

export function scheduleSync(debounceMs = 1500): void {
  if (syncTimeout) {
    clearTimeout(syncTimeout);
  }
  syncTimeout = setTimeout(() => {
    void syncNow();
  }, debounceMs);
}

export function startSyncEngine(): () => void {
  // 1. Initial sync
  void syncNow();

  // 2. Sync on window focus
  const onFocus = () => {
    void syncNow();
  };
  window.addEventListener("focus", onFocus);

  // 3. Periodic sync every 5 minutes
  periodicInterval = setInterval(() => {
    void syncNow();
  }, 5 * 60 * 1000);

  // 4. Trigger on auth state change
  const supabase = getSupabase();
  const authSub = supabase?.auth.onAuthStateChange((_event, session) => {
    if (session?.user) {
      scheduleSync(500);
    } else {
      useSyncStore.getState().reset();
    }
  });

  return () => {
    window.removeEventListener("focus", onFocus);
    if (periodicInterval) clearInterval(periodicInterval);
    if (syncTimeout) clearTimeout(syncTimeout);
    authSub?.data.subscription.unsubscribe();
  };
}
