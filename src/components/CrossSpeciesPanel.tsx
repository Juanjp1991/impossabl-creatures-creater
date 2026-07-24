import React, { useMemo, useState } from "react";
import { Shuffle, ShieldAlert, ShieldCheck, Dna } from "lucide-react";
import type { Animal, AnimalPartType } from "../types";
import type { AnimalDraft } from "../generation/contracts";
import { evaluateCrossSpecies, type RosterEntry } from "../generation/crossSpecies";
import { assembleFromPartDrafts } from "../generation/sampleSelection";
import { buildAssembledPreviewSvg } from "../generation/preview";

interface CrossSpeciesPanelProps {
  animals: Animal[];
}

// Every quality gate in the repo measures a pure single-species animal, but 100% of what the
// player builds is a cross-species hybrid. §5.4's evaluator assembles N random hybrids from the
// live roster and flags numeric seam / ground / scale / density outliers before a human eyeballs
// the grid. This panel surfaces that evaluator against the animals currently in the library.

/**
 * Map an editor Animal onto the generation AnimalDraft the evaluator + preview builders consume.
 * Part art comes from each part's rawContent; the optional generated layout carries depth groups
 * and ground contacts when present (built-in animals simply omit it, which the builders tolerate).
 */
function animalToDraft(animal: Animal): AnimalDraft {
  return {
    name: animal.name,
    color: animal.color,
    accentColor: animal.accentColor,
    description: animal.description,
    bodyConnections: animal.bodyConnections,
    headSvg: animal.parts.head.rawContent,
    bodySvg: animal.parts.body.rawContent,
    frontLegsSvg: animal.parts.frontLegs.rawContent,
    backLegsSvg: animal.parts.backLegs.rawContent,
    tailSvg: animal.parts.tail.rawContent,
    layoutMetadata: animal.generationMetadata?.generatedLayout,
  };
}

const SLOT_ORDER: AnimalPartType[] = ["head", "body", "frontLegs", "backLegs", "tail"];
const SLOT_LABEL: Record<AnimalPartType, string> = { head: "head", body: "body", frontLegs: "front", backLegs: "back", tail: "tail" };

export const CrossSpeciesPanel: React.FC<CrossSpeciesPanelProps> = ({ animals }) => {
  const [sampleCount, setSampleCount] = useState(6);
  const [seed, setSeed] = useState(1);

  const roster = useMemo<RosterEntry[]>(
    () => animals.map((animal) => ({ id: animal.id, draft: animalToDraft(animal) })),
    [animals],
  );
  const nameById = useMemo(() => new Map(animals.map((animal) => [animal.id, animal.name])), [animals]);

  const report = useMemo(() => evaluateCrossSpecies(roster, { sampleCount, seed }), [roster, sampleCount, seed]);

  const summaryChips: Array<[string, number]> = [
    ["seam", report.summary.seamFailures],
    ["ground", report.summary.groundMismatches],
    ["overlap", report.summary.unrelatedOverlaps],
    ["scale", report.summary.scaleOutliers],
    ["density", report.summary.densityWhiplash],
    ["stroke", report.summary.strokeMismatch],
  ];

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-3 shadow-sm">
      <div className="flex items-center justify-between select-none pb-2 border-b border-zinc-800">
        <span className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
          <Dna size={13} className="text-amber-500" /> Cross-Species QA
        </span>
        <span className="text-[10px] font-mono text-zinc-500 uppercase">{report.distinctSpecies} species</span>
      </div>

      <p className="text-[10px] font-mono text-zinc-500 leading-relaxed">
        Assembles random hybrids from the library and flags seam, ground, scale and density outliers — the mismatches a
        single-species gate never sees.
      </p>

      <div className="flex items-center gap-2 flex-wrap">
        <label className="text-[10px] font-mono text-zinc-500 flex items-center gap-1.5">
          Samples
          <input
            type="number"
            min={1}
            max={24}
            value={sampleCount}
            onChange={(event) => setSampleCount(Math.max(1, Math.min(24, Number(event.target.value) || 1)))}
            className="w-14 bg-zinc-950 border border-zinc-750 rounded px-1.5 py-1 text-[11px] font-mono text-zinc-200 focus:outline-none focus:border-amber-500"
          />
        </label>
        <button
          type="button"
          onClick={() => setSeed((current) => (current + 1) % 100000)}
          className="ml-auto flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 rounded px-2.5 py-1 text-[11px] font-mono text-zinc-200 transition-colors"
        >
          <Shuffle size={12} /> Reshuffle
        </button>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-[10px] font-mono">
        <span className={`flex items-center gap-1 ${report.flaggedCount ? "text-amber-400" : "text-green-500"}`}>
          {report.flaggedCount ? <ShieldAlert size={12} /> : <ShieldCheck size={12} />}
          {report.flaggedCount}/{report.sampleCount} flagged
        </span>
        {summaryChips.filter(([, count]) => count > 0).map(([label, count]) => (
          <span key={label} className="text-zinc-500">
            {label} <span className="text-amber-400">{count}</span>
          </span>
        ))}
      </div>

      {report.sampleCount === 0 ? (
        <p className="text-[10px] font-mono text-zinc-600 py-4 text-center">
          Need at least one animal per slot in the library to assemble a hybrid.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 max-h-[28rem] overflow-y-auto pr-1">
          {report.evaluations.map((evaluation) => {
            const draft = hybridDraft(roster, evaluation.sources);
            const svg = draft ? buildAssembledPreviewSvg(draft) : "";
            return (
              <div key={evaluation.index} className="bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden flex flex-col">
                <div
                  className="bg-[#fafafa] aspect-[6/5] flex items-center justify-center [&_svg]:w-full [&_svg]:h-full"
                  dangerouslySetInnerHTML={{ __html: svg }}
                />
                <div className="p-2 flex flex-col gap-1 border-t border-zinc-800">
                  <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[9px] font-mono text-zinc-500 leading-tight">
                    {SLOT_ORDER.map((slot) => (
                      <span key={slot}>
                        <span className="text-zinc-600">{SLOT_LABEL[slot]}</span>{" "}
                        <span className="text-zinc-400">{nameById.get(evaluation.sources[slot]) ?? evaluation.sources[slot]}</span>
                      </span>
                    ))}
                  </div>
                  {evaluation.errorCount > 0 && (
                    <span className="text-[9px] font-mono text-red-400">{evaluation.errorCount} validation error(s)</span>
                  )}
                  {evaluation.flags.length === 0 ? (
                    <span className="text-[9px] font-mono text-green-500 flex items-center gap-1"><ShieldCheck size={10} /> clean</span>
                  ) : (
                    <ul className="flex flex-col gap-0.5">
                      {evaluation.flags.map((flag, flagIndex) => (
                        <li key={flagIndex} className="text-[9px] font-mono text-amber-400/90 leading-tight">• {flag}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// Reassemble the exact hybrid the evaluator scored, from its recorded per-slot source ids, so the
// preview shows precisely the combination the flags describe. assembleFromPartDrafts is the same
// composition the evaluator used, so geometry and metrics match by construction.
function hybridDraft(roster: RosterEntry[], sources: Record<AnimalPartType, string>): AnimalDraft | undefined {
  const byId = new Map(roster.map((entry) => [entry.id, entry.draft]));
  const bySlot = {} as Record<AnimalPartType, AnimalDraft>;
  for (const slot of SLOT_ORDER) {
    const draft = byId.get(sources[slot]);
    if (!draft) return undefined;
    bySlot[slot] = draft;
  }
  return assembleFromPartDrafts(bySlot);
}
