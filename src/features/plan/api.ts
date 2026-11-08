import { invoke } from "@tauri-apps/api/core";

export type PlanKind = "verse" | "song" | "slide" | "countdown" | "black" | "note";

/** One step of the service plan. Mirrors the backend's PlanItem. */
export interface PlanItem {
  id: string;
  kind: PlanKind;
  /** What the operator sees in the list. */
  title: string;
  subtitle: string;
  /** The song or slide id, for those kinds. */
  ref_id: number | null;
  /** The passage, for verse items. */
  book: string | null;
  chapter: number | null;
  verse: number | null;
  module: string | null;
  /** Planned length. For a countdown, the countdown's length. */
  duration_secs: number | null;
  /** A private reminder for the operator; never shown on the output. */
  note: string;
}

/** The plan as it should be sent to the cloud. */
export interface PlanSyncRecord {
  data: unknown;
  client_updated_at: string;
}

export const planApi = {
  list: () => invoke<PlanItem[]>("list_plan"),
  /** Replaces the whole plan and returns it as stored (ids and text normalised). */
  set: (items: PlanItem[]) => invoke<PlanItem[]>("set_plan", { items }),

  // Cloud sync (see planSync.ts)
  syncPending: () => invoke<PlanSyncRecord | null>("plan_sync_pending"),
  syncMarkPushed: (clientUpdatedAt: string) => invoke<void>("plan_sync_mark_pushed", { clientUpdatedAt }),
  /** True if the cloud's plan was newer and has replaced ours. */
  syncApply: (data: unknown, clientUpdatedAt: string) =>
    invoke<boolean>("plan_sync_apply", { data, clientUpdatedAt }),
};
