import type { Animal, AnimalPart, AnimalPartType } from "../types";
import { migrateLegacyAnimalToV1 } from "./migration";
import type { AnimalPackageV1, AnimalPartV1, AnatomicalCategory } from "./schema";
import { assertPublishableAnimalPackageV1, validateAnimalPackageV1, type PackageValidationResult } from "./validation";

const CATEGORY_TO_LEGACY: Record<"head" | "body" | "forelimbs" | "hindlimbs" | "tail", AnimalPartType> = {
  head: "head",
  body: "body",
  forelimbs: "frontLegs",
  hindlimbs: "backLegs",
  tail: "tail",
};

const LEGACY_TO_CATEGORY: Record<AnimalPartType, AnatomicalCategory> = {
  head: "head",
  body: "body",
  frontLegs: "forelimbs",
  backLegs: "hindlimbs",
  tail: "tail",
};

const MIGRATION_DATE = "1970-01-01T00:00:00.000Z";

function idToken(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function namespacePartSvg(part: AnimalPartV1, animalId: string, assetVersion: string): AnimalPartV1 {
  const prefix = `${idToken(animalId)}-${idToken(part.id)}-v${idToken(assetVersion)}`;
  const ids = [...part.svg.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1]);
  const mapping = new Map(ids.map((id) => [id, `${prefix}-${idToken(id)}`]));
  let svg = part.svg;
  for (const [oldId, newId] of mapping) {
    const escaped = oldId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    svg = svg
      .replace(new RegExp(`(\\bid\\s*=\\s*["'])${escaped}(["'])`, "g"), `$1${newId}$2`)
      .replace(new RegExp(`url\\(\\s*#${escaped}\\s*\\)`, "g"), `url(#${newId})`)
      .replace(new RegExp(`((?:href|xlink:href)\\s*=\\s*["'])#${escaped}(["'])`, "g"), `$1#${newId}$2`);
  }
  return {
    ...part,
    svg,
    namedGroups: part.namedGroups.map((group) => mapping.get(group) ?? group),
    ...(part.depthGroups ? { depthGroups: { farGroupId: mapping.get(part.depthGroups.farGroupId) ?? part.depthGroups.farGroupId, nearGroupId: mapping.get(part.depthGroups.nearGroupId) ?? part.depthGroups.nearGroupId } } : {}),
  };
}

export function namespaceAnimalPackageSvg(pkg: AnimalPackageV1): AnimalPackageV1 {
  const parts = pkg.parts.map((part) => namespacePartSvg(part, pkg.animalId, pkg.assetVersion));
  const partById = new Map(pkg.parts.map((part) => [part.id, part]));
  const rig = pkg.rig ? {
    ...pkg.rig,
    joints: pkg.rig.joints.map((joint) => {
      const part = partById.get(joint.partId);
      const prefix = part ? `${idToken(pkg.animalId)}-${idToken(part.id)}-v${idToken(pkg.assetVersion)}` : "";
      return { ...joint, targetGroupId: prefix ? `${prefix}-${idToken(joint.targetGroupId)}` : joint.targetGroupId };
    }),
  } : undefined;
  return { ...pkg, parts, ...(rig ? { rig } : {}) };
}

export function compileLegacyAnimalPackage(animal: Animal, assetVersion = "1.0.0"): AnimalPackageV1 {
  const createdAt = animal.generationMetadata?.createdAt ?? MIGRATION_DATE;
  // Legacy artwork can contain cross-part ID collisions. Namespace first, then
  // apply the strict publication validator to the compiled package.
  const migrated = migrateLegacyAnimalToV1(animal, createdAt, { validate: false });
  migrated.assetVersion = assetVersion;
  migrated.metadata.updatedAt = createdAt;
  const namespaced = namespaceAnimalPackageSvg(migrated);
  assertPublishableAnimalPackageV1(namespaced);
  return namespaced;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}

export function serializeAnimalPackage(pkg: AnimalPackageV1) {
  assertPublishableAnimalPackageV1(pkg);
  return JSON.stringify(canonical(pkg), null, 2) + "\n";
}

export function serializeAnimalPackageBundle(packages: AnimalPackageV1[]) {
  for (const pkg of packages) assertPublishableAnimalPackageV1(pkg);
  return JSON.stringify(canonical({ bundleFormatVersion: "1.0.0", packages }), null, 2) + "\n";
}

export function parseAnimalPackageJson(json: string): { package?: AnimalPackageV1; validation: PackageValidationResult } {
  let candidate: unknown;
  try { candidate = JSON.parse(json); }
  catch { return { validation: { valid: false, issues: [{ code: "json.parse", path: "$", message: "File is not valid JSON." }] } }; }
  const validation = validateAnimalPackageV1(candidate);
  return { ...(validation.valid ? { package: candidate as AnimalPackageV1 } : {}), validation };
}

function viewBoxString(part: AnimalPartV1) {
  const box = part.viewBox;
  return `${box.x} ${box.y} ${box.width} ${box.height}`;
}

/** Convert a V1 quadruped into the current editor shape until the dynamic editor lands. */
export function animalPackageToLegacyEditorAnimal(pkg: AnimalPackageV1): Animal {
  assertPublishableAnimalPackageV1(pkg);
  if (pkg.anatomyTemplateId !== "quadruped") throw new Error(`The current editor can store ${pkg.anatomyTemplateId} packages, but can only edit quadrupeds until the dynamic editor is implemented.`);
  const root = pkg.parts.find((part) => part.id === pkg.centralSkeleton.rootPartId)!;
  const importedId = `custom-${idToken(pkg.animalId)}-${idToken(pkg.assetVersion)}`;
  const socketFor = (category: AnatomicalCategory) => pkg.sockets.find((socket) => socket.category === category)!;
  const partFor = (category: AnatomicalCategory) => pkg.parts.find((part) => part.category === category)!;
  const makePart = (category: keyof typeof CATEGORY_TO_LEGACY): AnimalPart => {
    const source = partFor(category);
    const type = CATEGORY_TO_LEGACY[category];
    return {
      id: `${importedId}-${type}`,
      animalId: importedId,
      type,
      name: source.name,
      viewBox: viewBoxString(source),
      connections: source.attachment ? { [type === "head" ? "neck" : "body"]: source.attachment.anchor } : {},
      rawContent: source.svg,
      render: () => null,
    };
  };
  return {
    id: importedId,
    name: pkg.name,
    description: pkg.description,
    color: pkg.palette.primary,
    accentColor: pkg.palette.accent,
    bodyConnections: {
      neck: socketFor("head").anchor,
      frontLegs: socketFor("forelimbs").anchor,
      backLegs: socketFor("hindlimbs").anchor,
      tail: socketFor("tail").anchor,
    },
    parts: {
      head: makePart("head"),
      body: { ...makePart("body"), viewBox: viewBoxString(root) },
      frontLegs: makePart("forelimbs"),
      backLegs: makePart("hindlimbs"),
      tail: makePart("tail"),
    },
    ...(pkg.rig ? {
      rig: {
        ...pkg.rig,
        joints: pkg.rig.joints.map((joint) => {
          const packagePart = pkg.parts.find((part) => part.id === joint.partId);
          return { ...joint, partId: packagePart ? CATEGORY_TO_LEGACY[packagePart.category as keyof typeof CATEGORY_TO_LEGACY] : joint.partId };
        }),
      },
    } : {}),
  };
}

export function legacyPartTypeForCategory(category: AnatomicalCategory): AnimalPartType | undefined {
  return Object.entries(LEGACY_TO_CATEGORY).find(([, value]) => value === category)?.[0] as AnimalPartType | undefined;
}
