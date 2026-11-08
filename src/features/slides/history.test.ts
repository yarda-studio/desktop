import test from "node:test";
import assert from "node:assert/strict";
import { COALESCE_MS, HISTORY_LIMIT, emptyHistory, mapHistory, record, redo, undo } from "./history.ts";

test("undo and redo walk back and forward through edits", () => {
  let h = emptyHistory<number>();
  h = record(h, 1, null, 0); // 1 -> 2
  h = record(h, 2, null, 10); // 2 -> 3
  const back = undo(h, 3)!;
  assert.equal(back.state, 2);
  const back2 = undo(back.history, 2)!;
  assert.equal(back2.state, 1);
  assert.equal(undo(back2.history, 1), null, "nothing before the first state");
  const fwd = redo(back2.history, 1)!;
  assert.equal(fwd.state, 2);
  assert.equal(redo(fwd.history, 2)!.state, 3);
});

test("a new edit clears the redo list", () => {
  let h = record(emptyHistory<number>(), 1, null, 0);
  h = undo(h, 2)!.history;
  assert.equal(h.future.length, 1);
  h = record(h, 1, null, 5);
  assert.equal(h.future.length, 0);
  assert.equal(redo(h, 9), null);
});

test("repeated edits with one key within the window are one step", () => {
  let h = emptyHistory<number>();
  h = record(h, 0, "move:a", 0);
  h = record(h, 1, "move:a", 100);
  h = record(h, 2, "move:a", 200);
  assert.deepEqual(h.past, [0], "only the state before the first edit is kept");
  assert.equal(undo(h, 3)!.state, 0);
});

test("a different key, a pause, or no key starts a new step", () => {
  let h = record(emptyHistory<number>(), 0, "move:a", 0);
  h = record(h, 1, "move:b", 10);
  h = record(h, 2, "move:b", 10 + COALESCE_MS + 1);
  h = record(h, 3, null, 20 + COALESCE_MS);
  h = record(h, 4, null, 21 + COALESCE_MS);
  assert.deepEqual(h.past, [0, 1, 2, 3, 4]);
});

test("a keyed edit right after an undo is a new step, not part of the old one", () => {
  let h = record(emptyHistory<number>(), 0, "type", 0);
  h = undo(h, 1)!.history;
  h = record(h, 0, "type", 50);
  assert.deepEqual(h.past, [0]);
  assert.equal(undo(h, 1)!.state, 0);
});

test("only the most recent snapshots are kept", () => {
  let h = emptyHistory<number>();
  for (let i = 0; i < HISTORY_LIMIT + 20; i++) h = record(h, i, null, i);
  assert.equal(h.past.length, HISTORY_LIMIT);
  assert.equal(h.past[0], 20);
});

test("mapHistory changes every snapshot", () => {
  let h = record(emptyHistory<number>(), 1, null, 0);
  h = record(h, 2, null, 1);
  h = undo(h, 3)!.history;
  const m = mapHistory(h, (n) => n * 10);
  assert.deepEqual(m.past, [10]);
  assert.deepEqual(m.future, [30]);
});
