import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { useSyncStore } from "./syncStore.ts";
import { useEntitlementStore } from "../entitlements/entitlementStore.ts";
import { syncNow, scheduleSync } from "./syncEngine.ts";

describe("Sync feature unit tests", () => {
  test("useSyncStore initial state and setters", () => {
    const store = useSyncStore.getState();
    assert.equal(store.status, "idle");
    assert.equal(store.lastSyncedAt, null);
    assert.equal(store.storageUsedBytes, 0);

    store.setStatus("syncing");
    assert.equal(useSyncStore.getState().status, "syncing");

    const now = new Date();
    store.setLastSyncedAt(now);
    assert.equal(useSyncStore.getState().lastSyncedAt, now);

    store.setStorageUsage(1024 * 1024 * 50, 1024 * 1024 * 500);
    assert.equal(useSyncStore.getState().storageUsedBytes, 1024 * 1024 * 50);
    assert.equal(useSyncStore.getState().storageLimitBytes, 1024 * 1024 * 500);

    store.setError("Test error");
    assert.equal(useSyncStore.getState().errorMessage, "Test error");

    store.reset();
    assert.equal(useSyncStore.getState().status, "idle");
    assert.equal(useSyncStore.getState().lastSyncedAt, null);
    assert.equal(useSyncStore.getState().errorMessage, null);
  });

  test("syncNow remains idle when user lacks sync entitlement", async () => {
    useSyncStore.getState().reset();
    useEntitlementStore.setState({
      plan: "free",
      entitlements: {
        plan: "free",
        features: ["search"],
        sync_storage_mb: 0,
        searches_limit: 5,
        pooled: false,
        source: { type: "personal" },
        orgs: [],
      },
    });

    await syncNow();
    assert.equal(useSyncStore.getState().status, "idle");
  });

  test("scheduleSync debounces without error", () => {
    assert.doesNotThrow(() => {
      scheduleSync(100);
      scheduleSync(100);
    });
  });
});
