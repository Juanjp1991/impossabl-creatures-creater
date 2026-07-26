// §S1 browser half: turn a cropped reference photo into a silhouette mask on a slot's grid.
//
// Split from `src/generation/conformance.ts` because this needs `getImageData` and therefore
// a DOM; the scoring maths stays node-testable on the other side of that line.
//
// The silhouette is separated from the background by colour distance from the frame's own
// border, not by a fixed luminance threshold: a crop of an animal against grass, sky or a
// studio backdrop has no shared "background is bright" rule, but its outermost pixels are
// almost always background.

import { pixelKey } from "../generation/geometry";
import type { Mask } from "../generation/conformance";

/** How far a pixel must sit from the estimated background colour to count as subject. */
export const SILHOUETTE_THRESHOLD = 60;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The reference crop could not be decoded for scoring."));
    image.src = src;
  });
}

export const channelMedian = (values: number[]): number => {
  if (!values.length) return 255;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

/**
 * Background estimate: the per-channel *median* of the frame's one-pixel border.
 *
 * The mean looked simpler and was wrong. A border that is part sky and part animal averages
 * to a colour that matches neither, so every pixel in the frame reads as "far from
 * background" and the whole crop comes back as silhouette. The median lands on whichever
 * colour actually dominates the border, which is the background by construction.
 */
function borderColour(data: Uint8ClampedArray, width: number, height: number) {
  const reds: number[] = [], greens: number[] = [], blues: number[] = [];
  const take = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    reds.push(data[i]); greens.push(data[i + 1]); blues.push(data[i + 2]);
  };
  for (let x = 0; x < width; x += 1) { take(x, 0); take(x, height - 1); }
  for (let y = 1; y < height - 1; y += 1) { take(0, y); take(width - 1, y); }
  return { r: channelMedian(reds), g: channelMedian(greens), b: channelMedian(blues) };
}

/** Coverage outside this range means the threshold found no usable figure-ground split. */
export const USABLE_COVERAGE: readonly [number, number] = [0.02, 0.95];

/**
 * A mask that is nearly empty or nearly the whole frame carries no shape information — the
 * crop landed entirely inside the animal, or entirely on background. Better to report no
 * score than a confident-looking meaningless one.
 */
export function isUsableSilhouette(pixels: number, width: number, height: number): boolean {
  const area = width * height;
  if (!area) return false;
  const coverage = pixels / area;
  return coverage >= USABLE_COVERAGE[0] && coverage <= USABLE_COVERAGE[1];
}

/**
 * Rasterise a reference crop onto `width`x`height` — the slot's fixed local view — and return
 * the subject pixels as a mask in the same packed-key space `PixelMask` uses.
 *
 * The crop is drawn to fill the grid rather than letterboxed: the score aligns bounding boxes
 * anyway, so preserving the crop's own aspect here would only add empty rows that both masks
 * share and inflate every score equally.
 */
export async function rasterizeReferenceMask(
  dataUrl: string,
  width: number,
  height: number,
  threshold: number = SILHOUETTE_THRESHOLD
): Promise<Mask> {
  const image = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("This browser could not provide a 2D canvas to score the reference.");
  context.drawImage(image, 0, 0, width, height);
  const { data } = context.getImageData(0, 0, width, height);
  const background = borderColour(data, width, height);

  const mask: Mask = new Set();
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 8) continue; // fully transparent: not subject
      const distance = Math.hypot(data[i] - background.r, data[i + 1] - background.g, data[i + 2] - background.b);
      if (distance >= threshold) mask.add(pixelKey(x, y));
    }
  }
  return isUsableSilhouette(mask.size, width, height) ? mask : new Set();
}
