import { stepWithin } from "../slides/pages.ts";

/**
 * The rules for stepping through the parts of a split verse, with no app
 * dependencies so they can be tested on their own. `verseParts.ts` connects
 * them to the app.
 *
 * Only the Live Show knows how many parts the live verse has (it depends on
 * the verse text and the split setting), so it reports the count together with
 * the verse it is for. A count that belongs to a different verse is ignored.
 */

export interface PartsPort {
  getPart: () => number;
  setPart: (part: number) => void;
}

export function verseKey(ref: { book: string; chapter: number; verse: number }): string {
  return `${ref.book}:${ref.chapter}:${ref.verse}`;
}

export function createVerseParts(port: PartsPort) {
  let key: string | null = null;
  let count = 1;
  // A verse the plan stepped Back into: open it on its last part once the count is known.
  let wantLastFor: string | null = null;

  const openOnLastPart = () => {
    port.setPart(count - 1);
    wantLastFor = null;
  };

  return {
    /** The Live Show calls this whenever the live verse or its split changes. */
    report(reportedKey: string, reportedCount: number): void {
      key = reportedKey;
      count = reportedCount;
      if (wantLastFor !== null && wantLastFor !== reportedKey) wantLastFor = null;
      if (wantLastFor === reportedKey && count > 1) openOnLastPart();
    },

    /** Open `target` on its last part: now if the count is known, otherwise as soon as it is. */
    requestLast(target: string): void {
      if (key === target && count > 1) openOnLastPart();
      else wantLastFor = target;
    },

    forgetRequest(): void {
      wantLastFor = null;
    },

    /** Move to the next or previous part of `target`. False when there is none, so the plan moves on. */
    step(target: string, delta: -1 | 1): boolean {
      if (key !== target || count <= 1) return false;
      const next = stepWithin(port.getPart(), count, delta);
      if (next === null) return false;
      port.setPart(next);
      return true;
    },
  };
}
