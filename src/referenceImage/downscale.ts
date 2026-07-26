// Downscale an uploaded reference photo before it is stored or sent to the model.
//
// Two reasons, both from docs/svg-quality-plan.md R1. Storage: base64 inflates a blob by a
// third, so one full-size 5MB reference costs more than an entire roster of animals. Traffic:
// the reference is re-sent on every call in a round, so a six-variation round uploads the
// same photo six times. A 512px long edge is well above what the model needs for silhouette
// and palette guidance.

/** Long-edge target in CSS pixels. */
export const REFERENCE_MAX_EDGE = 512;
/** JPEG quality for the re-encode; ~40–80 KB at 512px for a typical photo. */
export const REFERENCE_JPEG_QUALITY = 0.82;

export interface ReferenceImageData {
  /** JPEG bytes, the form kept in IndexedDB. */
  blob: Blob;
  /** Same bytes as a data URL, the form every AI call and `<img src>` wants. */
  dataUrl: string;
  width: number;
  height: number;
  byteLength: number;
}

/**
 * Box-fit `width`x`height` inside `maxEdge` without upscaling. Returns whole pixels, and
 * never returns a zero dimension for a non-empty source.
 */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number = REFERENCE_MAX_EDGE
): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 };
  const longEdge = Math.max(width, height);
  if (longEdge <= maxEdge) return { width: Math.round(width), height: Math.round(height) };
  const scale = maxEdge / longEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The image file could not be decoded."));
    image.src = url;
  });
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read the image data."));
    reader.readAsDataURL(blob);
  });
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Failed to encode the resized image."))),
      "image/jpeg",
      quality
    );
  });
}

/**
 * Resize an uploaded file to `maxEdge` on the long edge and re-encode it as JPEG.
 *
 * Transparent pixels are composited over white rather than left to become black, which is
 * what an un-matted PNG turns into once JPEG drops the alpha channel.
 */
export async function downscaleReferenceFile(
  file: File,
  maxEdge: number = REFERENCE_MAX_EDGE
): Promise<ReferenceImageData> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    const source = { width: image.naturalWidth || image.width, height: image.naturalHeight || image.height };
    if (!source.width || !source.height) throw new Error("The image file has no readable dimensions.");
    const { width, height } = fitWithin(source.width, source.height, maxEdge);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser could not provide a 2D canvas to resize the image.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, width, height);

    const blob = await toBlob(canvas, REFERENCE_JPEG_QUALITY);
    const dataUrl = await readAsDataUrl(blob);
    return { blob, dataUrl, width, height, byteLength: blob.size };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
