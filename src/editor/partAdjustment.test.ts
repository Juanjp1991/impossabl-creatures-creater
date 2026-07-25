import assert from "node:assert/strict";
import test from "node:test";
import type { PartAdjustment } from "../types";
import {
  adjustmentToTransform,
  rectToStageBounds,
  splitPartTransform,
  transformToAdjustment,
} from "./partAdjustment";
import { toSvgTransform, type PartTransform } from "./transform";

const JOINT = { x: 200, y: 150 };
const BASE: PartAdjustment = { scale: 1, offsetX: 0, offsetY: 0 };

test("a part transform pivots about its joint, not its bounding box", () => {
  const transform = adjustmentToTransform({ ...BASE, rotation: 30 }, JOINT);
  assert.equal(transform.pivotX, 200);
  assert.equal(transform.pivotY, 150);
  assert.equal(transform.rotate, 30);
});

test("an adjustment survives a round trip through the transform form", () => {
  const adjustment: PartAdjustment = { scale: 1.5, offsetX: 12, offsetY: -8, rotation: 42 };
  const back = transformToAdjustment(adjustmentToTransform(adjustment, JOINT), adjustment);
  assert.deepEqual(back, adjustment);
});

test("equal axes collapse onto the uniform scale the layout maths reads", () => {
  const transform: PartTransform = {
    translateX: 0, translateY: 0, rotate: 0, scale: 1, scaleX: 1.75, scaleY: 1.75,
  };
  const next = transformToAdjustment(transform, BASE);
  assert.equal(next.scale, 1.75);
  assert.ok(!("scaleX" in next), "per-axis override should be dropped");
  assert.ok(!("scaleY" in next), "per-axis override should be dropped");
});

test("unequal axes are kept per-axis and leave the uniform scale alone", () => {
  const transform: PartTransform = {
    translateX: 0, translateY: 0, rotate: 0, scale: 1, scaleX: 2, scaleY: 0.5,
  };
  const next = transformToAdjustment(transform, { ...BASE, scale: 1.2 });
  assert.equal(next.scaleX, 2);
  assert.equal(next.scaleY, 0.5);
  // Connection targets and the ground shadow read `scale`; a stretch must not move them.
  assert.equal(next.scale, 1.2);
});

test("clearing a flip removes the key instead of storing false", () => {
  const flipped = transformToAdjustment(
    { translateX: 0, translateY: 0, rotate: 0, scale: 1, flipX: true },
    BASE,
  );
  assert.equal(flipped.flipX, true);
  const cleared = transformToAdjustment(
    { translateX: 0, translateY: 0, rotate: 0, scale: 1 },
    flipped,
  );
  assert.ok(!("flipX" in cleared));
});

test("placement carries translate and rotate; sizing carries scale and flip", () => {
  const { placement, sizing } = splitPartTransform(
    { scale: 2, offsetX: 10, offsetY: 5, rotation: 90, flipX: true },
    JOINT,
  );
  assert.equal(placement.translateX, 210);
  assert.equal(placement.translateY, 155);
  assert.equal(placement.rotate, 90);
  assert.equal(placement.scale, 1, "scale must stay out of placement");
  assert.equal(sizing.translateX, 0);
  assert.equal(sizing.rotate, 0, "rotation must stay out of sizing");
  assert.equal(sizing.flipX, true);
});

test("an untouched part still serialises to a bare translate, as it did before rotation existed", () => {
  const { placement, sizing } = splitPartTransform(BASE, JOINT);
  assert.equal(toSvgTransform(placement), "translate(200 150)");
  assert.equal(toSvgTransform(sizing), "");
});

test("screen rects convert to stage coordinates regardless of corner order", () => {
  // A stage scaled 2x and offset by (100, 50) in screen space.
  const toStage = (x: number, y: number) => ({ x: (x - 100) / 2, y: (y - 50) / 2 });
  const bounds = rectToStageBounds({ left: 100, top: 50, width: 200, height: 100 }, toStage);
  assert.deepEqual(bounds, { x: 0, y: 0, width: 100, height: 50 });
});

test("a degenerate rect still yields a grabbable box", () => {
  const bounds = rectToStageBounds(
    { left: 0, top: 0, width: 0, height: 0 },
    (x, y) => ({ x, y }),
  );
  assert.equal(bounds.width, 1);
  assert.equal(bounds.height, 1);
});
