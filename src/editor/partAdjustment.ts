import type { PartAdjustment } from "../types";
import type { GizmoBounds, PartTransform, Point } from "./transform";

/**
 * Bridges the main canvas's `PartAdjustment` (what App state and the sliders hold) and the
 * `PartTransform` the gizmo maths works in.
 *
 * The two differ in one important way: a part on the main canvas is welded to its joint —
 * a head pivots and grows about its neck, never about a bounding-box corner — so the pivot
 * is always the joint rather than the handle's opposite anchor. `scale` stays authoritative
 * for layout because connection targets and the ground shadow are derived from it; a
 * non-uniform stretch is layered on as `scaleX`/`scaleY` only when the user asks for one.
 *
 * Pure: no DOM, no React, so it is unit-testable under `node --test`.
 */

/** Joint position in stage coordinates — the pivot every part transform turns about. */
export function adjustmentToTransform(
  adjustment: PartAdjustment,
  joint: Point,
): PartTransform {
  return {
    translateX: adjustment.offsetX,
    translateY: adjustment.offsetY,
    rotate: adjustment.rotation ?? 0,
    scale: adjustment.scale,
    scaleX: adjustment.scaleX,
    scaleY: adjustment.scaleY,
    flipX: adjustment.flipX,
    flipY: adjustment.flipY,
    pivotX: joint.x,
    pivotY: joint.y,
  };
}

/**
 * Fold a gizmo result back into a `PartAdjustment`.
 *
 * When the axes come back equal — a proportional drag — the result collapses onto the
 * uniform `scale` field and the per-axis overrides are dropped. Leaving `scaleX`/`scaleY`
 * set at equal values would silently desynchronise `scale`, and everything that positions
 * the other parts reads `scale`.
 */
export function transformToAdjustment(
  transform: PartTransform,
  previous: PartAdjustment,
): PartAdjustment {
  const scaleX = transform.scaleX ?? transform.scale;
  const scaleY = transform.scaleY ?? transform.scale;
  const uniform = Math.abs(scaleX - scaleY) < 1e-9;

  const next: PartAdjustment = {
    ...previous,
    offsetX: transform.translateX,
    offsetY: transform.translateY,
    rotation: transform.rotate,
    scale: uniform ? scaleX : previous.scale,
  };

  if (uniform) {
    delete next.scaleX;
    delete next.scaleY;
  } else {
    next.scaleX = scaleX;
    next.scaleY = scaleY;
  }

  if (transform.flipX) next.flipX = true;
  else delete next.flipX;
  if (transform.flipY) next.flipY = true;
  else delete next.flipY;

  return next;
}

/**
 * Split into the two transforms the canvas applies either side of the idle-animation group.
 *
 * Placement (translate + rotate) sits outside it so a rotated part carries its animation
 * around with it; scale sits inside so `motion`'s offsets stay in unscaled units, which is
 * what the existing presets were tuned against.
 */
export function splitPartTransform(adjustment: PartAdjustment, joint: Point) {
  const placement: PartTransform = {
    translateX: joint.x + adjustment.offsetX,
    translateY: joint.y + adjustment.offsetY,
    rotate: adjustment.rotation ?? 0,
    scale: 1,
    pivotX: 0,
    pivotY: 0,
  };

  const sizing: PartTransform = {
    translateX: 0,
    translateY: 0,
    rotate: 0,
    scale: adjustment.scale,
    scaleX: adjustment.scaleX,
    scaleY: adjustment.scaleY,
    flipX: adjustment.flipX,
    flipY: adjustment.flipY,
    pivotX: 0,
    pivotY: 0,
  };

  return { placement, sizing };
}

/** Convert a screen-space rect into stage coordinates so gizmo maths stays in one frame. */
export function rectToStageBounds(
  rect: { left: number; top: number; width: number; height: number },
  toStage: (x: number, y: number) => Point,
): GizmoBounds {
  const topLeft = toStage(rect.left, rect.top);
  const bottomRight = toStage(rect.left + rect.width, rect.top + rect.height);
  return {
    x: Math.min(topLeft.x, bottomRight.x),
    y: Math.min(topLeft.y, bottomRight.y),
    width: Math.max(Math.abs(bottomRight.x - topLeft.x), 1),
    height: Math.max(Math.abs(bottomRight.y - topLeft.y), 1),
  };
}
