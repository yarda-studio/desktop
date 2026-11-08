import test from "node:test";
import assert from "node:assert/strict";
import { syncPlan, type PlanSyncPorts } from "./planSyncCore.ts";

/** Ports that record what happened; each can be overridden. */
function ports(over: Partial<PlanSyncPorts> = {}) {
  const log: string[] = [];
  const p: PlanSyncPorts = {
    fetchRemote: async () => { log.push("fetch"); return null; },
    apply: async () => { log.push("apply"); return true; },
    pending: async () => { log.push("pending"); return null; },
    push: async () => { log.push("push"); return true; },
    markPushed: async (at) => { log.push(`mark:${at}`); },
    serviceRunning: () => false,
    reload: async () => { log.push("reload"); },
    ...over,
  };
  return { p, log };
}

const remote = { data: { items: [] }, client_updated_at: "2026-11-08T10:00:00.000Z", deleted: false };
const pending = { data: { items: [] }, client_updated_at: "2026-11-08T11:00:00.000Z" };

test("nothing in the cloud and nothing to send does nothing more than look", async () => {
  const { p, log } = ports();
  await syncPlan(p);
  assert.deepEqual(log, ["fetch", "pending"]);
});

test("a cloud plan is applied before ours is sent, and the screen reloads when it changed", async () => {
  // The overrides replace the logging fetch and pending, so only the later steps are recorded.
  const { p, log } = ports({ fetchRemote: async () => remote, pending: async () => pending });
  await syncPlan(p);
  assert.deepEqual(log, ["apply", "reload", "push", `mark:${pending.client_updated_at}`]);
});

test("the screen is left alone when the backend kept our plan", async () => {
  const { p, log } = ports({ fetchRemote: async () => remote, apply: async () => false });
  await syncPlan(p);
  assert.ok(!log.includes("reload"));
});

test("the cloud plan is not swapped in while a service is running, but ours is still sent", async () => {
  const { p, log } = ports({ fetchRemote: async () => remote, pending: async () => pending, serviceRunning: () => true });
  await syncPlan(p);
  assert.ok(!log.includes("apply"));
  assert.ok(log.includes("push"));
});

test("a deleted cloud record is ignored", async () => {
  const { p, log } = ports({ fetchRemote: async () => ({ ...remote, deleted: true }) });
  await syncPlan(p);
  assert.ok(!log.includes("apply"));
});

test("a plan the cloud did not take stays waiting to be sent", async () => {
  const { p, log } = ports({ pending: async () => pending, push: async () => false });
  await syncPlan(p);
  assert.ok(!log.some((l) => l.startsWith("mark:")));
});

test("a cloud plan that cannot be applied is reported, after our changes were sent anyway", async () => {
  const { p, log } = ports({
    fetchRemote: async () => remote,
    apply: async () => { throw new Error("unreadable"); },
    pending: async () => pending,
  });
  await assert.rejects(syncPlan(p), /unreadable/);
  assert.ok(log.includes("push"));
  assert.ok(log.includes(`mark:${pending.client_updated_at}`));
});

test("a network failure fetching stops the round before anything changes", async () => {
  const { p, log } = ports({ fetchRemote: async () => { throw new Error("offline"); } });
  await assert.rejects(syncPlan(p), /offline/);
  assert.deepEqual(log, []);
});
