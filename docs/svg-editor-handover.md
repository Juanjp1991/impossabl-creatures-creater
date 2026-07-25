# Handover: adding detailed in-app SVG editing

Context brief for a fresh session picking up **editor** work. Written at the end of the
generation-pipeline hardening on `agent/svg-generation-quality` (last commit `b109a85`).
The generator is in a good state and needs no further tuning to start this work.

## What already exists (do not rebuild)

- **Stable layer editor** — [docs/svg-layer-editor.md](svg-layer-editor.md), `src/editor/svgLayers.ts`.
  Part-scoped persisted IDs, hierarchical layers panel, visibility/lock/reorder, move, rotate,
  proportional + anchor-fixed scale, pivot, colour, 50-step undo/redo, on-canvas selection box
  with corner/side/rotate handles. It explicitly stops short of **Bézier node editing** — that is
  the obvious next increment.
- **Shape adjustments in the dialog** — `AddAnimalDialog.tsx` keeps
  `shapeAdjustments: Record<EditablePart, Record<string, ShapeTransform>>` keyed by stable id,
  and bakes them into the SVG on save via `applyShapeTransformsToSvg(ensureStableSvgLayerIds(...))`.
- **Render path** — `parseSvgToReact` (`src/utils/svgParser.tsx`) turns part SVG into React
  elements and resolves the full colour ramp. `src/generation/preview.ts` builds the isolated,
  assembled and joint-crop previews from raw SVG strings.
- **Rig** — `src/rig/` (forward kinematics + named poses), see [docs/rigging-v1.md](rigging-v1.md).

## The invariants an editor must not break

These are enforced deterministically by `validateAnimalDraft` (`src/generation/validation.ts`) and
`normalizeGeneratedSvgSyntax` (`src/generation/normalize.ts`). A free-form editor is the easiest way
to violate them, and a violated part is silently degraded rather than loudly broken.

1. **Ramp tokens only — never raw hex.** Fills/strokes must be one of
   `primary, accent, primary-light, primary-dark, accent-dark, outline, highlight`
   (`src/generation/palette.ts`). A part carrying a literal hex is **permanently un-recolourable
   inside a hybrid** — it keeps its donor species' colour forever. Offer a swatch picker over the
   seven tokens, *not* an RGB colour picker. `validateAnimalDraft` raises `palette.rawHex` (error).
2. **Stroke widths on the §5.2 standard** — silhouette `3`, internal detail `1`–`1.5`, never below
   `1` (sub-1 vanishes on a 360px phone). Constants in `src/generation/metrics.ts` (`STROKE`).
   Cross-species stroke jumps at the seam were the worst-measured defect before this was enforced.
3. **Required group ids must survive** — `head-root`, `body-root`, `frontLegs-root`, `backLegs-root`,
   `tail-root`, plus `frontLegs-far`/`-near` and `backLegs-far`/`-near` (the depth groups that make
   legs layer correctly around the torso). Deleting or renaming a root group fails `group.required`.
4. **Fixed local views and anchors** — head/tail `160x160`, body `300x220`, legs `260x180`; head
   meets the body near local `(120,110)`, frontLegs `(75,15)`, backLegs `(195,15)`, tail `(15,15)`.
   Parts are snapped onto anchors in code (`snapAttachedPartsToAnchors`), and interchangeability
   across species depends entirely on every part honouring the same view + anchor.
5. **Old-phone budget** — no gradients, filters, masks or clipPaths (whitelist in `validation.ts`);
   element counts per part roughly head 8–28, body 8–26, each leg set 5–14, tail 3–10
   (`DENSITY_BANDS`); occupied height 65–95% of the local view (`FILL_BAND`).

## Recommended approach

Edit **through** the existing deterministic layer rather than around it:

- On save, run the part through `normalizeGeneratedSvgSyntax` — it already folds raw hex onto the
  nearest ramp token, snaps stroke widths, and guarantees the `-root` wrapper. Free correctness.
- Then run `validateAnimalDraft` and **surface issues in the editor UI** instead of saving silently.
  There is currently no visible feedback loop for a hand-edited part.
- Prefer constrained controls (token swatches, stroke presets 3 / 1.5 / 1) over free inputs, so the
  standard is unbreakable by construction rather than corrected after the fact.

## Verification

- `npx tsc --noEmit`, then `npm test` (60 tests), then `npm run build`.
- **A failing test HANGS `npm test`** (node --test + tsx buffers TAP); treat a timeout as a failing
  assertion and isolate with `--test-name-pattern`.
- To eyeball real data: the roster lives in browser localStorage under the **`0.0.0.0:3000`** origin
  (not `localhost:3000`), key `creature_builder_custom_animals`.
- The **Cross-Species QA panel** (left column) runs `evaluateCrossSpecies` over the live roster and
  is the fastest way to see whether an edit hurt interchangeability. Seam failures should stay at 0.

## Current roster state (for expectations)

11 animals: 8 from the current pipeline (gpt-5.6-sol, gemini-3.6-flash-high, claude-opus-4-6),
1 legacy custom, 2 legacy built-ins (Grizzly Bear, Cheetah from `src/animalsData.tsx`).
7 of 8 modern animals validate clean. Known outstanding items, none blocking editor work:

- **Adult Gray Wolf** stores the literal strings `"primary"`/`"accent"` in its top-level
  `color`/`accentColor` fields (pre-fix artifact), so it renders grey. Fix by editing those two
  fields to real hex — nothing can infer the intended colour.
- Cross-species flags remaining: 12 scale (some bodies fill ~62% vs the 65–95% band) and
  6 unrelated-overlap. Seam failures: **0**.
