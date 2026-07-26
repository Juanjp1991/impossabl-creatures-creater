import React, { useRef, useState } from "react";
import { Crop, Trash2, X } from "lucide-react";
import type { AnimalPartType } from "../types";
import { SLOT_LABELS } from "../partBank/contracts";
import { cropFromDrag, describeCrop, isMeaningfulCrop, type NormalizedCrop } from "../referenceImage/crop";

interface ReferenceCropperProps {
  slot: AnimalPartType;
  /** The downscaled reference, as a data URL. */
  image: string;
  crop?: NormalizedCrop;
  onChange: (crop: NormalizedCrop | undefined) => void;
  onClose: () => void;
}

const percent = (value: number) => `${value * 100}%`;

/**
 * §R3: drag a box over the reference to say which part of it this slot should be drawn from.
 *
 * The crop is stored normalized rather than as pixels, so it stays valid if the reference is
 * ever re-encoded at another size, and it is committed on mouse-up rather than continuously —
 * a half-finished drag is not a crop anybody meant.
 */
export function ReferenceCropper({ slot, image, crop, onChange, onClose }: ReferenceCropperProps) {
  const picture = useRef<HTMLImageElement | null>(null);
  const [drag, setDrag] = useState<NormalizedCrop | null>(null);
  const anchor = useRef<{ x: number; y: number } | null>(null);
  // The in-flight rect, mirrored outside state: mouseup can land in the same tick as the last
  // mousemove, and the handler closure would then still be looking at the previous value.
  const latest = useRef<NormalizedCrop | null>(null);
  const shown = drag ?? crop;

  // Measured against the image itself, not the bordered wrapper, so the box the artist drags
  // lands on the pixels they are looking at.
  const pointIn = (event: React.MouseEvent) => {
    const box = picture.current?.getBoundingClientRect();
    if (!box) return null;
    return { x: event.clientX - box.left, y: event.clientY - box.top, width: box.width, height: box.height };
  };

  const begin = (event: React.MouseEvent) => {
    const point = pointIn(event);
    if (!point) return;
    event.preventDefault();
    anchor.current = { x: point.x, y: point.y };
    latest.current = { x: point.x / point.width, y: point.y / point.height, width: 0, height: 0 };
    setDrag(latest.current);
  };

  const move = (event: React.MouseEvent) => {
    const point = pointIn(event);
    if (!point || !anchor.current) return;
    latest.current = cropFromDrag(anchor.current, point, point);
    setDrag(latest.current);
  };

  const finish = () => {
    if (!anchor.current) return;
    anchor.current = null;
    const drawn = latest.current;
    latest.current = null;
    // Discard a click or a sliver: it would send a near-empty image to the model.
    onChange(isMeaningfulCrop(drawn) ? drawn : undefined);
    setDrag(null);
  };

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-2">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider text-amber-500">
          <Crop size={9} /> crop reference for {SLOT_LABELS[slot].toLowerCase()}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onChange(undefined)}
            disabled={!crop}
            title="Send the whole reference for this part again"
            className="inline-flex items-center gap-1 rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-[9px] font-mono text-zinc-400 hover:border-red-500/40 hover:text-red-400 disabled:opacity-40"
          >
            <Trash2 size={9} /> clear
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1 rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-[9px] font-mono text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
          >
            <X size={9} /> done
          </button>
        </div>
      </div>
      <div
        onMouseDown={begin}
        onMouseMove={move}
        onMouseUp={finish}
        onMouseLeave={finish}
        className="relative inline-block max-w-full cursor-crosshair select-none overflow-hidden rounded"
      >
        <img ref={picture} src={image} alt={`Reference for ${slot}`} draggable={false} className="block max-h-56 max-w-full object-contain" />
        {shown && shown.width > 0 && shown.height > 0 && (
          <div
            className="pointer-events-none absolute border-2 border-amber-500 bg-amber-500/10"
            style={{ left: percent(shown.x), top: percent(shown.y), width: percent(shown.width), height: percent(shown.height) }}
          />
        )}
        {!shown && (
          <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-zinc-950/80 p-1 text-center text-[9px] font-mono text-zinc-400">
            drag a box around the {SLOT_LABELS[slot].toLowerCase()}
          </span>
        )}
      </div>
      <p className="mt-1 text-[9px] font-sans text-zinc-500">
        {crop
          ? `Re-rolls of this part send only this region — ${describeCrop(crop)}.`
          : "No crop yet: this part is generated from the whole reference."}
      </p>
    </div>
  );
}
