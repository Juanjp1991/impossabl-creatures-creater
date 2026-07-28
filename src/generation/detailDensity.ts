import type { AnimalPartType } from "../types";

export const DETAIL_LEVELS = ["low", "medium", "high", "ultra"] as const;
export type DetailLevel = typeof DETAIL_LEVELS[number];

export interface DetailDensityProfile {
  label: string;
  targets: Record<AnimalPartType, number>;
  bands: Record<AnimalPartType, readonly [number, number]>;
}
/**
 * Visible drawable SVG elements per generated part.
 *
 * A target tells the model what to aim for. The wider band lets natural species variation
 * through validation without making the selector cosmetic: a smooth tail need not be padded
 * to the same count as a feathered one, but Ultra still occupies a clearly different range
 * from Medium.
 */
export const DETAIL_DENSITY_PROFILES: Record<DetailLevel, DetailDensityProfile> = {
  low: {
    label: "Low",
    targets: { head: 10, body: 10, frontLegs: 6, backLegs: 6, tail: 4 },
    bands: { head: [8, 14], body: [8, 14], frontLegs: [5, 9], backLegs: [5, 9], tail: [3, 6] },
  },
  medium: {
    label: "Medium",
    targets: { head: 18, body: 17, frontLegs: 9, backLegs: 9, tail: 6 },
    bands: { head: [8, 28], body: [8, 26], frontLegs: [5, 14], backLegs: [5, 14], tail: [3, 10] },
  },
  high: {
    label: "High",
    targets: { head: 30, body: 34, frontLegs: 18, backLegs: 18, tail: 12 },
    bands: { head: [24, 38], body: [26, 42], frontLegs: [14, 24], backLegs: [14, 24], tail: [9, 16] },
  },
  ultra: {
    label: "Ultra",
    targets: { head: 45, body: 55, frontLegs: 28, backLegs: 28, tail: 18 },
    bands: { head: [38, 56], body: [46, 68], frontLegs: [24, 36], backLegs: [24, 36], tail: [15, 24] },
  },
};

export function resolveDetailLevel(value: unknown): DetailLevel {
  return DETAIL_LEVELS.includes(value as DetailLevel) ? value as DetailLevel : "medium";
}

export function detailDensityProfile(value: unknown): DetailDensityProfile {
  return DETAIL_DENSITY_PROFILES[resolveDetailLevel(value)];
}

export function detailDensityTotal(value: unknown): number {
  return Object.values(detailDensityProfile(value).targets).reduce((sum, count) => sum + count, 0);
}

export function wholeAnimalDensityInstruction(value: unknown): string {
  const profile = detailDensityProfile(value);
  const { targets, bands } = profile;
  return [
    `${profile.label.toUpperCase()} detail numerically targets`,
    `head ${targets.head} shapes (range ${bands.head[0]}-${bands.head[1]}),`,
    `body ${targets.body} (${bands.body[0]}-${bands.body[1]}),`,
    `front legs ${targets.frontLegs} (${bands.frontLegs[0]}-${bands.frontLegs[1]}),`,
    `back legs ${targets.backLegs} (${bands.backLegs[0]}-${bands.backLegs[1]}),`,
    `and tail ${targets.tail} (${bands.tail[0]}-${bands.tail[1]}),`,
    `for about ${detailDensityTotal(value)} visible SVG shapes total.`,
    "Count drawable path, circle, rect, ellipse, polygon, polyline and line elements.",
    "Every added shape must describe silhouette, anatomy, shading, markings or a species-defining feature; never pad the count with random decoration.",
  ].join(" ");
}
