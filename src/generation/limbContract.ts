import type { AnimalPartType } from "../types";

export const LIMB_CONTRACT_VERSION = "physical-four-v2" as const;
export type LimbContractVersion = typeof LIMB_CONTRACT_VERSION;
export type LimbPart = Extract<AnimalPartType, "frontLegs" | "backLegs">;
export type PhysicalLegId = "frontLeft" | "frontRight" | "backLeft" | "backRight";
export type LimbDepth = "near" | "far";

export interface PhysicalLegSpec {
  id: PhysicalLegId;
  label: string;
  part: LimbPart;
  side: "left" | "right";
  depth: LimbDepth;
  depthGroupId: string;
  groupId: string;
  limbGroupId: string;
  footGroupId: string;
}

/**
 * Canonical physical identity for a left-facing animal viewed from its left side.
 *
 * Array order is also the required horizontal order in the assembled drawing.
 */
export const PHYSICAL_LEGS: readonly PhysicalLegSpec[] = [
  { id: "frontLeft", label: "front-left leg", part: "frontLegs", side: "left", depth: "near", depthGroupId: "frontLegs-near", groupId: "front-left-leg", limbGroupId: "front-left-limb", footGroupId: "front-left-foot" },
  { id: "frontRight", label: "front-right leg", part: "frontLegs", side: "right", depth: "far", depthGroupId: "frontLegs-far", groupId: "front-right-leg", limbGroupId: "front-right-limb", footGroupId: "front-right-foot" },
  { id: "backLeft", label: "back-left leg", part: "backLegs", side: "left", depth: "near", depthGroupId: "backLegs-near", groupId: "back-left-leg", limbGroupId: "back-left-limb", footGroupId: "back-left-foot" },
  { id: "backRight", label: "back-right leg", part: "backLegs", side: "right", depth: "far", depthGroupId: "backLegs-far", groupId: "back-right-leg", limbGroupId: "back-right-limb", footGroupId: "back-right-foot" },
] as const;

export const PHYSICAL_LEG_BY_ID = Object.fromEntries(PHYSICAL_LEGS.map((leg) => [leg.id, leg])) as Record<PhysicalLegId, PhysicalLegSpec>;

export const LIMB_PAIR_SPECS: Record<LimbPart, { near: PhysicalLegSpec; far: PhysicalLegSpec }> = {
  frontLegs: {
    near: PHYSICAL_LEG_BY_ID.frontLeft,
    far: PHYSICAL_LEG_BY_ID.frontRight,
  },
  backLegs: {
    near: PHYSICAL_LEG_BY_ID.backLeft,
    far: PHYSICAL_LEG_BY_ID.backRight,
  },
};

/** The shared upper collar may overlap under the torso; separation is measured below it. */
export const LIMB_COLLAR_BOTTOM_Y = 35;
/** At least this much of the smaller lower-leg mask must remain independently visible. */
export const MAX_LOWER_LEG_OVERLAP_RATIO = 0.3;
/** Adjacent feet must have visible horizontal daylight in assembled coordinates. */
export const MIN_PHYSICAL_FOOT_GAP = 12;
/** Paired legs should retain recognisably similar normalized silhouettes. */
export const MIN_PAIRED_SILHOUETTE_SIMILARITY = 0.42;
/** A natural shoulder/hip needs a substantial opaque collar under the torso. */
export const MIN_LIMB_COLLAR_WIDTH = 24;
/** The collar should be wider than the middle/lower shaft, not a pointed stem. */
export const MIN_LIMB_COLLAR_TO_SHAFT_RATIO = 1.2;

export const physicalLegsForPart = (part: LimbPart) =>
  PHYSICAL_LEGS.filter((leg) => leg.part === part);

export const physicalLegContractIds = (part?: LimbPart) =>
  new Set(PHYSICAL_LEGS.filter((leg) => !part || leg.part === part)
    .flatMap((leg) => [leg.depthGroupId, leg.groupId, leg.limbGroupId, leg.footGroupId]));

export function limbSetAnatomyPrompt(part?: LimbPart): string {
  if (part === "frontLegs") {
    return "FRONT-LEG SET IDENTITY: draw the two front legs at the frontLegs body attachment as their own species-correct construction. Never copy, mirror, translate, rename or reuse the main back-leg limb subgroup geometry. Foot silhouette and construction may be reused when appropriate for the species, but every physical leg still emits its own separate foot group.";
  }
  if (part === "backLegs") {
    return "BACK-LEG SET IDENTITY: draw the two back legs at the backLegs body attachment as their own species-correct construction. Never copy, mirror, translate, rename or reuse the main front-leg limb subgroup geometry. Foot silhouette and construction may be reused when appropriate for the species, but every physical leg still emits its own separate foot group.";
  }
  return "FRONT AND BACK MAIN LIMB SETS ARE INDEPENDENT DRAWINGS: never create either main limb set by copying, mirroring, translating, renaming or reusing the other set's limb subgroup geometry. Follow the requested species and pose without forcing human arm anatomy or one generic mammal joint plan. Foot silhouette and construction may be reused across front and back when appropriate, but all four feet remain separate foot groups.";
}

