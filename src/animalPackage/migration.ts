import type { Animal } from "../types";
import { ANIMAL_PACKAGE_FORMAT_VERSION, type AnimalPackageV1, type AnimalPartV1, type AnatomicalCategory, type PackageViewBox } from "./schema";
import { validateAnimalPackageV1 } from "./validation";

type LegacyAnimal = Omit<Animal, "parts"> & { parts: Record<string, any> };

const LEGACY_PARTS: Array<{ oldKey: string; category: AnatomicalCategory; layerOrder: number; socketKey?: "neck" | "frontLegs" | "backLegs" | "tail" }> = [
  { oldKey: "tail", category: "tail", layerOrder: 10, socketKey: "tail" },
  { oldKey: "backLegs", category: "hindlimbs", layerOrder: 20, socketKey: "backLegs" },
  { oldKey: "body", category: "body", layerOrder: 30 },
  { oldKey: "frontLegs", category: "forelimbs", layerOrder: 40, socketKey: "frontLegs" },
  { oldKey: "head", category: "head", layerOrder: 50, socketKey: "neck" },
];

function stableId(value: string) {
  const id = value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (!id) throw new Error("Legacy animal is missing a usable stable ID.");
  return id;
}

function parseViewBox(value: unknown): PackageViewBox {
  const numbers = typeof value === "string" ? value.trim().split(/[ ,]+/).map(Number) : [];
  if (numbers.length !== 4 || !numbers.every(Number.isFinite) || numbers[2] <= 0 || numbers[3] <= 0) throw new Error(`Invalid legacy viewBox '${String(value)}'.`);
  return { x: numbers[0], y: numbers[1], width: numbers[2], height: numbers[3] };
}

function localAnchor(part: any, category: AnatomicalCategory) {
  const point = category === "head" ? part.connections?.neck : part.connections?.body;
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new Error(`Legacy ${category} part is missing its local attachment anchor.`);
  return { x: point.x, y: point.y };
}

export function migrateLegacyAnimalToV1(animal: LegacyAnimal, now = new Date().toISOString(), options: { validate?: boolean } = {}): AnimalPackageV1 {
  const animalId = stableId(animal.id);
  const bodyPart = animal.parts?.body;
  if (!bodyPart) throw new Error(`Legacy animal '${animalId}' is missing body.`);
  const bodyId = `${animalId}-body`;

  const parts: AnimalPartV1[] = LEGACY_PARTS.map(({ oldKey, category, layerOrder, socketKey }) => {
    const legacyPart = animal.parts?.[oldKey];
    if (!legacyPart) throw new Error(`Legacy animal '${animalId}' is missing ${oldKey}.`);
    const id = `${animalId}-${category}`;
    const rootGroup = `${id}-root`;
    const svg = typeof legacyPart.rawContent === "string" ? legacyPart.rawContent.trim() : "";
    if (!svg) throw new Error(`Legacy animal '${animalId}' has no SVG for ${oldKey}.`);
    return {
      id,
      name: legacyPart.name || `${animal.name} ${category}`,
      category,
      viewBox: parseViewBox(legacyPart.viewBox),
      svg: `<g id="${rootGroup}">${svg}</g>`,
      namedGroups: [rootGroup],
      layerOrder,
      ...(socketKey ? { attachment: { socketId: `${animalId}-socket-${category}`, anchor: localAnchor(legacyPart, category) } } : {}),
    };
  });

  // The part IDs are based on anatomical category, so the migrated body ID is deterministic.
  if (!parts.some((part) => part.id === bodyId)) throw new Error("Could not create the migrated body root.");
  const socketEntries = [
    { key: "neck" as const, category: "head" as const, name: "Head" },
    { key: "frontLegs" as const, category: "forelimbs" as const, name: "Forelimbs" },
    { key: "backLegs" as const, category: "hindlimbs" as const, name: "Hindlimbs" },
    { key: "tail" as const, category: "tail" as const, name: "Tail" },
  ];
  const sockets = socketEntries.map(({ key, category, name }) => {
    const point = animal.bodyConnections?.[key];
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new Error(`Legacy animal '${animalId}' is missing body ${key} anchor.`);
    return { id: `${animalId}-socket-${category}`, name, ownerPartId: bodyId, category, accepts: [category], anchor: { x: point.x, y: point.y }, required: true };
  });
  const source = animalId === "bear" || animalId === "cheetah" ? "built-in" as const : "legacy-migration" as const;
  const migrated: AnimalPackageV1 = {
    formatVersion: ANIMAL_PACKAGE_FORMAT_VERSION,
    animalId,
    assetVersion: "1.0.0",
    name: animal.name,
    description: animal.description,
    palette: { primary: animal.color, accent: animal.accentColor },
    anatomyTemplateId: "quadruped",
    centralSkeleton: { rootPartId: bodyId, viewBox: parseViewBox(bodyPart.viewBox) },
    sockets,
    parts,
    ...(animal.rig ? {
      rig: {
        ...animal.rig,
        joints: animal.rig.joints.map((joint) => ({
          ...joint,
          partId: `${animalId}-${({ head: "head", body: "body", frontLegs: "forelimbs", backLegs: "hindlimbs", tail: "tail" } as Record<string, string>)[joint.partId] ?? joint.partId}`,
        })),
      },
    } : {}),
    metadata: { createdAt: now, updatedAt: now, source },
  };
  if (options.validate !== false) {
    const validation = validateAnimalPackageV1(migrated);
    if (!validation.valid) throw new Error(`Legacy migration failed for '${animalId}': ${validation.issues.map((issue) => issue.message).join("; ")}`);
  }
  return migrated;
}

export interface LegacyStorageMigrationResult {
  originalRaw: string | null;
  packages: AnimalPackageV1[];
  errors: Array<{ index: number; message: string }>;
  /** Only true when every old record converted; callers must retain old storage otherwise. */
  canCommit: boolean;
}

export function migrateLegacyStorageSnapshot(raw: string | null): LegacyStorageMigrationResult {
  if (raw === null) return { originalRaw: raw, packages: [], errors: [], canCommit: true };
  let records: unknown;
  try { records = JSON.parse(raw); }
  catch { return { originalRaw: raw, packages: [], errors: [{ index: -1, message: "Legacy custom-animal storage is not valid JSON." }], canCommit: false }; }
  if (!Array.isArray(records)) return { originalRaw: raw, packages: [], errors: [{ index: -1, message: "Legacy custom-animal storage must contain an array." }], canCommit: false };
  const packages: AnimalPackageV1[] = [];
  const errors: Array<{ index: number; message: string }> = [];
  records.forEach((record, index) => {
    try { packages.push(migrateLegacyAnimalToV1(record as LegacyAnimal)); }
    catch (error) { errors.push({ index, message: error instanceof Error ? error.message : String(error) }); }
  });
  return { originalRaw: raw, packages, errors, canCommit: errors.length === 0 };
}
