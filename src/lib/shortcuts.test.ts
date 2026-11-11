import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  useShortcutStore,
  registerShortcut,
  registerShortcuts,
  unregisterShortcut,
  getShortcutGroups,
  matchesShortcut,
  INITIAL_SHORTCUT_GROUPS,
} from "./shortcuts.ts";

describe("Shortcuts Registry", () => {
  beforeEach(() => {
    useShortcutStore.getState().resetToDefaults();
  });

  test("initializes with default shortcut groups", () => {
    const groups = getShortcutGroups();
    assert.ok(groups.length >= 8);
    const navGroup = groups.find((g) => g.label === "Navigation");
    assert.ok(navGroup);
    assert.ok(navGroup.shortcuts.some((s) => s.description === "Previous chapter"));
  });

  test("registerShortcut appends a new shortcut to an existing category immediately", () => {
    registerShortcut({
      id: "test-new-nav",
      category: "Navigation",
      keys: ["Ctrl", "Alt", "J"],
      description: "Jump to bookmark",
      note: "Experimental",
    });

    const groups = getShortcutGroups();
    const navGroup = groups.find((g) => g.label === "Navigation");
    assert.ok(navGroup);
    const added = navGroup.shortcuts.find((s) => s.id === "test-new-nav");
    assert.ok(added);
    assert.equal(added.description, "Jump to bookmark");
    assert.deepEqual(added.keys, ["Ctrl", "Alt", "J"]);
  });

  test("registerShortcut creates a new category group when a new category is used", () => {
    registerShortcut({
      id: "audio-mute",
      category: "Audio Mixer",
      keys: ["Ctrl", "M"],
      description: "Mute all audio outputs",
    });

    const groups = getShortcutGroups();
    const audioGroup = groups.find((g) => g.label === "Audio Mixer");
    assert.ok(audioGroup);
    assert.equal(audioGroup.icon, "keyboard");
    assert.equal(audioGroup.shortcuts.length, 1);
    assert.equal(audioGroup.shortcuts[0].description, "Mute all audio outputs");
  });

  test("registerShortcuts appends multiple shortcuts at once", () => {
    registerShortcuts([
      { category: "Theme Designer", keys: ["Ctrl", "C"], description: "Copy element style" },
      { category: "Theme Designer", keys: ["Ctrl", "V"], description: "Paste element style" },
    ]);

    const groups = getShortcutGroups();
    const themeGroup = groups.find((g) => g.label === "Theme Designer");
    assert.ok(themeGroup);
    assert.ok(themeGroup.shortcuts.some((s) => s.description === "Copy element style"));
    assert.ok(themeGroup.shortcuts.some((s) => s.description === "Paste element style"));
  });

  test("unregisterShortcut removes a shortcut by id or description", () => {
    registerShortcut({
      id: "temporary-shortcut",
      category: "Navigation",
      keys: ["Ctrl", "Alt", "X"],
      description: "Temporary action",
    });

    assert.ok(
      getShortcutGroups()
        .find((g) => g.label === "Navigation")
        ?.shortcuts.some((s) => s.id === "temporary-shortcut")
    );

    unregisterShortcut("temporary-shortcut");

    assert.ok(
      !getShortcutGroups()
        .find((g) => g.label === "Navigation")
        ?.shortcuts.some((s) => s.id === "temporary-shortcut")
    );
  });

  test("matchesShortcut matches modifier keys and main key", () => {
    const event = {
      ctrlKey: true,
      shiftKey: true,
      altKey: false,
      metaKey: false,
      key: "K",
      code: "KeyK",
      target: { tagName: "DIV", isContentEditable: false },
    } as unknown as KeyboardEvent;

    assert.equal(matchesShortcut(event, ["Ctrl", "Shift", "K"]), true);
    assert.equal(matchesShortcut(event, ["Ctrl", "K"]), false);
    assert.equal(matchesShortcut(event, ["Alt", "K"]), false);
  });

  test("matchesShortcut skips typing in input elements unless allowInInput is true", () => {
    const inputEvent = {
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      metaKey: false,
      key: "Enter",
      target: { tagName: "INPUT", isContentEditable: false },
    } as unknown as KeyboardEvent;

    assert.equal(matchesShortcut(inputEvent, ["Enter"]), false);
    assert.equal(matchesShortcut(inputEvent, ["Enter"], { allowInInput: true }), true);
  });

  test("scoped query and slash shortcuts are included in search category", () => {
    const searchGroup = INITIAL_SHORTCUT_GROUPS.find((g) => g.label === "Search & AI");
    assert.ok(searchGroup);
    assert.ok(searchGroup.shortcuts.some((s) => s.keys.includes("ot/")));
    assert.ok(searchGroup.shortcuts.some((s) => s.keys.includes("/")));
    assert.ok(searchGroup.shortcuts.some((s) => s.keys.includes("?")));
  });
});
