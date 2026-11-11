import { useEffect } from "react";
import { useTeamShareStore } from "./teamShareStore.ts";
import TeamScriptureNotification from "./TeamScriptureNotification.tsx";

export default function TeamScriptureNotificationHost() {
  const notifications = useTeamShareStore((s) => s.notifications);
  const toast = useTeamShareStore((s) => s.toast);
  const clearToast = useTeamShareStore((s) => s.clearToast);
  const initRealtime = useTeamShareStore((s) => s.initRealtime);

  // Initialize Realtime subscription
  useEffect(() => {
    return initRealtime();
  }, [initRealtime]);

  return (
    <>
      {/* Floating Verse Notifications (Top-Right) */}
      {notifications.length > 0 && (
        <aside
          aria-label="Team Scripture Notifications"
          className="fixed top-14 right-4 z-[9999] flex flex-col gap-2.5 pointer-events-auto max-h-[calc(100vh-5rem)] overflow-y-auto p-1 animate-in fade-in slide-in-from-top-4 duration-200"
        >
          {notifications.map((item) => (
            <TeamScriptureNotification key={item.id} item={item} />
          ))}
        </aside>
      )}

      {/* Ephemeral Toast Feedback (Top-Center) */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          onClick={clearToast}
          className="fixed top-14 left-1/2 -translate-x-1/2 z-[10000] pointer-events-auto cursor-pointer animate-in fade-in slide-in-from-top-2 duration-150"
        >
          <div
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl glass shadow-lg border text-[12px] font-body-ui font-semibold ${
              toast.type === "error"
                ? "border-red-500/50 bg-red-950/70 text-red-200"
                : toast.type === "info"
                ? "border-primary/40 bg-surface-container-high/90 text-primary"
                : "border-emerald-500/40 bg-surface-container-high/90 text-emerald-300"
            }`}
          >
            <span className="material-symbols-outlined !text-[16px]">
              {toast.type === "error" ? "error" : toast.type === "info" ? "info" : "check_circle"}
            </span>
            <span>{toast.message}</span>
          </div>
        </div>
      )}
    </>
  );
}
