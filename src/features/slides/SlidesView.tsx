import { useEffect } from "react";
import ErrorBoundary from "../../components/ErrorBoundary";
import { ResizeHandle, useResizable } from "../../hooks/useResizable";
import { usePresentationStage } from "../../hooks/usePresentationStage";
import { useAppStore } from "../../store/app";
import LivePanel from "./LivePanel";
import PreviewPanel from "./PreviewPanel";
import SchedulePanel from "./SchedulePanel";
import SlideEditorDialog from "./SlideEditorDialog";
import SlideLibrary from "./SlideLibrary";
import { useSlidesLive } from "./liveStore";
import { useSlidesStore } from "./slidesStore";
import { useSlideOutput } from "./useSlideOutput";

/**
 * The Slides tab of the presentation workspace: announcements and free-form
 * slides. Same shape as the Songs tab, with Schedule | Preview | Live across
 * the top and the library below. Each region has its own boundary so a failure
 * in one doesn't blank the rest.
 */
export default function SlidesView() {
  const editing = useSlidesStore((s) => s.draft !== null);
  const draftKey = useSlidesStore((s) => s.draftKey);
  const cancel = useSlidesStore((s) => s.cancel);
  const slides = useSlidesStore((s) => s.slides);
  const presentationActive = useAppStore((s) => s.presentationActive);
  const stage = usePresentationStage(presentationActive);

  const queueW = useResizable({
    storageKey: "scriptura.slides.queueWidth", initial: Math.round(window.innerWidth * 0.24), min: 180, axis: "x",
    max: () => Math.round(window.innerWidth * 0.4),
  });
  const liveW = useResizable({
    storageKey: "scriptura.slides.liveWidth", initial: Math.round(window.innerWidth * 0.3), min: 240, axis: "x", invert: true,
    max: () => Math.round(window.innerWidth * 0.5),
  });
  const bottomH = useResizable({
    storageKey: "scriptura.slides.bottomHeight", initial: Math.round(window.innerHeight * 0.36), min: 200, axis: "y", invert: true,
    max: () => window.innerHeight - 260,
  });

  useSlideOutput();

  useEffect(() => { void useSlidesLive.getState().load(); }, []);
  // The library changed (edit, delete): refresh scheduled titles and the preview.
  useEffect(() => { void useSlidesLive.getState().syncWithLibrary(); }, [slides]);

  // PageDown / PageUp step through the scheduled slides, like a clicker.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.key === "PageDown") { e.preventDefault(); void useSlidesLive.getState().stepLive(1); }
      if (e.key === "PageUp") { e.preventDefault(); void useSlidesLive.getState().stepLive(-1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden p-2.5 gap-2.5">
      <div className="flex-1 min-h-0 flex overflow-hidden">
        <ErrorBoundary compact label="Schedule"><SchedulePanel width={queueW.size} /></ErrorBoundary>
        <ResizeHandle spaced axis="x" label="schedule" dragging={queueW.dragging} handleProps={queueW.handleProps} />
        <ErrorBoundary compact label="Preview"><PreviewPanel stage={stage} /></ErrorBoundary>
        <ResizeHandle spaced axis="x" label="live" dragging={liveW.dragging} handleProps={liveW.handleProps} />
        <ErrorBoundary compact label="Live"><LivePanel width={liveW.size} stage={stage} /></ErrorBoundary>
      </div>

      <ResizeHandle axis="y" label="library" dragging={bottomH.dragging} handleProps={bottomH.handleProps} />

      <div style={{ height: bottomH.size }} className="shrink-0 panel rounded-3xl flex overflow-hidden">
        <ErrorBoundary compact label="Slide library"><SlideLibrary /></ErrorBoundary>
      </div>

      {editing && (
        <ErrorBoundary key={draftKey} compact label="Slide editor" onReset={cancel}>
          <SlideEditorDialog key={draftKey} />
        </ErrorBoundary>
      )}
    </div>
  );
}
