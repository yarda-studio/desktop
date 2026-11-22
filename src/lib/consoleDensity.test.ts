import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BALANCED_COMPACTNESS,
  COMPACTNESS_STORAGE_KEY,
  COMPACT_COMPACTNESS,
  DEFAULT_CONSOLE_COMPACTNESS,
  LEGACY_DENSITY_STORAGE_KEY,
  SPLIT_COLUMNS_STORAGE_KEY,
  clampCompactness,
  columnLayoutClasses,
  compactnessLabel,
  consoleCssVars,
  outputStripConfig,
  presetForCompactness,
  readConsoleCompactness,
  readSplitConsoleColumns,
  writeConsoleCompactness,
  writeSplitConsoleColumns,
} from "./consoleDensity.ts";

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
  };
}

describe("consoleDensity", () => {
  it("clamps compactness and resolves presets cleanly", () => {
    assert.equal(clampCompactness(-10), 0);
    assert.equal(clampCompactness(150), 100);
    assert.equal(clampCompactness(62.6), 63);
    assert.equal(clampCompactness(NaN), DEFAULT_CONSOLE_COMPACTNESS);

    assert.equal(presetForCompactness(BALANCED_COMPACTNESS), "balanced");
    assert.equal(presetForCompactness(COMPACT_COMPACTNESS), "compact");
    assert.equal(presetForCompactness(60), "custom");
    assert.equal(compactnessLabel(40), "Balanced (40%)");
    assert.equal(compactnessLabel(80), "Compact (80%)");
    assert.equal(compactnessLabel(65), "Custom (65%)");
  });

  it("reads, migrates legacy keys, and persists compactness and split-column preference", () => {
    assert.equal(readConsoleCompactness(memoryStorage()), DEFAULT_CONSOLE_COMPACTNESS);
    assert.equal(readConsoleCompactness(memoryStorage({ [LEGACY_DENSITY_STORAGE_KEY]: "comfortable" })), BALANCED_COMPACTNESS);
    assert.equal(readConsoleCompactness(memoryStorage({ [LEGACY_DENSITY_STORAGE_KEY]: "balanced" })), COMPACT_COMPACTNESS);
    assert.equal(readConsoleCompactness(memoryStorage({ [COMPACTNESS_STORAGE_KEY]: "72" })), 72);

    const store = memoryStorage();
    writeConsoleCompactness(85, store);
    assert.equal(readConsoleCompactness(store), 85);

    assert.equal(readSplitConsoleColumns(store), true);
    writeSplitConsoleColumns(false, store);
    assert.equal(readSplitConsoleColumns(store), false);
    assert.equal(store.getItem(SPLIT_COLUMNS_STORAGE_KEY), "false");
  });

  it("interpolates CSS variables and OutputStrip thresholds monotonically", () => {
    const roomy = consoleCssVars(0);
    const balanced = consoleCssVars(BALANCED_COMPACTNESS);
    const compact = consoleCssVars(COMPACT_COMPACTNESS);
    const maxCompact = consoleCssVars(100);

    assert.equal(balanced["--c-verse-text"], "14px");
    assert.equal(compact["--c-verse-text"], "13px");
    assert.ok(parseFloat(roomy["--c-shell-pad"]) > parseFloat(balanced["--c-shell-pad"]));
    assert.ok(parseFloat(balanced["--c-shell-pad"]) > parseFloat(compact["--c-shell-pad"]));
    assert.ok(parseFloat(compact["--c-shell-pad"]) > parseFloat(maxCompact["--c-shell-pad"]));

    const cfgBalanced = outputStripConfig(BALANCED_COMPACTNESS);
    const cfgCompact = outputStripConfig(COMPACT_COMPACTNESS);
    assert.equal(cfgBalanced.compactBelow, 540);
    assert.equal(cfgCompact.compactBelow, 500);
    assert.ok(cfgCompact.compactBelow > cfgCompact.minimalBelow);
  });

  it("returns 660px breakpoint classes when splitColumns is true and 880px when false", () => {
    const split = columnLayoutClasses("preview", true);
    assert.ok(split.tabsHide.includes("660px"));
    assert.ok(split.previewShow.includes("flex"));
    assert.ok(split.scheduleShow.includes("hidden min-[660px]:flex"));

    const tabbed = columnLayoutClasses("live", false);
    assert.ok(tabbed.tabsHide.includes("880px"));
    assert.ok(tabbed.liveShow.includes("flex"));
    assert.ok(tabbed.previewShow.includes("hidden min-[880px]:flex"));
  });
});
