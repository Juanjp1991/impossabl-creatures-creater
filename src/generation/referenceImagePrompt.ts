import type { GuidedAnimalBrief } from "./contracts";

/**
 * Prompt for the AI reference sketch (`POST /api/generate-image`): the reference photo you
 * don't have, drawn from the expanded brief. The target look is "exported from SVG" — a
 * handful of solid-colour shapes with crisp edges — so the downstream SVG generator
 * recreates structure (silhouette, palette blocks, limb folding, stance) instead of
 * interpreting photographic texture. DOM-free so it is unit-testable in node.
 */
export const REFERENCE_IMAGE_PROMPT_VERSION = "p1-refimg-1.0.0";

export function buildReferenceImagePrompt(brief: GuidedAnimalBrief, note?: string): string {
  const sentences: string[] = [];
  sentences.push(
    `Flat vector game-asset illustration of one ${brief.animalName?.trim() || "animal"}, as if built from a handful of solid-colour SVG shapes with crisp hard edges.`
  );
  sentences.push(
    "Strict left-facing side profile, the whole animal in frame with margins on every side, all feet on one thin ground line, plain solid light neutral background."
  );

  const anatomy: string[] = [];
  if (brief.bodyBuild?.trim()) anatomy.push(`${brief.bodyBuild.trim()} build`);
  if (brief.pose?.trim()) anatomy.push(`pose: ${brief.pose.trim()}`);
  if (brief.expression?.trim()) anatomy.push(`expression: ${brief.expression.trim()}`);
  if (anatomy.length) sentences.push(`Anatomy and stance: ${anatomy.join("; ")}.`);

  // The user's lever for recognizable species identity: exaggeration is deliberate, because
  // the match-mode SVG pipeline follows the reference's structure literally.
  if (brief.definingAnatomy?.trim()) {
    sentences.push(`Over-exaggerate the defining features as bold readable shapes, larger and clearer than life: ${brief.definingAnatomy.trim()}.`);
  }

  const palette: string[] = [];
  if (brief.mainColour?.trim()) palette.push(`main colours: ${brief.mainColour.trim()}`);
  if (brief.markings?.trim()) palette.push(`markings: ${brief.markings.trim()}`);
  if (palette.length) sentences.push(`Limited palette applied as clearly separated colour blocks: ${palette.join("; ")}.`);

  sentences.push(
    "Solid fills only: no gradients, no texture, no fur strokes, no painterly or photorealistic rendering, no sketch outlines, no cast shadows. No text, watermark, logo, border, props or other animals."
  );

  // Free-text tweak ("slight head tilt", "more crouched stance") — applied last so it
  // overrides the generic stance wording above, mirroring how the trailing turns work in
  // the chat adapter's schema fallback.
  if (note?.trim()) sentences.push(`Extra direction that overrides the generic stance above: ${note.trim()}.`);
  return sentences.join(" ");
}
