// §S1: how closely a candidate part matches the shape you cropped out of the reference.
//
// Intersection-over-union between the candidate's `PixelMask` and the rasterised reference
// silhouette, both on that slot's fixed local view. This half is deliberately DOM-free so it
// is unit-testable in node; turning a bitmap into a silhouette needs `getImageData` and lives
// in the browser-side sibling `src/referenceImage/rasterize.ts`.
//
// Known limitation, carried over from the plan: `shapePixels` approximates bezier paths by
// their control polygon rather than flattening them, so the score is slightly soft on
// curve-heavy parts. It is an ordering signal for ranking candidates, never a pass/fail gate.

import type { AnimalPartType } from "../types";
import { partPixelMask, pixelAt, pixelKey, VIEW, type PixelMask } from "./geometry";

export type Mask = Set<number>;

export interface MaskBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function maskBounds(mask: Mask): MaskBounds | undefined {
  if (!mask.size) return undefined;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const item of mask) {
    const { x, y } = pixelAt(item);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * Scale and translate `mask` so its bounding box is centred inside `target` at a uniform
 * scale (aspect preserved).
 *
 * Why align at all: the crop is framed by hand and the candidate is drawn to fill its slot
 * view, so a raw overlay would score framing rather than shape. Aligning the two bounding
 * boxes makes the number answer the question actually being asked — "is this the silhouette I
 * cropped?" — instead of "did the artist crop tightly?".
 */
export function alignMaskToBounds(mask: Mask, target: MaskBounds): Mask {
  const source = maskBounds(mask);
  if (!source || !target.width || !target.height) return new Set(mask);
  // Uniform scale, centred: the box is matched on its tighter axis so aspect ratio survives.
  // Stretching each axis independently would make a bar and a square score identically, and
  // proportion is exactly the kind of drift this number exists to catch.
  const scale = Math.min(target.width / source.width, target.height / source.height);
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const offsetX = target.x + Math.round((target.width - width) / 2);
  const offsetY = target.y + Math.round((target.height - height) / 2);
  // Resampled backwards — for each target pixel, ask which source pixel it came from. Mapping
  // forwards instead leaves holes whenever the target is larger than the source, which reads
  // as a shape mismatch rather than as the sampling artefact it is.
  const aligned: Mask = new Set();
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceX = source.x + Math.min(source.width - 1, Math.floor((x * source.width) / width));
      const sourceY = source.y + Math.min(source.height - 1, Math.floor((y * source.height) / height));
      if (mask.has(pixelKey(sourceX, sourceY))) aligned.add(pixelKey(offsetX + x, offsetY + y));
    }
  }
  return aligned;
}

/** Intersection over union, 0..1. Two empty masks score 0 rather than a misleading 1. */
export function iou(a: Mask, b: Mask): number {
  if (!a.size || !b.size) return 0;
  const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a];
  let shared = 0;
  for (const item of smaller) if (larger.has(item)) shared += 1;
  const union = a.size + b.size - shared;
  return union ? shared / union : 0;
}

export interface ConformanceScore {
  /** Intersection over union after bounding-box alignment, 0..1. */
  score: number;
  /** Share of the reference silhouette the candidate covers, 0..1. */
  coverage: number;
  candidatePixels: number;
  referencePixels: number;
}

/**
 * Compare one candidate's art against an already-rasterised reference silhouette. The
 * reference is rasterised once per round by the caller — it does not change between
 * candidates, and decoding a bitmap per candidate would dominate the cost.
 */
export function scoreConformance(svg: string, part: AnimalPartType, reference: Mask): ConformanceScore | undefined {
  if (!svg.trim() || !reference.size) return undefined;
  const candidate: PixelMask = partPixelMask(svg, part);
  const bounds = maskBounds(candidate.pixels);
  if (!bounds) return undefined;
  const aligned = alignMaskToBounds(reference, bounds);
  let shared = 0;
  for (const item of aligned) if (candidate.pixels.has(item)) shared += 1;
  return {
    score: iou(candidate.pixels, aligned),
    coverage: aligned.size ? shared / aligned.size : 0,
    candidatePixels: candidate.pixels.size,
    referencePixels: aligned.size,
  };
}

/** The local view a reference crop must be rasterised onto for `slot`. */
export function slotRasterSize(slot: AnimalPartType): { width: number; height: number } {
  const view = VIEW[slot];
  return { width: view.width, height: view.height };
}
