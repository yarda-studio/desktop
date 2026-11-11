import { create } from "zustand";
import { useEffect } from "react";

export type ShortcutCategory =
  | "Navigation"
  | "Reading & Study"
  | "Live Show Console"
  | "Presentation Controls"
  | "Songs, Slides & Plan"
  | "Search & AI"
  | "Team Collaboration"
  | "Font Size"
  | "Theme Designer"
  | string;

export interface ShortcutItem {
  id?: string;
  category: ShortcutCategory;
  keys: string[];
  description: string;
  note?: string;
  /** Show the keys exactly as written (e.g. Cmd+Q is the Mac Quit command). */
  literal?: boolean;
}

export interface ShortcutGroup {
  label: ShortcutCategory;
  icon: string;
  shortcuts: ShortcutItem[];
}

export const DEFAULT_CATEGORY_ICONS: Record<string, string> = {
  "Navigation": "menu_book",
  "Reading & Study": "chrome_reader_mode",
  "Live Show Console": "live_tv",
  "Presentation Controls": "slideshow",
  "Songs, Slides & Plan": "queue_music",
  "Search & AI": "search",
  "Team Collaboration": "groups",
  "Font Size": "format_size",
  "Theme Designer": "palette",
};

export const INITIAL_SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    label: "Navigation",
    icon: "menu_book",
    shortcuts: [
      { id: "nav-prev-chapter", category: "Navigation", keys: ["Ctrl", "P"], description: "Previous chapter" },
      { id: "nav-next-chapter", category: "Navigation", keys: ["Ctrl", "N"], description: "Next chapter" },
      { id: "nav-prev-verse", category: "Navigation", keys: ["Ctrl", "↑"], description: "Previous verse in current chapter" },
      { id: "nav-next-verse", category: "Navigation", keys: ["Ctrl", "↓"], description: "Next verse in current chapter" },
      { id: "nav-scripture", category: "Navigation", keys: ["Ctrl", "L"], description: "Focus scripture navigator", note: "From anywhere" },
      { id: "nav-search", category: "Navigation", keys: ["Ctrl", "K"], description: "Focus word search", note: "From anywhere" },
      { id: "nav-history", category: "Navigation", keys: ["Alt", "H"], description: "Open search history" },
      { id: "nav-fullscreen", category: "Navigation", keys: ["Ctrl", "F"], description: "Toggle fullscreen reading" },
      { id: "nav-escape", category: "Navigation", keys: ["Esc"], description: "Exit fullscreen / close open overlays" },
    ],
  },
  {
    label: "Reading & Study",
    icon: "chrome_reader_mode",
    shortcuts: [
      { id: "study-search-palette", category: "Reading & Study", keys: ["Ctrl", "K"], description: "Word search palette", note: "Fullscreen only" },
      { id: "study-scripture-palette", category: "Reading & Study", keys: ["Ctrl", "L"], description: "Focus scripture navigator", note: "Fullscreen only" },
      { id: "study-save-note", category: "Reading & Study", keys: ["Ctrl", "Enter"], description: "Save note", note: "Inside note editor" },
      { id: "study-parallel-toggle", category: "Reading & Study", keys: ["splitscreen"], description: "Toggle parallel mode", note: "Toolbar icon" },
      { id: "study-sync-scroll", category: "Reading & Study", keys: ["sync"], description: "Sync scroll between panes", note: "Parallel on" },
    ],
  },
  {
    label: "Live Show Console",
    icon: "live_tv",
    shortcuts: [
      { id: "live-go", category: "Live Show Console", keys: ["Enter"], description: "Send preview to live output (Go Live)", note: "When not typing" },
      { id: "live-back", category: "Live Show Console", keys: ["Backspace"], description: "Return to previous live verse (Back)", note: "When not typing" },
      { id: "live-prev-verse", category: "Live Show Console", keys: ["←"], description: "Previous verse in preview", note: "Or Ctrl+↑" },
      { id: "live-next-verse", category: "Live Show Console", keys: ["→"], description: "Next verse in preview", note: "Or Ctrl+↓" },
      { id: "live-prev-item", category: "Live Show Console", keys: ["↑"], description: "Previous schedule item", note: "Loads into Preview" },
      { id: "live-next-item", category: "Live Show Console", keys: ["↓"], description: "Next schedule item", note: "Loads into Preview" },
      { id: "live-range-shift", category: "Live Show Console", keys: ["Shift", "Arrows"], description: "Extend or shrink verse range", note: "Or Ctrl+Shift+↑/↓" },
      { id: "live-add-queue", category: "Live Show Console", keys: ["Ctrl", "Q"], description: "Add preview / range to schedule", literal: true },
      { id: "live-add-queue-alias", category: "Live Show Console", keys: ["Ctrl", "Alt", "Q"], description: "Add preview / range to schedule (alias)", literal: true },
      { id: "live-toggle-drawer", category: "Live Show Console", keys: ["Ctrl", "Shift", "Q"], description: "Toggle schedule drawer", literal: true },
      { id: "live-shift-click", category: "Live Show Console", keys: ["Shift", "Click"], description: "Select range of scriptures", note: "In verse list" },
    ],
  },
  {
    label: "Presentation Controls",
    icon: "slideshow",
    shortcuts: [
      { id: "pres-black", category: "Presentation Controls", keys: ["C"], description: "Cut output to black screen (on / off)", note: "When not typing" },
      { id: "pres-emergency", category: "Presentation Controls", keys: ["Ctrl", "Shift", "E"], description: "Emergency standby screen on / off", note: "Overrides output" },
      { id: "pres-ctx-1", category: "Presentation Controls", keys: ["Ctrl", "1"], description: "Verse context: Active verse only", note: "Presentation active" },
      { id: "pres-ctx-2", category: "Presentation Controls", keys: ["Ctrl", "2"], description: "Verse context: Active + next verse", note: "Presentation active" },
      { id: "pres-ctx-3", category: "Presentation Controls", keys: ["Ctrl", "3"], description: "Verse context: Prev + active + next", note: "Presentation active" },
      { id: "pres-ctx-4", category: "Presentation Controls", keys: ["Ctrl", "4"], description: "Verse context: Full chapter scroll", note: "Presentation active" },
    ],
  },
  {
    label: "Songs, Slides & Plan",
    icon: "queue_music",
    shortcuts: [
      { id: "songs-next-slide", category: "Songs, Slides & Plan", keys: ["Page Down"], description: "Next live slide / page", note: "Presentation clicker" },
      { id: "songs-prev-slide", category: "Songs, Slides & Plan", keys: ["Page Up"], description: "Previous live slide / page", note: "Presentation clicker" },
      { id: "plan-next-step", category: "Songs, Slides & Plan", keys: ["Shift", "Page Down"], description: "Next step in service plan", note: "Plan controller" },
      { id: "plan-prev-step", category: "Songs, Slides & Plan", keys: ["Shift", "Page Up"], description: "Previous step in service plan", note: "Plan controller" },
      { id: "songs-nav-list", category: "Songs, Slides & Plan", keys: ["↑", "↓"], description: "Navigate songs or slides", note: "In library list" },
      { id: "songs-queue-item", category: "Songs, Slides & Plan", keys: ["Enter"], description: "Add selected song or slide to schedule", note: "In library list" },
      { id: "songs-save-lyrics", category: "Songs, Slides & Plan", keys: ["Ctrl", "Enter"], description: "Save song lyrics", note: "Inside lyric editor" },
      { id: "slides-undo", category: "Songs, Slides & Plan", keys: ["Ctrl", "Z"], description: "Undo slide edit", note: "Slide editor" },
      { id: "slides-redo", category: "Songs, Slides & Plan", keys: ["Ctrl", "Shift", "Z"], description: "Redo slide edit", note: "Slide editor (or Ctrl+Y)" },
      { id: "slides-nudge", category: "Songs, Slides & Plan", keys: ["Arrow keys"], description: "Nudge selected element", note: "Slide editor (+Shift for 5×)" },
    ],
  },
  {
    label: "Search & AI",
    icon: "search",
    shortcuts: [
      { id: "ai-toggle", category: "Search & AI", keys: ["Ctrl", "Shift", "K"], description: "Open / close Ask Scripture", note: "AI search panel" },
      { id: "search-filter-menu", category: "Search & AI", keys: ["Alt", "F"], description: "Open search filter & scope menu", note: "In search bar" },
      { id: "search-clear-filters", category: "Search & AI", keys: ["Alt", "Shift", "F"], description: "Clear all search filters", note: "In search bar" },
      { id: "search-scope-prefix", category: "Search & AI", keys: ["ot/", "nt/", "book/"], description: "Scope search to OT, NT, book, or group (e.g. ot/love, rom/grace, gospels/faith)", note: "Lifts into filter chip" },
      { id: "search-force-word", category: "Search & AI", keys: ["/"], description: "Force word search for terms matching book names (e.g. /john, /acts)", note: "In search bar" },
      { id: "search-ai-prefix", category: "Search & AI", keys: ["?"], description: "Start Ask Scripture natural-language query (e.g. ? verses on hope)", note: "In search bar" },
      { id: "search-prev-result", category: "Search & AI", keys: ["Alt", "P"], description: "Previous search result", note: "When searching" },
      { id: "search-next-result", category: "Search & AI", keys: ["Alt", "N"], description: "Next search result", note: "When searching" },
      { id: "search-space-complete", category: "Search & AI", keys: ["Space"], description: "Auto-complete book or insert ':' after chapter", note: "In search bar" },
      { id: "search-drop-scope", category: "Search & AI", keys: ["Backspace"], description: "Remove the last search filter", note: "On empty search bar" },
      { id: "strongs-next-page", category: "Search & AI", keys: ["Page Down"], description: "Next Strong's output page", note: "When Strong's is live" },
      { id: "strongs-prev-page", category: "Search & AI", keys: ["Page Up"], description: "Previous Strong's output page", note: "When Strong's is live" },
    ],
  },
  {
    label: "Team Collaboration",
    icon: "groups",
    shortcuts: [
      { id: "team-share-verse", category: "Team Collaboration", keys: ["Ctrl", "Shift", "T"], description: "Send active verse to team (default recipient)", literal: true },
      { id: "team-live-doubleclick", category: "Team Collaboration", keys: ["Double", "Click"], description: "Send notification verse to Live screen", note: "Notification card" },
    ],
  },
  {
    label: "Font Size",
    icon: "format_size",
    shortcuts: [
      { id: "font-inc-1", category: "Font Size", keys: ["Ctrl", "+"], description: "Increase font size by 1px", note: "Max 98px" },
      { id: "font-dec-1", category: "Font Size", keys: ["Ctrl", "−"], description: "Decrease font size by 1px", note: "Min 14px" },
      { id: "font-preset-next", category: "Font Size", keys: ["Ctrl", "Alt", "+"], description: "Jump to next preset size", note: "14, 16, 32, 48, 64, 72, 98" },
      { id: "font-preset-prev", category: "Font Size", keys: ["Ctrl", "Alt", "−"], description: "Jump to previous preset size", note: "14, 16, 32, 48, 64, 72, 98" },
    ],
  },
  {
    label: "Theme Designer",
    icon: "palette",
    shortcuts: [
      { id: "theme-undo", category: "Theme Designer", keys: ["Ctrl", "Z"], description: "Undo theme edit", note: "Customization Studio" },
      { id: "theme-redo", category: "Theme Designer", keys: ["Ctrl", "Shift", "Z"], description: "Redo theme edit", note: "Customization Studio" },
      { id: "theme-nudge", category: "Theme Designer", keys: ["Arrow keys"], description: "Nudge selected theme element", note: "Canvas (+Shift for 4×)" },
    ],
  },
];

