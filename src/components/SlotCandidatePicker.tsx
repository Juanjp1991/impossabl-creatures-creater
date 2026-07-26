import React, { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, Bookmark, BookmarkCheck, Loader2, Sparkles } from "lucide-react";
import type { AnimalPartType } from "../types";
import { buildIsolatedPartPreviewSvg } from "../generation/preview";
import { emphasisLabel, partCandidateStats, type GeneratedSample } from "../generation/sampleSelection";
import { VARIATION_STRENGTHS, type VariationStrength } from "../generation/partVariations";
import { DENSITY_BANDS, FILL_BAND } from "../generation/metrics";
import { SLOT_LABELS } from "../partBank/contracts";
import { usePartBank } from "../partBank/usePartBank";
import { ReferenceIndicator } from "./ReferenceIndicator";
import type { ReferenceMode } from "../generation/contracts";

/** The "more like this" controls, hoisted so a round can be re-run from any candidate. */
export interface VariationControls {
  strength: VariationStrength;
  setStrength: (value: VariationStrength) => void;
  instructions: string;
  setInstructions: (value: string) => void;
  count: number;
  setCount: (value: number) => void;
  /** Start a new round seeded with this candidate's art. */
  onRun: (sample: GeneratedSample) => void;
  busy: boolean;
}

interface SlotCandidatePickerProps {
  slot: AnimalPartType;
  samples: GeneratedSample[];
  onPick: (sample: GeneratedSample) => void;
  onCancel: () => void;
  /** Omit to render a plain picker with no iteration controls. */
  variation?: VariationControls;
  /** Shown in the header so a round of variations is distinguishable from a fresh re-roll. */
  heading?: string;
  /** §R1: whether the next round will carry a reference image, and under which mode. */
  reference?: { active: boolean; loading?: boolean; mode: ReferenceMode };
  /** §S1 shape conformance per sample index, when this slot has a reference crop. */
  conformanceOf?: (sampleIndex: number) => number | undefined;
  /** §S2 the cropped reference for this slot, ghosted behind each candidate preview. */
  underlay?: string;
}

/**
 * One row of the contact sheet, for re-rolling a single slot on an animal you otherwise
 * like. The generator has no per-part endpoint, so this still generates whole animals and
 * keeps one slot from the winner — the other slots' art is offered to the bank rather than
 * dropped, which is the whole point of harvesting.
 */
