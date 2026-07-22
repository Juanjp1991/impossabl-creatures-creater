import assert from "node:assert/strict";
import test from "node:test";
import { ANIMALS } from "../animalsData";
import { migrateLegacyAnimalToV1, migrateLegacyStorageSnapshot } from "./migration";
import { ANIMAL_PACKAGE_FORMAT_VERSION, type AnatomicalCategory, type AnimalPackageV1, type AnatomyTemplateId } from "./schema";
import { ANATOMY_TEMPLATES } from "./templates";
import { assertPublishableAnimalPackageV1, validateAnimalPackageV1 } from "./validation";
import { animalPackageToLegacyEditorAnimal, compileLegacyAnimalPackage, parseAnimalPackageJson, serializeAnimalPackage, serializeAnimalPackageBundle } from "./compiler";
import { buildNeutralPackagePreview } from "./preview";

function packageFor(templateId: AnatomyTemplateId): AnimalPackageV1 {
  const template = ANATOMY_TEMPLATES[templateId];
  const animalId = `fixture-${templateId}`;
  const rootRule = template.parts.find((rule) => rule.category === template.rootCategory)!;
  const categories = template.parts.flatMap((rule) => Array.from({ length: rule.min }, () => rule.category));
  const rootIndex = categories.indexOf(rootRule.category);
  const orderedCategories = [categories[rootIndex], ...categories.filter((_, index) => index !== rootIndex)];
  const categoryId = (category: AnatomicalCategory) => category.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  const rootPartId = `${animalId}-${categoryId(template.rootCategory)}`;
  const sockets = template.sockets.flatMap((rule) => Array.from({ length: rule.min }, (_, index) => {
    const suffix = rule.min > 1 ? `-${index + 1}` : "";
    return {
      id: `${animalId}-socket-${categoryId(rule.category)}${suffix}`,
      name: rule.category,
      ownerPartId: rootPartId,
      category: rule.category,
      accepts: [rule.category],
      anchor: { x: 50 + index * 10, y: 50 },
      required: true,
    };
  }));
  const categoryUse = new Map<AnatomicalCategory, number>();
  const parts = orderedCategories.map((category, layerOrder) => {
    const use = (categoryUse.get(category) ?? 0) + 1;
    categoryUse.set(category, use);
    const suffix = use > 1 ? `-${use}` : "";
    const id = `${animalId}-${categoryId(category)}${suffix}`;
    const group = `${id}-root`;
    const socket = sockets.find((item) => item.category === category);
    return {
      id,
      name: category,
      category,
      viewBox: { x: 0, y: 0, width: 100, height: 100 },
      svg: `<g id="${group}"><path d="M 10 10 L 50 50 L 90 90" fill="primary"/></g>`,
      namedGroups: [group],
      layerOrder,
      ...(id !== rootPartId && socket ? { attachment: { socketId: socket.id, anchor: { x: 10, y: 10 } } } : {}),
    };
  });
  return {
    formatVersion: ANIMAL_PACKAGE_FORMAT_VERSION,
    animalId,
    assetVersion: "1.0.0",
    name: `${template.label} fixture`,
    description: `Minimal ${template.label} schema fixture.`,
    palette: { primary: "#445566", accent: "#aabbcc" },
    anatomyTemplateId: templateId,
    centralSkeleton: { rootPartId, viewBox: { x: 0, y: 0, width: 100, height: 100 } },
    sockets,
    parts,
    metadata: { createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", source: "imported" },
  };
}

test("built-in bear and cheetah migrate automatically to valid quadruped packages", () => {
  for (const animalId of ["bear", "cheetah"]) {
    const legacy = ANIMALS.find((animal) => animal.id === animalId);
    assert.ok(legacy, `${animalId} fixture should exist`);
    const migrated = migrateLegacyAnimalToV1(legacy, "2026-01-01T00:00:00.000Z");
    assert.equal(migrated.anatomyTemplateId, "quadruped");
    assert.deepEqual(migrated.parts.map((part) => part.category), ["tail", "hindlimbs", "body", "forelimbs", "head"]);
    assert.equal(validateAnimalPackageV1(migrated).valid, true);
  }
});

test("quadruped, bird, serpentine and scorpion packages are representable", () => {
  for (const templateId of ["quadruped", "bird", "serpentine", "scorpion"] as const) {
    const fixture = packageFor(templateId);
    assert.doesNotThrow(() => assertPublishableAnimalPackageV1(fixture), `${templateId} should validate`);
  }
  const snake = packageFor("serpentine");
  assert.deepEqual(snake.parts.map((part) => part.category), ["body", "head", "tail"]);
  assert.ok(!snake.parts.some((part) => ["legs", "forelimbs", "hindlimbs"].includes(part.category)));
});

test("strict sockets reject a wing placed in a forelimb socket", () => {
  const quadruped = packageFor("quadruped");
  const forelimbs = quadruped.parts.find((part) => part.category === "forelimbs")!;
  forelimbs.category = "wings";
  const result = validateAnimalPackageV1(quadruped);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.code === "attachment.category"));
  assert.throws(() => assertPublishableAnimalPackageV1(quadruped), /cannot be published/i);
});

