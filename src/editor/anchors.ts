import { CONNECTION_BOUNDS } from "../generation/validation";
import type { Point } from "./transform";

/**
 * Constraints on the body's four attachment sockets, applied while they are dragged.
 *
 * `validateAnimalDraft` already rejects an out-of-range socket (`anchor.contract`) and a
 * neck that is not left of the tail (`orientation.left`). Clamping during the drag makes
 * those rules unbreakable by construction rather than reported after the fact — the
 * approach `docs/svg-editor-handover.md` asks for. Bounds are imported from the validator
 * rather than restated, so the two can never drift apart.
 *
 * Pure: no DOM, no React.
 */

export type AnchorPart = keyof typeof CONNECTION_BOUNDS;

export const ANCHOR_PARTS = Object.keys(CONNECTION_BOUNDS) as AnchorPart[];

export const anchorBounds = (part: AnchorPart) => CONNECTION_BOUNDS[part];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Snap a dragged point into the part's legal box. */
export function clampAnchor(part: AnchorPart, point: Point): Point {
  const bounds = CONNECTION_BOUNDS[part];
  return {
    x: Math.round(clamp(point.x, bounds.minX, bounds.maxX)),
    y: Math.round(clamp(point.y, bounds.minY, bounds.maxY)),
  };
}

/** Smallest gap kept between the neck and tail anchors, in body-local units. */
const FACING_GAP = 1;

/**
 * Keep the neck left of the tail.
 *
 * Every part in the library is authored left-facing, and the hybrid assembler relies on it.
 * Only the socket being dragged moves; the other is treated as fixed, so a drag can never
 * shove the anchor the user is not touching.
 */
export function enforceLeftFacing(
  dragged: AnchorPart,
  point: Point,
  others: { neck: Point; tail: Point },
): Point {
  if (dragged === "neck" && point.x >= others.tail.x) {
    return { ...point, x: Math.max(CONNECTION_BOUNDS.neck.minX, others.tail.x - FACING_GAP) };
  }
  if (dragged === "tail" && point.x <= others.neck.x) {
    return { ...point, x: Math.min(CONNECTION_BOUNDS.tail.maxX, others.neck.x + FACING_GAP) };
  }
  return point;
}

/** Full drag resolution: clamp to the legal box, then preserve left-facing orientation. */
export function resolveAnchorDrag(
  part: AnchorPart,
  point: Point,
  current: { neck: Point; tail: Point },
): Point {
  return enforceLeftFacing(part, clampAnchor(part, point), current);
}
