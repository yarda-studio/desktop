import { test, describe } from "node:test";
import * as assert from "node:assert/strict";
import { formatOrgError, ERROR_MESSAGES } from "./api.ts";
import { useOrgStore } from "./orgStore.ts";

describe("Organizations feature unit tests", () => {
  test("formatOrgError maps known database exceptions to plain friendly text", () => {
    assert.equal(formatOrgError(new Error("no_seats")), ERROR_MESSAGES.no_seats);
    assert.equal(formatOrgError(new Error("RPC failed: invalid_invite")), ERROR_MESSAGES.invalid_invite);
    assert.equal(formatOrgError(new Error("owns_org_with_members")), ERROR_MESSAGES.owns_org_with_members);
    assert.equal(formatOrgError(new Error("org_not_active")), ERROR_MESSAGES.org_not_active);
    assert.equal(formatOrgError(new Error("org_read_only")), ERROR_MESSAGES.org_read_only);
    assert.equal(formatOrgError(new Error("version_conflict")), ERROR_MESSAGES.version_conflict);
    assert.equal(formatOrgError(new Error("sync_not_included")), ERROR_MESSAGES.sync_not_included);
    assert.equal(formatOrgError(new Error("cannot_remove_owner")), ERROR_MESSAGES.cannot_remove_owner);
    assert.equal(formatOrgError(new Error("some unmapped custom message")), "some unmapped custom message");
  });

  test("useOrgStore dialog state toggles and selection", () => {
    const store = useOrgStore.getState();

    assert.equal(store.settingsOpen, false);
    assert.equal(store.inviteOpen, false);
    assert.equal(store.acceptInviteOpen, false);

    store.setSettingsOpen(true);
    assert.equal(useOrgStore.getState().settingsOpen, true);
    store.setSettingsOpen(false);

    store.setInviteOpen(true);
    assert.equal(useOrgStore.getState().inviteOpen, true);
    store.setInviteOpen(false);

    store.setAcceptInviteOpen(true);
    assert.equal(useOrgStore.getState().acceptInviteOpen, true);
    store.setAcceptInviteOpen(false);

    store.setCurrentOrgId("org-test-uuid");
    assert.equal(useOrgStore.getState().currentOrgId, "org-test-uuid");

    store.setCurrentOrgId(null);
    assert.equal(useOrgStore.getState().currentOrgId, null);
    assert.equal(useOrgStore.getState().activeOrg, null);
  });
});
