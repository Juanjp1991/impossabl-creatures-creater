// §P2: the nominal exemplars were the strings "built-in bear" and "built-in cheetah" — no
// actual SVG ever reached the model, and the bear fails `validateAnimalDraft` with 16 errors.
// Prose principles are now the *fallback*; real art comes from the part bank's exemplars.
export const APPROVED_STYLE_GUIDE_VERSION = "approved-principles-3.0.0";

/** Compact characteristics distilled from the approved built-in bear and cheetah assets. */
export const APPROVED_STYLE_GUIDE = {
  principles: [
    "Readable left-facing silhouette with the head clearly distinct from the torso.",
    "Smooth organic primary contours plus purposeful secondary contour, marking, facial and shading groups; never substitute blocky generic primitives.",
    "Consistent outlines and a restrained palette led by primary/accent, with a few reference-derived shade tones allowed for high detail.",
    "Near limbs visually stronger than far limbs; far limbs are slightly darker or lower opacity.",
    "Species-defining face, ears, muzzle, tail and markings remain readable at mobile size.",
    "Artwork reaches attachment anchors without hiding joint continuity behind excessive decoration.",
  ],
};

export const approvedStyleGuidePrompt = () => `Approved style guide ${APPROVED_STYLE_GUIDE_VERSION}: ${APPROVED_STYLE_GUIDE.principles.join(" ")}`;
