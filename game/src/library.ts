import type { AnatomicalCategory, AnimalPackageV1, AnatomyTemplateId, PackagePoint } from "../../src/animalPackage/schema";
import { ANATOMY_TEMPLATES } from "../../src/animalPackage/templates";

interface AnimalSeed {
  id: string;
  name: string;
  template: AnatomyTemplateId;
  primary: string;
  accent: string;
  silhouette: "heavy" | "swift" | "avian" | "serpent" | "scorpion";
}

const BODY_SOCKETS: Record<AnatomyTemplateId, Partial<Record<AnatomicalCategory, PackagePoint>>> = {
  quadruped: { head: { x: 55, y: 100 }, forelimbs: { x: 105, y: 165 }, hindlimbs: { x: 215, y: 165 }, tail: { x: 270, y: 105 } },
  bird: { head: { x: 75, y: 90 }, wings: { x: 150, y: 115 }, legs: { x: 155, y: 170 }, tail: { x: 260, y: 115 } },
  serpentine: { head: { x: 48, y: 115 }, tail: { x: 272, y: 120 } },
  scorpion: { frontBody: { x: 62, y: 115 }, walkingLegs: { x: 155, y: 155 }, claws: { x: 58, y: 105 }, segmentedTail: { x: 258, y: 105 } },
};

const PART_ANCHORS: Partial<Record<AnatomicalCategory, PackagePoint>> = {
  head: { x: 215, y: 115 }, forelimbs: { x: 140, y: 42 }, hindlimbs: { x: 140, y: 42 }, tail: { x: 25, y: 108 },
  wings: { x: 150, y: 90 }, legs: { x: 150, y: 35 }, frontBody: { x: 235, y: 115 }, walkingLegs: { x: 150, y: 70 },
  claws: { x: 230, y: 112 }, segmentedTail: { x: 30, y: 118 },
};

function groupId(id: string, category: AnatomicalCategory) {
  return `${id}-${category.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
}

function bodySvg(id: string, template: AnatomyTemplateId, silhouette: AnimalSeed["silhouette"]) {
  const sockets = Object.values(BODY_SOCKETS[template]).filter(Boolean) as PackagePoint[];
  const markers = sockets.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="5" fill="primary"/>`).join("");
  const body = silhouette === "serpent"
    ? `<path d="M45 120 C85 45 135 190 180 105 C215 45 250 85 275 120" fill="none" stroke="primary" stroke-width="42" stroke-linecap="round"/>`
    : silhouette === "scorpion"
      ? `<ellipse cx="155" cy="120" rx="102" ry="54" fill="primary"/><path d="M90 102 L220 102 L245 120 L220 140 L90 140 Z" fill="accent" opacity="0.45"/>`
      : `<ellipse cx="155" cy="120" rx="${silhouette === "heavy" ? 118 : 105}" ry="${silhouette === "avian" ? 54 : 68}" fill="primary"/><ellipse cx="150" cy="106" rx="72" ry="32" fill="accent" opacity="0.3"/>`;
  return `<g id="${groupId(id, "body")}">${body}${markers}</g>`;
}

