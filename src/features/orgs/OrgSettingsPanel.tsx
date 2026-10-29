import { useState, useEffect } from "react";
import { useOrgStore } from "./orgStore.ts";
import { useAccountStore } from "../../store/accountStore.ts";
import { useEntitlementStore } from "../entitlements/entitlementStore.ts";
import MembersTable from "./MembersTable.tsx";
import InviteDialog from "./InviteDialog.tsx";
import AcceptInviteDialog from "./AcceptInviteDialog.tsx";
import { planName } from "../../components/account/planName.ts";

export default function OrgSettingsPanel() {
  const activeOrg = useOrgStore((s) => s.activeOrg);
  const currentOrgId = useOrgStore((s) => s.currentOrgId);
  const members = useOrgStore((s) => s.members);
  const invites = useOrgStore((s) => s.invites);
  const auditLogs = useOrgStore((s) => s.auditLogs);
  const billing = useOrgStore((s) => s.billing);
  const updateOrg = useOrgStore((s) => s.updateOrg);
  const revokeInvite = useOrgStore((s) => s.revokeInvite);
  const settingsOpen = useOrgStore((s) => s.settingsOpen);
  const setSettingsOpen = useOrgStore((s) => s.setSettingsOpen);
  const inviteOpen = useOrgStore((s) => s.inviteOpen);
  const setInviteOpen = useOrgStore((s) => s.setInviteOpen);
  const acceptInviteOpen = useOrgStore((s) => s.acceptInviteOpen);
  const setAcceptInviteOpen = useOrgStore((s) => s.setAcceptInviteOpen);
  const openPortal = useEntitlementStore((s) => s.openPortal);
  const openCheckout = useEntitlementStore((s) => s.openCheckout);
  const myEmail = useAccountStore((s) => s.email);

  type Tab = "general" | "members" | "invites" | "audit" | "billing";
  const [activeTab, setActiveTab] = useState<Tab>("general");
  const [name, setName] = useState(activeOrg?.name ?? "");
  const [quotaMode, setQuotaMode] = useState<"per_seat" | "pooled">(activeOrg?.quota_mode ?? "per_seat");
  const [savingGeneral, setSavingGeneral] = useState(false);
  const [generalSaved, setGeneralSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (activeOrg) {
      setName(activeOrg.name);
      setQuotaMode(activeOrg.quota_mode);
    }
  }, [activeOrg]);

  if (!settingsOpen || !activeOrg) return null;

  const myMember = members.find((m) => m.email === myEmail);
  const isOwner = myMember?.role === "owner" || activeOrg.owner_id === myMember?.user_id;
  const isAdmin = isOwner || myMember?.role === "admin";

  const seatsUsed = members.length;
  const seatLimit = activeOrg.seat_limit;
  const isFull = seatsUsed >= seatLimit;

  async function handleSaveGeneral(e: React.FormEvent) {
    e.preventDefault();
    setSavingGeneral(true);
    setErr(null);
    setGeneralSaved(false);
    try {
      await updateOrg(name.trim(), quotaMode);
      setGeneralSaved(true);
      setTimeout(() => setGeneralSaved(false), 2000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to update organization.");
    } finally {
      setSavingGeneral(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div className="w-full max-w-2xl max-h-[85vh] rounded-2xl border border-outline-variant bg-surface shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold">
              <span className="material-symbols-outlined text-[20px]">groups</span>
            </div>
            <div>
              <h2 className="font-body-ui text-[16px] font-bold text-on-surface leading-tight">
                {activeOrg.name}
              </h2>
              <p className="font-body-ui text-[12px] text-on-surface-variant">
                Team Settings · {planName(activeOrg.plan)} ({activeOrg.status})
              </p>
            </div>
          </div>
          <button
            onClick={() => setSettingsOpen(false)}
            className="p-1 rounded-md ghost text-on-surface-variant hover:text-on-surface"
            aria-label="Close settings"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Navigation tabs */}
        <div className="flex border-b border-outline-variant px-6 bg-surface-container-low/40 shrink-0 gap-1 overflow-x-auto">
          <button
            onClick={() => setActiveTab("general")}
            className={`py-2.5 px-3 font-body-ui text-[13px] font-medium border-b-2 transition-colors ${
              activeTab === "general"
                ? "border-primary text-primary font-bold"
                : "border-transparent text-on-surface-variant hover:text-on-surface"
            }`}
          >
            General
          </button>
          <button
            onClick={() => setActiveTab("members")}
            className={`py-2.5 px-3 font-body-ui text-[13px] font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === "members"
                ? "border-primary text-primary font-bold"
                : "border-transparent text-on-surface-variant hover:text-on-surface"
            }`}
          >
            Members
            <span className="text-[11px] px-1.5 py-0.2 rounded-full bg-surface-variant text-on-surface-variant">
              {members.length}
            </span>
          </button>

          {isAdmin && (
            <button
              onClick={() => setActiveTab("invites")}
              className={`py-2.5 px-3 font-body-ui text-[13px] font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === "invites"
                  ? "border-primary text-primary font-bold"
                  : "border-transparent text-on-surface-variant hover:text-on-surface"
              }`}
            >
              Invites
              {invites.length > 0 && (
                <span className="text-[11px] px-1.5 py-0.2 rounded-full bg-primary/15 text-primary font-bold">
                  {invites.length}
                </span>
              )}
            </button>
          )}

          {isAdmin && (
            <button
              onClick={() => setActiveTab("audit")}
              className={`py-2.5 px-3 font-body-ui text-[13px] font-medium border-b-2 transition-colors ${
                activeTab === "audit"
                  ? "border-primary text-primary font-bold"
                  : "border-transparent text-on-surface-variant hover:text-on-surface"
              }`}
            >
              Audit Log
            </button>
          )}

          {isAdmin && (
            <button
              onClick={() => setActiveTab("billing")}
              className={`py-2.5 px-3 font-body-ui text-[13px] font-medium border-b-2 transition-colors ${
                activeTab === "billing"
                  ? "border-primary text-primary font-bold"
                  : "border-transparent text-on-surface-variant hover:text-on-surface"
              }`}
            >
              Billing
            </button>
          )}
        </div>

        {/* Status banner for grace / lapse */}
        {activeOrg.status === "grace" && (
          <div className="mx-6 mt-4 p-3 rounded-xl border border-warning/40 bg-warning/10 text-on-surface flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-warning text-[20px]">warning</span>
              <div>
                <p className="font-body-ui text-[12px] font-bold">
                  {isAdmin ? "Payment issue — Update payment" : "Subscription issue — Ask your admin"}
                </p>
                <p className="font-body-ui text-[11px] text-on-surface-variant">
                  {isAdmin
                    ? "Payment failed or subscription lapsed. Update your card to keep team features."
                    : "Please ask your team administrator to update the organization payment method."}
                </p>
              </div>
            </div>
            {isAdmin && (
              <button
                onClick={() => openPortal(currentOrgId ?? undefined)}
                className="btn-primary rounded-lg px-3 py-1 font-body-ui text-[11px] font-bold shrink-0"
              >
                Update payment
              </button>
            )}
          </div>
        )}

        {/* Tab content body */}
        <div className="p-6 overflow-y-auto flex-1">
          {err && (
            <div className="mb-4 p-3 rounded-xl bg-error/10 border border-error/20 text-error font-body-ui text-[12px]">
              {err}
            </div>
          )}

          {/* TAB: General */}
          {activeTab === "general" && (
            <form onSubmit={handleSaveGeneral} className="space-y-5">
              <div className="space-y-1.5">
                <label className="font-body-ui text-[13px] font-semibold text-on-surface">
                  Organization Name
                </label>
                <input
                  disabled={!isAdmin}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full field px-3 py-2 rounded-xl text-[13px]"
                />
              </div>

              <div className="space-y-2.5">
                <label className="font-body-ui text-[13px] font-semibold text-on-surface block">
                  AI Search Quota Mode
                </label>
                <div className="space-y-2">
                  <label className="flex items-start gap-2.5 p-3 rounded-xl border border-outline-variant bg-surface-container-low/50 hover:bg-surface-container-low cursor-pointer transition-colors">
                    <input
                      disabled={!isAdmin}
                      type="radio"
                      name="quotaMode"
                      value="per_seat"
                      checked={quotaMode === "per_seat"}
                      onChange={() => setQuotaMode("per_seat")}
                      className="mt-0.5"
                    />
                    <div>
                      <p className="font-body-ui text-[13px] font-bold text-on-surface">Per seat (Default)</p>
                      <p className="font-body-ui text-[12px] text-on-surface-variant mt-0.5">
                        Each team member receives their own daily quota of AI scripture searches.
                      </p>
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 p-3 rounded-xl border border-outline-variant bg-surface-container-low/50 hover:bg-surface-container-low cursor-pointer transition-colors">
                    <input
                      disabled={!isAdmin}
                      type="radio"
                      name="quotaMode"
                      value="pooled"
                      checked={quotaMode === "pooled"}
                      onChange={() => setQuotaMode("pooled")}
                      className="mt-0.5"
                    />
                    <div>
                      <p className="font-body-ui text-[13px] font-bold text-on-surface">Pooled quota</p>
                      <p className="font-body-ui text-[12px] text-on-surface-variant mt-0.5">
                        All team members share one unified daily quota pool across the organization.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {isAdmin && (
                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={savingGeneral || !name.trim()}
                    className="btn-primary rounded-xl px-4 py-2 font-body-ui text-[13px] font-bold disabled:opacity-40"
                  >
                    {savingGeneral ? "Saving…" : "Save changes"}
                  </button>
                  {generalSaved && (
                    <span className="font-body-ui text-[12px] text-primary flex items-center gap-1 font-semibold">
                      <span className="material-symbols-outlined text-[16px]">check_circle</span>
                      Saved
                    </span>
                  )}
                </div>
              )}
            </form>
          )}

          {/* TAB: Members */}
          {activeTab === "members" && (
            <div className="space-y-4">
              {/* Seat meter card */}
              <div
                className={`p-3.5 rounded-xl border ${
                  seatsUsed > seatLimit
                    ? "border-error/40 bg-error/5"
                    : isFull
                      ? "border-warning/40 bg-warning/5"
                      : "border-outline-variant bg-surface-container-low"
                } flex items-center justify-between gap-3`}
              >
                <div>
                  <p className="font-body-ui text-[13px] font-bold text-on-surface">
                    Seat Usage: {seatsUsed} of {seatLimit} seats used
                  </p>
                  <p className="font-body-ui text-[12px] text-on-surface-variant">
                    {seatsUsed > seatLimit
                      ? `Remove ${seatsUsed - seatLimit} member${seatsUsed - seatLimit === 1 ? "" : "s"} or add seats.`
                      : isFull
                        ? "Your team is full. Add seats to invite more members."
                        : `${seatLimit - seatsUsed} seat${seatLimit - seatsUsed === 1 ? "" : "s"} available for new members.`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {isAdmin && (
                    <button
                      onClick={() => openCheckout("team", currentOrgId ?? undefined, Math.max(seatsUsed, seatLimit) + 5)}
                      className="ctl rounded-lg px-3 py-1.5 font-body-ui text-[12px] font-medium"
                    >
                      Add seats
                    </button>
                  )}
                  {isAdmin && (
                    <button
                      disabled={isFull}
                      onClick={() => setInviteOpen(true)}
                      className="btn-primary rounded-lg px-3.5 py-1.5 font-body-ui text-[12px] font-bold flex items-center gap-1 disabled:opacity-40"
                    >
                      <span className="material-symbols-outlined text-[16px]">person_add</span>
                      Invite
                    </button>
                  )}
                </div>
              </div>

              <MembersTable />
            </div>
          )}

          {/* TAB: Invites */}
          {activeTab === "invites" && isAdmin && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-body-ui text-[13px] text-on-surface-variant">
                  Pending and active invite tokens for this organization.
                </p>
                <button
                  onClick={() => setInviteOpen(true)}
                  className="btn-primary rounded-lg px-3 py-1.5 font-body-ui text-[12px] font-bold flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-[16px]">add</span>
                  Create invite
                </button>
              </div>

              {invites.length === 0 ? (
                <p className="p-6 text-center font-body-ui text-[13px] text-on-surface-variant">
                  No active invites. Click &ldquo;Create invite&rdquo; to invite new members.
                </p>
              ) : (
                <div className="rounded-xl border border-outline-variant overflow-hidden">
                  <table className="w-full text-left border-collapse text-[12px] font-body-ui">
                    <thead>
                      <tr className="border-b border-outline-variant bg-surface-container-low font-semibold text-on-surface-variant">
                        <th className="py-2 px-3">Target / Link</th>
                        <th className="py-2 px-3">Role</th>
                        <th className="py-2 px-3">Uses</th>
                        <th className="py-2 px-3">Expires</th>
                        <th className="py-2 px-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant">
                      {invites.map((inv) => (
                        <tr key={inv.id} className="hover:bg-surface-container-low/50">
                          <td className="py-2 px-3 font-medium text-on-surface">
                            {inv.email || "Shareable link"}
                          </td>
                          <td className="py-2 px-3 capitalize text-on-surface-variant">{inv.role}</td>
                          <td className="py-2 px-3 text-on-surface-variant">{inv.uses} of {inv.max_uses}</td>
                          <td className="py-2 px-3 text-on-surface-variant">
                            {new Date(inv.expires_at).toLocaleDateString()}
                          </td>
                          <td className="py-2 px-3 text-right">
                            <button
                              onClick={() => revokeInvite(inv.id)}
                              className="ghost text-error rounded px-2 py-0.5 text-[11px]"
                            >
                              Revoke
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB: Audit Log */}
          {activeTab === "audit" && isAdmin && (
            <div className="space-y-3">
              <p className="font-body-ui text-[13px] text-on-surface-variant">
                Recent administrative and membership actions recorded in Postgres.
              </p>
              {auditLogs.length === 0 ? (
                <p className="p-6 text-center font-body-ui text-[13px] text-on-surface-variant">
                  No audit entries yet.
                </p>
              ) : (
                <div className="rounded-xl border border-outline-variant overflow-hidden">
                  <table className="w-full text-left border-collapse text-[12px] font-body-ui">
                    <thead>
                      <tr className="border-b border-outline-variant bg-surface-container-low font-semibold text-on-surface-variant">
                        <th className="py-2 px-3">Date</th>
                        <th className="py-2 px-3">Action</th>
                        <th className="py-2 px-3">Target</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant font-metadata-mono text-[11px]">
                      {auditLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-surface-container-low/50">
                          <td className="py-2 px-3 text-on-surface-variant">
                            {new Date(log.created_at).toLocaleString()}
                          </td>
                          <td className="py-2 px-3 text-primary font-bold">{log.action}</td>
                          <td className="py-2 px-3 text-on-surface truncate max-w-[200px]">
                            {log.target || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB: Billing */}
          {activeTab === "billing" && isAdmin && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-outline-variant bg-surface-container-low space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-body-ui text-[15px] font-bold text-on-surface">
                      {planName(activeOrg.plan)}
                    </h3>
                    <p className="font-body-ui text-[12px] text-on-surface-variant">
                      Status: <span className="font-semibold capitalize text-on-surface">{activeOrg.status}</span>
                      {activeOrg.grace_until && ` (Grace period ends ${new Date(activeOrg.grace_until).toLocaleDateString()})`}
                    </p>
                  </div>
                  <button
                    onClick={() => openPortal(currentOrgId ?? undefined)}
                    className="ctl rounded-lg px-3.5 py-1.5 font-body-ui text-[12px] font-medium"
                  >
                    Manage billing
                  </button>
                </div>

                <div className="border-t border-outline-variant pt-3 flex items-center justify-between text-[13px] font-body-ui">
                  <span className="text-on-surface-variant">Seats included:</span>
                  <span className="font-semibold text-on-surface">{seatLimit} seats</span>
                </div>

                {billing?.current_period_end && (
                  <div className="flex items-center justify-between text-[13px] font-body-ui">
                    <span className="text-on-surface-variant">Next billing date:</span>
                    <span className="font-semibold text-on-surface">
                      {new Date(billing.current_period_end).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>

              <div className="p-3.5 rounded-xl border border-primary/20 bg-primary/5 flex items-center justify-between">
                <div>
                  <p className="font-body-ui text-[13px] font-bold text-on-surface">Need more seats?</p>
                  <p className="font-body-ui text-[12px] text-on-surface-variant">
                    Add seats at any time. Changes take effect immediately.
                  </p>
                </div>
                <button
                  onClick={() => openCheckout("team", currentOrgId ?? undefined, seatLimit + 5)}
                  className="btn-primary rounded-lg px-3.5 py-1.5 font-body-ui text-[12px] font-bold"
                >
                  Add 5 seats
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {inviteOpen && <InviteDialog onClose={() => setInviteOpen(false)} />}
      {acceptInviteOpen && <AcceptInviteDialog onClose={() => setAcceptInviteOpen(false)} />}
    </div>
  );
}
