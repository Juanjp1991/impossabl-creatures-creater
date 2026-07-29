// §P1 prompt split: one shared house-style core, one slot-specific section.
//
// The single mega-call can ask for hundreds of shapes across five parts while the same system
// instruction carries every slot's coordinate space, anchors, collars, seam minimums, ground
// contacts, layer order, depth groups, layout metadata, palette, stroke weights, density bands
// and the style guide. Every rule competes with the drawing task for attention, and the fields
// generated last tend to come back thinnest.
//
// Splitting it means a head call is never told about back-leg construction. The shared
// block is byte-identical across all five calls on purpose — it is the only thing holding
// five independent drawings to one style.

import type { AnimalPartType } from "../types";
import type { GuidedAnimalBrief } from "./contracts";
import { DETAIL_DENSITY_PROFILES, detailDensityProfile, resolveDetailLevel } from "./detailDensity";
import { physicalLegPrompt } from "./limbContract";

export const PART_PROMPT_VERSION = "p1-part-1.7.0";

/**
 * Preferred head composition: a readable three-quarter face keeps the charm of a
 * side-view creature while making the full expression visible.
 */
export const HEAD_COMPOSITION_PROMPT = [
  "HEAD COMPOSITION — REQUIRED: draw a friendly three-quarter head turned partly toward the viewer with a clear gentle tilt; never use a flat one-eye side profile.",
  "Show two distinct, fully visible eyes and two distinct, fully visible ears, with the far eye and far ear slightly smaller or darker for depth.",
  "Place the muzzle or beak below and between the eyes, show the nose or nostrils clearly, and draw one complete readable mouth beneath it.",
  "Build the tilt into the head geometry while keeping the rear neck connection solid at local (120,110). Preserve the species' real anatomy and recognizable features.",
].join(" ");

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
  head: "skull mass, muzzle or beak, jaw and cheek, both ears (near and far), both eyes with highlights, nose and nostrils, a complete mouth line, any horns or antlers, and the species' facial markings",
  body: "distinct shoulder, ribcage, chest, belly and haunch masses, the back line and its withers or hump, and the species' signature trunk markings",
  frontLegs: "two complete, species-correct front legs with natural attachment mass, readable leg structure, and separate front feet with visible terminal anatomy where the species has it",
  backLegs: "two complete, species-correct back legs with natural attachment mass, readable leg structure, and separate back feet with visible terminal anatomy where the species has it",
  tail: "the base where it leaves the body, the length with its curve, and the tip with any tuft, plume or banding",
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
    const perFootTarget = Math.max(2, Math.round(target * 0.15));
    lines.push(
      "Create a broad 24-40px upper-limb collar spanning local y=0..35 so 10-18px of the limb visibly enters the torso.",
      `Every ${slot === "frontLegs" ? "front-leg silhouette" : "back-leg silhouette"} is continuous from its broad body attachment to its separate foot, never floating fragments.`,
      physicalLegPrompt(slot),
      `Reserve about ${perFootTarget} meaningful drawable shapes for EACH foot subgroup at this detail level; use the remaining leg-set budget for the two rounded collars, upper limbs, joints and lower limbs.`,
      "Grounded paws stay within 10px of a common ground line; return two ground contact points in left-leg then right-leg order."
    );
  }
  if (slot === "head") lines.push(HEAD_COMPOSITION_PROMPT);
  lines.push(
    `DETAIL DENSITY — ${profile.label.toUpperCase()}: target about ${target} visible SVG shapes, permitted range ${band[0]}-${band[1]}. Count drawable path, circle, rect, ellipse, polygon, polyline and line elements. Every shape must describe silhouette, anatomy, shading, markings or a species-defining feature; never pad the count with random decoration. Under-detailing is the most common failure and is worse than slight over-detailing.`,
    `Draw ${SLOT_ANATOMY[slot]}.`,
    `Let the part fill about 65-95% of its own local view height.`
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
  /**
   * The other leg set, supplied only as a negative comparison. This prevents a model from
   * solving the front legs once and then cloning that solution into the back-leg field.
   */
  oppositeLegContext?: string;
  /** Reference-image directive from `referenceDirective`/`partReferenceDirective`. */
  referenceRules: string;
  /** House-style exemplars (§P2), already formatted. */
  exemplars?: string;
  styleGuide: string;
}

/** Assemble the full system instruction for one part call. */
export function buildPartSystemInstruction(input: PartPromptInput): string {
  const { slot, brief, palette, bodyContext, oppositeLegContext, referenceRules, exemplars, styleGuide } = input;
  const isLegSlot = slot === "frontLegs" || slot === "backLegs";
  return [
    slot === "head"
      ? "You draw ONLY the head of a left-facing SVG animal. The body remains side-view, but the head turns three-quarter toward the viewer. No other body part appears in your output."
      : `You draw ONE part of a left-facing, side-view SVG animal: the ${slot}. You draw nothing else — no other body part appears in your output.`,
    referenceRules,
    `The animal is: ${brief.summary || brief.animalName}.`,
    "Plan recognizable, species-specific proportions before drawing; use purposeful organic contour, marking and shading shapes rather than generic rectangles, simple ellipses or disconnected decoration. Preserve a crouched, seated, swimming or folded-limb pose where the species calls for it; do not straighten limbs merely to fill the local view.",
    slotSection(slot, brief.detailLevel),
    sharedHouseStyle(palette),
    bodyContext
      ? `The body this part must fit has already been drawn. Match its proportion, line weight and shading language exactly; this is the same animal, not a second one. BODY SVG:\n${bodyContext}`
      : "",
    isLegSlot && oppositeLegContext
      ? [
          "OPPOSITE LEG SET — NEGATIVE COMPARISON ONLY:",
          `The SVG below is the already drawn ${slot === "frontLegs" ? "back" : "front"} leg set. Do not treat it as an exemplar and do not copy, mirror, translate, rename or lightly edit its main limb silhouettes or path geometry.`,
          `Draw a genuinely independent, species-correct ${slot === "frontLegs" ? "front" : "back"} load-bearing limb construction and pose. The difference must be visible in the broad upper attachment, main limb contour and bend—not merely in one marking, highlight or toe.`,
          "The feet are the one exception: their silhouette and construction MAY match or be reused when that is anatomically appropriate, but each foot must still be drawn as its own separate subgroup with its own drawable shapes and never through <use>.",
          `OPPOSITE LEG SVG:\n${oppositeLegContext}`,
        ].join("\n")
      : "",
    exemplars ?? "",
    styleGuide,
    `Prompt version ${PART_PROMPT_VERSION}.`,
  ].filter(Boolean).join("\n\n");
}
