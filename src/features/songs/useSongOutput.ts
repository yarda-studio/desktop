import { useEffect } from "react";
import { useAppStore } from "../../store/app";
import { useOutputState } from "../../hooks/useOutputState";
import { emitPresentation, type PresentState, type SongSlidePayload } from "../../lib/presentation";
import { useSongsLive } from "./liveStore";

/** A full output state carrying `slide`, with the rest filled from the app's current presentation settings. */
export function useSongPresentState(slide: SongSlidePayload | null, next?: PresentState["next"]): PresentState {
  return useOutputState({ slide: slide ?? { text: "", label: "" }, next });
}

/** The slide after the live one, for the stage display. */
export function liveNext(live: ReturnType<typeof useSongsLive.getState>["live"]): PresentState["next"] {
  const n = live?.slides[live.index + 1];
  return live && n ? { label: `${live.title} — ${n.label}`, text: n.text } : undefined;
}

export function liveSlidePayload(live: ReturnType<typeof useSongsLive.getState>["live"]): SongSlidePayload | null {
  if (!live) return null;
  const slide = live.slides[live.index];
  if (!slide) return null;
  return {
    text: slide.text,
    label: `${live.title} — ${slide.label}`,
    copyright: live.copyright || undefined,
  };
}

/**
 * Pushes the live song slide to the output window whenever it (or blackout /
 * emergency / theme) changes. Mounted only while the Songs tab is open; going
 * back to Scriptures lets that screen's own sync take the output back.
 */
export function useSongOutput() {
  const live = useSongsLive((s) => s.live);
  const presentationActive = useAppStore((s) => s.presentationActive);
  const state = useSongPresentState(liveSlidePayload(live), liveNext(live));

  useEffect(() => {
    if (!presentationActive || !live) return;
    emitPresentation(state);
    // `state` is rebuilt every render; its inputs are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presentationActive, live, state.black, state.emergency, state.presentationTheme, state.displayPrefs]);
}
