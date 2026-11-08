import assert from "node:assert/strict";
import { test } from "node:test";
import { createVerseParts, verseKey } from "./versePartsCore.ts";

function setup() {
  const port = { part: 0 };
  const parts = createVerseParts({
    getPart: () => port.part,
    setPart: (p) => {
      port.part = p;
    },
  });
  return { port, parts };
}

const JOHN = verseKey({ book: "John", chapter: 3, verse: 16 });
const NEXT = verseKey({ book: "John", chapter: 3, verse: 17 });

test("steps through the parts of the reported verse, then lets the plan move on", () => {
  const { port, parts } = setup();
  parts.report(JOHN, 3);
  assert.equal(parts.step(JOHN, 1), true);
  assert.equal(port.part, 1);
  assert.equal(parts.step(JOHN, 1), true);
  assert.equal(port.part, 2);
  assert.equal(parts.step(JOHN, 1), false, "past the last part the plan moves on");
  assert.equal(port.part, 2);
  assert.equal(parts.step(JOHN, -1), true);
  assert.equal(port.part, 1);
});

test("going back past the first part lets the plan move on", () => {
  const { port, parts } = setup();
  parts.report(JOHN, 2);
  assert.equal(parts.step(JOHN, -1), false);
  assert.equal(port.part, 0);
});

test("a verse that is not split, or a count for another verse, is not stepped", () => {
  const { port, parts } = setup();
  parts.report(JOHN, 1);
  assert.equal(parts.step(JOHN, 1), false);
  parts.report(NEXT, 4);
  assert.equal(parts.step(JOHN, 1), false, "the count belongs to a different verse");
  assert.equal(port.part, 0);
});

test("nothing is stepped before the Live Show has reported", () => {
  const { parts } = setup();
  assert.equal(parts.step(JOHN, 1), false);
});

test("stepping Back into a verse opens it on its last part once the count arrives", () => {
  const { port, parts } = setup();
  parts.report(NEXT, 1);
  parts.requestLast(JOHN); // the text has not loaded yet
  assert.equal(port.part, 0);
  parts.report(JOHN, 1); // the new verse shows, still loading
  assert.equal(port.part, 0);
  parts.report(JOHN, 3); // the text loads and splits into three parts
  assert.equal(port.part, 2);
  parts.report(JOHN, 3);
  assert.equal(port.part, 2, "the request is used once");
});

test("a Back request is used at once when the count is already known", () => {
  const { port, parts } = setup();
  parts.report(JOHN, 4);
  parts.requestLast(JOHN);
  assert.equal(port.part, 3);
});

test("a Back request is dropped when the plan moves elsewhere or forgets it", () => {
  const a = setup();
  a.parts.requestLast(JOHN);
  a.parts.report(NEXT, 3); // some other verse came up
  a.parts.report(JOHN, 3); // later, the user lands on John by hand
  assert.equal(a.port.part, 0, "a stale request must not move the part");

  const b = setup();
  b.parts.requestLast(JOHN);
  b.parts.forgetRequest();
  b.parts.report(JOHN, 3);
  assert.equal(b.port.part, 0);
});
