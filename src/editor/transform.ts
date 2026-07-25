/**
 * Pure transform maths shared by every editing surface.
 *
 * Deliberately free of DOM and React imports: `npm test` runs under `node --test` with no
 * jsdom, so anything touching `DOMParser` cannot be unit tested (which is why
 * `svgLayers.ts` guards its entry points and `svgLayers.test.ts` only covers the one pure
 * helper it has). Keeping the maths here means it is testable; the DOM shell lives in
 * `svgLayers.ts` and `useGizmo.ts`.
 */

/** A transform applied to a part root or to a single layer inside a part. */
export interface PartTransform {
  translateX: number;
  translateY: number;
  rotate: number;
  /** Uniform scale. `scaleX`/`scaleY` override it per axis when non-uniform. */
  scale: number;
  scaleX?: number;
  scaleY?: number;
  flipX?: boolean;
  flipY?: boolean;
  fill?: string;
  pivotX?: number;
  pivotY?: number;
}

export type GizmoAction =
  | "move"
  | "rotate"
  | "scale-n"
  | "scale-ne"
  | "scale-e"
  | "scale-se"
  | "scale-s"
  | "scale-sw"
  | "scale-w"
  | "scale-nw";

export interface Point {
  x: number;
  y: number;
}

export interface GizmoBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const IDENTITY_TRANSFORM: PartTransform = {
  translateX: 0,
  translateY: 0,
  rotate: 0,
  scale: 1,
};

export const identityTransform = (): PartTransform => ({ ...IDENTITY_TRANSFORM });

/** Scaling below this collapses a shape to nothing and makes the handle unrecoverable. */
const MIN_SCALE_FACTOR = 0.1;
/** A single drag should never blow a shape off the canvas, however far the pointer goes. */
const MAX_SCALE_FACTOR = 10;
/**
 * Closest the grabbed handle may be treated as being to the pivot.
 *
 * The factor is a ratio of distances from the pivot, so a handle sitting almost on top of it
 * would divide by nearly zero and send the shape to infinity on the first pixel of movement.
 */
const MIN_PIVOT_DISTANCE = 4;

const clampFactor = (factor: number) =>
  Math.min(MAX_SCALE_FACTOR, Math.max(MIN_SCALE_FACTOR, factor));

/**
 * Scale factor for one axis, as the ratio of the pointer's distance from the pivot now to
 * its distance when the drag began.
 *
 * The earlier formula was `1 + travel / boundsSize`, which made sensitivity inversely
 * proportional to the shape's size: on a 16-unit ear a 50-unit drag meant a 4x jump, so
 * small shapes shot off the canvas at the slightest movement. A distance ratio is
 * scale-invariant — dragging a handle to twice its distance from the pivot always doubles
 * the size, whether the shape is an ear or a torso.
 */
function axisFactor(
  delta: GizmoDelta,
  pivot: Point,
  bounds: GizmoBounds,
  axis: "x" | "y",
  driven: boolean,
  /** +1 when dragging away from the origin grows the shape (east/south), -1 for west/north. */
  sign: number,
): number {
  if (!driven) return 1;

  const start = delta.start;
  const current = delta.current;
  if (!start || !current) {
    // No absolute positions available: fall back to the size-relative form, keeping the
    // handle's direction so a west drag still grows leftward.
    const travel = axis === "x" ? delta.dx : delta.dy;
    const span = axis === "x" ? bounds.width : bounds.height;
    return span > 0 ? 1 + (sign * travel) / span : 1;
  }

  const from = (axis === "x" ? start.x : start.y) - (axis === "x" ? pivot.x : pivot.y);
  const to = (axis === "x" ? current.x : current.y) - (axis === "x" ? pivot.x : pivot.y);
  // Practically on the pivot: there is no direction to derive a ratio from, and the
  // 0.1–10 clamp below is what bounds the remaining ill-conditioned cases.
  if (Math.abs(from) < MIN_PIVOT_DISTANCE) return 1;
  const factor = to / from;
  // A negative ratio means the pointer crossed the pivot; treat it as collapsed rather than
  // silently mirroring the shape, which is what the flip control is for.
  return factor <= 0 ? MIN_SCALE_FACTOR : factor;
}

export const isScaleAction = (action: GizmoAction): boolean => action.startsWith("scale");

/**
 * The compass suffix of a scale action.
 *
 * Must be read off the suffix, never by substring-searching the whole action: the word
 * "scale" itself contains both "e" and "s", so `action.includes("e")` is true for *every*
 * scale action. The earlier inline implementation did exactly that, which silently made the
 * west handle scale like east and the north handle like south.
 */
function scaleDirection(action: GizmoAction): string {
  return isScaleAction(action) ? action.slice("scale-".length) : "";
}

/**
 * Per-axis scale with flip folded in, so downstream code never special-cases mirroring —
 * a flip is just a negative factor.
 */
