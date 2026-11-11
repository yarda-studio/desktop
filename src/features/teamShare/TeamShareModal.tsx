import { useEffect, useRef, useState } from "react";
import { useDialogA11y } from "../../hooks/useDialogA11y.ts";
import { useOrgStore } from "../orgs/orgStore.ts";
import { useTeamShareStore } from "./teamShareStore.ts";
import { formatScriptureRefLabel, type ShareTarget } from "./teamShareLogic.ts";

export default function TeamShareModal() {
  const open = useTeamShareStore((s) => s.shareModalOpen);
  const close = useTeamShareStore((s) => s.closeShareModal);
  const draft = useTeamShareStore((s) => s.shareModalVerse);
  const defaultTarget = useTeamShareStore((s) => s.defaultTarget);
  const sendVerse = useTeamShareStore((s) => s.sendVerse);
  const members = useOrgStore((s) => s.members);

  const [target, setTarget] = useState<ShareTarget>(defaultTarget);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useDialogA11y(dialogRef, open, close);

  useEffect(() => {
    if (open) {
      setTarget(defaultTarget);
      setNote("");
      setSending(false);
    }
  }, [open, defaultTarget]);

  if (!open || !draft) return null;

  const refLabel = formatScriptureRefLabel(
    draft.ref.book,
    draft.ref.chapter,
    draft.ref.verse,
    draft.verseEnd
  );

  async function handleSend() {
    setSending(true);
    const ok = await sendVerse({
      ref: draft!.ref,
      verseEnd: draft!.verseEnd,
      module: draft!.module,
      text: draft!.text,
      note: note.trim() || undefined,
      target,
    });
    setSending(false);
    if (ok) close();
  }

  return (
    <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-verse-title"
        className="w-full max-w-md glass rounded-2xl shadow-2xl border border-outline-variant/60 p-5 space-y-4 animate-in zoom-in-95 duration-150"
      >
        <div className="flex items-center justify-between pb-2 border-b border-outline-variant/40">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined !text-[20px] text-primary">forward_to_inbox</span>
            <h2 id="share-verse-title" className="font-headline-sm text-[16px] font-bold text-on-surface">
              Send Verse to Team
            </h2>
          </div>
          <button
            onClick={close}
            className="p-1 rounded-md text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/40"
            aria-label="Close"
          >
            <span className="material-symbols-outlined !text-[18px]">close</span>
          </button>
        </div>

        {/* Verse preview box */}
        <div className="p-3 rounded-xl bg-surface-container-high/60 border border-outline-variant/40 space-y-1">
          <div className="flex items-baseline justify-between">
            <span className="font-headline-sm text-[15px] font-bold text-on-surface">{refLabel}</span>
            {draft.module && (
              <span className="text-[10px] font-metadata-mono text-on-surface-variant uppercase">
                {draft.module}
              </span>
            )}
          </div>
          {draft.text && (
            <p className="text-[12px] font-body-reading italic text-on-surface line-clamp-3">
              “{draft.text}”
            </p>
          )}
        </div>

        {/* Recipient selection */}
        <div className="space-y-1.5">
          <label className="text-[12px] font-body-ui font-semibold text-on-surface-variant">
            Recipient
          </label>
          <select
            value={target.type === "all" ? "all" : target.userId}
            onChange={(e) => {
              const val = e.target.value;
              if (val === "all") {
                setTarget({ type: "all" });
              } else {
                const member = members.find((m) => m.user_id === val);
                const name = member?.full_name?.trim() || member?.email?.split("@")[0] || "Member";
                setTarget({ type: "member", userId: val, name });
              }
            }}
            className="w-full px-3 py-2 rounded-lg bg-surface border border-outline-variant text-[13px] font-body-ui text-on-surface focus:outline-none focus:border-primary"
          >
            <option value="all">👥 Entire Team (All Members)</option>
            {members.map((m) => {
              const name = m.full_name?.trim() || m.email?.split("@")[0] || "Member";
              return (
                <option key={m.user_id} value={m.user_id}>
                  👤 {name} {m.email ? `(${m.email})` : ""}
                </option>
              );
            })}
          </select>
        </div>

        {/* Optional note */}
        <div className="space-y-1.5">
          <label className="text-[12px] font-body-ui font-semibold text-on-surface-variant">
            Note to Team <span className="font-normal text-[11px] text-on-surface-variant/70">(Optional)</span>
          </label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Pastor called this out, or next scripture"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            className="w-full px-3 py-2 rounded-lg bg-surface border border-outline-variant text-[13px] font-body-ui text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary"
          />
        </div>

        {/* Footer buttons */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-outline-variant/40">
          <button
            onClick={close}
            disabled={sending}
            className="px-3 py-1.5 rounded-lg text-[13px] font-body-ui text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/40"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[13px] font-body-ui font-bold btn-primary disabled:opacity-50"
          >
            <span className="material-symbols-outlined !text-[16px]">send</span>
            <span>{sending ? "Sending…" : "Send Scripture"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
