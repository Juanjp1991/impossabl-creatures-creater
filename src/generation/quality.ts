import type { AnimalPartType } from "../types";
import {
  PART_TYPES,
  type GuidedAnimalBrief,
  type ReviewCategory,
  type ValidationResult,
  type VisualReviewReport,
} from "./contracts";

export interface QualityPolicy {
  maxAttempts: number;
  maxNoProgress: number;
  generalThreshold: number;
  protectedThreshold: number;
  allowFullRescue: boolean;
  generationOutputTokens: number;
  repairOutputTokens: number;
}

export const QUALITY_POLICIES: Record<GuidedAnimalBrief["mode"], QualityPolicy> = {
  draft: {
    maxAttempts: 1,
    maxNoProgress: 1,
    generalThreshold: 7,
    protectedThreshold: 7,
    allowFullRescue: false,
    generationOutputTokens: 8192,
    repairOutputTokens: 6144,
  },
  "high-quality": {
    maxAttempts: 4,
    maxNoProgress: 2,
    generalThreshold: 7,
    protectedThreshold: 8,
    allowFullRescue: true,
    generationOutputTokens: 16384,
    repairOutputTokens: 8192,
  },
};

export const REVIEW_CATEGORIES: ReviewCategory[] = [
  "referenceFidelity",
  "speciesRecognizability",
  "anatomicalPlausibility",
  "overallSilhouette",
  "proportionConsistency",
  "jointContinuity",
  "limbLayering",
  "stylePaletteConsistency",
  "groundAlignment",
  "clippingOverlaps",
  "mobileReadability",
  "shapeAccuracy",
  "featurePlacementAndDetail",
];

export const PROTECTED_REVIEW_CATEGORIES: ReviewCategory[] = [
  "referenceFidelity",
  "speciesRecognizability",
  "anatomicalPlausibility",
  "overallSilhouette",
  "proportionConsistency",
  "jointContinuity",
  "shapeAccuracy",
  "featurePlacementAndDetail",
];

const CATEGORY_PARTS: Record<ReviewCategory, AnimalPartType[]> = {
  referenceFidelity: PART_TYPES,
  speciesRecognizability: ["head", "body", "frontLegs", "backLegs", "tail"],
  anatomicalPlausibility: PART_TYPES,
  overallSilhouette: PART_TYPES,
  proportionConsistency: PART_TYPES,
  jointContinuity: PART_TYPES,
  limbLayering: ["body", "frontLegs", "backLegs"],
  stylePaletteConsistency: PART_TYPES,
  groundAlignment: ["frontLegs", "backLegs"],
  clippingOverlaps: PART_TYPES,
  mobileReadability: PART_TYPES,
  shapeAccuracy: PART_TYPES,
  featurePlacementAndDetail: PART_TYPES,
};

const errorCount = (validation: ValidationResult) => validation.issues.filter((issue) => issue.severity === "error").length;
const warningCount = (validation: ValidationResult) => validation.issues.filter((issue) => issue.severity === "warning").length;

export function thresholdFor(category: ReviewCategory, policy: QualityPolicy): number {
  return PROTECTED_REVIEW_CATEGORIES.includes(category) ? policy.protectedThreshold : policy.generalThreshold;
}

export function normalizeActionableReview(review: VisualReviewReport | undefined, policy: QualityPolicy): VisualReviewReport | undefined {
  if (!review) return undefined;
  const issues = review.issues.map((issue, index) => ({
    ...issue,
    id: issue.id || `review-${index + 1}-${issue.category}`,
    affectedParts: [...new Set(issue.affectedParts?.length ? issue.affectedParts : issue.part !== "animal" ? [issue.part] : CATEGORY_PARTS[issue.category])]
      .filter((part): part is AnimalPartType => PART_TYPES.includes(part as AnimalPartType)),
  }));
  for (const category of REVIEW_CATEGORIES) {
    const score = Number(review.scores?.[category] ?? 1);
    if (score >= thresholdFor(category, policy)) continue;
    if (issues.some((issue) => issue.category === category && issue.severity !== "minor")) continue;
    issues.push({
      id: `score-${category}`,
      category,
      part: "animal",
      affectedParts: CATEGORY_PARTS[category],
      severity: "major",
      description: `${category} scored ${score}, below the required ${thresholdFor(category, policy)}.`,
      suggestedCorrection: `Improve ${category} while preserving already accepted geometry.`,
      regenerationRequired: category === "referenceFidelity" || category === "overallSilhouette" || category === "shapeAccuracy",
    });
  }
  const normalized: VisualReviewReport = { ...review, issues };
  normalized.approved = isReviewApproved(normalized, policy);
  return normalized;
}

export function isReviewApproved(review: VisualReviewReport | undefined, policy: QualityPolicy): boolean {
  if (!review) return false;
  if (review.issues.some((issue) => issue.severity === "major" || issue.severity === "critical")) return false;
  return REVIEW_CATEGORIES.every((category) => Number(review.scores?.[category] ?? 0) >= thresholdFor(category, policy));
}

