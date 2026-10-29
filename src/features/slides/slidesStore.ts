import { create } from "zustand";
import { emptySlide, newElementId, slidesApi, type SlideDoc, type SlideElement, type SlideKind, type SlideSummary } from "./api";

function msg(e: unknown): string {
  return e instanceof Error ? e.message : typeof e === "string" ? e : "Something went wrong";
}

interface SlidesState {
  slides: SlideSummary[];
  query: string;
  loading: boolean;
  /** Set when the library itself can't be read (e.g. slides.db failed to open). */
  libraryError: string | null;
  selectedId: number | null;

  /** The slide open in the editor dialog, edited in memory until Apply / OK. */
  draft: SlideDoc | null;
  /** JSON of the last saved/loaded draft; the editor is dirty when it differs. */
  baseline: string;
  /** Changes whenever a different slide is opened, so the editor remounts fresh. */
  draftKey: number;
  saving: boolean;
  saveError: string | null;

  refresh: () => Promise<void>;
  setQuery: (q: string) => void;
  select: (id: number | null) => void;
  openEditor: (id: number) => Promise<void>;
  newSlide: (kind: SlideKind) => void;
  update: (patch: Partial<SlideDoc>) => void;
  updateElement: (id: string, patch: Partial<SlideElement>) => void;
  /** Appends the element (on top) and returns its new id. */
  addElement: (element: SlideElement) => string;
  removeElement: (id: string) => void;
  /** Move an element one step toward the front (+1) or back (-1). */
  moveElement: (id: string, dir: -1 | 1) => void;
  /** Save and keep the editor open. Returns false if it couldn't be saved. */
  apply: () => Promise<boolean>;
  /** Save and close. */
  ok: () => Promise<void>;
  cancel: () => void;
  remove: (id: number) => Promise<void>;
}

let searchTimer: ReturnType<typeof setTimeout> | null = null;
// Stops a slow response for an older query overwriting a newer one.
let listSeq = 0;

export const useSlidesStore = create<SlidesState>((set, get) => ({
  slides: [],
  query: "",
  loading: false,
  libraryError: null,
  selectedId: null,
  draft: null,
  baseline: "",
  draftKey: 0,
  saving: false,
  saveError: null,

  refresh: async () => {
    const seq = ++listSeq;
    set({ loading: true });
    try {
      const slides = await slidesApi.list(get().query);
      if (seq === listSeq) set({ slides, libraryError: null, loading: false });
    } catch (e) {
      if (seq === listSeq) set({ libraryError: msg(e), loading: false });
    }
  },

  setQuery: (query) => {
    set({ query });
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => void get().refresh(), 150);
  },

  select: (selectedId) => set({ selectedId }),

  openEditor: async (id) => {
    try {
      const draft = await slidesApi.get(id);
      set({ draft, baseline: JSON.stringify(draft), draftKey: get().draftKey + 1, saveError: null, selectedId: id });
    } catch (e) {
      set({ libraryError: msg(e) });
    }
  },

  newSlide: (kind) => {
    const draft = emptySlide(kind);
    set({ draft, baseline: JSON.stringify(draft), draftKey: get().draftKey + 1, saveError: null });
  },

  update: (patch) => {
    const { draft } = get();
    if (draft) set({ draft: { ...draft, ...patch } });
  },

  updateElement: (id, patch) => {
    const { draft } = get();
    if (!draft) return;
    set({ draft: { ...draft, elements: draft.elements.map((e) => (e.id === id ? { ...e, ...patch } : e)) } });
  },

  addElement: (element) => {
    const id = newElementId();
    const { draft } = get();
    if (draft) set({ draft: { ...draft, elements: [...draft.elements, { ...element, id }] } });
    return id;
  },

  removeElement: (id) => {
    const { draft } = get();
    if (draft) set({ draft: { ...draft, elements: draft.elements.filter((e) => e.id !== id) } });
  },

  moveElement: (id, dir) => {
    const { draft } = get();
    if (!draft) return;
    const list = [...draft.elements];
    const i = list.findIndex((e) => e.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    set({ draft: { ...draft, elements: list } });
  },

  apply: async () => {
    const { draft } = get();
    if (!draft) return false;
    set({ saving: true, saveError: null });
    try {
      const saved = await slidesApi.save(draft);
      set({ draft: saved, baseline: JSON.stringify(saved), saving: false, selectedId: saved.id });
      await get().refresh();
      return true;
    } catch (e) {
      set({ saving: false, saveError: msg(e) });
      return false;
    }
  },

  ok: async () => {
    if (await get().apply()) set({ draft: null, baseline: "" });
  },

  cancel: () => set({ draft: null, baseline: "", saveError: null }),

  remove: async (id) => {
    try {
      await slidesApi.remove(id);
      if (get().selectedId === id) set({ selectedId: null });
      await get().refresh();
    } catch (e) {
      set({ libraryError: msg(e) });
    }
  },
}));

export const selectDirty = (s: SlidesState) => s.draft !== null && JSON.stringify(s.draft) !== s.baseline;

