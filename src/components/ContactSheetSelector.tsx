import React, { useMemo, useState } from "react";
import { Check, AlertTriangle, ArrowLeft, Sparkles, Bookmark, BookmarkCheck } from "lucide-react";
import { PART_TYPES, type AnimalDraft } from "../generation/contracts";
import type { AnimalPartType } from "../types";
import {
  composeSelectedAnimal,
  defaultSelection,
  emphasisLabel,
  partCandidateStats,
  sampleProvenance,
  type GeneratedSample,
  type SampleProvenance,
  type SlotSelection,
} from "../generation/sampleSelection";
import { buildAssembledPreviewSvg, buildIsolatedPartPreviewSvg } from "../generation/preview";
import { analyzeDraftGeometry } from "../generation/geometry";
import { validateAnimalDraft } from "../generation/validation";
import { FILL_BAND } from "../generation/metrics";
import { detailDensityProfile } from "../generation/detailDensity";
import { usePartBank } from "../partBank/usePartBank";

const SLOT_LABELS: Record<AnimalPartType, string> = {
  head: "Head", body: "Body", frontLegs: "Front legs", backLegs: "Back legs", tail: "Tail",
};

function InlineSvg({ svg, className }: { svg: string; className?: string }) {
  return <div className={className} dangerouslySetInnerHTML={{ __html: svg }} />;
}

function StatChip({ label, value, tone }: { label: string; value: string; tone: "ok" | "warn" | "neutral" }) {
  const toneClass = tone === "ok" ? "text-emerald-400" : tone === "warn" ? "text-amber-400" : "text-zinc-400";
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[9px] leading-none">
      <span className="text-zinc-600">{label}</span>
      <span className={toneClass}>{value}</span>
    </span>
  );
}

interface ContactSheetSelectorProps {
  samples: GeneratedSample[];
  onUse: (animal: AnimalDraft, provenance: SampleProvenance) => void;
  onCancel: () => void;
  /**
   * "This one is the best so far, but not there yet." Adopts the current composition and
   * immediately starts a variation round on that slot, seeded with this candidate's art.
   * `composed` is passed through because the adoption has not reached component state yet.
   */
  onRefineSlot?: (slot: AnimalPartType, sample: GeneratedSample, composed: AnimalDraft, provenance: SampleProvenance) => void;
  /** §S1 shape conformance per slot and sample, when that slot has a reference crop. */
  conformanceOf?: (slot: AnimalPartType, sampleIndex: number) => number | undefined;
  /** §S2 cropped reference per slot, ghosted behind that slot's candidate previews. */
  underlays?: Partial<Record<AnimalPartType, string>>;
}

/** `proxy:gpt-5.6-sol` reads as `gpt-5.6-sol`: the provider prefix is noise in a cell this size. */
function shortModelLabel(modelId: string): string {
  return modelId.replace(/^(proxy|gemini):/, "");
}

