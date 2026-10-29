import { invoke } from "@tauri-apps/api/core";
import type { DisplayPrefs } from "../store/app";
import type { PresentationTheme } from "./tauri";

/** A Strong's lookup, fully prepared by the operator: the output only draws it. */
export interface StrongsDocPayload {
  number: string;
  lemma: string;
  transliteration: string;
  partOfSpeech: string;
  etymology: { number: string; lemma: string } | null;
  /** The definition, one sanitized-HTML string per page (bold / italic / references kept). */
  pages: string[];
  /** The type the pages were cut for, so the output wraps identically. */
  fontFamily: string;
  fontPx: number;
  lineHeight: number;
  letterSpacing: string;
}

export interface PresentState {
  book: string;
  chapter: number;
  verse: number;
  primaryModule: string;
  parallelModule: string | null;
  parallelMode: boolean;
  selectedStrongs: string | null;
  strongsGroup: string[] | null;
  strongsSource: string | null;
  /** Which page of the Strong's definition is on screen. Selection fields are null unless it is live. */
  strongsPage?: number;
  /** The Strong's lookup to show full screen. Null/absent unless it is live. */
  strongsDoc?: StrongsDocPayload | null;
  displayPrefs: DisplayPrefs;
  readingFontSize: number;
  presentationTheme: PresentationTheme | null;
  /** Cut to a plain black screen — verse content keeps its place underneath. */
  black?: boolean;
  /** A dedicated "something's wrong" screen, overriding black and live content alike. */
  emergency?: boolean;
  /**
   * Which part of a split verse is currently displayed (0 = part a, 1 = part b, …).
   * Only meaningful when displayPrefs.splitLongVerses is true and the verse splits into
   * more than one part at the active font size.
   */
  versePart?: number;
  /**
   * A song slide to show instead of scripture. When set, the output renders
   * this text (styled by the active theme) and ignores the verse fields.
   */
  slide?: SongSlidePayload;
  /** An announcement / free-form slide to show instead of scripture. Takes priority over `slide`. */
  slideDoc?: SlideDocPayload;
  /** What comes after the live content — shown on the stage display only. */
  next?: { label: string; text: string };
}

export interface SlideElementData {
  id: string;
  kind: "text" | "image";
  /** Position and size, as % of the slide. */
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  /** px on a 1080p frame. */
  font_size: number;
  color: string;
  align: "left" | "center" | "right";
  bold: boolean;
  image: string | null;
}

export interface SlideDocPayload {
  title: string;
  /** "theme", "black" or "#rrggbb". */
  background: string;
  elements: SlideElementData[];
}

export interface SongSlidePayload {
  text: string;
  label: string;
  copyright?: string;
}

declare global {
  interface Window {
    __scripturaApplyPresentation?: (state: PresentState) => void;
    __scripturaApplyCountdown?: (state: unknown) => void;
    __scripturaTick?: (now: number) => void;
  }
}

// Route through the Rust backend. The backend stores the latest state and pushes
// it into the presentation window via WebviewWindow::eval — see relay_presentation
// in src-tauri/src/commands/mod.rs for why (macOS throttles JS timers/events in
// unfocused WKWebViews, but an externally-driven eval() call is not throttled).
export function emitPresentation(state: PresentState) {
  invoke("relay_presentation", { payload: state }).catch(console.error);
}

// Installs a global hook that the Rust backend calls directly via eval() whenever
// state changes, plus an initial pull on mount to avoid missing the first update.
export function listenPresentation(cb: (state: PresentState) => void): () => void {
  window.__scripturaApplyPresentation = cb;

  invoke<PresentState | null>("get_presentation_state")
    .then((s) => { if (s) cb(s); })
    .catch(() => {});

  return () => {
    if (window.__scripturaApplyPresentation === cb) {
      delete window.__scripturaApplyPresentation;
    }
  };
}
