import assert from "node:assert/strict";
import test from "node:test";
import type { AnimalDraft, GeneratedLayoutMetadata } from "./contracts";
import {
  briefForSample,
  composeSelectedAnimal,
  candidateRank,
  DEFAULT_SAMPLE_CONCURRENCY,
  defaultSelection,
  emphasisForSample,
  modelForSample,
  partCandidateStats,
  SAMPLE_EMPHASES,
  sampleConcurrencyForModels,
  type GeneratedSample,
  type SlotSelection,
} from "./sampleSelection";
import { createDefaultBrief } from "./brief";
import { synchronizeLimbContract } from "./geometry";
import { normalizeGeneratedSvgSyntax } from "./normalize";

const layout = (tag: string): GeneratedLayoutMetadata => ({
  facing: "left",
  groundY: 178,
  connections: [
    { part: "head", socketAnchor: { x: 75, y: 90 }, attachmentAnchor: { x: 120, y: 110 }, outwardNormal: { x: -1, y: 0 }, opposingNormal: { x: 1, y: 0 }, seamWidth: 30, minimumOverlap: 60, neutralConnectionDepth: 14, allowedScale: { min: 0.8, max: 1.2 } },
    { part: "frontLegs", socketAnchor: { x: 115, y: 160 }, attachmentAnchor: { x: 75, y: 15 }, outwardNormal: { x: 0, y: 1 }, opposingNormal: { x: 0, y: -1 }, seamWidth: 30, minimumOverlap: 60, neutralConnectionDepth: 14, allowedScale: { min: 0.8, max: 1.2 } },
    { part: "backLegs", socketAnchor: { x: 235, y: 160 }, attachmentAnchor: { x: 195, y: 15 }, outwardNormal: { x: 0, y: 1 }, opposingNormal: { x: 0, y: -1 }, seamWidth: 30, minimumOverlap: 60, neutralConnectionDepth: 14, allowedScale: { min: 0.8, max: 1.2 } },
    { part: "tail", socketAnchor: { x: 260, y: 105 }, attachmentAnchor: { x: 15, y: 15 }, outwardNormal: { x: 1, y: 0 }, opposingNormal: { x: -1, y: 0 }, seamWidth: 30, minimumOverlap: 60, neutralConnectionDepth: 14, allowedScale: { min: 0.8, max: 1.2 } },
  ],
  groundContacts: { frontLegs: [{ x: 80, y: 178 }], backLegs: [{ x: 195, y: 178 }] },
  depthGroups: { frontLegs: { farGroupId: `frontLegs-far-${tag}`, nearGroupId: `frontLegs-near-${tag}` }, backLegs: { farGroupId: `backLegs-far-${tag}`, nearGroupId: `backLegs-near-${tag}` } },
});

const draft = (tag: string): AnimalDraft => ({
  name: `Creature ${tag}`,
  color: tag === "A" ? "#111111" : "#222222",
  accentColor: "#ffaa00",
  description: `Sample ${tag}`,
  bodyConnections: { neck: { x: 75, y: 90 }, tail: { x: 260, y: 105 }, frontLegs: { x: 115, y: 160 }, backLegs: { x: 235, y: 160 } },
  headSvg: `<g id="head-root"><path d="M120 110 L100 90 L80 80 Z" fill="primary" data-tag="${tag}"/></g>`,
  bodySvg: `<g id="body-root"><rect x="20" y="20" width="260" height="180" fill="primary" data-tag="${tag}"/></g>`,
  frontLegsSvg: `<g id="frontLegs-root"><g id="frontLegs-far-${tag}"><rect x="60" y="15" width="20" height="150" fill="primary"/></g><g id="frontLegs-near-${tag}"><rect x="90" y="15" width="20" height="150" fill="primary"/></g></g>`,
  backLegsSvg: `<g id="backLegs-root"><g id="backLegs-far-${tag}"><rect x="180" y="15" width="20" height="150" fill="primary"/></g><g id="backLegs-near-${tag}"><rect x="210" y="15" width="20" height="150" fill="primary"/></g></g>`,
  tailSvg: `<g id="tail-root"><path d="M15 15 L60 30 L40 60 Z" fill="accent" data-tag="${tag}"/></g>`,
  layoutMetadata: layout(tag),
});

