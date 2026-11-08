import test from "node:test";
import assert from "node:assert/strict";
import { createDocCache } from "./docCache.ts";

function counting() {
  const calls: number[] = [];
  return { calls, fetch: (id: number) => { calls.push(id); return Promise.resolve({ id }); } };
}

test("the same slide and version is fetched once", async () => {
  const { calls, fetch } = counting();
  const cache = createDocCache(fetch);
  const a = await cache.get(1, 100);
  const b = await cache.get(1, 100);
  assert.equal(a, b);
  assert.deepEqual(calls, [1]);
});

test("a saved slide (new version) is fetched again", async () => {
  const { calls, fetch } = counting();
  const cache = createDocCache(fetch);
  await cache.get(1, 100);
  await cache.get(1, 200);
  assert.deepEqual(calls, [1, 1]);
});

test("a failed fetch is not remembered", async () => {
  let n = 0;
  const cache = createDocCache<string>(() => (++n === 1 ? Promise.reject(new Error("no")) : Promise.resolve("ok")));
  await assert.rejects(cache.get(1, 1));
  await Promise.resolve(); // let the cleanup run
  assert.equal(await cache.get(1, 1), "ok");
});

test("the least recently used entry is dropped past the limit", async () => {
  const { calls, fetch } = counting();
  const cache = createDocCache(fetch, 2);
  await cache.get(1, 1);
  await cache.get(2, 1);
  await cache.get(1, 1); // 1 is now the most recent
  await cache.get(3, 1); // drops 2
  await cache.get(1, 1);
  await cache.get(2, 1);
  assert.deepEqual(calls, [1, 2, 3, 2]);
});
