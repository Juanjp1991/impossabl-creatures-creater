// §S1 glue: score a whole round of candidates against the cropped reference.
//
// Browser-side because it rasterises bitmaps. Kept out of the dialog so the component only
// deals in "here are the scores for this round" rather than in canvases and pixel masks.

import { scoreConformance, slotRasterSize, type ConformanceScore, type Mask } from "../generation/conformance";
import type { GeneratedSample } from "../generation/sampleSelection";
import type { AnimalDraft } from "../generation/contracts";
import type { AnimalPartType } from "../types";
import { cropReferenceDataUrl, isMeaningfulCrop, type ReferenceCrops } from "./crop";
import { rasterizeReferenceMask } from "./rasterize";

const SVG_FIELD: Record<AnimalPartType, keyof AnimalDraft> = {
  head: "headSvg", body: "bodySvg", frontLegs: "frontLegsSvg", backLegs: "backLegsSvg", tail: "tailSvg",
};

/** `${slot}:${sampleIndex}` — one flat map covers a contact sheet and a single-slot round alike. */
export const scoreKey = (slot: AnimalPartType, sampleIndex: number) => `${slot}:${sampleIndex}`;

export interface ScoreRoundInput {
  /** The full downscaled reference; crops are cut from it per slot. */
  image: string | null;
  crops: ReferenceCrops;
  slots: AnimalPartType[];
  samples: GeneratedSample[];
}

/**
 * Rasterise each cropped slot once, then score every candidate for that slot against it.
 * Slots without a meaningful crop are skipped entirely: an uncropped whole-animal photo would
 * score the candidate against the wrong silhouette, which is worse than no number at all.
 */
export async function scoreRound(input: ScoreRoundInput): Promise<Map<string, ConformanceScore>> {
  const scores = new Map<string, ConformanceScore>();
  if (!input.image) return scores;

  for (const slot of input.slots) {
    const crop = input.crops[slot];
    if (!isMeaningfulCrop(crop)) continue;
    let reference: Mask;
    try {
      const cropped = await cropReferenceDataUrl(input.image, crop);
      const size = slotRasterSize(slot);
      reference = await rasterizeReferenceMask(cropped, size.width, size.height);
    } catch (error) {
      console.warn(`Could not rasterise the ${slot} reference crop for scoring:`, error);
      continue;
    }
    if (!reference.size) continue;

    for (const sample of input.samples) {
      const svg = sample.animal?.[SVG_FIELD[slot]];
      if (typeof svg !== "string" || !svg.trim()) continue;
      const score = scoreConformance(svg, slot, reference);
      if (score) scores.set(scoreKey(slot, sample.index), score);
    }
  }
  return scores;
}
