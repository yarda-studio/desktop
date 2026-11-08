import type { PlanItem } from "./api";
import { makeItem } from "./planLogic";
import { usePlan } from "./planStore";

/**
 * What the "Add to plan" buttons in the song, slide and Live Show screens call.
 * Waits for the saved plan to be read first, so an early click can never save a
 * one-step plan over the real one. If the plan can't be read nothing is added;
 * the dock shows why.
 */
async function addStep(item: PlanItem): Promise<void> {
  if (!usePlan.getState().loaded) await usePlan.getState().load();
  if (!usePlan.getState().loaded) return;
  usePlan.getState().add(item);
}

export function addSongToPlan(song: { id: number; title: string; author?: string }): Promise<void> {
  return addStep(makeItem("song", { ref_id: song.id, title: song.title, subtitle: song.author ?? "" }));
}

export function addSlideToPlan(slide: { id: number; title: string }): Promise<void> {
  return addStep(makeItem("slide", { ref_id: slide.id, title: slide.title }));
}

/** A passage step. `endVerse` only shapes the label; the step opens on `verse`. */
export function addVerseToPlan(ref: { book: string; chapter: number; verse: number }, module: string | null, endVerse?: number): Promise<void> {
  const range = endVerse && endVerse > ref.verse ? `${ref.verse}–${endVerse}` : `${ref.verse}`;
  return addStep(makeItem("verse", {
    book: ref.book,
    chapter: ref.chapter,
    verse: ref.verse,
    module,
    title: `${ref.book} ${ref.chapter}:${range}`,
  }));
}
