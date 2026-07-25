import type { GenerationPresetId, GuidedAnimalBrief } from "./contracts";

export const GENERATION_PRESETS: Array<{ id: GenerationPresetId; label: string; defaults: Partial<GuidedAnimalBrief> }> = [
  { id: "friendly-cartoon", label: "Friendly Cartoon", defaults: { sexOrVariant: "neutral", age: "adult", bodyBuild: "soft and balanced", style: "cartoon", detailLevel: "medium", pose: "relaxed side view", expression: "friendly" } },
  { id: "natural-semi-realistic", label: "Natural Semi-Realistic", defaults: { sexOrVariant: "neutral", age: "adult", bodyBuild: "species-accurate", style: "semi-realistic", detailLevel: "medium", pose: "natural standing side view", expression: "calm" } },
  { id: "detailed-game-asset", label: "Detailed Game Asset", defaults: { sexOrVariant: "neutral", age: "adult", bodyBuild: "athletic", style: "semi-realistic game art", detailLevel: "high", pose: "clear readable side view", expression: "alert" } },
  { id: "strong-combat-animal", label: "Strong Combat Animal", defaults: { sexOrVariant: "neutral", age: "adult", bodyBuild: "powerful and muscular", style: "fantasy game art", detailLevel: "high", pose: "grounded combat-ready side view", expression: "determined" } },
  { id: "young-and-cute", label: "Young and Cute", defaults: { sexOrVariant: "neutral", age: "young", bodyBuild: "small and round", style: "cartoon", detailLevel: "medium", pose: "playful standing side view", expression: "curious and cheerful" } },
];

export function createDefaultBrief(animalName = "", preset: GenerationPresetId = "friendly-cartoon"): GuidedAnimalBrief {
  const selected = GENERATION_PRESETS.find((item) => item.id === preset) ?? GENERATION_PRESETS[0];
  const brief: GuidedAnimalBrief = {
    animalName,
    preset,
    sexOrVariant: "neutral",
    age: "adult",
    bodyBuild: "soft and balanced",
    style: "cartoon",
    detailLevel: "medium",
    pose: "relaxed side view",
    expression: "friendly",
    mainColour: "natural species colours",
    markings: "recognizable species markings",
    definingAnatomy: "species-defining features",
    advancedInstructions: "",
    summary: "",
    mode: "high-quality",
    ...selected.defaults,
  };
  brief.summary = summarizeBrief(brief);
  return brief;
}

export function applyPreset(brief: GuidedAnimalBrief, preset: GenerationPresetId): GuidedAnimalBrief {
  const selected = GENERATION_PRESETS.find((item) => item.id === preset) ?? GENERATION_PRESETS[0];
  const next = { ...brief, preset, ...selected.defaults };
  return { ...next, summary: summarizeBrief(next) };
}

export function summarizeBrief(brief: Omit<GuidedAnimalBrief, "summary"> | GuidedAnimalBrief): string {
  const details = [
    `${brief.age} ${brief.sexOrVariant} ${brief.animalName || "animal"}`,
    `${brief.bodyBuild} build`,
    `${brief.style}, ${brief.detailLevel} detail`,
    `${brief.pose} with a ${brief.expression} expression`,
    `${brief.mainColour}; ${brief.markings}`,
    `defining anatomy: ${brief.definingAnatomy}`,
    brief.advancedInstructions ? `additional direction: ${brief.advancedInstructions}` : "",
  ].filter(Boolean);
  return details.join(". ") + ".";
}
