import React, { useMemo, useRef, useState } from "react";
import { Download, Search, Star, Trash2, Upload, X, Check, Pencil, Palette } from "lucide-react";
import type { AnimalPartType } from "../types";
import { PART_TYPES } from "../generation/contracts";
import { buildIsolatedPartPreviewSvg } from "../generation/preview";
import {
  SLOT_LABELS,
  entryToPartDraft,
  literalHexFills,
  usesRampTokens,
  type PartBankEntry,
} from "../partBank/contracts";
import { allTags, filterEntries, serializePartBank } from "../partBank/store";
import { usePartBank } from "../partBank/usePartBank";

interface PartBankPanelProps {
  /** Lock the browser to one slot — you are only ever looking for a tail in a tail slot. */
  slot?: AnimalPartType;
  /** Called with a deep copy of the picked entry. Omit to browse read-only. */
  onInsert?: (entry: PartBankEntry) => void;
  /** Label on the insert button; the composer and the SVG rows want different words. */
  insertLabel?: string;
  /** Ids to show as already chosen (composer selection). */
  selectedIds?: string[];
  onClose?: () => void;
  emptyHint?: string;
}

/** A part thumbnail, rendered through the same isolated-preview builder the contact sheet uses. */
function PartThumb({ entry }: { entry: PartBankEntry }) {
  // Keyed on the art itself: entries are immutable in practice (copy-on-apply), so this
  // rebuilds only when a part is genuinely re-saved rather than on every grid render.
  const svg = useMemo(() => buildIsolatedPartPreviewSvg(entryToPartDraft(entry), entry.slot), [entry.svg, entry.color, entry.accentColor, entry.slot]);
  return (
    <div
      // Capped rather than a bare aspect-square: in a wide dialog the grid cells get large
      // enough that one row of thumbnails fills the viewport. The SVG letterboxes inside.
      className="aspect-square max-h-32 w-full overflow-hidden rounded bg-[#fafafa] [&>svg]:h-full [&>svg]:w-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export function PartBankPanel({ slot, onInsert, insertLabel = "Insert", selectedIds, onClose, emptyHint }: PartBankPanelProps) {
  const { entries, error, setError, updatePart, deletePart, importJson } = usePartBank();
  const [slotFilter, setSlotFilter] = useState<AnimalPartType | "all">(slot ?? "all");
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const effectiveSlot = slot ?? (slotFilter === "all" ? undefined : slotFilter);
  const visible = useMemo(
    () => filterEntries(entries, { slot: effectiveSlot, search, tag: tag || undefined, favoritesOnly }),
    [entries, effectiveSlot, search, tag, favoritesOnly]
  );
  const tags = useMemo(() => allTags(entries), [entries]);

  const exportBank = () => {
    const blob = new Blob([serializePartBank(entries)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `part-bank-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const onImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const added = importJson(await file.text());
    if (added) setError("");
  };

  const commitRename = (entry: PartBankEntry) => {
    const next = renameValue.trim();
    if (next && next !== entry.name) updatePart(entry.id, { name: next });
    setRenaming(null);
  };

  const editTags = (entry: PartBankEntry) => {
    const raw = window.prompt("Tags (comma separated)", entry.tags.join(", "));
    if (raw === null) return;
    updatePart(entry.id, { tags: [...new Set(raw.split(",").map((value) => value.trim()).filter(Boolean))] });
  };

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-zinc-800 bg-zinc-950/60 p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold text-zinc-300">
          Part bank{slot ? ` · ${SLOT_LABELS[slot]}` : ""}
        </span>
        <span className="text-[9px] font-mono text-zinc-600">{visible.length}/{entries.length}</span>
        <div className="relative ml-auto">
          <Search size={11} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-zinc-600" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="search"
            className="w-32 rounded border border-zinc-800 bg-zinc-900 py-1 pl-6 pr-2 text-[10px] text-zinc-200 focus:border-amber-500 focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={() => setFavoritesOnly((value) => !value)}
          title="Favourites only"
          className={`rounded border p-1 ${favoritesOnly ? "border-amber-500 bg-amber-500/10 text-amber-400" : "border-zinc-800 bg-zinc-900 text-zinc-500 hover:text-zinc-300"}`}
        >
          <Star size={11} fill={favoritesOnly ? "currentColor" : "none"} />
        </button>
        <button type="button" onClick={exportBank} title="Export bank as JSON" className="rounded border border-zinc-800 bg-zinc-900 p-1 text-zinc-500 hover:text-zinc-300">
          <Download size={11} />
        </button>
        <button type="button" onClick={() => fileInput.current?.click()} title="Import bank JSON" className="rounded border border-zinc-800 bg-zinc-900 p-1 text-zinc-500 hover:text-zinc-300">
          <Upload size={11} />
        </button>
        <input ref={fileInput} type="file" accept="application/json,.json" onChange={onImportFile} className="hidden" />
        {onClose && (
          <button type="button" onClick={onClose} title="Close" className="rounded border border-zinc-800 bg-zinc-900 p-1 text-zinc-500 hover:text-zinc-300">
            <X size={11} />
          </button>
        )}
      </div>

      {!slot && (
        <div className="flex flex-wrap gap-1">
          {(["all", ...PART_TYPES] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setSlotFilter(value as AnimalPartType | "all")}
              className={`rounded px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider ${
                slotFilter === value ? "bg-amber-500 text-zinc-950" : "bg-zinc-900 text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {value === "all" ? "all" : SLOT_LABELS[value as AnimalPartType]}
            </button>
          ))}
        </div>
      )}

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setTag((current) => (current === value ? "" : value))}
              className={`rounded-full px-2 py-0.5 text-[9px] ${tag === value ? "bg-sky-500 text-zinc-950" : "bg-zinc-900 text-zinc-500 hover:text-zinc-300"}`}
            >
              #{value}
            </button>
          ))}
        </div>
      )}

      {error && <p className="rounded border border-amber-900/50 bg-amber-950/20 p-1.5 text-[10px] text-amber-300">{error}</p>}

      {visible.length === 0 ? (
        <p className="px-1 py-4 text-center text-[10px] leading-relaxed text-zinc-600">
          {entries.length === 0
            ? emptyHint || "Nothing banked yet. Keep parts from the contact sheet, or save one from an SVG editor below."
            : "No parts match these filters."}
        </p>
      ) : (
        <div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-4">
          {visible.map((entry) => {
            const chosen = selectedIds?.includes(entry.id);
            const hex = literalHexFills(entry.svg);
            const recolours = usesRampTokens(entry.svg);
            return (
              <div
                key={entry.id}
                className={`flex flex-col rounded-lg border p-1.5 ${chosen ? "border-amber-400 bg-amber-500/10" : "border-zinc-800 bg-zinc-900"}`}
              >
                <div className="mb-1 flex items-center justify-between gap-1">
                  <span className="truncate text-[8px] font-mono uppercase tracking-wider text-zinc-500">
                    {SLOT_LABELS[entry.slot]}
                  </span>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => updatePart(entry.id, { favorite: !entry.favorite })}
                      title="Favourite"
                      className={entry.favorite ? "text-amber-400" : "text-zinc-600 hover:text-zinc-400"}
                    >
                      <Star size={10} fill={entry.favorite ? "currentColor" : "none"} />
                    </button>
                    {/*
                      §P2: separate from the star on purpose. Favourite is "I like this";
                      exemplar is "draw the next one in this style", and it is sent to the
                      model, so it should be a deliberate act rather than a side effect of
                      bookmarking.
                    */}
                    <button
                      type="button"
                      onClick={() => updatePart(entry.id, { exemplar: !entry.exemplar })}
                      title={entry.exemplar ? "House-style exemplar: shown to the generator for this slot" : "Use as a house-style exemplar for this slot"}
                      className={entry.exemplar ? "text-emerald-400" : "text-zinc-600 hover:text-zinc-400"}
                    >
                      <Palette size={10} />
                    </button>
                    <button type="button" onClick={() => { setRenaming(entry.id); setRenameValue(entry.name); }} title="Rename" className="text-zinc-600 hover:text-zinc-400">
                      <Pencil size={10} />
                    </button>
                    <button
                      type="button"
                      onClick={() => (confirmingDelete === entry.id ? (deletePart(entry.id), setConfirmingDelete(null)) : setConfirmingDelete(entry.id))}
                      title={confirmingDelete === entry.id ? "Click again to delete" : "Delete"}
                      className={confirmingDelete === entry.id ? "text-red-400" : "text-zinc-600 hover:text-zinc-400"}
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                </div>

                <PartThumb entry={entry} />

                {renaming === entry.id ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(event) => setRenameValue(event.target.value)}
                    onBlur={() => commitRename(entry)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") commitRename(entry);
                      if (event.key === "Escape") setRenaming(null);
                    }}
                    className="mt-1 w-full rounded border border-amber-500 bg-zinc-950 px-1 py-0.5 text-[9px] text-zinc-200 focus:outline-none"
                  />
                ) : (
                  <span className="mt-1 truncate text-[9px] text-zinc-300" title={entry.name}>{entry.name}</span>
                )}

                <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[8px] font-mono">
                  {entry.provenance?.emphasis && <span className="text-zinc-600">{entry.provenance.emphasis}</span>}
                  {entry.source === "manual" && <span className="text-zinc-600">hand-pasted</span>}
                  {entry.stats && <span className="text-zinc-600">el {entry.stats.elementCount}</span>}
                  <span
                    className={recolours ? "text-emerald-500" : "text-amber-500"}
                    title={recolours ? "Paints with ramp tokens — recolours to the host animal" : `Literal fills (${hex.join(", ") || "none"}) — keeps its original colours`}
                  >
                    {recolours ? "recolours" : "fixed palette"}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => editTags(entry)}
                  className="mt-0.5 truncate text-left text-[8px] text-zinc-600 hover:text-zinc-400"
                  title="Edit tags"
                >
                  {entry.tags.length ? entry.tags.map((value) => `#${value}`).join(" ") : "+ tags"}
                </button>

                {onInsert && (
                  <button
                    type="button"
                    onClick={() => onInsert(entry)}
                    className={`mt-1.5 inline-flex items-center justify-center gap-1 rounded px-2 py-1 text-[9px] font-semibold ${
                      chosen ? "bg-amber-400 text-zinc-950" : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
                    }`}
                  >
                    {chosen ? <><Check size={9} /> chosen</> : insertLabel}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
