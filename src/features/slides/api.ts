import { invoke } from "@tauri-apps/api/core";
import type { SlideDocPayload, SlideElementData } from "../../lib/presentation";

export type SlideElement = SlideElementData;
export type SlideKind = "announcement" | "freeform";

export interface SlideDoc extends SlideDocPayload {
  /** null until the slide has been saved once. */
  id: number | null;
  kind: SlideKind;
  updated_at: number;
}

export interface SlideSummary {
  id: number;
  title: string;
  kind: SlideKind;
  updated_at: number;
}

export const slidesApi = {
  list: (query?: string) => invoke<SlideSummary[]>("list_slides", { query: query?.trim() || null }),
  get: (id: number) => invoke<SlideDoc>("get_slide", { id }),
  save: (slide: SlideDoc) => invoke<SlideDoc>("save_slide", { slide }),
  remove: (id: number) => invoke<void>("delete_slide", { id }),
  schedule: () => invoke<SlideSummary[]>("get_slide_schedule"),
  setSchedule: (ids: number[]) => invoke<void>("set_slide_schedule", { ids }),
};

let counter = 0;
export function newElementId() {
  counter += 1;
  return `e${Date.now().toString(36)}${counter}`;
}

export function textElement(patch: Partial<SlideElement> = {}): SlideElement {
  return {
    id: newElementId(), kind: "text", x: 10, y: 10, w: 80, h: 20, text: "", font_size: 64,
    color: "#ffffff", align: "center", bold: true, image: null, ...patch,
  };
}

/** Announcement slides are always exactly these two boxes: a heading and the message. */
export const ANNOUNCEMENT_TITLE_ID = "title";
export const ANNOUNCEMENT_BODY_ID = "body";

export function emptySlide(kind: SlideKind): SlideDoc {
  const elements = kind === "announcement"
    ? [
        textElement({ id: ANNOUNCEMENT_TITLE_ID, x: 8, y: 12, w: 84, h: 22, font_size: 96 }),
        textElement({ id: ANNOUNCEMENT_BODY_ID, x: 8, y: 38, w: 84, h: 50, font_size: 56, bold: false }),
      ]
    : [textElement({ x: 10, y: 38, w: 80, h: 24 })];
  return { id: null, title: "", kind, background: "theme", elements, updated_at: 0 };
}

export function toPayload(doc: SlideDoc): SlideDocPayload {
  return { title: doc.title, background: doc.background, elements: doc.elements };
}
