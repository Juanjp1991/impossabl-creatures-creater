// "More like this" (§5.6) — N variations around a part you already chose, rather than N
// fresh draws.
//
// `runSampleGeneration` explores: it asks for the whole animal N times and the samples are
// unrelated to each other. This module exploits: it takes one part you already like and
// asks `/api/modify-animal` for N nudged versions of it, seeded with that exact art. The
// endpoint already enforces the important half of that contract — with a specific
// `targetPart` it returns only that part's SVG and treats every other part, colour and
// connection as immutable, and 422s if the part came back unchanged.
//
// Results are shaped as `GeneratedSample[]` so `SlotCandidatePicker` renders them with no
// changes: same grid, same seam/fill/density stats, same bookmark-to-bank on every
// candidate including the ones you discard.
//
// DOM-free apart from `postJson`, so the prompt builders are unit-testable in node.

import type { AnimalDraft, ReferenceMode } from "./contracts";
import type { AnimalPartType } from "../types";
import { analyzeDraftGeometry } from "./geometry";
import { postJson } from "./apiClient";
import type { GeneratedSample } from "./sampleSelection";

export const DEFAULT_VARIATION_COUNT = 6;
export const DEFAULT_VARIATION_CONCURRENCY = 2;

export type VariationStrength = "tight" | "moderate" | "loose";

/**
 * How far a variation may travel from the part it was seeded with. This is the knob that
 * separates "same head, different ears" from "another take on the idea", and it is purely
 * a prompt directive — the transport and merge are identical for all three.
 */
export const VARIATION_STRENGTHS: Record<VariationStrength, { label: string; hint: string; directive: string }> = {
  tight: {
    label: "Tight",
    hint: "Same part, small adjustments",
    directive:
      "STRENGTH — TIGHT: this must read as the same part, refined. Preserve the overall silhouette, proportions, palette and character exactly. Change only the one aspect named below, and keep every other shape recognisably where it was.",
  },
  moderate: {
    label: "Moderate",
    hint: "Clearly related, visibly different",
    directive:
      "STRENGTH — MODERATE: this must read as the same species and the same design language, but a visibly different take. Keep the silhouette family, the palette and the level of detail; you may reshape individual features and re-arrange internal markings.",
  },
  loose: {
    label: "Loose",
    hint: "Same idea, fresh interpretation",
    directive:
      "STRENGTH — LOOSE: treat the existing part as inspiration rather than a constraint. Keep the species, the palette and the attachment contract; everything else — silhouette, proportion, feature emphasis — may be reinterpreted.",
  },
};

/**
 * One differentiating angle per variation, so six calls do not return six copies of the
 * same idea. On the proxy runtime temperature is never sent, so prompt variation is the
 * only real diversity lever — same reasoning as `SAMPLE_EMPHASES`.
 */
export const VARIATION_ANGLES: string[] = [
  "ANGLE — proportion: keep the design and re-balance the proportions. Push the single most characterful dimension and let the rest follow.",
  "ANGLE — features: keep the proportions and rework the defining features — the shapes that carry the species read.",
  "ANGLE — markings: keep the silhouette and rework the internal markings, patches and colour breakup drawn in the accent tokens.",
  "ANGLE — attitude: keep the anatomy and change the attitude of the pose — the tilt, set and tension that give the part its character.",
  "ANGLE — simplify: keep the character and reduce the shape count. Fewer, larger, cleaner forms with a bolder read at small sizes.",
  "ANGLE — enrich: keep the silhouette and add one more layer of considered interior detail without crossing into noise.",
  "ANGLE — softness: keep the structure and shift the line language — rounder and softer, or crisper and more angular, whichever the current part is not.",
  "ANGLE — asymmetry: keep the design and introduce deliberate, believable asymmetry so the part reads as drawn rather than mirrored.",
];

/** Short labels shown under each candidate in the picker. */
export const VARIATION_ANGLE_LABELS: string[] = [
  "proportion", "features", "markings", "attitude", "simplify", "enrich", "line", "asymmetry",
];

export function variationAngle(index: number): string {
  return VARIATION_ANGLES[index % VARIATION_ANGLES.length];
}

export function variationAngleLabel(index: number): string {
  return VARIATION_ANGLE_LABELS[index % VARIATION_ANGLE_LABELS.length];
}

const SLOT_NOUN: Record<AnimalPartType, string> = {
  head: "head",
  body: "body",
  frontLegs: "front legs",
  backLegs: "back legs",
  tail: "tail",
};

