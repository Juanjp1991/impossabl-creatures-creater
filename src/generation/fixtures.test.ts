import assert from "node:assert/strict";
import test from "node:test";
import type { AnimalDraft, AnatomyStylePlan, GenerationMetadata } from "./contracts";
import { createDefaultBrief } from "./brief";
import { buildAssembledPreviewSvg, buildReviewCompositeSvg } from "./preview";
import { analyzeDraftGeometry } from "./geometry";
import { extractSvgBounds, normalizeAnimalDraftCoordinates, normalizeAnatomyPlanContract, normalizeGeneratedSvgSyntax } from "./normalize";
import { technicalFailingParts } from "./clientPipeline";
import { mergeTargetedModification, mergeTargetedRepair } from "./repair";
import { validateAnimalDraft } from "./validation";

const plan: AnatomyStylePlan = {
  speciesFeatures: ["broad muzzle", "cloven hooves"], anatomyTemplate: "quadruped-five-part", requiredParts: ["head", "body", "frontLegs", "backLegs", "tail"],
  proportionsAndSilhouette: "sturdy cow silhouette", pose: "standing", orientation: "left-facing", paletteAndMarkings: "brown and cream",
  layerPlan: [
    { part: "tail", layer: "back", purpose: "rear silhouette" }, { part: "backLegs", layer: "back", purpose: "far limbs" }, { part: "body", layer: "middle", purpose: "torso" },
    { part: "frontLegs", layer: "front", purpose: "near limbs" }, { part: "head", layer: "front", purpose: "recognizable face" },
  ],
  attachmentStrategy: [],
  requiredNamedGroups: { head: ["head-root"], body: ["body-root"], frontLegs: ["frontLegs-root"], backLegs: ["backLegs-root"], tail: ["tail-root"] },
  suggestedJoints: [],
};

const draft: AnimalDraft = {
  name: "Cow", color: "#8B5A2B", accentColor: "#F5E6C8", description: "A friendly cow.",
  bodyConnections: { neck: { x: 75, y: 90 }, tail: { x: 260, y: 105 }, frontLegs: { x: 115, y: 160 }, backLegs: { x: 235, y: 160 } },
  headSvg: `<g id="head-root"><path d="M120 110 L100 90 L80 80" fill="primary"/></g>`,
  bodySvg: `<g id="body-root"><path d="M75 90 L115 160 L235 160 L260 105 L75 90" fill="primary"/></g>`,
  frontLegsSvg: `<g id="frontLegs-root"><path d="M75 15 L70 100 L70 178 L90 178 L85 15" fill="primary"/></g>`,
  backLegsSvg: `<g id="backLegs-root"><path d="M195 15 L185 100 L185 178 L210 178 L205 15" fill="primary"/></g>`,
  tailSvg: `<g id="tail-root"><path d="M15 15 Q55 25 85 90" fill="accent"/></g>`,
};

const profile = (part: "head" | "frontLegs" | "backLegs" | "tail", socketAnchor: { x: number; y: number }, attachmentAnchor: { x: number; y: number }, outwardNormal: { x: number; y: number }) => ({
  part, socketAnchor, attachmentAnchor, outwardNormal, opposingNormal: { x: -outwardNormal.x, y: -outwardNormal.y }, seamWidth: 30, minimumOverlap: 16, neutralConnectionDepth: 16, allowedScale: { min: .7, max: 1.3 },
});

const modernPlan: AnatomyStylePlan = {
  ...plan,
  requiredNamedGroups: { ...plan.requiredNamedGroups, frontLegs: ["frontLegs-root", "frontLegs-far", "frontLegs-near"], backLegs: ["backLegs-root", "backLegs-far", "backLegs-near"] },
  blueprint: {
    occupiedBounds: {
      head: { x: 100, y: 90, width: 40, height: 40 }, body: { x: 60, y: 80, width: 210, height: 100 },
      frontLegs: { x: 65, y: 5, width: 80, height: 173 }, backLegs: { x: 155, y: 5, width: 80, height: 173 }, tail: { x: 0, y: 0, width: 45, height: 35 },
    },
    groundY: 323,
    connections: [
      profile("head", draft.bodyConnections.neck, { x: 120, y: 110 }, { x: -1, y: 0 }),
      profile("frontLegs", draft.bodyConnections.frontLegs, { x: 75, y: 15 }, { x: 0, y: 1 }),
      profile("backLegs", draft.bodyConnections.backLegs, { x: 195, y: 15 }, { x: 0, y: 1 }),
      profile("tail", draft.bodyConnections.tail, { x: 15, y: 15 }, { x: 1, y: 0 }),
    ],
    landmarks: {
      noseTip: { x: 28, y: 100 }, eye: { x: 65, y: 78 }, neckBase: { x: 120, y: 110 }, shoulder: { x: 115, y: 160 }, hip: { x: 235, y: 160 },
      pawBottoms: [{ x: 70, y: 178 }, { x: 120, y: 178 }, { x: 185, y: 178 }, { x: 225, y: 178 }],
      heels: [{ x: 82, y: 178 }, { x: 132, y: 178 }, { x: 197, y: 178 }, { x: 237, y: 178 }],
      toeTips: [{ x: 70, y: 178 }, { x: 120, y: 178 }, { x: 185, y: 178 }, { x: 225, y: 178 }],
    },
  },
};

