import assert from "node:assert/strict";
import test from "node:test";
import type { AnimalDraft, GeneratedLayoutMetadata } from "./contracts";
import {
  DEFAULT_VARIATION_COUNT,
  VARIATION_ANGLES,
  VARIATION_ANGLE_LABELS,
  VARIATION_STRENGTHS,
  buildVariationPrompt,
  variationAngle,
  variationAngleLabel,
  variationSample,
} from "./partVariations";

const layout: GeneratedLayoutMetadata = {
  facing: "left",
  groundY: 178,
  connections: [
    { part: "head", socketAnchor: { x: 75, y: 90 }, attachmentAnchor: { x: 120, y: 110 }, outwardNormal: { x: -1, y: 0 }, opposingNormal: { x: 1, y: 0 }, seamWidth: 30, minimumOverlap: 60, neutralConnectionDepth: 14, allowedScale: { min: 0.8, max: 1.2 } },
  ],
  groundContacts: { frontLegs: [{ x: 80, y: 178 }] },
  depthGroups: { frontLegs: { farGroupId: "fl-far", nearGroupId: "fl-near" } },
};

const seed: AnimalDraft = {
  name: "Red Fox",
  color: "#c1440e",
  accentColor: "#f2e3c8",
  description: "a fox",
  bodyConnections: { neck: { x: 75, y: 90 }, tail: { x: 260, y: 105 }, frontLegs: { x: 115, y: 160 }, backLegs: { x: 235, y: 160 } },
  headSvg: `<g id="head-root"><circle cx="80" cy="80" r="40" fill="primary"/></g>`,
  bodySvg: `<g id="body-root"><ellipse cx="150" cy="110" rx="100" ry="50" fill="primary"/></g>`,
  frontLegsSvg: `<g id="fl-root"><rect x="60" y="20" width="20" height="140" fill="primary"/></g>`,
  backLegsSvg: `<g id="bl-root"><rect x="180" y="20" width="20" height="140" fill="primary"/></g>`,
  tailSvg: `<g id="tail-root"><path d="M 15,15 C 60,20 90,60 120,110" stroke="accent" fill="none"/></g>`,
  layoutMetadata: layout,
};

test("every angle has a matching short label", () => {
  assert.equal(VARIATION_ANGLES.length, VARIATION_ANGLE_LABELS.length);
  assert.equal(new Set(VARIATION_ANGLE_LABELS).size, VARIATION_ANGLE_LABELS.length, "labels must be distinguishable");
});

test("a default round gives every variation a different angle", () => {
  const angles = Array.from({ length: DEFAULT_VARIATION_COUNT }, (_unused, index) => variationAngle(index));
  assert.equal(new Set(angles).size, DEFAULT_VARIATION_COUNT, "six variations must not repeat an angle");
});

test("angles wrap rather than going undefined past the list", () => {
  assert.equal(variationAngle(VARIATION_ANGLES.length), VARIATION_ANGLES[0]);
  assert.equal(variationAngleLabel(VARIATION_ANGLE_LABELS.length + 1), VARIATION_ANGLE_LABELS[1]);
});

test("the prompt names the slot, the strength and the angle", () => {
  const prompt = buildVariationPrompt({ slot: "frontLegs", strength: "tight", index: 2 });
  assert.match(prompt, /front legs only/);
  assert.match(prompt, /own species-correct construction/i);
  assert.ok(prompt.includes(VARIATION_STRENGTHS.tight.directive));
  assert.ok(prompt.includes(variationAngle(2)));
  assert.match(prompt, /meaningfully different/);
});

test("front- and back-leg variation prompts demand different anatomy", () => {
  const front = buildVariationPrompt({ slot: "frontLegs", strength: "moderate", index: 0 });
  const back = buildVariationPrompt({ slot: "backLegs", strength: "moderate", index: 0 });
  assert.notEqual(front, back);
  assert.match(front, /never copy, mirror, translate, rename or reuse the main back-leg limb subgroup geometry/i);
  assert.match(back, /never copy, mirror, translate, rename or reuse the main front-leg limb subgroup geometry/i);
  assert.match(front, /Foot silhouette and construction may be reused when appropriate/i);
});

test("the three strengths produce materially different directives", () => {
  const at = (strength: "tight" | "moderate" | "loose") => buildVariationPrompt({ slot: "head", strength, index: 0 });
  assert.notEqual(at("tight"), at("moderate"));
  assert.notEqual(at("moderate"), at("loose"));
  assert.match(at("tight"), /same part, refined/i);
  assert.match(at("loose"), /inspiration rather than a constraint/i);
});

test("free-text direction is appended, not substituted", () => {
  const prompt = buildVariationPrompt({ slot: "tail", strength: "moderate", index: 1, instructions: "  bushier, white tip  " });
  assert.ok(prompt.includes(VARIATION_STRENGTHS.moderate.directive), "strength survives");
  assert.ok(prompt.includes(variationAngle(1)), "angle survives");
  assert.match(prompt, /ADDITIONAL DIRECTION FROM THE ARTIST: bushier, white tip$/);
});

test("blank instructions add no trailing section", () => {
  const prompt = buildVariationPrompt({ slot: "tail", strength: "moderate", index: 1, instructions: "   " });
  assert.ok(!prompt.includes("ADDITIONAL DIRECTION"));
});

test("the prompt leaves coordinate and palette rules to the endpoint", () => {
  // The system instruction owns the view boxes, anchors and ramp tokens; restating them
  // here would give the model two sources of truth to reconcile.
  const prompt = buildVariationPrompt({ slot: "head", strength: "moderate", index: 0 });
  assert.ok(!/viewBox|0 0 160 160|primary-dark/.test(prompt));
});

test("variationSample keeps the seed's untouched parts and drops bookkeeping", () => {
  const payload = {
    ...seed,
    headSvg: `<g id="head-root"><circle cx="80" cy="80" r="52" fill="primary"/></g>`,
    modifiedParts: ["head"],
  };
  const sample = variationSample(3, seed, payload as any);
  assert.equal(sample.index, 3);
  assert.equal(sample.label, variationAngleLabel(3));
  assert.match(sample.animal!.headSvg, /r="52"/, "the varied part comes from the response");
  assert.equal(sample.animal!.tailSvg, seed.tailSvg, "untouched parts stay as seeded");
  assert.equal((sample.animal as any).modifiedParts, undefined, "bookkeeping never reaches the draft");
});

test("variationSample keeps the seed's layout metadata", () => {
  // A targeted edit does not restate layout metadata, so taking it from the response would
  // drop the seam profile, ground contacts and depth groups the seed already had.
  const payload = { ...seed, layoutMetadata: undefined, headSvg: `<g id="head-root"><circle r="9"/></g>` };
  const sample = variationSample(0, seed, payload as any);
  assert.deepEqual(sample.animal!.layoutMetadata, layout);
});

test("a variation candidate is shaped like a contact-sheet sample", () => {
  // SlotCandidatePicker consumes GeneratedSample, so a variation must satisfy the same
  // contract or the picker cannot render it unchanged.
  const sample = variationSample(0, seed, { ...seed } as any);
  assert.equal(typeof sample.index, "number");
  assert.equal(typeof sample.emphasis, "string");
  assert.ok(sample.animal);
  assert.equal(sample.error, undefined);
});
