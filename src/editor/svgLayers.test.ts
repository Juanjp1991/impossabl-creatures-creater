import assert from "node:assert/strict";
import test from "node:test";
import { densityAfterDuplication, deleteSvgLayer, duplicateSvgLayer, extendChain, isProtectedLayer, stableSvgLayerId } from "./svgLayers";

test("generated layer IDs are deterministic, part-scoped and lowercase", () => {
  assert.equal(stableSvgLayerId("Front Legs", "PATH", 0), "front-legs-path-1");
  assert.equal(stableSvgLayerId("head", "g", 4), stableSvgLayerId("head", "g", 4));
  assert.notEqual(stableSvgLayerId("head", "path", 0), stableSvgLayerId("body", "path", 0));
});


test("duplication density is reported against the part's own band", () => {
  // Two visible drawables; tail's default medium band is 5-13, so one more is still short.
  const svg = '<g id="tail-root"><path d="M0 0L1 1"/><path d="M1 1L2 2"/></g>';
  const tail = densityAfterDuplication(svg, "tail");
  assert.equal(tail.count, 3);
  assert.deepEqual([tail.min, tail.max], [5, 13]);
  assert.equal(tail.withinBand, false);

  // The same markup judged as a head (band 18-36) is well under.
  const head = densityAfterDuplication(svg, "head");
  assert.equal(head.withinBand, false);
});

test("adding several links at once is reported as one jump", () => {
  const svg = '<g id="tail-root">' + '<path d="M0 0L1 1"/>'.repeat(9) + '</g>';
  assert.equal(densityAfterDuplication(svg, "tail", 1).withinBand, true);
  // 9 + 5 = 14, past the tail band's upper bound of 13.
  assert.equal(densityAfterDuplication(svg, "tail", 5).withinBand, false);
});

test("the DOM-backed layer operations no-op safely without a DOM", () => {
  // node --test has no DOMParser; these must return the input untouched rather than throw,
  // which is what lets the same module import cleanly on the server.
  const svg = '<g id="tail-root"><path id="seg" d="M0 0L1 1"/></g>';
  assert.deepEqual(duplicateSvgLayer(svg, "seg"), { svg, newId: "seg" });
  assert.deepEqual(extendChain(svg, "seg", { x: 0, y: 0, width: 10, height: 4 }), { svg, newId: "seg" });
});

test("the pipeline's required groups are protected from deletion", () => {
  for (const id of ["head-root", "body-root", "frontLegs-root", "backLegs-root", "tail-root",
                    "frontLegs-far", "frontLegs-near", "backLegs-far", "backLegs-near",
                    "front-left-leg", "front-right-leg", "back-left-leg", "back-right-leg",
                    "front-left-limb", "front-left-foot", "front-right-limb", "front-right-foot",
                    "back-left-limb", "back-left-foot", "back-right-limb", "back-right-foot"]) {
    assert.equal(isProtectedLayer(id), true, id);
  }
  assert.equal(isProtectedLayer("head-path-2"), false);
  // A protected id is returned untouched even if a caller asks for its removal.
  const svg = '<g id="body-root"><path id="p" d="M0 0"/></g>';
  assert.equal(deleteSvgLayer(svg, "body-root"), svg);
});
