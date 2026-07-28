import test from "node:test";
import assert from "node:assert/strict";

import { PART_TYPES } from "./contracts";
import { DETAIL_LEVELS, detailDensityProfile } from "./detailDensity";
import {
  ENRICHMENT_STAGES,
  SILHOUETTE_BANDS,
  SILHOUETTE_TARGETS,
  cleanAdditionsFragment,
  cumulativeStageTarget,
  densityBandForArtworkStage,
  removeEnrichmentLayers,
  salvageEnrichmentAdditions,
  silhouettePreviewSvg,
  stageAdditionTarget,
  upsertEnrichmentLayer,
} from "./silhouettePolicy";

test("silhouette generation begins with a deliberately small 29-shape structural budget", () => {
  assert.equal(Object.values(SILHOUETTE_TARGETS).reduce((sum, count) => sum + count, 0), 29);
  for (const slot of PART_TYPES) {
    const [minimum, maximum] = SILHOUETTE_BANDS[slot];
    assert.ok(SILHOUETTE_TARGETS[slot] >= minimum && SILHOUETTE_TARGETS[slot] <= maximum);
  }
});

test("stage addition counts land exactly on every selected detail target without padding", () => {
  for (const detailLevel of DETAIL_LEVELS) {
    for (const slot of PART_TYPES) {
      const additions = ENRICHMENT_STAGES.reduce(
        (sum, stage) => sum + stageAdditionTarget(detailLevel, slot, stage),
        0,
      );
      assert.equal(
        SILHOUETTE_TARGETS[slot] + additions,
        detailDensityProfile(detailLevel).targets[slot],
        `${detailLevel} ${slot}`,
      );
      assert.equal(
        cumulativeStageTarget(detailLevel, slot, "surface-detail"),
        detailDensityProfile(detailLevel).targets[slot],
      );
    }
  }
});

test("stage-aware density bands grow from silhouette to final artwork", () => {
  for (const slot of PART_TYPES) {
    const silhouette = densityBandForArtworkStage("ultra", slot, "silhouette");
    const anatomy = densityBandForArtworkStage("ultra", slot, "anatomy");
    const shading = densityBandForArtworkStage("ultra", slot, "shading");
    const final = densityBandForArtworkStage("ultra", slot, "surface-detail");
    assert.ok(anatomy[1] >= silhouette[1], `${slot} anatomy`);
    assert.ok(shading[1] >= anatomy[1], `${slot} shading`);
    assert.ok(final[1] >= shading[1], `${slot} final`);
  }
});

test("additive layers preserve the locked silhouette byte-for-byte and roll back exactly", () => {
  const locked = `<g id="head-root"><path id="head-mass" d="M0 0L10 0L10 10Z" fill="primary"/></g>`;
  const anatomy = upsertEnrichmentLayer(
    locked,
    `<path id="cheek" d="M2 2L8 2L5 7Z" fill="primary-light"/>`,
    "head",
    "anatomy",
  );
  const shaded = upsertEnrichmentLayer(
    anatomy,
    `<path id="cheek-shadow" d="M3 4L7 4L5 7Z" fill="primary-dark"/>`,
    "head",
    "shading",
  );
  assert.equal(removeEnrichmentLayers(shaded, "head"), locked);
  assert.match(shaded, /id="head-anatomy-cheek"/);
  assert.match(shaded, /id="head-shading-cheek-shadow"/);
});

test("regenerating a stage replaces its layer instead of accumulating copies", () => {
  const locked = `<g id="tail-root"><path d="M0 0L20 4L0 8Z" fill="primary"/></g>`;
  const first = upsertEnrichmentLayer(locked, `<path id="stripe-a" d="M5 1L6 7" stroke="accent"/>`, "tail", "surface-detail");
  const second = upsertEnrichmentLayer(first, `<path id="stripe-b" d="M9 2L10 6" stroke="accent"/>`, "tail", "surface-detail");
  assert.equal((second.match(/id="tail-surface-detail-layer"/g) ?? []).length, 1);
  assert.doesNotMatch(second, /stripe-a/);
  assert.match(second, /tail-surface-detail-stripe-b/);
});

test("enrichment accepts only flat drawable SVG additions", () => {
  assert.equal(cleanAdditionsFragment("```svg\n<circle cx=\"4\" cy=\"4\" r=\"2\"/>\n```"), `<circle cx="4" cy="4" r="2"/>`);
  assert.equal(
    cleanAdditionsFragment(`<path id="plane" d="M0 0L4 4"></path><circle cx="2" cy="2" r="1">`),
    `<path id="plane" d="M0 0L4 4"/><circle cx="2" cy="2" r="1"/>`,
  );
  assert.equal(
    cleanAdditionsFragment(`<path id="first" d="M0 0"></circle><ellipse id="second" cx="2" cy="2" rx="1" ry="1">`),
    `<path id="first" d="M0 0"/><ellipse id="second" cx="2" cy="2" rx="1" ry="1"/>`,
  );
  assert.equal(
    cleanAdditionsFragment(`ANATOMY ADDITIONS:\n<path id="cheek" d="M0 0L4 4">\nThese shapes explain the skull.`),
    `<path id="cheek" d="M0 0L4 4"/>`,
  );
  assert.equal(
    cleanAdditionsFragment(`<path id="shadow" d="M0 0L4 4" me="model noise" strokeWidth="0.4" fill="#998877"/>`),
    `<path id="shadow" d="M0 0L4 4" stroke-width="1" fill="primary-light"/>`,
  );
  assert.throws(() => cleanAdditionsFragment(`<g><path d="M0 0"/></g>`), /may not contain <g>/);
  assert.throws(() => cleanAdditionsFragment(`<script>alert(1)</script>`), /may not contain <script>/);
  assert.throws(() => cleanAdditionsFragment(`<svg><path d="M0 0"/></svg>`), /may not contain <svg>/);
  assert.throws(() => cleanAdditionsFragment(`<path d="M0 0" onclick="alert(1)"/>`), /event attribute/);
  assert.equal(cleanAdditionsFragment(`<path d="M0 0"/> not svg`), `<path d="M0 0"/>`);
});

test("truncated enrichment JSON salvages its complete SVG primitives", () => {
  const truncated = `{"additions":"<path id=\\"plane\\" d=\\"M0 0L4 4\\"/><circle cx=\\"2\\" cy=\\"2\\" r=\\"1\\"/><path d=\\"M`;
  const salvaged = salvageEnrichmentAdditions(truncated);
  assert.equal(salvaged, `<path id="plane" d="M0 0L4 4"/><circle cx="2" cy="2" r="1"/><path d="M`);
  assert.equal(
    cleanAdditionsFragment(salvaged!),
    `<path id="plane" d="M0 0L4 4"/><circle cx="2" cy="2" r="1"/>`,
  );
  assert.equal(salvageEnrichmentAdditions(`{"message":"no drawing"}`), undefined);
});

test("silhouette previews force drawable art to one opaque dark mask", () => {
  const preview = silhouettePreviewSvg(`<svg viewBox="0 0 10 10"><rect width="10" height="10" fill="#fafafa" data-preview-background="true"/><circle cx="5" cy="5" r="4" fill="accent"/></svg>`);
  assert.match(preview, /fill:#18181b!important/);
  assert.match(preview, /opacity:1!important/);
  assert.match(preview, /linearGradient id="silhouette-preview-gradient"/);
  assert.match(preview, /\[data-preview-background\]\{fill:url\(#silhouette-preview-gradient\)!important/);
  assert.match(preview, /rect:not\(\[data-preview-background\]\)/);
  assert.match(preview, /<circle/);
});
