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
 * Targets numerically influence generation while the wider validation bands allow natural
 * species variation. Low stays suitable for quick/simple drawings; the other tiers deliberately
 * climb steeply so High and Ultra produce materially richer artwork instead of cosmetic changes.
 */
export const DETAIL_DENSITY_PROFILES: Record<DetailLevel, DetailDensityProfile> = {
  low: {
    label: "Low",
    targets: { head: 10, body: 10, frontLegs: 8, backLegs: 8, tail: 4 },
    bands: { head: [8, 14], body: [8, 14], frontLegs: [6, 12], backLegs: [6, 12], tail: [3, 6] },
  },
  medium: {
    label: "Medium",
    targets: { head: 26, body: 28, frontLegs: 20, backLegs: 20, tail: 8 },
    bands: { head: [18, 36], body: [20, 40], frontLegs: [14, 28], backLegs: [14, 28], tail: [5, 13] },
  },
  high: {
    label: "High",
    targets: { head: 60, body: 70, frontLegs: 50, backLegs: 50, tail: 24 },
    bands: { head: [45, 80], body: [52, 92], frontLegs: [38, 66], backLegs: [38, 66], tail: [18, 32] },
  },
  ultra: {
    label: "Ultra",
    targets: { head: 100, body: 125, frontLegs: 90, backLegs: 90, tail: 45 },
    bands: { head: [75, 135], body: [95, 165], frontLegs: [68, 120], backLegs: [68, 120], tail: [32, 62] },
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

export function detailDensityBandTotals(value: unknown): readonly [number, number] {
  return Object.values(detailDensityProfile(value).bands).reduce(
    ([minimum, maximum], [partMinimum, partMaximum]) =>
      [minimum + partMinimum, maximum + partMaximum] as const,
    [0, 0] as readonly [number, number],
  );
}

export function wholeAnimalDensityInstruction(value: unknown): string {
  const profile = detailDensityProfile(value);
  const { targets, bands } = profile;
  const frontFootTarget = Math.max(2, Math.round(targets.frontLegs * 0.15));
  const backFootTarget = Math.max(2, Math.round(targets.backLegs * 0.15));
  return [
    `${profile.label.toUpperCase()} detail numerically targets`,
    `head ${targets.head} shapes (range ${bands.head[0]}-${bands.head[1]}),`,
    `body ${targets.body} (${bands.body[0]}-${bands.body[1]}),`,
    `front legs ${targets.frontLegs} (${bands.frontLegs[0]}-${bands.frontLegs[1]}),`,
    `back legs ${targets.backLegs} (${bands.backLegs[0]}-${bands.backLegs[1]}),`,
    `and tail ${targets.tail} (${bands.tail[0]}-${bands.tail[1]}),`,
    `for about ${detailDensityTotal(value)} visible SVG shapes total.`,
    `Inside the leg budgets, reserve about ${frontFootTarget} meaningful shapes for EACH front foot and ${backFootTarget} for EACH back foot; spend the remaining shapes on broad collars, limb anatomy, joints, markings and shading.`,
    "Count drawable path, circle, rect, ellipse, polygon, polyline and line elements.",
    "Every added shape must describe silhouette, anatomy, shading, markings or a species-defining feature; never pad the count with random decoration.",
  ].join(" ");
}
