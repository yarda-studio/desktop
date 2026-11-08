import { useEffect } from "react";
import { useOutputState } from "../../hooks/useOutputState";
import { emitPresentation, type PresentState } from "../../lib/presentation";
import { useAppStore } from "../../store/app";
import { toPayload, type SlideDoc } from "./api";
import { useSlidesLive } from "./liveStore";
import { pageText } from "./pages";

/** A full output state carrying page `page` of `slide`, with the rest filled from the app's current presentation settings. */
export function useSlidePresentState(slide: SlideDoc | null, page: number, next?: PresentState["next"]): PresentState {
  return useOutputState(slide ? { slideDoc: toPayload(slide, page), next } : { slide: { text: "", label: "" } });
}

/**
 * What the stage display should list as coming next: the live slide's next
 * page, or once it is on its last page, the next scheduled slide's title.
 */
function upNext(live: SlideDoc | null, livePage: number, schedule: { id: number; title: string }[]): PresentState["next"] {
  if (!live) return undefined;
  const nextPage = live.pages[livePage + 1];
  if (nextPage) return { label: "Next page", text: pageText(nextPage) || `Page ${livePage + 2}` };
  const at = live.id != null ? schedule.findIndex((s) => s.id === live.id) : -1;
  const upcoming = at >= 0 ? schedule[at + 1] : undefined;
  return upcoming ? { label: "Next slide", text: upcoming.title } : undefined;
}

/**
 * Pushes the live slide to the output window whenever it (or blackout /
 * emergency / theme) changes. Mounted only while the Slides tab is open; going
 * back to another tab lets that screen's own sync take the output back.
 */
export function useSlideOutput() {
  const live = useSlidesLive((s) => s.live);
  const livePage = useSlidesLive((s) => s.livePage);
  const schedule = useSlidesLive((s) => s.schedule);
  const presentationActive = useAppStore((s) => s.presentationActive);
  const next = upNext(live, livePage, schedule);
  const state = useSlidePresentState(live, livePage, next);

  useEffect(() => {
    if (!presentationActive || !live) return;
    emitPresentation(state);
    // `state` is rebuilt every render; its inputs are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presentationActive, live, livePage, next?.text, state.black, state.emergency, state.presentationTheme, state.displayPrefs]);
}