const modernDraft: AnimalDraft = {
  ...draft,
  headSvg: `<g id="head-root"><rect x="100" y="90" width="40" height="40" fill="primary"/></g>`,
  bodySvg: `<g id="body-root"><rect x="60" y="80" width="210" height="100" fill="primary"/><circle cx="75" cy="90" r="3" fill="primary"/><circle cx="260" cy="105" r="3" fill="primary"/><circle cx="115" cy="160" r="3" fill="primary"/><circle cx="235" cy="160" r="3" fill="primary"/></g>`,
  frontLegsSvg: `<g id="frontLegs-root"><g id="frontLegs-far"><rect x="65" y="5" width="30" height="173" fill="primary"/></g><g id="frontLegs-near"><rect x="105" y="5" width="30" height="173" fill="primary"/></g></g>`,
  backLegsSvg: `<g id="backLegs-root"><g id="backLegs-far"><rect x="185" y="5" width="30" height="173" fill="primary"/></g><g id="backLegs-near"><rect x="225" y="5" width="30" height="173" fill="primary"/></g></g>`,
  tailSvg: `<g id="tail-root"><rect x="0" y="0" width="45" height="35" fill="accent"/></g>`,
  layoutMetadata: {
    facing: "left", groundY: 323, connections: modernPlan.blueprint!.connections,
    groundContacts: { frontLegs: [{ x: 80, y: 178 }, { x: 120, y: 178 }], backLegs: [{ x: 195, y: 178 }, { x: 235, y: 178 }] },
    depthGroups: { frontLegs: { farGroupId: "frontLegs-far", nearGroupId: "frontLegs-near" }, backLegs: { farGroupId: "backLegs-far", nearGroupId: "backLegs-near" } },
  },
};

test("guided cow brief expands useful defaults", () => {
  const brief = createDefaultBrief("cow");
  assert.equal(brief.animalName, "cow");
  assert.match(brief.summary, /cow/i);
  assert.equal(brief.style, "cartoon");
});

test("deterministic validation accepts schema, safe SVG, anchors and baseline", () => {
  const result = validateAnimalDraft(draft, plan);
  assert.equal(result.valid, true, result.issues.map((entry) => entry.message).join("\n"));
});

test("validator reports affected part for unsafe markup and missing anchor geometry", () => {
  const broken = { ...draft, headSvg: `<g id="head-root"><script>alert(1)</script><circle cx="5" cy="5" r="2" fill="primary"/></g>` };
  const result = validateAnimalDraft(broken, plan);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((entry) => entry.part === "head" && entry.code === "svg.tag"));
  assert.ok(result.issues.some((entry) => entry.part === "head" && entry.code === "anchor.geometry"));
});

