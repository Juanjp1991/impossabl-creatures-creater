import { useCallback, useEffect, useState } from "react";
import type { AnimalPartType } from "../types";
import type { AnimalDraft } from "../generation/contracts";
import {
  partEntryFromDraft,
  type PartBankEntry,
  type PartBankProvenance,
  type PartBankSource,
  type PartBankStats,
} from "./contracts";
import {
  addPartEntry,
  deletePartEntry,
  loadPartBank,
  mergeImportedEntries,
  parsePartBank,
  savePartBank,
  updatePartEntry,
} from "./store";

export interface SavePartOptions {
  name?: string;
  source?: PartBankSource;
  provenance?: PartBankProvenance;
  stats?: PartBankStats;
  tags?: string[];
}

/**
 * Single source of truth for the bank inside a React tree.
 *
 * Mounted independently in several places (each SVG editor row, the contact sheet, the
 * composer), so it listens for `storage` events to stay consistent across those instances
 * and across tabs rather than each copy drifting from the others.
 */
export function usePartBank() {
  const [entries, setEntries] = useState<PartBankEntry[]>(() => loadPartBank());
  const [error, setError] = useState("");

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key && event.key !== "creature_builder_part_bank") return;
      setEntries(loadPartBank());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Writes go through here so a quota failure becomes a visible message instead of an
  // unhandled rejection, and so every mounted copy re-reads the same list.
  const commit = useCallback((next: () => PartBankEntry[]) => {
    try {
      const value = next();
      setEntries(value);
      setError("");
      window.dispatchEvent(new StorageEvent("storage", { key: "creature_builder_part_bank" }));
      return value;
    } catch (err: any) {
      setError(err?.message || "Could not write to the part bank.");
      return undefined;
    }
  }, []);

  const savePart = useCallback(
    (draft: AnimalDraft, slot: AnimalPartType, options: SavePartOptions = {}) => {
      const entry = partEntryFromDraft(draft, slot, options);
      if (!entry.svg.trim()) {
        setError(`There is no ${slot} art to save.`);
        return undefined;
      }
      return commit(() => addPartEntry(loadPartBank(), entry)) ? entry : undefined;
    },
    [commit]
  );

  const updatePart = useCallback(
    (id: string, patch: Partial<PartBankEntry>) => commit(() => updatePartEntry(loadPartBank(), id, patch)),
    [commit]
  );

  const deletePart = useCallback(
    (id: string) => commit(() => deletePartEntry(loadPartBank(), id)),
    [commit]
  );

  const importJson = useCallback(
    (json: string) => {
      const incoming = parsePartBank(json).entries;
      if (!incoming.length) {
        setError("That file contained no usable part entries.");
        return 0;
      }
      const merged = mergeImportedEntries(loadPartBank(), incoming);
      commit(() => savePartBank(merged.entries));
      return merged.added;
    },
    [commit]
  );

  return { entries, error, setError, savePart, updatePart, deletePart, importJson };
}
