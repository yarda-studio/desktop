import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { useSharedLibraryStore } from "./sharedLibraryStore.ts";
import { uploadOrgMedia } from "./api.ts";

describe("Shared Library feature unit tests", () => {
  test("useSharedLibraryStore filter and state management", () => {
    const store = useSharedLibraryStore.getState();
    assert.equal(store.activeFilter, "all");
    assert.equal(store.conflict, null);

    store.setFilter("service_plan");
    assert.equal(useSharedLibraryStore.getState().activeFilter, "service_plan");

    store.setFilter("song");
    assert.equal(useSharedLibraryStore.getState().activeFilter, "song");
  });

  test("Conflict state and clearConflict", () => {
    useSharedLibraryStore.setState({
      conflict: {
        resourceId: "test-res-id",
        orgId: "test-org-id",
        kind: "service_plan",
        title: "Sunday Service",
        data: {},
        latestVersion: 2,
      },
    });

    assert.ok(useSharedLibraryStore.getState().conflict);
    assert.equal(useSharedLibraryStore.getState().conflict?.title, "Sunday Service");

    useSharedLibraryStore.getState().clearConflict();
    assert.equal(useSharedLibraryStore.getState().conflict, null);
  });

  test("uploadOrgMedia enforces 50 MB client cap", async () => {
    const largeFile = {
      name: "big-video.mp4",
      size: 55 * 1024 * 1024, // 55 MB > 50 MB limit
      type: "video/mp4",
    } as unknown as File;

    await assert.rejects(
      async () => {
        await uploadOrgMedia("test-org-id", largeFile);
      },
      {
        message: /exceeds 50 MB/,
      }
    );
  });
});
