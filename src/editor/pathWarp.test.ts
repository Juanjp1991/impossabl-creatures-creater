import assert from "node:assert/strict";
import test from "node:test";
import {
  bendPathData,
  bendPoint,
  parsePathData,
  serializePathData,
  spineDisplacement,
  spineFalloff,
  evaluateSpine,
  bumpPoints,
  spinePointsOf,
  hasBend,
  type Bounds,
} from "./pathWarp";

const BOUNDS: Bounds = { x: 0, y: 0, width: 300, height: 220 };
const arch = { amount: 40 };

test("relative commands are converted to absolute", () => {
  assert.deepEqual(parsePathData("m10 10 l5 5"), [
    { code: "M", values: [10, 10] },
    { code: "L", values: [15, 15] },
  ]);
});

test("H and V become L so a bent point cannot snap back to a stale coordinate", () => {
  assert.deepEqual(parsePathData("M0 0 H10 V20"), [
    { code: "M", values: [0, 0] },
    { code: "L", values: [10, 0] },
    { code: "L", values: [10, 20] },
  ]);
});

test("an omitted command repeats the previous one, and a repeated M continues as L", () => {
  assert.deepEqual(parsePathData("M0 0 10 10 20 20"), [
    { code: "M", values: [0, 0] },
    { code: "L", values: [10, 10] },
    { code: "L", values: [20, 20] },
  ]);
});

test("Z returns the cursor to the subpath start", () => {
  const commands = parsePathData("M10 10 L20 20 Z l5 5");
  assert.deepEqual(commands.at(-1), { code: "L", values: [15, 15] });
});

test("a path round-trips through parse and serialize", () => {
  assert.equal(serializePathData(parsePathData("M0 0 C10 10 20 20 30 30")), "M0 0 C10 10 20 20 30 30");
});

test("bending never changes the command count — the element budget cannot regress", () => {
  const d = "M10 200 C60 40 240 40 290 200 L290 210 Z";
  const before = parsePathData(d);
  const after = parsePathData(bendPathData(d, BOUNDS, { amount: 55, spread: 1 }));
  assert.equal(after.length, before.length);
  assert.deepEqual(after.map((c) => c.code), before.map((c) => c.code));
});

test("a zero-amount bend leaves the path alone", () => {
  const d = "M0 0 L10 10";
  assert.equal(bendPathData(d, BOUNDS, { amount: 0 }), serializePathData(parsePathData(d)));
});

test("the peak sits at the centre of the span and vanishes at both ends", () => {
  assert.equal(spineFalloff(0.5, 0.5, 1), 1);
  assert.ok(spineFalloff(0, 0.5, 1) < 1e-9);
  assert.ok(spineFalloff(1, 0.5, 1) < 1e-9);
});

test("a narrow spread leaves the rest of the back untouched — the localised hump", () => {
  // Peak at 0.5 with a 0.3-wide span: 0.2 and 0.8 are outside it entirely.
  assert.equal(spineFalloff(0.2, 0.5, 0.3), 0);
  assert.equal(spineFalloff(0.8, 0.5, 0.3), 0);
  assert.equal(spineFalloff(0.5, 0.5, 0.3), 1);
});

test("a positive amount raises the back on screen, and the feet stay planted", () => {
  const top = spineDisplacement({ x: 150, y: 0 }, BOUNDS, arch);
  const bottom = spineDisplacement({ x: 150, y: 220 }, BOUNDS, arch);
  // SVG y grows downward, so lifting the spine means a negative shift.
  assert.equal(Math.round(top), -40, "the back takes the full displacement, upward");
  assert.equal(bottom, 0, "the ground line must not move, or the legs detach");
});

test("a negative amount digs a saddle instead of raising a hump", () => {
  assert.ok(spineDisplacement({ x: 150, y: 0 }, BOUNDS, { amount: -40 }) > 0, "a saddle sinks");
});

test("the bend can run vertically for an upright part", () => {
  const moved = bendPoint({ x: 0, y: 110 }, BOUNDS, { amount: 30, axis: "y" });
  assert.equal(moved.y, 110, "the spine axis itself is not displaced");
  assert.ok(moved.x < 0, "displacement is across the spine, toward the top-left origin");
});

test("arc radii and flags survive; only the endpoint moves", () => {
  const bent = parsePathData(bendPathData("M0 110 A25 25 0 0 1 150 10", BOUNDS, { amount: 30 }));
  const arc = bent.find((c) => c.code === "A")!;
  assert.deepEqual(arc.values.slice(0, 5), [25, 25, 0, 0, 1], "radii, rotation and flags are untouched");
  assert.notEqual(arc.values[6], 10, "the endpoint is displaced");
});

