import type { AnimalPartType } from "../types";
import { detailDensityProfile, type DetailLevel } from "./detailDensity";

export const ENRICHMENT_STAGES = ["anatomy", "shading", "surface-detail"] as const;
export type EnrichmentStage = typeof ENRICHMENT_STAGES[number];
export type ArtworkStage = "silhouette" | EnrichmentStage;

export const SILHOUETTE_TARGETS: Record<AnimalPartType, number> = {
  head: 8,
  body: 6,
  frontLegs: 6,
  backLegs: 6,
  tail: 3,
};

export const SILHOUETTE_BANDS: Record<AnimalPartType, readonly [number, number]> = {
  head: [5, 12],
  body: [4, 10],
  frontLegs: [4, 10],
  backLegs: [4, 10],
  tail: [2, 6],
};

export const SILHOUETTE_DIRECTIONS = [
  "Natural proportions: prioritize a believable species-accurate stance and weight distribution.",
  "Strong read: exaggerate the single most recognizable external feature while keeping anatomy plausible.",
  "Pose clarity: prioritize clean negative space between limbs and an instantly readable line of action.",
  "Characterful proportions: explore a distinctive head-to-body ratio and expressive stance without becoming generic.",
] as const;

export const STAGE_LABELS: Record<ArtworkStage, string> = {
  silhouette: "Silhouette",
  anatomy: "Anatomy",
  shading: "Shading",
  "surface-detail": "Surface detail",
};

export function stageAdditionTarget(detailLevel: DetailLevel, slot: AnimalPartType, stage: EnrichmentStage): number {
  const finalTarget = detailDensityProfile(detailLevel).targets[slot];
  const remaining = Math.max(0, finalTarget - SILHOUETTE_TARGETS[slot]);
  const anatomy = Math.round(remaining * 0.36);
  const shading = Math.min(remaining - anatomy, Math.round(remaining * 0.28));
  if (stage === "anatomy") return anatomy;
  if (stage === "shading") return shading;
  return remaining - anatomy - shading;
}

export function cumulativeStageTarget(detailLevel: DetailLevel, slot: AnimalPartType, stage: ArtworkStage): number {
  if (stage === "silhouette") return SILHOUETTE_TARGETS[slot];
  const anatomy = stageAdditionTarget(detailLevel, slot, "anatomy");
  if (stage === "anatomy") return SILHOUETTE_TARGETS[slot] + anatomy;
  const shading = stageAdditionTarget(detailLevel, slot, "shading");
  if (stage === "shading") return SILHOUETTE_TARGETS[slot] + anatomy + shading;
  return detailDensityProfile(detailLevel).targets[slot];
}

export function densityBandForArtworkStage(detailLevel: DetailLevel, slot: AnimalPartType, stage?: ArtworkStage): readonly [number, number] {
  if (!stage) return detailDensityProfile(detailLevel).bands[slot];
  if (stage === "silhouette") return SILHOUETTE_BANDS[slot];
  if (stage === "surface-detail") return detailDensityProfile(detailLevel).bands[slot];
  const target = cumulativeStageTarget(detailLevel, slot, stage);
  return [Math.max(SILHOUETTE_BANDS[slot][0], Math.floor(target * 0.72)), Math.ceil(target * 1.32)];
}

const DRAWABLE_TAGS = new Set(["path", "circle", "rect", "ellipse", "polygon", "polyline", "line"]);
const DRAWABLE_TAG_PATTERN = "path|circle|rect|ellipse|polygon|polyline|line";
const ENRICHMENT_ATTRIBUTES = new Set([
  "id", "d", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry",
  "width", "height", "points", "fill", "fill-opacity", "fill-rule", "stroke",
  "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-dasharray",
  "stroke-opacity", "opacity", "transform", "data-name",
]);
const ATTRIBUTE_ALIASES: Record<string, string> = {
  fillopacity: "fill-opacity",
  fillrule: "fill-rule",
  strokeopacity: "stroke-opacity",
  strokewidth: "stroke-width",
  strokelinecap: "stroke-linecap",
  strokelinejoin: "stroke-linejoin",
  strokedasharray: "stroke-dasharray",
};
const PAINT_TOKENS = new Set(["primary", "primary-light", "primary-dark", "accent", "accent-dark", "outline", "highlight", "none"]);
const layerId = (slot: AnimalPartType, stage: EnrichmentStage) => `${slot}-${stage}-layer`;
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const idToken = (value: string) => value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "layer";