const samples: GeneratedSample[] = [
  { index: 0, emphasis: emphasisForSample(0), animal: draft("A") },
  { index: 1, emphasis: emphasisForSample(1), animal: draft("B") },
];

test("composeSelectedAnimal pulls each slot's SVG from its selected sample", () => {
  const selection: SlotSelection = { head: 1, body: 0, frontLegs: 1, backLegs: 0, tail: 1 };
  const composed = composeSelectedAnimal(samples, selection);
  assert.match(composed.headSvg, /data-tag="B"/);
  assert.match(composed.bodySvg, /data-tag="A"/);
  assert.match(composed.tailSvg, /data-tag="B"/);
  // Identity + body anchors follow the chosen body (sample A).
  assert.equal(composed.color, "#111111");
  assert.equal(composed.name, "Creature A");
});

test("composeSelectedAnimal keeps depth groups pointing at the SVG they came from", () => {
  const selection: SlotSelection = { head: 0, body: 0, frontLegs: 1, backLegs: 0, tail: 0 };
  const composed = composeSelectedAnimal(samples, selection);
  // frontLegs from sample B -> its depth-group ids must be the B ids that exist in the kept SVG.
  assert.equal(composed.layoutMetadata?.depthGroups.frontLegs?.farGroupId, "frontLegs-far-B");
  assert.match(composed.frontLegsSvg, /frontLegs-far-B/);
  // backLegs from sample A -> A ids.
  assert.equal(composed.layoutMetadata?.depthGroups.backLegs?.farGroupId, "backLegs-far-A");
  // Each attached part's connection profile is carried through exactly once.
  assert.equal(composed.layoutMetadata?.connections.length, 4);
});

test("composeSelectedAnimal rejects a slot whose selected sample lacks art", () => {
  const broken: GeneratedSample[] = [{ index: 0, emphasis: "", error: "boom" }];
  assert.throws(() => composeSelectedAnimal(broken, { head: 0, body: 0, frontLegs: 0, backLegs: 0, tail: 0 }), /no usable/);
});

test("partCandidateStats: body has no seam, others report joint-zone pixels; counts are finite", () => {
  const bodyStats = partCandidateStats(samples[0], "body");
  assert.equal(bodyStats.seamPixels, null);
  assert.ok(bodyStats.elementCount >= 1);
  const headStats = partCandidateStats(samples[0], "head");
  assert.notEqual(headStats.seamPixels, null);
  assert.ok(headStats.fillRatio > 0 && headStats.fillRatio <= 1.25);
});

test("partCandidateStats: a failed sample yields non-usable stats", () => {
  const stats = partCandidateStats({ index: 9, emphasis: "", error: "nope" }, "head");
  assert.equal(stats.hasArt, false);
  assert.equal(stats.errorCount, Infinity);
});

test("limb candidate stats expose separation, order and silhouette quality", () => {
  const animal = draft("A");
  animal.frontLegsSvg = `<g id="frontLegs-root"><g id="frontLegs-far"><g id="front-right-leg"><g id="front-right-limb"><ellipse cx="110" cy="20" rx="18" ry="15" fill="primary"/><rect x="100" y="20" width="20" height="135" fill="primary"/></g><g id="front-right-foot"><ellipse cx="110" cy="160" rx="15" ry="8" fill="primary"/><circle cx="118" cy="163" r="4" fill="accent"/></g></g></g><g id="frontLegs-near"><g id="front-left-leg"><g id="front-left-limb"><ellipse cx="70" cy="20" rx="18" ry="15" fill="primary"/><rect x="60" y="20" width="20" height="135" fill="primary"/></g><g id="front-left-foot"><ellipse cx="70" cy="160" rx="15" ry="8" fill="primary"/><circle cx="78" cy="163" r="4" fill="accent"/></g></g></g></g>`;
  animal.layoutMetadata!.depthGroups.frontLegs = { farGroupId: "frontLegs-far", nearGroupId: "frontLegs-near" };
  const strict = synchronizeLimbContract(normalizeGeneratedSvgSyntax(animal).animal);
  const stats = partCandidateStats({ index: 2, emphasis: "", animal: strict }, "frontLegs");
  assert.equal(stats.legOverlapRatio, 0);
  assert.equal(stats.legOrderOk, true);
  assert.ok((stats.legSimilarity ?? 0) > 0.9);
  assert.equal(stats.legCollarOk, true);
  assert.equal(stats.footElementCount, 4);
});

