import { useMemo } from "react";
import { useStrongsEntry, type StrongsEntryData } from "../../hooks/useStrongsEntry";
import type { StrongsDocPayload } from "../../lib/presentation";
import type { PresentationTheme } from "../../lib/tauri";
import type { DisplayPrefs } from "../../store/app";
import { buildStrongsDoc, paginateStrongs, strongsType, type StrongsStage } from "./pagination";

export interface StrongsPagesData extends StrongsEntryData {
  /** The definition split for the output screen (sanitized HTML); empty until an entry has loaded (or no stage is known). */
  pages: string[];
  /** Everything the output needs to draw the lookup, or null until it is ready. */
  doc: StrongsDocPayload | null;
}

/**
 * useStrongsEntry plus pagination sized from the output's stage and the live
 * theme's font. The operator runs this and ships the result to the output, so
 * "page 2" is literally the same words on both screens.
 */
export function useStrongsPages(
  numbers: string[],
  source: string,
  primaryModule: string | null | undefined,
  stage: StrongsStage | null,
  theme: PresentationTheme | null,
  displayPrefs: DisplayPrefs,
): StrongsPagesData {
  const data = useStrongsEntry(numbers, source, primaryModule);
  const { entry, extraContentEntries, etymology } = data;

  const type = stage ? strongsType(theme, displayPrefs, stage) : null;
  const { fontFamily, fontPx, lineHeight, letterSpacing } = type ?? {};

  const pages = useMemo(
    () => (entry && stage && type ? paginateStrongs(entry, extraContentEntries, stage, type) : []),
    // `type` is rebuilt every render; its fields are its identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entry, extraContentEntries, stage?.w, stage?.h, fontFamily, fontPx, lineHeight, letterSpacing],
  );

  const doc = useMemo(
    () => (entry && type && pages.length > 0 ? buildStrongsDoc(entry, etymology, pages, type) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entry, etymology, pages],
  );

  return { ...data, pages, doc };
}
