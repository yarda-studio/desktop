import { useAppStore } from "../store/app";
import type { PresentState } from "../lib/presentation";

/**
 * A full output state built from the app's current presentation settings, with
 * `extra` (a song slide, a free-form slide, …) laid over it. Shared by every
 * tab that puts its own content on the output.
 */
export function useOutputState(extra: Partial<PresentState>): PresentState {
  const currentRef = useAppStore((s) => s.currentRef);
  const primaryModule = useAppStore((s) => s.primaryModule);
  const displayPrefs = useAppStore((s) => s.displayPrefs);
  const readingFontSize = useAppStore((s) => s.readingFontSize);
  const presentationTheme = useAppStore((s) => s.activePresentationTheme);
  const black = useAppStore((s) => s.liveBlack);
  const emergency = useAppStore((s) => s.liveEmergency);
  return {
    book: currentRef.book,
    chapter: currentRef.chapter,
    verse: currentRef.verse,
    primaryModule: primaryModule ?? "",
    parallelModule: null,
    parallelMode: false,
    selectedStrongs: null,
    strongsGroup: null,
    strongsSource: null,
    displayPrefs,
    readingFontSize,
    presentationTheme,
    black,
    emergency,
    ...extra,
  };
}
