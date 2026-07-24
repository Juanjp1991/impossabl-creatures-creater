import React, { useMemo, useState } from "react";
import { Check, AlertTriangle, ArrowLeft, Sparkles } from "lucide-react";
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
import { DENSITY_BANDS, FILL_BAND } from "../generation/metrics";

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
}

export function ContactSheetSelector({ samples, onUse, onCancel }: ContactSheetSelectorProps) {
  const [selection, setSelection] = useState<SlotSelection>(() => defaultSelection(samples));
  const select = (slot: AnimalPartType, index: number) => setSelection((current) => ({ ...current, [slot]: index }));

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

      {/* Per-slot candidate rows */}
      <div className="space-y-3">
        {PART_TYPES.map((slot) => (
          <div key={slot} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-2">
            <div className="mb-1.5 flex items-center justify-between px-1">
              <span className="text-[11px] font-semibold text-zinc-300">{SLOT_LABELS[slot]}</span>
              <span className="text-[9px] font-mono text-zinc-600">
                fill {Math.round(FILL_BAND[0] * 100)}–{Math.round(FILL_BAND[1] * 100)}% · elems {DENSITY_BANDS[slot][0]}–{DENSITY_BANDS[slot][1]}{slot === "body" ? "" : " · seam ≥40"}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {samples.map((sample) => {
                const stats = partCandidateStats(sample, slot);
                const chosen = selection[slot] === sample.index;
                const inFill = stats.fillRatio >= FILL_BAND[0] && stats.fillRatio <= FILL_BAND[1];
                const inDensity = stats.elementCount >= DENSITY_BANDS[slot][0] && stats.elementCount <= DENSITY_BANDS[slot][1];
                const seamOk = stats.seamPixels === null || stats.seamPixels >= 40;
                return (
                  <button
                    key={sample.index}
                    type="button"
                    disabled={!stats.hasArt}
                    onClick={() => select(slot, sample.index)}
                    className={`relative flex flex-col rounded-lg border p-1.5 text-left transition-colors ${
                      chosen ? "border-amber-400 bg-amber-500/10" : "border-zinc-800 bg-zinc-900 hover:border-zinc-600"
                    } ${stats.hasArt ? "" : "opacity-40 cursor-not-allowed"}`}
                  >
                    <div className="absolute right-1 top-1 z-10 flex items-center gap-1">
                      {chosen && <span className="rounded-full bg-amber-400 p-0.5 text-zinc-950"><Check size={10} /></span>}
                    </div>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-[8px] font-mono uppercase tracking-wider text-zinc-500">#{sample.index + 1} {emphasisLabel(sample.index)}</span>
                    </div>
                    {stats.hasArt && sample.animal ? (
                      <InlineSvg svg={buildIsolatedPartPreviewSvg(sample.animal, slot)} className="aspect-square w-full overflow-hidden rounded bg-[#fafafa] [&>svg]:h-full [&>svg]:w-full" />
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
                      </div>
                    )}
                  </button>
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
