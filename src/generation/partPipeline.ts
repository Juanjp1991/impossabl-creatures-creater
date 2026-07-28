// §P1 orchestration: body first, then the four attached parts in parallel against it.
//
// Ordering is not arbitrary. The body owns `bodyConnections` and is where identity and
// palette are decided, so it must exist before anything is drawn to fit it. The three
// consistency mitigations from the plan all live here: the palette is fixed to concrete hexes
// after the body call, the chosen body SVG is passed as context to each attached call, and
// the shared house-style block is identical across all five (see `partPrompt.ts`).
//
// Post-processing is deliberately unchanged: the five parts are assembled and then handed to
// `/api/assemble-parts`, which runs the same normalise → snap → validate chain the
// single-call path uses.

import { postJson } from "./apiClient";
import { PART_TYPES, type AnimalDraft, type AnatomyStylePlan, type BlueprintConnectionProfile, type GeneratedLayoutMetadata, type GuidedAnimalBrief, type ReferenceMode, type ValidationResult } from "./contracts";
import { assembleFromPartDrafts } from "./sampleSelection";
import { namespaceSvgIds } from "../partBank/contracts";
import type { AnimalPartType } from "../types";

export interface PartCallResult {
  slot: AnimalPartType;
  svg: string;
  modelId?: string;
  color?: string;
  accentColor?: string;
  bodyConnections?: AnimalDraft["bodyConnections"];
  groundY?: number;
  connection?: BlueprintConnectionProfile;
  groundContacts?: Array<{ x: number; y: number; raised?: boolean }>;
  depthGroups?: { farGroupId: string; nearGroupId: string };
}

export interface PartPipelineInput {
  brief: GuidedAnimalBrief;
  generationMode?: "full" | "silhouette";
  /** Differentiates silhouette concepts without relying on temperature support. */
  conceptDirection?: string;
  image?: string | null;
  referenceMode?: ReferenceMode;
  /** Per-slot cropped references (§R3); the whole image is used where a slot has no crop. */
  imageForSlot?: (slot: AnimalPartType) => Promise<{ image: string | null; cropped: boolean }>;
  modelId?: string;
  /** §P2 hook: formatted exemplar block per slot. */
  exemplarsForSlot?: (slot: AnimalPartType) => string | undefined;
  onProgress?: (done: number, total: number, slot: AnimalPartType) => void;
}

export interface PartPipelineResult {
  animal: AnimalDraft;
  plan: AnatomyStylePlan;
  validation: ValidationResult;
  parts: PartCallResult[];
  failedSlots: AnimalPartType[];
}

const FIELD: Record<AnimalPartType, keyof AnimalDraft> = {
  head: "headSvg", body: "bodySvg", frontLegs: "frontLegsSvg", backLegs: "backLegsSvg", tail: "tailSvg",
};

const ATTACHED: Array<Exclude<AnimalPartType, "body">> = ["head", "frontLegs", "backLegs", "tail"];

const FALLBACK_PALETTE = { color: "#8B5A2B", accentColor: "#F5E6C8" };

/**
 * Ids the validator matches by name, which must survive namespacing verbatim.
 */
const contractIds = (slot: AnimalPartType): ReadonlySet<string> =>
  new Set([`${slot}-root`, `${slot}-far`, `${slot}-near`]);

/**
 * Prefix every non-contract id in a part with its slot.
 *
 * Five independent calls each see only their own output, so "every group ID is unique" is a
 * promise none of them can keep: a real run came back with the front-leg and back-leg calls
 * both using the same internal ids, which the assembled draft then failed on as
 * `svg.id.duplicate`. Fixing it in code rather than by asking the model more firmly.
 */
export function namespacePartSvg(svg: string, slot: AnimalPartType): string {
  if (!svg.trim()) return svg;
  return namespaceSvgIds(svg, slot, contractIds(slot)).svg;
}

async function callPart(input: PartPipelineInput, slot: AnimalPartType, extra: Record<string, unknown>): Promise<PartCallResult> {
  const reference = input.imageForSlot
    ? await input.imageForSlot(slot)
    : { image: input.image ?? null, cropped: false };
  const payload = await postJson("/api/generate-part", {
    slot,
    brief: input.brief,
    generationMode: input.generationMode,
    conceptDirection: input.conceptDirection,
    image: reference.image,
    referenceMode: input.referenceMode,
    referenceCropped: reference.cropped,
    modelId: input.modelId,
    exemplars: input.exemplarsForSlot?.(slot),
    ...extra,
  });
  return { ...(payload as PartCallResult), slot };
}

