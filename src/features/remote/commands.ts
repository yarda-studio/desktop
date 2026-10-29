import { useAppStore } from "../../store/app";
import { useCountdown } from "../countdown/countdownStore";
import { useSlidesLive } from "../slides/liveStore";
import { useSongsLive } from "../songs/liveStore";
import type { RemoteAction } from "./api";
import { stepScripture } from "./registry";

/** Move the live content one step in whichever presentation tab is open. */
function step(delta: 1 | -1) {
  const view = useAppStore.getState().view;
  if (view === "songs") {
    const songs = useSongsLive.getState();
    if (!songs.live) { if (delta > 0) songs.goLive(0); }
    else songs.stepLive(delta);
  } else if (view === "slides") {
    const slides = useSlidesLive.getState();
    if (!slides.live) { if (delta > 0) void slides.goLive(); }
    else void slides.stepLive(delta);
  } else if (view === "live") {
    void stepScripture(delta);
  }
}

/** Do what a button press on the phone asks for, using the same state the on-screen buttons change. */
export function runRemoteCommand(action: RemoteAction) {
  const app = useAppStore.getState();
  switch (action) {
    case "next": return step(1);
    case "prev": return step(-1);
    case "black": return app.setLiveBlack(!app.liveBlack);
    case "standby": return app.setLiveEmergency(!app.liveEmergency);
    case "clear":
      app.setLiveBlack(false);
      app.setLiveEmergency(false);
      return;
    case "timer-toggle": {
      const c = useCountdown.getState();
      if (c.status === "running") c.pause();
      else if (c.status === "paused") c.resume();
      else c.start();
      return;
    }
    case "timer-reset": return useCountdown.getState().reset();
  }
}
