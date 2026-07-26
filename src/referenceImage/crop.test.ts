import test from "node:test";
import assert from "node:assert/strict";

import { cropFromDrag, cropToPixels, describeCrop, isMeaningfulCrop, MIN_CROP_EDGE } from "./crop";

const box = { width: 400, height: 200 };

test("a drag normalizes to a fraction of the displayed image", () => {
  const crop = cropFromDrag({ x: 100, y: 50 }, { x: 300, y: 150 }, box);
  assert.deepEqual(crop, { x: 0.25, y: 0.25, width: 0.5, height: 0.5 });
});

test("dragging up and to the left produces the same box", () => {
  const forward = cropFromDrag({ x: 100, y: 50 }, { x: 300, y: 150 }, box);
  const backward = cropFromDrag({ x: 300, y: 150 }, { x: 100, y: 50 }, box);
  assert.deepEqual(backward, forward);
});

test("a drag that leaves the image is clamped to it", () => {
  const crop = cropFromDrag({ x: -80, y: -40 }, { x: 900, y: 700 }, box);
  assert.deepEqual(crop, { x: 0, y: 0, width: 1, height: 1 });
});

test("a click or a sliver is not a crop", () => {
  assert.equal(isMeaningfulCrop(cropFromDrag({ x: 100, y: 50 }, { x: 100, y: 50 }, box)), false);
  assert.equal(isMeaningfulCrop({ x: 0.1, y: 0.1, width: MIN_CROP_EDGE / 2, height: 0.5 }), false);
  assert.equal(isMeaningfulCrop({ x: 0.1, y: 0.1, width: 0.5, height: MIN_CROP_EDGE / 2 }), false);
  assert.equal(isMeaningfulCrop({ x: 0.1, y: 0.1, width: MIN_CROP_EDGE, height: MIN_CROP_EDGE }), true);
  assert.equal(isMeaningfulCrop(undefined), false);
});

test("a zero-sized display box cannot produce a crop", () => {
  assert.equal(isMeaningfulCrop(cropFromDrag({ x: 0, y: 0 }, { x: 10, y: 10 }, { width: 0, height: 0 })), false);
});

test("normalized crops map onto source pixels and stay inside the image", () => {
  assert.deepEqual(cropToPixels({ x: 0.25, y: 0.5, width: 0.5, height: 0.25 }, 512, 400), {
    x: 128,
    y: 200,
    width: 256,
    height: 100,
  });
  // A crop hard against the right edge must not ask for pixels past it.
  const edge = cropToPixels({ x: 0.9, y: 0.9, width: 0.5, height: 0.5 }, 100, 100);
  assert.ok(edge.x + edge.width <= 100);
  assert.ok(edge.y + edge.height <= 100);
});

test("a degenerate crop still yields at least one pixel", () => {
  const tiny = cropToPixels({ x: 1, y: 1, width: 0, height: 0 }, 64, 64);
  assert.ok(tiny.width >= 1 && tiny.height >= 1);
  assert.ok(tiny.x < 64 && tiny.y < 64);
});

test("crops describe themselves as a share of the reference", () => {
  assert.equal(describeCrop({ x: 0, y: 0, width: 0.42, height: 0.31 }), "42% × 31% of the reference");
});
