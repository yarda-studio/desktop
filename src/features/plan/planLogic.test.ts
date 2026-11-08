import test, { describe } from "node:test";
import assert from "node:assert/strict";
import {
  behindAtEntry, cursorAfterRemove, cursorAfterReorder, formatBehind, formatDuration, itemDetail,
  makeItem, moveItem, parseDuration, planOwnsView, plannedStarts, removeItem, totalSecs,
} from "./planLogic.ts";

const step = (id: string, secs: number | null = null) => makeItem("note", { id, duration_secs: secs });
const ids = (items: { id: string }[]) => items.map((i) => i.id);

describe("plan ordering", () => {
  test("moveItem swaps neighbours and ignores the ends and unknown ids", () => {
    const list = [step("a"), step("b"), step("c")];
    assert.deepEqual(ids(moveItem(list, "b", 1)), ["a", "c", "b"]);
    assert.deepEqual(ids(moveItem(list, "b", -1)), ["b", "a", "c"]);
    assert.equal(moveItem(list, "a", -1), list);
    assert.equal(moveItem(list, "c", 1), list);
    assert.equal(moveItem(list, "zzz", 1), list);
  });

  test("removeItem drops one step and leaves the list alone for an unknown id", () => {
    const list = [step("a"), step("b")];
    assert.deepEqual(ids(removeItem(list, "a")), ["b"]);
    assert.equal(removeItem(list, "zzz"), list);
  });

  test("the cursor keeps pointing at the same step when an earlier one is removed", () => {
    const list = [step("a"), step("b"), step("c")];
    assert.equal(cursorAfterRemove(list, 2, "a"), 1);
    assert.equal(cursorAfterRemove(list, 1, "c"), 1);
    assert.equal(cursorAfterRemove(list, 1, "b"), -1, "removing the current step clears the cursor");
    assert.equal(cursorAfterRemove(list, -1, "a"), -1);
    assert.equal(cursorAfterRemove(list, 1, "zzz"), 1);
  });

  test("the cursor follows its step when the plan is reordered", () => {
    const before = [step("a"), step("b"), step("c")];
    const after = moveItem(before, "b", 1);
    assert.equal(cursorAfterReorder(before, after, 1), 2);
    assert.equal(cursorAfterReorder(before, after, 0), 0);
    assert.equal(cursorAfterReorder(before, after, -1), -1);
  });
});

describe("plan timing", () => {
  test("planned starts add up the lengths, treating a missing length as zero", () => {
    const list = [step("a", 60), step("b"), step("c", 120), step("d", 30)];
    assert.deepEqual(plannedStarts(list), [0, 60, 60, 180]);
    assert.equal(totalSecs(list), 210);
    assert.equal(totalSecs([]), 0);
  });

  test("behindAtEntry compares the real clock with the planned start", () => {
    const list = [step("a", 300), step("b", 300)];
    assert.equal(behindAtEntry(list, 1, 330), 30, "entered 30s late");
    assert.equal(behindAtEntry(list, 1, 280), -20, "entered 20s early");
    assert.equal(behindAtEntry(list, 5, 100), null);
  });

  test("formatDuration and formatBehind read naturally", () => {
    assert.equal(formatDuration(65), "1:05");
    assert.equal(formatDuration(3725), "1:02:05");
    assert.equal(formatDuration(-4), "0:00");
    assert.equal(formatBehind(130), "2:10 behind");
    assert.equal(formatBehind(-65), "1:05 ahead");
    assert.equal(formatBehind(3), "on time");
  });

  test("parseDuration reads minutes, m:ss and h:mm:ss, and refuses nonsense", () => {
    assert.equal(parseDuration("4"), 240);
    assert.equal(parseDuration("4:30"), 270);
    assert.equal(parseDuration("1:05:00"), 3900);
    assert.equal(parseDuration("  "), null);
    assert.equal(parseDuration("abc"), undefined);
    assert.equal(parseDuration("1:2:3:4"), undefined);
    assert.equal(parseDuration("-5"), undefined);
  });
});

describe("who owns Next and Back", () => {
  test("a step owns the tab it was shown on, and cues own all three output tabs", () => {
    assert.equal(planOwnsView(makeItem("verse"), "live"), true);
    assert.equal(planOwnsView(makeItem("verse"), "songs"), false);
    assert.equal(planOwnsView(makeItem("song"), "songs"), true);
    assert.equal(planOwnsView(makeItem("song"), "slides"), false);
    assert.equal(planOwnsView(makeItem("slide"), "slides"), true);
    for (const kind of ["countdown", "black", "note"] as const) {
      for (const view of ["live", "songs", "slides"]) assert.equal(planOwnsView(makeItem(kind), view), true);
      assert.equal(planOwnsView(makeItem(kind), "reading"), false);
    }
  });

  test("with no current step the plan owns nothing", () => {
    assert.equal(planOwnsView(undefined, "live"), false);
  });
});

describe("plan items", () => {
  test("makeItem fills sensible blanks and lets the caller override them", () => {
    const song = makeItem("song", { ref_id: 7, title: "Amazing Grace" });
    assert.equal(song.kind, "song");
    assert.equal(song.ref_id, 7);
    assert.equal(song.title, "Amazing Grace");
    assert.equal(song.note, "");
    assert.equal(makeItem("black").title, "Black screen");
    assert.notEqual(makeItem("note").id, makeItem("note").id);
  });

  test("itemDetail prefers the subtitle, then the Bible translation for a verse", () => {
    assert.equal(itemDetail(makeItem("song", { subtitle: "Verses 1 and 3" })), "Verses 1 and 3");
    assert.equal(itemDetail(makeItem("verse", { module: "KJV" })), "KJV");
    assert.equal(itemDetail(makeItem("note")), "");
  });
});
