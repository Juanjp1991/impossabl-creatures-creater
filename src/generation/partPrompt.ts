// §P1 prompt split: one shared house-style core, one slot-specific section.
//
// The single mega-call asks for ~59 shapes across five parts while the same system
// instruction carries every slot's coordinate space, anchors, collars, seam minimums, ground
// contacts, layer order, depth groups, layout metadata, palette, stroke weights, density
// bands and the style guide. Every rule competes with the drawing task for attention, and the
// fields generated last come back thinnest.
//
// Splitting it means a head call is never told about hind-leg hock continuity. The shared
// block is byte-identical across all five calls on purpose — it is the only thing holding
// five independent drawings to one style.

import type { AnimalPartType } from "../types";
import type { GuidedAnimalBrief } from "./contracts";
import { DETAIL_DENSITY_PROFILES, detailDensityProfile, resolveDetailLevel } from "./detailDensity";
import { SILHOUETTE_BANDS, SILHOUETTE_TARGETS } from "./silhouettePolicy";

export const PART_PROMPT_VERSION = "p1-part-1.0.0";
export const SILHOUETTE_PROMPT_VERSION = "silhouette-part-1.0.0";

/** Fixed local view per slot, matching `VIEW` in geometry.ts. */
export const SLOT_VIEW: Record<AnimalPartType, { width: number; height: number }> = {
  head: { width: 160, height: 160 },
  body: { width: 300, height: 220 },
  frontLegs: { width: 260, height: 180 },
  backLegs: { width: 260, height: 180 },
  tail: { width: 160, height: 160 },
};

/** Where this part meets the body, in the part's own local space. */
export const SLOT_ATTACHMENT: Record<Exclude<AnimalPartType, "body">, { x: number; y: number }> = {
  head: { x: 120, y: 110 },
  frontLegs: { x: 75, y: 15 },
  backLegs: { x: 195, y: 15 },
  tail: { x: 15, y: 15 },
};

/** Mid-band element target — the plan's finding is that the floor is where output lands. */
export const SLOT_DENSITY_TARGET: Record<AnimalPartType, number> = DETAIL_DENSITY_PROFILES.medium.targets;

const SLOT_ANATOMY: Record<AnimalPartType, string> = {
  head: "skull mass, muzzle or beak, jaw and cheek, both ears (near and far), the visible eye with a highlight, nostril and mouth line, any horns or antlers, and the species' facial markings",
  body: "distinct shoulder, ribcage, chest, belly and haunch masses, the back line and its withers or hump, and the species' signature trunk markings",
  frontLegs: "the near and far foreleg each with shoulder mass, forearm, knee, pastern and a paw or hoof with visible digits where the species has them",
  backLegs: "the near and far hind leg each with thigh and hip mass, a clearly angled hock, lower leg, and a paw or hoof with visible digits where the species has them",
  tail: "the base where it leaves the body, the length with its curve, and the tip with any tuft, plume or banding",
};

const SLOT_SILHOUETTE: Record<AnimalPartType, string> = {
  head: "the external skull, muzzle or beak, jaw, both visible ear contours, and external horns, tusks or antlers that define the species",
  body: "one coherent external torso mass with readable shoulder, chest, belly, back and haunch contours",
  frontLegs: "separate near and far foreleg masses, each continuous from the shoulder collar through the knee to a grounded paw or hoof",
  backLegs: "separate near and far hind-leg masses, each continuous from the hip through a readable hock to a grounded paw or hoof",
  tail: "a continuous external base, length, curve and species-defining tip",
};

/**
 * The block every part call shares verbatim: palette, stroke weights, output shape.
 * Nothing here is slot-specific — that is the point.
 */
