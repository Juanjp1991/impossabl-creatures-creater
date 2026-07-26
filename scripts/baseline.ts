// Phase 0 baseline harness (docs/svg-quality-plan.md).
//
// Runs one fixed brief N times against one fixed model and records, per slot: whether the
// slot came back at all, validation errors by code, element count, fill ratio and seam
// pixels. Nothing below the phase list in that plan is worth shipping unattributed — this is
// what every later phase reports against.
//
// It deliberately measures with the same functions the app uses (`validateAnimalDraft`,
// `analyzeDraftGeometry`, `partCandidateStats`) rather than a private copy, so a baseline and
// a contact sheet can never disagree about what "19 elements, fill 91%" means.
//
//   npm run baseline -- --animal "red fox" --runs 6
//   npm run baseline -- --animal "red fox" --runs 6 --model proxy:gpt-5.6-sol --preset detailed-game-asset
//   npm run baseline -- --report scratch/baseline/2026-07-26T09-00-00-red-fox.json
//
// The server must already be running (npm run dev); this talks to its HTTP API so the
// harness and the app exercise exactly the same path.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { createDefaultBrief } from "../src/generation/brief";
import { PART_TYPES, type AnimalDraft, type GenerationPresetId, type GuidedAnimalBrief } from "../src/generation/contracts";
import { analyzeDraftGeometry } from "../src/generation/geometry";
import { DENSITY_BANDS, FILL_BAND } from "../src/generation/metrics";
import { assembleFromPartDrafts, briefForSample, emphasisLabel, partCandidateStats, type GeneratedSample } from "../src/generation/sampleSelection";
import { namespacePartSvg, partDraft, type PartCallResult } from "../src/generation/partPipeline";
import { validateAnimalDraft } from "../src/generation/validation";
import type { AnimalPartType } from "../src/types";

export interface SlotMeasurement {
  present: boolean;
  elementCount: number;
  fillRatio: number;
  /** Null for the body, which has no seam of its own. */
  seamPixels: number | null;
  errorCodes: string[];
}

export interface RunRecord {
  index: number;
  emphasis: string;
  ok: boolean;
  error?: string;
  latencyMs: number;
  slots: Record<AnimalPartType, SlotMeasurement>;
}

export interface BaselineFile {
  /** Which generation path produced these runs. */
  path?: "single-call" | "per-part";
  startedAt: string;
  finishedAt: string;
  server: string;
  modelId: string;
  animal: string;
  preset: string;
  runs: RunRecord[];
}

interface Options {
  /** §P1: measure the per-part path instead of the single-call one. */
  perPart: boolean;
  animal: string;
  runs: number;
  preset: GenerationPresetId;
  modelId: string;
  server: string;
  concurrency: number;
  out: string;
  report?: string;
}

const DEFAULTS: Options = {
  perPart: false,
  animal: "red fox",
  runs: 6,
  preset: "natural-semi-realistic",
  modelId: "",
  server: "http://localhost:3000",
  concurrency: 2,
  out: "scratch/baseline",
};

function parseArgs(argv: string[]): Options {
  const options: Options = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    switch (flag) {
      case "--animal": options.animal = value; i += 1; break;
      case "--runs": options.runs = Math.max(1, Number(value) || DEFAULTS.runs); i += 1; break;
      case "--preset": options.preset = value as GenerationPresetId; i += 1; break;
      case "--model": options.modelId = value; i += 1; break;
      case "--server": options.server = value.replace(/\/+$/, ""); i += 1; break;
      case "--concurrency": options.concurrency = Math.max(1, Number(value) || DEFAULTS.concurrency); i += 1; break;
      case "--out": options.out = value; i += 1; break;
      case "--report": options.report = value; i += 1; break;
      case "--per-part": options.perPart = true; break;
      case "--help": printUsage(); process.exit(0);
      default:
        if (flag.startsWith("--")) {
          console.error(`Unknown flag: ${flag}`);
          printUsage();
          process.exit(1);
        }
    }
  }
  return options;
}

function printUsage() {
  console.log(`Phase 0 baseline harness

  npm run baseline -- [--animal "red fox"] [--runs 6] [--preset natural-semi-realistic]
                      [--model <id from /api/models>] [--server http://localhost:3000]
                      [--concurrency 2] [--out scratch/baseline]
  npm run baseline -- --per-part --animal "red fox" --runs 4
  npm run baseline -- --report <file.json>

Requires the dev server to be running. Runs are written to --out as JSON so before/after
comparisons survive between sessions; --report re-prints the table from any stored run.`);
}

const EMPTY_SLOT: SlotMeasurement = { present: false, elementCount: 0, fillRatio: 0, seamPixels: null, errorCodes: [] };

/**
 * Measure one returned draft with the app's own analysis functions. `partCandidateStats`
 * wants a contact-sheet sample, so the draft is wrapped in that shape rather than
 * re-deriving its numbers here.
 */
