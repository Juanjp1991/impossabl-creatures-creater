import type { AnimalPartType, BodyConnectionPoints } from "../types";

export const PART_TYPES: AnimalPartType[] = ["head", "body", "frontLegs", "backLegs", "tail"];

export type ReferenceMode = "match" | "inspire";

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
  blueprint?: AnimalLayoutBlueprint;
  referenceAnalysis?: {
    fidelityTarget: "close-match" | "inspiration" | "none";
    silhouette: string;
    pose: string;
    proportions: string;
    speciesCues: string[];
    palette: string;
    paletteSwatches?: string[];
    externalTail: "visible" | "absent" | "unclear";
    backgroundElementsToIgnore: string[];
    referenceFeatures?: ReferenceFeature[];
  };
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ReferenceFeature {
  id: string;
  part: AnimalPartType;
  kind: "contour" | "marking" | "facial" | "limb-joint" | "tail";
  description: string;
  normalizedBounds: Bounds;
  importance: "critical" | "major" | "detail";
  requiredGroupId: string;
}

export interface ExpectedLimbSet {
  expectedVisibleCount: number;
  groundedCount: number;
  raisedCount: number;
  toeDirection: "left";
}

export interface BlueprintConnectionProfile {
  part: Exclude<AnimalPartType, "body">;
  socketAnchor: { x: number; y: number };
  attachmentAnchor: { x: number; y: number };
  outwardNormal: { x: number; y: number };
  opposingNormal: { x: number; y: number };
  seamWidth: number;
  minimumOverlap: number;
  neutralConnectionDepth: number;
  allowedScale: { min: number; max: number };
}

export interface AnimalLayoutBlueprint {
  occupiedBounds: Record<AnimalPartType, Bounds>;
  assembledBounds?: Record<AnimalPartType | "animal", Bounds>;
  groundY: number;
  connections: BlueprintConnectionProfile[];
  limbPlan?: Partial<Record<"frontLegs" | "backLegs", ExpectedLimbSet>>;
  landmarks: {
    noseTip: { x: number; y: number };
    eye: { x: number; y: number };
    neckBase: { x: number; y: number };
    shoulder: { x: number; y: number };
    hip: { x: number; y: number };
    pawBottoms: Array<{ x: number; y: number; raised?: boolean }>;
    heels: Array<{ x: number; y: number }>;
    toeTips: Array<{ x: number; y: number }>;
  };
}

export interface GeneratedLayoutMetadata {
  facing: "left" | "right";
  groundY: number;
  connections: BlueprintConnectionProfile[];
  groundContacts: Partial<Record<"frontLegs" | "backLegs", Array<{ x: number; y: number; raised?: boolean }>>>;
  depthGroups: Partial<Record<"frontLegs" | "backLegs", { farGroupId: string; nearGroupId: string }>>;
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
  layoutMetadata?: GeneratedLayoutMetadata;
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
  | "referenceFidelity"
  | "speciesRecognizability"
  | "anatomicalPlausibility"
  | "overallSilhouette"
  | "proportionConsistency"
  | "jointContinuity"
  | "limbLayering"
  | "stylePaletteConsistency"
  | "groundAlignment"
  | "clippingOverlaps"
  | "mobileReadability"
  | "shapeAccuracy"
  | "featurePlacementAndDetail";

export interface VisualReviewIssue {
  id?: string;
  category: ReviewCategory;
  part: AnimalPartType | "animal";
  affectedParts: AnimalPartType[];
  severity: "minor" | "major" | "critical";
  description: string;
  suggestedCorrection: string;
  regenerationRequired: boolean;
}

export interface VisualReviewComparison {
  verdict: "better" | "same" | "worse";
  summary: string;
  resolvedIssueIds: string[];
  persistentIssueIds: string[];
  introducedIssueIds: string[];
}

export interface VisualReviewReport {
  scores: Record<ReviewCategory, number>;
  issues: VisualReviewIssue[];
  summary: string;
  approved: boolean;
  provisional?: boolean;
  comparison?: VisualReviewComparison;
}

export type RepairStrategy = "technical" | "part" | "cluster" | "full-rescue";

export interface GenerationAttemptRecord {
  attempt: number;
  strategy: RepairStrategy;
  requestedParts: AnimalPartType[];
  changedParts: AnimalPartType[];
  failedParts: AnimalPartType[];
  validation: ValidationResult;
  review?: VisualReviewReport;
  accepted: boolean;
  reason: string;
  scoreDelta?: number;
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
  attemptHistory?: GenerationAttemptRecord[];
  bestAttempt?: number;
  stopReason?: "approved" | "attempt-limit" | "no-progress" | "no-actionable-issues" | "technical-failure";
  rescueUsed?: boolean;
  finalStatus: "approved" | "warnings" | "technical-failure";
  createdAt: string;
  generatedLayout?: GeneratedLayoutMetadata;
  referenceMode?: ReferenceMode;
  forgedWithTechnicalWarnings?: boolean;
  metrics?: {
    firstPassGeometrySuccess: boolean;
    repairCount: number;
    latencyMs: number;
  };
  finalUserRating?: number;
}
