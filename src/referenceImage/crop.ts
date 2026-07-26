// §R3: crop the reference down to the part being redrawn.
//
// Asking the model to find the right region of a whole-animal photo is far weaker than
// handing it only that region — the image becomes its own region hint. Crops are stored
// normalized (0..1 of the reference) rather than in pixels, so they survive the reference
// being re-encoded at a different size and can be rasterised against any grid later.

import type { AnimalPartType } from "../types";
import { REFERENCE_JPEG_QUALITY } from "./downscale";

export interface NormalizedCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ReferenceCrops = Partial<Record<AnimalPartType, NormalizedCrop>>;

/** Below this on either edge a "crop" is a stray click, not a region. */
export const MIN_CROP_EDGE = 0.03;

const clamp01 = (value: number) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);

/**
 * Build a normalized crop from the two corners of a drag, in pixels relative to the
 * displayed image box. Corners may be dragged in any direction.
 */
export function cropFromDrag(
  start: { x: number; y: number },
  end: { x: number; y: number },
  box: { width: number; height: number }
): NormalizedCrop {
  if (!(box.width > 0) || !(box.height > 0)) return { x: 0, y: 0, width: 0, height: 0 };
  const x0 = clamp01(Math.min(start.x, end.x) / box.width);
  const x1 = clamp01(Math.max(start.x, end.x) / box.width);
  const y0 = clamp01(Math.min(start.y, end.y) / box.height);
  const y1 = clamp01(Math.max(start.y, end.y) / box.height);
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** A crop worth sending: both edges above the noise floor. */
export function isMeaningfulCrop(crop: NormalizedCrop | undefined | null): crop is NormalizedCrop {
  return Boolean(crop) && crop!.width >= MIN_CROP_EDGE && crop!.height >= MIN_CROP_EDGE;
}

/** Normalized crop to whole source pixels, clamped inside the image and never zero-sized. */
export function cropToPixels(crop: NormalizedCrop, width: number, height: number) {
  const x = Math.min(width - 1, Math.max(0, Math.round(crop.x * width)));
  const y = Math.min(height - 1, Math.max(0, Math.round(crop.y * height)));
  return {
    x,
    y,
    width: Math.max(1, Math.min(width - x, Math.round(crop.width * width))),
    height: Math.max(1, Math.min(height - y, Math.round(crop.height * height))),
  };
}

/** Percent label for the UI, e.g. "42% × 31% of the reference". */
export function describeCrop(crop: NormalizedCrop): string {
  return `${Math.round(crop.width * 100)}% × ${Math.round(crop.height * 100)}% of the reference`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The reference image could not be decoded for cropping."));
    image.src = src;
  });
}

/**
 * Cut `crop` out of a reference data URL and return it as its own JPEG data URL. The crop is
 * never upscaled: a small region stays small, which is exactly what makes it cheap to send.
 */
export async function cropReferenceDataUrl(dataUrl: string, crop: NormalizedCrop): Promise<string> {
  const image = await loadImage(dataUrl);
  const source = cropToPixels(crop, image.naturalWidth || image.width, image.naturalHeight || image.height);
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser could not provide a 2D canvas to crop the reference.");
  context.drawImage(image, source.x, source.y, source.width, source.height, 0, 0, source.width, source.height);
  return canvas.toDataURL("image/jpeg", REFERENCE_JPEG_QUALITY);
}