/**
 * Turn one part result into a slot-scoped draft, so `assembleFromPartDrafts` — which already
 * knows how to take one slot from each of several drafts — can do the merge unchanged.
 */
export function partDraft(
  slot: AnimalPartType,
  part: PartCallResult,
  base: {
    name: string;
    color: string;
    accentColor: string;
    description: string;
    bodyConnections: AnimalDraft["bodyConnections"];
    groundY: number;
    detailLevel?: GuidedAnimalBrief["detailLevel"];
    artworkStage?: GeneratedLayoutMetadata["artworkStage"];
  }
): AnimalDraft {
  const connections: BlueprintConnectionProfile[] = part.connection ? [{ ...part.connection, part: slot as Exclude<AnimalPartType, "body"> }] : [];
  const layoutMetadata: GeneratedLayoutMetadata = {
    facing: "left",
    detailLevel: base.detailLevel,
    artworkStage: base.artworkStage,
    groundY: base.groundY,
    connections,
    groundContacts: part.groundContacts && (slot === "frontLegs" || slot === "backLegs") ? { [slot]: part.groundContacts } : {},
    depthGroups: part.depthGroups && (slot === "frontLegs" || slot === "backLegs") ? { [slot]: part.depthGroups } : {},
  };
  return {
    name: base.name,
    color: base.color,
    accentColor: base.accentColor,
    description: base.description,
    bodyConnections: base.bodyConnections,
    headSvg: "", bodySvg: "", frontLegsSvg: "", backLegsSvg: "", tailSvg: "",
    [FIELD[slot]]: namespacePartSvg(part.svg, slot),
    layoutMetadata,
  } as AnimalDraft;
}

const DEFAULT_CONNECTIONS: AnimalDraft["bodyConnections"] = {
  neck: { x: 75, y: 90 }, tail: { x: 260, y: 105 }, frontLegs: { x: 115, y: 160 }, backLegs: { x: 235, y: 160 },
};

/**
 * Draw one animal as five focused calls. The body is drawn alone first; its palette and
 * connections then constrain the four attached parts, which run in parallel.
 *
 * A failed attached part leaves its slot empty rather than failing the animal — the same
 * contract the sample runner uses, so the caller can show what did come back.
 */
export async function runPartPipeline(input: PartPipelineInput): Promise<PartPipelineResult> {
  const total = PART_TYPES.length;
  let done = 0;
  const progress = (slot: AnimalPartType) => input.onProgress?.(++done, total, slot);

  const body = await callPart(input, "body", {});
  progress("body");

  const palette = {
    color: typeof body.color === "string" && body.color.startsWith("#") ? body.color : FALLBACK_PALETTE.color,
    accentColor: typeof body.accentColor === "string" && body.accentColor.startsWith("#") ? body.accentColor : FALLBACK_PALETTE.accentColor,
  };
  const base = {
    name: input.brief.animalName,
    ...palette,
    description: input.brief.summary || input.brief.animalName,
    bodyConnections: body.bodyConnections ?? DEFAULT_CONNECTIONS,
    groundY: Number.isFinite(body.groundY) ? Number(body.groundY) : 178,
    detailLevel: input.brief.detailLevel,
    artworkStage: input.generationMode === "silhouette" ? "silhouette" as const : undefined,
  };

  const attached = await Promise.all(ATTACHED.map(async (slot) => {
    try {
      const part = await callPart(input, slot, { palette, bodyContext: body.svg });
      progress(slot);
      return part;
    } catch (error) {
      progress(slot);
      console.warn(`The ${slot} call failed:`, error);
      return undefined;
    }
  }));

  const parts: PartCallResult[] = [body, ...attached.filter((part): part is PartCallResult => Boolean(part))];
  const failedSlots = ATTACHED.filter((slot) => !attached.some((part) => part?.slot === slot));

  const bySlot = Object.fromEntries(PART_TYPES.map((slot) => {
    const part = parts.find((entry) => entry.slot === slot);
    return [slot, partDraft(slot, part ?? { slot, svg: "" }, base)];
  })) as Record<AnimalPartType, AnimalDraft>;

  const assembled = assembleFromPartDrafts(bySlot);
  const finished = await postJson("/api/assemble-parts", {
    brief: input.brief,
    animal: assembled,
    generationMode: input.generationMode,
  });
  return {
    animal: finished.animal as AnimalDraft,
    plan: finished.plan as AnatomyStylePlan,
    validation: finished.validation as ValidationResult,
    parts,
    failedSlots,
  };
}
