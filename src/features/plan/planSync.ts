import { fetchRemoteSyncRecord, pushSyncBatch } from "../sync/api";
import type { SyncParticipant } from "../sync/syncEngine";
import { planApi } from "./api";
import { usePlan } from "./planStore";
import { syncPlan, type PlanSyncPorts } from "./planSyncCore";

/** The whole plan is one record in the cloud. */
const COLLECTION = "service_plan";
const RECORD_ID = "current";

const ports: PlanSyncPorts = {
  fetchRemote: async () => {
    const row = await fetchRemoteSyncRecord(COLLECTION, RECORD_ID);
    return row ? { data: row.data, client_updated_at: row.client_updated_at, deleted: row.deleted } : null;
  },
  apply: (data, updatedAt) => planApi.syncApply(data, updatedAt),
  pending: () => planApi.syncPending(),
  push: async (plan) => {
    const result = await pushSyncBatch([
      {
        collection: COLLECTION,
        record_id: RECORD_ID,
        data: plan.data as Record<string, unknown>,
        deleted: false,
        client_updated_at: plan.client_updated_at,
      },
    ]);
    return result.accepted > 0;
  },
  markPushed: (updatedAt) => planApi.syncMarkPushed(updatedAt),
  // The plan is not swapped under an operator who is mid-service; it is picked up on a later sync.
  serviceRunning: () => usePlan.getState().startedAt !== null,
  reload: () => usePlan.getState().load(),
};

/** Registered with the sync engine (see App.tsx). The plan's sync is its own: it uses no part of the main sync's database. */
export const planSyncParticipant: SyncParticipant = {
  name: "service plan",
  sync: () => syncPlan(ports),
};