/** Recover an additions string when a provider truncates the surrounding JSON response. */
export function salvageEnrichmentAdditions(input: string): string | undefined {
  const marker = /["']?additions["']?\s*:\s*(["'])/i.exec(input);
  if (!marker) return new RegExp(`<\\s*(?:${DRAWABLE_TAG_PATTERN})\\b`, "i").test(input) ? input : undefined;
  const quote = marker[1];
  let result = "";
  for (let index = marker.index + marker[0].length; index < input.length; index += 1) {
    const character = input[index];
    if (character === quote) break;
    if (character !== "\\") {
      result += character;
      continue;
    }
    const escaped = input[++index];
    if (escaped === undefined) break;
    if (escaped === "u" && /^[0-9a-f]{4}$/i.test(input.slice(index + 1, index + 5))) {
      result += String.fromCharCode(Number.parseInt(input.slice(index + 1, index + 5), 16));
      index += 4;
      continue;
    }
    result += ({ n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" } as Record<string, string>)[escaped] ?? escaped;
  }
  return result.trim() || undefined;
}

function cleanDrawableAttributes(input: string): string {
  const cleaned = new Map<string, { quote: string; value: string }>();
  for (const match of input.matchAll(/([A-Za-z_:][\w:.-]*)\s*=\s*(["'])([\s\S]*?)\2/g)) {
    const rawName = match[1];
    const lowerName = rawName.toLowerCase();
    if (lowerName.startsWith("on")) throw new Error(`Enrichment additions may not contain event attribute '${rawName}'.`);
    const name = ATTRIBUTE_ALIASES[lowerName] ?? lowerName;
    if (!ENRICHMENT_ATTRIBUTES.has(name)) continue;
    let value = match[3].trim();
    if (/(?:javascript:|data:text\/html)/i.test(value)) throw new Error(`Enrichment attribute '${rawName}' contains an unsafe URL.`);
    if (name === "fill" || name === "stroke") {
      const normalized = value.toLowerCase().replace(/^var\(\s*--([^)]+)\s*\)$/, "$1");
      value = PAINT_TOKENS.has(normalized) ? normalized : name === "fill" ? "primary-light" : "outline";
    }
    if (name === "stroke-width") {
      const width = Number(value);
      if (Number.isFinite(width) && width < 1) value = "1";
    }
    cleaned.set(name, { quote: match[2], value });
  }
  return [...cleaned].map(([name, { quote, value }]) => `${name}=${quote}${value}${quote}`).join(" ");
}

export function cleanAdditionsFragment(input: string): string {
  const fragment = input.trim().replace(/^```(?:svg|xml)?\s*/i, "").replace(/\s*```$/i, "").replace(/<!--[\s\S]*?-->/g, "").trim();
  if (!fragment) throw new Error("The enrichment model returned no SVG additions.");
  const tags = [...fragment.matchAll(/<\s*(\/?)\s*([A-Za-z][\w:-]*)\b[^>]*>/g)];
  if (!tags.length) throw new Error("The enrichment model returned no drawable SVG elements.");
  for (const match of tags) {
    const tag = match[2].toLowerCase();
    if (!DRAWABLE_TAGS.has(tag)) throw new Error(`Enrichment additions may not contain <${tag}>; only flat drawable elements are allowed.`);
  }

  // Drawable primitives have no meaningful child markup in this pipeline. Models sometimes
  // emit `<path ...>` without `/>`, or pair it with the wrong closing primitive. Canonicalising
  // every permitted primitive to a self-closing element repairs that harmless syntax without
  // touching the locked silhouette or guessing at group structure.
  const elements = [...fragment.matchAll(new RegExp(`<\\s*(${DRAWABLE_TAG_PATTERN})\\b([^<>]*?)(?:\\/\\s*)?>`, "gi"))]
    .map((match) => {
      const tag = match[1];
      const attributes = match[2];
      const cleanAttributes = cleanDrawableAttributes(attributes);
      return `<${tag.toLowerCase()}${cleanAttributes ? ` ${cleanAttributes}` : ""}/>`;
    });
  if (!elements.length) throw new Error("The enrichment model returned no complete drawable SVG elements.");

  // Return only the extracted primitives. Explanatory prose, markdown labels and mismatched
  // primitive closing tags are discarded rather than copied into the accepted SVG layer.
  return elements.join("");
}

function namespaceFragmentIds(fragment: string, prefix: string): string {
  const ids = [...fragment.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1]);
  let result = fragment;
  for (const id of new Set(ids)) {
    const next = `${idToken(prefix)}-${idToken(id)}`;
    const escaped = escapeRegExp(id);
    result = result
      .replace(new RegExp(`(\\bid\\s*=\\s*["'])${escaped}(["'])`, "g"), `$1${next}$2`)
      .replace(new RegExp(`url\\(\\s*#${escaped}\\s*\\)`, "g"), `url(#${next})`)
      .replace(new RegExp(`((?:href|xlink:href)\\s*=\\s*["'])#${escaped}(["'])`, "g"), `$1#${next}$2`);
  }
  return result;
}

/**
 * Add or replace one flat enrichment layer immediately before the part root closes.
 *
 * The accepted silhouette string is never regenerated. Stage groups contain no nested
 * groups, making replacement and rollback deterministic rather than an XML-string guess.
 */
export function upsertEnrichmentLayer(
  silhouetteSvg: string,
  additions: string,
  slot: AnimalPartType,
  stage: EnrichmentStage,
): string {
  const rootPattern = new RegExp(`<g\\b[^>]*\\bid=["']${escapeRegExp(`${slot}-root`)}["'][^>]*>`, "i");
  if (!rootPattern.test(silhouetteSvg)) throw new Error(`The locked ${slot} silhouette is missing its required root group.`);
  const clean = namespaceFragmentIds(cleanAdditionsFragment(additions), `${slot}-${stage}`);
  const id = layerId(slot, stage);
  const layer = `<g id="${id}">${clean}</g>`;
  const existing = new RegExp(`<g\\b[^>]*\\bid=["']${escapeRegExp(id)}["'][^>]*>[\\s\\S]*?<\\/g>`, "i");
  if (existing.test(silhouetteSvg)) return silhouetteSvg.replace(existing, layer);
  const closing = silhouetteSvg.lastIndexOf("</g>");
  if (closing < 0) throw new Error(`The locked ${slot} silhouette has no closing root group.`);
  return silhouetteSvg.slice(0, closing) + layer + silhouetteSvg.slice(closing);
}

export function removeEnrichmentLayers(svg: string, slot: AnimalPartType): string {
  let result = svg;
  for (const stage of ENRICHMENT_STAGES) {
    const id = escapeRegExp(layerId(slot, stage));
    result = result.replace(new RegExp(`<g\\b[^>]*\\bid=["']${id}["'][^>]*>[\\s\\S]*?<\\/g>`, "gi"), "");
  }
  return result;
}

export function silhouettePreviewSvg(svg: string): string {
  const presentation = [
    `<defs><linearGradient id="silhouette-preview-gradient" x1="0" y1="0" x2="1" y2="1">`,
    `<stop offset="0%" stop-color="#e4e4e7"/>`,
    `<stop offset="52%" stop-color="#a1a1aa"/>`,
    `<stop offset="100%" stop-color="#71717a"/>`,
    `</linearGradient></defs>`,
    `<style>`,
    `[data-preview-background]{fill:url(#silhouette-preview-gradient)!important;stroke:none!important;opacity:1!important}`,
    `path,circle,rect:not([data-preview-background]),ellipse,polygon,polyline{fill:#18181b!important;stroke:#18181b!important;opacity:1!important}`,
    `line{stroke:#18181b!important;opacity:1!important}`,
    `</style>`,
  ].join("");
  return svg.replace(/<svg\b[^>]*>/i, (tag) => `${tag}${presentation}`);
}
