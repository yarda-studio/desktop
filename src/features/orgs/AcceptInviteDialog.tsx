import { useState } from "react";
import { useOrgStore } from "./orgStore.ts";

interface Props {
  onClose: () => void;
}

export default function AcceptInviteDialog({ onClose }: Props) {
  const joinOrg = useOrgStore((s) => s.joinOrg);
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim()) return;

    setLoading(true);
    setErr(null);

    try {
      await joinOrg(token.trim());
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't join organization.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-2xl border border-outline-variant bg-surface p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-primary">groups</span>
            <h3 className="font-body-ui text-[15px] font-bold text-on-surface">Join Organization</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-md ghost text-on-surface-variant">
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        <p className="font-body-ui text-[13px] text-on-surface-variant leading-relaxed">
          Paste the invite code or link provided by your church or worship team leader to join.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {err && (
            <div className="p-2.5 rounded-lg bg-error/10 border border-error/20 text-error font-body-ui text-[12px]">
              {err}
            </div>
          )}

          <div className="space-y-1">
            <label className="font-body-ui text-[12px] font-medium text-on-surface">
              Invite code or link
            </label>
            <input
              required
              autoFocus
              type="text"
              placeholder="yarda://join?token=... or invite token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="w-full field px-3 py-2 font-metadata-mono text-[13px] rounded-lg"
            />
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
              disabled={loading || !token.trim()}
              className="btn-primary rounded-lg px-4 py-1.5 text-[12px] font-bold font-body-ui disabled:opacity-40"
            >
              {loading ? "Joining team…" : "Join organization"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
