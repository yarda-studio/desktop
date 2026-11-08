/**
 * Jumps typed relative to where you already are, with no book name:
 *   v4        verse 4 of the current chapter
 *   c2v5      chapter 2, verse 5 of the current book (also c2:v5, c2 v5, c2.v5)
 *   c2        chapter 2, verse 1 of the current book
 * Kept apart from scriptureRef.ts, which needs the book list, so it is plain text in, numbers out.
 */
export interface LocalJump {
  /** `null` means "the chapter you are on". */
  chapter: number | null;
  verse: number;
}

const VERSE_ONLY = /^v(\d+)$/i;
const CHAPTER_AND_VERSE = /^c(\d+)(?:[\s:.,]*v(\d+))?$/i;

/** The jump `raw` asks for, or `null` if it is not one. Chapter and verse numbers start at 1. */
export function parseLocalJump(raw: string): LocalJump | null {
  const text = raw.trim();

  const verseOnly = VERSE_ONLY.exec(text);
  if (verseOnly) {
    const verse = parseInt(verseOnly[1], 10);
    return verse > 0 ? { chapter: null, verse } : null;
  }

  const both = CHAPTER_AND_VERSE.exec(text);
  if (both) {
    const chapter = parseInt(both[1], 10);
    const verse = both[2] === undefined ? 1 : parseInt(both[2], 10);
    return chapter > 0 && verse > 0 ? { chapter, verse } : null;
  }

  return null;
}
