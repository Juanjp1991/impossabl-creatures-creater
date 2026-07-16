import { PART_TYPES, type AnimalDraft, type GenerationMetadata, type GuidedAnimalBrief, type ValidationResult, type VisualReviewReport } from "./contracts";
import type { AnimalPartType } from "../types";
import { buildAssembledPreviewSvg, renderSvgToPngDataUrl } from "./preview";

async function postJson(path: string, body: unknown) {
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const text = await response.text();
  let data: any;
  try { data = JSON.parse(text); } catch { throw new Error(text.includes("<html") ? `Server error (${response.status}). Please try again.` : "Server returned invalid JSON."); }
  if (!response.ok) throw new Error(data.error || `Server returned error status ${response.status}`);
  return data;
}

function technicalFailingParts(validation: ValidationResult): AnimalPartType[] {
  return PART_TYPES.filter((part) => validation.issues.some((issue) => issue.severity === "error" && issue.part === part));
}

function visualFailingParts(review?: VisualReviewReport): AnimalPartType[] {
  if (!review) return [];
  return PART_TYPES.filter((part) => review.issues.some((issue) => issue.part === part && issue.regenerationRequired && issue.severity !== "minor"));
}

async function previewsFor(animal: AnimalDraft) {
  const cleanSvg = buildAssembledPreviewSvg(animal, false);
  const diagnosticSvg = buildAssembledPreviewSvg(animal, true);
  return { cleanSvg, diagnosticSvg, cleanPreview: await renderSvgToPngDataUrl(cleanSvg), diagnosticPreview: await renderSvgToPngDataUrl(diagnosticSvg) };
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

export async function runGenerationPipeline(input: { prompt: string; image: string | null; brief: GuidedAnimalBrief; onStep?: (step: string) => void; onDraft?: (animal: AnimalDraft) => void }): Promise<PipelineResult> {
  input.onStep?.("Creating structured anatomy and style plan...");
  const generated = await postJson("/api/generate-animal", input);
  let animal = generated.animal as AnimalDraft;
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
      const reviewed = await postJson("/api/review-animal", { animal, plan: generated.plan, brief: input.brief, originalRequest: generated.originalRequest, ...latestPreviews });
      latestReview = reviewed.review;
      reviewHistory.push(latestReview!);
      if (latestReview?.approved) break;
    }
    const requestedParts = [...new Set([...technicalFailingParts(validation), ...visualFailingParts(latestReview)])];
    if (!requestedParts.length || round === 2) break;
    const repairRound = round + 1;
    input.onStep?.(`Repairing ${requestedParts.join(", ")} (round ${repairRound} of 2)...`);
    if (!latestPreviews && validation.valid) latestPreviews = await previewsFor(animal);
    const repaired = await postJson("/api/repair-animal", {
      currentAnimal: animal, plan: generated.plan, brief: input.brief, failingParts: requestedParts, validation, review: latestReview,
      cleanPreview: latestPreviews?.cleanPreview, diagnosticPreview: latestPreviews?.diagnosticPreview, round: repairRound,
    });
    animal = repaired.animal;
    input.onDraft?.(animal);
    validation = repaired.validation;
    validationHistory.push(validation);
    repairs.push({ round: repairRound, requestedParts, changedParts: repaired.changedParts, validation });
    latestReview = undefined;
    latestPreviews = undefined;
  }

  if (!latestPreviews) {
    try { latestPreviews = await previewsFor(animal); }
    catch { const fallback = unavailablePreview("Preview unavailable until technical errors are repaired"); latestPreviews = { cleanSvg: fallback, diagnosticSvg: fallback, cleanPreview: "", diagnosticPreview: "" }; }
  }
  const finalStatus = !validation.valid ? "technical-failure" : latestReview?.approved ? "approved" : "warnings";
  const metadata: GenerationMetadata = {
    originalRequest: generated.originalRequest, brief: input.brief, plan: generated.plan, models: generated.models, promptVersions: generated.promptVersions,
    validationHistory, reviewHistory, repairs, automaticRepairLimit: 2, completedRepairRounds: repairs.length, finalStatus,
    createdAt: new Date().toISOString(),
  };
  return { animal, metadata, cleanSvg: latestPreviews.cleanSvg, diagnosticSvg: latestPreviews.diagnosticSvg };
}
