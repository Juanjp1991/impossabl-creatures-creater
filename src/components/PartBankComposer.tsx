import React, { useMemo, useState } from "react";
import { AlertTriangle, Sparkles, Shuffle, RotateCcw } from "lucide-react";
import type { AnimalPartType } from "../types";
import { PART_TYPES, type AnimalDraft } from "../generation/contracts";
import { buildAssembledPreviewSvg, buildIsolatedPartPreviewSvg } from "../generation/preview";
import { validateAnimalDraft } from "../generation/validation";
import { analyzeDraftGeometry } from "../generation/geometry";
import { SLOT_LABELS, composeFromEntries, entryToPartDraft, type PartBankEntry } from "../partBank/contracts";
import { filterEntries } from "../partBank/store";
import { usePartBank } from "../partBank/usePartBank";
import { PartBankPanel } from "./PartBankPanel";

interface PartBankComposerProps {
  onUse: (draft: AnimalDraft) => void;
  onCancel: () => void;
}

type Selection = Partial<Record<AnimalPartType, PartBankEntry>>;

/**
 * Build one animal from five banked parts.
 *
 * The assembly itself is `assembleFromPartDrafts` — the same function the contact sheet
 * and the cross-species evaluator use — so a bank composition is valid by construction:
 * every part shares the fixed local views and anchors. The only thing this adds is id
 * namespacing, because unlike samples from one run, bank entries have unrelated origins
 * and can genuinely collide on gradient/mask ids.
 */
export function PartBankComposer({ onUse, onCancel }: PartBankComposerProps) {
  const { entries } = usePartBank();
  const [selection, setSelection] = useState<Selection>({});
  const [activeSlot, setActiveSlot] = useState<AnimalPartType>("body");

  const choose = (entry: PartBankEntry) =>
    setSelection((current) => ({ ...current, [entry.slot]: current[entry.slot]?.id === entry.id ? undefined : entry }));

  const randomFill = () => {
    const next: Selection = {};
    for (const slot of PART_TYPES) {
      const pool = filterEntries(entries, { slot });
      if (pool.length) next[slot] = pool[Math.floor(Math.random() * pool.length)];
    }
    setSelection(next);
  };

  const complete = PART_TYPES.every((slot) => selection[slot]);

  const composed = useMemo(() => {
    if (!complete) return { draft: undefined as AnimalDraft | undefined, error: "" };
    try {
      const chosen = Object.fromEntries(PART_TYPES.map((slot) => [slot, selection[slot]!])) as Record<AnimalPartType, PartBankEntry>;
      return { draft: composeFromEntries(chosen), error: "" };
    } catch (error: any) {
      return { draft: undefined, error: error?.message || "Could not assemble these parts." };
    }
  }, [selection, complete]);

  // Same deterministic re-check the contact sheet runs on its frankenstein: physical
  // ground truth only, since the parts never shared a plan.
  const assessment = useMemo(() => {
    if (!composed.draft) return undefined;
    try {
      return { validation: validateAnimalDraft(composed.draft), geometry: analyzeDraftGeometry(composed.draft) };
    } catch {
      return undefined;
    }
  }, [composed.draft]);

  const errorCount = assessment?.validation.issues.filter((issue) => issue.severity === "error").length ?? 0;
  const warningCount = assessment?.validation.issues.filter((issue) => issue.severity === "warning").length ?? 0;
  const assembledSvg = useMemo(() => (composed.draft ? buildAssembledPreviewSvg(composed.draft, false) : ""), [composed.draft]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-zinc-200">Compose from the part bank</span>
        <div className="ml-auto flex items-center gap-1.5">
          <button type="button" onClick={randomFill} className="inline-flex items-center gap-1 rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-[10px] font-mono text-zinc-300 hover:border-zinc-600">
            <Shuffle size={11} /> random
          </button>
          <button type="button" onClick={() => setSelection({})} className="inline-flex items-center gap-1 rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-[10px] font-mono text-zinc-300 hover:border-zinc-600">
            <RotateCcw size={11} /> clear
          </button>
          <button type="button" onClick={onCancel} className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-[10px] font-mono text-zinc-400 hover:text-zinc-200">
            back
          </button>
        </div>
      </div>

      {/* Slot strip — current pick per slot, and the slot the browser below is filtered to. */}
      <div className="grid grid-cols-5 gap-1.5">
        {PART_TYPES.map((slot) => {
          const entry = selection[slot];
          return (
            <button
              key={slot}
              type="button"
              onClick={() => setActiveSlot(slot)}
              className={`flex flex-col rounded-lg border p-1 text-left ${
                activeSlot === slot ? "border-amber-400 bg-amber-500/10" : "border-zinc-800 bg-zinc-900 hover:border-zinc-600"
              }`}
            >
              <span className="mb-0.5 truncate text-[8px] font-mono uppercase tracking-wider text-zinc-500">{SLOT_LABELS[slot]}</span>
              {entry ? (
                <div
                  className="h-24 w-full overflow-hidden rounded bg-[#fafafa] [&>svg]:h-full [&>svg]:w-full"
                  dangerouslySetInnerHTML={{ __html: buildIsolatedPartPreviewSvg(entryToPartDraft(entry), slot) }}
                />
              ) : (
                <div className="flex h-24 w-full items-center justify-center rounded border border-dashed border-zinc-800 bg-zinc-950 text-[8px] font-mono text-zinc-700">
                  empty
                </div>
              )}
              <span className="mt-0.5 truncate text-[8px] text-zinc-400">{entry?.name ?? "pick one"}</span>
            </button>
          );
        })}
      </div>

      <PartBankPanel
        slot={activeSlot}
        onInsert={choose}
        insertLabel="Use for slot"
        selectedIds={selection[activeSlot] ? [selection[activeSlot]!.id] : []}
        emptyHint={`No ${SLOT_LABELS[activeSlot].toLowerCase()} banked yet. Keep one from a contact sheet first.`}
      />

      <div className="grid grid-cols-1 gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div>
          <div className="mb-1 text-[11px] font-semibold text-zinc-300">Assembled from bank</div>
          {composed.draft ? (
            <div
              className="w-full max-w-md overflow-hidden rounded-lg border border-zinc-800 bg-[#fafafa] [&>svg]:h-auto [&>svg]:w-full"
              dangerouslySetInnerHTML={{ __html: assembledSvg }}
            />
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-[11px] text-zinc-500">
              <AlertTriangle size={12} className="text-zinc-600" />
              {composed.error || `Pick a part for all five slots (${PART_TYPES.filter((slot) => selection[slot]).length}/5 chosen).`}
            </div>
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
            disabled={!composed.draft}
            onClick={() => composed.draft && onUse(composed.draft)}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-zinc-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Sparkles size={14} /> Use this creature
          </button>
          <p className="text-[9px] leading-snug text-zinc-500">
            The body's palette and sockets become the creature's. Parts painted with ramp tokens re-colour to it; parts with literal fills keep their own.
          </p>
        </div>
      </div>
    </div>
  );
}