test("degenerate bounds are a no-op rather than a divide-by-zero", () => {
  const flat: Bounds = { x: 0, y: 0, width: 0, height: 0 };
  assert.equal(spineDisplacement({ x: 5, y: 5 }, flat, arch), 0);
});

test("malformed path data degrades instead of throwing", () => {
  assert.equal(bendPathData("", BOUNDS, arch), "");
  assert.doesNotThrow(() => bendPathData("M0", BOUNDS, arch));
  assert.doesNotThrow(() => bendPathData("banana", BOUNDS, arch));
});

test("a single control point holds its offset across the whole spine", () => {
  assert.equal(evaluateSpine([{ t: 0.5, offset: 20 }], 0), 20);
  assert.equal(evaluateSpine([{ t: 0.5, offset: 20 }], 1), 20);
});

test("the curve passes exactly through every control point", () => {
  const points = [{ t: 0, offset: 0 }, { t: 0.3, offset: 40 }, { t: 0.7, offset: -25 }, { t: 1, offset: 0 }];
  for (const point of points) {
    assert.ok(Math.abs(evaluateSpine(points, point.t) - point.offset) < 1e-9, `t=${point.t}`);
  }
});

test("interpolation never overshoots the handles it runs between", () => {
  // Catmull-Rom would bulge past 40 here and feel like it is fighting the drag.
  const points = [{ t: 0, offset: 0 }, { t: 0.5, offset: 40 }, { t: 1, offset: 0 }];
  for (let t = 0; t <= 1; t += 0.01) {
    const value = evaluateSpine(points, t);
    assert.ok(value >= -1e-9 && value <= 40 + 1e-9, `overshoot at t=${t.toFixed(2)}: ${value}`);
  }
});

test("a monotone run stays monotone — no ripples between points", () => {
  const points = [{ t: 0, offset: 0 }, { t: 0.5, offset: 20 }, { t: 1, offset: 40 }];
  let previous = -Infinity;
  for (let t = 0; t <= 1; t += 0.02) {
    const value = evaluateSpine(points, t);
    assert.ok(value >= previous - 1e-9, `dipped at t=${t.toFixed(2)}`);
    previous = value;
  }
});

test("offsets outside the control range are held, keeping a local hump local", () => {
  const points = [{ t: 0.4, offset: 0 }, { t: 0.5, offset: 30 }, { t: 0.6, offset: 0 }];
  assert.equal(evaluateSpine(points, 0), 0);
  assert.equal(evaluateSpine(points, 1), 0);
});

test("two humps are expressible, which a single bump never was", () => {
  const camel = [{ t: 0, offset: 0 }, { t: 0.3, offset: 30 }, { t: 0.5, offset: 5 }, { t: 0.7, offset: 30 }, { t: 1, offset: 0 }];
  assert.ok(evaluateSpine(camel, 0.3) > evaluateSpine(camel, 0.5));
  assert.ok(evaluateSpine(camel, 0.7) > evaluateSpine(camel, 0.5));
});

test("control points are order-independent", () => {
  const shuffled = [{ t: 1, offset: 0 }, { t: 0.5, offset: 40 }, { t: 0, offset: 0 }];
  assert.ok(Math.abs(evaluateSpine(shuffled, 0.5) - 40) < 1e-9);
});

test("the single-bump form and explicit points describe the same shape", () => {
  const viaBump = spinePointsOf({ amount: 40, center: 0.5, spread: 1 });
  assert.deepEqual(viaBump, bumpPoints(40, 0.5, 1));
  assert.equal(spinePointsOf({ points: [{ t: 0.2, offset: 5 }] }).length, 1);
});

test("hasBend recognises a flat spine in either form", () => {
  assert.equal(hasBend({ amount: 0 }), false);
  assert.equal(hasBend({ points: [{ t: 0, offset: 0 }, { t: 1, offset: 0 }] }), false);
  assert.equal(hasBend({ points: [{ t: 0.5, offset: 12 }] }), true);
  assert.equal(hasBend({ amount: -3 }), true);
});

test("multi-point bending still leaves the command count untouched", () => {
  const d = "M10 200 C60 40 240 40 290 200 L290 210 Z";
  const points = [{ t: 0, offset: 0 }, { t: 0.35, offset: 40 }, { t: 0.7, offset: -20 }, { t: 1, offset: 0 }];
  const before = parsePathData(d);
  const after = parsePathData(bendPathData(d, BOUNDS, { points }));
  assert.deepEqual(after.map((c) => c.code), before.map((c) => c.code));
});
