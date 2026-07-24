// §5.4 cross-species evaluation. Every quality gate in the repo measures the pure animal,
// but 100% of what the player sees is a cross-species hybrid. A hybrid IS a valid synthetic
// AnimalDraft (body + bodyConnections from species A, the other four fields from B–E), and
// every part shares the fixed local views and anchors — so analyzeDraftGeometry runs on it
// unchanged. We assemble N random hybrids, run the existing analyzer plus the §5.2 metrics,
// and flag numeric outliers before a human eyeballs a grid.
//
// What the numbers catch (free from the analyzer): seam integrity, unrelated-part overlap,
// ground-line mismatch. What §5.2 now catches by construction: palette clash (shared ramp)
// and gross scale (fixed views). What a human still must eyeball: style-register drift
// (cartoon head on a semi-real body) and per-marking palette taste.

import { PART_TYPES, type AnimalDraft } from "./contracts";
import type { AnimalPartType } from "../types";
import { analyzeDraftGeometry } from "./geometry";
import { validateAnimalDraft } from "./validation";
import { assembleFromPartDrafts } from "./sampleSelection";
import { DENSITY_BANDS, FILL_BAND, localFillRatio, strokeWidths, visibleElementCount } from "./metrics";

const ATTACHED: Exclude<AnimalPartType, "body">[] = ["head", "frontLegs", "backLegs", "tail"];
const SVG_FIELD = { head: "headSvg", body: "bodySvg", frontLegs: "frontLegsSvg", backLegs: "backLegsSvg", tail: "tailSvg" } as const;
// Adjacent parts across a seam — a density or stroke jump here is what reads as whiplash.
const ADJACENT: Array<[AnimalPartType, AnimalPartType]> = [["head", "body"], ["body", "frontLegs"], ["body", "backLegs"], ["body", "tail"]];

// A part can donate its slot as long as it actually has art there. Every sample of every
// species targets the same fixed local view and anchor for a slot, so any non-empty slot SVG
// is interchangeable — we do not require the shared root id, so built-in and legacy library
// animals (whose art predates the root-id convention) are eligible donors too.

export interface RosterEntry { id: string; draft: AnimalDraft; }

export interface HybridEvaluation {
  index: number;
  sources: Record<AnimalPartType, string>;
  seamPixels: Record<Exclude<AnimalPartType, "body">, number>;
  fillRatios: Record<AnimalPartType, number>;
  elementCounts: Record<AnimalPartType, number>;
  silhouetteStroke: Record<AnimalPartType, number>;
  errorCount: number;
  flags: string[];
}

export interface CrossSpeciesReport {
  sampleCount: number;
  distinctSpecies: number;
  evaluations: HybridEvaluation[];
  flaggedCount: number;
  summary: { seamFailures: number; groundMismatches: number; unrelatedOverlaps: number; scaleOutliers: number; densityWhiplash: number; strokeMismatch: number };
}

// Small deterministic RNG so a report is reproducible from its seed.
function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const dominantStroke = (svg: string) => { const widths = strokeWidths(svg); return widths.length ? Math.max(...widths) : 0; };

function donorsFor(slot: AnimalPartType, roster: RosterEntry[]): RosterEntry[] {
  const field = SVG_FIELD[slot];
  return roster.filter((entry) => {
    const svg = entry.draft[field];
    return typeof svg === "string" && svg.trim().length > 0;
  });
}

/**
 * Assemble N random cross-species hybrids from the roster and flag numeric outliers. Each
 * slot is drawn independently (favouring a species other than the body's, to actually test
 * mixing) from the entries that can donate that slot.
 */