function appendShortcutToGroups(groups: ShortcutGroup[], item: ShortcutItem): ShortcutGroup[] {
  const cat = item.category || "General";
  const existingGroupIdx = groups.findIndex((g) => g.label.toLowerCase() === cat.toLowerCase());

  if (existingGroupIdx === -1) {
    const newGroup: ShortcutGroup = {
      label: cat,
      icon: DEFAULT_CATEGORY_ICONS[cat] || "keyboard",
      shortcuts: [item],
    };
    return [...groups, newGroup];
  }

  const group = groups[existingGroupIdx];
  const existingItemIdx = group.shortcuts.findIndex(
    (s) =>
      (item.id && s.id === item.id) ||
      (s.description.toLowerCase() === item.description.toLowerCase() && s.keys.join("+") === item.keys.join("+"))
  );

  let nextShortcuts: ShortcutItem[];
  if (existingItemIdx !== -1) {
    nextShortcuts = [...group.shortcuts];
    nextShortcuts[existingItemIdx] = { ...nextShortcuts[existingItemIdx], ...item };
  } else {
    nextShortcuts = [...group.shortcuts, item];
  }

  const updatedGroups = [...groups];
  updatedGroups[existingGroupIdx] = { ...group, shortcuts: nextShortcuts };
  return updatedGroups;
}