export function sharedHouseStyle(palette?: { color: string; accentColor: string }): string {
  return [
    "COLOUR: use ONLY these shared ramp tokens as fill and stroke values inside the SVG, never raw hex or rgb — primary with primary-light and primary-dark for the main silhouette and its shading, accent with accent-dark for markings, the fixed token outline for dark outlines and highlight for light glints.",
    palette
      ? `The creature's palette is already fixed for this animal: primary is ${palette.color} and accent is ${palette.accentColor}. Draw to those colours through the ramp tokens; do not invent a different palette.`
      : "Choose the creature's two concrete 6-digit hex colours and return them in the color and accentColor fields — real, species-appropriate colours, never the words \"primary\"/\"accent\". Every ramp token is computed from those two hexes at render time.",
    "STROKE WEIGHT: stroke-width 3 for silhouette outlines and 1 to 1.5 for fine internal detail; never below 1.",
    "Use compact valid inner SVG only: no <svg> wrapper and no gradients, filters, masks or clipPaths. Every group ID is unique.",
  ].join(" ");
}

/** The slot's own section: its view, its anchor, its density target, its anatomy checklist. */
export function slotSection(slot: AnimalPartType, detailLevel: GuidedAnimalBrief["detailLevel"] = "medium"): string {
  const view = SLOT_VIEW[slot];
  const resolvedDetail = resolveDetailLevel(detailLevel);
  const profile = detailDensityProfile(resolvedDetail);
  const band = profile.bands[slot];
  const target = profile.targets[slot];
  const lines = [
    `You are drawing the ${slot} only, in ITS OWN fixed local coordinate space: 0..${view.width} across by 0..${view.height} down. Restart coordinates near zero; never add an assembled-canvas offset.`,
    `Wrap everything in a single root group with id "${slot}-root".`,
  ];
  if (slot === "body") {
    lines.push(
      "Give the torso opaque geometry around all four socket anchors so limbs and head have something solid to meet.",
      "Return bodyConnections in BODY-LOCAL coordinates: neck x40-120 y50-130, tail x200-280 y80-160, frontLegs x70-140 y130-190, backLegs x180-250 y130-190, with the neck left of the tail."
    );
  } else {
    const anchor = SLOT_ATTACHMENT[slot as Exclude<AnimalPartType, "body">];
    lines.push(
      `This part meets the body near local (${anchor.x},${anchor.y}). Exact placement is corrected in code, so approximate is fine — but the silhouette must be opaque there, and the connection profile you return must name the local point that actually meets the body.`
    );
  }
  if (slot === "frontLegs" || slot === "backLegs") {
    lines.push(
      "Create a broad 24-40px upper-limb collar spanning local y=0..35 so 10-18px of the limb visibly enters the torso.",
      `Every ${slot === "frontLegs" ? "foreleg silhouette is continuous from shoulder to paw" : "hind-leg silhouette is continuous from hip through hock to paw"}, never floating fragments.`,
      `Put every visible limb shape under a semantic depth group and emit the exact far/near group IDs ${slot}-far and ${slot}-near.`,
      "Grounded paws stay within 10px of a common ground line; return that line and the ground contact points."
    );
  }
  lines.push(
    `DETAIL DENSITY — ${profile.label.toUpperCase()}: target about ${target} visible SVG shapes, permitted range ${band[0]}-${band[1]}. Count drawable path, circle, rect, ellipse, polygon, polyline and line elements. Every shape must describe silhouette, anatomy, shading, markings or a species-defining feature; never pad the count with random decoration. Under-detailing is the most common failure and is worse than slight over-detailing.`,
    `Draw ${SLOT_ANATOMY[slot]}.`,
    `Let the part fill about 65-95% of its own local view height.`
  );
  return lines.join(" ");
}

export function silhouetteSlotSection(slot: AnimalPartType): string {
  const view = SLOT_VIEW[slot];
  const band = SILHOUETTE_BANDS[slot];
  const lines = [
    `Draw the ${slot} only in its fixed local coordinate space: 0..${view.width} across by 0..${view.height} down.`,
    `Wrap everything in one root group with id "${slot}-root".`,
  ];
  if (slot === "body") {
    lines.push(
      "Keep opaque torso geometry around all four socket anchors.",
      "Return bodyConnections in BODY-LOCAL coordinates: neck x40-120 y50-130, tail x200-280 y80-160, frontLegs x70-140 y130-190 and backLegs x180-250 y130-190.",
    );
  } else {
    const anchor = SLOT_ATTACHMENT[slot as Exclude<AnimalPartType, "body">];
    lines.push(`The silhouette must be opaque where it meets the body near local (${anchor.x},${anchor.y}); return that actual local attachment point.`);
  }
  if (slot === "frontLegs" || slot === "backLegs") {
    lines.push(
      "Create a broad 24-40px upper-limb collar across local y=0..35 so the legs visibly enter the torso.",
      `Place all far-leg shapes in "${slot}-far" and all near-leg shapes in "${slot}-near".`,
      "Keep the paws within 10px of a shared ground line and return their ground contacts.",
    );
  }
  lines.push(
    `SILHOUETTE BUDGET: target about ${SILHOUETTE_TARGETS[slot]} purposeful visible SVG shapes, permitted range ${band[0]}-${band[1]}. Fewer strong organic masses are better than fragmented pieces.`,
    `Show ${SLOT_SILHOUETTE[slot]}.`,
    "Let the silhouette fill about 65-95% of its local view height.",
  );
  return lines.join(" ");
}

