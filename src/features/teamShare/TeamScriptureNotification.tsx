import { useEffect, useRef, useState } from "react";
import type { TeamScriptureNotification as TeamScriptureNotificationType } from "./teamShareLogic.ts";
import { formatScriptureRefLabel, formatRelativeTime } from "./teamShareLogic.ts";
import { useTeamShareStore } from "./teamShareStore.ts";

export default function TeamScriptureNotification({
  item,
}: {
  item: TeamScriptureNotificationType;
}) {
  const dismiss = useTeamShareStore((s) => s.dismissNotification);
  const act = useTeamShareStore((s) => s.actOnNotification);
  const [hovered, setHovered] = useState(false);
  const [progress, setProgress] = useState(100);
  const durationMs = 25000;
  const startTimeRef = useRef(Date.now());
  const elapsedRef = useRef(0);

  // Auto-dismiss timer that pauses on hover
  useEffect(() => {
    if (item.handled) return;

    const interval = setInterval(() => {
      if (hovered) {
        startTimeRef.current = Date.now() - elapsedRef.current;
        return;
      }
      const elapsed = Date.now() - startTimeRef.current;
      elapsedRef.current = elapsed;
      const remainingPct = Math.max(0, 100 - (elapsed / durationMs) * 100);
      setProgress(remainingPct);

      if (elapsed >= durationMs) {
        clearInterval(interval);
        dismiss(item.id);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [hovered, item.handled, item.id, dismiss]);

  const refLabel = formatScriptureRefLabel(item.book, item.chapter, item.verse, item.verseEnd);

  function handleDoubleClick(e: React.MouseEvent) {
    e.stopPropagation();
    act(item.id, "live");
  }

  function handleSendLive(e: React.MouseEvent) {
    e.stopPropagation();
    act(item.id, "live");
  }

  function handleAddToSchedule(e: React.MouseEvent) {
    e.stopPropagation();
    act(item.id, "schedule");
  }

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDoubleClick={handleDoubleClick}
      className={`relative w-96 max-w-[calc(100vw-2rem)] glass shadow-2xl rounded-2xl border transition-all duration-300 overflow-hidden cursor-pointer select-none ${
        item.handled === "live"
          ? "border-emerald-500/80 bg-emerald-950/40 ring-2 ring-emerald-500/40 scale-[1.02]"
          : item.handled === "schedule"
          ? "border-primary/80 bg-primary/10 ring-2 ring-primary/40 scale-[1.02]"
          : "border-outline-variant/70 hover:border-primary/50 hover:shadow-primary/10"
      }`}
      title="Double-click to send Live immediately"
      role="alert"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 pt-3 pb-1.5 border-b border-outline-variant/30">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse shrink-0" />
          <span className="material-symbols-outlined !text-[15px] text-primary shrink-0">
            forward_to_inbox
          </span>
          <span className="text-[12px] font-body-ui font-semibold text-on-surface truncate">
            Verse from <span className="text-primary">{item.senderName}</span>
          </span>
          <span className="text-[11px] text-on-surface-variant/70 shrink-0 ml-1">
            • {formatRelativeTime(item.createdAt)}
          </span>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            dismiss(item.id);
          }}
          className="p-1 rounded-md text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/40 transition-colors shrink-0"
          title="Dismiss notification"
          aria-label="Dismiss"
        >
          <span className="material-symbols-outlined !text-[16px]">close</span>
        </button>
      </div>

      {/* Main Content */}
      <div className="p-3.5 space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="font-headline-sm text-[16px] font-bold text-on-surface tracking-tight">
            {refLabel}
          </h3>
          {item.module && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-metadata-mono font-medium bg-surface-container-high border border-outline-variant/40 text-on-surface-variant uppercase">
              {item.module}
            </span>
          )}
        </div>

        <p className="font-body-reading text-[13px] leading-relaxed text-on-surface line-clamp-3 italic">
          “{item.text}”
        </p>

        {item.note && (
          <div className="flex items-start gap-1.5 p-2 rounded-lg bg-surface-container-high/60 border border-outline-variant/30 text-[12px] text-on-surface-variant">
            <span className="material-symbols-outlined !text-[14px] text-primary mt-0.5 shrink-0">
              chat_bubble_outline
            </span>
            <span className="italic">{item.note}</span>
          </div>
        )}

        {/* Handled status banner */}
        {item.handled && (
          <div
            className={`flex items-center justify-center gap-1.5 py-1 px-2 rounded-lg text-[12px] font-bold transition-all ${
              item.handled === "live"
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                : "bg-primary/20 text-primary border border-primary/40"
            }`}
          >
            <span className="material-symbols-outlined !text-[16px]">check_circle</span>
            <span>{item.handled === "live" ? "Sent Live to Screen!" : "Added to Schedule!"}</span>
          </div>
        )}
      </div>

      {/* Action Footer */}
      {!item.handled && (
        <div className="px-3.5 pb-3 pt-1 flex items-center justify-between gap-2 bg-surface-variant/15 border-t border-outline-variant/30">
          <span className="text-[11px] font-body-ui text-on-surface-variant/80 flex items-center gap-1">
            <span className="material-symbols-outlined !text-[13px] text-primary">touch_app</span>
            <span className="hidden sm:inline">Double-click:</span>
            <strong className="text-on-surface">Go Live</strong>
          </span>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={handleAddToSchedule}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[12px] font-body-ui font-semibold text-on-surface hover:text-primary bg-surface-variant/50 hover:bg-surface-variant/80 border border-outline-variant/50 transition-colors"
              title="Add this verse to the Service Schedule (queue)"
            >
              <span className="material-symbols-outlined !text-[14px]">queue_play_next</span>
              <span>Schedule</span>
            </button>

            <button
              onClick={handleSendLive}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[12px] font-body-ui font-bold btn-primary transition-all shadow-xs"
              title="Send directly to the live presentation screen"
            >
              <span className="material-symbols-outlined !text-[15px]">play_arrow</span>
              <span>Go Live</span>
            </button>
          </div>
        </div>
      )}

      {/* Auto-dismiss progress bar */}
      {!item.handled && (
        <div className="h-0.5 w-full bg-outline-variant/20 overflow-hidden">
          <div
            className="h-full bg-primary/70 transition-all duration-100 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}