test("assembled clean and diagnostic previews use the editor attachment contract", () => {
  const clean = buildAssembledPreviewSvg(draft);
  const diagnostic = buildAssembledPreviewSvg(draft, true);
  assert.match(clean, /id="preview-head" transform="translate\(105 130\)"/);
  assert.match(clean, /id="preview-tail" transform="translate\(395 240\)"/);
  assert.match(clean, /#8B5A2B/);
  assert.match(diagnostic, />neck<\/text>/);
  assert.match(diagnostic, /stroke="#00d4ff"/);
});

test("semantic limb depth groups straddle the body in canonical order", () => {
  const preview = buildAssembledPreviewSvg(modernDraft);
  const backFar = preview.indexOf('id="preview-backLegs-far"');
  const frontFar = preview.indexOf('id="preview-frontLegs-far"');
  const body = preview.indexOf('id="preview-body"');
  const backNear = preview.indexOf('id="preview-backLegs-near"');
  const frontNear = preview.indexOf('id="preview-frontLegs-near"');
  const head = preview.indexOf('id="preview-head"');
  assert.ok(backFar >= 0 && backFar < frontFar && frontFar < body);
  assert.ok(body < backNear && backNear < frontNear && frontNear < head);
  assert.match(preview.slice(backFar, frontFar), /id="backLegs-near"[^>]*display="none"/);
  assert.match(preview.slice(frontNear, head), /id="frontLegs-far"[^>]*display="none"/);
});

test("review silhouette has a white panel and excludes the clean-preview canvas", () => {
  const composite = buildReviewCompositeSvg(modernDraft);
  assert.doesNotMatch(composite, /filter:brightness/);
  assert.match(composite, /<rect x="620" y="40" width="560" height="320" fill="#fafafa"\/>/);
  const silhouettePanel = composite.match(/<svg x="620" y="40"[^>]*>([\s\S]*?)<\/svg>/)?.[1] ?? "";
  assert.doesNotMatch(silhouettePanel, /width="600" height="500" fill="#fafafa"/);
  assert.doesNotMatch(silhouettePanel, /data-derived-ground="true"/);
  assert.match(silhouettePanel, /fill="#09090b"/);
});

test("assembled preview resolves CSS-variable and inline-style palette placeholders", () => {
  const variants = {
    ...draft,
    bodySvg: `<g id="body-root"><path d="M75 90 L115 160 L235 160 L260 105 Z" fill="var(--primary)" stroke="var(--accent)"/></g>`,
    headSvg: `<g id="head-root"><path d="M120 110 L100 90 L80 80" style="fill: var(--primary); stroke: var(--accent)"/></g>`,
  };
  const preview = buildAssembledPreviewSvg(variants);
  assert.doesNotMatch(preview, /var\(\s*--(?:primary|accent)\s*\)/i);
  assert.match(preview, /fill="#8B5A2B"/);
  assert.match(preview, /stroke="#F5E6C8"/);
  assert.match(preview, /fill: #8B5A2B/);
  assert.match(preview, /stroke: #F5E6C8/);
});

test("targeted repair preserves every accepted part byte-for-byte", () => {
  const replacement = `<g id="head-root"><path d="M120 110 L90 60" fill="primary"/></g>`;
  const result = mergeTargetedRepair(draft, { headSvg: replacement, bodySvg: "must-not-be-used" }, ["head"]);
  assert.equal(result.animal.headSvg, replacement);
  assert.equal(result.animal.bodySvg, draft.bodySvg);
  assert.equal(result.animal.frontLegsSvg, draft.frontLegsSvg);
  assert.deepEqual(result.changedParts, ["head"]);
});

test("targeted back-leg modification cannot overwrite the tail or another accepted part", () => {
  const replacement = `<g id="backLegs-root"><path d="M195 15 L180 175 L220 175 Z" fill="primary"/></g>`;
  const result = mergeTargetedModification(draft, { backLegsSvg: replacement, tailSvg: `<g id="tail-root"></g>`, headSvg: "null" }, "backLegs");
  assert.equal(result.animal.backLegsSvg, replacement);
  assert.equal(result.animal.tailSvg, draft.tailSvg);
  assert.equal(result.animal.headSvg, draft.headSvg);
  assert.deepEqual(result.changedParts, ["backLegs"]);
});

test("targeted modification reports no change when Gemini omits the requested field", () => {
  const result = mergeTargetedModification(draft, { tailSvg: `<g id="tail-root"></g>` }, "backLegs");
  assert.deepEqual(result.animal, draft);
  assert.deepEqual(result.changedParts, []);
});

test("optional generation metadata remains JSON-storage compatible", () => {
  const brief = createDefaultBrief("cow");
  const metadata: GenerationMetadata = { originalRequest: "cow", brief, plan, models: { planner: "m", generator: "m", reviewer: "m", repair: "m" }, promptVersions: { planner: "1", generator: "1", reviewer: "1", repair: "1" }, validationHistory: [validateAnimalDraft(draft, plan)], reviewHistory: [], repairs: [], automaticRepairLimit: 2, completedRepairRounds: 0, finalStatus: "warnings", createdAt: new Date(0).toISOString() };
  assert.deepEqual(JSON.parse(JSON.stringify(metadata)), metadata);
});

test("mask geometry accepts connected seams and derives the real foot baseline", () => {
  const geometry = analyzeDraftGeometry(modernDraft);
  assert.equal(geometry.groundY, 473);
  assert.ok(geometry.seams.every((seam) => seam.jointZoneOverlapPixels >= 40), JSON.stringify(geometry.seams));
  assert.equal(validateAnimalDraft(modernDraft, modernPlan).valid, true, validateAnimalDraft(modernDraft, modernPlan).issues.map((entry) => entry.message).join("\n"));
  assert.match(buildAssembledPreviewSvg(modernDraft), /y1="473"[^>]*data-derived-ground="true"/);
});

test("geometry fixtures identify visible gaps, floating feet and excessive intended overlap", () => {
  const gap = { ...modernDraft, headSvg: `<g id="head-root"><rect x="20" y="20" width="30" height="30" fill="primary"/></g>` };
  assert.ok(validateAnimalDraft(gap, modernPlan).issues.some((entry) => entry.code === "geometry.seam.gap" && entry.part === "head"));
  const floating = structuredClone(modernDraft);
  floating.layoutMetadata!.groundContacts.frontLegs = [{ x: 80, y: 145 }, { x: 120, y: 145 }];
  assert.ok(validateAnimalDraft(floating, modernPlan).issues.some((entry) => entry.code === "geometry.ground.mismatch"));
  const overlap = { ...modernDraft, headSvg: `<g id="head-root"><rect x="80" y="60" width="100" height="100" fill="primary"/></g>` };
  assert.ok(validateAnimalDraft(overlap, modernPlan).issues.some((entry) => entry.code === "geometry.seam.excessive-overlap" && entry.part === "head"));
});

test("tailless species accept a compact hidden seam-cap and reject a protruding tail", () => {
  const frogPlan = structuredClone(modernPlan);
  frogPlan.referenceAnalysis = {
    fidelityTarget: "close-match", silhouette: "low crouched frog", pose: "folded limbs", proportions: "large folded hind legs",
    speciesCues: ["long toes", "tailless adult"], palette: "green", externalTail: "absent", backgroundElementsToIgnore: ["watermark"],
  };
  const compact = validateAnimalDraft(modernDraft, frogPlan);
  assert.ok(!compact.issues.some((entry) => entry.code === "reference.tail.protruding"), compact.issues.map((entry) => entry.message).join("\n"));
  assert.ok(!compact.issues.some((entry) => entry.code === "geometry.seam.excessive-overlap" && entry.part === "tail"));
  const protruding = { ...modernDraft, tailSvg: `<g id="tail-root"><rect x="0" y="0" width="100" height="80" fill="primary"/></g>` };
  const result = validateAnimalDraft(protruding, frogPlan);
  assert.ok(result.issues.some((entry) => entry.code === "reference.tail.protruding" && entry.part === "tail"));
});

test("malformed left-facing blueprint relationships produce part-specific repair issues", () => {
  const malformed = structuredClone(modernPlan);
  malformed.blueprint!.landmarks.noseTip.x = 100;
  malformed.blueprint!.connections.find((entry) => entry.part === "frontLegs")!.opposingNormal = { x: 0, y: 1 };
  const result = validateAnimalDraft(modernDraft, malformed);
  assert.ok(result.issues.some((entry) => entry.code === "blueprint.facing.head" && entry.part === "head"));
  assert.ok(result.issues.some((entry) => entry.code === "blueprint.connection.normal" && entry.part === "frontLegs"));
});

test("cow, horse, crocodile, elephant and rabbit blueprints keep distinct valid proportions", () => {
  const variants = [
    ["cow", { head: [100, 90, 40, 40], body: [60, 80, 210, 100] }],
    ["horse", { head: [92, 62, 48, 76], body: [55, 72, 225, 92] }],
    ["crocodile", { head: [72, 104, 68, 30], body: [45, 108, 245, 58] }],
    ["elephant", { head: [70, 55, 80, 100], body: [50, 65, 235, 120] }],
    ["rabbit", { head: [100, 42, 38, 96], body: [82, 96, 168, 78] }],
  ] as const;
  const silhouettes = new Set<string>();
  for (const [species, dimensions] of variants) {
    const candidate = structuredClone(modernPlan);
    const [hx, hy, hw, hh] = dimensions.head; const [bx, by, bw, bh] = dimensions.body;
    candidate.proportionsAndSilhouette = `${species} fixture proportions`;
    candidate.blueprint!.occupiedBounds.head = { x: hx, y: hy, width: hw, height: hh };
    candidate.blueprint!.occupiedBounds.body = { x: bx, y: by, width: bw, height: bh };
    silhouettes.add(JSON.stringify(candidate.blueprint!.occupiedBounds));
    const result = validateAnimalDraft(modernDraft, candidate);
    assert.ok(!result.issues.some((entry) => entry.code.startsWith("blueprint.")), `${species}: ${result.issues.map((entry) => entry.message).join("\n")}`);
  }
  assert.equal(silhouettes.size, variants.length);
});

test("shared-canvas model output is normalized into fixed local part spaces before repair", () => {
  const shared = structuredClone(modernDraft);
  shared.bodyConnections = { neck: { x: 330, y: 250 }, tail: { x: 630, y: 260 }, frontLegs: { x: 370, y: 320 }, backLegs: { x: 570, y: 320 } };
  shared.headSvg = `<g id="head-root"><rect x="230" y="180" width="120" height="120" fill="primary"/></g>`;
  shared.bodySvg = `<g id="body-root"><rect x="320" y="180" width="330" height="220" fill="primary"/></g>`;
  shared.frontLegsSvg = `<g id="frontLegs-root"><g id="frontLegs-far"><rect x="340" y="300" width="45" height="190" fill="primary"/></g><g id="frontLegs-near"><rect x="395" y="300" width="45" height="190" fill="primary"/></g></g>`;
  shared.backLegsSvg = `<g id="backLegs-root"><g id="backLegs-far"><rect x="540" y="300" width="45" height="190" fill="primary"/></g><g id="backLegs-near"><rect x="595" y="300" width="45" height="190" fill="primary"/></g></g>`;
  shared.tailSvg = `<g id="tail-root"><rect x="610" y="240" width="140" height="70" fill="accent"/></g>`;
  shared.layoutMetadata!.connections = shared.layoutMetadata!.connections.map((connection) => ({ ...connection, socketAnchor: shared.bodyConnections[connection.part === "head" ? "neck" : connection.part], attachmentAnchor: shared.bodyConnections[connection.part === "head" ? "neck" : connection.part] }));
  shared.layoutMetadata!.groundY = 490;
  shared.layoutMetadata!.groundContacts = { frontLegs: [{ x: 360, y: 490 }, { x: 420, y: 490 }], backLegs: [{ x: 560, y: 490 }, { x: 620, y: 490 }] };
  const globalPlan = structuredClone(modernPlan);
  globalPlan.blueprint!.connections = shared.layoutMetadata!.connections;
  globalPlan.blueprint!.groundY = 490;
  globalPlan.blueprint!.occupiedBounds = {
    head: { x: 230, y: 180, width: 120, height: 120 }, body: { x: 320, y: 180, width: 330, height: 220 },
    frontLegs: { x: 340, y: 300, width: 100, height: 190 }, backLegs: { x: 540, y: 300, width: 100, height: 190 }, tail: { x: 610, y: 240, width: 140, height: 70 },
  };
  const result = normalizeAnimalDraftCoordinates(shared, globalPlan);
  assert.equal(result.normalized, true);
  assert.deepEqual(new Set(result.normalizedParts), new Set(["head", "body", "frontLegs", "backLegs", "tail"]));
  assert.ok(result.animal.bodyConnections.neck.x >= 40 && result.animal.bodyConnections.neck.x <= 120);
  assert.ok(result.animal.bodyConnections.tail.x >= 200 && result.animal.bodyConnections.tail.x <= 280);
  for (const [part, width, height] of [["head", 160, 160], ["body", 300, 220], ["frontLegs", 260, 180], ["backLegs", 260, 180], ["tail", 160, 160]] as const) {
    const bounds = extractSvgBounds(result.animal[`${part}Svg`]);
    assert.ok(bounds && bounds.x >= -1 && bounds.y >= -1 && bounds.x + bounds.width <= width + 1 && bounds.y + bounds.height <= height + 1, `${part}: ${JSON.stringify(bounds)}`);
  }
  const validation = validateAnimalDraft(result.animal, result.plan);
  assert.ok(!validation.issues.some((entry) => entry.code === "geometry.bounds" || entry.code === "anchor.bounds" || entry.code === "anchor.contract"), validation.issues.map((entry) => entry.message).join("\n"));
});

test("palette placeholder warnings do not trigger destructive automatic part repair", () => {
  const warningOnly = validateAnimalDraft({ ...draft, tailSvg: `<g id="tail-root"><path d="M15 15 Q55 25 85 90" fill="#8B4513"/></g>` }, plan);
  assert.ok(warningOnly.issues.some((entry) => entry.code === "palette.placeholder" && entry.part === "tail"));
  assert.ok(!technicalFailingParts(warningOnly).includes("tail"));
});

test("literal palette colours and React-style SVG attributes are normalized without AI repair", () => {
  const raw = { ...draft, headSvg: `<g id="head-root"><path d="M120 110 L100 90 L80 80" fill="#8B5A2B" stroke="#F5E6C8" strokeWidth="3" strokeLinecap="round"/></g>` };
  const normalized = normalizeGeneratedSvgSyntax(raw);
  assert.deepEqual(normalized.changedParts, ["head"]);
  assert.match(normalized.animal.headSvg, /fill="primary"/);
  assert.match(normalized.animal.headSvg, /stroke="accent"/);
  assert.match(normalized.animal.headSvg, /stroke-width="3"/);
  const validation = validateAnimalDraft(normalized.animal, plan);
  assert.ok(!validation.issues.some((entry) => entry.code === "svg.attribute" && entry.part === "head"));
  assert.ok(!validation.issues.some((entry) => entry.code === "palette.placeholder" && entry.part === "head"));
});

test("a repaired part with a shifted literal palette promotes its dominant fill", () => {
  const repaired = { ...draft, bodySvg: `<g id="body-root"><path d="M75 90 L115 160 L235 160 L260 105 Z" fill="#7a2f25" stroke="#24100d" stroke-width="3"/></g>` };
  const normalized = normalizeGeneratedSvgSyntax(repaired);
  assert.match(normalized.animal.bodySvg, /fill="primary"/);
  const validation = validateAnimalDraft(normalized.animal, plan);
  assert.ok(!validation.issues.some((entry) => entry.code === "palette.placeholder" && entry.part === "body"));
});

test("planner invariants and depth-group aliases are normalized before validation", () => {
  const driftingPlan = structuredClone(plan);
  driftingPlan.anatomyTemplate = "quadruped-five-part";
  driftingPlan.requiredParts = ["head", "body"] as any;
  driftingPlan.requiredNamedGroups.frontLegs = ["frontLegs-root", "front-limb-far", "front-limb-near"];
  driftingPlan.blueprint = structuredClone(modernPlan.blueprint);
  driftingPlan.blueprint!.landmarks.toeTips[0].x = driftingPlan.blueprint!.landmarks.heels[0].x + 10;
  driftingPlan.blueprint!.connections[0].opposingNormal = driftingPlan.blueprint!.connections[0].outwardNormal;
  const locked = normalizeAnatomyPlanContract(driftingPlan);
  assert.deepEqual(locked.requiredParts, ["head", "body", "frontLegs", "backLegs", "tail"]);
  assert.ok(locked.requiredNamedGroups.frontLegs.includes("frontLegs-far"));
  assert.ok(locked.blueprint!.landmarks.toeTips[0].x < locked.blueprint!.landmarks.heels[0].x);
  const connection = locked.blueprint!.connections[0];
  assert.equal(connection.outwardNormal.x * connection.opposingNormal.x + connection.outwardNormal.y * connection.opposingNormal.y, -1);
  const aliasDraft = structuredClone(modernDraft);
  aliasDraft.frontLegsSvg = aliasDraft.frontLegsSvg.replace(/frontLegs-far/g, "front-limb-far").replace(/frontLegs-near/g, "front-limb-near");
  aliasDraft.layoutMetadata!.depthGroups.frontLegs = { farGroupId: "front-limb-far", nearGroupId: "front-limb-near" };
  const normalized = normalizeGeneratedSvgSyntax(aliasDraft).animal;
  assert.match(normalized.frontLegsSvg, /id="frontLegs-far"/);
  assert.deepEqual(normalized.layoutMetadata!.depthGroups.frontLegs, { farGroupId: "frontLegs-far", nearGroupId: "frontLegs-near" });
});
