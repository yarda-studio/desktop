import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { MAX_PAGES, clampIndex, duplicatePage, insertPage, movePage, pageText, removePage, stepWithin } from "./pages.ts";
import type { SlidePage } from "./api.ts";

const page = (id: string, text = ""): SlidePage => ({
  id,
  background: "theme",
  elements: text
    ? [{ id: "e", kind: "text", x: 0, y: 0, w: 10, h: 10, text, font_size: 64, color: "#ffffff", align: "center", bold: true, image: null }]
    : [],
});
const ids = (pages: SlidePage[]) => pages.map((p) => p.id);

describe("slide page helpers", () => {
  test("insertPage places a page and reports where it went", () => {
    const r = insertPage([page("a"), page("b")], 1, page("x"));
    assert.deepEqual(ids(r.pages), ["a", "x", "b"]);
    assert.equal(r.index, 1);
    assert.equal(insertPage([page("a")], 99, page("x")).index, 1);
  });

  test("insertPage stops at the page cap", () => {
    const full = Array.from({ length: MAX_PAGES }, (_, i) => page(`p${i}`));
    const r = insertPage(full, 0, page("x"));
    assert.equal(r.pages.length, MAX_PAGES);
    assert.equal(r.pages, full);
  });

  test("duplicatePage copies after the source with a fresh id and its own elements", () => {
    const src = page("a", "Hello");
    const r = duplicatePage([src, page("b")], 0);
    assert.equal(r.index, 1);
    assert.equal(r.pages.length, 3);
    assert.notEqual(r.pages[1].id, "a");
    assert.equal(r.pages[1].elements[0].text, "Hello");
    assert.notEqual(r.pages[1].elements[0], src.elements[0]);
    assert.equal(duplicatePage([src], 5).pages.length, 1);
  });

  test("removePage never leaves a slide with no pages and keeps a sane selection", () => {
    assert.equal(removePage([page("a")], 0).pages.length, 1);
    const r = removePage([page("a"), page("b"), page("c")], 2);
    assert.deepEqual(ids(r.pages), ["a", "b"]);
    assert.equal(r.index, 1);
    assert.deepEqual(ids(removePage([page("a"), page("b")], 0).pages), ["b"]);
  });

  test("movePage swaps neighbours and ignores the ends", () => {
    const list = [page("a"), page("b"), page("c")];
    const r = movePage(list, 1, 1);
    assert.deepEqual(ids(r.pages), ["a", "c", "b"]);
    assert.equal(r.index, 2);
    assert.equal(movePage(list, 0, -1).pages, list);
    assert.equal(movePage(list, 2, 1).pages, list);
  });

  test("stepWithin stays inside the slide or says it ran off the end", () => {
    assert.equal(stepWithin(0, 3, 1), 1);
    assert.equal(stepWithin(2, 3, -1), 1);
    assert.equal(stepWithin(2, 3, 1), null);
    assert.equal(stepWithin(0, 3, -1), null);
    assert.equal(stepWithin(0, 1, 1), null);
  });

  test("pageText joins text boxes and skips pictures and blanks", () => {
    const p = page("a", "  Line one ");
    p.elements.push({ ...p.elements[0], id: "pic", kind: "image", text: "ignored" });
    p.elements.push({ ...p.elements[0], id: "blank", text: "   " });
    p.elements.push({ ...p.elements[0], id: "two", text: "Line two" });
    assert.equal(pageText(p), "Line one\nLine two");
    assert.equal(pageText(undefined), "");
  });

  test("clampIndex handles empty and out-of-range", () => {
    assert.equal(clampIndex(5, 3), 2);
    assert.equal(clampIndex(-1, 3), 0);
    assert.equal(clampIndex(0, 0), 0);
  });
});
