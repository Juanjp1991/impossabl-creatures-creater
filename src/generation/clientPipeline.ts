import { PART_TYPES, type AnimalDraft, type GenerationMetadata, type GuidedAnimalBrief, type ReferenceMode, type ValidationResult, type VisualReviewReport } from "./contracts";
import type { AnimalPartType } from "../types";
import { buildAssembledPreviewSvg, buildJointCropSvg, buildReviewCompositeSvg, renderSvgToPngDataUrl } from "./preview";
import { analyzeDraftGeometry } from "./geometry";

const REQUEST_TIMEOUTS: Record<string, number> = {
  "/api/populate-brief": 90_000,
  "/api/generate-animal": 270_000,
  "/api/review-animal": 135_000,
  "/api/repair-animal": 90_000,
};

async function postJson(path: string, body: unknown) {
  const controller = new AbortController();
  const timeoutMs = REQUEST_TIMEOUTS[path] ?? 135_000;
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: controller.signal });
    const text = await response.text();
    let data: any;
    try { data = JSON.parse(text); } catch { throw new Error(text.includes("<html") ? `Server error (${response.status}). Please try again.` : "Server returned invalid JSON."); }
    if (!response.ok) throw new Error(data.error || `Server returned error status ${response.status}`);
    return data;
  } catch (error: any) {
    if (error?.name === "AbortError") throw new Error(`The ${path.includes("repair") ? "SVG repair" : "AI request"} exceeded ${Math.round(timeoutMs / 1000)} seconds and was stopped. Your generated draft is still available; try the repair again or refine one part manually.`);
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

export function technicalFailingParts(validation: ValidationResult): AnimalPartType[] {
  return PART_TYPES.filter((part) => validation.issues.some((issue) => issue.part === part && issue.severity === "error"));
}

function visualFailingParts(review?: VisualReviewReport): AnimalPartType[] {
  if (!review) return [];
  return PART_TYPES.filter((part) => review.issues.some((issue) => (issue.part === part || issue.affectedParts?.includes(part)) && issue.regenerationRequired && issue.severity !== "minor"));
}

async function previewsFor(animal: AnimalDraft) {
  const cleanSvg = buildAssembledPreviewSvg(animal, false);
  const diagnosticSvg = buildAssembledPreviewSvg(animal, true);
  const reviewCompositeSvg = buildReviewCompositeSvg(animal);
  return { cleanSvg, diagnosticSvg, reviewCompositeSvg, cleanPreview: await renderSvgToPngDataUrl(cleanSvg), diagnosticPreview: await renderSvgToPngDataUrl(diagnosticSvg), reviewCompositePreview: await renderSvgToPngDataUrl(reviewCompositeSvg, 1200, 720) };
}

function unavailablePreview(message: string) {
  const safe = message.replace(/[&<>]/g, (value) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[value]!));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 500"><rect width="600" height="500" fill="#18181b"/><text x="300" y="250" fill="#fbbf24" text-anchor="middle" font-family="monospace" font-size="14">${safe}</text></svg>`;
}

export interface PipelineResult {
  animal: AnimalDraft;
  metadata: GenerationMetadata;
  cleanSvg: string;
  diagnosticSvg: string;
}

export async function populateGuidedBrief(input: { currentBrief: GuidedAnimalBrief; image: string | null; referenceMode: ReferenceMode }): Promise<GuidedAnimalBrief> {
  const result = await postJson("/api/populate-brief", input);
  return result.brief as GuidedAnimalBrief;
}

