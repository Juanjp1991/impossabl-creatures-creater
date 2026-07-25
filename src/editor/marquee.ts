import type { GizmoBounds } from "./transform";

/**
 * Rubber-band selection: drag a box, and every shape wholly inside it is selected.
 *
 * Containment rather than intersection is deliberate — it is what the brief asks for, and it
 * is the behaviour that makes a marquee predictable on overlapping artwork. Grazing the edge
 * of a torso while boxing the ears should not drag the torso along.
 *
 * Pure: no DOM, no React.
 */

export type MarqueeMode = "replace" | "subtract";

/** Normalised box from two drag corners, in either direction. */
export function marqueeFromPoints(
  a: { x: number; y: number },
  b: { x: number; y: number },
): GizmoBounds {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}

/** A drag this small is a click that wandered a pixel, not an attempt to box anything. */
export const MARQUEE_MIN_SIZE = 4;

export const isMarqueeMeaningful = (box: GizmoBounds) =>
  box.width >= MARQUEE_MIN_SIZE || box.height >= MARQUEE_MIN_SIZE;

/** True when `box` lies entirely within `marquee`. Touching edges counts as inside. */
export function contains(marquee: GizmoBounds, box: GizmoBounds): boolean {
  return (
    box.x >= marquee.x &&
    box.y >= marquee.y &&
    box.x + box.width <= marquee.x + marquee.width &&
    box.y + box.height <= marquee.y + marquee.height
  );
}

export interface MarqueeCandidate {
  id: string;
  bounds: GizmoBounds;
  /** Locked layers are skipped, matching what the layers panel already enforces. */
  locked?: boolean;
}

/** Ids of every candidate fully inside the marquee. */
export function idsInside(marquee: GizmoBounds, candidates: MarqueeCandidate[]): string[] {
  return candidates
    .filter((candidate) => !candidate.locked && contains(marquee, candidate.bounds))
    .map((candidate) => candidate.id);
}

/**
 * Fold a marquee result into the existing selection.
 *
 * `subtract` (Shift held) removes the boxed shapes, so a second pass can carve pieces out of
 * a large selection rather than forcing the user to start over.
 */
export function applyMarquee(current: string[], hits: string[], mode: MarqueeMode): string[] {
  if (mode === "subtract") {
    const removed = new Set(hits);
    return current.filter((id) => !removed.has(id));
  }
  return [...hits];
}

/** Shift-clicking one shape adds or removes it without disturbing the rest. */
export function toggleSelection(current: string[], id: string): string[] {
  return current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id];
}

/** Smallest box containing every selected shape — the group gizmo's bounds. */
export function unionBounds(boxes: GizmoBounds[]): GizmoBounds | null {
  if (!boxes.length) return null;
  const minX = Math.min(...boxes.map((b) => b.x));
  const minY = Math.min(...boxes.map((b) => b.y));
  const maxX = Math.max(...boxes.map((b) => b.x + b.width));
  const maxY = Math.max(...boxes.map((b) => b.y + b.height));
  return { x: minX, y: minY, width: Math.max(maxX - minX, 1), height: Math.max(maxY - minY, 1) };
}
