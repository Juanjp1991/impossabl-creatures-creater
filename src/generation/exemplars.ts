// §P2: show the style instead of describing it.
//
// `approvedStyleGuidePrompt()` emits six prose principles and a version string; its
// `examples` field was the literal strings "built-in bear" and "built-in cheetah", so no
// actual SVG ever reached the model. Prose is the weakest way to move style. The part bank
// already holds art the user has judged good enough to keep, which makes it the natural
// source of few-shot examples — and it means every part kept improves the next generation.
//
// DOM-free so it is unit-testable in node; the client passes the block to `/api/generate-part`
// because the server cannot read localStorage.

import type { AnimalPartType } from "../types";
import type { PartBankEntry } from "../partBank/contracts";
import { DENSITY_BANDS, FILL_BAND } from "./metrics";

/** Part SVGs are large; two is enough to show a style and still leave the budget for drawing. */
export const MAX_EXEMPLARS = 2;
/** Per-exemplar character cap. A 6k-character tail teaches nothing extra and crowds the call. */
export const MAX_EXEMPLAR_CHARS = 2400;

/**
 * Lower is better. Prefer entries that are clean, in-band and small enough to send: an
 * exemplar with validation errors teaches the model to repeat them, and the bank already
 * stores `stats` per entry so this can be ranked from measurements rather than guessed.
 */
export function exemplarRank(entry: PartBankEntry): number {
  const stats = entry.stats;
  if (!stats) return 50; // usable, but unmeasured art sorts below anything with numbers
  const band = DENSITY_BANDS[entry.slot];
  const densityPenalty = stats.elementCount < band[0] || stats.elementCount > band[1] ? 5 : 0;
  const fillPenalty = stats.fillRatio < FILL_BAND[0] || stats.fillRatio > FILL_BAND[1] ? 3 : 0;
  const seamPenalty = entry.slot === "body" || stats.seamPixels === null ? 0 : stats.seamPixels >= 40 ? 0 : 4;
  const sizePenalty = entry.svg.length > MAX_EXEMPLAR_CHARS ? 2 : 0;
  return stats.errorCount * 20 + densityPenalty + fillPenalty + seamPenalty + sizePenalty;
}

/** The entries that would be shown for `slot`, best first. */
export function selectExemplars(slot: AnimalPartType, entries: PartBankEntry[], limit = MAX_EXEMPLARS): PartBankEntry[] {
  return entries
    .filter((entry) => entry.exemplar && entry.slot === slot && entry.svg.trim())
    .sort((a, b) => exemplarRank(a) - exemplarRank(b) || (b.updatedAt || "").localeCompare(a.updatedAt || ""))
    .slice(0, Math.max(0, limit));
}

/**
 * Format the chosen exemplars as few-shot examples, or return undefined when the slot has
 * none — in which case the caller's prose principles stand as the only style guidance, which
 * is exactly today's behaviour.
 */
export function buildExemplarBlock(slot: AnimalPartType, entries: PartBankEntry[], limit = MAX_EXEMPLARS): string | undefined {
  const chosen = selectExemplars(slot, entries, limit);
  if (!chosen.length) return undefined;
  const examples = chosen.map((entry, index) => {
    const svg = entry.svg.length > MAX_EXEMPLAR_CHARS ? `${entry.svg.slice(0, MAX_EXEMPLAR_CHARS)}\n<!-- truncated -->` : entry.svg;
    return `EXAMPLE ${index + 1} — ${entry.name}:\n${svg}`;
  });
  return [
    `HOUSE STYLE BY EXAMPLE. The following ${chosen.length === 1 ? "is a" : "are"} ${slot} ${chosen.length === 1 ? "drawing" : "drawings"} the artist has approved as this project's house style. Match their line weight, shading language, level of detail and use of the ramp tokens. Do NOT copy their shapes or species — draw the animal you were asked for, in this style.`,
    ...examples,
  ].join("\n\n");
}
