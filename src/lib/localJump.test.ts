import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { parseLocalJump } from "./localJump.ts";

describe("parseLocalJump", () => {
  test("v4 is verse 4 of the current chapter, as before", () => {
    assert.deepEqual(parseLocalJump("v4"), { chapter: null, verse: 4 });
    assert.deepEqual(parseLocalJump("V10"), { chapter: null, verse: 10 });
    assert.deepEqual(parseLocalJump("  v7  "), { chapter: null, verse: 7 });
  });

  test("c1v3 and c1:v3 are chapter 1, verse 3", () => {
    assert.deepEqual(parseLocalJump("c1v3"), { chapter: 1, verse: 3 });
    assert.deepEqual(parseLocalJump("c1:v3"), { chapter: 1, verse: 3 });
    assert.deepEqual(parseLocalJump("C12:V34"), { chapter: 12, verse: 34 });
  });

  test("a space, dot or comma between the two also works", () => {
    assert.deepEqual(parseLocalJump("c2 v5"), { chapter: 2, verse: 5 });
    assert.deepEqual(parseLocalJump("c2.v5"), { chapter: 2, verse: 5 });
    assert.deepEqual(parseLocalJump("c2, v5"), { chapter: 2, verse: 5 });
    assert.deepEqual(parseLocalJump("c2 : v5"), { chapter: 2, verse: 5 });
  });

  test("a chapter on its own goes to its first verse", () => {
    assert.deepEqual(parseLocalJump("c3"), { chapter: 3, verse: 1 });
  });

  test("zero is not a chapter or a verse", () => {
    assert.equal(parseLocalJump("v0"), null);
    assert.equal(parseLocalJump("c0v1"), null);
    assert.equal(parseLocalJump("c1v0"), null);
    assert.equal(parseLocalJump("c0"), null);
  });

  test("anything half-typed or different is not a jump", () => {
    for (const text of ["", "v", "c", "c1:", "c1:v", "cv3", "c1v3x", "c1v3 extra", "v4v5", "jn 3:16", "john", "1c1v1", "c-1v2"]) {
      assert.equal(parseLocalJump(text), null, `"${text}" should not be a jump`);
    }
  });
});
