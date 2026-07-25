import assert from "node:assert/strict";
import test from "node:test";
import { stableSvgLayerId } from "./svgLayers";

test("generated layer IDs are deterministic, part-scoped and lowercase", () => {
  assert.equal(stableSvgLayerId("Front Legs", "PATH", 0), "front-legs-path-1");
  assert.equal(stableSvgLayerId("head", "g", 4), stableSvgLayerId("head", "g", 4));
  assert.notEqual(stableSvgLayerId("head", "path", 0), stableSvgLayerId("body", "path", 0));
});

