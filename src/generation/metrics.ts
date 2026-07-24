// The numeric half of the §5.2 canonical standard: one shared set of constants and the
// pure functions that measure a part against them. Both the deterministic validator and
// the contact-sheet stats import from here, so the number shown under a candidate is the
// same number the gate uses. Values were mined from the committed tiger/hippo examples.

import type { AnimalPartType } from "../types";
import { extractSvgBounds } from "./normalize";
import { isRawColour } from "./palette";

const VIEW_HEIGHT: Record<AnimalPartType, number> = { head: 160, body: 220, frontLegs: 180, backLegs: 180, tail: 160 };

// Stroke weights: one silhouette weight and a narrow detail band; anything under 1 vanishes
// on a cheap 360px-wide screen and is banned outright.
export const STROKE = { silhouette: 3, detailMin: 1, detailMax: 1.5, minVisible: 1, tolerance: 0.35 } as const;

// Post-normalization occupied height as a fraction of the fixed local view height. Gated on
// height only — width-fill is structurally low for leg sets that sit near their anchor in
// the wide 260px view. Band mined from the tiger (72–92% across its five parts).
export const FILL_BAND: readonly [number, number] = [0.65, 0.95];

// Visible drawable elements per part. Too few reads as a generic Version-B blob; too many is
// the tiger's over-detailed end and blows the old-phone node budget.
export const DENSITY_BANDS: Record<AnimalPartType, readonly [number, number]> = {
  head: [8, 28], body: [8, 26], frontLegs: [5, 14], backLegs: [5, 14], tail: [3, 10],
};

const DRAWABLE = /<(?:path|circle|rect|ellipse|polygon|polyline|line)\b/gi;

export function visibleElementCount(svg: string): number {
  return (svg.match(DRAWABLE) ?? []).length;
}

/** Occupied height / fixed local view height, in post-normalization coordinates (0..~1.25). */
export function localFillRatio(svg: string, part: AnimalPartType): number {
  const bounds = extractSvgBounds(svg);
  return bounds ? bounds.height / VIEW_HEIGHT[part] : 0;
}

/** Every authored stroke-width value in the part (attribute and inline-style forms). */
export function strokeWidths(svg: string): number[] {
  const widths: number[] = [];
  for (const match of svg.matchAll(/stroke-width\s*=\s*["']([^"']+)["']/gi)) widths.push(Number(match[1]));
  for (const match of svg.matchAll(/stroke-width\s*:\s*([\d.]+)/gi)) widths.push(Number(match[1]));
  return widths.filter((value) => Number.isFinite(value));
}

export interface StrokeClassification { belowMinimum: number[]; offStandard: number[]; }

/** Split stroke widths into the banned (sub-1) set and the merely off-standard set. */
export function classifyStrokeWidths(svg: string): StrokeClassification {
  const belowMinimum: number[] = [];
  const offStandard: number[] = [];
  for (const width of strokeWidths(svg)) {
    if (width < STROKE.minVisible - 1e-6) { belowMinimum.push(width); continue; }
    const isSilhouette = Math.abs(width - STROKE.silhouette) <= STROKE.tolerance;
    const isDetail = width <= STROKE.detailMax + STROKE.tolerance;
    if (!isSilhouette && !isDetail) offStandard.push(width);
  }
  return { belowMinimum, offStandard };
}

/** The first off-ramp raw colour used in a fill/stroke/stop-color, or undefined if the part is token-clean. */
export function firstRawColour(svg: string): string | undefined {
  for (const match of svg.matchAll(/(?:fill|stroke|stop-color)\s*=\s*["']([^"']*)["']/gi)) {
    if (isRawColour(match[1])) return match[1];
  }
  for (const match of svg.matchAll(/(?:fill|stroke|stop-color)\s*:\s*([^;"']+)/gi)) {
    if (isRawColour(match[1])) return match[1].trim();
  }
  return undefined;
}
