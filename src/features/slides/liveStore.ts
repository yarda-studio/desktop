import { create } from "zustand";
import { slidesApi, type SlideDoc, type SlideSummary } from "./api";
import { clampIndex, stepWithin } from "./pages";

interface LiveState {
  schedule: SlideSummary[];
  /** The scheduled slide shown in Preview. */
  previewId: number | null;
  previewSlide: SlideDoc | null;
  /** Which page of `previewSlide` Preview shows. */
  previewPage: number;
  /** A frozen copy of the slide on the output, so edits don't change it mid-service. */
  live: SlideDoc | null;
  /** Which page of `live` is on the output. */
  livePage: number;

  load: () => Promise<void>;
  /** Re-read the schedule and preview after the library changed (edit, delete). */
  syncWithLibrary: () => Promise<void>;
  addToSchedule: (id: number) => Promise<void>;
  removeFromSchedule: (id: number) => Promise<void>;
  moveInSchedule: (id: number, dir: -1 | 1) => Promise<void>;
  clearSchedule: () => Promise<void>;
  /** Preview slide `id`, opening on `page` (clamped to the slide's last page). */
  preview: (id: number, page?: number) => Promise<void>;
  setPreviewPage: (page: number) => void;
  /** Send the previewed slide, at the previewed page (or the first page of the one with `id`), to the output. */
  goLive: (id?: number) => Promise<void>;
  /**
   * Step the live slide: to its next (+1) or previous (-1) page, and once past
   * its last or first page, to the neighbouring scheduled slide.
   */
  stepLive: (delta: -1 | 1) => Promise<void>;
  /** Jump the output to another page of the live slide. */
  setLivePage: (page: number) => void;
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
  previewPage: 0,
  live: null,
  livePage: 0,

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
        set({ previewId: null, previewSlide: null, previewPage: 0 });
        if (schedule[0]) await get().preview(schedule[0].id);
      } else if (!previewSlide || entry.updated_at !== previewSlide.updated_at) {
        // The slide was edited: keep the page being previewed unless it no longer exists.
        const slide = await slidesApi.get(previewId);
        set({ previewSlide: slide, previewPage: clampIndex(get().previewPage, slide.pages.length) });
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
      set({ previewId: null, previewSlide: null, previewPage: 0 });
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
    set({ schedule: [], previewId: null, previewSlide: null, previewPage: 0 });
  },

  preview: async (id, page = 0) => {
    try {
      const slide = await slidesApi.get(id);
      set({ previewId: id, previewSlide: slide, previewPage: clampIndex(page, slide.pages.length) });
    } catch (e) {
      console.error("[slides] failed to load slide", e);
    }
  },

  setPreviewPage: (page) => {
    const { previewSlide } = get();
    if (previewSlide) set({ previewPage: clampIndex(page, previewSlide.pages.length) });
  },

  goLive: async (id) => {
    if (id !== undefined && id !== get().previewId) await get().preview(id);
    const { previewSlide, previewPage } = get();
    if (previewSlide) set({ live: previewSlide, livePage: previewPage });
  },

  stepLive: async (delta) => {
    const { schedule, live, livePage } = get();
    if (live) {
      const within = stepWithin(livePage, live.pages.length, delta);
      if (within !== null) {
        set({ livePage: within });
        return;
      }
    }
    if (schedule.length === 0) return;
    const at = live?.id != null ? schedule.findIndex((s) => s.id === live.id) : -1;
    const next = schedule[at + delta];
    if (!next) return;
    // Forward lands on the first page, back on the last, like paging through a deck.
    // Preview and live are set together so the output never flashes the wrong page.
    await get().preview(next.id, delta < 0 ? Number.MAX_SAFE_INTEGER : 0);
    const { previewSlide, previewPage } = get();
    if (previewSlide?.id === next.id) set({ live: previewSlide, livePage: previewPage });
  },

  setLivePage: (page) => {
    const { live } = get();
    if (live) set({ livePage: clampIndex(page, live.pages.length) });
  },

  clearLive: () => set({ live: null, livePage: 0 }),
}));