function partSvg(id: string, category: AnatomicalCategory, silhouette: AnimalSeed["silhouette"]) {
  const group = groupId(id, category);
  const anchor = PART_ANCHORS[category] ?? { x: 150, y: 110 };
  const marker = `<circle cx="${anchor.x}" cy="${anchor.y}" r="5" fill="primary"/>`;
  const art: Record<string, string> = {
    head: `<ellipse cx="130" cy="105" rx="86" ry="66" fill="primary"/><circle cx="105" cy="92" r="9" fill="accent"/><path d="M60 55 L82 22 L100 62 M162 60 L185 25 L195 75" fill="primary" stroke="accent" stroke-width="6" stroke-linejoin="round"/>`,
    forelimbs: `<g id="${group}-far"><path d="M175 40 C168 92 170 140 180 190 L215 190 L205 68 Z" fill="primary" stroke="accent" stroke-width="5" stroke-linejoin="round"/><circle cx="${anchor.x}" cy="${anchor.y}" r="5" fill="primary"/></g><g id="${group}-near"><path d="M90 35 C82 85 75 135 70 190 L105 190 L130 72 Z" fill="primary" stroke="accent" stroke-width="5" stroke-linejoin="round"/></g>`,
    hindlimbs: `<g id="${group}-far"><path d="M180 42 C165 96 175 150 190 190 L230 190 L210 72 Z" fill="primary" stroke="accent" stroke-width="5" stroke-linejoin="round"/><circle cx="${anchor.x}" cy="${anchor.y}" r="5" fill="primary"/></g><g id="${group}-near"><path d="M92 38 C75 90 60 135 68 190 L108 190 L140 76 Z" fill="primary" stroke="accent" stroke-width="5" stroke-linejoin="round"/></g>`,
    tail: silhouette === "heavy" ? `<path d="M25 108 C90 55 135 65 190 110 C220 134 250 112 270 85" fill="none" stroke="primary" stroke-width="28" stroke-linecap="round"/>` : `<path d="M25 108 C100 25 190 190 280 60" fill="none" stroke="primary" stroke-width="18" stroke-linecap="round"/>`,
    wings: `<path d="M150 90 C105 28 35 28 18 72 C65 70 72 115 32 155 C95 150 132 122 150 90 C180 30 258 32 282 72 C232 72 225 115 270 155 C205 150 168 120 150 90 Z" fill="primary" stroke="accent" stroke-width="6"/>`,
    legs: `<path d="M115 35 L102 155 L72 190 L120 188 L150 70 M185 35 L198 155 L228 190 L180 188 L150 70" fill="none" stroke="primary" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>`,
    frontBody: `<ellipse cx="150" cy="112" rx="88" ry="58" fill="primary"/><circle cx="105" cy="98" r="8" fill="accent"/><circle cx="135" cy="96" r="8" fill="accent"/>`,
    walkingLegs: `<path d="M145 70 L75 35 L25 58 M145 92 L62 90 L15 112 M150 112 L65 145 L28 180 M155 70 L225 35 L275 58 M155 92 L238 90 L285 112 M150 112 L235 145 L272 180" fill="none" stroke="primary" stroke-width="13" stroke-linecap="round"/>`,
    claws: `<path d="M230 112 L170 105 L120 55 M170 105 L110 145 M120 55 C72 25 35 52 52 90 C80 70 96 72 120 55 M110 145 C65 178 28 150 48 115 C72 138 88 135 110 145" fill="none" stroke="primary" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/>`,
    segmentedTail: `<path d="M30 118 C75 82 112 78 142 105 C172 132 166 75 195 55 C224 34 250 58 238 88" fill="none" stroke="primary" stroke-width="28" stroke-linecap="round" stroke-dasharray="26 7"/><path d="M238 88 L270 58 L280 106 Z" fill="accent"/>`,
  };
  const requiresNestedDepth = category === "forelimbs" || category === "hindlimbs";
  return `<g id="${group}">${art[category] ?? marker}${requiresNestedDepth ? "" : marker}</g>`;
}

const CATEGORY_STATS: Record<AnatomicalCategory, Record<string, number>> = {
  head: { health: 8, power: 7, armor: 2, speed: 2 }, body: { health: 38, power: 3, armor: 8, speed: 1 },
  forelimbs: { health: 12, power: 10, armor: 3, speed: 5 }, hindlimbs: { health: 14, power: 6, armor: 4, speed: 8 },
  tail: { health: 7, power: 8, armor: 1, speed: 4 }, wings: { health: 10, power: 7, armor: 2, speed: 15 },
  legs: { health: 12, power: 5, armor: 2, speed: 11 }, frontBody: { health: 18, power: 8, armor: 5, speed: 3 },
  walkingLegs: { health: 16, power: 5, armor: 5, speed: 10 }, claws: { health: 8, power: 17, armor: 3, speed: 3 },
  segmentedTail: { health: 10, power: 15, armor: 3, speed: 5 },
};

function gameplayFor(category: AnatomicalCategory, silhouette: AnimalSeed["silhouette"]) {
  const stats = { ...CATEGORY_STATS[category] };
  if (silhouette === "heavy") { stats.health += 7; stats.armor += 3; stats.speed = Math.max(1, stats.speed - 1); }
  if (silhouette === "swift") { stats.speed += 5; stats.power += 2; }
  if (silhouette === "avian") stats.speed += 3;
  // Serpentine bodies have only three slots, so each segment carries more of
  // the total build budget than a five-part quadruped or bird.
  if (silhouette === "serpent") { stats.health += 10; stats.power += 5; stats.armor += 3; stats.speed += 5; }
  if (silhouette === "scorpion") { stats.armor += 2; stats.power += 2; }
  return { stats, traits: [silhouette, category] };
}

