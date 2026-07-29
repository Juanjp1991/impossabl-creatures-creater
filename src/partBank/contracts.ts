// Part bank (§5.5) — reusable individual parts, decoupled from the animal that produced
// them. The bank exists because the generation pipeline is already part-level: one
// `runSampleGeneration` call yields `sampleCount × 5` part candidates and the contact
// sheet keeps five. Everything else was discarded until now.
//
// An entry stores the part's art *plus* the per-slot layout metadata the generator
// emitted for it, so a banked part can be re-composed through `assembleFromPartDrafts`
// with its seam profile, ground contacts and depth groups intact. Saving a part as a
// bare SVG string (the copy-paste-into-the-textarea route) throws all of that away, so
// that route is supported but marked `manual`.
//
// This module is deliberately DOM-free so it is unit-testable in node; persistence lives
// in ./store and rendering lives in the components.

import { assembleFromPartDrafts } from "../generation/sampleSelection";
import type { AnimalPartType, BodyConnectionPoints } from "../types";
import type {
  AnimalDraft,
  BlueprintConnectionProfile,
  GeneratedLayoutMetadata,
  GenerationMetadata,
} from "../generation/contracts";
import {
  LIMB_CONTRACT_VERSION,
  PHYSICAL_LEGS,
  physicalLegContractIds,
  type LimbContractVersion,
  type PhysicalLegId,
} from "../generation/limbContract";

/** Fixed local views, per slot. Identical for every animal — this is what makes parts interchangeable. */
export const PART_VIEWS: Record<AnimalPartType, readonly [number, number]> = {
  head: [160, 160],
  body: [300, 220],
  frontLegs: [260, 180],
  backLegs: [260, 180],
  tail: [160, 160],
};

/** The SVG field on an AnimalDraft that carries each slot's art. */
export const SVG_FIELD: Record<AnimalPartType, keyof AnimalDraft> = {
  head: "headSvg",
  body: "bodySvg",
  frontLegs: "frontLegsSvg",
  backLegs: "backLegsSvg",
  tail: "tailSvg",
};

/** Matches the builder's own defaults (App.tsx), used when a non-body entry needs a host body. */
export const DEFAULT_BODY_CONNECTIONS: BodyConnectionPoints = {
  neck: { x: 75, y: 90 },
  tail: { x: 260, y: 105 },
  frontLegs: { x: 115, y: 160 },
  backLegs: { x: 235, y: 160 },
};

export type PartBankSource = "generated" | "manual" | "builtin";

/** Deterministic per-slot quality numbers, copied from the contact sheet at save time. */
export interface PartBankStats {
  seamPixels: number | null;
  fillRatio: number;
  elementCount: number;
  errorCount: number;
}

/** Where the part came from — what makes "which model gives me the best tails" answerable. */
export interface PartBankProvenance {
  /** Species/animal name of the draft this part was harvested from. */
  animalName?: string;
  /** Contact-sheet variation label, e.g. "stylised-bold". */
  emphasis?: string;
  /** Sample index within its generation run. */
  sampleIndex?: number;
  models?: GenerationMetadata["models"];
  promptVersions?: GenerationMetadata["promptVersions"];
}

export interface PartBankEntry {
  id: string;
  slot: AnimalPartType;
  name: string;
  /** The part art, in the slot's fixed local view. Ramp tokens are preserved verbatim. */
  svg: string;
  /** Palette the part was authored against. Ramp-token fills re-colour to the host animal. */
  color: string;
  accentColor: string;
  /** Body entries carry the socket layout; other slots leave this undefined. */
  bodyConnections?: BodyConnectionPoints;
  /** Seam/attachment profile for this slot. Absent for body and for manually pasted art. */
  connection?: BlueprintConnectionProfile;
  /** Limb ground contacts, in the slot's local view. */
  groundContacts?: Array<{ x: number; y: number; raised?: boolean }>;
  /** Semantic near/far group ids inside `svg`. Remapped when ids are namespaced. */
  depthGroups?: { farGroupId: string; nearGroupId: string };
  /** Strict per-leg identities retained so banked limbs remain animation-ready. */
  limbContractVersion?: LimbContractVersion;
  limbInstances?: GeneratedLayoutMetadata["limbInstances"];
  facing?: "left" | "right";
  groundY?: number;
  source: PartBankSource;
  provenance?: PartBankProvenance;
  stats?: PartBankStats;
  tags: string[];
  favorite: boolean;
  /**
   * §P2: marked as house-style art to show the generator. Deliberately separate from
   * `favorite` so bookmarking stays personal and exemplar selection stays a deliberate act —
   * "I like this" and "draw more things like this" are different judgements.
   */
  exemplar?: boolean;
  createdAt: string;
  updatedAt: string;
  /**
   * Copy-on-apply is the editing model: inserting an entry deep-copies it, so edits never
   * propagate. `revision` and `lineageId` are recorded from day one so pinned revisions can
   * be added later without migrating existing banks.
   */
  revision: number;
  lineageId: string;
}

export interface PartBankState {
  formatVersion: 1;
  entries: PartBankEntry[];
}

