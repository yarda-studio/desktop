import test, { describe } from "node:test";
import assert from "node:assert/strict";
import {
  referenceModuleFontSize,
  relativeReferenceFontSize,
  relativeReferenceGap,
  relativeReferenceReservedHeight,
} from "./liveText.ts";
import { readabilityWarnings, STARTER_THEME } from "./themeDraft.ts";

describe("relative reference sizing", () => {
  test("scales proportionally with the displayed verse font size and floors at 12px", () => {
    assert.equal(relativeReferenceFontSize(100, 0.35), 35);
    assert.equal(relativeReferenceFontSize(40, 0.35), 14);
    assert.equal(relativeReferenceFontSize(24, 0.35), 12);
  });

  test("scales translation badge proportionally when followVerse is enabled", () => {
    assert.equal(referenceModuleFontSize(40, true), 33);
    assert.equal(referenceModuleFontSize(12, true), 10);
    assert.equal(referenceModuleFontSize(40, false), 37);
  });

  test("scales vertical gap proportionally with displayed verse font size", () => {
    assert.equal(relativeReferenceGap(100), 25);
    assert.equal(relativeReferenceGap(20), 8);
  });

  test("reserves split-box height only when reference_follow_verse is enabled", () => {
    const themeBase = {
      ...STARTER_THEME,
      id: "t1",
      is_default: true,
      is_builtin: false,
      created_at: "",
      updated_at: "",
    };
    assert.equal(relativeReferenceReservedHeight(themeBase, 500), 0);

    const reserved = relativeReferenceReservedHeight(
      { ...themeBase, reference_follow_verse: true, font_size: 80, font_scale: 1, reference_verse_ratio: 0.4 },
      500,
    );
    assert.ok(reserved > 0 && reserved <= 500 * 0.45);
  });
});

describe("readabilityWarnings with relative reference", () => {
  test("ignores reference box overlap warning when reference_follow_verse is enabled", () => {
    const overlapping = {
      ...STARTER_THEME,
      verse_box_x: 10,
      verse_box_y: 20,
      verse_box_width: 80,
      verse_box_height: 50,
      reference_box_x: 10,
      reference_box_y: 30,
      reference_box_width: 80,
      reference_box_height: 10,
    };
    assert.ok(readabilityWarnings({ ...overlapping, reference_follow_verse: false }).some((w) => w.includes("overlap")));
    assert.ok(!readabilityWarnings({ ...overlapping, reference_follow_verse: true }).some((w) => w.includes("overlap")));
  });
});
