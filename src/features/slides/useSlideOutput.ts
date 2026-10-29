import { useEffect } from "react";
import { useOutputState } from "../../hooks/useOutputState";
import { emitPresentation, type PresentState } from "../../lib/presentation";
import { useAppStore } from "../../store/app";
import { toPayload, type SlideDoc } from "./api";
import { useSlidesLive } from "./liveStore";

/** A full output state carrying `slide`, with the rest filled from the app's current presentation settings. */
export function useSlidePresentState(slide: SlideDoc | null, next?: PresentState["next"]): PresentState {
  return useOutputState(slide ? { slideDoc: toPayload(slide), next } : { slide: { text: "", label: "" } });
}

/**
 * Pushes the live slide to the output window whenever it (or blackout /
 * emergency / theme) changes. Mounted only while the Slides tab is open; going
 * back to another tab lets that screen's own sync take the output back.
 */
export function useSlideOutput() {
  const live = useSlidesLive((s) => s.live);
  const schedule = useSlidesLive((s) => s.schedule);
  const presentationActive = useAppStore((s) => s.presentationActive);
  // The stage display shows the next scheduled slide's title.
  const at = live?.id != null ? schedule.findIndex((s) => s.id === live.id) : -1;
  const upcoming = at >= 0 ? schedule[at + 1] : undefined;
  const next = upcoming ? { label: "Next slide", text: upcoming.title } : undefined;
  const state = useSlidePresentState(live, next);

  useEffect(() => {
    if (!presentationActive || !live) return;
    emitPresentation(state);
    // `state` is rebuilt every render; its inputs are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presentationActive, live, next?.text, state.black, state.emergency, state.presentationTheme, state.displayPrefs]);
}
