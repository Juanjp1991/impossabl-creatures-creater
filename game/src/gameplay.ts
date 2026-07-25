import type { HybridRecipeV1 } from "../../src/animalPackage/hybrid";
import { allowedHybridCategories, packageKey } from "../../src/animalPackage/hybrid";
import type { AnatomicalCategory, AnimalPackageV1 } from "../../src/animalPackage/schema";

export interface CreatureStats { health: number; power: number; armor: number; speed: number }
export interface PartContribution { category: AnatomicalCategory; animalName: string; partName: string; stats: CreatureStats; traits: string[] }
export interface CreatureBuildResult { stats: CreatureStats; traits: string[]; locomotion: "flight" | "stride" | "slither" | "many-legged"; contributions: PartContribution[] }
export interface BattleResult { won: boolean; rounds: number; reward: number; opponent: string; remainingHealth: number; log: string[] }

const zeroStats = (): CreatureStats => ({ health: 0, power: 0, armor: 0, speed: 0 });

export function calculateCreatureBuild(recipe: HybridRecipeV1, library: AnimalPackageV1[]): CreatureBuildResult {
  const packages = new Map(library.map((pkg) => [packageKey(pkg), pkg]));
  const contributions = allowedHybridCategories(recipe.anatomyTemplateId).map((category): PartContribution => {
    const selected = recipe.parts[category]!;
    const source = packages.get(packageKey(selected))!;
    const part = source.parts.find((candidate) => candidate.id === selected.partId)!;
    const sourceStats = part.gameplay?.stats ?? {};
    const stats = { health: sourceStats.health ?? 0, power: sourceStats.power ?? 0, armor: sourceStats.armor ?? 0, speed: sourceStats.speed ?? 0 };
    return { category, animalName: source.name, partName: part.name, stats, traits: part.gameplay?.traits ?? [] };
  });
  const stats = contributions.reduce((total, item) => ({
    health: total.health + item.stats.health, power: total.power + item.stats.power,
    armor: total.armor + item.stats.armor, speed: total.speed + item.stats.speed,
  }), zeroStats());
  const traits = [...new Set(contributions.flatMap((item) => item.traits).filter((trait) => !allowedHybridCategories(recipe.anatomyTemplateId).includes(trait as AnatomicalCategory)))];
  const locomotion = recipe.anatomyTemplateId === "bird" ? "flight" : recipe.anatomyTemplateId === "serpentine" ? "slither" : recipe.anatomyTemplateId === "scorpion" ? "many-legged" : "stride";
  return { stats, traits, locomotion, contributions };
}

function damage(attacker: CreatureBuildResult, defender: CreatureStats, round: number) {
  let amount = Math.max(2, Math.round(attacker.stats.power * 0.72 + attacker.stats.speed * 0.08 - defender.armor * 0.34));
  if (attacker.traits.includes("serpent") && round % 3 === 0) amount += 5;
  if (attacker.traits.includes("swift") && round === 1) amount += 4;
  return amount;
}

export function runArenaBattle(build: CreatureBuildResult, difficulty: number): BattleResult {
  const opponent = difficulty < 3 ? "Scrap Sentinel" : difficulty < 7 ? "Chrome Mauler" : "Apex Warden";
  const enemy: CreatureStats = { health: 64 + difficulty * 8, power: 23 + difficulty * 2, armor: 17 + difficulty * 2, speed: 23 + difficulty };
  let playerHealth = build.stats.health;
  let enemyHealth = enemy.health;
  const log: string[] = [];
  let rounds = 0;
  const playerFirst = build.stats.speed >= enemy.speed;
  while (playerHealth > 0 && enemyHealth > 0 && rounds < 12) {
    rounds += 1;
    const playerHit = () => { const hit = damage(build, enemy, rounds); enemyHealth -= hit; log.push(`${build.locomotion} strike dealt ${hit}.`); };
    const enemyHit = () => { const hit = Math.max(2, Math.round(enemy.power * .72 + enemy.speed * .06 - build.stats.armor * .34)); playerHealth -= hit; log.push(`${opponent} dealt ${hit}.`); };
    if (playerFirst) { playerHit(); if (enemyHealth > 0) enemyHit(); }
    else { enemyHit(); if (playerHealth > 0) playerHit(); }
  }
  const won = enemyHealth <= 0 || (playerHealth > 0 && playerHealth >= enemyHealth);
  const reward = won ? 18 + Math.min(12, difficulty * 2) : 6;
  return { won, rounds, reward, opponent, remainingHealth: Math.max(0, playerHealth), log };
}
