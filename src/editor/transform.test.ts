import assert from "node:assert/strict";
import test from "node:test";
import {
  applyGizmoDelta,
  effectiveScale,
  flipTransform,
  identityTransform,
  isIdentityTransform,
  oppositeAnchor,
  toSvgTransform,
  type GizmoBounds,
  type PartTransform,
} from "./transform";

const BOUNDS: GizmoBounds = { x: 10, y: 20, width: 100, height: 50 };
const PIVOT = { x: 0, y: 0 };
const NO_DELTA = { dx: 0, dy: 0, angleDelta: 0 };

const free = (dx: number, dy: number, angleDelta = 0) => ({ dx, dy, angleDelta });

test("move accumulates pointer travel onto the starting translation", () => {
  const base: PartTransform = { ...identityTransform(), translateX: 5, translateY: -3 };
  const next = applyGizmoDelta(base, "move", free(12, 8), BOUNDS, { proportional: false, pivot: PIVOT });
  assert.equal(next.translateX, 17);
  assert.equal(next.translateY, 5);
});

test("rotate converts the pointer sweep to degrees and records the pivot", () => {
  const base: PartTransform = { ...identityTransform(), rotate: 30 };
  const next = applyGizmoDelta(base, "rotate", free(0, 0, Math.PI / 2), BOUNDS, {
    proportional: false,
    pivot: { x: 7, y: 9 },
  });
  assert.equal(next.rotate, 120);
  assert.equal(next.pivotX, 7);
  assert.equal(next.pivotY, 9);
});

test("east handle scales x by pointer travel over width, leaving y alone", () => {
  const next = applyGizmoDelta(identityTransform(), "scale-e", free(50, 0), BOUNDS, {
    proportional: false,
    pivot: PIVOT,
  });
  assert.equal(next.scaleX, 1.5);
  assert.equal(next.scaleY, 1);
});

test("west handle inverts the x direction so dragging outward still grows the shape", () => {
  const next = applyGizmoDelta(identityTransform(), "scale-w", free(-50, 0), BOUNDS, {
    proportional: false,
    pivot: PIVOT,
  });
  assert.equal(next.scaleX, 1.5);
});

test("proportional corner drag averages both axes into one factor", () => {
  // +50/100 = 1.5 on x, +25/50 = 1.5 on y -> already equal; use an uneven drag instead.
  const next = applyGizmoDelta(identityTransform(), "scale-se", free(50, 0), BOUNDS, {
    proportional: true,
    pivot: PIVOT,
  });
  // x factor 1.5, y factor 1.0 -> both become 1.25.
  assert.equal(next.scaleX, 1.25);
  assert.equal(next.scaleY, 1.25);
});

test("proportional side drag averages only the axis the handle drives", () => {
  const next = applyGizmoDelta(identityTransform(), "scale-e", free(50, 999), BOUNDS, {
    proportional: true,
    pivot: PIVOT,
  });
  assert.equal(next.scaleX, 1.5);
  assert.equal(next.scaleY, 1.5);
});

test("scaling is clamped so a shape cannot be collapsed past recovery", () => {
  const next = applyGizmoDelta(identityTransform(), "scale-e", free(-1000, 0), BOUNDS, {
    proportional: false,
    pivot: PIVOT,
  });
  assert.equal(next.scaleX, 0.1);
});

test("scale compounds onto the scale the drag started from", () => {
  const base: PartTransform = { ...identityTransform(), scale: 1, scaleX: 2, scaleY: 2 };
  const next = applyGizmoDelta(base, "scale-e", free(50, 0), BOUNDS, {
    proportional: false,
    pivot: PIVOT,
  });
  assert.equal(next.scaleX, 3);
});

test("a zero delta on any action leaves the shape where it was", () => {
  const base: PartTransform = { ...identityTransform(), translateX: 4, rotate: 12 };
  for (const action of ["move", "rotate", "scale-e", "scale-nw"] as const) {
    const next = applyGizmoDelta(base, action, NO_DELTA, BOUNDS, { proportional: false, pivot: PIVOT });
    assert.equal(next.translateX, 4, action);
    assert.equal(next.rotate, 12, action);
    assert.equal(next.scaleX ?? next.scale, 1, action);
  }
});

test("the anchor is the corner opposite the dragged handle", () => {
  assert.deepEqual(oppositeAnchor("scale-nw", BOUNDS), { x: 110, y: 70 });
  assert.deepEqual(oppositeAnchor("scale-se", BOUNDS), { x: 10, y: 20 });
  // A side handle pins the opposite edge but stays centred on the free axis.
  assert.deepEqual(oppositeAnchor("scale-e", BOUNDS), { x: 10, y: 45 });
});

test("flipping the same axis twice returns the original transform", () => {
  const base: PartTransform = { ...identityTransform(), scaleX: 1.4, rotate: 20 };
  assert.deepEqual(flipTransform(flipTransform(base, "x"), "x"), base);
  assert.deepEqual(flipTransform(flipTransform(base, "y"), "y"), base);
});

