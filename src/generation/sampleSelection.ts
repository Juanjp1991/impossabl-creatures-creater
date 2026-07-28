// Parallel-sample-and-select pipeline (§5.3). Instead of one multiplicative gamble
// per animal followed by a review/repair loop, we generate the whole animal N times
// and let a human pick the best individual part per slot from a contact sheet. Parts
// from different samples are interchangeable by construction: every sample of a
// species targets the same fixed local views and the same fixed anchors.
//
// This module is deliberately DOM-free so it is unit-testable in node; all rendering
// lives in the preview builders and the ContactSheetSelector component.

import {
  PART_TYPES,
  type AnatomyStylePlan,
  type AnimalDraft,
  type GeneratedLayoutMetadata,
  type GenerationMetadata,
  type GuidedAnimalBrief,
  type ReferenceMode,
  type ValidationResult,
} from "./contracts";
import type { AnimalPartType } from "../types";
import { analyzeDraftGeometry, type DraftGeometryReport } from "./geometry";
import { localFillRatio, visibleElementCount } from "./metrics";
import { postJson } from "./apiClient";

export const DEFAULT_SAMPLE_COUNT = 4;
export const DEFAULT_SAMPLE_CONCURRENCY = 2;

const SVG_FIELD: Record<AnimalPartType, keyof AnimalDraft> = {
  head: "headSvg", body: "bodySvg", frontLegs: "frontLegsSvg", backLegs: "backLegsSvg", tail: "tailSvg",
};

// Interchangeable emphasis paragraphs appended to the one shared brief, one per sample.
// On the proxy runtime temperature is never sent and reasoning effort is a server-wide
// env, so prompt variation — not seed or temperature — is the real diversity lever.
export const SAMPLE_EMPHASES: string[] = [
  "GENERATION EMPHASIS FOR THIS VARIATION — silhouette-first and minimal: prioritise one clean, bold, instantly readable outline per part. Prefer a few large organic shapes over many small ones and keep internal decoration sparse.",
  "GENERATION EMPHASIS FOR THIS VARIATION — markings-forward: make the species' signature colours, stripes, spots or patches the star. Keep the silhouette simple but load the surface with characteristic markings drawn in the accent colour.",
  "GENERATION EMPHASIS FOR THIS VARIATION — anatomy and joints-forward: prioritise believable muscle mass, natural limb bends and broad shoulder and hip collars that seat cleanly into the torso. Favour anatomical correctness over surface decoration.",
  "GENERATION EMPHASIS FOR THIS VARIATION — stylised and bold: a confident, characterful, slightly exaggerated game-art read. Push the single most distinctive species feature larger than life while staying on the shared house style.",
];

// Short human labels for the same four variations, shown on the contact sheet.
export const SAMPLE_EMPHASIS_LABELS: string[] = ["silhouette-first", "markings-forward", "anatomy-forward", "stylised-bold"];

export function emphasisForSample(index: number): string {
  return SAMPLE_EMPHASES[index % SAMPLE_EMPHASES.length];
}

export function emphasisLabel(index: number): string {
  return SAMPLE_EMPHASIS_LABELS[index % SAMPLE_EMPHASIS_LABELS.length];
}

/** Append this sample's emphasis to the shared brief without mutating the original. */
export function briefForSample(brief: GuidedAnimalBrief, index: number): GuidedAnimalBrief {
  const advancedInstructions = [brief.advancedInstructions?.trim(), emphasisForSample(index)].filter(Boolean).join(" ");
  return { ...brief, advancedInstructions };
}

export interface GeneratedSample {
  index: number;
  emphasis: string;
  /**
   * Short human label for this candidate. Absent for contact-sheet samples, which derive
   * theirs from the index; set by "more like this" rounds, whose angles do not line up with
   * `SAMPLE_EMPHASIS_LABELS` and whose count can exceed it.
   */
  label?: string;
  animal?: AnimalDraft;
  plan?: AnatomyStylePlan;
  validation?: ValidationResult;
  geometry?: DraftGeometryReport;
  models?: GenerationMetadata["models"];
  promptVersions?: GenerationMetadata["promptVersions"];
  /** §P3: the model id this candidate was drawn with, when a round mixes several. */
  modelId?: string;
  error?: string;
}

/** slot -> sample index chosen for that slot. */
export type SlotSelection = Record<AnimalPartType, number>;

export interface PartCandidateStats {
  hasArt: boolean;
  /** Overlapping opaque pixels in the 18px joint zone; null for the body (no seam). */
  seamPixels: number | null;
  /** Occupied mask height / fixed local view height, 0..1 (§5.2 fill band metric). */
  fillRatio: number;
  /** Count of visible drawable elements in the part SVG (§5.2 density metric). */
  elementCount: number;
  /** Validation errors from this sample that name this slot. */
  errorCount: number;
}

