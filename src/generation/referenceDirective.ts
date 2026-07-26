// Reference-image directives for the prompt layer.
//
// Two of them, because a whole-animal call and a part-targeted call want to read completely
// different things out of the same photo. See docs/svg-quality-plan.md, R2.

import type { AnimalPartType } from "../types";
import type { ReferenceMode } from "./contracts";

export function referenceDirective(hasReference: boolean, mode: ReferenceMode): string {
  if (!hasReference) return "No reference image is supplied; infer species-accurate anatomy from the brief.";
  if (mode === "inspire") return "The image is loose inspiration: retain its strongest species cues, palette and design language, but the brief may change pose and proportions.";
  return "The image is the structural authority. Match its side-view silhouette, pose, head/body ratio, limb folding, ground stance, visible digits, palette placement and presence or absence of an external tail. The brief controls finish and naming but must not replace image anatomy with a generic standing mammal. Ignore the image background, crop artifacts, logos, text and watermarks.";
}

/**
 * §R2: what to read out of the reference when only one slot is being redrawn.
 *
 * The whole-animal directive above names silhouette, pose, head/body ratio, limb folding,
 * ground stance and external tail — for a part-targeted call most of that describes things
 * the model is explicitly forbidden to touch, so it reads as an instruction to change them.
 * These per-part lists name only what that slot can actually express.
 */
export const PART_REFERENCE_CUES: Record<AnimalPartType, string> = {
  head: "skull shape and length, muzzle or beak profile, ear shape, size and set, eye size and placement, horn or antler presence, curve and length, jaw and cheek mass, and facial markings",
  body: "torso silhouette, back line, withers or hump, chest depth, belly line, shoulder and hip mass, and the coat markings across the trunk",
  frontLegs: "foreleg length and thickness relative to the chest, shoulder and forearm mass, knee and pastern position, stance width, and hoof, paw or digit shape",
  backLegs: "thigh and hip mass, hock height and angle, how crouched or straight the hind limb is, lower-leg length, and hoof, paw or digit shape",
  tail: "tail length relative to the body, thickness at the base versus the tip, how it is carried and curved, tuft, plume or fur density, and any banding or tip markings",
};

export function partReferenceDirective(
  hasReference: boolean,
  mode: ReferenceMode,
  part: AnimalPartType,
  cropped = false
): string {
  if (!hasReference) return "No reference image is supplied; infer species-accurate anatomy from the brief.";
  const cues = PART_REFERENCE_CUES[part];
  const authority = mode === "inspire"
    ? `The image is loose inspiration for the ${part} only: borrow its ${cues}, but the brief may change the finish and proportions.`
    : `The image is the structural authority for the ${part} only. Match its ${cues}.`;
  // §R3: when the artist has cropped the reference, say so — otherwise the model spends its
  // attention hunting for a region that already fills the frame.
  const framing = cropped
    ? `The image is a crop the artist drew around the ${part}, so treat the whole frame as that part rather than reading it as a whole animal. Ignore the background, cut-off neighbouring parts at the frame edges, logos, text and watermarks.`
    : "Read the image solely for that part: ignore the rest of the animal in it, and ignore the background, crop artifacts, logos, text and watermarks.";
  return `${authority} ${framing} Anything the image shows about other body parts, the overall pose or the ground stance is out of scope for this call and must not cause you to change them.`;
}
