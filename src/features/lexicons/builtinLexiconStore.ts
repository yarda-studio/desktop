import { create } from "zustand";
import { api, type InstalledModule } from "../../lib/tauri";

/**
 * The lexicons that ship with Yarda (Thayer, Abbott-Smith, BDB, full LSJ) and whether each is on.
 * The Module Library shows and toggles them; the Strong's panel and Settings read the same state
 * so a lexicon switched off disappears everywhere at once.
 *
 * Until the first load finishes (and in a plain browser with no backend) nothing is known, and
 * everything counts as on, so the panel never starts out empty.
 */

/** Source ids the Strong's panel uses, which are also the built-in lexicon ids. */
export type BuiltinLexiconId = "THAYER" | "TBESG" | "TBESH" | "TFLSJ";

interface BuiltinLexiconState {
  /** All four, whether or not their data is on disk yet. Empty until loaded. */
  entries: InstalledModule[];
  loaded: boolean;
  load: () => Promise<void>;
  /** Switch one on or off. Updates the screen at once and rolls back if saving fails. */
  setEnabled: (id: string, enabled: boolean) => Promise<void>;
}

export const useBuiltinLexicons = create<BuiltinLexiconState>((set, get) => ({
  entries: [],
  loaded: false,

  load: async () => {
    try {
      const entries = await api.listBuiltinLexicons();
      set({ entries, loaded: true });
    } catch {
      // No backend (browser preview) or a read error: leave everything on.
      set({ loaded: true });
    }
  },

  setEnabled: async (id, enabled) => {
    const before = get().entries;
    set({ entries: before.map((e) => (e.id === id ? { ...e, enabled } : e)) });
    try {
      await api.setBuiltinLexiconEnabled(id, enabled);
    } catch {
      set({ entries: before });
    }
  },
}));

/** True unless the user has switched this built-in lexicon off. Ids that are not built-in are always on. */
export function isLexiconOn(entries: readonly InstalledModule[], id: string): boolean {
  const entry = entries.find((e) => e.id.toUpperCase() === id.toUpperCase());
  return entry ? entry.enabled !== false : true;
}
