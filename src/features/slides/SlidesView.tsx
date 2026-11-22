import { useEffect, useState } from "react";
import ConsolePaneTabs, { type ConsolePane } from "../../components/ConsolePaneTabs";
import ErrorBoundary from "../../components/ErrorBoundary";
import { ResizeHandle, useResizable } from "../../hooks/useResizable";
import { usePresentationStage } from "../../hooks/usePresentationStage";
import { columnLayoutClasses } from "../../lib/consoleDensity";
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
  const scheduleCount = useSlidesLive((s) => s.schedule.length);
  const presentationActive = useAppStore((s) => s.presentationActive);
  const splitConsoleColumns = useAppStore((s) => s.splitConsoleColumns);
  const stage = usePresentationStage(presentationActive);
  const [pane, setPane] = useState<ConsolePane>("preview");
  const layout = columnLayoutClasses(pane, splitConsoleColumns);

  const queueW = useResizable({
    storageKey: "scriptura.slides.queueWidth", initial: Math.round(window.innerWidth * 0.22), min: 150, axis: "x",
    max: () => Math.max(150, Math.round(window.innerWidth * 0.34)),
  });
  const liveW = useResizable({
    storageKey: "scriptura.slides.liveWidth", initial: Math.round(window.innerWidth * 0.27), min: 175, axis: "x", invert: true,
    max: () => Math.max(175, Math.round(window.innerWidth * 0.38)),
  });
  const bottomH = useResizable({
    storageKey: "scriptura.slides.bottomHeight", initial: Math.round(window.innerHeight * 0.38), min: 130, axis: "y", invert: true,
    max: () => Math.max(160, window.innerHeight - 240),
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
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden p-[var(--c-shell-pad,10px)] gap-[var(--c-shell-gap,10px)]">
      <ConsolePaneTabs pane={pane} onChange={setPane} scheduleCount={scheduleCount} liveActive={presentationActive} />

      <div className="flex-1 min-h-0 flex overflow-hidden">
        <ErrorBoundary compact label="Schedule"><SchedulePanel width={queueW.size} className={layout.scheduleShow} /></ErrorBoundary>
        <div className={layout.handleShow}>
          <ResizeHandle spaced axis="x" label="schedule" dragging={queueW.dragging} handleProps={queueW.handleProps} />
        </div>
        <ErrorBoundary compact label="Preview"><PreviewPanel stage={stage} className={layout.previewShow} /></ErrorBoundary>
        <div className={layout.handleShow}>
          <ResizeHandle spaced axis="x" label="live" dragging={liveW.dragging} handleProps={liveW.handleProps} />
        </div>
        <ErrorBoundary compact label="Live"><LivePanel width={liveW.size} stage={stage} className={layout.liveShow} /></ErrorBoundary>
      </div>

      <ResizeHandle axis="y" label="library" dragging={bottomH.dragging} handleProps={bottomH.handleProps} />

      <div style={{ height: bottomH.size, maxHeight: "52%" }} className="shrink-0 panel rounded-[var(--c-radius,16px)] flex overflow-hidden">
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
