import { useAppStore } from "../../store/app";
import { useAiSearchStore } from "../../store/aiSearchStore";

/**
 * A flat, comparable picture of the app state that tour tasks care about. Tasks
 * compare "now" against the snapshot taken when the task began, so they complete
 * on a real change ("you moved to another verse"), never on a value that was
 * already true.
 */
export interface Snap {
  view: string;
  /** "Book 1:1" — the live/reading position. */
  verseKey: string;
  chapterKey: string;
  book: string;
  versePart: number;
  queueLength: number;
  liveHistoryLength: number;
  black: boolean;
  emergency: boolean;
  aiOpen: boolean;
  aiQuery: string;
  parallel: boolean;
  fontSize: number;
  fullscreen: boolean;
  strongs: string | null;
  theme: string;
  showStrongs: boolean;
}

export function takeSnapshot(): Snap {
  const s = useAppStore.getState();
  const ai = useAiSearchStore.getState();
  const r = s.currentRef;
  return {
    view: s.view,
    verseKey: `${r.book} ${r.chapter}:${r.verse}`,
    chapterKey: `${r.book} ${r.chapter}`,
    book: r.book,
    versePart: s.versePart,
    queueLength: s.serviceOrder.length,
    liveHistoryLength: s.liveHistory.length,
    black: s.liveBlack,
    emergency: s.liveEmergency,
    aiOpen: ai.open,
    aiQuery: ai.query,
    parallel: s.parallelMode,
    fontSize: s.readingFontSize,
    fullscreen: s.isFullscreen,
    strongs: s.selectedStrongs,
    theme: s.theme,
    showStrongs: s.showStrongs,
  };
}

/** Calls `cb` whenever any watched store changes. Returns the unsubscribe. */
export function subscribeSnapshot(cb: () => void): () => void {
  const a = useAppStore.subscribe(cb);
  const b = useAiSearchStore.subscribe(cb);
  return () => { a(); b(); };
}
