import assert from "node:assert/strict";
import test from "node:test";
import { assessPartCompatibility, buildHybridSvg, resolveHybridRecipe, validateHybridRecipe } from "../../src/animalPackage/hybrid";
import { validateAnimalPackageV1 } from "../../src/animalPackage/validation";
import { OFFICIAL_ANIMAL_LIBRARY } from "./library";
import { createRecipe, parseSaveBundle, serializeSaveBundle } from "./recipes";

test("official library contains valid packages for all four anatomy templates", () => {
  assert.equal(OFFICIAL_ANIMAL_LIBRARY.length, 8);
  assert.deepEqual(new Set(OFFICIAL_ANIMAL_LIBRARY.map((pkg) => pkg.anatomyTemplateId)), new Set(["quadruped", "bird", "serpentine", "scorpion"]));
  for (const pkg of OFFICIAL_ANIMAL_LIBRARY) {
    const validation = validateAnimalPackageV1(pkg);
    assert.equal(validation.valid, true, `${pkg.animalId}: ${validation.issues.map((issue) => issue.message).join(", ")}`);
  }
});

test("body anatomy exposes only compatible categories", () => {
  const bird = OFFICIAL_ANIMAL_LIBRARY.find((pkg) => pkg.anatomyTemplateId === "bird")!;
  const recipe = createRecipe(bird, OFFICIAL_ANIMAL_LIBRARY, "test-bird", "2026-07-17T00:00:00.000Z");
  assert.deepEqual(Object.keys(recipe.parts), ["head", "body", "wings", "legs", "tail"]);
  assert.deepEqual(validateHybridRecipe(recipe, OFFICIAL_ANIMAL_LIBRARY), []);
  recipe.parts.claws = { animalId: "night-scorpion", assetVersion: "1.0.0", partId: "night-scorpion-claws" };
  assert.match(validateHybridRecipe(recipe, OFFICIAL_ANIMAL_LIBRARY).at(-1)!.message, /not valid for the bird body/);
});

test("hybrid renderer assembles package references without embedding artwork in recipe", () => {
  const bear = OFFICIAL_ANIMAL_LIBRARY[0];
  const recipe = createRecipe(bear, OFFICIAL_ANIMAL_LIBRARY, "test-hybrid", "2026-07-17T00:00:00.000Z");
  const cheetah = OFFICIAL_ANIMAL_LIBRARY[1];
  const head = cheetah.parts.find((part) => part.category === "head")!;
  recipe.parts.head = { animalId: cheetah.animalId, assetVersion: cheetah.assetVersion, partId: head.id };
  const svg = buildHybridSvg(recipe, OFFICIAL_ANIMAL_LIBRARY);
  assert.match(svg, new RegExp(`data-part-id="${head.id}"`));
  assert.doesNotMatch(JSON.stringify(recipe), /<(?:path|ellipse|circle)\b/);
});

test("compatibility reports exact, adjusted, legacy and incompatible cases", () => {
  const bear = OFFICIAL_ANIMAL_LIBRARY[0];
  const cheetah = OFFICIAL_ANIMAL_LIBRARY[1];
  const bearHead = bear.parts.find((part) => part.category === "head")!;
  const cheetahHead = cheetah.parts.find((part) => part.category === "head")!;
  assert.equal(assessPartCompatibility(bear, bear, bearHead).status, "exact");
  const narrowHead = structuredClone(cheetahHead);
  narrowHead.attachment!.profile!.seamWidth = 24;
  assert.equal(assessPartCompatibility(bear, cheetah, narrowHead).status, "adjusted");
  const legacy = structuredClone(cheetah);
  delete legacy.compatibility;
  assert.equal(assessPartCompatibility(bear, legacy, legacy.parts.find((part) => part.category === "head")!).status, "legacy");
  const opposite = structuredClone(cheetah);
  opposite.compatibility!.facing = "right";
  assert.equal(assessPartCompatibility(bear, opposite, opposite.parts.find((part) => part.category === "head")!).status, "incompatible");
});

test("body scaling carries socket targets and auto scale composes with manual scale", () => {
  const bear = OFFICIAL_ANIMAL_LIBRARY[0];
  const recipe = createRecipe(bear, OFFICIAL_ANIMAL_LIBRARY, "scaled-body", "2026-07-17T00:00:00.000Z");
  recipe.adjustments.body = { scale: 1.2, offsetX: 3, offsetY: -2, rotation: 0 };
  recipe.adjustments.head = { scale: .9, offsetX: 0, offsetY: 0, rotation: 0 };
  const resolved = resolveHybridRecipe(recipe, OFFICIAL_ANIMAL_LIBRARY);
  const head = resolved.find((item) => item.category === "head")!;
  assert.equal(head.target.x, 189);
  assert.match(buildHybridSvg(recipe, OFFICIAL_ANIMAL_LIBRARY), /data-category="head"[^>]*scale\(0\.9\)/);
});

test("semantic far and near limbs use canonical slots regardless of source layer numbers", () => {
  const library = structuredClone(OFFICIAL_ANIMAL_LIBRARY);
  const bear = library[0];
  bear.parts.find((part) => part.category === "forelimbs")!.layerOrder = -1000;
  bear.parts.find((part) => part.category === "hindlimbs")!.layerOrder = 1000;
  const recipe = createRecipe(bear, library, "depth-slots", "2026-07-17T00:00:00.000Z");
  const svg = buildHybridSvg(recipe, library);
  const bodyAt = svg.indexOf('data-category="body"');
  assert.ok(svg.indexOf('data-category="hindlimbs"', 0) < bodyAt);
  assert.ok(svg.indexOf('data-category="forelimbs"', 0) < bodyAt);
  assert.ok(svg.indexOf('data-depth="near"', bodyAt) > bodyAt);
  assert.ok(svg.lastIndexOf('data-depth="near"') < svg.indexOf('data-category="head"'));
});

test("manual save bundle round-trips compact recipes", () => {
  const recipe = createRecipe(OFFICIAL_ANIMAL_LIBRARY[6], OFFICIAL_ANIMAL_LIBRARY, "test-save", "2026-07-17T00:00:00.000Z");
  const serialized = serializeSaveBundle([recipe], "2026-07-17T01:00:00.000Z");
  assert.deepEqual(parseSaveBundle(serialized).recipes, [recipe]);
  assert.ok(serialized.length < 3000);
});
