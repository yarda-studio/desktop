import { useAppStore } from "../../store/app";
import { createVerseParts, verseKey } from "./versePartsCore";

/** Connects the verse-part rules to the app's live verse part. */
const parts = createVerseParts({
  getPart: () => useAppStore.getState().versePart,
  setPart: (part) => useAppStore.getState().setVersePart(part),
});

export { verseKey };
export const reportVerseParts = parts.report;
export const requestLastPart = parts.requestLast;
export const forgetLastPartRequest = parts.forgetRequest;
export const stepVerseParts = parts.step;
