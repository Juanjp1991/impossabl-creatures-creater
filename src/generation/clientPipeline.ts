import { PART_TYPES, type AnimalDraft, type GenerationAttemptRecord, type GenerationMetadata, type GuidedAnimalBrief, type ReferenceMode, type RepairStrategy, type ValidationResult, type VisualReviewReport } from "./contracts";
import type { AnimalPartType } from "../types";
import { buildAssembledPreviewSvg, buildIsolatedPartPreviewSvg, buildJointCropSvg, buildReviewCompositeSvg, renderSvgToPngDataUrl } from "./preview";
import { analyzeDraftGeometry } from "./geometry";
import { QUALITY_POLICIES, assessCandidate, buildRepairPhases, isReviewApproved, normalizeActionableReview, shouldUseFullRescue } from "./quality";

const REQUEST_TIMEOUTS: Record<string, number> = {
  "/api/populate-brief": 90_000,
  "/api/generate-animal": 270_000,
  "/api/review-animal": 135_000,
  "/api/repair-animal": 90_000,
  "/api/regenerate-animal": 270_000,
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
  const animalWide = validation.issues.some((issue) => issue.part === "animal" && issue.severity === "error");
  return PART_TYPES.filter((part) => animalWide || validation.issues.some((issue) => issue.part === part && issue.severity === "error"));
}

