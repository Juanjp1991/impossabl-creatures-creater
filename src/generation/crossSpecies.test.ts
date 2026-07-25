import assert from "node:assert/strict";
import test from "node:test";
import type { AnimalDraft } from "./contracts";
import { evaluateCrossSpecies, evaluateHybrid, type RosterEntry } from "./crossSpecies";

// A valid, structurally-clean modern species (seams overlap, tokens only, depth groups
// present). Two of these differ only by colour, which is enough to exercise cross-species
// assembly: every part shares the fixed local views and anchors.
function speciesDraft(color: string): AnimalDraft {
  return {
    name: `Species ${color}`, color, accentColor: "#F5E6C8", description: "roster species",
    bodyConnections: { neck: { x: 75, y: 90 }, tail: { x: 260, y: 105 }, frontLegs: { x: 115, y: 160 }, backLegs: { x: 235, y: 160 } },
    headSvg: `<g id="head-root"><rect x="100" y="90" width="40" height="40" fill="primary"/></g>`,
    bodySvg: `<g id="body-root"><rect x="60" y="80" width="210" height="100" fill="primary"/><circle cx="75" cy="90" r="3" fill="primary"/><circle cx="260" cy="105" r="3" fill="primary"/><circle cx="115" cy="160" r="3" fill="primary"/><circle cx="235" cy="160" r="3" fill="primary"/></g>`,
    frontLegsSvg: `<g id="frontLegs-root"><g id="frontLegs-far"><rect x="65" y="5" width="30" height="173" fill="primary"/></g><g id="frontLegs-near"><rect x="105" y="5" width="30" height="173" fill="primary"/></g></g>`,
    backLegsSvg: `<g id="backLegs-root"><g id="backLegs-far"><rect x="185" y="5" width="30" height="173" fill="primary"/></g><g id="backLegs-near"><rect x="225" y="5" width="30" height="173" fill="primary"/></g></g>`,
    tailSvg: `<g id="tail-root"><rect x="0" y="0" width="45" height="35" fill="accent"/></g>`,
    layoutMetadata: {
      facing: "left", groundY: 323,
      connections: [
        { part: "head", socketAnchor: { x: 75, y: 90 }, attachmentAnchor: { x: 120, y: 110 }, outwardNormal: { x: -1, y: 0 }, opposingNormal: { x: 1, y: 0 }, seamWidth: 30, minimumOverlap: 16, neutralConnectionDepth: 16, allowedScale: { min: 0.7, max: 1.3 } },
        { part: "frontLegs", socketAnchor: { x: 115, y: 160 }, attachmentAnchor: { x: 75, y: 15 }, outwardNormal: { x: 0, y: 1 }, opposingNormal: { x: 0, y: -1 }, seamWidth: 30, minimumOverlap: 16, neutralConnectionDepth: 16, allowedScale: { min: 0.7, max: 1.3 } },
        { part: "backLegs", socketAnchor: { x: 235, y: 160 }, attachmentAnchor: { x: 195, y: 15 }, outwardNormal: { x: 0, y: 1 }, opposingNormal: { x: 0, y: -1 }, seamWidth: 30, minimumOverlap: 16, neutralConnectionDepth: 16, allowedScale: { min: 0.7, max: 1.3 } },
        { part: "tail", socketAnchor: { x: 260, y: 105 }, attachmentAnchor: { x: 15, y: 15 }, outwardNormal: { x: 1, y: 0 }, opposingNormal: { x: -1, y: 0 }, seamWidth: 30, minimumOverlap: 16, neutralConnectionDepth: 16, allowedScale: { min: 0.7, max: 1.3 } },
      ],
      groundContacts: { frontLegs: [{ x: 80, y: 178 }, { x: 120, y: 178 }], backLegs: [{ x: 195, y: 178 }, { x: 235, y: 178 }] },
      depthGroups: { frontLegs: { farGroupId: "frontLegs-far", nearGroupId: "frontLegs-near" }, backLegs: { farGroupId: "backLegs-far", nearGroupId: "backLegs-near" } },
    },
  };
}

const roster: RosterEntry[] = [
  { id: "aardvark", draft: speciesDraft("#8B5A2B") },
  { id: "beaver", draft: speciesDraft("#7a4b1e") },
  { id: "cheetah", draft: speciesDraft("#c9832b") },
];

test("evaluateCrossSpecies assembles the requested number of hybrids across the roster", () => {
  const report = evaluateCrossSpecies(roster, { sampleCount: 6, seed: 42 });
  assert.equal(report.sampleCount, 6);
  assert.equal(report.distinctSpecies, 3);
  for (const evaluation of report.evaluations) {
    for (const slot of ["head", "body", "frontLegs", "backLegs", "tail"] as const) assert.ok(evaluation.sources[slot], `${slot} has a donor`);
  }
});

test("a structurally clean hybrid raises no seam, ground or overlap flag", () => {
  const report = evaluateCrossSpecies(roster, { sampleCount: 4, seed: 7 });
  for (const evaluation of report.evaluations) {
    assert.ok(!evaluation.flags.some((flag) => flag.startsWith("seam")), evaluation.flags.join("; "));
    assert.ok(!evaluation.flags.some((flag) => flag.startsWith("ground")), evaluation.flags.join("; "));
    assert.ok(!evaluation.flags.some((flag) => flag.startsWith("overlap")), evaluation.flags.join("; "));
  }
});

test("evaluateHybrid flags a donor head that does not reach the neck seam", () => {
  const good = speciesDraft("#8B5A2B");
  const clean = evaluateHybrid(0, good, { head: "a", body: "a", frontLegs: "a", backLegs: "a", tail: "a" });
  assert.ok(!clean.flags.some((flag) => flag.startsWith("seam")), clean.flags.join("; "));

  const bad: AnimalDraft = { ...good, headSvg: `<g id="head-root"><rect x="20" y="20" width="30" height="30" fill="primary"/></g>` };
  const broken = evaluateHybrid(0, bad, { head: "b", body: "a", frontLegs: "a", backLegs: "a", tail: "a" });
  assert.ok(broken.flags.some((flag) => flag.startsWith("seam gap at head")), broken.flags.join("; "));
});

test("the report summary tallies flags by category and counts flagged hybrids", () => {
  const report = evaluateCrossSpecies(roster, { sampleCount: 5, seed: 3 });
  const totalFlags = report.evaluations.reduce((sum, evaluation) => sum + evaluation.flags.length, 0);
  const summed = Object.values(report.summary).reduce((sum, value) => sum + value, 0);
  assert.equal(totalFlags, summed, "every flag lands in exactly one summary bucket");
  assert.ok(report.flaggedCount <= report.evaluations.length);
});

test("an empty roster cannot form hybrids and returns no samples", () => {
  assert.equal(evaluateCrossSpecies([], { sampleCount: 4 }).sampleCount, 0);
  // A single-species roster still forms (degenerate) hybrids from that one donor.
  assert.equal(evaluateCrossSpecies([roster[0]], { sampleCount: 2 }).sampleCount, 2);
});