test("legacy localStorage conversion preserves the old snapshot until every record succeeds", () => {
  const valid = JSON.parse(JSON.stringify(ANIMALS[0]));
  valid.id = "custom-good";
  const invalid = { ...valid, id: "custom-broken", parts: { ...valid.parts, tail: undefined } };
  const raw = JSON.stringify([valid, invalid]);
  const result = migrateLegacyStorageSnapshot(raw);
  assert.equal(result.originalRaw, raw);
  assert.equal(result.packages.length, 1);
  assert.equal(result.errors.length, 1);
  assert.equal(result.canCommit, false);
});

test("official package compilation is deterministic and namespaces every SVG ID", () => {
  const bear = ANIMALS.find((animal) => animal.id === "bear")!;
  const first = compileLegacyAnimalPackage(bear);
  const second = compileLegacyAnimalPackage(bear);
  assert.equal(serializeAnimalPackage(first), serializeAnimalPackage(second));
  const ids = first.parts.flatMap((part) => [...part.svg.matchAll(/\bid=["']([^"']+)["']/g)].map((match) => match[1]));
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every((id) => id.startsWith("bear-bear-")));
});

test("cross-part gradient IDs are independently namespaced", () => {
  const bear = ANIMALS.find((animal) => animal.id === "bear")!;
  const shared = `<defs><linearGradient id="shared-gradient"><stop offset="0%" stop-color="#ffffff"/></linearGradient></defs><path d="M 75 95 L 80 100" fill="url(#shared-gradient)"/>`;
  const colliding = {
    ...bear,
    id: "collision-test",
    parts: {
      ...bear.parts,
      head: { ...bear.parts.head, rawContent: bear.parts.head.rawContent + shared },
      body: { ...bear.parts.body, rawContent: bear.parts.body.rawContent + shared },
    },
  };
  const compiled = compileLegacyAnimalPackage(colliding);
  const matchingIds = compiled.parts.flatMap((part) => [...part.svg.matchAll(/id="([^"]*shared-gradient)"/g)].map((match) => match[1]));
  assert.equal(matchingIds.length, 2);
  assert.equal(new Set(matchingIds).size, 2);
  assert.equal(validateAnimalPackageV1(compiled).valid, true);
});

test("export and quadruped re-import preserve package geometry and attachment positions", () => {
  const original = compileLegacyAnimalPackage(ANIMALS.find((animal) => animal.id === "cheetah")!);
  const imported = animalPackageToLegacyEditorAnimal(original);
  const recompiled = compileLegacyAnimalPackage(imported);
  const paths = (preview: string) => [...preview.matchAll(/\bd=["']([^"']+)["']/g)].map((match) => match[1]);
  assert.deepEqual(paths(buildNeutralPackagePreview(recompiled)), paths(buildNeutralPackagePreview(original)));
  assert.deepEqual(imported.bodyConnections, {
    neck: original.sockets.find((socket) => socket.category === "head")!.anchor,
    frontLegs: original.sockets.find((socket) => socket.category === "forelimbs")!.anchor,
    backLegs: original.sockets.find((socket) => socket.category === "hindlimbs")!.anchor,
    tail: original.sockets.find((socket) => socket.category === "tail")!.anchor,
  });
});

test("invalid imports are rejected and official bundles serialize deterministically", () => {
  const bear = compileLegacyAnimalPackage(ANIMALS.find((animal) => animal.id === "bear")!);
  const invalid = JSON.parse(serializeAnimalPackage(bear));
  invalid.parts[0].category = "wings";
  const parsed = parseAnimalPackageJson(JSON.stringify(invalid));
  assert.equal(parsed.package, undefined);
  assert.ok(parsed.validation.issues.some((issue) => issue.code === "attachment.category"));
  const packages = ANIMALS.map((animal) => compileLegacyAnimalPackage(animal));
  assert.equal(serializeAnimalPackageBundle(packages), serializeAnimalPackageBundle(packages));
  assert.doesNotMatch(buildNeutralPackagePreview(bear), /<animate\b|motion/i);
});

test("optional generated layout metadata transfers into Package V1 profiles and semantic limb groups", () => {
  const bear = ANIMALS.find((animal) => animal.id === "bear")!;
  const frontFar = "frontLegs-far"; const frontNear = "frontLegs-near"; const backFar = "backLegs-far"; const backNear = "backLegs-near";
  const generated = {
    ...bear,
    id: "generated-profile-bear",
    parts: {
      ...bear.parts,
      frontLegs: { ...bear.parts.frontLegs, rawContent: `<g id="${frontFar}">${bear.parts.frontLegs.rawContent}</g><g id="${frontNear}"><circle cx="120" cy="175" r="3" fill="primary"/></g>` },
      backLegs: { ...bear.parts.backLegs, rawContent: `<g id="${backFar}">${bear.parts.backLegs.rawContent}</g><g id="${backNear}"><circle cx="220" cy="175" r="3" fill="primary"/></g>` },
    },
    generationMetadata: {
      createdAt: "2026-07-21T00:00:00.000Z",
      generatedLayout: {
        facing: "left", groundY: 325,
        connections: [
          { part: "head", socketAnchor: bear.bodyConnections.neck, attachmentAnchor: bear.parts.head.connections.neck, outwardNormal: { x: -1, y: 0 }, opposingNormal: { x: 1, y: 0 }, seamWidth: 30, minimumOverlap: 16, neutralConnectionDepth: 16, allowedScale: { min: .7, max: 1.3 } },
          { part: "frontLegs", socketAnchor: bear.bodyConnections.frontLegs, attachmentAnchor: bear.parts.frontLegs.connections.body, outwardNormal: { x: 0, y: 1 }, opposingNormal: { x: 0, y: -1 }, seamWidth: 30, minimumOverlap: 16, neutralConnectionDepth: 16, allowedScale: { min: .7, max: 1.3 } },
          { part: "backLegs", socketAnchor: bear.bodyConnections.backLegs, attachmentAnchor: bear.parts.backLegs.connections.body, outwardNormal: { x: 0, y: 1 }, opposingNormal: { x: 0, y: -1 }, seamWidth: 30, minimumOverlap: 16, neutralConnectionDepth: 16, allowedScale: { min: .7, max: 1.3 } },
          { part: "tail", socketAnchor: bear.bodyConnections.tail, attachmentAnchor: bear.parts.tail.connections.body, outwardNormal: { x: 1, y: 0 }, opposingNormal: { x: -1, y: 0 }, seamWidth: 30, minimumOverlap: 16, neutralConnectionDepth: 16, allowedScale: { min: .7, max: 1.3 } },
        ],
        groundContacts: { frontLegs: [{ x: 90, y: 175 }, { x: 120, y: 175 }], backLegs: [{ x: 190, y: 175 }, { x: 220, y: 175 }] },
        depthGroups: { frontLegs: { farGroupId: frontFar, nearGroupId: frontNear }, backLegs: { farGroupId: backFar, nearGroupId: backNear } },
      },
    } as any,
  };
  const compiled = compileLegacyAnimalPackage(generated);
  assert.deepEqual(compiled.compatibility, { facing: "left", groundY: 325 });
  assert.ok(compiled.sockets.every((socket) => socket.profile));
  assert.ok(compiled.parts.find((part) => part.category === "forelimbs")!.depthGroups?.farGroupId.includes("frontlegs-far"));
  assert.equal(validateAnimalPackageV1(compiled).valid, true);
});

test("strict profile validation rejects non-positive seam widths and reversed scale ranges", () => {
  const fixture = packageFor("quadruped");
  fixture.compatibility = { facing: "left", groundY: 100 };
  fixture.sockets[0].profile = { outwardNormal: { x: 1, y: 0 }, seamWidth: 0, minimumOverlap: 10, allowedScale: { min: 1.2, max: .8 } };
  const result = validateAnimalPackageV1(fixture);
  assert.ok(result.issues.some((issue) => issue.code === "socket.profile.width"));
  assert.ok(result.issues.some((issue) => issue.code === "socket.profile.scale.order"));
});
