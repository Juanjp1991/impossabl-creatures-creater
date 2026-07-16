import assert from "node:assert/strict";
import test from "node:test";
import type { AnimalDraft, AnatomyStylePlan, GenerationMetadata } from "./contracts";
import { createDefaultBrief } from "./brief";
import { buildAssembledPreviewSvg } from "./preview";
import { mergeTargetedRepair } from "./repair";
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

test("targeted repair preserves every accepted part byte-for-byte", () => {
  const replacement = `<g id="head-root"><path d="M120 110 L90 60" fill="primary"/></g>`;
  const result = mergeTargetedRepair(draft, { headSvg: replacement, bodySvg: "must-not-be-used" }, ["head"]);
  assert.equal(result.animal.headSvg, replacement);
  assert.equal(result.animal.bodySvg, draft.bodySvg);
  assert.equal(result.animal.frontLegsSvg, draft.frontLegsSvg);
  assert.deepEqual(result.changedParts, ["head"]);
});

test("optional generation metadata remains JSON-storage compatible", () => {
  const brief = createDefaultBrief("cow");
  const metadata: GenerationMetadata = { originalRequest: "cow", brief, plan, models: { planner: "m", generator: "m", reviewer: "m", repair: "m" }, promptVersions: { planner: "1", generator: "1", reviewer: "1", repair: "1" }, validationHistory: [validateAnimalDraft(draft, plan)], reviewHistory: [], repairs: [], automaticRepairLimit: 2, completedRepairRounds: 0, finalStatus: "warnings", createdAt: new Date(0).toISOString() };
  assert.deepEqual(JSON.parse(JSON.stringify(metadata)), metadata);
});
