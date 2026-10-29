import { test, describe } from "node:test";
import * as assert from "node:assert/strict";
import { planName } from "../../components/account/planName.ts";
import { useEntitlementStore } from "./entitlementStore.ts";
import { FREE_ENTITLEMENTS } from "./api.ts";

describe("Entitlements feature unit tests", () => {
  test("planName formats plans properly", () => {
    assert.equal(planName("free"), "Yarda Free");
    assert.equal(planName("pro"), "Yarda Pro");
    assert.equal(planName("team"), "Yarda Team");
    assert.equal(planName(null), "Yarda Free");
    assert.equal(planName(undefined), "Yarda Free");
    assert.equal(planName("custom"), "Yarda Custom");
  });

  test("FREE_ENTITLEMENTS defaults safely", () => {
    assert.equal(FREE_ENTITLEMENTS.plan, "free");
    assert.equal(FREE_ENTITLEMENTS.source, "personal");
    assert.equal(FREE_ENTITLEMENTS.daily_searches, 50);
    assert.equal(FREE_ENTITLEMENTS.sync_storage_mb, 0);
    assert.deepEqual(FREE_ENTITLEMENTS.features, {});
  });

  test("useEntitlementStore has() feature checking", () => {
    const store = useEntitlementStore.getState();

    // Default is free -> has("sync") is false
    assert.equal(store.has("sync"), false);
    assert.equal(store.has("shared_library"), false);

    // Set pro entitlements
    useEntitlementStore.setState({
      entitlements: {
        ...FREE_ENTITLEMENTS,
        plan: "pro",
        features: { sync: true },
      },
      plan: "pro",
    });

    assert.equal(useEntitlementStore.getState().has("sync"), true);
    assert.equal(useEntitlementStore.getState().has("shared_library"), false);

    // Set team entitlements
    useEntitlementStore.setState({
      entitlements: {
        ...FREE_ENTITLEMENTS,
        plan: "team",
        features: { sync: true, shared_library: true },
        pooled: true,
      },
      plan: "team",
    });

    assert.equal(useEntitlementStore.getState().has("sync"), true);
    assert.equal(useEntitlementStore.getState().has("shared_library"), true);
  });
});