export interface PartPromptInput {
  slot: AnimalPartType;
  brief: GuidedAnimalBrief;
  /** Fixed before the attached parts are drawn, so five calls cannot disagree on colour. */
  palette?: { color: string; accentColor: string };
  /** The chosen body SVG, so attached parts are drawn to fit what they will sit on. */
  bodyContext?: string;
  /** Reference-image directive from `referenceDirective`/`partReferenceDirective`. */
  referenceRules: string;
  /** House-style exemplars (§P2), already formatted. */
  exemplars?: string;
  styleGuide: string;
}

/** Assemble the full system instruction for one part call. */
export function buildPartSystemInstruction(input: PartPromptInput): string {
  const { slot, brief, palette, bodyContext, referenceRules, exemplars, styleGuide } = input;
  return [
    `You draw ONE part of a left-facing, side-view SVG animal: the ${slot}. You draw nothing else — no other body part appears in your output.`,
    referenceRules,
    `The animal is: ${brief.summary || brief.animalName}.`,
    "Plan recognizable, species-specific proportions before drawing; use purposeful organic contour, marking and shading shapes rather than generic rectangles, simple ellipses or disconnected decoration. Preserve a crouched, seated, swimming or folded-limb pose where the species calls for it; do not straighten limbs merely to fill the local view.",
    slotSection(slot, brief.detailLevel),
    sharedHouseStyle(palette),
    bodyContext
      ? `The body this part must fit has already been drawn. Match its proportion, line weight and shading language exactly; this is the same animal, not a second one. BODY SVG:\n${bodyContext}`
      : "",
    exemplars ?? "",
    styleGuide,
    `Prompt version ${PART_PROMPT_VERSION}.`,
  ].filter(Boolean).join("\n\n");
}

export function buildSilhouettePartSystemInstruction(input: PartPromptInput & { direction?: string }): string {
  const { slot, brief, palette, bodyContext, referenceRules, direction } = input;
  return [
    `You are creating the SILHOUETTE FOUNDATION for one part of a left-facing side-view animal: ${slot}.`,
    "The outer contour, pose, proportions, negative space and attachment are the entire task. Do not draw eyes, pupils, nostrils, mouth lines, markings, highlights, texture, fur lines, wrinkles, internal anatomy planes or decorative shapes.",
    referenceRules,
    `The animal is: ${brief.summary || brief.animalName}.`,
    direction ? `CONCEPT DIRECTION: ${direction}` : "",
    silhouetteSlotSection(slot),
    "Use only compact valid inner SVG with path, circle, ellipse, rect, polygon, polyline, line and group elements. No <svg> wrapper, gradients, filters, masks or clipPaths. Every ID is unique.",
    "Use primary for near silhouette masses, primary-dark for far limb masses, and outline only for a clean 3px external contour. Do not use accent, highlights, opacity tricks or internal strokes.",
    palette
      ? `The locked palette is primary ${palette.color} and accent ${palette.accentColor}; keep using ramp tokens inside the SVG.`
      : "Choose concrete species-appropriate top-level color and accentColor hex values; SVG fills remain ramp tokens.",
    bodyContext
      ? `Fit this part to the exact body silhouette below. Preserve its scale, pose language and socket relationship:\n${bodyContext}`
      : "",
    `Prompt version ${SILHOUETTE_PROMPT_VERSION}.`,
  ].filter(Boolean).join("\n\n");
}
