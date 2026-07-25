import assert from "node:assert/strict";
import test from "node:test";
import { OFFICIAL_ANIMAL_LIBRARY } from "./library";
import { createRecipe } from "./recipes";
import { parseSaveBundle, serializeSaveBundle } from "./recipes";
import { calculateCreatureBuild, runArenaBattle } from "./gameplay";

test("every selected part contributes visible gameplay statistics", () => {
  const recipe = createRecipe(OFFICIAL_ANIMAL_LIBRARY[0], OFFICIAL_ANIMAL_LIBRARY, "fighter", "2026-07-17T00:00:00.000Z");
  const result = calculateCreatureBuild(recipe, OFFICIAL_ANIMAL_LIBRARY);
  assert.equal(result.contributions.length, 5);
  assert.ok(result.contributions.every((item) => Object.values(item.stats).some((value) => value > 0)));
  assert.ok(result.stats.health > 0 && result.stats.power > 0);
  assert.equal(result.locomotion, "stride");
});

test("changing a part changes the final combat profile", () => {
  const bear = createRecipe(OFFICIAL_ANIMAL_LIBRARY[0], OFFICIAL_ANIMAL_LIBRARY, "bear", "2026-07-17T00:00:00.000Z");
  const mixed = structuredClone(bear);
  const cheetahLegs = OFFICIAL_ANIMAL_LIBRARY[1].parts.find((part) => part.category === "hindlimbs")!;
  mixed.parts.hindlimbs = { animalId: "sun-cheetah", assetVersion: "1.0.0", partId: cheetahLegs.id };
  const bearStats = calculateCreatureBuild(bear, OFFICIAL_ANIMAL_LIBRARY).stats;
  const mixedStats = calculateCreatureBuild(mixed, OFFICIAL_ANIMAL_LIBRARY).stats;
  assert.ok(mixedStats.speed > bearStats.speed);
  assert.ok(mixedStats.health < bearStats.health);
});

test("arena resolves a short session and always awards progress", () => {
  const recipe = createRecipe(OFFICIAL_ANIMAL_LIBRARY[6], OFFICIAL_ANIMAL_LIBRARY, "scorpion", "2026-07-17T00:00:00.000Z");
  const battle = runArenaBattle(calculateCreatureBuild(recipe, OFFICIAL_ANIMAL_LIBRARY), 0);
  assert.ok(battle.rounds >= 1 && battle.rounds <= 12);
  assert.ok(battle.reward > 0);
  assert.ok(battle.log.length >= battle.rounds);
});

test("manual backups include earned progression and unlocked sources", () => {
  const player = { id: "local-player" as const, geneCredits: 8, battles: 2, wins: 2, unlockedPackages: ["iron-bear@1.0.0", "sun-cheetah@1.0.0"] };
  const bundle = parseSaveBundle(serializeSaveBundle([], "2026-07-17T02:00:00.000Z", player));
  assert.deepEqual(bundle.player, player);
});
