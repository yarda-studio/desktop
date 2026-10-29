import { useEffect, useState } from "react";
import { useAppStore } from "../store/app";
import { api } from "../lib/tauri";
import { usePresentationOutput } from "../hooks/usePresentationOutput";
import OutputsPanel from "./OutputsPanel";
import CountdownPanel from "../features/countdown/CountdownPanel";
import { useCountdown } from "../features/countdown/countdownStore";
import { useCountdownSync } from "../features/countdown/useCountdownSync";
import RemotePanel from "../features/remote/RemotePanel";
import { useRemoteBridge } from "../features/remote/useRemoteBridge";
import { useRemoteStore } from "../features/remote/remoteStore";
import { useStageWindow } from "../features/stage/useStageWindow";
import { useClockTicks } from "../hooks/useClockTicks";
import SettingsSheet from "./Settings";
import AccountButton from "./account/AccountButton";

type PresentationTab = "scriptures" | "slides" | "songs" | "themes";

/**
 * Top bar for the presentation workspace only (study mode keeps the plain
 * TopBar + SideNav). Replaces the left sidebar with a tab switcher, and adds
 * the LIVE/BLACK/CLEAR transport controls that used to live inline in
 * LiveShowRunner's own header — they belong here so they're visible no
 * matter which presentation screen (Live Show, Customize) is on screen.
 */
