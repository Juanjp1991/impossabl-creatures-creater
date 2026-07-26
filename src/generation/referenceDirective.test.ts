import test from "node:test";
import assert from "node:assert/strict";

import { PART_TYPES } from "./contracts";
import { partReferenceDirective, referenceDirective } from "./referenceDirective";

// The whole-animal directive names things a part-targeted call is forbidden to change, which
// is the R2 finding. These are the words that must not reach a per-part prompt as an
// instruction; every one of them appears in the whole-animal directive.
const WHOLE_ANIMAL_ONLY = ["side-view silhouette", "head/body ratio", "ground stance", "external tail"];

test("a missing reference says so in both directives", () => {
  assert.match(referenceDirective(false, "match"), /No reference image is supplied/);
  assert.match(partReferenceDirective(false, "match", "head"), /No reference image is supplied/);
});

test("the whole-animal match directive still claims structural authority", () => {
  const directive = referenceDirective(true, "match");
  assert.match(directive, /structural authority/);
  for (const phrase of WHOLE_ANIMAL_ONLY) assert.ok(directive.includes(phrase), `expected "${phrase}"`);
});

test("every part gets a directive scoped to that part alone", () => {
  for (const part of PART_TYPES) {
    const directive = partReferenceDirective(true, "match", part);
    assert.ok(directive.includes(part), `${part} directive should name the part`);
    assert.match(directive, /ignore the rest of the animal in it/);
    // Only the leading clause instructs; whole-animal properties may still be named later,
    // where they appear as things explicitly out of scope.
    const instruction = directive.slice(0, directive.indexOf("Read the image solely"));
    for (const phrase of WHOLE_ANIMAL_ONLY) {
      assert.ok(!instruction.includes(phrase), `${part} directive must not order a whole-animal change: "${phrase}"`);
    }
  }
});

test("the part directive rules whole-animal properties out rather than leaving them open", () => {
  const directive = partReferenceDirective(true, "match", "frontLegs");
  assert.match(directive, /the overall pose or the ground stance is out of scope/);
});

test("part cues are distinct per slot, so a head call is not told about hocks", () => {
  const cues = PART_TYPES.map((part) => partReferenceDirective(true, "match", part));
  assert.equal(new Set(cues).size, PART_TYPES.length);
  assert.match(partReferenceDirective(true, "match", "head"), /muzzle/);
  assert.ok(!partReferenceDirective(true, "match", "head").includes("hock"));
  assert.match(partReferenceDirective(true, "match", "backLegs"), /hock/);
});

test("a cropped reference is described as a crop, not as an animal to search", () => {
  const cropped = partReferenceDirective(true, "match", "head", true);
  assert.match(cropped, /crop the artist drew around the head/);
  assert.match(cropped, /treat the whole frame as that part/);
  assert.ok(!cropped.includes("ignore the rest of the animal in it"));
  // The scope fence survives cropping: a head crop still must not restyle the pose.
  assert.match(cropped, /the overall pose or the ground stance is out of scope/);
});

test("cropping is off by default, so existing callers keep the search directive", () => {
  assert.equal(partReferenceDirective(true, "match", "head"), partReferenceDirective(true, "match", "head", false));
  assert.match(partReferenceDirective(true, "match", "head"), /ignore the rest of the animal in it/);
});

test("inspire softens the part directive without widening its scope", () => {
  const inspire = partReferenceDirective(true, "inspire", "tail");
  assert.match(inspire, /loose inspiration for the tail only/);
  assert.ok(!inspire.includes("structural authority"));
  assert.match(inspire, /ignore the rest of the animal in it/);
});
