import { create } from "zustand";
import { scheduleSync } from "../sync/syncEngine";
import { activateItem, leaveItem, stepWithinItem } from "./activate";
import { planApi, type PlanItem } from "./api";
import {
  MAX_PLAN_ITEMS, behindAtEntry, clampIndex, cursorAfterRemove, cursorAfterReorder, moveItem, removeItem,
} from "./planLogic";

function msg(e: unknown): string {
  return e instanceof Error ? e.message : typeof e === "string" ? e : "Something went wrong";
}

interface PlanState {
  items: PlanItem[];
  loaded: boolean;
  /** A problem to show the operator (a step that could not be shown, a save that failed). */
  error: string | null;
  /** The step the plan last put on screen, or -1. */
  activeIndex: number;
  /** When the service clock started, in ms. Starts with the first step shown. */
  startedAt: number | null;
  /** When the current step began, in ms. */
  enteredAt: number | null;
  /** How far behind (+) or ahead (-) of the plan the service was on entering the current step. */
  behindSecs: number | null;

  load: () => Promise<void>;
  add: (item: PlanItem) => void;
  remove: (id: string) => void;
  move: (id: string, dir: -1 | 1) => void;
  update: (id: string, patch: Partial<PlanItem>) => void;
  clear: () => void;
  /** Put step `index` on the output. */
  activate: (index: number, fromEnd?: boolean) => Promise<void>;
  /** Next (+1) or previous (-1): inside the current step first, then on to the neighbouring step. */
  step: (delta: -1 | 1) => Promise<void>;
  /** Stop the clock and forget which step was current. The output is left as it is. */
  resetClock: () => void;
  dismissError: () => void;
}

// Saves are queued so a slow earlier save can never land after a newer one.
let saveChain: Promise<void> = Promise.resolve();

export const usePlan = create<PlanState>((set, get) => {
  /** Show `items` at once, then save them. A failed save puts back what is actually stored. */
  function commit(items: PlanItem[], cursor: number = get().activeIndex) {
    set({ items, activeIndex: clampIndex(cursor, items.length) === cursor ? cursor : -1 });
    saveChain = saveChain.then(async () => {
      try {
        const stored = await planApi.set(items);
        // Send the change to the cloud shortly (does nothing without cloud sync).
        scheduleSync(2000);
        // Adopt the stored copy (normalised ids and text) unless the operator has edited again since.
        if (get().items === items) set({ items: stored });
      } catch (e) {
        set({ error: msg(e) });
        try { set({ items: await planApi.list() }); } catch { /* keep what is on screen */ }
      }
    });
  }

  return {
    items: [],
    loaded: false,
    error: null,
    activeIndex: -1,
    startedAt: null,
    enteredAt: null,
    behindSecs: null,

    load: async () => {
      try {
        set({ items: await planApi.list(), loaded: true, error: null });
      } catch (e) {
        // Not "loaded": saving over a plan we could not read would erase it.
        set({ loaded: false, error: msg(e) });
      }
    },

    add: (item) => {
      const { items } = get();
      if (items.length >= MAX_PLAN_ITEMS) {
        set({ error: `A plan can have at most ${MAX_PLAN_ITEMS} steps.` });
        return;
      }
      commit([...items, item]);
    },

    remove: (id) => {
      const { items, activeIndex } = get();
      commit(removeItem(items, id), cursorAfterRemove(items, activeIndex, id));
    },

    move: (id, dir) => {
      const { items, activeIndex } = get();
      const next = moveItem(items, id, dir);
      if (next !== items) commit(next, cursorAfterReorder(items, next, activeIndex));
    },

    update: (id, patch) => {
      const { items } = get();
      commit(items.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    },

    clear: () => {
      commit([], -1);
      set({ startedAt: null, enteredAt: null, behindSecs: null });
    },

    activate: async (index, fromEnd = false) => {
      const { items, activeIndex } = get();
      const item = items[index];
      if (!item) return;
      try {
        const previous = items[activeIndex];
        if (previous) leaveItem(previous);
        await activateItem(item, fromEnd);
      } catch (e) {
        set({ error: msg(e) });
        return;
      }
      const now = Date.now();
      const startedAt = get().startedAt ?? now;
      set({
        activeIndex: index,
        startedAt,
        enteredAt: now,
        behindSecs: behindAtEntry(items, index, (now - startedAt) / 1000),
        error: null,
      });
    },

    step: async (delta) => {
      const { items, activeIndex } = get();
      const current = items[activeIndex];
      if (current && stepWithinItem(current, delta)) return;
      const next = activeIndex < 0 ? (delta > 0 ? 0 : -1) : activeIndex + delta;
      if (next < 0 || next >= items.length) return;
      // Stepping Back into a step lands on its end, so Next and Back retrace each other.
      await get().activate(next, delta < 0);
    },

    resetClock: () => set({ activeIndex: -1, startedAt: null, enteredAt: null, behindSecs: null }),

    dismissError: () => set({ error: null }),
  };
});
