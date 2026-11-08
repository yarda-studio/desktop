import test from "node:test";
import assert from "node:assert/strict";
import { pictureSource } from "./pictureSource.ts";

test("a data URL is shown as it is", () => {
  const url = "data:image/jpeg;base64,/9j/4AAQ";
  assert.deepEqual(pictureSource(url), { kind: "inline", url });
});

test("a saved picture is a file name in the media folder", () => {
  assert.deepEqual(pictureSource("pic-1730000000000-0.jpg"), { kind: "file", name: "pic-1730000000000-0.jpg" });
});