export interface VariationPromptInput {
  slot: AnimalPartType;
  strength: VariationStrength;
  index: number;
  /** Free-text steer from the user, layered on top of the strength and angle. */
  instructions?: string;
}

/**
 * The instruction for one variation: what to vary, how far, and in which direction.
 *
 * The endpoint's system instruction already owns the coordinate space, the attachment
 * anchors and the ramp-token palette rules, so this deliberately says nothing about them —
 * repeating those here would give the model two sources of truth to reconcile.
 */
export function buildVariationPrompt({ slot, strength, index, instructions }: VariationPromptInput): string {
  const noun = SLOT_NOUN[slot];
  return [
    `Produce one alternative version of the ${noun} only. Every other part of the creature is immutable.`,
    VARIATION_STRENGTHS[strength].directive,
    variationAngle(index),
    `The result must be meaningfully different from the current ${noun} — returning it unchanged, or with only trivial coordinate noise, is a failure.`,
    instructions?.trim() ? `ADDITIONAL DIRECTION FROM THE ARTIST: ${instructions.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export interface PartVariationInput {
  /**
   * The whole current creature, not just the part. `/api/modify-animal` is prompted with
   * every part's SVG, so variations come back fitted to the body and limbs around them —
   * which is the point, but it does mean the seed must be a complete draft.
   */
  seed: AnimalDraft;
  slot: AnimalPartType;
  strength?: VariationStrength;
  instructions?: string;
  count?: number;
  concurrency?: number;
  modelId?: string;
  image?: string | null;
  referenceMode?: ReferenceMode;
  /** §R3: true when `image` is already cropped to the slot rather than the whole animal. */
  cropped?: boolean;
  onProgress?: (done: number, total: number) => void;
}

function safeGeometry(animal: AnimalDraft) {
  try {
    return analyzeDraftGeometry(animal);
  } catch {
    return undefined;
  }
}

async function runWithConcurrency<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> {
  const results = new Array<T>(tasks.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < tasks.length) {
      const index = cursor++;
      results[index] = await tasks[index]();
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, tasks.length)) }, worker));
  return results;
}

/**
 * Turn one `/api/modify-animal` response into a candidate.
 *
 * The endpoint returns the *merged* creature rather than a delta, so the payload is already
 * a complete draft — the only work is dropping the `modifiedParts` bookkeeping field and
 * keeping the seed's layout metadata, which a targeted edit does not restate.
 */
export function variationSample(
  index: number,
  seed: AnimalDraft,
  payload: Record<string, unknown>
): GeneratedSample {
  const { modifiedParts: _modifiedParts, ...animal } = payload as unknown as AnimalDraft & { modifiedParts?: string[] };
  const merged: AnimalDraft = { ...seed, ...animal, layoutMetadata: seed.layoutMetadata };
  return {
    index,
    emphasis: variationAngle(index),
    label: variationAngleLabel(index),
    animal: merged,
    geometry: safeGeometry(merged),
  };
}

/**
 * Ask for `count` variations of one part in parallel, each with its own angle. A failed
 * variation is captured as `{ error }` rather than rejecting the batch, so a stubborn round
 * still yields whatever did come back — same contract as `runSampleGeneration`.
 */
export async function runPartVariations(input: PartVariationInput): Promise<GeneratedSample[]> {
  const total = Math.max(1, input.count ?? DEFAULT_VARIATION_COUNT);
  const concurrency = input.concurrency ?? DEFAULT_VARIATION_CONCURRENCY;
  const strength = input.strength ?? "moderate";
  let done = 0;

  const tasks = Array.from({ length: total }, (_unused, index) => async (): Promise<GeneratedSample> => {
    try {
      const payload = await postJson("/api/modify-animal", {
        prompt: buildVariationPrompt({ slot: input.slot, strength, index, instructions: input.instructions }),
        targetPart: input.slot,
        currentAnimal: input.seed,
        image: input.image ?? null,
        referenceMode: input.referenceMode,
        referenceCropped: Boolean(input.cropped),
        modelId: input.modelId,
      });
      return variationSample(index, input.seed, payload);
    } catch (error: any) {
      return {
        index,
        emphasis: variationAngle(index),
        label: variationAngleLabel(index),
        error: error?.message || "Variation failed.",
      };
    } finally {
      done += 1;
      input.onProgress?.(done, total);
    }
  });

  return runWithConcurrency(tasks, concurrency);
}