export function ContactSheetSelector({ samples, onUse, onCancel, onRefineSlot, conformanceOf, underlays }: ContactSheetSelectorProps) {
  // The initial pick uses conformance when it is available, so the closest match to your crop
  // is already selected when the sheet opens.
  const [selection, setSelection] = useState<SlotSelection>(() => defaultSelection(samples, conformanceOf));
  const densityBands = detailDensityProfile(samples.find((sample) => sample.animal)?.animal?.layoutMetadata?.detailLevel).bands;
  const select = (slot: AnimalPartType, index: number) => setSelection((current) => ({ ...current, [slot]: index }));

  /**
   * Harvesting the losers (§5.5). One run produces `samples.length × 5` candidates and
   * "Use this creature" keeps five; the rest were discarded until the bank existed. The
   * art is already generated, already validated and already compared by eye here, so
   * keeping one costs a click and no tokens.
   *
   * Saved cells are tracked by `sampleIndex:slot` rather than by bank id, because each
   * save mints a fresh entry and the sheet only needs to show what it has already banked.
   */
  const { savePart, error: bankError } = usePartBank();
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const cellKey = (slot: AnimalPartType, index: number) => `${index}:${slot}`;

  const keep = (slot: AnimalPartType, sample: GeneratedSample) => {
    if (!sample.animal || saved.has(cellKey(slot, sample.index))) return;
    const stats = partCandidateStats(sample, slot);
    const entry = savePart(sample.animal, slot, {
      name: `${sample.animal.name || "Untitled"} ${SLOT_LABELS[slot].toLowerCase()} #${sample.index + 1}`,
      source: "generated",
      provenance: {
        animalName: sample.animal.name,
        emphasis: emphasisLabel(sample.index),
        sampleIndex: sample.index,
        models: sample.models,
        promptVersions: sample.promptVersions,
      },
      stats: { seamPixels: stats.seamPixels, fillRatio: stats.fillRatio, elementCount: stats.elementCount, errorCount: stats.errorCount },
    });
    if (entry) setSaved((current) => new Set(current).add(cellKey(slot, sample.index)));
  };

  const keepRow = (slot: AnimalPartType) => {
    for (const sample of samples) {
      if (sample.animal && partCandidateStats(sample, slot).hasArt) keep(slot, sample);
    }
  };

  const composed = useMemo(() => {
    try { return { animal: composeSelectedAnimal(samples, selection), error: "" }; }
    catch (error: any) { return { animal: undefined as AnimalDraft | undefined, error: error?.message || "Could not assemble the selection." }; }
  }, [samples, selection]);

  // §5.3: after picking winners, re-run the deterministic checks once on the frankenstein
  // (no plan, so no LLM-vs-LLM blueprint conformance — physical ground truth only).
  const assessment = useMemo(() => {
    if (!composed.animal) return undefined;
    try {
      const validation = validateAnimalDraft(composed.animal);
      const geometry = analyzeDraftGeometry(composed.animal);
      return { validation, geometry };
    } catch { return undefined; }
  }, [composed.animal]);

  const assembledSvg = useMemo(() => (composed.animal ? buildAssembledPreviewSvg(composed.animal, false) : ""), [composed.animal]);
  const errorCount = assessment?.validation.issues.filter((issue) => issue.severity === "error").length ?? 0;
  const warningCount = assessment?.validation.issues.filter((issue) => issue.severity === "warning").length ?? 0;

  const usableSamples = samples.filter((sample) => sample.animal).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={onCancel} className="inline-flex items-center gap-1 text-[11px] font-mono text-zinc-400 hover:text-zinc-200">
            <ArrowLeft size={12} /> back
          </button>
          <span className="text-xs font-semibold text-zinc-200">Pick the best part per slot</span>
        </div>
        <span className="text-[10px] font-mono text-zinc-500">{usableSamples}/{samples.length} samples usable</span>
      </div>

      {bankError && (
        <p className="rounded-lg border border-amber-900/50 bg-amber-950/20 p-2 text-[10px] text-amber-300">{bankError}</p>
      )}
      <p className="text-[10px] leading-snug text-zinc-500">
        Bookmark any candidate to keep it in the part bank — including the ones you do not pick. This run generated {samples.length * PART_TYPES.length} parts and the composition keeps {PART_TYPES.length}.
      </p>

      {/* Per-slot candidate rows */}
      <div className="space-y-3">
        {PART_TYPES.map((slot) => (
          <div key={slot} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-2">
            <div className="mb-1.5 flex items-center justify-between px-1">
              <span className="text-[11px] font-semibold text-zinc-300">{SLOT_LABELS[slot]}</span>
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-mono text-zinc-600">
                  fill {Math.round(FILL_BAND[0] * 100)}–{Math.round(FILL_BAND[1] * 100)}% · elems {densityBands[slot][0]}–{densityBands[slot][1]}{slot === "body" ? "" : " · seam ≥40"}
                </span>
                <button
                  type="button"
                  onClick={() => keepRow(slot)}
                  title="Save every usable candidate in this row to the part bank"
                  className="inline-flex items-center gap-1 rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-[9px] font-mono text-zinc-500 hover:border-amber-600 hover:text-amber-400"
                >
                  <Bookmark size={9} /> keep all
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {samples.map((sample) => {
                const stats = partCandidateStats(sample, slot);
                const chosen = selection[slot] === sample.index;
                const inFill = stats.fillRatio >= FILL_BAND[0] && stats.fillRatio <= FILL_BAND[1];
                const inDensity = stats.elementCount >= densityBands[slot][0] && stats.elementCount <= densityBands[slot][1];
                const seamOk = stats.seamPixels === null || stats.seamPixels >= 40;
                const isSaved = saved.has(cellKey(slot, sample.index));
                const shape = conformanceOf?.(slot, sample.index);
                return (
                  // A div rather than a button: the keep toggle is a real nested button, and
                  // a button inside a button is invalid and swallows the inner click.
                  <div
                    key={sample.index}
                    role="button"
                    tabIndex={stats.hasArt ? 0 : -1}
                    aria-pressed={chosen}
                    onClick={() => stats.hasArt && select(slot, sample.index)}
                    onKeyDown={(event) => {
                      if (!stats.hasArt) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        select(slot, sample.index);
                      }
                    }}
                    className={`relative flex flex-col rounded-lg border p-1.5 text-left transition-colors ${
                      chosen ? "border-amber-400 bg-amber-500/10" : "border-zinc-800 bg-zinc-900 hover:border-zinc-600"
                    } ${stats.hasArt ? "cursor-pointer" : "opacity-40 cursor-not-allowed"}`}
                  >
                    <div className="absolute right-1 top-1 z-10 flex items-center gap-1">
                      {stats.hasArt && (
                        <button
                          type="button"
                          onClick={(event) => { event.stopPropagation(); keep(slot, sample); }}
                          disabled={isSaved}
                          title={isSaved ? "Already in the part bank" : "Keep this part in the bank"}
                          className={`rounded-full p-0.5 ${
                            isSaved ? "bg-emerald-500/20 text-emerald-400" : "bg-zinc-950/80 text-zinc-400 hover:text-amber-400"
                          }`}
                        >
                          {isSaved ? <BookmarkCheck size={10} /> : <Bookmark size={10} />}
                        </button>
                      )}
                      {chosen && <span className="rounded-full bg-amber-400 p-0.5 text-zinc-950"><Check size={10} /></span>}
                    </div>
                    <div className="mb-1 flex flex-col">
                      <span className="text-[8px] font-mono uppercase tracking-wider text-zinc-500">#{sample.index + 1} {emphasisLabel(sample.index)}</span>
                      {/* §P3: which model drew this candidate, so a mixed sheet is readable. */}
                      {sample.modelId && (
                        <span className="truncate text-[8px] font-mono text-zinc-600" title={sample.modelId}>{shortModelLabel(sample.modelId)}</span>
                      )}
                    </div>
                    {stats.hasArt && sample.animal ? (
                      <div
                        className="relative aspect-square w-full overflow-hidden rounded bg-[#fafafa]"
                        style={underlays?.[slot] ? { backgroundImage: `url(${underlays[slot]})`, backgroundSize: "contain", backgroundPosition: "center", backgroundRepeat: "no-repeat" } : undefined}
                      >
                        {underlays?.[slot] && <div className="absolute inset-0 bg-[#fafafa]/70" />}
                        <InlineSvg svg={buildIsolatedPartPreviewSvg(sample.animal, slot)} className="absolute inset-0 [&>svg]:h-full [&>svg]:w-full" />
                      </div>
                    ) : (
                      <div className="flex aspect-square w-full items-center justify-center rounded bg-zinc-950 text-center text-[9px] font-mono text-zinc-600">
                        <span className="flex flex-col items-center gap-1"><AlertTriangle size={12} className="text-amber-600" />{sample.error ? "failed" : "no art"}</span>
                      </div>
                    )}
                    {stats.hasArt && (
                      <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
                        {stats.seamPixels !== null && <StatChip label="seam" value={`${stats.seamPixels}`} tone={seamOk ? "ok" : "warn"} />}
                        <StatChip label="fill" value={`${Math.round(stats.fillRatio * 100)}%`} tone={inFill ? "ok" : "warn"} />
                        <StatChip label="el" value={`${stats.elementCount}`} tone={inDensity ? "ok" : "warn"} />
                        <StatChip label="err" value={`${stats.errorCount}`} tone={stats.errorCount ? "warn" : "ok"} />
                        {shape !== undefined && <StatChip label="shape" value={`${Math.round(shape * 100)}%`} tone={shape >= 0.5 ? "ok" : "warn"} />}
                      </div>
                    )}
                    {onRefineSlot && stats.hasArt && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          // Pick it first, so the round is seeded with the composition the
                          // user actually settled on rather than whatever was selected before.
                          const next = { ...selection, [slot]: sample.index };
                          try {
                            onRefineSlot(slot, sample, composeSelectedAnimal(samples, next), sampleProvenance(samples, next));
                          } catch {
                            setSelection(next);
                          }
                        }}
                        title={`Keep this ${SLOT_LABELS[slot].toLowerCase()} and generate more like it`}
                        className="mt-1 inline-flex items-center justify-center gap-1 rounded border border-zinc-700 bg-zinc-950 px-1.5 py-0.5 text-[9px] font-mono text-zinc-400 hover:border-amber-600 hover:text-amber-400"
                      >
                        <Sparkles size={9} /> more like this
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Assembled preview of the current picks + fresh deterministic re-check */}
      <div className="grid grid-cols-1 gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div>
          <div className="mb-1 text-[11px] font-semibold text-zinc-300">Assembled selection</div>
          {composed.animal ? (
            <InlineSvg svg={assembledSvg} className="w-full max-w-md overflow-hidden rounded-lg border border-zinc-800 bg-[#fafafa] [&>svg]:h-auto [&>svg]:w-full" />
          ) : (
            <div className="rounded-lg border border-amber-900/50 bg-amber-950/20 p-3 text-[11px] text-amber-300">{composed.error}</div>
          )}
        </div>
        <div className="flex flex-col gap-2 sm:w-52">
          {assessment && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-2 text-[10px] font-mono">
              <div className="flex items-center justify-between"><span className="text-zinc-500">technical errors</span><span className={errorCount ? "text-amber-400" : "text-emerald-400"}>{errorCount}</span></div>
              <div className="flex items-center justify-between"><span className="text-zinc-500">warnings</span><span className="text-zinc-300">{warningCount}</span></div>
              <div className="flex items-center justify-between"><span className="text-zinc-500">ground line</span><span className="text-zinc-300">y={Math.round(assessment.geometry.groundY)}</span></div>
            </div>
          )}
          <button
            type="button"
            disabled={!composed.animal}
            onClick={() => composed.animal && onUse(composed.animal, sampleProvenance(samples, selection))}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-zinc-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Sparkles size={14} /> Use this creature
          </button>
          {errorCount > 0 && composed.animal && (
            <p className="text-[9px] leading-snug text-zinc-500">Still forgeable — technical errors are shown for information and can be fixed by hand or by swapping a part.</p>
          )}
        </div>
      </div>
    </div>
  );
}
