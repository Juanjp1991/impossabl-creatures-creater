import test from "node:test";
import assert from "node:assert/strict";

import type { PartBankEntry } from "../partBank/contracts";
import { buildExemplarBlock, exemplarRank, MAX_EXEMPLAR_CHARS, selectExemplars } from "./exemplars";

const entry = (over: Partial<PartBankEntry> & { id: string }): PartBankEntry => ({
  slot: "head",
  name: `Entry ${over.id}`,
  svg: `<g id="head-root"><path d="M10 10 L20 20"/></g>`,
  color: "#8B5A2B",
  accentColor: "#F5E6C8",
  source: "generated",
  tags: [],
  favorite: false,
  exemplar: true,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
  revision: 1,
  lineageId: over.id,
  stats: { seamPixels: 200, fillRatio: 0.8, elementCount: 18, errorCount: 0 },
  ...over,
});

test("only entries explicitly marked as exemplars are shown", () => {
  const entries = [entry({ id: "a" }), entry({ id: "b", exemplar: false }), entry({ id: "c", exemplar: false, favorite: true })];
  assert.deepEqual(selectExemplars("head", entries).map((e) => e.id), ["a"]);
});

test("a favourite is not an exemplar: the two judgements stay separate", () => {
  const entries = [entry({ id: "fav", exemplar: false, favorite: true })];
  assert.equal(buildExemplarBlock("head", entries), undefined);
});

test("exemplars are scoped to the slot being drawn", () => {
  const entries = [entry({ id: "head-1" }), entry({ id: "tail-1", slot: "tail" })];
  assert.deepEqual(selectExemplars("tail", entries).map((e) => e.id), ["tail-1"]);
});

test("clean, in-band art outranks art with validation errors", () => {
  const clean = entry({ id: "clean" });
  const broken = entry({ id: "broken", stats: { seamPixels: 200, fillRatio: 0.8, elementCount: 18, errorCount: 2 } });
  assert.ok(exemplarRank(clean) < exemplarRank(broken));
  assert.deepEqual(selectExemplars("head", [broken, clean]).map((e) => e.id), ["clean", "broken"]);
});

test("out-of-band density, out-of-band fill and an open seam all cost rank", () => {
  const base = entry({ id: "base" });
  const thin = entry({ id: "thin", stats: { seamPixels: 200, fillRatio: 0.8, elementCount: 2, errorCount: 0 } });
  const overflowing = entry({ id: "overflowing", stats: { seamPixels: 200, fillRatio: 1.1, elementCount: 18, errorCount: 0 } });
  const openSeam = entry({ id: "open", stats: { seamPixels: 3, fillRatio: 0.8, elementCount: 18, errorCount: 0 } });
  for (const worse of [thin, overflowing, openSeam]) assert.ok(exemplarRank(base) < exemplarRank(worse), worse.id);
});

test("unmeasured art is usable but sorts below anything with stats", () => {
  const measured = entry({ id: "measured" });
  const unmeasured = entry({ id: "unmeasured", stats: undefined });
  assert.ok(exemplarRank(measured) < exemplarRank(unmeasured));
  assert.deepEqual(selectExemplars("head", [unmeasured, measured]).map((e) => e.id), ["measured", "unmeasured"]);
});

test("at most two exemplars are sent, newest first among equals", () => {
  const entries = [
    entry({ id: "old", updatedAt: "2026-01-01T00:00:00.000Z" }),
    entry({ id: "new", updatedAt: "2026-07-20T00:00:00.000Z" }),
    entry({ id: "mid", updatedAt: "2026-04-01T00:00:00.000Z" }),
  ];
  assert.deepEqual(selectExemplars("head", entries).map((e) => e.id), ["new", "mid"]);
});

test("a slot with no exemplars falls back to prose by returning nothing", () => {
  assert.equal(buildExemplarBlock("frontLegs", [entry({ id: "a" })]), undefined);
  assert.equal(buildExemplarBlock("head", []), undefined);
});

test("the block shows the art and forbids copying its species", () => {
  const block = buildExemplarBlock("head", [entry({ id: "a", name: "Fox head #2" })])!;
  assert.match(block, /HOUSE STYLE BY EXAMPLE/);
  assert.match(block, /Fox head #2/);
  assert.match(block, /<g id="head-root">/);
  assert.match(block, /Do NOT copy their shapes or species/);
});

test("an oversized exemplar is truncated rather than dropped", () => {
  const huge = entry({ id: "huge", svg: `<g id="head-root">${"<path d='M0 0'/>".repeat(500)}</g>` });
  assert.ok(huge.svg.length > MAX_EXEMPLAR_CHARS);
  const block = buildExemplarBlock("head", [huge])!;
  assert.match(block, /truncated/);
  assert.ok(block.length < huge.svg.length + 600);
});