export function measureDraft(animal: AnimalDraft): Record<AnimalPartType, SlotMeasurement> {
  const validation = validateAnimalDraft(animal);
  let geometry;
  try {
    geometry = analyzeDraftGeometry(animal);
  } catch {
    geometry = undefined;
  }
  const sample: GeneratedSample = { index: 0, emphasis: "", animal, validation, geometry };
  const slots = {} as Record<AnimalPartType, SlotMeasurement>;
  for (const slot of PART_TYPES) {
    const stats = partCandidateStats(sample, slot);
    slots[slot] = {
      present: stats.hasArt,
      elementCount: stats.elementCount,
      fillRatio: stats.fillRatio,
      seamPixels: stats.seamPixels,
      errorCodes: validation.issues.filter((issue) => issue.severity === "error" && issue.part === slot).map((issue) => issue.code),
    };
  }
  return slots;
}

async function postJson(options: Options, path: string, body: unknown) {
  const response = await fetch(`${options.server}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let payload: any;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`Server returned non-JSON from ${path} (${response.status}).`);
  }
  if (!response.ok) throw new Error(payload?.error || `${path} returned ${response.status}`);
  return payload;
}

/**
 * §P1 path: body first, then the four attached parts in parallel against it, assembled and
 * normalised by the server exactly as the app does it. Deliberately mirrors
 * `runPartPipeline` rather than importing it, because that module's transport is the
 * browser-only `postJson` in apiClient.
 */
async function runOncePerPart(options: Options, brief: GuidedAnimalBrief, index: number): Promise<RunRecord> {
  const emphasis = emphasisLabel(index);
  const started = Date.now();
  const call = (slot: AnimalPartType, extra: Record<string, unknown>) =>
    postJson(options, "/api/generate-part", { slot, brief: briefForSample(brief, index), modelId: options.modelId || undefined, ...extra }) as Promise<PartCallResult>;
  try {
    const body = await call("body", {});
    const palette = {
      color: typeof body.color === "string" && body.color.startsWith("#") ? body.color : "#8B5A2B",
      accentColor: typeof body.accentColor === "string" && body.accentColor.startsWith("#") ? body.accentColor : "#F5E6C8",
    };
    const base = {
      name: brief.animalName,
      ...palette,
      description: brief.summary || brief.animalName,
      bodyConnections: body.bodyConnections ?? { neck: { x: 75, y: 90 }, tail: { x: 260, y: 105 }, frontLegs: { x: 115, y: 160 }, backLegs: { x: 235, y: 160 } },
      groundY: Number.isFinite(body.groundY) ? Number(body.groundY) : 178,
    };
    const attached = await Promise.all((["head", "frontLegs", "backLegs", "tail"] as AnimalPartType[]).map(async (slot) => {
      try {
        return await call(slot, { palette, bodyContext: body.svg });
      } catch {
        return undefined;
      }
    }));
    const parts = [body, ...attached.filter((part): part is PartCallResult => Boolean(part))];
    const bySlot = Object.fromEntries(PART_TYPES.map((slot) => {
      const part = parts.find((entry) => entry.slot === slot) ?? { slot, svg: "" };
      return [slot, partDraft(slot, { ...part, svg: namespacePartSvg(part.svg ?? "", slot) }, base)];
    })) as Record<AnimalPartType, AnimalDraft>;
    const finished = await postJson(options, "/api/assemble-parts", { brief, animal: assembleFromPartDrafts(bySlot) });
    return { index, emphasis, ok: true, latencyMs: Date.now() - started, slots: measureDraft(finished.animal as AnimalDraft) };
  } catch (error: any) {
    const slots = {} as Record<AnimalPartType, SlotMeasurement>;
    for (const slot of PART_TYPES) slots[slot] = { ...EMPTY_SLOT };
    return { index, emphasis, ok: false, error: error?.message || "Run failed.", latencyMs: Date.now() - started, slots };
  }
}

async function runOnce(options: Options, brief: GuidedAnimalBrief, index: number): Promise<RunRecord> {
  const emphasis = emphasisLabel(index);
  const started = Date.now();
  try {
    const response = await fetch(`${options.server}/api/generate-animal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: brief.animalName,
        brief: briefForSample(brief, index),
        modelId: options.modelId || undefined,
      }),
    });
    const text = await response.text();
    let payload: any;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error(`Server returned non-JSON (${response.status}).`);
    }
    if (!response.ok) throw new Error(payload?.error || `Server returned ${response.status}`);
    const animal = payload.animal as AnimalDraft;
    if (!animal) throw new Error("Response carried no animal.");
    return { index, emphasis, ok: true, latencyMs: Date.now() - started, slots: measureDraft(animal) };
  } catch (error: any) {
    // A failed run is data too: "the slot came back at all" is one of the things being
    // measured, so a dead sample is recorded rather than retried into invisibility.
    const slots = {} as Record<AnimalPartType, SlotMeasurement>;
    for (const slot of PART_TYPES) slots[slot] = { ...EMPTY_SLOT };
    return { index, emphasis, ok: false, error: error?.message || "Run failed.", latencyMs: Date.now() - started, slots };
  }
}