export function SlotCandidatePicker({ slot, samples, onPick, onCancel, variation, heading, reference, conformanceOf, underlay }: SlotCandidatePickerProps) {
  const { savePart, error } = usePartBank();
  const [saved, setSaved] = useState<Set<number>>(new Set());

  // §S1: when a crop gives us a shape score, the closest match sorts to the top — the whole
  // point of scoring inside the loop. Without scores the original generation order stands.
  const ordered = useMemo(() => {
    if (!conformanceOf) return samples;
    return [...samples].sort((a, b) => (conformanceOf(b.index) ?? -1) - (conformanceOf(a.index) ?? -1));
  }, [samples, conformanceOf]);

  const keep = (sample: GeneratedSample) => {
    if (!sample.animal || saved.has(sample.index)) return;
    const stats = partCandidateStats(sample, slot);
    const entry = savePart(sample.animal, slot, {
      name: `${sample.animal.name || "Untitled"} ${SLOT_LABELS[slot].toLowerCase()} #${sample.index + 1}`,
      source: "generated",
      provenance: {
        animalName: sample.animal.name,
        emphasis: (sample.label ?? emphasisLabel(sample.index)),
        sampleIndex: sample.index,
        models: sample.models,
        promptVersions: sample.promptVersions,
      },
      stats: { seamPixels: stats.seamPixels, fillRatio: stats.fillRatio, elementCount: stats.elementCount, errorCount: stats.errorCount },
    });
    if (entry) setSaved((current) => new Set(current).add(sample.index));
  };

  return (
    <div className="space-y-2 rounded-xl border border-amber-500/20 bg-zinc-950/60 p-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button type="button" onClick={onCancel} className="inline-flex items-center gap-1 text-[10px] font-mono text-zinc-400 hover:text-zinc-200">
            <ArrowLeft size={11} /> cancel
          </button>
          <span className="text-[11px] font-semibold text-zinc-200">{heading ?? `New ${SLOT_LABELS[slot].toLowerCase()} candidates`}</span>
        </div>
        <span className="text-[9px] font-mono text-zinc-600">
          fill {Math.round(FILL_BAND[0] * 100)}–{Math.round(FILL_BAND[1] * 100)}% · elems {DENSITY_BANDS[slot][0]}–{DENSITY_BANDS[slot][1]}
        </span>
      </div>

      {error && <p className="rounded border border-amber-900/50 bg-amber-950/20 p-1.5 text-[10px] text-amber-300">{error}</p>}

      {variation && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 p-1.5">
          <span className="text-[9px] font-mono uppercase tracking-wider text-zinc-500">more like this</span>
          {reference && <ReferenceIndicator active={reference.active} loading={reference.loading} mode={reference.mode} />}
          <div className="flex items-center gap-0.5">
            {(Object.keys(VARIATION_STRENGTHS) as VariationStrength[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => variation.setStrength(value)}
                title={VARIATION_STRENGTHS[value].hint}
                className={`rounded px-1.5 py-0.5 text-[9px] font-mono ${
                  variation.strength === value ? "bg-amber-500 text-zinc-950" : "bg-zinc-950 text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {VARIATION_STRENGTHS[value].label.toLowerCase()}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1 text-[9px] font-mono text-zinc-500">
            count
            <select
              value={variation.count}
              onChange={(event) => variation.setCount(Number(event.target.value))}
              className="rounded border border-zinc-800 bg-zinc-950 px-1 py-0.5 text-[9px] text-zinc-200"
            >
              {[2, 4, 6, 8].map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <input
            value={variation.instructions}
            onChange={(event) => variation.setInstructions(event.target.value)}
            placeholder={`optional steer, e.g. "rounder ears, softer muzzle"`}
            className="min-w-[10rem] flex-1 rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-[9px] text-zinc-200 focus:border-amber-500 focus:outline-none"
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {ordered.map((sample) => {
          const stats = partCandidateStats(sample, slot);
          const shape = conformanceOf?.(sample.index);
          const isSaved = saved.has(sample.index);
          return (
            <div
              key={sample.index}
              className={`relative flex flex-col rounded-lg border p-1.5 ${stats.hasArt ? "border-zinc-800 bg-zinc-900 hover:border-zinc-600" : "border-zinc-800 bg-zinc-900 opacity-40"}`}
            >
              {stats.hasArt && (
                <button
                  type="button"
                  onClick={() => keep(sample)}
                  disabled={isSaved}
                  title={isSaved ? "Already in the part bank" : "Keep this part in the bank"}
                  className={`absolute right-1 top-1 z-10 rounded-full p-0.5 ${isSaved ? "bg-emerald-500/20 text-emerald-400" : "bg-zinc-950/80 text-zinc-400 hover:text-amber-400"}`}
                >
                  {isSaved ? <BookmarkCheck size={10} /> : <Bookmark size={10} />}
                </button>
              )}
              <span className="mb-1 text-[8px] font-mono uppercase tracking-wider text-zinc-500">
                #{sample.index + 1} {(sample.label ?? emphasisLabel(sample.index))}
                {sample.modelId && <span className="ml-1 normal-case text-zinc-600" title={sample.modelId}>· {sample.modelId.replace(/^(proxy|gemini):/, "")}</span>}
              </span>
              {stats.hasArt && sample.animal ? (
                // §S2: the crop sits ghosted underneath, so the drift the score measures is
                // also visible rather than only quantified.
                <div
                  className="relative aspect-square w-full overflow-hidden rounded bg-[#fafafa]"
                  style={underlay ? { backgroundImage: `url(${underlay})`, backgroundSize: "contain", backgroundPosition: "center", backgroundRepeat: "no-repeat" } : undefined}
                >
                  {underlay && <div className="absolute inset-0 bg-[#fafafa]/70" />}
                  <div
                    className="absolute inset-0 [&>svg]:h-full [&>svg]:w-full"
                    dangerouslySetInnerHTML={{ __html: buildIsolatedPartPreviewSvg(sample.animal, slot) }}
                  />
                </div>
              ) : (
                <div className="flex aspect-square w-full items-center justify-center rounded bg-zinc-950 text-[9px] font-mono text-zinc-600">
                  <span className="flex flex-col items-center gap-1"><AlertTriangle size={12} className="text-amber-600" />{sample.error ? "failed" : "no art"}</span>
                </div>
              )}
              {stats.hasArt && (
                <div className="mt-1 flex flex-wrap gap-x-2 text-[9px] font-mono text-zinc-500">
                  {stats.seamPixels !== null && <span>seam {stats.seamPixels}</span>}
                  <span>fill {Math.round(stats.fillRatio * 100)}%</span>
                  <span>el {stats.elementCount}</span>
                  {shape !== undefined && (
                    <span className="text-amber-500" title="Shape match against your reference crop (IoU). An ordering signal, not a pass mark.">
                      shape {Math.round(shape * 100)}%
                    </span>
                  )}
                </div>
              )}
              <button
                type="button"
                disabled={!stats.hasArt}
                onClick={() => onPick(sample)}
                className="mt-1.5 rounded bg-amber-500 px-2 py-1 text-[9px] font-semibold text-zinc-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Use this {SLOT_LABELS[slot].toLowerCase()}
              </button>
              {variation && (
                // Iterate rather than settle: seed the next round with this candidate. The
                // round you leave behind stays bookmarkable above.
                <button
                  type="button"
                  disabled={!stats.hasArt || variation.busy}
                  onClick={() => variation.onRun(sample)}
                  title={`Generate ${variation.count} more ${SLOT_LABELS[slot].toLowerCase()} based on this one`}
                  className="mt-1 inline-flex items-center justify-center gap-1 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-[9px] font-mono text-zinc-300 hover:border-amber-600 hover:text-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {variation.busy ? <Loader2 size={9} className="animate-spin" /> : <Sparkles size={9} />}
                  more like this
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
