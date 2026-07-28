import type { AnimalPartType } from "../types";
import { postJson } from "./apiClient";
import { PART_TYPES, type AnimalDraft, type GuidedAnimalBrief, type ReferenceMode, type ValidationResult } from "./contracts";
import { modelForSample, type GeneratedSample } from "./sampleSelection";
import { runPartPipeline } from "./partPipeline";
import {
  ENRICHMENT_STAGES,
  SILHOUETTE_DIRECTIONS,
  type EnrichmentStage,
} from "./silhouettePolicy";

export const DEFAULT_SILHOUETTE_COUNT = 4;
export const DEFAULT_SILHOUETTE_CONCURRENCY = 2;

const SVG_FIELD: Record<AnimalPartType, keyof AnimalDraft> = {
  head: "headSvg",
  body: "bodySvg",
  frontLegs: "frontLegsSvg",
  backLegs: "backLegsSvg",
  tail: "tailSvg",
};

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
export interface SilhouetteGenerationInput {
  brief: GuidedAnimalBrief;
  image?: string | null;
  referenceMode?: ReferenceMode;
  imageForSlot?: (slot: AnimalPartType) => Promise<{ image: string | null; cropped: boolean }>;
  modelId?: string;
  modelIds?: string[];
  count?: number;
  concurrency?: number;
  onProgress?: (done: number, total: number) => void;
}

export async function runSilhouetteGeneration(input: SilhouetteGenerationInput): Promise<GeneratedSample[]> {
  const total = Math.max(1, input.count ?? DEFAULT_SILHOUETTE_COUNT);
  let done = 0;
  const tasks = Array.from({ length: total }, (_unused, index) => async (): Promise<GeneratedSample> => {
    const modelId = modelForSample(index, input.modelIds, input.modelId);
    const direction = SILHOUETTE_DIRECTIONS[index % SILHOUETTE_DIRECTIONS.length];
    try {
      const result = await runPartPipeline({
        brief: input.brief,
        generationMode: "silhouette",
        conceptDirection: direction,
        image: input.image,
        referenceMode: input.referenceMode,
        imageForSlot: input.imageForSlot,
        modelId,
      });
      return {
        index,
        emphasis: direction,
        label: `silhouette ${index + 1}`,
        animal: result.animal,
        plan: result.plan,
        validation: result.validation,
        modelId,
        models: { planner: "silhouette", generator: modelId || "silhouette", reviewer: "human", repair: "staged" },
        promptVersions: { planner: "silhouette", generator: "silhouette-part-1.0.0", reviewer: "human-gate", repair: "additive-stage-1.0.0" },
      };
    } catch (error: any) {
      return { index, emphasis: direction, label: `silhouette ${index + 1}`, modelId, error: error?.message || "Silhouette generation failed." };
    } finally {
      input.onProgress?.(++done, total);
    }
  });
  return runWithConcurrency(tasks, input.concurrency ?? DEFAULT_SILHOUETTE_CONCURRENCY);
}

export interface EnrichmentInput {
  stage: EnrichmentStage;
  animal: AnimalDraft;
  brief: GuidedAnimalBrief;
  image?: string | null;
  referenceMode?: ReferenceMode;
  imageForSlot?: (slot: AnimalPartType) => Promise<{ image: string | null; cropped: boolean }>;
  modelId?: string;
  onProgress?: (done: number, total: number, slot: AnimalPartType) => void;
}

async function enrichSlot(input: EnrichmentInput, animal: AnimalDraft, slot: AnimalPartType): Promise<AnimalDraft> {
  const reference = input.imageForSlot
    ? await input.imageForSlot(slot)
    : { image: input.image ?? null, cropped: false };
  const result = await postJson("/api/enrich-silhouette-part", {
    stage: input.stage,
    slot,
    brief: input.brief,
    currentAnimal: animal,
    image: reference.image,
    referenceMode: input.referenceMode,
    referenceCropped: reference.cropped,
    modelId: input.modelId,
  });
  return result.animal as AnimalDraft;
}

/**
 * Enrich body first, then the attached parts against that accepted body stage.
 * A failed part rejects the whole preview; the caller keeps the last accepted checkpoint.
 */
export async function runSilhouetteEnrichment(input: EnrichmentInput): Promise<{ animal: AnimalDraft; validation: ValidationResult }> {
  if (!ENRICHMENT_STAGES.includes(input.stage)) throw new Error(`Unsupported silhouette enrichment stage: ${input.stage}`);
  let done = 0;
  const bodyResult = await enrichSlot(input, input.animal, "body");
  input.onProgress?.(++done, PART_TYPES.length, "body");

  const attached = PART_TYPES.filter((slot) => slot !== "body");
  const results = await Promise.all(attached.map(async (slot) => {
    const result = await enrichSlot(input, bodyResult, slot);
    input.onProgress?.(++done, PART_TYPES.length, slot);
    return { slot, result };
  }));

  const animal: AnimalDraft = {
    ...bodyResult,
    layoutMetadata: bodyResult.layoutMetadata
      ? { ...bodyResult.layoutMetadata, artworkStage: input.stage }
      : bodyResult.layoutMetadata,
  };
  for (const { slot, result } of results) {
    (animal as any)[SVG_FIELD[slot]] = result[SVG_FIELD[slot]];
  }
  const validation = (await postJson("/api/validate-animal", { animal })).validation as ValidationResult;
  return { animal, validation };
}
