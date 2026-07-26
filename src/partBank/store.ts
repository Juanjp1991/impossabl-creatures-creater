// localStorage persistence for the part bank.
//
// Kept in its own key rather than appended to `creature_builder_custom_animals`: the bank
// has a different lifetime (it outlives any single animal) and a different size profile
// (it grows with every kept candidate). Every mutator returns the new entry list so React
// callers can setState from the return value without re-reading storage.

import type { AnimalPartType } from "../types";
import {
  PART_BANK_FORMAT_VERSION,
  type PartBankEntry,
  type PartBankState,
} from "./contracts";

export const PART_BANK_STORAGE_KEY = "creature_builder_part_bank";

/** Minimal shape of the Web Storage API, so tests can pass a fake. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultStorage(): StorageLike | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

const EMPTY: PartBankState = { formatVersion: PART_BANK_FORMAT_VERSION, entries: [] };

/**
 * Drop anything that would break a consumer downstream. A single corrupt record must not
 * take the whole bank with it, so this filters rather than throws.
 */
function sanitizeEntry(raw: any): PartBankEntry | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const slot = raw.slot as AnimalPartType;
  if (!["head", "body", "frontLegs", "backLegs", "tail"].includes(slot)) return undefined;
  if (typeof raw.id !== "string" || !raw.id) return undefined;
  if (typeof raw.svg !== "string" || !raw.svg.trim()) return undefined;
  const createdAt = typeof raw.createdAt === "string" ? raw.createdAt : new Date(0).toISOString();
  return {
    ...raw,
    slot,
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name : `Untitled ${slot}`,
    color: typeof raw.color === "string" ? raw.color : "#cccccc",
    accentColor: typeof raw.accentColor === "string" ? raw.accentColor : "#ffaa00",
    source: ["generated", "manual", "builtin"].includes(raw.source) ? raw.source : "manual",
    tags: Array.isArray(raw.tags) ? raw.tags.filter((tag: unknown) => typeof tag === "string") : [],
    favorite: Boolean(raw.favorite),
    exemplar: Boolean(raw.exemplar),
    createdAt,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : createdAt,
    revision: Number.isFinite(raw.revision) ? Number(raw.revision) : 1,
    lineageId: typeof raw.lineageId === "string" && raw.lineageId ? raw.lineageId : raw.id,
  } as PartBankEntry;
}

export function parsePartBank(serialized: string | null): PartBankState {
  if (!serialized) return { ...EMPTY, entries: [] };
  try {
    const parsed = JSON.parse(serialized);
    // Tolerate both the wrapped state and a bare array, so an exported entry list can be
    // imported directly without the caller having to wrap it.
    const rawEntries = Array.isArray(parsed) ? parsed : parsed?.entries;
    if (!Array.isArray(rawEntries)) return { ...EMPTY, entries: [] };
    const entries = rawEntries
      .map(sanitizeEntry)
      .filter((entry): entry is PartBankEntry => Boolean(entry));
    return { formatVersion: PART_BANK_FORMAT_VERSION, entries };
  } catch {
    return { ...EMPTY, entries: [] };
  }
}

export function loadPartBank(storage: StorageLike | undefined = defaultStorage()): PartBankEntry[] {
  if (!storage) return [];
  try {
    return parsePartBank(storage.getItem(PART_BANK_STORAGE_KEY)).entries;
  } catch {
    return [];
  }
}

export class PartBankQuotaError extends Error {
  constructor() {
    super("The part bank is full — browser storage is out of space. Delete a few entries or export and clear the bank.");
    this.name = "PartBankQuotaError";
  }
}

export function savePartBank(
  entries: PartBankEntry[],
  storage: StorageLike | undefined = defaultStorage()
): PartBankEntry[] {
  if (!storage) return entries;
  const state: PartBankState = { formatVersion: PART_BANK_FORMAT_VERSION, entries };
  try {
    storage.setItem(PART_BANK_STORAGE_KEY, JSON.stringify(state));
  } catch (error: any) {
    // localStorage is ~5MB and part SVGs are not small; surface this rather than losing
    // the write silently, which would look like "the save button does nothing".
    if (error?.name === "QuotaExceededError" || error?.name === "NS_ERROR_DOM_QUOTA_REACHED") {
      throw new PartBankQuotaError();
    }
    throw error;
  }
  return entries;
}

/** Newest first, favourites pinned above the rest. */
export function sortEntries(entries: PartBankEntry[]): PartBankEntry[] {
  return [...entries].sort((a, b) => {
    if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
    return (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt);
  });
}

export function addPartEntry(
  entries: PartBankEntry[],
  entry: PartBankEntry,
  storage?: StorageLike
): PartBankEntry[] {
  return savePartBank([entry, ...entries.filter((existing) => existing.id !== entry.id)], storage);
}

export function updatePartEntry(
  entries: PartBankEntry[],
  id: string,
  patch: Partial<PartBankEntry>,
  storage?: StorageLike
): PartBankEntry[] {
  const next = entries.map((entry) =>
    entry.id === id
      ? { ...entry, ...patch, id: entry.id, updatedAt: new Date().toISOString() }
      : entry
  );
  return savePartBank(next, storage);
}

export function deletePartEntry(
  entries: PartBankEntry[],
  id: string,
  storage?: StorageLike
): PartBankEntry[] {
  return savePartBank(entries.filter((entry) => entry.id !== id), storage);
}

export interface PartBankFilter {
  slot?: AnimalPartType;
  search?: string;
  tag?: string;
  favoritesOnly?: boolean;
  exemplarsOnly?: boolean;
  source?: PartBankEntry["source"];
}

export function filterEntries(entries: PartBankEntry[], filter: PartBankFilter): PartBankEntry[] {
  const needle = filter.search?.trim().toLowerCase();
  return sortEntries(
    entries.filter((entry) => {
      if (filter.slot && entry.slot !== filter.slot) return false;
      if (filter.favoritesOnly && !entry.favorite) return false;
      if (filter.exemplarsOnly && !entry.exemplar) return false;
      if (filter.source && entry.source !== filter.source) return false;
      if (filter.tag && !entry.tags.includes(filter.tag)) return false;
      if (needle) {
        const haystack = [entry.name, entry.provenance?.animalName, entry.provenance?.emphasis, ...entry.tags]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    })
  );
}

export function allTags(entries: PartBankEntry[]): string[] {
  return [...new Set(entries.flatMap((entry) => entry.tags))].sort();
}

/** Deterministic JSON for the export button — stable key order comes from the entry shape. */
export function serializePartBank(entries: PartBankEntry[]): string {
  return JSON.stringify({ formatVersion: PART_BANK_FORMAT_VERSION, entries }, null, 2);
}

/**
 * Import entries alongside the current bank. Ids that already exist are re-issued rather
 * than overwriting, so importing a file twice never clobbers local edits.
 */
export function mergeImportedEntries(
  current: PartBankEntry[],
  incoming: PartBankEntry[]
): { entries: PartBankEntry[]; added: number } {
  const taken = new Set(current.map((entry) => entry.id));
  const added: PartBankEntry[] = [];
  for (const entry of incoming) {
    if (taken.has(entry.id)) {
      const reissued = `${entry.id}-import-${Math.random().toString(36).slice(2, 6)}`;
      added.push({ ...entry, id: reissued });
      taken.add(reissued);
    } else {
      added.push(entry);
      taken.add(entry.id);
    }
  }
  return { entries: [...added, ...current], added: added.length };
}