test("candidate ranking strongly prefers separated, correctly ordered leg pairs", () => {
  const base = {
    hasArt: true,
    seamPixels: 60,
    fillRatio: 0.8,
    elementCount: 20,
    errorCount: 0,
    legOverlapRatio: 0,
    legOrderOk: true,
    legSimilarity: 0.9,
    legCollarOk: true,
    footElementCount: 4,
  };
  assert.ok(candidateRank(base, "frontLegs") < candidateRank({ ...base, legOrderOk: false }, "frontLegs"));
  assert.ok(candidateRank(base, "frontLegs") < candidateRank({ ...base, legOverlapRatio: 0.8 }, "frontLegs"));
  assert.ok(candidateRank(base, "frontLegs") < candidateRank({ ...base, legCollarOk: false }, "frontLegs"));
  assert.ok(candidateRank(base, "frontLegs") < candidateRank({ ...base, footElementCount: 1 }, "frontLegs"));
});

test("defaultSelection returns a concrete sample index for every slot", () => {
  const selection = defaultSelection(samples);
  for (const slot of ["head", "body", "frontLegs", "backLegs", "tail"] as const) {
    assert.ok(selection[slot] === 0 || selection[slot] === 1, `${slot} resolved to a real sample`);
  }
});

test("whole-animal sampling runs fast models in parallel and heavy models serially", () => {
  assert.equal(DEFAULT_SAMPLE_CONCURRENCY, 2);
  assert.equal(sampleConcurrencyForModels(["proxy:gemini-3.6-flash-high"], undefined), 2);
  assert.equal(sampleConcurrencyForModels(["proxy:grok-4.5"], undefined), 2);
  assert.equal(sampleConcurrencyForModels(["proxy:gpt-5.6-sol"], undefined), 1);
  assert.equal(sampleConcurrencyForModels(["proxy:grok-4.5", "proxy:gpt-5.6-sol"], undefined), 1);
  assert.equal(sampleConcurrencyForModels(undefined, "gemini:gemini-3.6-flash"), 2);
});

test("briefForSample appends a distinct emphasis without mutating the original", () => {
  const base = createDefaultBrief("tiger");
  const varied = briefForSample(base, 1);
  assert.notEqual(varied.advancedInstructions, base.advancedInstructions);
  assert.ok(varied.advancedInstructions.includes(SAMPLE_EMPHASES[1]));
  assert.equal(base.advancedInstructions, createDefaultBrief("tiger").advancedInstructions, "original brief untouched");
});

// §P3 multi-model contact sheet.
test("samples round-robin across the chosen models", () => {
  const ids = ["proxy:a", "proxy:b", "proxy:c"];
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => modelForSample(i, ids)), ["proxy:a", "proxy:b", "proxy:c", "proxy:a", "proxy:b"]);
});

test("with no model list every sample uses the single chosen model", () => {
  assert.equal(modelForSample(0, undefined, "proxy:only"), "proxy:only");
  assert.equal(modelForSample(3, [], "proxy:only"), "proxy:only");
  // Blank entries must not become a turn in the rotation.
  assert.equal(modelForSample(1, ["", ""], "proxy:only"), "proxy:only");
});

test("a single-model list behaves exactly like today's single selection", () => {
  assert.deepEqual([0, 1, 2].map((i) => modelForSample(i, ["proxy:one"], "proxy:other")), ["proxy:one", "proxy:one", "proxy:one"]);
});
