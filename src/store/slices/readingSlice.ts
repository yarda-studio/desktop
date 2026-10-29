import type { StateCreator } from "zustand";
import type { AppState, VerseRef } from "../app";
import type { StrongsDocPayload } from "../../lib/presentation";

export interface ReadingSlice {
  currentRef: VerseRef;
  setCurrentRef: (ref: VerseRef) => void;

  primaryModule: string | null;
  parallelModule: string | null;
  setPrimaryModule: (id: string | null) => void;
  setParallelModule: (id: string | null) => void;
  parallelMode: boolean;
  setParallelMode: (v: boolean) => void;

  // Persisted to backend prefs via Settings/Ctrl+/-
  readingFontSize: number;
  setReadingFontSize: (n: number) => void;

  // Selected word for Strong's sheet
  selectedStrongs: string | null;
  /** Any new lookup (or closing the sheet) takes Strong's off the output screen. */
  setSelectedStrongs: (n: string | null) => void;

  /**
   * Whether the Strong's lookup is on the output screen. A lookup is private to
   * the operator until they press "Show on output" — only then do
   * selectedStrongs/strongsGroup/strongsSource reach the output window.
   */
  strongsLive: boolean;
  setStrongsLive: (v: boolean) => void;
  /** Which page (0-indexed) of the definition the output shows. */
  strongsPage: number;
  setStrongsPage: (n: number) => void;
  /**
   * The current lookup, formatted and paginated for the output by
   * StrongsSheet. Cleared with the selection; sent only while live.
   */
  strongsDoc: StrongsDocPayload | null;
  setStrongsDoc: (doc: StrongsDocPayload | null) => void;

  // Set when a phrase carries more than one Strong's number (e.g. a Hebrew
  // word tagged with both its content word and an untranslated grammatical
  // marker). StrongsSheet resolves all of these and picks the real content
  // word as the default view instead of guessing at the first number.
  strongsGroup: string[] | null;
  setStrongsGroup: (numbers: string[] | null) => void;

  // Which lexicon source is active in the Strongs sheet (synced to live window)
  strongsSource: string | null;
  setStrongsSource: (source: string | null) => void;
}

export const createReadingSlice: StateCreator<AppState, [], [], ReadingSlice> = (set) => ({
  currentRef: { book: "John", chapter: 3, verse: 16 },
  setCurrentRef: (currentRef) => set({ currentRef }),

  primaryModule: null,
  parallelModule: null,
  setPrimaryModule: (primaryModule) => set({ primaryModule }),
  setParallelModule: (parallelModule) => set({ parallelModule }),
  parallelMode: false,
  setParallelMode: (parallelMode) => set({ parallelMode }),

  readingFontSize: 18,
  setReadingFontSize: (readingFontSize) => set({ readingFontSize }),

  selectedStrongs: null,
  setSelectedStrongs: (selectedStrongs) => set({ selectedStrongs, strongsLive: false, strongsPage: 0, strongsDoc: null }),

  strongsLive: false,
  setStrongsLive: (strongsLive) => set({ strongsLive }),
  strongsPage: 0,
  setStrongsPage: (strongsPage) => set({ strongsPage: Math.max(0, strongsPage) }),
  strongsDoc: null,
  setStrongsDoc: (strongsDoc) => set({ strongsDoc }),

  strongsGroup: null,
  setStrongsGroup: (strongsGroup) => set({ strongsGroup }),

  strongsSource: null,
  // A different lexicon is different text, so its pages start over.
  setStrongsSource: (strongsSource) => set((st) => (st.strongsSource === strongsSource ? {} : { strongsSource, strongsPage: 0 })),
});
