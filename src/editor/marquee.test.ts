import assert from "node:assert/strict";
import test from "node:test";
import {
  applyMarquee,
  contains,
  idsInside,
  isMarqueeMeaningful,
  marqueeFromPoints,
  toggleSelection,
  unionBounds,
  type MarqueeCandidate,
} from "./marquee";

const box = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });
const MARQUEE = box(0, 0, 100, 100);

test("a box is normalised however the drag ran", () => {
  const downRight = marqueeFromPoints({ x: 10, y: 20 }, { x: 60, y: 90 });
  const upLeft = marqueeFromPoints({ x: 60, y: 90 }, { x: 10, y: 20 });
  assert.deepEqual(downRight, box(10, 20, 50, 70));
  assert.deepEqual(upLeft, downRight, "dragging up-left must select the same region");
});

test("only shapes wholly inside are caught, not ones merely grazed", () => {
  assert.equal(contains(MARQUEE, box(10, 10, 20, 20)), true, "fully inside");
  assert.equal(contains(MARQUEE, box(90, 90, 30, 30)), false, "spills out of the corner");
  assert.equal(contains(MARQUEE, box(-5, 10, 20, 20)), false, "starts outside");
  assert.equal(contains(MARQUEE, box(200, 200, 5, 5)), false, "nowhere near");
});

test("a shape flush with the edge counts as inside", () => {
  assert.equal(contains(MARQUEE, box(0, 0, 100, 100)), true);
});

test("a shape larger than the marquee is never selected", () => {
  // Boxing the ears must not pick up the torso underneath them.
  assert.equal(contains(MARQUEE, box(-10, -10, 200, 200)), false);
});

test("locked layers are skipped", () => {
  const candidates: MarqueeCandidate[] = [
    { id: "a", bounds: box(10, 10, 10, 10) },
    { id: "b", bounds: box(30, 30, 10, 10), locked: true },
  ];
  assert.deepEqual(idsInside(MARQUEE, candidates), ["a"]);
});

test("a marquee replaces the selection by default", () => {
  assert.deepEqual(applyMarquee(["old"], ["a", "b"], "replace"), ["a", "b"]);
});

test("holding shift subtracts, carving shapes out of a large selection", () => {
  assert.deepEqual(applyMarquee(["a", "b", "c"], ["b"], "subtract"), ["a", "c"]);
});

test("subtracting shapes that were never selected changes nothing", () => {
  assert.deepEqual(applyMarquee(["a"], ["x", "y"], "subtract"), ["a"]);
});

test("an empty marquee in replace mode clears the selection", () => {
  assert.deepEqual(applyMarquee(["a", "b"], [], "replace"), []);
});

test("shift-clicking a shape toggles just that one", () => {
  assert.deepEqual(toggleSelection(["a", "b"], "c"), ["a", "b", "c"]);
  assert.deepEqual(toggleSelection(["a", "b"], "a"), ["b"]);
});

test("a stray one-pixel drag is not treated as a marquee", () => {
  assert.equal(isMarqueeMeaningful(box(0, 0, 1, 1)), false);
  assert.equal(isMarqueeMeaningful(box(0, 0, 40, 0)), true, "a thin horizontal sweep still counts");
});

test("group bounds wrap every selected shape", () => {
  assert.deepEqual(
    unionBounds([box(10, 20, 10, 10), box(50, 5, 20, 40)]),
    box(10, 5, 60, 40),
  );
  assert.equal(unionBounds([]), null);
});

test("a single degenerate shape still yields a grabbable box", () => {
  const bounds = unionBounds([box(5, 5, 0, 0)])!;
  assert.equal(bounds.width, 1);
  assert.equal(bounds.height, 1);
});
