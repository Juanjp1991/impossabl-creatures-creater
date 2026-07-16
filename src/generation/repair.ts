import type { AnimalDraft } from "./contracts";
import type { AnimalPartType } from "../types";

const FIELD_BY_PART = { head: "headSvg", body: "bodySvg", frontLegs: "frontLegsSvg", backLegs: "backLegsSvg", tail: "tailSvg" } as const;

export function mergeTargetedRepair(current: AnimalDraft, patch: Partial<AnimalDraft>, requestedParts: AnimalPartType[]) {
  const animal: AnimalDraft = { ...current, bodyConnections: current.bodyConnections };
  const changedParts: AnimalPartType[] = [];
  for (const part of requestedParts) {
    const field = FIELD_BY_PART[part];
    const value = patch[field];
    if (typeof value === "string" && value.trim() && value !== current[field]) {
      (animal as any)[field] = value;
      changedParts.push(part);
    }
  }
  if (requestedParts.includes("body") && patch.bodyConnections) animal.bodyConnections = patch.bodyConnections;
  return { animal, changedParts };
}