test("a flip reads as a negative scale factor, not a special case", () => {
  const flipped = flipTransform({ ...identityTransform(), scale: 2 }, "x");
  assert.deepEqual(effectiveScale(flipped), { x: -2, y: 2 });
});

test("flip axes are independent", () => {
  const both = flipTransform(flipTransform(identityTransform(), "x"), "y");
  assert.deepEqual(effectiveScale(both), { x: -1, y: -1 });
});

test("serialisation order is translate, then rotate, then scale about the pivot", () => {
  const transform: PartTransform = {
    translateX: 5,
    translateY: 6,
    rotate: 45,
    scale: 1,
    scaleX: 2,
    scaleY: 3,
    pivotX: 10,
    pivotY: 20,
  };
  assert.equal(
    toSvgTransform(transform),
    "translate(5 6) rotate(45 10 20) translate(10 20) scale(2 3) translate(-10 -20)",
  );
});

test("an untouched transform serialises to nothing rather than an identity matrix", () => {
  assert.equal(toSvgTransform(identityTransform()), "");
  assert.ok(isIdentityTransform(identityTransform()));
});

test("each component is omitted when it would be a no-op", () => {
  assert.equal(toSvgTransform({ ...identityTransform(), translateX: 3 }), "translate(3 0)");
  assert.equal(toSvgTransform({ ...identityTransform(), rotate: 90 }), "rotate(90 0 0)");
  assert.equal(
    toSvgTransform({ ...identityTransform(), scale: 2 }),
    "translate(0 0) scale(2 2) translate(0 0)",
  );
});

test("a flip survives serialisation as a negative scale", () => {
  const flipped = flipTransform({ ...identityTransform(), pivotX: 50, pivotY: 50 }, "x");
  assert.equal(toSvgTransform(flipped), "translate(50 50) scale(-1 1) translate(-50 -50)");
});

test("scaling is a distance ratio from the pivot, not a fraction of the shape", () => {
  // Handle starts 100 units right of the pivot; drag it to 200 -> exactly double.
  const next = applyGizmoDelta(identityTransform(), "scale-e",
    { dx: 100, dy: 0, angleDelta: 0, start: { x: 100, y: 0 }, current: { x: 200, y: 0 } },
    BOUNDS, { proportional: false, pivot: { x: 0, y: 0 } });
  assert.equal(next.scaleX, 2);
});

test("a small shape is no more sensitive than a large one — the reported bug", () => {
  // Same pointer travel, same pivot distance, wildly different shape sizes.
  const drag = { dx: 20, dy: 0, angleDelta: 0, start: { x: 100, y: 0 }, current: { x: 120, y: 0 } };
  const tiny = applyGizmoDelta(identityTransform(), "scale-e", drag,
    { x: 0, y: 0, width: 16, height: 16 }, { proportional: false, pivot: { x: 0, y: 0 } });
  const huge = applyGizmoDelta(identityTransform(), "scale-e", drag,
    { x: 0, y: 0, width: 300, height: 220 }, { proportional: false, pivot: { x: 0, y: 0 } });
  assert.equal(tiny.scaleX, huge.scaleX, "an ear and a torso must respond identically");
  assert.equal(tiny.scaleX, 1.2);
});

test("a runaway drag is capped instead of flinging the shape off-canvas", () => {
  const next = applyGizmoDelta(identityTransform(), "scale-e",
    { dx: 99999, dy: 0, angleDelta: 0, start: { x: 10, y: 0 }, current: { x: 99999, y: 0 } },
    BOUNDS, { proportional: false, pivot: { x: 0, y: 0 } });
  assert.equal(next.scaleX, 10);
});

test("dragging a handle onto the pivot collapses rather than inverting", () => {
  const next = applyGizmoDelta(identityTransform(), "scale-e",
    { dx: -150, dy: 0, angleDelta: 0, start: { x: 100, y: 0 }, current: { x: -50, y: 0 } },
    BOUNDS, { proportional: false, pivot: { x: 0, y: 0 } });
  assert.equal(next.scaleX, 0.1, "crossing the pivot must not silently mirror the shape");
});

test("a handle sitting on the pivot does not divide by zero", () => {
  const next = applyGizmoDelta(identityTransform(), "scale-e",
    { dx: 30, dy: 0, angleDelta: 0, start: { x: 1, y: 0 }, current: { x: 31, y: 0 } },
    BOUNDS, { proportional: false, pivot: { x: 0, y: 0 } });
  assert.equal(next.scaleX, 1, "too close to the pivot to derive a ratio");
});

test("the untouched axis is left alone by a side handle", () => {
  const next = applyGizmoDelta(identityTransform(), "scale-e",
    { dx: 50, dy: 80, angleDelta: 0, start: { x: 100, y: 100 }, current: { x: 150, y: 180 } },
    BOUNDS, { proportional: false, pivot: { x: 0, y: 0 } });
  assert.equal(next.scaleY, 1);
});