function makePackage(seed: AnimalSeed): AnimalPackageV1 {
  const template = ANATOMY_TEMPLATES[seed.template];
  const rootId = `${seed.id}-body`;
  const parts = template.parts.map(({ category }, index) => {
    const token = category.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
    const id = `${seed.id}-${token}`;
    const isRoot = category === "body";
    const socketId = `${seed.id}-${token}-socket`;
    const isQuadrupedLimb = seed.template === "quadruped" && (category === "forelimbs" || category === "hindlimbs");
    const baseGroup = groupId(seed.id, category);
    const normal = category === "head" ? { x: 1, y: 0 } : category === "tail" ? { x: -1, y: 0 } : { x: 0, y: -1 };
    return {
      id,
      name: `${seed.name} ${category}`,
      category,
      viewBox: { x: 0, y: 0, width: 300, height: 220 },
      svg: isRoot ? bodySvg(seed.id, seed.template, seed.silhouette) : partSvg(seed.id, category, seed.silhouette),
      namedGroups: [baseGroup, ...(isQuadrupedLimb ? [`${baseGroup}-far`, `${baseGroup}-near`] : [])],
      layerOrder: category === "tail" || category === "segmentedTail" || category === "wings" ? 5 : isRoot ? 20 : 30 + index,
      gameplay: gameplayFor(category, seed.silhouette),
      ...(!isRoot ? { attachment: { socketId, anchor: PART_ANCHORS[category] ?? { x: 150, y: 110 }, ...(seed.template === "quadruped" ? { profile: { opposingNormal: normal, seamWidth: 36, neutralConnectionDepth: 16 } } : {}) }, pivot: PART_ANCHORS[category] } : {}),
      ...(isQuadrupedLimb ? {
        groundContacts: category === "forelimbs" ? [{ x: 88, y: 190 }, { x: 198, y: 190 }] : [{ x: 88, y: 190 }, { x: 210, y: 190 }],
        depthGroups: { farGroupId: `${baseGroup}-far`, nearGroupId: `${baseGroup}-near` },
      } : {}),
    };
  });
  const sockets = template.sockets.map(({ category }) => ({
    id: `${seed.id}-${category.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}-socket`, name: `${category} socket`, ownerPartId: rootId, category, accepts: [category],
    anchor: BODY_SOCKETS[seed.template][category]!, required: true,
    ...(seed.template === "quadruped" ? { profile: { outwardNormal: category === "head" ? { x: -1, y: 0 } : category === "tail" ? { x: 1, y: 0 } : { x: 0, y: 1 }, seamWidth: 36, minimumOverlap: 16, allowedScale: { min: .7, max: 1.3 } } } : {}),
  }));
  return {
    formatVersion: "1.0.0", animalId: seed.id, assetVersion: "1.0.0", name: seed.name,
    description: `Approved ${template.label.toLowerCase()} source animal for offline hybrid building.`,
    palette: { primary: seed.primary, accent: seed.accent }, anatomyTemplateId: seed.template,
    centralSkeleton: { rootPartId: rootId, viewBox: { x: 0, y: 0, width: 300, height: 220 } },
    ...(seed.template === "quadruped" ? { compatibility: { facing: "left" as const, groundY: 313 } } : {}),
    sockets, parts, gameplay: { traits: [seed.template, seed.silhouette] },
    metadata: { createdAt: "2026-07-17T00:00:00.000Z", updatedAt: "2026-07-17T00:00:00.000Z", creator: "Creature Platform", source: "built-in" },
  };
}

export const OFFICIAL_ANIMAL_LIBRARY: AnimalPackageV1[] = [
  { id: "iron-bear", name: "Iron Bear", template: "quadruped", primary: "#8b5e3c", accent: "#f2c078", silhouette: "heavy" },
  { id: "sun-cheetah", name: "Sun Cheetah", template: "quadruped", primary: "#d99a32", accent: "#332518", silhouette: "swift" },
  { id: "storm-eagle", name: "Storm Eagle", template: "bird", primary: "#526d82", accent: "#f2d16b", silhouette: "avian" },
  { id: "ember-owl", name: "Ember Owl", template: "bird", primary: "#875c44", accent: "#f3a847", silhouette: "avian" },
  { id: "jade-cobra", name: "Jade Cobra", template: "serpentine", primary: "#3f8f68", accent: "#f0d968", silhouette: "serpent" },
  { id: "dune-viper", name: "Dune Viper", template: "serpentine", primary: "#a17d45", accent: "#382d22", silhouette: "serpent" },
  { id: "night-scorpion", name: "Night Scorpion", template: "scorpion", primary: "#4f456d", accent: "#d85f76", silhouette: "scorpion" },
  { id: "gold-scorpion", name: "Gold Scorpion", template: "scorpion", primary: "#b67b2c", accent: "#5b301c", silhouette: "scorpion" },
].map((seed) => makePackage(seed as AnimalSeed));