async function runWithConcurrency<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> {
  const results = new Array<T>(tasks.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < tasks.length) {
      const index = cursor++;
      results[index] = await tasks[index]();
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, tasks.length)) }, worker));
  return results;
}

export function median(values: number[]): number {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

const show = (value: number, digits = 0) => (Number.isFinite(value) ? value.toFixed(digits) : "—");

/** Mark a median against the band it is supposed to sit in: the point of the table. */
function bandFlag(value: number, [low, high]: readonly [number, number]): string {
  if (!Number.isFinite(value)) return "—";
  if (value < low) return "below";
  if (value > high) return "above";
  return "in band";
}

export function summarize(file: BaselineFile): string {
  const lines: string[] = [];
  const usable = file.runs.filter((run) => run.ok);
  lines.push(`# Baseline — ${file.animal} · ${file.preset}${file.path ? ` · ${file.path}` : ""}`);
  lines.push("");
  lines.push(`Model: \`${file.modelId || "server default"}\` · runs: ${file.runs.length} (${usable.length} usable) · started ${file.startedAt}`);
  const latency = median(file.runs.map((run) => run.latencyMs));
  lines.push(`Median latency: ${show(latency / 1000, 1)}s`);
  lines.push("");
  lines.push("| slot | present | elements (band) | fill % (65–95) | seam px | errors |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const slot of PART_TYPES) {
    const measurements = usable.map((run) => run.slots[slot]);
    const present = measurements.filter((entry) => entry.present);
    const elements = median(present.map((entry) => entry.elementCount));
    const fill = median(present.map((entry) => entry.fillRatio * 100));
    const seams = present.map((entry) => entry.seamPixels).filter((value): value is number => value !== null);
    const errors = median(measurements.map((entry) => entry.errorCodes.length));
    const band = DENSITY_BANDS[slot];
    lines.push(
      `| ${slot} | ${present.length}/${usable.length} | ${show(elements)} (${band[0]}–${band[1]}, ${bandFlag(elements, band)}) ` +
      `| ${show(fill, 1)} (${bandFlag(fill / 100, FILL_BAND)}) | ${seams.length ? show(median(seams)) : "n/a"} | ${show(errors, 1)} |`
    );
  }

  const histogram = new Map<string, number>();
  for (const run of usable) for (const slot of PART_TYPES) for (const code of run.slots[slot].errorCodes) {
    histogram.set(code, (histogram.get(code) ?? 0) + 1);
  }
  lines.push("");
  if (histogram.size) {
    lines.push("Validation errors by code:");
    for (const [code, count] of [...histogram].sort((a, b) => b[1] - a[1])) lines.push(`- \`${code}\` × ${count}`);
  } else {
    lines.push("No validation errors across the usable runs.");
  }

  const failed = file.runs.filter((run) => !run.ok);
  if (failed.length) {
    lines.push("");
    lines.push(`Failed runs (${failed.length}):`);
    for (const run of failed) lines.push(`- run ${run.index + 1} (${run.emphasis}): ${run.error}`);
  }
  return lines.join("\n");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.report) {
    const file = JSON.parse(readFileSync(options.report, "utf8")) as BaselineFile;
    console.log(summarize(file));
    return;
  }

  const brief = createDefaultBrief(options.animal, options.preset);
  const startedAt = new Date().toISOString();
  console.log(`Baseline (${options.perPart ? "per-part" : "single-call"}): ${options.runs} × "${options.animal}" (${options.preset}) against ${options.server}${options.modelId ? ` on ${options.modelId}` : ""}.`);

  let completed = 0;
  const runs = await runWithConcurrency(
    Array.from({ length: options.runs }, (_unused, index) => async () => {
      const record = await (options.perPart ? runOncePerPart : runOnce)(options, brief, index);
      completed += 1;
      console.log(`  run ${index + 1}/${options.runs} ${record.ok ? "ok" : `failed: ${record.error}`} (${Math.round(record.latencyMs / 1000)}s, ${completed} done)`);
      return record;
    }),
    options.concurrency
  );

  const file: BaselineFile = {
    path: options.perPart ? "per-part" : "single-call",
    startedAt,
    finishedAt: new Date().toISOString(),
    server: options.server,
    modelId: options.modelId,
    animal: options.animal,
    preset: options.preset,
    runs,
  };

  mkdirSync(options.out, { recursive: true });
  const stamp = `${startedAt.replace(/[:.]/g, "-")}${options.perPart ? "-per-part" : ""}`;
  const slug = options.animal.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const target = path.join(options.out, `${stamp}-${slug}.json`);
  writeFileSync(target, JSON.stringify(file, null, 2));

  console.log("");
  console.log(summarize(file));
  console.log("");
  console.log(`Saved to ${target}`);
}

// Only run when invoked as a script, so the measuring functions above stay importable.
if (process.argv[1] && process.argv[1].endsWith("baseline.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
