import { useEffect, useState, type ReactNode } from "react";
import { useAccountStore } from "../../store/accountStore";
import { useEntitlementStore } from "../../features/entitlements";
import { OrgSwitcher, OrgSettingsPanel } from "../../features/orgs";
import { SyncStatusPill, BackupsPanel } from "../../features/sync";
import { SharedLibraryPanel } from "../../features/sharedLibrary";
import ErrorBoundary from "../ErrorBoundary";
import AccountDetails from "./AccountDetails";
import { planName } from "./planName";

/** One line on the Account page: a title and description on the left, the value or action on the right. */
function Row({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
  return (
    <div className="set-row">
      <div className="min-w-0 flex-1 basis-64">
        <p className="set-title">{title}</p>
        {description && <p className="set-desc">{description}</p>}
      </div>
      {children}
    </div>
  );
}

function AccountPanelContent() {
  const { status, email, summary, refreshSummary, openModal } = useAccountStore();
  const { entitlements, refresh: refreshEntitlements, openCheckout, openPortal } = useEntitlementStore();
  const signedIn = status === "signedIn";

  const [upgrading, setUpgrading] = useState(false);
  const [openingPortal, setOpeningPortal] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (signedIn) {
      refreshSummary();
      refreshEntitlements();
    }
  }, [signedIn, refreshSummary, refreshEntitlements]);

  const activePlan = entitlements.plan || summary?.plan || "free";
  const isPaid = activePlan !== "free";
  const sourceOrg = entitlements.orgs.find((o) => o.id === entitlements.org_id);
  const planSourceText = entitlements.source === "org" && sourceOrg
    ? `Via ${sourceOrg.name}`
    : isPaid
      ? "Personal subscription"
      : "Personal free account";

  const limit = summary?.dailyLimit ?? entitlements.daily_searches;
  const used = summary?.usedToday ?? 0;
  const remaining = Math.max(0, limit - used);

  const syncMbUsed = (entitlements.sync_used_bytes / (1024 * 1024)).toFixed(1);
  const syncStorageDesc = entitlements.sync_storage_mb > 0
    ? `${syncMbUsed} MB of ${entitlements.sync_storage_mb} MB used`
    : "Not included on Free plan";

  async function handleUpgrade(targetPlan: "pro" | "team" = "pro") {
    setUpgrading(true);
    setActionError(null);
    try {
      await openCheckout(targetPlan);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Couldn't open checkout.");
    } finally {
      setUpgrading(false);
    }
  }

  async function handleManageBilling() {
    setOpeningPortal(true);
    setActionError(null);
    try {
      await openPortal(entitlements.source === "org" && entitlements.org_id ? entitlements.org_id : undefined);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Couldn't open billing portal.");
    } finally {
      setOpeningPortal(false);
    }
  }

  return (
    <div className="divide-y divide-outline-variant">
      {signedIn ? (
        <>
          <Row title="Account" description={email ?? undefined} />
          <div className="px-8 py-4">
            <AccountDetails hideEmail />
          </div>
        </>
      ) : (
        <Row title="Account" description="Sign in to use Ask Scripture and Cloud Sync. New accounts are created automatically.">
          <div className="flex items-center gap-2">
            <button onClick={openModal} className="ghost rounded-lg px-3 py-2 font-body-ui text-[13px] font-semibold text-on-surface">Sign up</button>
            <button onClick={openModal} className="btn-primary rounded-lg px-4 py-2 font-body-ui text-[13px] font-bold">Sign in</button>
          </div>
        </Row>
      )}

      <Row title="Current plan" description={signedIn ? planSourceText : "Your active subscription plan"}>
        <div className="flex items-center gap-3">
          <span className="font-body-ui text-[13px] font-semibold text-on-surface">
            {planName(activePlan)}
          </span>
          {signedIn && (
            isPaid ? (
              <button
                onClick={handleManageBilling}
                disabled={openingPortal}
                className="ctl rounded-lg px-3 py-1 font-body-ui text-[12px] font-medium"
              >
                {openingPortal ? "Opening…" : "Manage billing"}
              </button>
            ) : (
              <button
                onClick={() => handleUpgrade("pro")}
                disabled={upgrading}
                className="btn-primary rounded-lg px-3.5 py-1 font-body-ui text-[12px] font-bold"
              >
                {upgrading ? "Opening…" : "Upgrade"}
              </button>
            )
          )}
        </div>
      </Row>

      <Row title="Ask Scripture usage" description="Searches used today. The count resets at midnight UTC.">
        <span className="font-body-ui text-[13px] font-semibold text-on-surface">
          {!signedIn
            ? "Sign in to see"
            : limit !== null
              ? `${remaining} of ${limit} searches left today${entitlements.pooled ? " (team pool)" : ""}`
              : `${used} searches used today`}
        </span>
      </Row>

      <Row title="Cloud sync storage" description="Cloud backup and sync for notes, bookmarks, and settings.">
        <div className="flex items-center gap-3">
          <span className="font-body-ui text-[13px] font-semibold text-on-surface">
            {!signedIn ? "Sign in to see" : syncStorageDesc}
          </span>
          {signedIn && <SyncStatusPill />}
          {signedIn && entitlements.sync_storage_mb === 0 && (
            <button
              onClick={() => handleUpgrade("pro")}
              disabled={upgrading}
              className="ghost text-primary rounded-md px-2 py-0.5 font-body-ui text-[12px] font-semibold hover:underline"
            >
              Get Sync
            </button>
          )}
        </div>
      </Row>

      {signedIn && entitlements.sync_storage_mb > 0 && (
        <div className="px-8 py-3">
          <BackupsPanel />
        </div>
      )}

      {signedIn && (
        <Row title="Teams & Organizations" description="Manage your worship teams, members, and shared library.">
          <OrgSwitcher />
        </Row>
      )}

      {actionError && (
        <div className="px-8 py-2 bg-error/10 border-y border-error/20 text-error font-body-ui text-[12px]">
          {actionError}
        </div>
      )}

      <OrgSettingsPanel />

      {signedIn && (
        <div className="px-8 pb-6">
          <SharedLibraryPanel />
        </div>
      )}
    </div>
  );
}

/** Settings → Account: sign in or out, the current plan, usage today, and sync storage. */
export default function AccountPanel() {
  return (
    <ErrorBoundary>
      <AccountPanelContent />
    </ErrorBoundary>
  );
}