export const PART_BANK_FORMAT_VERSION = 1 as const;

const RESERVED = /[^a-z0-9]+/g;

export function idToken(value: string): string {
  return value.toLowerCase().replace(RESERVED, "-").replace(/^-|-$/g, "");
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export interface NamespacedSvg {
  svg: string;
  /** old id -> new id, so callers can remap depth groups and named groups too. */
  mapping: Map<string, string>;
}

/**
 * Rewrite every `id` in a part fragment, plus the `url(#…)` and `href="#…"` references
 * that point at them.
 *
 * This is the collision guard the manual copy-paste route silently lacks: two parts that
 * both declare `<linearGradient id="fur">` do not error, they just render each other's
 * paint. Mirrors `namespacePartSvg` in the package compiler, generalised to a bare prefix.
 *
 * `keep` names ids that must survive verbatim — the contract ids the validator matches on
 * (`head-root`, `frontLegs-far`, …), which are unique by construction and must not be
 * rewritten into `frontLegs-frontLegs-far`.
 */
export function namespaceSvgIds(svg: string, prefix: string, keep?: ReadonlySet<string>): NamespacedSvg {
  const ids = [...svg.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1]);
  const mapping = new Map<string, string>();
  for (const id of ids) {
    if (mapping.has(id) || keep?.has(id)) continue;
    mapping.set(id, `${idToken(prefix)}-${idToken(id)}`);
  }
  let out = svg;
  for (const [oldId, newId] of mapping) {
    const escaped = escapeRegExp(oldId);
    out = out
      .replace(new RegExp(`(\\bid\\s*=\\s*["'])${escaped}(["'])`, "g"), `$1${newId}$2`)
      .replace(new RegExp(`url\\(\\s*#${escaped}\\s*\\)`, "g"), `url(#${newId})`)
      .replace(new RegExp(`((?:href|xlink:href)\\s*=\\s*["'])#${escaped}(["'])`, "g"), `$1#${newId}$2`);
  }
  return { svg: out, mapping };
}

/** Return a copy of `entry` whose SVG ids are unique to `prefix`, with depth groups remapped. */
export function namespaceEntry(entry: PartBankEntry, prefix: string): PartBankEntry {
  const keep = new Set<string>([`${entry.slot}-root`]);
  if (entry.slot === "frontLegs" || entry.slot === "backLegs") {
    for (const id of physicalLegContractIds(entry.slot)) keep.add(id);
  }
  for (const instance of Object.values(entry.limbInstances ?? {})) {
    if (!instance) continue;
    keep.add(instance.groupId);
    keep.add(instance.depthGroupId);
  }
  const { svg, mapping } = namespaceSvgIds(entry.svg, prefix, keep);
  return {
    ...entry,
    svg,
    ...(entry.depthGroups
      ? {
          depthGroups: {
            farGroupId: mapping.get(entry.depthGroups.farGroupId) ?? entry.depthGroups.farGroupId,
            nearGroupId: mapping.get(entry.depthGroups.nearGroupId) ?? entry.depthGroups.nearGroupId,
          },
        }
      : {}),
  };
}

export function makeEntryId(slot: AnimalPartType): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `pb-${slot}-${Date.now().toString(36)}-${random}`;
}

/**
 * Lift one slot out of a generated draft into a bank entry, carrying the slot's own
 * layout metadata rather than the whole animal's.
 */
export function partEntryFromDraft(
  draft: AnimalDraft,
  slot: AnimalPartType,
  options: {
    name?: string;
    source?: PartBankSource;
    provenance?: PartBankProvenance;
    stats?: PartBankStats;
    tags?: string[];
  } = {}
): PartBankEntry {
  const svg = String(draft[SVG_FIELD[slot]] ?? "");
  const layout = draft.layoutMetadata;
  const now = new Date().toISOString();
  const id = makeEntryId(slot);
  const limb = slot === "frontLegs" || slot === "backLegs" ? slot : undefined;
  return {
    id,
    slot,
    name: options.name?.trim() || `${draft.name || "Untitled"} ${SLOT_LABELS[slot]}`,
    svg,
    color: draft.color || "#cccccc",
    accentColor: draft.accentColor || "#ffaa00",
    ...(slot === "body" ? { bodyConnections: draft.bodyConnections } : {}),
    ...(slot === "body"
      ? {}
      : { connection: layout?.connections?.find((entry) => entry.part === slot) }),
    ...(limb && layout?.groundContacts?.[limb] ? { groundContacts: layout.groundContacts[limb] } : {}),
    ...(limb && layout?.depthGroups?.[limb] ? { depthGroups: layout.depthGroups[limb] } : {}),
    ...(limb && layout?.limbContractVersion === LIMB_CONTRACT_VERSION
      ? {
          limbContractVersion: LIMB_CONTRACT_VERSION,
          limbInstances: Object.fromEntries(
            PHYSICAL_LEGS
              .filter((spec) => spec.part === limb)
              .flatMap((spec) => {
                const instance = layout.limbInstances?.[spec.id];
                return instance ? [[spec.id, instance]] : [];
              }),
          ) as Partial<Record<PhysicalLegId, NonNullable<GeneratedLayoutMetadata["limbInstances"]>[PhysicalLegId]>>,
        }
      : {}),
    ...(layout?.facing ? { facing: layout.facing } : {}),
    ...(typeof layout?.groundY === "number" ? { groundY: layout.groundY } : {}),
    source: options.source ?? "generated",
    ...(options.provenance ? { provenance: options.provenance } : {}),
    ...(options.stats ? { stats: options.stats } : {}),
    tags: options.tags ?? [],
    favorite: false,
    createdAt: now,
    updatedAt: now,
    revision: 1,
    lineageId: id,
  };
}

