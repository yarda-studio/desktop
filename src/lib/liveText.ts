import type { DisplayPrefs } from "../store/app";
import type { PresentationTheme } from "./tauri";

/** What the live output uses when no theme is loaded yet — fixed, so the
 * output never depends on the user's reading-text Settings. */
const FALLBACK = {
  fontSize: 56,
  fontFamily: "system",
  textAlign: "center",
  lineSpacing: 0.3,
  letterSpacing: 0,
  safeMargin: 5,
} as const;

export const FONT_FAMILY_CSS: Record<string, string> = {
  system: `-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`,
  serif:  `Georgia, "Palatino Linotype", Palatino, serif`,
  times:  `"Times New Roman", Times, serif`,
  mono:   `"Courier New", Courier, monospace`,
};

/** CSS font-family the live output uses for text, given the active theme. */
export function liveFontFamily(base: DisplayPrefs, theme: PresentationTheme | null | undefined): string {
  return FONT_FAMILY_CSS[liveDisplayPrefs(base, theme).fontFamily] ?? FONT_FAMILY_CSS.system;
}

/** Base font size (px) for live verse text. */
export function liveFontSize(theme: PresentationTheme | null | undefined): number {
  return theme?.font_size ?? FALLBACK.fontSize;
}

export const DEFAULT_REFERENCE_VERSE_RATIO = 0.35;

export function liveSafeMargin(theme: PresentationTheme | null | undefined): number {
  return theme?.safe_margin ?? FALLBACK.safeMargin;
}

/** Reference font size (px) when scaling proportionally to the displayed verse size. */
export function relativeReferenceFontSize(displayedVersePx: number, ratio = DEFAULT_REFERENCE_VERSE_RATIO): number {
  return Math.max(12, Math.round(displayedVersePx * ratio));
}

/** Translation badge font size (px) next to the reference label. */
export function referenceModuleFontSize(refFontSizePx: number, followVerse: boolean): number {
  return followVerse
    ? Math.max(10, Math.round(refFontSizePx * 0.82))
    : Math.max(10, refFontSizePx - 3);
}

/** Vertical gap (px) between the verse text and an attached reference label. */
export function relativeReferenceGap(displayedVersePx: number): number {
  return Math.max(8, Math.round(displayedVersePx * 0.25));
}

/**
 * Height (px) reserved inside a single-verse box when the reference label shares
 * the box with the verse text, so split-long-verses measurements leave room for it.
 */
export function relativeReferenceReservedHeight(theme: PresentationTheme | null | undefined, boxHeightPx: number): number {
  if (!theme?.reference_follow_verse) return 0;
  const versePx = liveFontSize(theme) * (theme.font_scale ?? 1);
  const refPx = relativeReferenceFontSize(versePx, theme.reference_verse_ratio);
  const gapPx = relativeReferenceGap(versePx);
  const reserved = Math.ceil(refPx * 1.4) + gapPx;
  return Math.max(0, Math.min(boxHeightPx * 0.45, reserved));
}

/**
 * Display prefs as the live output should see them: the typography fields come
 * from the theme, everything else (presentation context, split-long-verses…)
 * passes through. Settings → Text only styles reading text now, so the output
 * window and the operator-side split maths both go through this instead of
 * reading font/spacing/alignment straight from the user's preferences.
 */
export function liveDisplayPrefs(base: DisplayPrefs, theme: PresentationTheme | null | undefined): DisplayPrefs {
  return {
    ...base,
    fontFamily: (theme?.font_family ?? FALLBACK.fontFamily) as DisplayPrefs["fontFamily"],
    textAlign: (theme?.text_align ?? FALLBACK.textAlign) as DisplayPrefs["textAlign"],
    lineSpacing: theme?.line_spacing ?? FALLBACK.lineSpacing,
    letterSpacing: theme?.letter_spacing ?? FALLBACK.letterSpacing,
    // Theme safe_margin is the per-side % of the frame; DisplayPrefs.margins
    // is the *total* % (applied as half each side) over a 5% baseline.
    margins: ((theme?.safe_margin ?? FALLBACK.safeMargin) - 5) * 2,
  };
}
