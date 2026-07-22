import { allowedHybridCategories, HYBRID_RECIPE_FORMAT_VERSION, type HybridRecipeV1 } from "../../src/animalPackage/hybrid";
import type { AnimalPackageV1 } from "../../src/animalPackage/schema";

export const SAVE_BUNDLE_FORMAT_VERSION = "1.0.0" as const;

export interface CreatureSaveBundleV1 {
  formatVersion: typeof SAVE_BUNDLE_FORMAT_VERSION;
  exportedAt: string;
  recipes: HybridRecipeV1[];
  player?: {
    id: "local-player";
    geneCredits: number;
    battles: number;
    wins: number;
    unlockedPackages: string[];
  };
}

export function createRecipe(bodySource: AnimalPackageV1, library: AnimalPackageV1[], id: string, now = new Date().toISOString()): HybridRecipeV1 {
  const parts = Object.fromEntries(allowedHybridCategories(bodySource.anatomyTemplateId).map((category) => {
    const ownPart = bodySource.parts.find((part) => part.category === category)!;
    return [category, { animalId: bodySource.animalId, assetVersion: bodySource.assetVersion, partId: ownPart.id }];
  }));
  return {
    formatVersion: HYBRID_RECIPE_FORMAT_VERSION, id, name: `New ${bodySource.name} Hybrid`, anatomyTemplateId: bodySource.anatomyTemplateId,
    bodySource: { animalId: bodySource.animalId, assetVersion: bodySource.assetVersion }, parts,
    colours: { primary: bodySource.palette.primary, accent: bodySource.palette.accent }, adjustments: {}, createdAt: now, updatedAt: now,
  };
}

export function serializeSaveBundle(recipes: HybridRecipeV1[], exportedAt = new Date().toISOString(), player?: CreatureSaveBundleV1["player"]) {
  const bundle: CreatureSaveBundleV1 = { formatVersion: SAVE_BUNDLE_FORMAT_VERSION, exportedAt, recipes, ...(player ? { player } : {}) };
  return JSON.stringify(bundle, null, 2) + "\n";
}

export function parseSaveBundle(json: string): CreatureSaveBundleV1 {
  const value = JSON.parse(json) as Partial<CreatureSaveBundleV1>;
  if (value.formatVersion !== SAVE_BUNDLE_FORMAT_VERSION || !Array.isArray(value.recipes)) throw new Error("This is not a Creature Game save bundle.");
  if (value.player && (value.player.id !== "local-player" || !Number.isFinite(value.player.geneCredits) || !Array.isArray(value.player.unlockedPackages))) throw new Error("The player progression record is invalid.");
  return value as CreatureSaveBundleV1;
}