export const SLOT_LABELS: Record<AnimalPartType, string> = {
  head: "Head",
  body: "Body",
  frontLegs: "Front Legs",
  backLegs: "Back Legs",
  tail: "Tail",
};

/**
 * Wrap one entry as a single-slot AnimalDraft.
 *
 * This is the adapter that lets the bank reuse everything already built: preview builders
 * read only their slot's field, and `assembleFromPartDrafts` takes exactly this shape as
 * its per-slot source.
 */
export function entryToPartDraft(entry: PartBankEntry): AnimalDraft {
  const limb = entry.slot === "frontLegs" || entry.slot === "backLegs" ? entry.slot : undefined;
  const layoutMetadata: GeneratedLayoutMetadata = {
    facing: entry.facing ?? "left",
    groundY: entry.groundY ?? 0,
    connections: entry.connection ? [entry.connection] : [],
    groundContacts: limb && entry.groundContacts ? { [limb]: entry.groundContacts } : {},
    depthGroups: limb && entry.depthGroups ? { [limb]: entry.depthGroups } : {},
    ...(limb && entry.limbContractVersion === LIMB_CONTRACT_VERSION
      ? { limbContractVersion: LIMB_CONTRACT_VERSION, limbInstances: entry.limbInstances ?? {} }
      : {}),
  };
  const draft: AnimalDraft = {
    name: entry.name,
    color: entry.color,
    accentColor: entry.accentColor,
    description: entry.name,
    bodyConnections: entry.bodyConnections ?? DEFAULT_BODY_CONNECTIONS,
    headSvg: "",
    bodySvg: "",
    frontLegsSvg: "",
    backLegsSvg: "",
    tailSvg: "",
    layoutMetadata,
  };
  return { ...draft, [SVG_FIELD[entry.slot]]: entry.svg };
}

/**
 * True when this layout block carries no actual information — only the defaults
 * `assembleFromPartDrafts` fills in when its sources had nothing to contribute.
 */
function isEmptyLayout(layout: GeneratedLayoutMetadata | undefined): boolean {
  if (!layout) return true;
  const contacts = Object.values(layout.groundContacts ?? {}).filter((value) => value?.length);
  const depth = Object.values(layout.depthGroups ?? {}).filter(Boolean);
  return layout.connections.length === 0 && contacts.length === 0 && depth.length === 0;
}

/**
 * Compose one animal from five bank entries.
 *
 * Wraps `assembleFromPartDrafts` with two things only the bank needs:
 *
 * 1. Id namespacing, because unlike samples from one run these parts have unrelated
 *    origins and can genuinely collide on gradient/mask ids.
 * 2. Dropping a layout block that carries no information. `assembleFromPartDrafts` always
 *    emits one, and the validator gates its whole layout section on the block merely being
 *    *present* — so composing hand-authored or legacy parts, which never had ground
 *    contacts or depth groups, would otherwise report errors for metadata that was never
 *    claimed. Absence is valid and reads as legacy, exactly as the package layer treats it.
 */
export function composeFromEntries(entries: Record<AnimalPartType, PartBankEntry>): AnimalDraft {
  const bySlot = Object.fromEntries(
    (Object.keys(entries) as AnimalPartType[]).map((slot) => {
      const entry = entries[slot];
      return [slot, entryToPartDraft(namespaceEntry(entry, entry.id))];
    })
  ) as Record<AnimalPartType, AnimalDraft>;
  const composed = assembleFromPartDrafts(bySlot);
  if (!isEmptyLayout(composed.layoutMetadata)) return composed;
  const { layoutMetadata, ...rest } = composed;
  return rest;
}

/** True when the part paints with ramp tokens and will therefore recolour to its host. */
export function usesRampTokens(svg: string): boolean {
  return /\b(?:fill|stroke)\s*=\s*["'](?:primary|accent)(?:-light|-dark)?["']/i.test(svg)
    || /var\(\s*--(?:primary|accent)/i.test(svg);
}

/** Literal hex fills — the reason a pasted part can look bolted on rather than native. */
export function literalHexFills(svg: string): string[] {
  const found = new Set<string>();
  for (const match of svg.matchAll(/\b(?:fill|stroke)\s*=\s*["'](#[0-9a-f]{3,8})["']/gi)) {
    found.add(match[1].toLowerCase());
  }
  return [...found];
}
