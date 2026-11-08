import test from "node:test";
import assert from "node:assert/strict";
import { summarise, type NdiStatus } from "./ndiLogic.ts";

const base: NdiStatus = { supported: true, available: true, running: false, name: "", connections: 0, frames: 0, error: null };

test("a platform that can't capture says so before anything else", () => {
  const s = summarise({ ...base, supported: false, available: false });
  assert.equal(s.phase, "unsupported");
  assert.match(s.line, /Windows is next/);
});

test("a missing NDI install points at ndi.video", () => {
  const s = summarise({ ...base, available: false });
  assert.equal(s.phase, "missing");
  assert.match(s.line, /ndi\.video/);
  assert.equal(s.problem, false);
});

test("off is a state, not an error", () => {
  const s = summarise(base);
  assert.equal(s.phase, "off");
  assert.equal(s.problem, false);
});

test("running says what is being sent and who is watching", () => {
  assert.match(summarise({ ...base, running: true, name: "Sanctuary" }).line, /Sending "Sanctuary"\. Nothing is receiving it yet\./);
  assert.match(summarise({ ...base, running: true, name: "Sanctuary", connections: 1 }).line, /1 program is receiving it/);
  assert.match(summarise({ ...base, running: true, name: "Sanctuary", connections: 3 }).line, /3 programs are receiving it/);
});

test("a frame problem is shown as a problem, with its reason", () => {
  const s = summarise({ ...base, running: true, name: "Yarda", error: "The presentation window isn't open." });
  assert.equal(s.problem, true);
  assert.equal(s.line, "The presentation window isn't open.");
});
