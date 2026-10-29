import { useEffect, useMemo, useRef, useState } from "react";
import { api, type StrongsEntry } from "../lib/tauri";

// Matches only when the etymology clause opens the definition (e.g. "From
// 1891; emptiness...") — the true etymological root, as opposed to any
// "from"/"see"/etc. reference appearing later in the prose, which is a
// cross-reference rather than a derivation.
export const ETYMOLOGY_LEAD_RE = /^(?:from|same as|see\s+\w+\s+for|akin to|derivative of)\s+([HG]?\d{1,5}[a-z]?)\b/i;

export type LexiconPreference = "ours" | "thayer" | "lsj" | string;

/** The lexicon module id to fetch for `lang`, given the user's "Default Strong's source" setting. */
export function defaultLexiconSourceFor(pref: LexiconPreference, lang: "H" | "G"): string {
  if (pref === "ours") return "ours";
  if (pref === "thayer") return lang === "G" ? "THAYER" : "TBESH";
  if (pref === "lsj") return lang === "G" ? "TFLSJ" : "TBESH";
  return lang === "G" ? "TBESG" : "TBESH";
}

/** "ours" is the bundled bare Strong's data; anything else is already a module id. */
function lexiconModule(num: string, source: string): string {
  if (source !== "ours") return source;
  return num.startsWith("G") ? "StrongsGreek" : "StrongsHebrew";
}

/** A phrase group wins over the single selected number. */
export function strongsNumbers(selected: string | null, group: string[] | null): string[] {
  if (group && group.length > 1) return group;
  return selected ? [selected] : [];
}

export interface StrongsEntryData {
  loading: boolean;
  error: string | null;
  /** The headline entry: the first real content word, else whatever came back first. */
  entry: StrongsEntry | null;
  /** Rare: the phrase compounds more than one content word. */
  extraContentEntries: StrongsEntry[];
  /** Grammatical markers (e.g. H0853) riding along in the phrase. */
  hiddenMarkers: StrongsEntry[];
  /** Resolved root word when the entry opens with "From NNNN;". */
  etymology: { number: string; lemma: string } | null;
}

/**
 * Loads the lexicon entry (or entries, for a multi-number phrase) behind a
 * Strong's lookup. Shared by the operator's StrongsSheet and the audience's
 * StrongsLive so both resolve content words, markers and etymology the same
 * way — the views differ only in how they present it.
 */
export function useStrongsEntry(
  numbers: string[],
  source: string,
  primaryModule: string | null | undefined,
): StrongsEntryData {
  const [entries, setEntries] = useState<StrongsEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [etymology, setEtymology] = useState<{ number: string; lemma: string } | null>(null);
  // Root-word lookups go through their own cache so resolving a root never
  // replaces the entry currently on screen.
  const etymologyCache = useRef<Map<string, StrongsEntry>>(new Map());

  const key = numbers.join(",");

  useEffect(() => {
    if (numbers.length === 0 || !primaryModule) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setEntries([]);
    Promise.all(numbers.map((num) => api.getStrongsEntry(lexiconModule(num, source), num, primaryModule)))
      .then((result) => { if (!cancelled) setEntries(result); })
      .catch((e) => { if (!cancelled) setError(String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // `numbers` is rebuilt every render; `key` is its stable identity.
  }, [key, primaryModule, source]);

  // Memoized on `entries` so consumers (e.g. pagination, which measures the
  // DOM) can depend on these without recomputing every render.
  const { entry, extraContentEntries, hiddenMarkers } = useMemo(() => {
    const content = entries.filter((e) => !e.is_untranslated_marker);
    const markers = entries.filter((e) => e.is_untranslated_marker);
    const head = content[0] ?? entries[0] ?? null;
    return {
      entry: head,
      extraContentEntries: content.filter((e) => e.number !== head?.number),
      hiddenMarkers: markers.filter((e) => e.number !== head?.number),
    };
  }, [entries]);

  useEffect(() => {
    setEtymology(null);
    if (!entry?.long_def || !primaryModule) return;
    const match = entry.long_def.trim().match(ETYMOLOGY_LEAD_RE);
    if (!match) return;
    const rawNum = match[1];
    const prefix = entry.number.startsWith("H") ? "H" : "G";
    const fullNum = /^[HG]/i.test(rawNum) ? rawNum.toUpperCase() : prefix + rawNum;
    if (fullNum === entry.number) return; // self-reference, nothing to add

    const cached = etymologyCache.current.get(fullNum);
    if (cached) {
      setEtymology({ number: fullNum, lemma: cached.lemma });
      return;
    }

    let cancelled = false;
    api
      .getStrongsEntry(lexiconModule(fullNum, source), fullNum, primaryModule)
      .then((root) => {
        etymologyCache.current.set(fullNum, root);
        if (!cancelled) setEtymology({ number: fullNum, lemma: root.lemma });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [entry, primaryModule, source]);

  return { loading, error, entry, extraContentEntries, hiddenMarkers, etymology };
}
