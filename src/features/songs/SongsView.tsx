import { useEffect, useState } from "react";
import ConsolePaneTabs, { type ConsolePane } from "../../components/ConsolePaneTabs";
import ErrorBoundary from "../../components/ErrorBoundary";
import { ResizeHandle, useResizable } from "../../hooks/useResizable";
import { usePresentationStage } from "../../hooks/usePresentationStage";
import { columnLayoutClasses } from "../../lib/consoleDensity";
import { useAppStore } from "../../store/app";
import ImportDialog from "./ImportDialog";
import LivePanel from "./LivePanel";
import PreviewPanel from "./PreviewPanel";
import SchedulePanel from "./SchedulePanel";
import SongEditorDialog from "./SongEditorDialog";
import SongList from "./SongList";
import { useSongsLive } from "./liveStore";
import { useSongsStore } from "./songsStore";
import { useSongOutput } from "./useSongOutput";

/**
 * The Songs tab of the presentation workspace. Mirrors the Scriptures screen:
 * Schedule | Preview | Live across the top and the library below, with the song
 * editor opening as a dialog. Each region has its own boundary so a failure in
 * one (a bad song, a broken output) doesn't blank the rest.
 */
export default function SongsView() {
  const editing = useSongsStore((s) => s.editing);
  const draftKey = useSongsStore((s) => s.draftKey);
  const cancel = useSongsStore((s) => s.cancel);
  const songs = useSongsStore((s) => s.songs);
  const scheduleCount = useSongsLive((s) => s.schedule.length);
  const presentationActive = useAppStore((s) => s.presentationActive);
  const splitConsoleColumns = useAppStore((s) => s.splitConsoleColumns);
  const [importing, setImporting] = useState(false);
  const [pane, setPane] = useState<ConsolePane>("preview");
  const layout = columnLayoutClasses(pane, splitConsoleColumns);
  const stage = usePresentationStage(presentationActive);

  const queueW = useResizable({
    storageKey: "scriptura.songs.queueWidth", initial: Math.round(window.innerWidth * 0.22), min: 150, axis: "x",
    max: () => Math.max(150, Math.round(window.innerWidth * 0.34)),
  });
  const liveW = useResizable({
    storageKey: "scriptura.songs.liveWidth", initial: Math.round(window.innerWidth * 0.27), min: 175, axis: "x", invert: true,
    max: () => Math.max(175, Math.round(window.innerWidth * 0.38)),
  });
  const bottomH = useResizable({
    storageKey: "scriptura.songs.bottomHeight", initial: Math.round(window.innerHeight * 0.38), min: 130, axis: "y", invert: true,
    max: () => Math.max(160, window.innerHeight - 240),
  });

  useSongOutput();

  useEffect(() => { void useSongsLive.getState().load(); }, []);
  // The library changed (edit, delete, import): refresh scheduled titles and the preview.
  useEffect(() => { void useSongsLive.getState().syncWithLibrary(); }, [songs]);

  // PageDown / PageUp step the live slide, like a clicker.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.key === "PageDown") { e.preventDefault(); useSongsLive.getState().stepLive(1); }
      if (e.key === "PageUp") { e.preventDefault(); useSongsLive.getState().stepLive(-1); }
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
        <ErrorBoundary compact label="Song library"><SongList onImport={() => setImporting(true)} /></ErrorBoundary>
      </div>

      {editing && (
        <ErrorBoundary key={draftKey} compact label="Song editor" onReset={cancel}>
          <SongEditorDialog key={draftKey} />
        </ErrorBoundary>
      )}
      {importing && <ImportDialog onClose={() => setImporting(false)} />}
    </div>
  );
}
