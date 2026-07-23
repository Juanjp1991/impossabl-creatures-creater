import assert from "node:assert/strict";
import test from "node:test";
import type { ReviewCategory, ValidationResult, VisualReviewIssue, VisualReviewReport } from "./contracts";
import {
  QUALITY_POLICIES,
  REVIEW_CATEGORIES,
  actionableParts,
  assessCandidate,
  buildRepairPhases,
  isReviewApproved,
  normalizeActionableReview,
  reviewIssuesForPart,
  shouldUseFullRescue,
} from "./quality";

const validation = (errors = 0, warnings = 0): ValidationResult => ({
  valid: errors === 0,
  checkedAt: new Date(0).toISOString(),
  validatorVersion: "test",
  issues: [
    ...Array.from({ length: errors }, (_, index) => ({ code: `error.${index}`, severity: "error" as const, part: "body" as const, message: "error" })),
    ...Array.from({ length: warnings }, (_, index) => ({ code: `warning.${index}`, severity: "warning" as const, part: "body" as const, message: "warning" })),
  ],
});

const scores = (value: number, overrides: Partial<Record<ReviewCategory, number>> = {}) => Object.fromEntries(
  REVIEW_CATEGORIES.map((category) => [category, overrides[category] ?? value]),
) as Record<ReviewCategory, number>;

const issue = (overrides: Partial<VisualReviewIssue> = {}): VisualReviewIssue => ({
  id: "issue-1",
  category: "overallSilhouette",
  part: "body",
  affectedParts: ["body"],
  severity: "major",
  description: "Silhouette is wrong.",
  suggestedCorrection: "Correct it.",
  regenerationRequired: false,
  ...overrides,
});

const review = (score = 8, issues: VisualReviewIssue[] = [], overrides: Partial<Record<ReviewCategory, number>> = {}): VisualReviewReport => ({
  scores: scores(score, overrides),
  issues,
  summary: "test review",
  approved: false,
});

test("quality modes use one versus four gated attempts and body repair is sequenced first", () => {
  assert.equal(QUALITY_POLICIES.draft.maxAttempts, 1);
  assert.equal(QUALITY_POLICIES["high-quality"].maxAttempts, 4);
  assert.deepEqual(buildRepairPhases(["frontLegs", "body", "tail"]), [["body"], ["frontLegs", "tail"]]);
  assert.deepEqual(buildRepairPhases(["head", "backLegs"]), [["head", "backLegs"]]);
});

test("major issues remain actionable when regenerationRequired is false and route to secondary affected parts", () => {
  const report = review(8, [issue({ part: "body", affectedParts: ["body", "backLegs"], regenerationRequired: false })]);
  assert.deepEqual(actionableParts(report, QUALITY_POLICIES["high-quality"]), ["body", "backLegs"]);
  assert.equal(reviewIssuesForPart(report, "backLegs").length, 1);
});

test("a below-threshold score synthesizes an actionable issue even when the reviewer omitted one", () => {
  const normalized = normalizeActionableReview(review(8, [], { featurePlacementAndDetail: 5 }), QUALITY_POLICIES["high-quality"])!;
  assert.ok(normalized.issues.some((entry) => entry.id === "score-featurePlacementAndDetail" && entry.severity === "major"));
  assert.equal(normalized.approved, false);
});

test("candidate gating accepts measurable improvement and rejects protected-score regression", () => {
  const best = review(7, [issue(), issue({ id: "issue-2", category: "jointContinuity", part: "frontLegs", affectedParts: ["frontLegs"] })]);
  const improved = review(8, []);
  assert.equal(assessCandidate(validation(), best, validation(), improved, QUALITY_POLICIES["high-quality"]).accepted, true);

  const regressed = review(8, [], { referenceFidelity: 5 });
  const strongBest = review(8, [issue({ severity: "major" })], { referenceFidelity: 8 });
  const result = assessCandidate(validation(), strongBest, validation(), regressed, QUALITY_POLICIES["high-quality"]);
  assert.equal(result.accepted, false);
  assert.match(result.reason, /protected/i);
});

test("technical validity outranks visual changes and a valid best can never be replaced by an invalid candidate", () => {
  assert.equal(assessCandidate(validation(3), undefined, validation(1), undefined, QUALITY_POLICIES.draft).accepted, true);
  assert.equal(assessCandidate(validation(), review(8), validation(1), review(9), QUALITY_POLICIES["high-quality"]).accepted, false);
});

test("high quality approves protected scores at eight and triggers one catastrophic rescue", () => {
  const seven = review(7, []);
  assert.equal(isReviewApproved(seven, QUALITY_POLICIES.draft), true);
  assert.equal(isReviewApproved(seven, QUALITY_POLICIES["high-quality"]), false);
  const catastrophic = review(8, [issue({ severity: "critical", affectedParts: ["head", "body", "frontLegs"] })], { referenceFidelity: 4 });
  assert.equal(shouldUseFullRescue(catastrophic, QUALITY_POLICIES["high-quality"], false), true);
  assert.equal(shouldUseFullRescue(catastrophic, QUALITY_POLICIES["high-quality"], true), false);
  assert.equal(shouldUseFullRescue(catastrophic, QUALITY_POLICIES.draft, false), false);
});
