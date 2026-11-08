import test from "node:test";
import assert from "node:assert/strict";
import { fitFloor, largestFit } from "./fitSize.ts";

test("text that already fits keeps its full size", () => {
  assert.equal(largestFit(() => true, 10, 100), 100);
});

test("the largest size that fits is found", () => {
  // Fits up to 37.3px.
  const size = largestFit((px) => px <= 37.3, 10, 100, 0.25);
  assert.ok(size <= 37.3 && size > 37.3 - 0.25, `got ${size}`);
});

test("text that cannot fit even at the floor gets the floor", () => {
  assert.equal(largestFit(() => false, 12, 60), 12);
});

test("the floor is a fifth of the size, but never above the size and never below 8px", () => {
  assert.equal(fitFloor(100), 20);
  assert.equal(fitFloor(20), 8);
  assert.equal(fitFloor(5), 5);
});

test("it measures a handful of times, not once per pixel", () => {
  let calls = 0;
  largestFit((px) => { calls += 1; return px <= 50; }, 10, 400);
  assert.ok(calls < 16, `measured ${calls} times`);
});
