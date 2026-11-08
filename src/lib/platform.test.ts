import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { forPlatform } from "./platform.ts";

describe("forPlatform", () => {
  test("a Mac sees Cmd and Option", () => {
    assert.equal(forPlatform("Ctrl+K", true), "Cmd+K");
    assert.equal(forPlatform("Ctrl+Shift+K", true), "Cmd+Shift+K");
    assert.equal(forPlatform("Ctrl+Alt+Q", true), "Cmd+Option+Q");
    assert.equal(forPlatform("Ctrl", true), "Cmd");
  });

  test("Windows and Linux are left alone", () => {
    assert.equal(forPlatform("Ctrl+K", false), "Ctrl+K");
    assert.equal(forPlatform("Ctrl+Alt+Q", false), "Ctrl+Alt+Q");
  });

  test("works inside a sentence and on every occurrence", () => {
    assert.equal(
      forPlatform("Previous chapter (Ctrl+P) or Next (Ctrl+N)", true),
      "Previous chapter (Cmd+P) or Next (Cmd+N)",
    );
  });

  test("only whole words are rewritten", () => {
    assert.equal(forPlatform("Control the Altar", true), "Control the Altar");
    assert.equal(forPlatform("Ctrl+1–4 to switch", true), "Cmd+1–4 to switch");
  });
});