interface ShortcutStoreState {
  groups: ShortcutGroup[];
  registerShortcut: (item: ShortcutItem) => void;
  registerShortcuts: (items: ShortcutItem[]) => void;
  unregisterShortcut: (idOrDescription: string) => void;
  resetToDefaults: () => void;
}

export const useShortcutStore = create<ShortcutStoreState>((set) => ({
  groups: INITIAL_SHORTCUT_GROUPS,

  registerShortcut: (item) => {
    set((state) => ({
      groups: appendShortcutToGroups(state.groups, item),
    }));
  },

  registerShortcuts: (items) => {
    set((state) => {
      let current = state.groups;
      for (const item of items) {
        current = appendShortcutToGroups(current, item);
      }
      return { groups: current };
    });
  },

  unregisterShortcut: (idOrDescription) => {
    set((state) => ({
      groups: state.groups
        .map((g) => ({
          ...g,
          shortcuts: g.shortcuts.filter((s) => s.id !== idOrDescription && s.description !== idOrDescription),
        }))
        .filter((g) => g.shortcuts.length > 0),
    }));
  },

  resetToDefaults: () => {
    set({ groups: INITIAL_SHORTCUT_GROUPS });
  },
}));

/**
 * Register a shortcut into the system. Appends immediately to the shortcuts menu.
 * Can be called from any module, component, or plugin.
 */
