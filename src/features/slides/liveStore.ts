import { create } from "zustand";
import { slidesApi, type SlideDoc, type SlideSummary } from "./api";

interface LiveState {
  schedule: SlideSummary[];
  /** The scheduled slide shown in Preview. */
  previewId: number | null;
  previewSlide: SlideDoc | null;
  /** A frozen copy of the slide on the output, so edits don't change it mid-service. */
  live: SlideDoc | null;

  load: () => Promise<void>;
  /** Re-read the schedule and preview after the library changed (edit, delete). */
  syncWithLibrary: () => Promise<void>;
  addToSchedule: (id: number) => Promise<void>;
  removeFromSchedule: (id: number) => Promise<void>;
  moveInSchedule: (id: number, dir: -1 | 1) => Promise<void>;
  clearSchedule: () => Promise<void>;
  preview: (id: number) => Promise<void>;
  /** Send the previewed slide (or the one with `id`) to the output. */
  goLive: (id?: number) => Promise<void>;
  /** Preview and send the next (+1) or previous (-1) scheduled slide. */
  stepLive: (delta: -1 | 1) => Promise<void>;
  /** Take the slide off the live panel without touching the output. */
  clearLive: () => void;
}

async function persist(ids: number[]) {
  try { await slidesApi.setSchedule(ids); } catch (e) { console.error("[slides] failed to save schedule", e); }
}

export const useSlidesLive = create<LiveState>((set, get) => ({
  schedule: [],
  previewId: null,
  previewSlide: null,
  live: null,

  load: async () => {
    try {
      const schedule = await slidesApi.schedule();
      set({ schedule });
      const first = schedule[0];
      if (first && get().previewId === null) await get().preview(first.id);
    } catch (e) {
      console.error("[slides] failed to load schedule", e);
    }
  },

  syncWithLibrary: async () => {
    try {
      const schedule = await slidesApi.schedule();
      set({ schedule });
      const { previewId, previewSlide } = get();
      if (previewId === null) return;
      const entry = schedule.find((s) => s.id === previewId);
      if (!entry) {
        set({ previewId: null, previewSlide: null });
        if (schedule[0]) await get().preview(schedule[0].id);
      } else if (!previewSlide || entry.updated_at !== previewSlide.updated_at) {
        set({ previewSlide: await slidesApi.get(previewId) });
      }
    } catch (e) {
      console.error("[slides] failed to sync schedule", e);
    }
  },

  addToSchedule: async (id) => {
    const { schedule } = get();
    if (!schedule.some((s) => s.id === id)) {
      await persist([...schedule.map((s) => s.id), id]);
      set({ schedule: await slidesApi.schedule().catch(() => schedule) });
    }
    await get().preview(id);
  },

  removeFromSchedule: async (id) => {
    await persist(get().schedule.map((s) => s.id).filter((x) => x !== id));
    set({ schedule: get().schedule.filter((s) => s.id !== id) });
    if (get().previewId === id) {
      set({ previewId: null, previewSlide: null });
      const next = get().schedule[0];
      if (next) await get().preview(next.id);
    }
  },

  moveInSchedule: async (id, dir) => {
    const list = [...get().schedule];
    const i = list.findIndex((s) => s.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    set({ schedule: list });
    await persist(list.map((s) => s.id));
  },

  clearSchedule: async () => {
    await persist([]);
    set({ schedule: [], previewId: null, previewSlide: null });
  },

  preview: async (id) => {
    try {
      set({ previewId: id, previewSlide: await slidesApi.get(id) });
    } catch (e) {
      console.error("[slides] failed to load slide", e);
    }
  },

  goLive: async (id) => {
    if (id !== undefined && id !== get().previewId) await get().preview(id);
    const { previewSlide } = get();
    if (previewSlide) set({ live: previewSlide });
  },

  stepLive: async (delta) => {
    const { schedule, live } = get();
    if (schedule.length === 0) return;
    const at = live?.id != null ? schedule.findIndex((s) => s.id === live.id) : -1;
    const next = schedule[at + delta];
    if (next) await get().goLive(next.id);
  },

  clearLive: () => set({ live: null }),
}));
