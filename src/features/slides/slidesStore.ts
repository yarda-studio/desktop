import { create } from "zustand";
import {
  emptySlide, newElementId, newFreeformPage, slidesApi,
  type SlideDoc, type SlideElement, type SlideKind, type SlidePage, type SlideSummary,
} from "./api";
import { emptyHistory, mapHistory, record, redo as redoStep, undo as undoStep, type History } from "./history";
import * as pages from "./pages";

/** What undo goes back to: the draft and the page being edited. */
interface Snapshot {
  draft: SlideDoc;
  pageIndex: number;
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : typeof e === "string" ? e : "Something went wrong";
}

/** `draft` with page `index` replaced by `fn(page)`. Other pages keep their identity. */
function mapPage(draft: SlideDoc, index: number, fn: (p: SlidePage) => SlidePage): SlideDoc {
  return { ...draft, pages: draft.pages.map((p, i) => (i === index ? fn(p) : p)) };
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
  /** The page of `draft` being edited. Element actions below act on this page. */
  pageIndex: number;
  /** JSON of the last saved/loaded draft; the editor is dirty when it differs. */
  baseline: string;
  /** Changes whenever a different slide is opened, so the editor remounts fresh. */
  draftKey: number;
  saving: boolean;
  saveError: string | null;
  /** Undo and redo for the open draft. Starts empty each time an editor opens. */
  history: History<Snapshot>;

  /** Step the editor back / forward one edit. Does nothing when there is nothing to step to. */
  undo: () => void;
  redo: () => void;

  refresh: () => Promise<void>;
  setQuery: (q: string) => void;
  select: (id: number | null) => void;
  openEditor: (id: number) => Promise<void>;
  newSlide: (kind: SlideKind) => void;
  update: (patch: Partial<Pick<SlideDoc, "title">>) => void;
  /** Change the current page's backdrop. */
  setBackground: (background: string) => void;
  /** Give every page the current page's backdrop. */
  applyBackgroundToAll: () => void;
  updateElement: (id: string, patch: Partial<SlideElement>) => void;
  /** The same change to several elements, as one undo step. */
  updateElements: (ids: string[], patch: Partial<SlideElement>) => void;
  /** Appends the element (on top of the current page) and returns its new id. */
  addElement: (element: SlideElement) => string;
  removeElement: (id: string) => void;
  /** Move an element one step toward the front (+1) or back (-1). */
  moveElement: (id: string, dir: -1 | 1) => void;

  /** Page operations apply to free-form slides only; announcements are one fixed page. */
  setPage: (index: number) => void;
  addPage: () => void;
  duplicatePage: (index: number) => void;
  removePage: (index: number) => void;
  movePage: (index: number, dir: -1 | 1) => void;

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
  pageIndex: 0,
  baseline: "",
  draftKey: 0,
  saving: false,
  saveError: null,
  history: emptyHistory(),

  undo: () => {
    const { draft, pageIndex, history } = get();
    if (!draft) return;
    const step = undoStep(history, { draft, pageIndex });
    if (step) set({ draft: step.state.draft, pageIndex: pages.clampIndex(step.state.pageIndex, step.state.draft.pages.length), history: step.history });
  },

  redo: () => {
    const { draft, pageIndex, history } = get();
    if (!draft) return;
    const step = redoStep(history, { draft, pageIndex });
    if (step) set({ draft: step.state.draft, pageIndex: pages.clampIndex(step.state.pageIndex, step.state.draft.pages.length), history: step.history });
  },

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
      set({ draft, pageIndex: 0, baseline: JSON.stringify(draft), draftKey: get().draftKey + 1, saveError: null, selectedId: id, history: emptyHistory() });
    } catch (e) {
      set({ libraryError: msg(e) });
    }
  },

  newSlide: (kind) => {
    const draft = emptySlide(kind);
    set({ draft, pageIndex: 0, baseline: JSON.stringify(draft), draftKey: get().draftKey + 1, saveError: null, history: emptyHistory() });
  },

  // Every change to the draft goes through `edit`, which notes the state before it
  // for undo. The key lets a burst of the same kind of change (a drag, typing)
  // count as one step; null means each change is its own step.
  update: (patch) => {
    const { draft } = get();
    if (draft) edit("title", { draft: { ...draft, ...patch } });
  },

  setBackground: (background) => {
    const { draft, pageIndex } = get();
    if (draft) edit("background", { draft: mapPage(draft, pageIndex, (p) => ({ ...p, background })) });
  },

  applyBackgroundToAll: () => {
    const { draft, pageIndex } = get();
    const current = draft?.pages[pageIndex];
    if (draft && current) edit(null, { draft: { ...draft, pages: draft.pages.map((p) => (p.background === current.background ? p : { ...p, background: current.background })) } });
  },

  updateElement: (id, patch) => get().updateElements([id], patch),

  updateElements: (ids, patch) => {
    const { draft, pageIndex } = get();
    if (!draft) return;
    const key = `el:${ids.join("+")}:${Object.keys(patch).sort().join(",")}`;
    edit(key, { draft: mapPage(draft, pageIndex, (p) => ({ ...p, elements: p.elements.map((e) => (ids.includes(e.id) ? { ...e, ...patch } : e)) })) });
  },

  addElement: (element) => {
    const id = newElementId();
    const { draft, pageIndex } = get();
    if (draft) edit(null, { draft: mapPage(draft, pageIndex, (p) => ({ ...p, elements: [...p.elements, { ...element, id }] })) });
    return id;
  },

  removeElement: (id) => {
    const { draft, pageIndex } = get();
    if (draft) edit(null, { draft: mapPage(draft, pageIndex, (p) => ({ ...p, elements: p.elements.filter((e) => e.id !== id) })) });
  },

  moveElement: (id, dir) => {
    const { draft, pageIndex } = get();
    if (!draft) return;
    const next = mapPage(draft, pageIndex, (p) => {
      const list = [...p.elements];
      const i = list.findIndex((e) => e.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return p;
      [list[i], list[j]] = [list[j], list[i]];
      return { ...p, elements: list };
    });
    // Already at the front or back: nothing changed, so nothing to undo.
    if (next.pages[pageIndex] !== draft.pages[pageIndex]) edit(null, { draft: next });
  },

  setPage: (index) => {
    const { draft } = get();
    if (draft) set({ pageIndex: pages.clampIndex(index, draft.pages.length) });
  },

  addPage: () => {
    const { draft, pageIndex } = get();
    if (!draft || draft.kind !== "freeform") return;
    const r = pages.insertPage(draft.pages, pageIndex + 1, newFreeformPage());
    edit(null, { draft: { ...draft, pages: r.pages }, pageIndex: r.index });
  },

  duplicatePage: (index) => {
    const { draft } = get();
    if (!draft || draft.kind !== "freeform") return;
    const r = pages.duplicatePage(draft.pages, index);
    edit(null, { draft: { ...draft, pages: r.pages }, pageIndex: r.index });
  },

  removePage: (index) => {
    const { draft } = get();
    if (!draft || draft.kind !== "freeform") return;
    const r = pages.removePage(draft.pages, index);
    edit(null, { draft: { ...draft, pages: r.pages }, pageIndex: r.index });
  },

  movePage: (index, dir) => {
    const { draft } = get();
    if (!draft || draft.kind !== "freeform") return;
    const r = pages.movePage(draft.pages, index, dir);
    edit(null, { draft: { ...draft, pages: r.pages }, pageIndex: r.index });
  },

  apply: async () => {
    const { draft } = get();
    if (!draft) return false;
    set({ saving: true, saveError: null });
    try {
      const saved = await slidesApi.save(draft);
      set((s) => ({
        draft: saved,
        pageIndex: pages.clampIndex(s.pageIndex, saved.pages.length),
        baseline: JSON.stringify(saved),
        saving: false,
        selectedId: saved.id,
        // A slide saved for the first time now has an id; older snapshots get it
        // too, or undoing to one and saving would create a second copy.
        history: mapHistory(s.history, (snap) => ({ ...snap, draft: { ...snap.draft, id: saved.id } })),
      }));
      await get().refresh();
      return true;
    } catch (e) {
      set({ saving: false, saveError: msg(e) });
      return false;
    }
  },

  ok: async () => {
    if (await get().apply()) set({ draft: null, pageIndex: 0, baseline: "", history: emptyHistory() });
  },

  cancel: () => set({ draft: null, pageIndex: 0, baseline: "", saveError: null, history: emptyHistory() }),

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

/** Apply a change to the open draft, noting the state before it for undo. */
function edit(key: string | null, patch: Partial<Pick<SlidesState, "draft" | "pageIndex">>) {
  const { draft, pageIndex, history } = useSlidesStore.getState();
  if (!draft) return;
  useSlidesStore.setState({ ...patch, history: record(history, { draft, pageIndex }, key, Date.now()) });
}

export const selectCanUndo = (s: SlidesState) => s.history.past.length > 0;
export const selectCanRedo = (s: SlidesState) => s.history.future.length > 0;

export const selectDirty = (s: SlidesState) => s.draft !== null && JSON.stringify(s.draft) !== s.baseline;
