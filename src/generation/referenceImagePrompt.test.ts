import test from "node:test";
import assert from "node:assert/strict";

import type { GuidedAnimalBrief } from "./contracts";
import { buildReferenceImagePrompt } from "./referenceImagePrompt";

const foxBrief: GuidedAnimalBrief = {
  animalName: "red fox",
  preset: "detailed-game-asset",
  sexOrVariant: "neutral",
  age: "adult",
  bodyBuild: "species-accurate",
  style: "semi-realistic game art",
  detailLevel: "high",
  pose: "natural standing side view",
  expression: "alert",
  mainColour: "russet-orange coat, white chest, black stockings",
  markings: "white blaze and tail tip",
  definingAnatomy: "large triangular ears, long bushy tail, narrow pointed muzzle",
  advancedInstructions: "continuous shoulder-to-paw silhouettes",
  summary: "A red fox in standing side view.",
  mode: "high-quality",
};

test("the look is flat vector, as if exported from SVG — never photographic", () => {
  const prompt = buildReferenceImagePrompt(foxBrief);
  assert.match(prompt, /flat vector game-asset illustration/i);
  assert.match(prompt, /solid-colour SVG shapes with crisp hard edges/i);
  assert.match(prompt, /no gradients, no texture, no fur strokes/i);
  assert.match(prompt, /no painterly or photorealistic rendering/i);
});

test("structure constraints: side profile, full body, one ground line, plain background", () => {
  const prompt = buildReferenceImagePrompt(foxBrief);
  assert.match(prompt, /left-facing side profile/);
  assert.match(prompt, /whole animal in frame/);
  assert.match(prompt, /one thin ground line/);
  assert.match(prompt, /plain solid light neutral background/);
});

test("species, exaggeration and palette blocks come from the brief", () => {
  const prompt = buildReferenceImagePrompt(foxBrief);
  assert.ok(prompt.includes("one red fox"));
  assert.match(prompt, /Over-exaggerate the defining features as bold readable shapes/);
  assert.ok(prompt.includes("large triangular ears, long bushy tail"));
  assert.ok(prompt.includes("main colours: russet-orange coat"));
  assert.ok(prompt.includes("markings: white blaze and tail tip"));
  assert.match(prompt, /clearly separated colour blocks/);
});

test("the tweak note overrides generic stance wording, and is dropped when blank", () => {
  const noted = buildReferenceImagePrompt(foxBrief, "slight head tilt");
  assert.match(noted, /overrides the generic stance above: slight head tilt\./);
  assert.equal(buildReferenceImagePrompt(foxBrief), buildReferenceImagePrompt(foxBrief, "   "));
  assert.doesNotMatch(buildReferenceImagePrompt(foxBrief), /Extra direction/);
});

test("empty optional brief fields leave no dangling clauses", () => {
  const sparse: GuidedAnimalBrief = {
    ...foxBrief,
    bodyBuild: "",
    pose: "",
    expression: "",
    definingAnatomy: "",
    mainColour: "",
    markings: "",
  };
  const prompt = buildReferenceImagePrompt(sparse);
  assert.doesNotMatch(prompt, /Anatomy and stance/);
  assert.doesNotMatch(prompt, /Over-exaggerate/);
  assert.doesNotMatch(prompt, /Limited palette/);
});

test("a missing animal name still produces a drawable prompt", () => {
  const prompt = buildReferenceImagePrompt({ ...foxBrief, animalName: "  " });
  assert.ok(prompt.includes("one animal"));
});