function visualIssueCluster(review: VisualReviewReport | undefined, policy: (typeof QUALITY_POLICIES)[GuidedAnimalBrief["mode"]]): AnimalPartType[] {
  const normalized = normalizeActionableReview(review, policy);
  if (!normalized) return [];
  const ranked = normalized.issues
    .filter((issue) => issue.severity !== "minor")
    .sort((first, second) => (second.severity === "critical" ? 2 : 1) - (first.severity === "critical" ? 2 : 1));
  const issue = ranked[0];
  if (!issue) return [];
  return PART_TYPES.filter((part) => issue.part === part || issue.part === "animal" || issue.affectedParts.includes(part));
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
  const policy = QUALITY_POLICIES[input.brief.mode];
  input.onStep?.("Creating structured anatomy and style plan...");
  const generated = await postJson("/api/generate-animal", input);
  let bestAnimal = generated.animal as AnimalDraft;
  let bestPlan = generated.plan;
  input.onDraft?.(bestAnimal);
  let bestValidation = generated.validation as ValidationResult;
  const validationHistory = [bestValidation];
  const reviewHistory: VisualReviewReport[] = [];
  const repairs: GenerationMetadata["repairs"] = [];
  const attemptHistory: GenerationAttemptRecord[] = [];
  let bestReview: VisualReviewReport | undefined;
  let bestPreviews: Awaited<ReturnType<typeof previewsFor>> | undefined;
  let bestAttempt = 0;
  let noProgress = 0;
  let rescueUsed = false;
  let stopReason: NonNullable<GenerationMetadata["stopReason"]> = "attempt-limit";

  const renderSafely = async (animal: AnimalDraft) => {
    try { return await previewsFor(animal); }
    catch { return undefined; }
  };
  const reviewCandidate = async (
    animal: AnimalDraft,
    plan: typeof bestPlan,
    validation: ValidationResult,
    previews: Awaited<ReturnType<typeof previewsFor>> | undefined,
    baseline?: Awaited<ReturnType<typeof previewsFor>>,
    previousReview?: VisualReviewReport,
  ) => {
    if (!previews) return undefined;
    try {
      const reviewed = await postJson("/api/review-animal", {
        animal, plan, validation, brief: input.brief, originalRequest: generated.originalRequest,
        image: input.image, referenceMode: input.referenceMode, ...previews,
        baselineCompositePreview: baseline?.reviewCompositePreview,
        previousReview,
      });
      const normalized = normalizeActionableReview(reviewed.review as VisualReviewReport, policy);
      if (normalized) reviewHistory.push(normalized);
      return normalized;
    } catch {
      return undefined;
    }
  };
  const repairPhase = async (
    animal: AnimalDraft,
    plan: typeof bestPlan,
    validation: ValidationResult,
    review: VisualReviewReport | undefined,
    previews: Awaited<ReturnType<typeof previewsFor>> | undefined,
    parts: AnimalPartType[],
    attempt: number,
    strategy: RepairStrategy,
  ) => {
    const jointCrops = Object.fromEntries(await Promise.all(parts.filter((part) => part !== "body").map(async (part) => {
      const key = part === "head" ? "neck" : part;
      try { return [part, await renderSvgToPngDataUrl(buildJointCropSvg(animal, key as "neck" | "tail" | "frontLegs" | "backLegs"), 440, 440)]; }
      catch { return [part, ""]; }
    })));
    const isolatedPreviews = Object.fromEntries(await Promise.all(parts.map(async (part) => {
      try { return [part, await renderSvgToPngDataUrl(buildIsolatedPartPreviewSvg(animal, part), 440, 440)]; }
      catch { return [part, ""]; }
    })));
    return postJson("/api/repair-animal", {
      currentAnimal: animal, plan, brief: input.brief, failingParts: parts, validation, review,
      image: input.image, referenceMode: input.referenceMode, strategy,
      cleanPreview: previews?.cleanPreview, diagnosticPreview: previews?.diagnosticPreview,
      geometry: analyzeDraftGeometry(animal), jointCrops, isolatedPreviews, round: attempt,
    });
  };

  input.onStep?.("Rendering and reviewing the initial candidate...");
  bestPreviews = await renderSafely(bestAnimal);
  bestReview = await reviewCandidate(bestAnimal, bestPlan, bestValidation, bestPreviews);
  if (bestValidation.valid && isReviewApproved(bestReview, policy)) stopReason = "approved";

  for (let attempt = 1; attempt <= policy.maxAttempts && stopReason !== "approved"; attempt++) {
    const technicalParts = technicalFailingParts(bestValidation);
    const visualParts = visualIssueCluster(bestReview, policy);
    const requestedParts = [...new Set([...technicalParts, ...visualParts])];
    if (!requestedParts.length) { stopReason = bestValidation.valid ? "no-actionable-issues" : "technical-failure"; break; }

    const useRescue = attempt === 1 && shouldUseFullRescue(bestReview, policy, rescueUsed);
    const strategy: RepairStrategy = useRescue ? "full-rescue" : !bestValidation.valid ? "technical" : requestedParts.length > 1 ? "cluster" : "part";
    input.onStep?.(`${useRescue ? "Regenerating one coherent rescue" : `Repairing ${requestedParts.join(", ")}`} (quality attempt ${attempt} of ${policy.maxAttempts})...`);

    let candidateAnimal = bestAnimal;
    let candidatePlan = bestPlan;
    let candidateValidation = bestValidation;
    let candidatePreviews = bestPreviews;
    const changedParts: AnimalPartType[] = [];
    const failedParts: AnimalPartType[] = [];
    let attemptError = "";

    try {
      if (useRescue) {
        rescueUsed = true;
        const rescued = await postJson("/api/regenerate-animal", {
          currentAnimal: bestAnimal, plan: bestPlan, brief: input.brief, validation: bestValidation, review: bestReview,
          image: input.image, referenceMode: input.referenceMode,
          cleanPreview: bestPreviews?.cleanPreview, diagnosticPreview: bestPreviews?.diagnosticPreview,
        });
        candidateAnimal = rescued.animal;
        candidatePlan = rescued.plan ?? bestPlan;
        candidateValidation = rescued.validation;
        changedParts.push(...(rescued.changedParts ?? PART_TYPES));
        failedParts.push(...(rescued.failedParts ?? []));
      } else {
        const phases = buildRepairPhases(requestedParts);
        for (const phaseParts of phases) {
          const phaseResult = await repairPhase(candidateAnimal, candidatePlan, candidateValidation, bestReview, candidatePreviews, phaseParts, attempt, strategy);
          candidateAnimal = phaseResult.animal;
          candidatePlan = phaseResult.plan ?? candidatePlan;
          candidateValidation = phaseResult.validation;
          changedParts.push(...(phaseResult.changedParts ?? []));
          failedParts.push(...(phaseResult.failedParts ?? []));
          if (phaseParts.includes("body")) candidatePreviews = await renderSafely(candidateAnimal);
        }
      }
    } catch (error: any) {
      attemptError = error?.message || "The quality attempt failed before producing a candidate.";
      failedParts.push(...requestedParts);
    }

    candidatePreviews = attemptError ? undefined : await renderSafely(candidateAnimal);
    input.onStep?.(`Reviewing quality attempt ${attempt} against the saved best...`);
    const candidateReview = attemptError ? undefined : await reviewCandidate(candidateAnimal, candidatePlan, candidateValidation, candidatePreviews, bestPreviews, bestReview);
    const assessment = attemptError
      ? { accepted: false, reason: `Rejected: ${attemptError}` }
      : assessCandidate(bestValidation, bestReview, candidateValidation, candidateReview, policy);
    const record: GenerationAttemptRecord = {
      attempt, strategy, requestedParts, changedParts: [...new Set(changedParts)], failedParts: [...new Set(failedParts)],
      validation: candidateValidation, review: candidateReview, accepted: assessment.accepted, reason: assessment.reason, scoreDelta: assessment.scoreDelta,
    };
    attemptHistory.push(record);
    validationHistory.push(candidateValidation);
    repairs.push({ round: attempt, requestedParts, changedParts: record.changedParts, validation: candidateValidation, review: candidateReview });

    if (assessment.accepted) {
      bestAnimal = candidateAnimal;
      bestPlan = candidatePlan;
      bestValidation = candidateValidation;
      bestReview = candidateReview ?? bestReview;
      bestPreviews = candidatePreviews ?? bestPreviews;
      bestAttempt = attempt;
      noProgress = 0;
      input.onDraft?.(bestAnimal);
      if (bestValidation.valid && isReviewApproved(bestReview, policy)) { stopReason = "approved"; break; }
    } else {
      noProgress++;
      input.onStep?.(`${assessment.reason} Keeping best attempt ${bestAttempt}.`);
      if (noProgress >= policy.maxNoProgress) { stopReason = "no-progress"; break; }
    }
  }

  if (!bestPreviews) {
    const fallback = unavailablePreview("Preview unavailable until technical errors are repaired");
    bestPreviews = { cleanSvg: fallback, diagnosticSvg: fallback, reviewCompositeSvg: fallback, cleanPreview: "", diagnosticPreview: "", reviewCompositePreview: "" };
  }
  if (!bestValidation.valid) stopReason = "technical-failure";
  const finalStatus = !bestValidation.valid ? "technical-failure" : isReviewApproved(bestReview, policy) ? "approved" : "warnings";
  const metadata: GenerationMetadata = {
    originalRequest: generated.originalRequest, brief: input.brief, plan: bestPlan, models: generated.models, promptVersions: generated.promptVersions,
    validationHistory, reviewHistory, repairs, automaticRepairLimit: policy.maxAttempts, completedRepairRounds: attemptHistory.length, attemptHistory, bestAttempt, stopReason, rescueUsed, finalStatus,
    createdAt: new Date().toISOString(),
    generatedLayout: bestAnimal.layoutMetadata,
    referenceMode: input.image ? input.referenceMode : undefined,
    metrics: { firstPassGeometrySuccess: validationHistory[0].valid && !validationHistory[0].issues.some((entry) => entry.code.startsWith("geometry.")), repairCount: attemptHistory.length, latencyMs: Date.now() - startedAt },
  };
  return { animal: bestAnimal, metadata, cleanSvg: bestPreviews.cleanSvg, diagnosticSvg: bestPreviews.diagnosticSvg };
}