export function physicalLegPrompt(part?: LimbPart): string {
  const selected = part ? physicalLegsForPart(part) : PHYSICAL_LEGS;
  const structure = selected.map((leg) =>
    `${leg.label} is <g id='${leg.groupId}'> inside <g id='${leg.depthGroupId}'>, containing separate <g id='${leg.limbGroupId}'> and <g id='${leg.footGroupId}'> groups`,
  ).join("; ");
  const pairRule = part
    ? `Within ${part}, the ${LIMB_PAIR_SPECS[part].near.label} and its foot are left of the ${LIMB_PAIR_SPECS[part].far.label} and its foot.`
    : "Across the assembled animal, legs and feet are strictly left-to-right: front-left, front-right, back-left, back-right.";
  return [
    `FOUR PHYSICAL LEGS — REQUIRED STRUCTURE: ${structure}.`,
    limbSetAnatomyPrompt(part),
    "Put the species-correct main leg shapes only inside the limb subgroup; put the separate paw, hoof, talon, toes, claws, pads or equivalent terminal anatomy only inside the foot subgroup. Both subgroups need multiple meaningful drawable shapes and remain independent animation targets.",
    `The top ${LIMB_COLLAR_BOTTOM_Y}px of every limb subgroup must form a smooth rounded shoulder or hip collar at least ${MIN_LIMB_COLLAR_WIDTH}px wide and visibly wider than its shaft. Use curved paths; never begin a leg with a sharp triangle, spike, needle or thin stem.`,
    "Let each rounded collar enter the torso by 10-18px, then taper gradually into the leg without an abrupt pinch.",
    pairRule,
    `Keep at least ${MIN_PHYSICAL_FOOT_GAP}px horizontal space between neighboring feet.`,
    `The two legs in a pair use closely related silhouettes, but below local y=${LIMB_COLLAR_BOTTOM_Y} they remain visibly separate and overlap no more than ${Math.round(MAX_LOWER_LEG_OVERLAP_RATIO * 100)}% of the smaller leg.`,
    "The left/near leg uses normal primary shading. The right/far leg uses primary-dark and accent-dark so it is visibly behind.",
    "Reuse a closely related or identical foot silhouette when appropriate for the species, within a pair or across front and back sets, but emit four separate foot groups with their own drawable shapes; the far feet may be slightly smaller, shifted and darker. Do not use <use>.",
    "Only the upper shoulder/hip collars may overlap under the body; never stack one complete leg silhouette on top of the other.",
  ].join(" ");
}

const DARKEN_TOKEN: Record<string, string> = {
  "primary-light": "primary",
  primary: "primary-dark",
  accent: "accent-dark",
  highlight: "primary-light",
};

/**
 * Find one complete `<g>` subtree without requiring a browser DOM.
 */
export function extractSvgGroupMarkup(svg: string, groupId: string): string | undefined {
  const escaped = groupId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const opening = new RegExp(`<g\\b(?=[^>]*\\bid\\s*=\\s*["']${escaped}["'])[^>]*>`, "i").exec(svg);
  if (!opening || opening.index === undefined) return undefined;
  const start = opening.index;
  const token = /<\/?g\b[^>]*>/gi;
  token.lastIndex = start;
  let depth = 0;
  let match: RegExpExecArray | null;
  while ((match = token.exec(svg))) {
    if (/^<\/g/i.test(match[0])) depth--;
    else if (!/\/\s*>$/.test(match[0])) depth++;
    if (depth === 0) return svg.slice(start, token.lastIndex);
  }
  return undefined;
}

function replaceSvgGroupMarkup(svg: string, groupId: string, rewrite: (markup: string) => string): string {
  const markup = extractSvgGroupMarkup(svg, groupId);
  return markup ? svg.replace(markup, rewrite(markup)) : svg;
}

const darkenPaintTokens = (markup: string) => markup
  .replace(
    /(\b(?:fill|stroke)\s*=\s*["']\s*)(primary-light|primary|accent|highlight)(\s*["'])/gi,
    (_match, before: string, token: string, after: string) => `${before}${DARKEN_TOKEN[token.toLowerCase()] ?? token}${after}`,
  )
  .replace(
    /((?:fill|stroke)\s*:\s*)(primary-light|primary|accent|highlight)(?=\s*(?:;|["']))/gi,
    (_match, before: string, token: string) => `${before}${DARKEN_TOKEN[token.toLowerCase()] ?? token}`,
  )
  .replace(
    /(\b(?:fill|stroke)\s*=\s*["']\s*var\(\s*--)(primary-light|primary|accent|highlight)(\s*(?:,[^)]+)?\)\s*["'])/gi,
    (_match, before: string, token: string, after: string) => `${before}${DARKEN_TOKEN[token.toLowerCase()] ?? token}${after}`,
  );

/**
 * Background legs are shaded deterministically so model output cannot swap near/far values.
 */
export function darkenFarLegGroups(svg: string, part: LimbPart): string {
  return replaceSvgGroupMarkup(svg, LIMB_PAIR_SPECS[part].far.depthGroupId, darkenPaintTokens);
}

export function farLegUsesDarkPalette(svg: string, part: LimbPart): boolean {
  const markup = extractSvgGroupMarkup(svg, LIMB_PAIR_SPECS[part].far.depthGroupId);
  return Boolean(markup && /(?:fill|stroke)\s*(?:=|:)\s*["']?\s*(?:var\(\s*--)?(?:primary-dark|accent-dark)\b/i.test(markup));
}
