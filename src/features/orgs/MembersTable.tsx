import { useState } from "react";
import { useOrgStore } from "./orgStore.ts";
import { useAccountStore } from "../../store/accountStore.ts";
import type { OrgMember } from "./api.ts";

export default function MembersTable() {
  const members = useOrgStore((s) => s.members);
  const activeOrg = useOrgStore((s) => s.activeOrg);
  const changeRole = useOrgStore((s) => s.changeRole);
  const removeMember = useOrgStore((s) => s.removeMember);
  const leaveOrg = useOrgStore((s) => s.leaveOrg);
  const transferOwnership = useOrgStore((s) => s.transferOwnership);
  const myEmail = useAccountStore((s) => s.email);

  const [transferTarget, setTransferTarget] = useState<OrgMember | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<OrgMember | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Determine current user's role in this org
  const myMemberRecord = members.find((m) => m.email === myEmail);
  const myRole = myMemberRecord?.role ?? (activeOrg?.owner_id === myMemberRecord?.user_id ? "owner" : "viewer");
  const isOwner = myRole === "owner";
  const isAdmin = myRole === "admin" || isOwner;

  async function handleRoleChange(userId: string, newRole: "admin" | "member" | "viewer") {
    setBusy(true);
    setErr(null);
    try {
      await changeRole(userId, newRole);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to change member role.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveMember() {
    if (!memberToRemove) return;
    setBusy(true);
    setErr(null);
    try {
      await removeMember(memberToRemove.user_id);
      setMemberToRemove(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to remove member.");
    } finally {
      setBusy(false);
    }
  }

  async function handleLeave() {
    setBusy(true);
    setErr(null);
    try {
      await leaveOrg();
      setLeaving(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to leave organization.");
    } finally {
      setBusy(false);
    }
  }

  async function handleTransferOwnership() {
    if (!transferTarget) return;
    setBusy(true);
    setErr(null);
    try {
      await transferOwnership(transferTarget.user_id);
      setTransferTarget(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to transfer ownership.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {err && (
        <div className="p-2.5 rounded-lg bg-error/10 border border-error/20 text-error font-body-ui text-[12px]">
          {err}
        </div>
      )}

      <div className="rounded-xl border border-outline-variant overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-outline-variant bg-surface-container-low text-[11px] font-body-ui font-semibold text-on-surface-variant uppercase tracking-wider">
              <th className="py-2.5 px-3">Member</th>
              <th className="py-2.5 px-3">Role</th>
              <th className="py-2.5 px-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant text-[13px] font-body-ui">
            {members.map((m) => {
              const isMe = m.email === myEmail;
              const isTargetOwner = m.role === "owner";
              const isTargetAdmin = m.role === "admin";

              return (
                <tr key={m.user_id} className="hover:bg-surface-container-low/50 transition-colors">
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[11px]">
                        {(m.email?.[0] ?? "U").toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-on-surface truncate">
                          {m.full_name || m.email || "Unknown user"}
                          {isMe && <span className="ml-1 text-[11px] text-on-surface-variant font-normal">(You)</span>}
                        </p>
                        {m.full_name && m.email && (
                          <p className="text-[11px] text-on-surface-variant truncate">{m.email}</p>
                        )}
                      </div>
                    </div>
                  </td>

                  <td className="py-2.5 px-3">
                    {/* Role selector for Owner (all) or Admin (member <-> viewer) */}
                    {isOwner && !isTargetOwner ? (
                      <select
                        value={m.role}
                        disabled={busy}
                        onChange={(e) => handleRoleChange(m.user_id, e.target.value as any)}
                        className="field px-2 py-1 text-[12px] rounded-md capitalize"
                      >
                        <option value="admin">Admin</option>
                        <option value="member">Member</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    ) : isAdmin && !isTargetOwner && !isTargetAdmin && !isMe ? (
                      <select
                        value={m.role}
                        disabled={busy}
                        onChange={(e) => handleRoleChange(m.user_id, e.target.value as any)}
                        className="field px-2 py-1 text-[12px] rounded-md capitalize"
                      >
                        <option value="member">Member</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    ) : (
                      <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-medium bg-surface-variant text-on-surface-variant capitalize">
                        {m.role}
                      </span>
                    )}
                  </td>

                  <td className="py-2.5 px-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {isOwner && !isTargetOwner && (
                        <button
                          onClick={() => setTransferTarget(m)}
                          disabled={busy}
                          className="ghost text-on-surface-variant hover:text-on-surface rounded px-2 py-1 text-[11px]"
                          title="Transfer ownership of this organization to this member"
                        >
                          Transfer ownership
                        </button>
                      )}

                      {/* Remove member button: Owner can remove anyone except self; Admin can remove members/viewers */}
                      {((isOwner && !isTargetOwner) || (isAdmin && !isTargetOwner && !isTargetAdmin)) && (
                        <button
                          onClick={() => setMemberToRemove(m)}
                          disabled={busy}
                          className="ghost text-error hover:bg-error/10 rounded px-2 py-1 text-[11px]"
                        >
                          Remove
                        </button>
                      )}

                      {/* Leave button if this row is me and I'm not owner */}
                      {isMe && !isOwner && (
                        <button
                          onClick={() => setLeaving(true)}
                          disabled={busy}
                          className="ghost text-error hover:bg-error/10 rounded px-2 py-1 text-[11px]"
                        >
                          Leave team
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Confirmation: Remove Member */}
      {memberToRemove && (
        <div className="p-3 rounded-xl border border-error/30 bg-error/5 space-y-2">
          <p className="font-body-ui text-[13px] font-semibold text-on-surface">
            Remove {memberToRemove.email || "this member"} from the team?
          </p>
          <p className="font-body-ui text-[12px] text-on-surface-variant">
            They will lose access to team resources and shared presentations immediately.
          </p>
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleRemoveMember}
              disabled={busy}
              className="btn-primary !bg-error rounded-lg px-3 py-1 font-body-ui text-[12px] font-bold"
            >
              {busy ? "Removing…" : "Remove member"}
            </button>
            <button
              onClick={() => setMemberToRemove(null)}
              disabled={busy}
              className="ghost rounded-lg px-3 py-1 font-body-ui text-[12px]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Confirmation: Leave Org */}
      {leaving && (
        <div className="p-3 rounded-xl border border-error/30 bg-error/5 space-y-2">
          <p className="font-body-ui text-[13px] font-semibold text-on-surface">
            Leave {activeOrg?.name}?
          </p>
          <p className="font-body-ui text-[12px] text-on-surface-variant">
            You will lose access to the shared library and pooled search quotas.
          </p>
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleLeave}
              disabled={busy}
              className="btn-primary !bg-error rounded-lg px-3 py-1 font-body-ui text-[12px] font-bold"
            >
              {busy ? "Leaving…" : "Yes, leave team"}
            </button>
            <button
              onClick={() => setLeaving(false)}
              disabled={busy}
              className="ghost rounded-lg px-3 py-1 font-body-ui text-[12px]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Confirmation: Transfer Ownership */}
      {transferTarget && (
        <div className="p-3 rounded-xl border border-warning/40 bg-warning/5 space-y-2">
          <p className="font-body-ui text-[13px] font-semibold text-on-surface">
            Transfer organization ownership to {transferTarget.email}?
          </p>
          <p className="font-body-ui text-[12px] text-on-surface-variant">
            They will become the primary owner with control over billing and deletion. Your role will change to Admin.
          </p>
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleTransferOwnership}
              disabled={busy}
              className="btn-primary rounded-lg px-3 py-1 font-body-ui text-[12px] font-bold"
            >
              {busy ? "Transferring…" : "Confirm transfer"}
            </button>
            <button
              onClick={() => setTransferTarget(null)}
              disabled={busy}
              className="ghost rounded-lg px-3 py-1 font-body-ui text-[12px]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