export async function runGenerationPipeline(input: { prompt: string; image: string | null; referenceMode: ReferenceMode; brief: GuidedAnimalBrief; onStep?: (step: string) => void; onDraft?: (animal: AnimalDraft) => void }): Promise<PipelineResult> {
  const startedAt = Date.now();
  input.onStep?.("Creating structured anatomy and style plan...");
  const generated = await postJson("/api/generate-animal", input);
  let animal = generated.animal as AnimalDraft;
  let plan = generated.plan;
  input.onDraft?.(animal);
  let validation = generated.validation as ValidationResult;
  const validationHistory = [validation];
  const reviewHistory: VisualReviewReport[] = [];
  const repairs: GenerationMetadata["repairs"] = [];
  let latestReview: VisualReviewReport | undefined;
  let latestPreviews: Awaited<ReturnType<typeof previewsFor>> | undefined;

  for (let round = 0; round <= 2; round++) {
    if (validation.valid) {
      input.onStep?.("Rendering clean and diagnostic previews...");
      latestPreviews = await previewsFor(animal);
      input.onStep?.("Running separate visual review...");
      const reviewed = await postJson("/api/review-animal", { animal, plan, brief: input.brief, originalRequest: generated.originalRequest, image: input.image, referenceMode: input.referenceMode, ...latestPreviews });
      latestReview = reviewed.review;
      reviewHistory.push(latestReview!);
      if (latestReview?.approved) break;
    }
    const requestedParts = [...new Set([...technicalFailingParts(validation), ...visualFailingParts(latestReview)])];
    if (!requestedParts.length || round === 2) break;
    const repairRound = round + 1;
    input.onStep?.(`Repairing ${requestedParts.join(", ")} (round ${repairRound} of 2)...`);
    // A technically invalid draft is still valuable visual context. Repairs need
    // the assembled silhouette, not only an isolated joint crop and error text.
    if (!latestPreviews) {
      try { latestPreviews = await previewsFor(animal); }
      catch { latestPreviews = undefined; }
    }
    const repaired = await postJson("/api/repair-animal", {
      currentAnimal: animal, plan, brief: input.brief, failingParts: requestedParts, validation, review: latestReview,
      image: input.image, referenceMode: input.referenceMode,
      cleanPreview: latestPreviews?.cleanPreview, diagnosticPreview: latestPreviews?.diagnosticPreview,
      geometry: analyzeDraftGeometry(animal),
      jointCrops: Object.fromEntries(await Promise.all(requestedParts.filter((part) => part !== "body").map(async (part) => {
        const key = part === "head" ? "neck" : part;
        return [part, await renderSvgToPngDataUrl(buildJointCropSvg(animal, key as "neck" | "tail" | "frontLegs" | "backLegs"), 440, 440)];
      }))),
      round: repairRound,
    });
    animal = repaired.animal;
    plan = repaired.plan ?? plan;
    input.onDraft?.(animal);
    validation = repaired.validation;
    validationHistory.push(validation);
    repairs.push({ round: repairRound, requestedParts, changedParts: repaired.changedParts, validation });
    latestReview = undefined;
    latestPreviews = undefined;
  }

  if (!latestPreviews) {
    try { latestPreviews = await previewsFor(animal); }
    catch { const fallback = unavailablePreview("Preview unavailable until technical errors are repaired"); latestPreviews = { cleanSvg: fallback, diagnosticSvg: fallback, reviewCompositeSvg: fallback, cleanPreview: "", diagnosticPreview: "", reviewCompositePreview: "" }; }
  }
  const finalStatus = !validation.valid ? "technical-failure" : latestReview?.approved ? "approved" : "warnings";
  const metadata: GenerationMetadata = {
    originalRequest: generated.originalRequest, brief: input.brief, plan, models: generated.models, promptVersions: generated.promptVersions,
    validationHistory, reviewHistory, repairs, automaticRepairLimit: 2, completedRepairRounds: repairs.length, finalStatus,
    createdAt: new Date().toISOString(),
    generatedLayout: animal.layoutMetadata,
    referenceMode: input.image ? input.referenceMode : undefined,
    metrics: { firstPassGeometrySuccess: validationHistory[0].valid && !validationHistory[0].issues.some((entry) => entry.code.startsWith("geometry.")), repairCount: repairs.length, latencyMs: Date.now() - startedAt },
  };
  return { animal, metadata, cleanSvg: latestPreviews.cleanSvg, diagnosticSvg: latestPreviews.diagnosticSvg };
}
