import type { AnimalDraft } from "./contracts";
import type { AnimalPartType } from "../types";

const FIELD_BY_PART = { head: "headSvg", body: "bodySvg", frontLegs: "frontLegsSvg", backLegs: "backLegsSvg", tail: "tailSvg" } as const;
export type ModificationTarget = AnimalPartType | "all";

const meaningfulString = (value: unknown): value is string => typeof value === "string" && Boolean(value.trim()) && !/^(?:null|undefined)$/i.test(value.trim());

export function mergeTargetedRepair(current: AnimalDraft, patch: Partial<AnimalDraft>, requestedParts: AnimalPartType[]) {
  const animal: AnimalDraft = { ...current, bodyConnections: current.bodyConnections };
  const changedParts: AnimalPartType[] = [];
  for (const part of requestedParts) {
    const field = FIELD_BY_PART[part];
    const value = patch[field];
    if (meaningfulString(value) && value !== current[field]) {
      (animal as any)[field] = value;
      changedParts.push(part);
    }
  }
  if (requestedParts.includes("body") && patch.bodyConnections) animal.bodyConnections = patch.bodyConnections;
  if (patch.layoutMetadata) {
    const requested = new Set(requestedParts);
    const currentMetadata = current.layoutMetadata;
    const connectionByPart = new Map((currentMetadata?.connections ?? []).map((connection) => [connection.part, connection]));
    for (const connection of patch.layoutMetadata.connections ?? []) {
      if (requested.has("body") || requested.has(connection.part)) connectionByPart.set(connection.part, connection);
    }
    animal.layoutMetadata = {
      facing: currentMetadata?.facing ?? patch.layoutMetadata.facing,
      detailLevel: currentMetadata?.detailLevel ?? patch.layoutMetadata.detailLevel,
      groundY: requested.has("body") ? patch.layoutMetadata.groundY : (currentMetadata?.groundY ?? patch.layoutMetadata.groundY),
      connections: [...connectionByPart.values()],
      groundContacts: {
        ...currentMetadata?.groundContacts,
        ...Object.fromEntries(Object.entries(patch.layoutMetadata.groundContacts ?? {}).filter(([part]) => requested.has(part as AnimalPartType))),
      },
      depthGroups: {
        ...currentMetadata?.depthGroups,
        ...Object.fromEntries(Object.entries(patch.layoutMetadata.depthGroups ?? {}).filter(([part]) => requested.has(part as AnimalPartType))),
      },
    };
  }
  return { animal, changedParts };
}

export function mergeTargetedModification(current: AnimalDraft, patch: Partial<AnimalDraft>, target: ModificationTarget) {
  if (target !== "all") return mergeTargetedRepair(current, patch, [target]);
  const animal: AnimalDraft = { ...current, bodyConnections: patch.bodyConnections ?? current.bodyConnections };
  const changedParts: AnimalPartType[] = [];
  for (const part of Object.keys(FIELD_BY_PART) as AnimalPartType[]) {
    const field = FIELD_BY_PART[part];
    const value = patch[field];
    if (meaningfulString(value) && value !== current[field]) {
      (animal as any)[field] = value;
      changedParts.push(part);
    }
  }
  for (const field of ["name", "color", "accentColor", "description"] as const) {
    const value = patch[field];
    if (meaningfulString(value)) animal[field] = value;
  }
  return { animal, changedParts };
}
