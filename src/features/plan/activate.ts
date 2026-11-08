import { api } from "../../lib/tauri";
import { useAppStore } from "../../store/app";
import { useCountdown } from "../countdown/countdownStore";
import { useSlidesLive } from "../slides/liveStore";
import { stepWithin } from "../slides/pages";
import { useSongsLive } from "../songs/liveStore";
import type { PlanItem } from "./api";
import { forgetLastPartRequest, requestLastPart, stepVerseParts, verseKey } from "./verseParts";

/**
 * Puts a plan step on the output by driving the same stores each tab uses
 * (the song and slide live stores, the app's live verse, the countdown). The
 * plan never reaches into a tab's internals, so a problem in one tab can only
 * stop the step that needs it.
 */

/** Why a step could not be shown, in words the operator can act on. */
export class PlanStepError extends Error {}

/**
 * `fromEnd` is for stepping Back into a step: it opens on the last lyric slide,
 * page or verse part instead of the first, like paging back through a deck.
 */
export async function activateItem(item: PlanItem, fromEnd = false): Promise<void> {
  const app = useAppStore.getState();
  forgetLastPartRequest();

  switch (item.kind) {
    case "verse": {
      if (!item.book || !item.chapter || !item.verse) {
        throw new PlanStepError(`"${item.title}" has no passage to show.`);
      }
      // Use the step's translation when it is installed; otherwise keep the one in use.
      if (item.module && item.module !== app.primaryModule) {
        const installed = await api.listInstalledModules().catch(() => []);
        if (installed.some((m) => m.id === item.module)) app.setPrimaryModule(item.module);
      }
      app.pushLiveHistory(app.currentRef);
      app.setCurrentRef({ book: item.book, chapter: item.chapter, verse: item.verse });
      app.setVersePart(0);
      if (fromEnd) requestLastPart(verseKey({ book: item.book, chapter: item.chapter, verse: item.verse }));
      app.setView("live");
      return;
    }

    case "song": {
      if (item.ref_id === null) throw new PlanStepError(`"${item.title}" is not linked to a song.`);
      const songs = useSongsLive.getState();
      await songs.preview(item.ref_id);
      if (useSongsLive.getState().previewId !== item.ref_id) {
        throw new PlanStepError(`"${item.title}" is no longer in the song library.`);
      }
      songs.goLive(fromEnd ? Number.MAX_SAFE_INTEGER : 0); // goLive keeps the index inside the song
      app.setView("songs");
      return;
    }

    case "slide": {
      if (item.ref_id === null) throw new PlanStepError(`"${item.title}" is not linked to a slide.`);
      const slides = useSlidesLive.getState();
      await slides.preview(item.ref_id, fromEnd ? Number.MAX_SAFE_INTEGER : 0); // clamped to the last page
      if (useSlidesLive.getState().previewId !== item.ref_id) {
        throw new PlanStepError(`"${item.title}" is no longer in the slide library.`);
      }
      await slides.goLive();
      app.setView("slides");
      return;
    }

    case "countdown": {
      const secs = item.duration_secs ?? 0;
      if (secs <= 0) throw new PlanStepError(`"${item.title}" needs a length.`);
      const countdown = useCountdown.getState();
      countdown.setConfig({ mode: "duration", minutes: secs / 60 });
      countdown.reset();
      countdown.start();
      return;
    }

    case "black":
      app.setLiveBlack(true);
      return;

    case "note":
      return; // for the operator only; the output is left as it is
  }
}

/** Undo what a step did to the output that would otherwise outlast it. */
export function leaveItem(item: PlanItem): void {
  if (item.kind === "black") useAppStore.getState().setLiveBlack(false);
  if (item.kind === "countdown") useCountdown.getState().reset();
}

/**
 * Move inside the step that is on screen (the next lyric slide of a song, the
 * next page of a slide). True when it did, so the caller should not advance to
 * the next step yet.
 */
export function stepWithinItem(item: PlanItem, delta: -1 | 1): boolean {
  if (item.kind === "verse" && item.book && item.chapter && item.verse) {
    return stepVerseParts(verseKey({ book: item.book, chapter: item.chapter, verse: item.verse }), delta);
  }
  if (item.kind === "song") {
    const songs = useSongsLive.getState();
    const live = songs.live;
    if (!live || live.songId !== item.ref_id) return false;
    const next = live.index + delta;
    if (next < 0 || next >= live.slides.length) return false;
    songs.stepLive(delta);
    return true;
  }
  if (item.kind === "slide") {
    const slides = useSlidesLive.getState();
    const live = slides.live;
    if (!live || live.id !== item.ref_id) return false;
    const page = stepWithin(slides.livePage, live.pages.length, delta);
    if (page === null) return false;
    slides.setLivePage(page);
    return true;
  }
  return false;
}