export default function PresentationTopBar() {
  const {
    view, setView, settingsOpen, setSettingsOpen, liveBlack, setLiveBlack, liveEmergency, setLiveEmergency,
    serviceOrderOpen, setServiceOrderOpen, setDisplayPrefs, presentationActive,
    readingFontSize, setReadingFontSize, theme, setTheme,
  } = useAppStore();
  const output = usePresentationOutput();
  const [outputsOpen, setOutputsOpen] = useState(false);
  const [timerOpen, setTimerOpen] = useState(false);
  const [remoteOpen, setRemoteOpen] = useState(false);
  const remoteOn = useRemoteStore((r) => r.status.enabled);
  useRemoteBridge();
  const stageWindow = useStageWindow();
  const countdownStatus = useCountdown((c) => c.status);
  useCountdownSync();
  useClockTicks(countdownStatus === "running" || stageWindow.active);

  const activeTab: PresentationTab =
    view === "songs" ? "songs" :
    view === "slides" ? "slides" :
    view === "customize" ? "themes" :
    "scriptures";
  const cleared = !liveBlack && !liveEmergency;

  // "System" resolves to whatever the OS is currently using, so the button
  // always flips to the opposite of what's on screen.
  const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  function toggleTheme() {
    const next = isDark ? "light" : "dark";
    setTheme(next);
    api.setPreferences({ theme: next }).catch(() => {});
  }

  function clearOverrides() {
    setLiveBlack(false);
    setLiveEmergency(false);
  }

  const presentationContextKeys: Record<string, 1 | 2 | 3 | 4> = {
    Digit1: 1, Digit2: 2, Digit3: 3, Digit4: 4,
    Numpad1: 1, Numpad2: 2, Numpad3: 3, Numpad4: 4,
  };

  const FONT_SIZE_PRESETS = [14, 16, 32, 48, 64, 72, 98];

  // Shortcuts that apply across the whole presentation workspace (not just
  // LiveShowRunner), scoped here since this bar is mounted regardless of
  // which presentation screen is on screen:
  //  - C / Ctrl+Shift+E: black/emergency, this bar's own BLACK/CLEAR buttons
  //  - Ctrl+Shift+Q: open the queue editor drawer (reorder/remove)
  //  - Ctrl+1-4: presentation verse context, while output is live
  //  - Ctrl +/-, Ctrl+Alt +/-: font size (same bindings as the reading view)
  //  - Alt+H: search history
  // These used to only fire from inside ReadingView (see
  // useReadingShortcuts.ts), which is no longer reachable once presenting —
  // the sidebar nav that reached it is gone in this design.
  //
  // Modifier shortcuts work even while a text field has focus (the verse
  // jump / search input keeps focus after use, which used to silently
  // disable every shortcut); only bare keys like "C" are skipped when typing.
  useEffect(() => {
    function saveFont(next: number) {
      setReadingFontSize(next);
      api.setPreferences({ font_size_reading: next }).catch(() => {});
    }
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing = !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.shiftKey && e.key.toLowerCase() === "e") {
        e.preventDefault();
        setLiveEmergency(!liveEmergency);
        return;
      }
      if (mod && e.shiftKey && e.code === "KeyQ") {
        e.preventDefault();
        setServiceOrderOpen(!serviceOrderOpen);
        return;
      }
      if (mod && presentationActive && e.code in presentationContextKeys) {
        e.preventDefault();
        setDisplayPrefs({ presentationContext: presentationContextKeys[e.code] });
        return;
      }
      if (e.altKey && !mod && e.code === "KeyH") {
        e.preventDefault();
        setView("history");
        return;
      }
      if (mod && !e.altKey && (e.code === "Equal" || e.code === "NumpadAdd")) {
        e.preventDefault();
        saveFont(Math.min(98, readingFontSize + 1));
        return;
      }
      if (mod && !e.altKey && (e.code === "Minus" || e.code === "NumpadSubtract")) {
        e.preventDefault();
        saveFont(Math.max(14, readingFontSize - 1));
        return;
      }
      if (mod && e.altKey && (e.code === "Equal" || e.code === "NumpadAdd")) {
        e.preventDefault();
        saveFont(FONT_SIZE_PRESETS.find((p) => p > readingFontSize) ?? FONT_SIZE_PRESETS[FONT_SIZE_PRESETS.length - 1]);
        return;
      }
      if (mod && e.altKey && (e.code === "Minus" || e.code === "NumpadSubtract")) {
        e.preventDefault();
        saveFont([...FONT_SIZE_PRESETS].reverse().find((p) => p < readingFontSize) ?? FONT_SIZE_PRESETS[0]);
        return;
      }
      if (!typing && !mod && !e.altKey && e.key.toLowerCase() === "c") {
        e.preventDefault();
        setLiveBlack(!liveBlack);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [liveBlack, setLiveBlack, liveEmergency, setLiveEmergency, serviceOrderOpen, setServiceOrderOpen, presentationActive, setDisplayPrefs, readingFontSize, setReadingFontSize, setView]);

  return (
    <header className="relative flex items-center justify-between h-14 px-content-margin w-full z-50 glass !rounded-none !border-x-0 !border-t-0 shrink-0">
      {/* Left: Tab switcher */}
      <nav className="flex items-center p-1 bg-surface-variant/35 rounded-xl border border-outline-variant/40 shrink-0">
        <TabButton label="Scriptures" active={activeTab === "scriptures"} onClick={() => setView("live")} />
        <TabButton label="Slides" active={activeTab === "slides"} onClick={() => setView("slides")} />
        <TabButton label="Songs" active={activeTab === "songs"} onClick={() => setView("songs")} tour="songs-tab" />
        <TabButton label="Themes" active={activeTab === "themes"} onClick={() => setView("customize")} tour="themes" />
      </nav>

      {/* Center: Master broadcast transport deck (absolute dead center) */}
      <div
        data-tour="live-controls"
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center p-1 bg-surface-container-high/60 border border-outline-variant/60 rounded-xl shadow-xs"
      >
        <button
          onClick={output.toggle}
          className={`flex items-center justify-center gap-2 px-3.5 py-1.5 rounded-lg font-body-ui text-[12px] font-bold tracking-wider transition-all ${
            output.presentationActive ? "btn-live shadow-md" : "text-on-surface hover:bg-surface/60"
          }`}
          title={output.presentationActive ? "Stop the presentation output" : "Send output live"}
        >
          <span className={`w-2 h-2 rounded-full shrink-0 ${output.presentationActive ? "bg-white animate-pulse" : "bg-on-surface-variant/60"}`} />
          <span className="leading-none">LIVE</span>
        </button>

        <div className="w-px h-4 bg-outline-variant/60 mx-1" />

        <button
          onClick={() => setLiveBlack(!liveBlack)}
          className={`px-3 py-1.5 rounded-lg font-body-ui text-[12px] font-bold tracking-wider transition-all flex items-center justify-center leading-none ${
            liveBlack ? "bg-on-surface text-surface shadow-xs" : "text-on-surface-variant hover:text-on-surface hover:bg-surface/60"
          }`}
          title="Cut the live output to black (C)"
        >
          BLACK
        </button>

        <button
          onClick={clearOverrides}
          disabled={cleared}
          className={`px-3 py-1.5 rounded-lg font-body-ui text-[12px] font-bold tracking-wider transition-all flex items-center justify-center leading-none disabled:opacity-30 disabled:cursor-not-allowed ${
            cleared ? "text-on-surface-variant/50" : "text-primary hover:bg-surface/60 font-black"
          }`}
          title="Clear black/emergency overrides and resume normal output"
        >
          CLEAR
        </button>
      </div>

      {/* Right: Tools & Utilities */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Hardware & Peripherals */}
        <div className="flex items-center gap-0.5">
          <div className="relative" data-tour="outputs">
            <IconButton
              icon="cast"
              label="Outputs"
              active={outputsOpen}
              onClick={() => setOutputsOpen((v) => !v)}
            />
            {outputsOpen && <OutputsPanel output={output} stage={stageWindow} onClose={() => setOutputsOpen(false)} />}
          </div>
          <div className="relative">
            <IconButton
              icon="timer"
              label={countdownStatus === "running" ? "Countdown timer (running)" : "Countdown timer"}
              active={timerOpen || countdownStatus === "running"}
              onClick={() => setTimerOpen((v) => !v)}
            />
            {timerOpen && <CountdownPanel onClose={() => setTimerOpen(false)} />}
          </div>
          <div className="relative">
            <IconButton
              icon="smartphone"
              label={remoteOn ? "Phone remote (on)" : "Phone remote"}
              active={remoteOpen || remoteOn}
              onClick={() => setRemoteOpen((v) => !v)}
            />
            {remoteOpen && <RemotePanel onClose={() => setRemoteOpen(false)} />}
          </div>
        </div>

        <div className="w-px h-4 bg-outline-variant/60 mx-1" />

        {/* System & Account */}
        <div className="flex items-center gap-1">
          <IconButton
            icon={isDark ? "light_mode" : "dark_mode"}
            label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            onClick={toggleTheme}
          />
          <IconButton
            icon="settings"
            label="Settings"
            active={settingsOpen}
            onClick={() => setSettingsOpen(true)}
            tour="settings"
          />
          <AccountButton />
        </div>
      </div>

      <SettingsSheet />
    </header>
  );
}

function TabButton({ label, active, disabled, onClick, className = "", tour }: { label: string; active: boolean; disabled?: boolean; onClick?: () => void; className?: string; tour?: string }) {
  return (
    <button
      data-tour={tour}
      onClick={onClick}
      disabled={disabled}
      title={disabled ? "Coming soon" : undefined}
      className={`px-3.5 py-1 rounded-lg font-body-ui text-[13px] font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
        active ? "btn-primary shadow-xs" : "text-on-surface-variant hover:text-on-surface hover:bg-surface/50"
      } ${className}`}
    >
      {label}
    </button>
  );
}

function IconButton({ icon, label, active, disabled, title, onClick, className = "", tour }: {
  tour?: string;
  icon: string;
  label: string;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      data-tour={tour}
      aria-label={label}
      title={title ?? label}
      onClick={onClick}
      disabled={disabled}
      className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors shrink-0 disabled:opacity-30 disabled:cursor-not-allowed ${
        active ? "ctl-active" : "ghost text-secondary hover:text-on-surface"
      } ${className}`}
    >
      <span className="material-symbols-outlined text-[20px] leading-none select-none translate-y-[1px]">{icon}</span>
    </button>
  );
}