export function actionableParts(review: VisualReviewReport | undefined, policy: QualityPolicy): AnimalPartType[] {
  const normalized = normalizeActionableReview(review, policy);
  if (!normalized) return [];
  return PART_TYPES.filter((part) => normalized.issues.some((issue) =>
    issue.severity !== "minor" && (issue.part === part || issue.part === "animal" || issue.affectedParts.includes(part)),
  ));
}

export function reviewIssuesForPart(review: VisualReviewReport | undefined, part: AnimalPartType) {
  return (review?.issues ?? []).filter((issue) => issue.part === part || issue.part === "animal" || issue.affectedParts?.includes(part));
}

export function buildRepairPhases(parts: AnimalPartType[]): AnimalPartType[][] {
  const unique = PART_TYPES.filter((part) => parts.includes(part));
  if (!unique.includes("body")) return unique.length ? [unique] : [];
  const attachments = unique.filter((part) => part !== "body");
  return [["body"], ...(attachments.length ? [attachments] : [])];
}

export function shouldUseFullRescue(review: VisualReviewReport | undefined, policy: QualityPolicy, rescueUsed: boolean): boolean {
  if (!review || rescueUsed || !policy.allowFullRescue) return false;
  const catastrophicScore = ["referenceFidelity", "speciesRecognizability", "overallSilhouette", "shapeAccuracy"]
    .some((category) => Number(review.scores?.[category as ReviewCategory] ?? 10) <= 4);
  const broadCritical = review.issues.some((issue) => issue.severity === "critical" && issue.affectedParts.length >= 3);
  return catastrophicScore || broadCritical;
}

export interface CandidateAssessment {
  accepted: boolean;
  reason: string;
  scoreDelta?: number;
}

function reviewMetrics(review: VisualReviewReport, policy: QualityPolicy) {
  const scores = REVIEW_CATEGORIES.map((category) => Number(review.scores?.[category] ?? 0));
  const protectedScores = PROTECTED_REVIEW_CATEGORIES.map((category) => Number(review.scores?.[category] ?? 0));
  return {
    critical: review.issues.filter((issue) => issue.severity === "critical").length,
    major: review.issues.filter((issue) => issue.severity === "major").length,
    below: REVIEW_CATEGORIES.filter((category) => Number(review.scores?.[category] ?? 0) < thresholdFor(category, policy)).length,
    protectedMin: Math.min(...protectedScores),
    mean: scores.reduce((sum, score) => sum + score, 0) / scores.length,
  };
}

function compareTuple(candidate: number[], best: number[]): number {
  for (let index = 0; index < candidate.length; index++) {
    if (candidate[index] < best[index]) return -1;
    if (candidate[index] > best[index]) return 1;
  }
  return 0;
}

export function assessCandidate(
  bestValidation: ValidationResult,
  bestReview: VisualReviewReport | undefined,
  candidateValidation: ValidationResult,
  candidateReview: VisualReviewReport | undefined,
  policy: QualityPolicy,
): CandidateAssessment {
  const bestErrors = errorCount(bestValidation);
  const candidateErrors = errorCount(candidateValidation);
  if (!bestErrors && candidateErrors) return { accepted: false, reason: "Rejected: candidate introduced blocking technical errors." };
  if (candidateErrors < bestErrors) return { accepted: true, reason: `Accepted: technical errors reduced from ${bestErrors} to ${candidateErrors}.` };
  if (candidateErrors > bestErrors) return { accepted: false, reason: `Rejected: technical errors increased from ${bestErrors} to ${candidateErrors}.` };
  if (candidateErrors) {
    const bestWarnings = warningCount(bestValidation);
    const candidateWarnings = warningCount(candidateValidation);
    return candidateWarnings < bestWarnings
      ? { accepted: true, reason: `Accepted: technical warnings reduced from ${bestWarnings} to ${candidateWarnings}.` }
      : { accepted: false, reason: "Rejected: no measurable technical improvement." };
  }
  if (!candidateReview) return { accepted: false, reason: "Rejected: a technically valid candidate had no visual review." };
  if (!bestReview) return { accepted: true, reason: "Accepted: first visually reviewed valid candidate." };
  const best = reviewMetrics(bestReview, policy);
  const candidate = reviewMetrics(candidateReview, policy);
  if (candidate.critical > best.critical) return { accepted: false, reason: "Rejected: candidate introduced a new critical visual issue." };
  const protectedRegression = PROTECTED_REVIEW_CATEGORIES.some((category) =>
    Number(candidateReview.scores?.[category] ?? 0) < Number(bestReview.scores?.[category] ?? 0) - 1,
  );
  if (protectedRegression) return { accepted: false, reason: "Rejected: a protected fidelity or anatomy score fell by more than one point." };
  const order = compareTuple(
    [candidate.critical, candidate.major, candidate.below, -candidate.protectedMin, -candidate.mean],
    [best.critical, best.major, best.below, -best.protectedMin, -best.mean],
  );
  const scoreDelta = Number((candidate.mean - best.mean).toFixed(2));
  return order < 0
    ? { accepted: true, reason: "Accepted: candidate improved the gated visual-quality tuple.", scoreDelta }
    : { accepted: false, reason: "Rejected: candidate did not improve the saved best result.", scoreDelta };
}
