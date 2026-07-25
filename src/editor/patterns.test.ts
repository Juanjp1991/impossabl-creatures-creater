import assert from "node:assert/strict";
import test from "node:test";
import {
  generatePattern,
  generatePatternMarks,
  patternMarkup,
  pointInPolygon,
  polygonBounds,
  PATTERN_KINDS,
  type PatternOptions,
} from "./patterns";
import { flattenPathToPolygon } from "./pathWarp";

const SQUARE = [
  { x: 0, y: 0 },
  { x: 200, y: 0 },
  { x: 200, y: 160 },
  { x: 0, y: 160 },
];

/** Two legs with a gap between them — the concave case a convex clipper gets wrong. */
const FORKED = [
  { x: 0, y: 0 },
  { x: 200, y: 0 },
  { x: 200, y: 160 },
  { x: 130, y: 160 },
  { x: 130, y: 60 },
  { x: 70, y: 60 },
  { x: 70, y: 160 },
  { x: 0, y: 160 },
];

const base = (over: Partial<PatternOptions> = {}): PatternOptions => ({
  kind: "spots", scale: 1, density: 0.5, token: "accent", seed: 7, ...over,
});

test("point-in-polygon handles the concave gap between limbs", () => {
  assert.equal(pointInPolygon({ x: 100, y: 30 }, FORKED), true, "above the fork is inside");
  assert.equal(pointInPolygon({ x: 100, y: 120 }, FORKED), false, "the gap between legs is outside");
  assert.equal(pointInPolygon({ x: 40, y: 120 }, FORKED), true, "the left leg is inside");
  assert.equal(pointInPolygon({ x: -5, y: 80 }, FORKED), false);
});

test("bounds come from the polygon extent", () => {
  assert.deepEqual(polygonBounds(SQUARE), { x: 0, y: 0, width: 200, height: 160 });
});

test("every mark of every pattern stays inside the host silhouette", () => {
  for (const kind of PATTERN_KINDS) {
    const marks = generatePatternMarks(FORKED, base({ kind, density: 0.8 }));
    assert.ok(marks.length > 0, `${kind} produced no marks`);
    for (const mark of marks) {
      for (const point of mark) {
        assert.ok(
          pointInPolygon(point, FORKED),
          `${kind}: point (${point.x.toFixed(1)}, ${point.y.toFixed(1)}) escaped the outline`,
        );
      }
    }
  }
});

test("nothing is placed in the gap between the legs", () => {
  for (const kind of PATTERN_KINDS) {
    const marks = generatePatternMarks(FORKED, base({ kind, density: 1 }));
    const inGap = marks.flat().some((p) => p.x > 75 && p.x < 125 && p.y > 70 && p.y < 155);
    assert.equal(inGap, false, `${kind} placed a mark in the gap`);
  }
});

test("the same seed gives byte-identical markup, so a saved coat is reproducible", () => {
  const a = generatePattern(SQUARE, base({ seed: 42 }));
  const b = generatePattern(SQUARE, base({ seed: 42 }));
  assert.equal(a, b);
  assert.notEqual(a, generatePattern(SQUARE, base({ seed: 43 })));
});

test("higher density yields more marks", () => {
  const sparse = generatePatternMarks(SQUARE, base({ density: 0.1 })).length;
  const dense = generatePatternMarks(SQUARE, base({ density: 0.9 })).length;
  assert.ok(dense > sparse, `expected denser output, got ${sparse} then ${dense}`);
});

test("the mark ceiling is respected, so a pattern cannot blow the element budget", () => {
  for (const kind of PATTERN_KINDS) {
    const marks = generatePatternMarks(SQUARE, base({ kind, density: 1, scale: 0.2, maxMarks: 12 }));
    assert.ok(marks.length <= 12, `${kind} emitted ${marks.length}`);
  }
});

test("markup uses only allowed tags and paints with a ramp token, never raw hex", () => {
  const markup = generatePattern(SQUARE, base({ token: "primary-dark" }));
  assert.match(markup, /^<g data-pattern="spots">/);
  assert.match(markup, /<polygon points="[^"]+" fill="primary-dark"\/>/);
  assert.equal(/#[0-9a-f]{3,6}/i.test(markup), false, "no literal colour may reach the markup");
  assert.equal(/<(clipPath|pattern|mask|filter|linearGradient)/i.test(markup), false, "no banned tags");
});

test("one element is emitted per mark, so the count is predictable", () => {
  const marks = generatePatternMarks(SQUARE, base());
  const markup = patternMarkup(marks, base());
  assert.equal((markup.match(/<polygon/g) || []).length, marks.length);
});

test("a degenerate or tiny host yields nothing rather than throwing", () => {
  assert.deepEqual(generatePatternMarks([], base()), []);
  assert.deepEqual(generatePatternMarks([{ x: 1, y: 1 }, { x: 2, y: 2 }], base()), []);
  assert.equal(generatePattern([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }], base()), "");
});

test("a real curved path flattens into a usable outline", () => {
  const outline = flattenPathToPolygon("M10 100 C10 20 190 20 190 100 L190 150 L10 150 Z");
  assert.ok(outline.length > 4, "curves should contribute sampled points");
  assert.ok(pointInPolygon({ x: 100, y: 120 }, outline), "the interior is inside");
  assert.equal(pointInPolygon({ x: 100, y: 400 }, outline), false, "far below is outside");
});
