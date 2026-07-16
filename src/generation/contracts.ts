import type { AnimalPartType, BodyConnectionPoints } from "../types";

export const PART_TYPES: AnimalPartType[] = ["head", "body", "frontLegs", "backLegs", "tail"];

export type GenerationPresetId =
  | "friendly-cartoon"
  | "natural-semi-realistic"
  | "detailed-game-asset"
  | "strong-combat-animal"
  | "young-and-cute";

export interface GuidedAnimalBrief {
  animalName: string;
  preset: GenerationPresetId;
  sexOrVariant: string;
  age: string;
  bodyBuild: string;
  style: string;
  detailLevel: string;
  pose: string;
  expression: string;
  mainColour: string;
  markings: string;
  definingAnatomy: string;
  advancedInstructions: string;
  summary: string;
  mode: "draft" | "high-quality";
}

export interface AnatomyStylePlan {
  speciesFeatures: string[];
  anatomyTemplate: "quadruped-five-part";
  requiredParts: AnimalPartType[];
  proportionsAndSilhouette: string;
  pose: string;
  orientation: "left-facing";
  paletteAndMarkings: string;
  layerPlan: Array<{ part: AnimalPartType; layer: "back" | "middle" | "front"; purpose: string }>;
  attachmentStrategy: Array<{ part: AnimalPartType; anchor: string; strategy: string }>;
  requiredNamedGroups: Record<AnimalPartType, string[]>;
  suggestedJoints: Array<{ part: AnimalPartType; name: string; x: number; y: number }>;
}

export interface AnimalDraft {
  name: string;
  color: string;
  accentColor: string;
  description: string;
  bodyConnections: BodyConnectionPoints;
  headSvg: string;
  bodySvg: string;
  frontLegsSvg: string;
  backLegsSvg: string;
  tailSvg: string;
}

export type ValidationSeverity = "error" | "warning";

export interface ValidationIssue {
  code: string;
  severity: ValidationSeverity;
  part: AnimalPartType | "animal";
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  checkedAt: string;
  validatorVersion: string;
  issues: ValidationIssue[];
}

export type ReviewCategory =
  | "speciesRecognizability"
  | "anatomicalPlausibility"
  | "overallSilhouette"
  | "proportionConsistency"
  | "jointContinuity"
  | "limbLayering"
  | "stylePaletteConsistency"
  | "groundAlignment"
  | "clippingOverlaps"
  | "mobileReadability";

export interface VisualReviewIssue {
  category: ReviewCategory;
  part: AnimalPartType | "animal";
  severity: "minor" | "major" | "critical";
  description: string;
  suggestedCorrection: string;
  regenerationRequired: boolean;
}

export interface VisualReviewReport {
  scores: Record<ReviewCategory, number>;
  issues: VisualReviewIssue[];
  summary: string;
  approved: boolean;
}

export interface RepairRecord {
  round: number;
  requestedParts: AnimalPartType[];
  changedParts: AnimalPartType[];
  validation: ValidationResult;
  review?: VisualReviewReport;
}

export interface GenerationMetadata {
  originalRequest: string;
  brief: GuidedAnimalBrief;
  plan: AnatomyStylePlan;
  models: { planner: string; generator: string; reviewer: string; repair: string };
  promptVersions: { planner: string; generator: string; reviewer: string; repair: string };
  validationHistory: ValidationResult[];
  reviewHistory: VisualReviewReport[];
  repairs: RepairRecord[];
  automaticRepairLimit: number;
  completedRepairRounds: number;
  finalStatus: "approved" | "warnings" | "technical-failure";
  createdAt: string;
  finalUserRating?: number;
}
