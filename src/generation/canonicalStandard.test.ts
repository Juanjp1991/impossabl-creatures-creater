import assert from "node:assert/strict";
import test from "node:test";
import type { AnimalDraft } from "./contracts";
import { applyRamp, isNearBlack, isNearWhite, isRawColour, resolveRamp } from "./palette";
import { classifyStrokeWidths, firstRawColour, localFillRatio, visibleElementCount } from "./metrics";
import { validateAnimalDraft } from "./validation";

// --- palette ----------------------------------------------------------------

test("resolveRamp passes primary/accent through and derives the rest as concrete hexes", () => {
  const ramp = resolveRamp("#8B5A2B", "#F5E6C8");
  assert.equal(ramp.primary, "#8B5A2B");
  assert.equal(ramp.accent, "#F5E6C8");
  assert.equal(ramp.outline, "#1a1a1a");
  assert.equal(ramp.highlight, "#f5f5f5");
  for (const token of ["primary-light", "primary-dark", "accent-dark"] as const) assert.match(ramp[token], /^#[0-9a-f]{6}$/);
  // Light really is lighter and dark really is darker than the source.
  assert.ok(parseInt(ramp["primary-light"].slice(1), 16) > parseInt("8B5A2B", 16));
  assert.ok(parseInt(ramp["primary-dark"].slice(1), 16) < parseInt("8B5A2B", 16));
});

test("applyRamp resolves quoted, var(), var(--token,#fallback) and inline-style forms", () => {
  const ramp = resolveRamp("#8B5A2B", "#F5E6C8");
  const svg = `<path fill="primary" stroke="var(--outline)"/><path fill="var(--primary,#000000)"/><path style="fill:accent-dark;stroke:highlight"/>`;
  const out = applyRamp(svg, ramp);
  assert.doesNotMatch(out, /var\(/, "no var() references survive");
  assert.doesNotMatch(out, /"(?:primary|accent|outline|highlight|accent-dark)"/, "no bare tokens survive");
  assert.match(out, /fill="#8B5A2B"/); // both the bare and the var(--primary,#fallback) forms
  assert.match(out, /stroke="#1a1a1a"/);
  assert.match(out, /fill:#[0-9a-f]{6};stroke:#f5f5f5/i);
});

test("isRawColour distinguishes off-palette colours from ramp references", () => {
  assert.ok(isRawColour("#8B4513"));
  assert.ok(isRawColour("rgb(10,20,30)"));
  assert.ok(!isRawColour("primary"));
  assert.ok(!isRawColour("var(--primary)"));
  assert.ok(!isRawColour("var(--primary,#8B4513)")); // a ramp reference, even with a baked fallback
  assert.ok(!isRawColour("none"));
});

test("near-black / near-white classifiers gate only the extremes", () => {
  assert.ok(isNearBlack("#101010"));
  assert.ok(!isNearBlack("#8B5A2B"));
  assert.ok(isNearWhite("#fbfbfb"));
  assert.ok(!isNearWhite("#F5E6C8"));
});

// --- metrics ----------------------------------------------------------------

test("visibleElementCount counts drawables and ignores group wrappers", () => {
  assert.equal(visibleElementCount(`<g id="x"><path/><circle/><rect/></g>`), 3);
});

test("classifyStrokeWidths bans sub-1 and flags off-standard widths", () => {
  const result = classifyStrokeWidths(`<path stroke-width="0.5"/><path stroke-width="3"/><path stroke-width="1.2"/><path style="stroke-width:2.1"/>`);
  assert.deepEqual(result.belowMinimum, [0.5]);
  assert.deepEqual(result.offStandard, [2.1]);
});

test("localFillRatio measures occupied height against the fixed view", () => {
  const ratio = localFillRatio(`<g id="head-root"><rect x="10" y="20" width="40" height="120"/></g>`, "head");
  assert.ok(Math.abs(ratio - 120 / 160) < 0.05, `ratio ${ratio}`);
});

test("firstRawColour finds an off-ramp colour but ignores a var() with a hex fallback", () => {
  assert.equal(firstRawColour(`<path fill="var(--primary,#000000)" stroke="#8B4513"/>`), "#8B4513");
  assert.equal(firstRawColour(`<path fill="primary" stroke="outline"/>`), undefined);
});

// --- validator §5.2 gates ---------------------------------------------------

const tokenPart = (id: string, body: string) => `<g id="${id}">${body}</g>`;
const validDraft = (): AnimalDraft => ({
  name: "Std", color: "#8B5A2B", accentColor: "#F5E6C8", description: "standard",
  bodyConnections: { neck: { x: 75, y: 90 }, tail: { x: 260, y: 105 }, frontLegs: { x: 115, y: 160 }, backLegs: { x: 235, y: 160 } },
  headSvg: tokenPart("head-root", `<path d="M120 110 L100 90 L80 80" fill="primary"/>`),
  bodySvg: tokenPart("body-root", `<path d="M75 90 L115 160 L235 160 L260 105 L75 90" fill="primary"/>`),
  frontLegsSvg: tokenPart("frontLegs-root", `<path d="M75 15 L70 178 L90 178 L85 15" fill="primary"/>`),
  backLegsSvg: tokenPart("backLegs-root", `<path d="M195 15 L185 178 L210 178 L205 15" fill="primary"/>`),
  tailSvg: tokenPart("tail-root", `<path d="M15 15 Q55 25 85 90" fill="accent"/>`),
});

test("a sub-1 stroke width is a hard error (vanishes on cheap screens)", () => {
  const draft = validDraft();
  draft.headSvg = tokenPart("head-root", `<path d="M120 110 L100 90 L80 80" fill="primary" stroke="outline" stroke-width="0.5"/>`);
  const result = validateAnimalDraft(draft);
  assert.ok(result.issues.some((entry) => entry.code === "stroke.tooThin" && entry.part === "head"));
  assert.equal(result.valid, false);
});

test("banned SVG features (gradients/filters/masks) are rejected by the tightened whitelist", () => {
  const draft = validDraft();
  draft.bodySvg = tokenPart("body-root", `<defs><lineargradient id="g"><stop offset="0" stop-color="primary"/></lineargradient></defs><path d="M75 90 L260 105" fill="primary"/>`);
  const result = validateAnimalDraft(draft);
  assert.ok(result.issues.some((entry) => entry.code === "svg.tag" && entry.part === "body"));
});

test("fill-ratio and density are surfaced as warnings on real pipeline output, not hard failures", () => {
  const draft = validDraft();
  draft.layoutMetadata = {
    facing: "left", groundY: 178,
    connections: [],
    groundContacts: { frontLegs: [{ x: 80, y: 178 }], backLegs: [{ x: 195, y: 178 }] },
    depthGroups: { frontLegs: { farGroupId: "frontLegs-far", nearGroupId: "frontLegs-near" }, backLegs: { farGroupId: "backLegs-far", nearGroupId: "backLegs-near" } },
  };
  const result = validateAnimalDraft(draft);
  // The minimal head is both sparse and short, so both bands warn — but neither blocks.
  assert.ok(result.issues.some((entry) => entry.code === "density.count" && entry.severity === "warning"));
  assert.ok(result.issues.some((entry) => entry.code === "scale.fill" && entry.severity === "warning"));
  assert.ok(!result.issues.some((entry) => (entry.code === "density.count" || entry.code === "scale.fill") && entry.severity === "error"));
});
