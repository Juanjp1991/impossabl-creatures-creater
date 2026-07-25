/**
 * Strips editor bookkeeping out of a part's SVG before it is saved or exported.
 *
 * The layer editor stamps its own attributes onto elements as it works
 * (`setSvgLayerTransform` in `svgLayers.ts` writes three of them). None appear in the
 * validator's `ALLOWED_ATTRS` list (`src/generation/validation.ts`), so a part that reaches
 * storage still carrying them raises `svg.attribute` errors and is treated as malformed.
 * Nothing on the save path removed them before this module existed.
 *
 * Regex rather than DOMParser on purpose: this has to run in `node --test` (no jsdom) and
 * matches how the rest of the pipeline manipulates SVG strings (`normalize.ts`,
 * `metrics.ts`, `geometry.ts`).
 */

/** Attributes the editor owns. Safe to drop; none carry drawing information. */
export const EDITOR_ONLY_ATTRIBUTES = [
  "data-base-transform",
  "data-base-fill",
  "data-editor-transform",
  "data-locked",
  "data-editor-chrome",
] as const;

/**
 * Attribute values are serialised by `XMLSerializer`, which escapes any embedded quote as
 * `&quot;` — so a quote character always terminates the value and the negated class is safe
 * even for `data-editor-transform`, whose value is JSON.
 */
const attributePattern = (name: string) =>
  new RegExp(`\\s+${name}\\s*=\\s*(?:"[^"]*"|'[^']*')`, "gi");

export function stripEditorAttributes(svg: string): string {
  if (!svg) return svg;
  return EDITOR_ONLY_ATTRIBUTES.reduce(
    (result, name) => result.replace(attributePattern(name), ""),
    svg,
  );
}

/**
 * Full save-path clean-up. Currently just the attribute strip — gizmo chrome is rendered
 * into a separate overlay rather than into the part's own markup, so it cannot reach a
 * saved string by construction. Kept as its own entry point so callers name the intent and
 * later clean-up steps land in one place.
 */
export function sanitizeForSave(svg: string): string {
  return stripEditorAttributes(svg);
}
