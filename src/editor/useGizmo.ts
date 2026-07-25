import type React from "react";
import {
  applyGizmoDelta,
  isScaleAction,
  oppositeAnchor,
  type GizmoAction,
  type GizmoBounds,
  type PartTransform,
  type Point,
} from "./transform";

/**
 * The DOM shell around the pure maths in `transform.ts`: pointer capture, screen→local
 * coordinate conversion, and the drag lifecycle. Extracted from `AddAnimalDialog` so the
 * main creature canvas and the part editor drive one implementation.
 */

export interface GizmoTargetSnapshot {
  /** Group whose local space the drag is measured in — the part root, not the stage. */
  group: SVGGraphicsElement;
  bounds: GizmoBounds;
  transform: PartTransform;
}

export interface GizmoDragConfig {
  stageRef: React.RefObject<SVGSVGElement | null>;
  /** Read the drag target at pointer-down. Returning null cancels the drag. */
  resolveTarget: () => GizmoTargetSnapshot | null;
  /** Uniform scaling on corner drags. */
  proportional: boolean;
  /**
   * Pin scaling to a fixed point instead of the handle's opposite corner. Used to keep a
   * part welded to its attachment anchor while it is resized.
   */
  anchorPivot?: Point | null;
  /** Live update during the drag. Must not push undo — this fires every pointermove. */
  onPreview: (next: PartTransform) => void;
  /** Fires once on release, and only if the drag actually changed something. */
  onCommit: (next: PartTransform, original: PartTransform) => void;
}

/** Travel multiplier while Shift is held, for fine adjustment of small shapes. */
const FINE_DRAG_FACTOR = 0.2;

export type GizmoPointerHandler = (
  action: GizmoAction,
  event: React.PointerEvent<SVGElement>,
) => void;

/**
 * Screen→local converter for a stage, captured once so an in-progress transform on the
 * element being dragged cannot feed back into the pointer maths.
 */
function localPointReader(stage: SVGSVGElement, frame: SVGGraphicsElement) {
  const matrix = frame.getScreenCTM();
  if (!matrix) return null;
  const inverse = matrix.inverse();
  return (clientX: number, clientY: number): Point => {
    const point = stage.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const local = point.matrixTransform(inverse);
    return { x: local.x, y: local.y };
  };
}

export interface PointDragConfig {
  stageRef: React.RefObject<SVGSVGElement | null>;
  /**
   * Element whose local coordinate space the drag is measured in. Defaults to the stage.
   * Pass a transformed group to work in that group's own coordinates — handles drawn inside
   * it then need no manual conversion, because they inherit the same transform.
   */
  frame?: () => SVGGraphicsElement | null;
  /** Where the point is now, in the frame's coordinates. */
  start: Point;
  /** Constrain the dragged point — clamping, snapping, orientation rules. */
  resolve?: (point: Point) => Point;
  onPreview: (point: Point) => void;
  onCommit?: (point: Point) => void;
}

/**
 * Drag a single handle — an attachment socket, a spine control point — as opposed to the
 * bounding-box gizmo. Shares the coordinate conversion so both stay in one frame of
 * reference.
 */
export function createPointDragHandler(config: PointDragConfig) {
  return (event: React.PointerEvent<SVGElement>) => {
    const stage = config.stageRef.current;
    if (!stage) return;
    event.preventDefault();
    event.stopPropagation();

    const toLocal = localPointReader(stage, config.frame?.() ?? stage);
    if (!toLocal) return;

    const origin = toLocal(event.clientX, event.clientY);
    const base = config.start;
    let latest = base;

    const move = (pointer: PointerEvent) => {
      const current = toLocal(pointer.clientX, pointer.clientY);
      const moved = {
        x: base.x + (current.x - origin.x),
        y: base.y + (current.y - origin.y),
      };
      latest = config.resolve ? config.resolve(moved) : moved;
      config.onPreview(latest);
    };

    const finish = () => {
      window.removeEventListener("pointermove", move);
      config.onCommit?.(latest);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", finish, { once: true });
  };
}

export function createGizmoDragHandler(config: GizmoDragConfig): GizmoPointerHandler {
  return (action, event) => {
    const stage = config.stageRef.current;
    const target = config.resolveTarget();
    if (!stage || !target) return;

    event.preventDefault();
    event.stopPropagation();

    // Captured once: a live getScreenCTM() mid-drag would fold the element's own in-progress
    // transform back into the pointer maths and make the shape chase the cursor.
    const matrix = target.group.getScreenCTM();
    if (!matrix) return;
    const inverse = matrix.inverse();

    const toLocal = (clientX: number, clientY: number): Point => {
      const point = stage.createSVGPoint();
      point.x = clientX;
      point.y = clientY;
      const local = point.matrixTransform(inverse);
      return { x: local.x, y: local.y };
    };

    const original = target.transform;
    const bounds = target.bounds;
    const start = toLocal(event.clientX, event.clientY);

    const pivot: Point =
      config.anchorPivot && isScaleAction(action)
        ? config.anchorPivot
        : {
            x: original.pivotX ?? oppositeAnchor(action, bounds).x,
            y: original.pivotY ?? oppositeAnchor(action, bounds).y,
          };

    const startAngle = Math.atan2(start.y - pivot.y, start.x - pivot.x);
    let latest = original;
    let moved = false;

    const move = (pointer: PointerEvent) => {
      const raw = toLocal(pointer.clientX, pointer.clientY);
      // Hold Shift to damp the drag. A small shape's handles are only a few pixels apart, so
      // any ordinary drag is large relative to it; this gives fine adjustment without
      // making big shapes feel sluggish.
      const current = pointer.shiftKey
        ? { x: start.x + (raw.x - start.x) * FINE_DRAG_FACTOR, y: start.y + (raw.y - start.y) * FINE_DRAG_FACTOR }
        : raw;
      const angle = Math.atan2(current.y - pivot.y, current.x - pivot.x);
      latest = applyGizmoDelta(
        original,
        action,
        {
          dx: current.x - start.x,
          dy: current.y - start.y,
          angleDelta: angle - startAngle,
          // Absolute positions let scaling use the distance-from-pivot ratio, which is
          // independent of how large the shape being dragged happens to be.
          start,
          current,
        },
        bounds,
        { proportional: config.proportional, pivot },
      );
      moved = true;
      config.onPreview(latest);
    };

    const finish = () => {
      window.removeEventListener("pointermove", move);
      if (moved) config.onCommit(latest, original);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", finish, { once: true });
  };
}
