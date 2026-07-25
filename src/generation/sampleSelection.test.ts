import assert from "node:assert/strict";
import test from "node:test";
import type { AnimalDraft, GeneratedLayoutMetadata } from "./contracts";
import {
  briefForSample,
  composeSelectedAnimal,
  defaultSelection,
  emphasisForSample,
  partCandidateStats,
  SAMPLE_EMPHASES,
  type GeneratedSample,
  type SlotSelection,
} from "./sampleSelection";
import { createDefaultBrief } from "./brief";

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

test("defaultSelection returns a concrete sample index for every slot", () => {
  const selection = defaultSelection(samples);
  for (const slot of ["head", "body", "frontLegs", "backLegs", "tail"] as const) {
    assert.ok(selection[slot] === 0 || selection[slot] === 1, `${slot} resolved to a real sample`);
  }
});

test("briefForSample appends a distinct emphasis without mutating the original", () => {
  const base = createDefaultBrief("tiger");
  const varied = briefForSample(base, 1);
  assert.notEqual(varied.advancedInstructions, base.advancedInstructions);
  assert.ok(varied.advancedInstructions.includes(SAMPLE_EMPHASES[1]));
  assert.equal(base.advancedInstructions, createDefaultBrief("tiger").advancedInstructions, "original brief untouched");
});
