import test from "node:test";
import assert from "node:assert/strict";

import { fitWithin, REFERENCE_MAX_EDGE } from "./downscale";

test("landscape images fit their width to the long edge", () => {
  assert.deepEqual(fitWithin(4000, 3000, 512), { width: 512, height: 384 });
});

test("portrait images fit their height to the long edge", () => {
  assert.deepEqual(fitWithin(3000, 4000, 512), { width: 384, height: 512 });
});

test("images already inside the budget are left alone", () => {
  assert.deepEqual(fitWithin(320, 200, 512), { width: 320, height: 200 });
  assert.deepEqual(fitWithin(512, 512, 512), { width: 512, height: 512 });
});

test("extreme aspect ratios keep at least one pixel on the short edge", () => {
  const fitted = fitWithin(8000, 3, 512);
  assert.equal(fitted.width, 512);
  assert.equal(fitted.height, 1);
});

test("degenerate dimensions collapse instead of producing NaN", () => {
  assert.deepEqual(fitWithin(0, 100), { width: 0, height: 0 });
  assert.deepEqual(fitWithin(Number.NaN, 100), { width: 0, height: 0 });
});

test("the default long edge is the documented 512px", () => {
  assert.equal(REFERENCE_MAX_EDGE, 512);
  assert.deepEqual(fitWithin(1024, 1024), { width: 512, height: 512 });
});
