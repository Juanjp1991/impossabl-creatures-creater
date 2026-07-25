import type { RampToken } from "../generation/palette";
import type { Point } from "./transform";

/**
 * Coat patterns — spots, stripes, patches, scales — generated as real geometry.
 *
 * The obvious implementation is a `<pattern>` fill clipped by `<clipPath>`, but both tags
 * are banned outright by the validator (`ALLOWED_TAGS` in `src/generation/validation.ts`)
 * because they are expensive on the old Android WebViews this project targets. So the marks
 * are emitted as ordinary polygons, trimmed against the host shape's own outline, and
 * counted against the part's element budget like any other drawable.
 *
 * Output is deterministic: the same seed and options always produce the same markup, so a
 * saved part is reproducible and a re-render never reshuffles a creature's coat.
 *
 * Pure: no DOM, no React.
 */

export type PatternKind = "spots" | "stripes" | "patches" | "scales";

export const PATTERN_KINDS: PatternKind[] = ["spots", "stripes", "patches", "scales"];

export interface PatternOptions {
  kind: PatternKind;
  /** Mark size multiplier; 1 is the natural size for the host's dimensions. */
  scale: number;
  /** 0 to 1. Drives spacing, and with it how many marks land inside the shape. */
  density: number;
  token: RampToken;
  seed?: number;
  /** Hard ceiling on emitted marks, so a pattern cannot blow the element budget. */
  maxMarks?: number;
  opacity?: number;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Deterministic PRNG (mulberry32) — small, fast, and stable across engines. */
function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Ray-casting point-in-polygon.
 *
 * Chosen over polygon clipping because animal silhouettes are strongly concave, and the
 * usual Sutherland–Hodgman clipper is only correct for convex clip regions — it would
 * smear marks across the gaps between legs.
 */
export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const straddles = a.y > point.y !== b.y > point.y;
    if (!straddles) continue;
    const crossingX = ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (point.x < crossingX) inside = !inside;
  }
  return inside;
}

export function polygonBounds(polygon: Point[]): Bounds {
  const xs = polygon.map((p) => p.x);
  const ys = polygon.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

const ellipsePoints = (cx: number, cy: number, rx: number, ry: number, steps = 10): Point[] =>
  Array.from({ length: steps }, (_, i) => {
    const angle = (i / steps) * Math.PI * 2;
    return { x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry };
  });

/** A mark is kept only if it sits wholly inside the host, so nothing crosses the silhouette. */
const fullyInside = (mark: Point[], outline: Point[]) =>
  mark.every((point) => pointInPolygon(point, outline));

/**
 * Spacing from density. Inverted deliberately: density 1 packs marks tightly, density 0
 * spreads them out, which is how the slider reads to a user.
 */
const spacingFor = (bounds: Bounds, density: number) => {
  const span = Math.min(bounds.width, bounds.height);
  return Math.max(span / 20, span / (4 + Math.max(0, Math.min(1, density)) * 20));
};

function blobPoints(cx: number, cy: number, radius: number, random: () => number): Point[] {
  const steps = 9;
  return Array.from({ length: steps }, (_, i) => {
    const angle = (i / steps) * Math.PI * 2;
    // Irregular radius is what separates a cow patch from a plain spot.
    const wobble = radius * (0.6 + random() * 0.7);
    return { x: cx + Math.cos(angle) * wobble, y: cy + Math.sin(angle) * wobble };
  });
}

/**
 * Stripes are trimmed by walking along each band and keeping the runs that are inside.
 *
 * A whole-stripe inside/outside test would discard almost every stripe on a limbed shape;
 * sampling along the band handles concavity correctly and gives clean ends at the outline.
 */
function stripeRuns(outline: Point[], bounds: Bounds, x: number, width: number, step: number): Point[][] {
  const runs: Point[][] = [];
  let runStart: number | null = null;
  const centreX = x + width / 2;

  for (let y = bounds.y; y <= bounds.y + bounds.height + step; y += step) {
    const inside =
      y <= bounds.y + bounds.height &&
      pointInPolygon({ x: centreX, y }, outline) &&
      pointInPolygon({ x, y }, outline) &&
      pointInPolygon({ x: x + width, y }, outline);

    if (inside && runStart === null) runStart = y;
    if (!inside && runStart !== null) {
      // Ignore slivers; they read as noise rather than as a stripe.
      if (y - runStart > step) runs.push([
        { x, y: runStart },
        { x: x + width, y: runStart },
        { x: x + width, y: y - step },
        { x, y: y - step },
      ]);
      runStart = null;
    }
  }
  return runs;
}

/** Generate the clipped marks for a pattern, as polygons in the host's coordinate space. */
export function generatePatternMarks(outline: Point[], options: PatternOptions): Point[][] {
  if (outline.length < 3) return [];
  const bounds = polygonBounds(outline);
  if (bounds.width <= 0 || bounds.height <= 0) return [];

  const random = rng(options.seed ?? 1);
  const spacing = spacingFor(bounds, options.density);
  const size = spacing * 0.35 * Math.max(0.1, options.scale);
  const maxMarks = options.maxMarks ?? 60;
  const marks: Point[][] = [];

  if (options.kind === "stripes") {
    const width = Math.max(2, size * 1.2);
    for (let x = bounds.x + spacing / 2; x < bounds.x + bounds.width && marks.length < maxMarks; x += spacing) {
      for (const run of stripeRuns(outline, bounds, x, width, Math.max(2, spacing / 4))) {
        if (marks.length >= maxMarks) break;
        marks.push(run);
      }
    }
    return marks;
  }

  // Staggered grid: a plain grid reads as machine-made, and scales in particular need the
  // offset rows to interlock.
  let row = 0;
  for (let y = bounds.y + spacing / 2; y < bounds.y + bounds.height && marks.length < maxMarks; y += spacing) {
    const offset = row % 2 === 0 ? 0 : spacing / 2;
    for (let x = bounds.x + spacing / 2 + offset; x < bounds.x + bounds.width && marks.length < maxMarks; x += spacing) {
      const jitter = options.kind === "scales" ? 0 : (random() - 0.5) * spacing * 0.35;
      const cx = x + jitter;
      const cy = y + (options.kind === "scales" ? 0 : (random() - 0.5) * spacing * 0.35);

      const mark =
        options.kind === "spots" ? ellipsePoints(cx, cy, size, size * (0.75 + random() * 0.4))
        : options.kind === "patches" ? blobPoints(cx, cy, size * 1.6, random)
        : ellipsePoints(cx, cy, size * 1.1, size * 0.75, 8);

      if (fullyInside(mark, outline)) marks.push(mark);
    }
    row += 1;
  }

  return marks;
}

const round = (value: number) => Math.round(value * 100) / 100;

export function patternMarkup(marks: Point[][], options: PatternOptions): string {
  if (!marks.length) return "";
  const opacity = options.opacity ?? 1;
  const shapes = marks
    .map((mark) => {
      const points = mark.map((p) => `${round(p.x)},${round(p.y)}`).join(" ");
      return `<polygon points="${points}" fill="${options.token}"${opacity !== 1 ? ` fill-opacity="${opacity}"` : ""}/>`;
    })
    .join("");
  // data-pattern marks the group as regenerable, so re-applying replaces rather than stacks.
  return `<g data-pattern="${options.kind}">${shapes}</g>`;
}

/** Marks plus markup in one call. Returns an empty string when nothing fits inside. */
export function generatePattern(outline: Point[], options: PatternOptions): string {
  return patternMarkup(generatePatternMarks(outline, options), options);
}