export function effectiveScale(transform: PartTransform): Point {
  const x = transform.scaleX ?? transform.scale;
  const y = transform.scaleY ?? transform.scale;
  return {
    x: transform.flipX ? -x : x,
    y: transform.flipY ? -y : y,
  };
}

/**
 * The corner/edge opposite the dragged handle, which stays put during a free resize so the
 * shape grows away from the pointer rather than around its own centre.
 */
export function oppositeAnchor(action: GizmoAction, bounds: GizmoBounds): Point {
  const direction = scaleDirection(action);
  return {
    x: direction.includes("w")
      ? bounds.x + bounds.width
      : direction.includes("e")
        ? bounds.x
        : bounds.x + bounds.width / 2,
    y: direction.includes("n")
      ? bounds.y + bounds.height
      : direction.includes("s")
        ? bounds.y
        : bounds.y + bounds.height / 2,
  };
}

export interface GizmoDelta {
  /** Pointer travel since drag start, in the target group's local coordinate space. */
  dx: number;
  dy: number;
  /** Signed rotation about the pivot since drag start, in radians. */
  angleDelta: number;
  /** Pointer position when the drag began, in the same local space. */
  start?: Point;
  /** Pointer position now. */
  current?: Point;
}

export interface GizmoOptions {
  /** Force a single factor on both axes, so proportions survive a corner drag. */
  proportional: boolean;
  pivot: Point;
}

/**
 * Fold one drag step into a transform. `base` is the transform as it was when the drag
 * started, never the running value — accumulating per-move would compound rounding and make
 * the shape drift away from the pointer.
 */
export function applyGizmoDelta(
  base: PartTransform,
  action: GizmoAction,
  delta: GizmoDelta,
  bounds: GizmoBounds,
  options: GizmoOptions,
): PartTransform {
  if (action === "move") {
    return {
      ...base,
      translateX: (base.translateX || 0) + delta.dx,
      translateY: (base.translateY || 0) + delta.dy,
    };
  }

  if (action === "rotate") {
    return {
      ...base,
      rotate: (base.rotate || 0) + (delta.angleDelta * 180) / Math.PI,
      pivotX: options.pivot.x,
      pivotY: options.pivot.y,
    };
  }

  const startScaleX = base.scaleX ?? base.scale ?? 1;
  const startScaleY = base.scaleY ?? base.scale ?? 1;

  const direction = scaleDirection(action);
  const horizontal = direction.includes("e") || direction.includes("w");
  const vertical = direction.includes("n") || direction.includes("s");

  let factorX = axisFactor(delta, options.pivot, bounds, "x", horizontal, direction.includes("w") ? -1 : 1);
  let factorY = axisFactor(delta, options.pivot, bounds, "y", vertical, direction.includes("n") ? -1 : 1);

  factorX = clampFactor(factorX);
  factorY = clampFactor(factorY);

  if (options.proportional) {
    // Average only the axes the handle actually drives; a side handle drives one.
    const driven = [horizontal ? factorX : undefined, vertical ? factorY : undefined].filter(
      (value): value is number => value !== undefined,
    );
    const factor = driven.reduce((sum, value) => sum + value, 0) / driven.length;
    factorX = factor;
    factorY = factor;
  }

  return {
    ...base,
    scale: 1,
    scaleX: startScaleX * factorX,
    scaleY: startScaleY * factorY,
    pivotX: options.pivot.x,
    pivotY: options.pivot.y,
  };
}

/**
 * Toggle a mirror axis. Applying twice returns the original transform exactly — the key is
 * dropped rather than set to `false`, so the JSON round-trip through
 * `data-editor-transform` stays stable and an unflipped part carries no flip state at all.
 */
export function flipTransform(transform: PartTransform, axis: "x" | "y"): PartTransform {
  const key = axis === "x" ? "flipX" : "flipY";
  const next = { ...transform };
  if (next[key]) delete next[key];
  else next[key] = true;
  return next;
}

/**
 * Serialise to an SVG `transform` attribute.
 *
 * Order is translate → rotate → scale-about-pivot, matching what the part roots and the
 * layer editor already emit. Changing the order here silently moves every previously
 * saved part, so it is load-bearing.
 */
export function toSvgTransform(transform: PartTransform): string {
  const pivotX = transform.pivotX ?? 0;
  const pivotY = transform.pivotY ?? 0;
  const { x: scaleX, y: scaleY } = effectiveScale(transform);
  const translateX = transform.translateX || 0;
  const translateY = transform.translateY || 0;

  return [
    translateX || translateY ? `translate(${translateX} ${translateY})` : "",
    transform.rotate ? `rotate(${transform.rotate} ${pivotX} ${pivotY})` : "",
    scaleX !== 1 || scaleY !== 1
      ? `translate(${pivotX} ${pivotY}) scale(${scaleX} ${scaleY}) translate(${-pivotX} ${-pivotY})`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** True when the transform would not move a single point. */
export function isIdentityTransform(transform: PartTransform): boolean {
  return toSvgTransform(transform) === "";
}