export function evaluateCrossSpecies(roster: RosterEntry[], options: { sampleCount?: number; seed?: number } = {}): CrossSpeciesReport {
  const sampleCount = Math.max(0, options.sampleCount ?? 10);
  const random = mulberry32(options.seed ?? 1);
  const donors = Object.fromEntries(PART_TYPES.map((slot) => [slot, donorsFor(slot, roster)])) as Record<AnimalPartType, RosterEntry[]>;
  const evaluations: HybridEvaluation[] = [];

  const pick = (slot: AnimalPartType, avoidId?: string): RosterEntry | undefined => {
    const pool = donors[slot];
    if (!pool.length) return undefined;
    const preferred = avoidId && pool.length > 1 ? pool.filter((entry) => entry.id !== avoidId) : pool;
    const chosen = preferred.length ? preferred : pool;
    return chosen[Math.floor(random() * chosen.length)];
  };

  for (let index = 0; index < sampleCount; index++) {
    const body = pick("body");
    if (!body) break;
    const sources = { body } as Record<AnimalPartType, RosterEntry>;
    let complete = true;
    for (const slot of ATTACHED) {
      const donor = pick(slot, body.id);
      if (!donor) { complete = false; break; }
      sources[slot] = donor;
    }
    if (!complete) break;

    const draft = assembleFromPartDrafts(Object.fromEntries(PART_TYPES.map((slot) => [slot, sources[slot].draft])) as Record<AnimalPartType, AnimalDraft>);
    evaluations.push(evaluateHybrid(index, draft, Object.fromEntries(PART_TYPES.map((slot) => [slot, sources[slot].id])) as Record<AnimalPartType, string>));
  }

  const summary = { seamFailures: 0, groundMismatches: 0, unrelatedOverlaps: 0, scaleOutliers: 0, densityWhiplash: 0, strokeMismatch: 0 };
  for (const evaluation of evaluations) for (const flag of evaluation.flags) {
    if (flag.startsWith("seam")) summary.seamFailures++;
    else if (flag.startsWith("ground")) summary.groundMismatches++;
    else if (flag.startsWith("overlap")) summary.unrelatedOverlaps++;
    else if (flag.startsWith("scale")) summary.scaleOutliers++;
    else if (flag.startsWith("density")) summary.densityWhiplash++;
    else if (flag.startsWith("stroke")) summary.strokeMismatch++;
  }

  return {
    sampleCount: evaluations.length,
    distinctSpecies: new Set(roster.map((entry) => entry.id)).size,
    evaluations,
    flaggedCount: evaluations.filter((evaluation) => evaluation.flags.length).length,
    summary,
  };
}

/** Evaluate one assembled cross-species draft; also usable directly on a known hybrid. */
export function evaluateHybrid(index: number, draft: AnimalDraft, sources: Record<AnimalPartType, string>): HybridEvaluation {
  const geometry = analyzeDraftGeometry(draft);
  const validation = validateAnimalDraft(draft);

  const seamPixels = Object.fromEntries(ATTACHED.map((slot) => [slot, geometry.seams.find((seam) => seam.part === slot)?.jointZoneOverlapPixels ?? 0])) as HybridEvaluation["seamPixels"];
  const fillRatios = Object.fromEntries(PART_TYPES.map((slot) => [slot, localFillRatio(draft[SVG_FIELD[slot]], slot)])) as Record<AnimalPartType, number>;
  const elementCounts = Object.fromEntries(PART_TYPES.map((slot) => [slot, visibleElementCount(draft[SVG_FIELD[slot]])])) as Record<AnimalPartType, number>;
  const silhouetteStroke = Object.fromEntries(PART_TYPES.map((slot) => [slot, dominantStroke(draft[SVG_FIELD[slot]])])) as Record<AnimalPartType, number>;

  const flags: string[] = [];
  // Free from the analyzer.
  for (const slot of ATTACHED) if (seamPixels[slot] < 40) flags.push(`seam gap at ${slot} (${seamPixels[slot]}px < 40)`);
  if (geometry.issues.some((issue) => issue.code === "geometry.ground.mismatch")) flags.push("ground line mismatch between donor legs");
  for (const intersection of geometry.unintendedIntersections) if (intersection.overlapRatio > 0.05) flags.push(`overlap: ${intersection.first}/${intersection.second} cover ${Math.round(intersection.overlapRatio * 100)}%`);
  // §5.2 consistency across donors.
  for (const slot of PART_TYPES) if (fillRatios[slot] < FILL_BAND[0] || fillRatios[slot] > FILL_BAND[1]) flags.push(`scale: ${slot} fills ${Math.round(fillRatios[slot] * 100)}% (band ${Math.round(FILL_BAND[0] * 100)}-${Math.round(FILL_BAND[1] * 100)}%)`);
  for (const [a, b] of ADJACENT) {
    const [low, high] = [elementCounts[a], elementCounts[b]].sort((first, second) => first - second);
    if (low > 0 && high / low >= 3) flags.push(`density whiplash: ${a} (${elementCounts[a]}) vs ${b} (${elementCounts[b]})`);
    const strokes = [silhouetteStroke[a], silhouetteStroke[b]].filter((width) => width > 0);
    if (strokes.length === 2 && Math.abs(strokes[0] - strokes[1]) > 1) flags.push(`stroke weight jump: ${a} (${silhouetteStroke[a]}) vs ${b} (${silhouetteStroke[b]})`);
  }

  return { index, sources, seamPixels, fillRatios, elementCounts, silhouetteStroke, errorCount: validation.issues.filter((issue) => issue.severity === "error").length, flags };
}
