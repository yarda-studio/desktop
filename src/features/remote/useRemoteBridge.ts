import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { api } from "../../lib/tauri";
import { useAppStore } from "../../store/app";
import { useCountdown } from "../countdown/countdownStore";
import { useSlidesLive } from "../slides/liveStore";
import { useSongsLive } from "../songs/liveStore";
import { remoteApi, type RemoteAction } from "./api";
import { runRemoteCommand } from "./commands";
import { useRemoteStore } from "./remoteStore";

const ACTIONS: readonly string[] = ["next", "prev", "black", "clear", "standby", "timer-toggle", "timer-reset"];

/** The text of the live scripture verse, for the phone to show. */
function useLiveVerseText(enabled: boolean): string {
  const ref = useAppStore((s) => s.currentRef);
  const module = useAppStore((s) => s.primaryModule);
  const [text, setText] = useState("");
  useEffect(() => {
    if (!enabled || !module) { setText(""); return; }
    let cancelled = false;
    api.getChapter(module, ref.book, ref.chapter)
      .then((ch) => {
        if (cancelled) return;
        const v = ch.verses.find((x) => x.verse === ref.verse);
        setText(v ? v.spans.filter((s) => !s.is_footnote && !s.is_title).map((s) => s.text).join("").replace(/\s+/g, " ").trim() : "");
      })
      .catch(() => { if (!cancelled) setText(""); });
    return () => { cancelled = true; };
  }, [enabled, module, ref.book, ref.chapter, ref.verse]);
  return text;
}

/**
 * Connects the app to the phone remote while the presentation workspace is
 * open: runs the commands the phone sends and publishes a summary of what is
 * live for the phone to show. Publishes nothing while the remote is off.
 */
export function useRemoteBridge() {
  const enabled = useRemoteStore((s) => s.status.enabled);
  const view = useAppStore((s) => s.view);
  const black = useAppStore((s) => s.liveBlack);
  const emergency = useAppStore((s) => s.liveEmergency);
  const ref = useAppStore((s) => s.currentRef);
  const songLive = useSongsLive((s) => s.live);
  const slideLive = useSlidesLive((s) => s.live);
  const timerStatus = useCountdown((s) => s.status);
  const timerTitle = useCountdown((s) => s.title);
  const timerEndsAt = useCountdown((s) => s.endsAt);
  const timerRemaining = useCountdown((s) => s.remainingMs);
  const verseText = useLiveVerseText(enabled && view === "live");

  useEffect(() => { void useRemoteStore.getState().refresh(); }, []);

  useEffect(() => {
    const unlisten = listen<string>("remote-command", (e) => {
      if (ACTIONS.includes(e.payload)) runRemoteCommand(e.payload as RemoteAction);
    });
    return () => { unlisten.then((f) => f()); };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let tab = "other", label = "", text = "";
    if (view === "songs") {
      tab = "songs";
      const slide = songLive?.slides[songLive.index];
      if (songLive && slide) { label = `${songLive.title} — ${slide.label}`; text = slide.text; }
    } else if (view === "slides") {
      tab = "slides";
      if (slideLive) {
        label = slideLive.title;
        text = slideLive.elements.filter((e) => e.kind === "text").map((e) => e.text.trim()).filter(Boolean).join("\n");
      }
    } else if (view === "live") {
      tab = "scriptures";
      label = `${ref.book} ${ref.chapter}:${ref.verse}`;
      text = verseText;
    }
    const snapshot = {
      tab, label, text, black, emergency,
      timer: { status: timerStatus, title: timerTitle, endsAt: timerEndsAt, remainingMs: timerRemaining, configured: true },
    };
    const id = setTimeout(() => { remoteApi.publishState(JSON.stringify(snapshot)).catch(() => {}); }, 80);
    return () => clearTimeout(id);
  }, [enabled, view, black, emergency, ref, songLive, slideLive, timerStatus, timerTitle, timerEndsAt, timerRemaining, verseText]);
}