export function registerShortcut(item: ShortcutItem): void {
  useShortcutStore.getState().registerShortcut(item);
}

/**
 * Register multiple shortcuts into the system at once.
 */
export function registerShortcuts(items: ShortcutItem[]): void {
  useShortcutStore.getState().registerShortcuts(items);
}

/**
 * Unregister a shortcut by its ID or description.
 */
export function unregisterShortcut(idOrDescription: string): void {
  useShortcutStore.getState().unregisterShortcut(idOrDescription);
}

/**
 * Get current list of shortcut groups.
 */
export function getShortcutGroups(): ShortcutGroup[] {
  return useShortcutStore.getState().groups;
}

/**
 * Test whether a KeyboardEvent matches a shortcut's key combination.
 * Automatically handles Ctrl vs Cmd on Mac, and skips typing in text fields
 * unless allowInInput is true.
 */
export function matchesShortcut(
  e: KeyboardEvent,
  keys: string[],
  options: { allowInInput?: boolean } = {}
): boolean {
  if (!options.allowInInput) {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) {
      return false;
    }
  }

  const needsMod = keys.some((k) => k.toLowerCase() === "ctrl" || k.toLowerCase() === "cmd");
  const needsShift = keys.some((k) => k.toLowerCase() === "shift");
  const needsAlt = keys.some((k) => k.toLowerCase() === "alt" || k.toLowerCase() === "option");

  const hasMod = e.ctrlKey || e.metaKey;
  const hasShift = e.shiftKey;
  const hasAlt = e.altKey;

  if (needsMod !== hasMod) return false;
  if (needsShift !== hasShift) return false;
  if (needsAlt !== hasAlt) return false;

  const primaryKeys = keys.filter(
    (k) => !["ctrl", "cmd", "shift", "alt", "option"].includes(k.toLowerCase())
  );
  if (primaryKeys.length === 0) return true;

  const primary = primaryKeys[0].toLowerCase();

  if (primary === "enter") return e.key === "Enter";
  if (primary === "backspace") return e.key === "Backspace";
  if (primary === "esc" || primary === "escape") return e.key === "Escape";
  if (primary === "space") return e.key === " ";
  if (primary === "page down" || primary === "pagedown") return e.key === "PageDown";
  if (primary === "page up" || primary === "pageup") return e.key === "PageUp";
  if (primary === "↑" || primary === "up") return e.key === "ArrowUp";
  if (primary === "↓" || primary === "down") return e.key === "ArrowDown";
  if (primary === "←" || primary === "left") return e.key === "ArrowLeft";
  if (primary === "→" || primary === "right") return e.key === "ArrowRight";
  if (primary === "+" || primary === "=") return e.key === "+" || e.key === "=" || e.code === "Equal" || e.code === "NumpadAdd";
  if (primary === "-" || primary === "−") return e.key === "-" || e.key === "−" || e.code === "Minus" || e.code === "NumpadSubtract";

  return e.key.toLowerCase() === primary || (Boolean(e.code) && e.code.toLowerCase() === `key${primary}`);
}

/**
 * React hook that binds a keyboard shortcut AND immediately registers it in the
 * shortcuts overlay. When a component uses this hook, the shortcut is automatically
 * visible in Settings -> Keyboard Shortcuts with zero manual configuration.
 */
export function useShortcut(
  item: ShortcutItem,
  handler: (e: KeyboardEvent) => void,
  options: { enabled?: boolean; allowInInput?: boolean } = {}
): void {
  useEffect(() => {
    registerShortcut(item);
  }, [item.id, item.category, item.description, item.note, ...item.keys]);

  useEffect(() => {
    if (options.enabled === false) return;
    function onKeyDown(e: KeyboardEvent) {
      if (matchesShortcut(e, item.keys, { allowInInput: options.allowInInput })) {
        handler(e);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handler, options.enabled, options.allowInInput, ...item.keys]);
}
