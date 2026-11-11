import { forPlatform, IS_MAC, MAC_WINDOW_BUTTONS_WIDTH } from "../lib/platform";
import { useEffect, useRef } from "react";
import { useAppStore, type Theme } from "../store/app";
import { api } from "../lib/tauri";
import ScriptureNav from "./ScriptureNav";
import SettingsSheet from "./Settings";
import AccountButton from "./account/AccountButton";
import { TeamShareTargetSelector, useTeamShareStore } from "../features/teamShare";

export default function TopBar() {
  const {
    currentRef, theme, setTheme, parallelMode, setParallelMode,
    setSearchQuery, setView, searchMode, setSearchMode,
    settingsOpen, setSettingsOpen,
    serviceOrderOpen, setServiceOrderOpen, serviceOrder,
    workspace,
  } = useAppStore();

  const wordInputRef = useRef<HTMLInputElement>(null);
  const scriptureInputRef = useRef<HTMLInputElement>(null);

  const refLabel = `${currentRef.book} ${currentRef.chapter}:${currentRef.verse}`;

  function cycleTheme() {
    const next: Record<Theme, Theme> = { light: "dark", dark: "system", system: "light" };
    const t = next[theme];
    setTheme(t);
    api.setPreferences({ theme: t }).catch(() => {});
  }

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.altKey && (e.key === "h" || e.code === "KeyH")) {
        e.preventDefault();
        setView("history");
        return;
      }
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.shiftKey && (e.code === "KeyT" || e.key.toLowerCase() === "t")) {
        e.preventDefault();
        void useTeamShareStore.getState().sendVerse();
        return;
      }
      if (e.key === "k") {
        e.preventDefault();
        setSearchMode("word");
        setView("search");
        setTimeout(() => wordInputRef.current?.focus(), 30);
      } else if (e.key === "l") {
        e.preventDefault();
        setSearchMode("scripture");
        setView("reading");
        setTimeout(() => scriptureInputRef.current?.focus(), 30);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []); // setters and refs are stable

  function toggleMode() {
    if (searchMode === "word") {
      setSearchMode("scripture");
      setView("reading");
      setTimeout(() => scriptureInputRef.current?.focus(), 30);
    } else {
      setSearchMode("word");
      setView("search");
      setTimeout(() => wordInputRef.current?.focus(), 30);
    }
  }

  const themeIcon = theme === "dark" ? "light_mode" : theme === "system" ? "contrast" : "dark_mode";
  const modeLabel = forPlatform(searchMode === "word" ? "Scripture navigation (Ctrl+L)" : "Word search (Ctrl+K)");
  // Icon shows what you'll switch TO (not current mode)
  const modeIcon = searchMode === "word" ? "auto_stories" : "search";

  return (
    <header
      className="relative flex justify-between items-center h-11 px-content-margin w-full z-50 glass !rounded-none !border-x-0 !border-t-0 shrink-0"
      style={IS_MAC ? { paddingLeft: MAC_WINDOW_BUTTONS_WIDTH } : undefined}
    >
      {/* The bar is also the window's title bar (there is no separate one), so its empty parts drag the window. */}
      <div data-tauri-drag-region aria-hidden="true" className="absolute inset-0 -z-10" />
      {/* Left: logo + current reading position */}
      <div className="flex items-center gap-4">
        <button
          className="ctl rounded-lg px-3 py-1 text-on-surface font-semibold font-body-ui text-[13px]"
          onClick={() => setView("reading")}
        >
          {refLabel}
        </button>
      </div>

      {/* Center: dual-mode search */}
      <div className="flex-1 flex justify-center px-8 max-w-xl mx-auto">
        <div data-tour="topbar-search" className="w-full max-w-sm hidden lg:flex items-center gap-1.5">

          {/* Mode-switch icon button */}
          <button
            onClick={toggleMode}
            title={modeLabel} aria-label={modeLabel}
            className="ctl rounded-lg w-8 h-8 flex items-center justify-center text-secondary hover:text-primary shrink-0"
          >
            <span className="material-symbols-outlined !text-[18px] leading-none">{modeIcon}</span>
          </button>

          {/* Word search input */}
          {searchMode === "word" && (
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-on-surface-variant !text-[16px] pointer-events-none">
                search
              </span>
              <input
                ref={wordInputRef}
                className="w-full pl-9 pr-3 py-1 field rounded-lg focus:outline-none text-[13px] font-body-ui transition-colors placeholder:text-on-surface-variant"
                placeholder={forPlatform("Search (Ctrl+K)")}
                onFocus={() => setView("search")}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          )}

          {/* Scripture navigator */}
          {searchMode === "scripture" && (
            <ScriptureNav inputRef={scriptureInputRef} />
          )}
        </div>
      </div>

      {/* Right: toolbar actions */}
      <div className="flex items-center gap-1.5">
        {/* Team scripture share target selector and instant send */}
        <div className="flex items-center gap-1 bg-surface-variant/25 p-0.5 rounded-lg border border-outline-variant/30">
          <TeamShareTargetSelector />
          <button
            onClick={() => void useTeamShareStore.getState().sendVerse()}
            className="w-7 h-7 flex items-center justify-center rounded-md text-primary hover:bg-primary/10 transition-colors shrink-0"
            title={forPlatform("Send active verse to team (Ctrl+Shift+T)")}
            aria-label="Send active verse to team"
          >
            <span className="material-symbols-outlined !text-[16px] leading-none">send</span>
          </button>
        </div>
        {workspace === "presentation" && (
          <button
            aria-label="Service queue"
            onClick={() => setServiceOrderOpen(!serviceOrderOpen)}
            className={`relative w-8 h-8 flex items-center justify-center rounded-lg shrink-0 ${
              serviceOrderOpen ? "ctl-active" : "ghost text-secondary hover:text-on-surface"
            }`}
            title="Service queue (Ctrl+Q)"
          >
            <span className="material-symbols-outlined !text-[18px] leading-none select-none">queue_play_next</span>
            {serviceOrder.length > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] rounded-full btn-primary text-on-primary font-metadata-mono text-[11px] flex items-center justify-center px-0.5 leading-none">
                {serviceOrder.length}
              </span>
            )}
          </button>
        )}
        <button
          aria-label="Toggle parallel view"
          data-tour="parallel"
          onClick={() => setParallelMode(!parallelMode)}
          className={`w-8 h-8 flex items-center justify-center rounded-lg shrink-0 ${parallelMode ? "ctl-active" : "ghost text-secondary hover:text-on-surface"}`}
        >
          <span className="material-symbols-outlined !text-[18px] leading-none select-none">splitscreen</span>
        </button>
        <button
          aria-label="Font size"
          data-tour="font-size"
          className="w-8 h-8 flex items-center justify-center rounded-lg shrink-0 ghost text-secondary hover:text-on-surface"
        >
          <span className="material-symbols-outlined !text-[18px] leading-none select-none">format_size</span>
        </button>
        <button
          aria-label="Toggle theme"
          data-tour="theme"
          onClick={cycleTheme}
          className="w-8 h-8 flex items-center justify-center rounded-lg shrink-0 ghost text-secondary hover:text-on-surface"
        >
          <span className="material-symbols-outlined !text-[18px] leading-none select-none">{themeIcon}</span>
        </button>
        <AccountButton />
        <button
          aria-label="Settings"
          data-tour="settings"
          onClick={() => setSettingsOpen(true)}
          className={`w-8 h-8 flex items-center justify-center rounded-lg shrink-0 ${settingsOpen ? "ctl-active" : "ghost text-secondary hover:text-on-surface"}`}
        >
          <span className="material-symbols-outlined !text-[18px] leading-none select-none">settings</span>
        </button>
      </div>

      <SettingsSheet />
    </header>
  );
}
