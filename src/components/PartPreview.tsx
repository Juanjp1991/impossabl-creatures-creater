import React from "react";
import { parseSvgToReact, type ShapeTransform } from "../utils/svgParser";

/**
 * One part's SVG, rendered as React elements — memoised.
 *
 * `parseSvgToReact` runs a full DOMParser pass and rebuilds the element tree on every call.
 * Called inline from the dialog's render, that happened for all five parts on *every*
 * re-render, including ones that only changed the animal's name. Measured: ~30 parses per
 * keystroke. React.memo makes each part re-render only when its own inputs change.
 *
 * Every prop is either a primitive or an object with a stable identity (the transform maps
 * come from state, the rig map from a useMemo), so the default shallow comparison is enough.
 */

export interface PartPreviewProps {
  svg: string;
  color: string;
  accentColor: string;
  /** The part's authored colours, so legacy hex-painted parts still retint. */
  originalColor?: string;
  originalAccentColor?: string;
  shapeTransforms?: Record<string | number, ShapeTransform>;
  /** Layer id to highlight, when this part is the active one. */
  highlightId?: string | number;
  rigTransforms?: Record<string, string>;
}

export const PartPreview = React.memo<PartPreviewProps>(({
  svg,
  color,
  accentColor,
  originalColor,
  originalAccentColor,
  shapeTransforms,
  highlightId,
  rigTransforms,
}) => (
  <>{parseSvgToReact(svg, { color, accentColor }, originalColor, originalAccentColor, shapeTransforms, highlightId, rigTransforms)}</>
));

PartPreview.displayName = "PartPreview";
