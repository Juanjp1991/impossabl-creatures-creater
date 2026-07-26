import test from "node:test";
import assert from "node:assert/strict";

import { PART_TYPES } from "../src/generation/contracts";
import type { AnimalPartType } from "../src/types";
import { measureDraft, median, summarize, type BaselineFile, type RunRecord, type SlotMeasurement } from "./baseline";

const slot = (over: Partial<SlotMeasurement> = {}): SlotMeasurement => ({
  present: true,
  elementCount: 12,
  fillRatio: 0.8,
  seamPixels: 120,
  errorCodes: [],
  ...over,
});

const run = (index: number, over: Partial<RunRecord> = {}, slots: Partial<Record<AnimalPartType, SlotMeasurement>> = {}): RunRecord => {
  const filled = {} as Record<AnimalPartType, SlotMeasurement>;
  for (const part of PART_TYPES) filled[part] = slots[part] ?? slot(part === "body" ? { seamPixels: null } : {});
  return { index, emphasis: "silhouette-first", ok: true, latencyMs: 90_000, slots: filled, ...over };
};

const file = (runs: RunRecord[]): BaselineFile => ({
  startedAt: "2026-07-26T00:00:00.000Z",
  finishedAt: "2026-07-26T00:10:00.000Z",
  server: "http://localhost:3000",
  modelId: "proxy:test-model",
  animal: "red fox",
  preset: "natural-semi-realistic",
  runs,
});

test("median handles odd, even and empty inputs", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.ok(Number.isNaN(median([])));
});

test("the table reports each slot against its density and fill bands", () => {
  const report = summarize(file([run(0), run(1)]));
  assert.match(report, /\| head \| 2\/2 \| 12 \(8–28, in band\)/);
  // The tail band tops out at 10, so the same 12 elements are above it.
  assert.match(report, /\| tail \| 2\/2 \| 12 \(3–10, above\)/);
  assert.match(report, /80\.0 \(in band\)/);
  assert.match(report, /No validation errors across the usable runs\./);
});

test("a slot that never came back is counted, not silently averaged away", () => {
  const report = summarize(file([run(0), run(1, {}, { tail: slot({ present: false, elementCount: 0, fillRatio: 0 }) })]));
  assert.match(report, /\| tail \| 1\/2 \|/);
  // The absent tail must not drag the median of the one that did arrive.
  assert.match(report, /\| tail \| 1\/2 \| 12 /);
});

test("failed runs are listed with a 1-based number and excluded from the medians", () => {
  const report = summarize(file([run(0), run(1, { ok: false, error: "504 deadline exceeded" })]));
  assert.match(report, /runs: 2 \(1 usable\)/);
  assert.match(report, /- run 2 \(silhouette-first\): 504 deadline exceeded/);
});

test("validation errors are rolled up by code, commonest first", () => {
  const report = summarize(file([
    run(0, {}, { head: slot({ errorCodes: ["svg.attribute", "geometry.seam"] }) }),
    run(1, {}, { head: slot({ errorCodes: ["svg.attribute"] }) }),
  ]));
  const attribute = report.indexOf("`svg.attribute` × 2");
  const seam = report.indexOf("`geometry.seam` × 1");
  assert.ok(attribute > 0 && seam > 0);
  assert.ok(attribute < seam, "the commonest code should be listed first");
});

test("measureDraft reads a draft with the app's own analysis functions", () => {
  const slots = measureDraft({
    name: "Cow", color: "#8B5A2B", accentColor: "#F5E6C8", description: "A friendly cow.",
    bodyConnections: { neck: { x: 75, y: 90 }, tail: { x: 260, y: 105 }, frontLegs: { x: 115, y: 160 }, backLegs: { x: 235, y: 160 } },
    headSvg: `<g id="head-root"><path d="M120 110 L100 90 L80 80" fill="primary"/><circle cx="90" cy="85" r="4" fill="accent"/></g>`,
    bodySvg: `<g id="body-root"><path d="M75 90 L115 160 L235 160 L260 105 L75 90" fill="primary"/></g>`,
    frontLegsSvg: `<g id="frontLegs-root"><path d="M75 15 L70 100 L70 178 L90 178 L85 15" fill="primary"/></g>`,
    backLegsSvg: `<g id="backLegs-root"><path d="M195 15 L185 100 L185 178 L210 178 L205 15" fill="primary"/></g>`,
    tailSvg: `<g id="tail-root"><path d="M15 15 Q55 25 85 90" fill="accent"/></g>`,
  });
  assert.equal(slots.head.present, true);
  assert.equal(slots.head.elementCount, 2);
  assert.ok(slots.head.fillRatio > 0);
  // The body has no seam of its own; the attached parts each report one.
  assert.equal(slots.body.seamPixels, null);
  assert.notEqual(slots.tail.seamPixels, null);
});

test("an empty slot is reported as missing rather than as zero-element art", () => {
  const slots = measureDraft({
    name: "Half", color: "#8B5A2B", accentColor: "#F5E6C8", description: "Missing a tail.",
    bodyConnections: { neck: { x: 75, y: 90 }, tail: { x: 260, y: 105 }, frontLegs: { x: 115, y: 160 }, backLegs: { x: 235, y: 160 } },
    headSvg: `<g id="head-root"><path d="M120 110 L100 90 L80 80" fill="primary"/></g>`,
    bodySvg: `<g id="body-root"><path d="M75 90 L115 160 L235 160 L260 105 L75 90" fill="primary"/></g>`,
    frontLegsSvg: `<g id="frontLegs-root"><path d="M75 15 L70 100 L70 178 L90 178 L85 15" fill="primary"/></g>`,
    backLegsSvg: `<g id="backLegs-root"><path d="M195 15 L185 100 L185 178 L210 178 L205 15" fill="primary"/></g>`,
    tailSvg: "",
  });
  assert.equal(slots.tail.present, false);
  assert.equal(slots.tail.elementCount, 0);
});
