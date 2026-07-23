export const APPROVED_STYLE_GUIDE_VERSION = "approved-bear-cheetah-2.0.0";

/** Compact characteristics distilled from the approved built-in bear and cheetah assets. */
export const APPROVED_STYLE_GUIDE = {
  examples: ["built-in bear", "built-in cheetah"],
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
