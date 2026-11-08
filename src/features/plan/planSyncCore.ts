/**
 * One round of syncing the service plan with the cloud, as plain steps over
 * "ports" (fetch, apply, push...) so the order and the failure rules can be
 * tested without the network or the Tauri bridge. planSync.ts supplies the
 * real ports.
 */

export interface RemotePlan {
  data: unknown;
  client_updated_at: string;
  deleted: boolean;
}

export interface PendingPlan {
  data: unknown;
  client_updated_at: string;
}

export interface PlanSyncPorts {
  /** The plan's record in the cloud, if there is one. */
  fetchRemote(): Promise<RemotePlan | null>;
  /** Give the cloud's plan to the backend, which keeps it only if it is newer. True if the plan changed. */
  apply(data: unknown, updatedAt: string): Promise<boolean>;
  /** The plan as it should be sent, if it has changed since it was last sent. */
  pending(): Promise<PendingPlan | null>;
  /** Send it. True if the cloud took it. */
  push(plan: PendingPlan): Promise<boolean>;
  markPushed(updatedAt: string): Promise<void>;
  /** A service is under way: the plan on screen is not to be swapped. */
  serviceRunning(): boolean;
  /** Show the stored plan. */
  reload(): Promise<void>;
}

/**
 * Pull, then push. A cloud plan that cannot be applied does not stop our own
 * changes being sent (they are newer than it, or it is bad); the problem is
 * still reported once the round is over.
 */
export async function syncPlan(ports: PlanSyncPorts): Promise<void> {
  let failure: unknown = null;

  const remote = await ports.fetchRemote();
  if (remote && !remote.deleted && !ports.serviceRunning()) {
    try {
      if (await ports.apply(remote.data, remote.client_updated_at)) await ports.reload();
    } catch (e) {
      failure = e;
    }
  }

  const pending = await ports.pending();
  if (pending && (await ports.push(pending))) await ports.markPushed(pending.client_updated_at);

  if (failure) throw failure;
}
