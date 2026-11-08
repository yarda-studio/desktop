import test from "node:test";
import assert from "node:assert/strict";
import { backupFileName, formatSize, importedExtras } from "./transferLogic.ts";

test("the suggested file name carries the date", () => {
  assert.equal(backupFileName(new Date(2026, 10, 8)), "yarda-backup-2026-11-08.zip");
  assert.equal(backupFileName(new Date(2027, 0, 3)), "yarda-backup-2027-01-03.zip");
});

test("sizes read naturally", () => {
  assert.equal(formatSize(10), "1 KB");
  assert.equal(formatSize(340 * 1024), "340 KB");
  assert.equal(formatSize(12.5 * 1024 * 1024), "12.5 MB");
  assert.equal(formatSize(1.2 * 1024 * 1024 * 1024), "1.2 GB");
});

test("the extras sentence names only what came back", () => {
  assert.equal(importedExtras(0, 0), "");
  assert.equal(importedExtras(1, 0), "1 Bible module");
  assert.equal(importedExtras(4, 1), "4 Bible modules and 1 theme video");
  assert.equal(importedExtras(0, 2), "2 theme videos");
});