/** Run analyzeDraftGeometry defensively — a malformed draft must not abort the batch. */
function safeGeometry(animal: AnimalDraft): DraftGeometryReport | undefined {
  try { return analyzeDraftGeometry(animal); } catch { return undefined; }
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
 * §P3: which model draws sample `index`. A round-robin over the chosen ids rather than one
 * model per round — model choice is a far larger source of variance than prompt nudging, so
 * a contact sheet that mixes models compares the lever that actually moves quality.
 */
export function modelForSample(index: number, modelIds: string[] | undefined, fallback?: string): string | undefined {
  const usable = (modelIds ?? []).filter(Boolean);
  if (!usable.length) return fallback;
  return usable[index % usable.length];
}

export interface SampleGenerationInput {
  prompt: string;
  image: string | null;
  referenceMode: ReferenceMode;
  brief: GuidedAnimalBrief;
  modelId?: string;
  /** §P3: sample `i` uses `modelIds[i % n]`; falls back to `modelId` when empty. */
  modelIds?: string[];
  sampleCount?: number;
  concurrency?: number;
  onProgress?: (done: number, total: number) => void;
}

/**
 * Generate the animal `sampleCount` times in parallel (capped concurrency), one
 * emphasis per sample, against today's `/api/generate-animal`. A failed sample is
 * captured as `{ error }` rather than rejecting the batch, so a stubborn species
 * still yields whatever parts did come back.
 */
export async function runSampleGeneration(input: SampleGenerationInput): Promise<GeneratedSample[]> {
  const total = Math.max(1, input.sampleCount ?? DEFAULT_SAMPLE_COUNT);
  const concurrency = input.concurrency ?? DEFAULT_SAMPLE_CONCURRENCY;
  let done = 0;
  const tasks = Array.from({ length: total }, (_unused, index) => async (): Promise<GeneratedSample> => {
    const emphasis = emphasisForSample(index);
    const modelId = modelForSample(index, input.modelIds, input.modelId);
    try {
      const result = await postJson("/api/generate-animal", {
        prompt: input.prompt,
        image: input.image,
        referenceMode: input.referenceMode,
        brief: briefForSample(input.brief, index),
        modelId,
      });
      const animal = result.animal as AnimalDraft;
      // The server echoes the id it actually resolved, which is what provenance should record
      // when a requested id was unknown and fell back to the default.
      return { index, emphasis, animal, plan: result.plan, validation: result.validation as ValidationResult, geometry: safeGeometry(animal), models: result.models, promptVersions: result.promptVersions, modelId: result.modelId ?? modelId };
    } catch (error: any) {
      return { index, emphasis, modelId, error: error?.message || "Sample generation failed." };
    } finally {
      done += 1;
      input.onProgress?.(done, total);
    }
  });
  return runWithConcurrency(tasks, concurrency);
}

/** Deterministic per-slot stats for one candidate, printed under it on the contact sheet. */
export function partCandidateStats(sample: GeneratedSample, slot: AnimalPartType): PartCandidateStats {
  const svg = sample.animal?.[SVG_FIELD[slot]];
  if (!sample.animal || typeof svg !== "string" || !svg.trim()) {
    return { hasArt: false, seamPixels: null, fillRatio: 0, elementCount: 0, errorCount: Infinity };
  }
  const geometry = sample.geometry ?? safeGeometry(sample.animal);
  const seam = slot === "body" ? null : geometry?.seams.find((entry) => entry.part === slot)?.jointZoneOverlapPixels ?? 0;
  const errorCount = (sample.validation?.issues ?? []).filter((entry) => entry.severity === "error" && entry.part === slot).length;
  return { hasArt: true, seamPixels: seam, fillRatio: localFillRatio(svg, slot), elementCount: visibleElementCount(svg), errorCount };
}

/**
 * Lower is better: fewest errors, then a closed seam, then shape conformance to the cropped
 * reference (§S1) when it is known, then a fill ratio nearest the band centre.
 *
 * Conformance sits below the technical terms deliberately — a candidate that matches your
 * silhouette but fails validation or leaves an open seam is still the worse pick — and it
 * outranks fill, which is a much weaker proxy for "is this the shape I asked for".
 */
export function candidateRank(stats: PartCandidateStats, slot: AnimalPartType, conformance?: number): number {
  if (!stats.hasArt) return Number.POSITIVE_INFINITY;
  const seamPenalty = slot === "body" ? 0 : stats.seamPixels !== null && stats.seamPixels >= 40 ? 0 : 1;
  const fillPenalty = Math.abs(stats.fillRatio - 0.8); // band centre from §5.2 (65-95%)
  const shapePenalty = conformance === undefined ? 0 : (1 - conformance) * 5;
  return stats.errorCount * 100 + seamPenalty * 10 + shapePenalty + fillPenalty;
}

/**
 * Pick the best-ranked sample per slot as the initial selection; humans override by eye.
 * `conformanceOf` is optional so callers without a reference crop keep today's ordering.
 */
export function defaultSelection(
  samples: GeneratedSample[],
  conformanceOf?: (slot: AnimalPartType, sampleIndex: number) => number | undefined
): SlotSelection {
  const firstWithArt = (slot: AnimalPartType) => samples.find((sample) => partCandidateStats(sample, slot).hasArt)?.index ?? samples[0]?.index ?? 0;
  const selection = {} as SlotSelection;
  for (const slot of PART_TYPES) {
    let bestIndex = firstWithArt(slot);
    let bestRank = Number.POSITIVE_INFINITY;
    for (const sample of samples) {
      const rank = candidateRank(partCandidateStats(sample, slot), slot, conformanceOf?.(slot, sample.index));
      if (rank < bestRank) { bestRank = rank; bestIndex = sample.index; }
    }
    selection[slot] = bestIndex;
  }
  return selection;
}

function sampleByIndex(samples: GeneratedSample[], index: number): GeneratedSample | undefined {
  return samples.find((sample) => sample.index === index);
}

export interface SampleProvenance {
  plan?: AnatomyStylePlan;
  models?: GenerationMetadata["models"];
  promptVersions?: GenerationMetadata["promptVersions"];
}

/** Model/prompt provenance for the composed animal, taken from the chosen body's sample. */
export function sampleProvenance(samples: GeneratedSample[], selection: SlotSelection): SampleProvenance {
  const body = sampleByIndex(samples, selection.body);
  return { plan: body?.plan, models: body?.models, promptVersions: body?.promptVersions };
}

/**
 * Assemble one final AnimalDraft from the per-slot winners. Identity and body anchors
 * come from the chosen body; each attached part's SVG, depth groups, ground contacts
 * and connection profile come from that slot's own source sample so the metadata keeps
 * pointing at group ids that actually exist in the SVG we kept.
 */
export function composeSelectedAnimal(samples: GeneratedSample[], selection: SlotSelection): AnimalDraft {
  const bySlot = {} as Record<AnimalPartType, AnimalDraft>;
  for (const slot of PART_TYPES) {
    const sample = sampleByIndex(samples, selection[slot]);
    const svg = sample?.animal?.[SVG_FIELD[slot]];
    if (!sample?.animal || typeof svg !== "string" || !svg.trim()) {
      throw new Error(`The sample selected for the ${slot} slot has no usable ${slot} art. Pick a different candidate.`);
    }
    bySlot[slot] = sample.animal;
  }
  return assembleFromPartDrafts(bySlot);
}

/**
 * Assemble one AnimalDraft from a per-slot map of source drafts. Identity and body anchors
 * come from the body source; each attached part's SVG, depth groups, ground contacts and
 * connection profile come from that slot's own source so the metadata keeps pointing at
 * group ids that exist in the SVG we kept. A cross-species hybrid (§5.4) is just this with
 * a different source per slot — every part shares the fixed local views and anchors, so the
 * assembly is valid by construction.
 */
export function assembleFromPartDrafts(bySlot: Record<AnimalPartType, AnimalDraft>): AnimalDraft {
  const heads = bySlot.head;
  const body = bySlot.body;
  const frontLegs = bySlot.frontLegs;
  const backLegs = bySlot.backLegs;
  const tail = bySlot.tail;

  const connectionFor = (slot: Exclude<AnimalPartType, "body">, source: AnimalDraft) =>
    source.layoutMetadata?.connections?.find((entry) => entry.part === slot);

  const layoutMetadata: GeneratedLayoutMetadata = {
    facing: body.layoutMetadata?.facing ?? "left",
    detailLevel: body.layoutMetadata?.detailLevel,
    groundY: body.layoutMetadata?.groundY ?? 0,
    connections: [
      connectionFor("head", heads),
      connectionFor("frontLegs", frontLegs),
      connectionFor("backLegs", backLegs),
      connectionFor("tail", tail),
    ].filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)),
    groundContacts: {
      frontLegs: frontLegs.layoutMetadata?.groundContacts?.frontLegs,
      backLegs: backLegs.layoutMetadata?.groundContacts?.backLegs,
    },
    depthGroups: {
      frontLegs: frontLegs.layoutMetadata?.depthGroups?.frontLegs,
      backLegs: backLegs.layoutMetadata?.depthGroups?.backLegs,
    },
  };

  return {
    name: body.name,
    color: body.color,
    accentColor: body.accentColor,
    description: body.description,
    bodyConnections: body.bodyConnections,
    headSvg: heads.headSvg,
    bodySvg: body.bodySvg,
    frontLegsSvg: frontLegs.frontLegsSvg,
    backLegsSvg: backLegs.backLegsSvg,
    tailSvg: tail.tailSvg,
    layoutMetadata,
  };
}
