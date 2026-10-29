import { useState } from "react";
import { useOrgStore } from "./orgStore.ts";

interface Props {
  onClose: () => void;
}

export default function InviteDialog({ onClose }: Props) {
  const inviteMember = useOrgStore((s) => s.inviteMember);
  const activeOrg = useOrgStore((s) => s.activeOrg);
  const members = useOrgStore((s) => s.members);

  const [mode, setMode] = useState<"email" | "link">("email");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member" | "viewer">("member");
  const [maxUses, setMaxUses] = useState(5);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const seatLimit = activeOrg?.seat_limit ?? 1;
  const seatsUsed = members.length;
  const isFull = seatsUsed >= seatLimit;

  async function handleCreateInvite(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);

    try {
      const token = await inviteMember({
        email: mode === "email" ? email.trim() : undefined,
        role,
        maxUses: mode === "email" ? 1 : maxUses,
        expiresHours: 168, // 7 days
      });
      setGeneratedToken(token);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to create invite.");
    } finally {
      setLoading(false);
    }
  }

  function handleCopy(text: string) {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const joinUrl = generatedToken ? `yarda://join?token=${generatedToken}` : "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-2xl border border-outline-variant bg-surface p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-primary">person_add</span>
            <h3 className="font-body-ui text-[15px] font-bold text-on-surface">Invite to {activeOrg?.name}</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-md ghost text-on-surface-variant">
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Seat warning */}
        {isFull && (
          <div className="p-3 rounded-xl border border-warning/40 bg-warning/5 text-on-surface space-y-1">
            <p className="font-body-ui text-[12px] font-bold flex items-center gap-1.5 text-warning">
              <span className="material-symbols-outlined text-[16px]">warning</span>
              All seats are currently filled ({seatsUsed}/{seatLimit})
            </p>
            <p className="font-body-ui text-[12px] text-on-surface-variant">
              You can generate invites, but new members cannot join until you add seats or remove members.
            </p>
          </div>
        )}

        {generatedToken ? (
          <div className="space-y-3">
            <p className="font-body-ui text-[13px] text-on-surface">
              Invite created! Copy the code or link below. <strong>This code is shown only once.</strong>
            </p>

            <div className="space-y-1.5">
              <label className="font-body-ui text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider">
                Invite Code
              </label>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={generatedToken}
                  className="field flex-1 px-3 py-1.5 font-metadata-mono text-[13px] rounded-lg select-all"
                />
                <button
                  onClick={() => handleCopy(generatedToken)}
                  className="btn-primary rounded-lg px-3 py-1.5 text-[12px] font-bold"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="font-body-ui text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider">
                App Deep Link
              </label>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={joinUrl}
                  className="field flex-1 px-3 py-1.5 font-metadata-mono text-[12px] rounded-lg select-all text-on-surface-variant"
                />
                <button
                  onClick={() => handleCopy(joinUrl)}
                  className="ctl rounded-lg px-3 py-1.5 text-[12px]"
                >
                  Copy Link
                </button>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button onClick={onClose} className="btn-primary rounded-lg px-4 py-1.5 text-[13px] font-bold">
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleCreateInvite} className="space-y-3.5">
            {err && (
              <div className="p-2.5 rounded-lg bg-error/10 border border-error/20 text-error font-body-ui text-[12px]">
                {err}
              </div>
            )}

            {/* Mode tabs */}
            <div className="flex rounded-lg bg-surface-container-low p-1 border border-outline-variant">
              <button
                type="button"
                onClick={() => setMode("email")}
                className={`flex-1 py-1 rounded-md text-[12px] font-body-ui font-medium transition-colors ${
                  mode === "email" ? "bg-surface shadow-xs text-on-surface font-bold" : "text-on-surface-variant"
                }`}
              >
                By Email (Single-use)
              </button>
              <button
                type="button"
                onClick={() => setMode("link")}
                className={`flex-1 py-1 rounded-md text-[12px] font-body-ui font-medium transition-colors ${
                  mode === "link" ? "bg-surface shadow-xs text-on-surface font-bold" : "text-on-surface-variant"
                }`}
              >
                Shareable Link / Code
              </button>
            </div>

            {mode === "email" ? (
              <div className="space-y-1">
                <label className="font-body-ui text-[12px] font-medium text-on-surface">Member Email</label>
                <input
                  required
                  type="email"
                  placeholder="pastor@church.org"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full field px-3 py-1.5 rounded-lg text-[13px]"
                />
                <p className="font-body-ui text-[11px] text-on-surface-variant">
                  Only the account signed in with this email will be able to accept.
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                <label className="font-body-ui text-[12px] font-medium text-on-surface">Maximum Uses</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={maxUses}
                  onChange={(e) => setMaxUses(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="w-full field px-3 py-1.5 rounded-lg text-[13px]"
                />
                <p className="font-body-ui text-[11px] text-on-surface-variant">
                  Share this code with up to {maxUses} team members. Expires in 7 days.
                </p>
              </div>
            )}

            <div className="space-y-1">
              <label className="font-body-ui text-[12px] font-medium text-on-surface">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as any)}
                className="w-full field px-3 py-1.5 rounded-lg text-[13px] capitalize"
              >
                <option value="member">Member (Can edit and present)</option>
                <option value="viewer">Viewer (Read-only)</option>
                <option value="admin">Admin (Can manage members and settings)</option>
              </select>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-outline-variant">
              <button
                type="button"
                onClick={onClose}
                className="ghost rounded-lg px-3 py-1.5 text-[12px] font-body-ui"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="btn-primary rounded-lg px-4 py-1.5 text-[12px] font-bold font-body-ui disabled:opacity-40"
              >
                {loading ? "Generating…" : "Create invite"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
