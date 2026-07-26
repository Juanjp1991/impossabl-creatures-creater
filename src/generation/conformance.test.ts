import test from "node:test";
import assert from "node:assert/strict";

import { alignMaskToBounds, iou, maskBounds, scoreConformance, slotRasterSize, type Mask } from "./conformance";
import { pixelAt, pixelKey } from "./geometry";
import { channelMedian, isUsableSilhouette } from "../referenceImage/rasterize";

/** A filled rectangle in mask space, as the rasteriser would produce. */
function rect(x: number, y: number, width: number, height: number): Mask {
  const mask: Mask = new Set();
  for (let dy = 0; dy < height; dy += 1) for (let dx = 0; dx < width; dx += 1) mask.add(pixelKey(x + dx, y + dy));
  return mask;
}

test("iou is 1 for identical masks and 0 when nothing overlaps", () => {
  const a = rect(0, 0, 10, 10);
  assert.equal(iou(a, rect(0, 0, 10, 10)), 1);
  assert.equal(iou(a, rect(50, 50, 10, 10)), 0);
});

test("iou of half-overlapping equal squares is one third", () => {
  // 100px each, 50px shared: 50 / (100 + 100 - 50).
  assert.ok(Math.abs(iou(rect(0, 0, 10, 10), rect(5, 0, 10, 10)) - 1 / 3) < 1e-9);
});

test("an empty mask scores 0 rather than a misleading 1", () => {
  assert.equal(iou(new Set(), new Set()), 0);
  assert.equal(iou(rect(0, 0, 4, 4), new Set()), 0);
});

test("maskBounds reports the occupied box, or nothing when empty", () => {
  assert.deepEqual(maskBounds(rect(3, 7, 5, 2)), { x: 3, y: 7, width: 5, height: 2 });
  assert.equal(maskBounds(new Set()), undefined);
});

test("alignment makes the same shape at another size and place score 1", () => {
  const small = rect(2, 2, 5, 5);
  const target = { x: 40, y: 60, width: 20, height: 20 };
  const aligned = alignMaskToBounds(small, target);
  assert.deepEqual(maskBounds(aligned), target);
  assert.equal(iou(aligned, rect(40, 60, 20, 20)), 1);
});

test("alignment does not rescue a genuinely different shape", () => {
  // A wide bar aligned onto a square box still leaves most of the square empty.
  const bar = rect(0, 0, 20, 2);
  const aligned = alignMaskToBounds(bar, { x: 0, y: 0, width: 20, height: 20 });
  assert.ok(iou(aligned, rect(0, 0, 20, 20)) < 0.5);
});

test("scoreConformance rates a matching silhouette above a mismatched one", () => {
  const square = `<g id="head-root"><rect x="20" y="20" width="100" height="100" fill="primary"/></g>`;
  const sliver = `<g id="head-root"><rect x="20" y="20" width="100" height="8" fill="primary"/></g>`;
  const reference = rect(0, 0, 40, 40); // a square silhouette

  const good = scoreConformance(square, "head", reference);
  const bad = scoreConformance(sliver, "head", reference);
  assert.ok(good && bad);
  assert.ok(good!.score > 0.8, `expected a strong match, got ${good!.score}`);
  assert.ok(good!.score > bad!.score);
  assert.ok(good!.coverage > 0.8);
});

test("scoreConformance returns nothing for empty art or an empty reference", () => {
  assert.equal(scoreConformance("", "head", rect(0, 0, 10, 10)), undefined);
  assert.equal(scoreConformance(`<rect x="0" y="0" width="10" height="10" fill="primary"/>`, "head", new Set()), undefined);
});

test("each slot rasterises onto its own fixed local view", () => {
  assert.deepEqual(slotRasterSize("head"), { width: 160, height: 160 });
  assert.deepEqual(slotRasterSize("body"), { width: 300, height: 220 });
  assert.deepEqual(slotRasterSize("frontLegs"), { width: 260, height: 180 });
});

// The rasteriser itself needs a DOM, but its two decision rules are pure and are exactly
// where the first browser run went wrong: a mean-based background estimate turned a two-tone
// crop into a fully-covered mask, which then scored every candidate at 0%.
test("channelMedian picks the dominant border value, not the average of two", () => {
  // Nine background samples against four subject samples: the mean would land in between.
  assert.equal(channelMedian([20, 20, 20, 20, 20, 20, 20, 20, 20, 240, 240, 240, 240]), 20);
  assert.equal(channelMedian([]), 255);
});

test("a mask covering almost none or almost all of the frame is not a silhouette", () => {
  assert.equal(isUsableSilhouette(100, 160, 160), false);       // 0.4%: nothing found
  assert.equal(isUsableSilhouette(25_298, 160, 160), false);    // 98.8%: the whole frame
  assert.equal(isUsableSilhouette(9_000, 160, 160), true);      // 35%: a real figure
  assert.equal(isUsableSilhouette(10, 0, 0), false);
});

test("pixels painted left of the local view decode back to negative x", () => {
  // shapePixels paints a margin outside the view, so a part drawn hard against the left edge
  // produces negative x. Decoding those as x≈999 smeared the mask across a phantom
  // ~2000px-wide box and drove every conformance score to zero.
  const outside = pixelKey(-7, 12);
  assert.deepEqual(pixelAt(outside), { x: -7, y: 12 });
  assert.deepEqual(pixelAt(pixelKey(0, 0)), { x: 0, y: 0 });
  assert.deepEqual(pixelAt(pixelKey(299, 219)), { x: 299, y: 219 });
  assert.deepEqual(maskBounds(new Set([pixelKey(-7, 12), pixelKey(20, 12)])), { x: -7, y: 12, width: 28, height: 1 });
});
