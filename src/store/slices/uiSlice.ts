import type { StateCreator } from "zustand";
import type { AppState, Theme } from "../app";
import type { AccentId } from "../../lib/accents";
import {
  clampCompactness,
  readConsoleCompactness,
  readSplitConsoleColumns,
  writeConsoleCompactness,
  writeSplitConsoleColumns,
} from "../../lib/consoleDensity";

export interface UiSlice {
  theme: Theme;
  setTheme: (t: Theme) => void;
  accent: AccentId;
  setAccent: (a: AccentId) => void;
  isFullscreen: boolean;
  setIsFullscreen: (v: boolean) => void;
  settingsOpen: boolean;
  setSettingsOpen: (v: boolean) => void;
  consoleCompactness: number;
  setConsoleCompactness: (value: number) => void;
  splitConsoleColumns: boolean;
  setSplitConsoleColumns: (v: boolean) => void;
}

export const createUiSlice: StateCreator<AppState, [], [], UiSlice> = (set) => ({
  theme: "dark",
  setTheme: (theme) => set({ theme }),
  accent: "yarda",
  setAccent: (accent) => set({ accent }),
  isFullscreen: false,
  setIsFullscreen: (isFullscreen) => set({ isFullscreen }),
  settingsOpen: false,
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  consoleCompactness: readConsoleCompactness(),
  setConsoleCompactness: (value) => {
    const consoleCompactness = clampCompactness(value);
    writeConsoleCompactness(consoleCompactness);
    set({ consoleCompactness });
  },
  splitConsoleColumns: readSplitConsoleColumns(),
  setSplitConsoleColumns: (splitConsoleColumns) => {
    writeSplitConsoleColumns(splitConsoleColumns);
    set({ splitConsoleColumns });
  },
});
