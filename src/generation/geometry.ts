import type { AnimalPartType } from "../types";
import type { AnimalDraft, ValidationIssue } from "./contracts";
import { mapPoint, readCoordinateNormalization, type CoordinateMap } from "./normalize";
import {
  LIMB_COLLAR_BOTTOM_Y,
  LIMB_CONTRACT_VERSION,
  LIMB_PAIR_SPECS,
  MAX_LOWER_LEG_OVERLAP_RATIO,
  MIN_LIMB_COLLAR_TO_SHAFT_RATIO,
  MIN_LIMB_COLLAR_WIDTH,
  MIN_PAIRED_SILHOUETTE_SIMILARITY,
  MIN_PHYSICAL_FOOT_GAP,
  PHYSICAL_LEGS,
  extractSvgGroupMarkup,
  type LimbPart,
  type PhysicalLegId,
} from "./limbContract";

export const VIEW = {
  head: { width: 160, height: 160, anchor: { x: 120, y: 110 } },
  body: { width: 300, height: 220, anchor: null },
  frontLegs: { width: 260, height: 180, anchor: { x: 75, y: 15 } },
  backLegs: { width: 260, height: 180, anchor: { x: 195, y: 15 } },
  tail: { width: 160, height: 160, anchor: { x: 15, y: 15 } },
} as const;

const FIELD = { head: "headSvg", body: "bodySvg", frontLegs: "frontLegsSvg", backLegs: "backLegsSvg", tail: "tailSvg" } as const;
const PARTS: AnimalPartType[] = ["head", "body", "frontLegs", "backLegs", "tail"];
const ATTACHED: Exclude<AnimalPartType, "body">[] = ["head", "frontLegs", "backLegs", "tail"];

export interface PixelMask {
  pixels: Set<number>;
  points: Array<{ x: number; y: number }>;
  bounds?: { x: number; y: number; width: number; height: number };
}

export interface DraftGeometryReport {
  groundY: number;
  parts: Record<AnimalPartType, { occupiedPixels: number; bounds?: { x: number; y: number; width: number; height: number }; groundContacts: Array<{ x: number; y: number; raised?: boolean }> }>;
  seams: Array<{ part: Exclude<AnimalPartType, "body">; overlapPixels: number; jointZoneOverlapPixels: number; bodyInJointZone: boolean; partInJointZone: boolean; overlapRatio: number }>;
  unintendedIntersections: Array<{ first: AnimalPartType; second: AnimalPartType; overlapPixels: number; overlapRatio: number }>;
  physicalLegs: Partial<Record<PhysicalLegId, PhysicalLegGeometry>>;
  limbPairs: Partial<Record<LimbPart, LimbPairGeometry>>;
  legOrder: {
    complete: boolean;
    valid: boolean;
    minimumGap: number;
    contacts: Partial<Record<PhysicalLegId, { x: number; y: number }>>;
  };
  issues: ValidationIssue[];
}

export interface PhysicalLegGeometry {
  id: PhysicalLegId;
  groupId: string;
  depthGroupId: string;
  limbGroupId: string;
  footGroupId: string;
  occupiedPixels: number;
  limbOccupiedPixels: number;
  footOccupiedPixels: number;
  bounds?: { x: number; y: number; width: number; height: number };
  collarWidth: number;
  shaftWidth: number;
  collarToShaftRatio: number;
  collarNatural: boolean;
  localFootContact?: { x: number; y: number };
  assembledFootContact?: { x: number; y: number };
}

export interface LimbPairGeometry {
  part: LimbPart;
  complete: boolean;
  lowerOverlapPixels: number;
  lowerOverlapRatio: number;
  silhouetteSimilarity: number;
  footGap: number;
  ordered: boolean;
}

const number = (value: string | undefined, fallback = 0) => value === undefined ? fallback : Number(value);
const attrs = (source: string) => Object.fromEntries([...source.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)].map((item) => [item[1].toLowerCase(), item[2]]));
const key = (x: number, y: number) => y * 1000 + x;
const decodeKey = (item: number) => {
  const wrapped = ((item % 1000) + 1000) % 1000;
  const x = wrapped >= 500 ? wrapped - 1000 : wrapped;
  return { x, y: (item - x) / 1000 };
};
const distanceToSegment = (x: number, y: number, a: { x: number; y: number }, b: { x: number; y: number }) => {
  const dx = b.x - a.x; const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / length)) : 0;
  return Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy));
};
const insidePolygon = (x: number, y: number, points: Array<{ x: number; y: number }>) => {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]; const b = points[j];
    if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / ((b.y - a.y) || 1e-9) + a.x) inside = !inside;
  }
  return inside;
};

function shapePixels(svg: string, width: number, height: number, inheritedNormalization?: CoordinateMap): PixelMask {
  const normalization = inheritedNormalization ?? readCoordinateNormalization(svg);
  const mapped = (point: { x: number; y: number }) => normalization ? mapPoint(point, normalization) : point;
  const scale = normalization?.scale ?? 1;
  const pixels = new Set<number>();
  const geometryPoints: Array<{ x: number; y: number }> = [];
  const paint = (minX: number, minY: number, maxX: number, maxY: number, occupied: (x: number, y: number) => boolean) => {
    const left = Math.max(-Math.ceil(width * .25), Math.floor(minX)); const right = Math.min(Math.ceil(width * 1.25), Math.ceil(maxX));
    const top = Math.max(-Math.ceil(height * .25), Math.floor(minY)); const bottom = Math.min(Math.ceil(height * 1.25), Math.ceil(maxY));
    for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) if (occupied(x + .5, y + .5)) pixels.add(key(x, y));
  };
  for (const match of svg.matchAll(/<(path|polygon|polyline|circle|ellipse|rect|line)\b([^>]*)>/gi)) {
    const tag = match[1].toLowerCase(); const a = attrs(match[2]);
    if (a.display === "none" || number(a.opacity, 1) <= 0) continue;
    const fill = (a.fill ?? (tag === "line" || tag === "polyline" ? "none" : "black")).toLowerCase() !== "none";
    const stroke = (a.stroke ?? "none").toLowerCase() !== "none";
    const strokeWidth = Math.max(1, number(a["stroke-width"] ?? a.strokewidth, stroke ? 1 : 0));
    if (tag === "circle" || tag === "ellipse") {
      const center = mapped({ x: number(a.cx), y: number(a.cy) }); const cx = center.x; const cy = center.y; const rx = (tag === "circle" ? number(a.r) : number(a.rx)) * scale; const ry = (tag === "circle" ? number(a.r) : number(a.ry)) * scale;
      geometryPoints.push({ x: cx - rx, y: cy - ry }, { x: cx + rx, y: cy + ry });
      paint(cx - rx - strokeWidth, cy - ry - strokeWidth, cx + rx + strokeWidth, cy + ry + strokeWidth, (x, y) => {
        const d = Math.sqrt(((x - cx) / Math.max(rx, .01)) ** 2 + ((y - cy) / Math.max(ry, .01)) ** 2);
        return (fill && d <= 1) || (stroke && Math.abs(d - 1) <= strokeWidth / Math.max(rx + ry, 1));
      });
      continue;
    }
    if (tag === "rect") {
      const corner = mapped({ x: number(a.x), y: number(a.y) }); const x = corner.x; const y = corner.y; const w = number(a.width) * scale; const h = number(a.height) * scale;
      geometryPoints.push({ x, y }, { x: x + w, y: y + h });
      paint(x - strokeWidth, y - strokeWidth, x + w + strokeWidth, y + h + strokeWidth, (px, py) => (fill && px >= x && px <= x + w && py >= y && py <= y + h) || (stroke && (Math.abs(px - x) <= strokeWidth || Math.abs(px - x - w) <= strokeWidth || Math.abs(py - y) <= strokeWidth || Math.abs(py - y - h) <= strokeWidth)));
      continue;
    }
    const raw = tag === "path" ? a.d : tag === "line" ? `${a.x1},${a.y1} ${a.x2},${a.y2}` : a.points;
    const values = raw?.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)?.map(Number) ?? [];
    const points: Array<{ x: number; y: number }> = [];
    for (let i = 0; i + 1 < values.length; i += 2) points.push(mapped({ x: values[i], y: values[i + 1] }));
    if (!points.length) continue;
    geometryPoints.push(...points);
    const xs = points.map((p) => p.x); const ys = points.map((p) => p.y);
    const closed = tag === "polygon" || /[zZ]\s*(?:$|["'])/.test(raw ?? "") || (points.length > 2 && points[0].x === points.at(-1)!.x && points[0].y === points.at(-1)!.y);
    paint(Math.min(...xs) - strokeWidth, Math.min(...ys) - strokeWidth, Math.max(...xs) + strokeWidth, Math.max(...ys) + strokeWidth, (x, y) => {
      if (fill && points.length > 2 && (closed || tag === "path") && insidePolygon(x, y, points)) return true;
      if (stroke || !fill || points.length < 3) return points.slice(1).some((point, index) => distanceToSegment(x, y, points[index], point) <= strokeWidth / 2 + .75);
      return false;
    });
  }
  const decoded = [...pixels].map(decodeKey);
  const bounds = decoded.length ? { x: Math.min(...decoded.map((p) => p.x)), y: Math.min(...decoded.map((p) => p.y)), width: Math.max(...decoded.map((p) => p.x)) - Math.min(...decoded.map((p) => p.x)) + 1, height: Math.max(...decoded.map((p) => p.y)) - Math.min(...decoded.map((p) => p.y)) + 1 } : undefined;
  return { pixels, points: geometryPoints, bounds };
}

/**
 * §S1: one slot's occupied-pixel mask on its own fixed local view, for comparison against a
 * rasterised reference. Exposed because conformance scoring needs the same mask the seam and
 * overlap measurements already use — a second, subtly different rasteriser would make the
 * IoU chip disagree with the seam number sitting next to it.
 */
export function partPixelMask(svg: string, part: AnimalPartType): PixelMask {
  const view = VIEW[part];
  return shapePixels(svg, view.width, view.height);
}

/**
 * Encode/decode for the packed pixel keys every mask in this module uses.
 *
 * `key` packs as `y * 1000 + x`, and `shapePixels` deliberately paints a margin outside the
 * local view, so x can be negative. A plain `item % 1000` decodes those as x≈999 on the
 * previous row, which silently smears a mask across a ~2000px-wide phantom bounding box.
 * Views are at most 300 wide, so the halfway point is a safe place to split the two cases.
 */
export const pixelKey = (x: number, y: number) => key(x, y);
export const pixelAt = decodeKey;

export function analyzeSvgGroupGeometry(svg: string, part: AnimalPartType, groupId: string) {
  const markup = extractSvgGroupMarkup(svg, groupId);
  if (!markup) return undefined;
  const view = VIEW[part];
  const mask = shapePixels(markup, view.width, view.height, readCoordinateNormalization(svg));
  return { occupiedPixels: mask.pixels.size, bounds: mask.bounds };
}

function intersection(a: Set<number>, b: Set<number>, zone?: { x: number; y: number; radius: number }) {
  let count = 0;
  const smaller = a.size <= b.size ? a : b; const larger = smaller === a ? b : a;
  for (const item of smaller) {
    if (!larger.has(item)) continue;
    if (zone) { const { x, y } = decodeKey(item); if (Math.abs(x - zone.x) > zone.radius || Math.abs(y - zone.y) > zone.radius) continue; }
    count++;
  }
  return count;
}

function translated(mask: PixelMask, dx: number, dy: number): PixelMask {
  const rx = Math.round(dx); const ry = Math.round(dy);
  const points = [...mask.pixels].map((item) => { const point = decodeKey(item); return { x: point.x + rx, y: point.y + ry }; });
  const pixels = new Set(points.map((point) => key(point.x, point.y)));
  const bounds = mask.bounds ? { ...mask.bounds, x: mask.bounds.x + rx, y: mask.bounds.y + ry } : undefined;
  return { pixels, points, bounds };
}

function inferredContacts(mask: PixelMask): Array<{ x: number; y: number; raised?: boolean }> {
  if (!mask.bounds) return [];
  const bottom = mask.bounds.y + mask.bounds.height - 1;
  const xs = [...mask.pixels].map(decodeKey).filter((point) => point.y >= bottom - 3).map((point) => point.x).sort((a, b) => a - b);
  const groups: number[][] = [];
  for (const x of xs) { const current = groups.at(-1); if (!current || x - current.at(-1)! > 4) groups.push([x]); else current.push(x); }
  return groups.map((group) => ({ x: Math.round(group.reduce((sum, x) => sum + x, 0) / group.length), y: bottom }));
}

function physicalFootContact(mask: PixelMask): { x: number; y: number } | undefined {
  if (!mask.bounds || !mask.pixels.size) return undefined;
  const bottom = mask.bounds.y + mask.bounds.height - 1;
  const xs = [...mask.pixels].map(decodeKey).filter((point) => point.y >= bottom - 4).map((point) => point.x).sort((a, b) => a - b);
  if (!xs.length) return undefined;
  return { x: Math.round(xs.reduce((sum, x) => sum + x, 0) / xs.length), y: bottom };
}

function normalizedSilhouette(mask: PixelMask, size = 40): Set<number> {
  if (!mask.bounds || mask.bounds.width <= 0 || mask.bounds.height <= 0) return new Set();
  const normalized = new Set<number>();
  for (const item of mask.pixels) {
    const point = decodeKey(item);
    const x = Math.round((point.x - mask.bounds.x) / Math.max(1, mask.bounds.width - 1) * (size - 1));
    const y = Math.round((point.y - mask.bounds.y) / Math.max(1, mask.bounds.height - 1) * (size - 1));
    normalized.add(y * size + x);
  }
  return normalized;
}

function silhouetteSimilarity(first: PixelMask, second: PixelMask): number {
  const a = normalizedSilhouette(first); const b = normalizedSilhouette(second);
  if (!a.size || !b.size) return 0;
  const overlap = intersection(a, b);
  return overlap / Math.max(1, a.size + b.size - overlap);
}

function groupMask(svg: string, part: LimbPart, groupId: string): PixelMask | undefined {
  const markup = extractSvgGroupMarkup(svg, groupId);
  if (!markup) return undefined;
  const view = VIEW[part];
  return shapePixels(markup, view.width, view.height, readCoordinateNormalization(svg));
}

function lowerMask(mask: PixelMask): Set<number> {
  return new Set([...mask.pixels].filter((item) => decodeKey(item).y > LIMB_COLLAR_BOTTOM_Y));
}

function medianValue(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function rowWidths(mask: PixelMask, minY: number, maxY: number): number[] {
  const rows = new Map<number, number[]>();
  for (const item of mask.pixels) {
    const point = decodeKey(item);
    if (point.y < minY || point.y > maxY) continue;
    const row = rows.get(point.y) ?? [];
    row.push(point.x);
    rows.set(point.y, row);
  }
  return [...rows.values()].map((xs) => Math.max(...xs) - Math.min(...xs) + 1);
}

function collarGeometry(mask: PixelMask | undefined) {
  if (!mask?.pixels.size) return { collarWidth: 0, shaftWidth: 0, collarToShaftRatio: 0, collarNatural: false };
  const collarWidth = Math.max(0, ...rowWidths(mask, 5, LIMB_COLLAR_BOTTOM_Y));
  const shaftWidth = medianValue(rowWidths(mask, LIMB_COLLAR_BOTTOM_Y + 12, 120));
  const collarToShaftRatio = collarWidth / Math.max(1, shaftWidth);
  return {
    collarWidth,
    shaftWidth,
    collarToShaftRatio,
    collarNatural: collarWidth >= MIN_LIMB_COLLAR_WIDTH && collarToShaftRatio >= MIN_LIMB_COLLAR_TO_SHAFT_RATIO,
  };
}

function analyzePhysicalLegs(
  draft: AnimalDraft,
  origins: Record<AnimalPartType, { x: number; y: number }>,
): {
  physicalLegs: Partial<Record<PhysicalLegId, PhysicalLegGeometry>>;
  limbPairs: Partial<Record<LimbPart, LimbPairGeometry>>;
  masks: Partial<Record<PhysicalLegId, PixelMask>>;
  legOrder: DraftGeometryReport["legOrder"];
} {
  const physicalLegs: Partial<Record<PhysicalLegId, PhysicalLegGeometry>> = {};
  const masks: Partial<Record<PhysicalLegId, PixelMask>> = {};
  for (const spec of PHYSICAL_LEGS) {
    const svg = draft[FIELD[spec.part]];
    const mask = groupMask(svg, spec.part, spec.groupId);
    if (!mask) continue;
    const limbMask = groupMask(svg, spec.part, spec.limbGroupId);
    const footMask = groupMask(svg, spec.part, spec.footGroupId);
    const collar = collarGeometry(limbMask);
    masks[spec.id] = mask;
    const localFootContact = footMask ? physicalFootContact(footMask) : undefined;
    physicalLegs[spec.id] = {
      id: spec.id,
      groupId: spec.groupId,
      depthGroupId: spec.depthGroupId,
      limbGroupId: spec.limbGroupId,
      footGroupId: spec.footGroupId,
      occupiedPixels: mask.pixels.size,
      limbOccupiedPixels: limbMask?.pixels.size ?? 0,
      footOccupiedPixels: footMask?.pixels.size ?? 0,
      bounds: mask.bounds,
      ...collar,
      localFootContact,
      assembledFootContact: localFootContact
        ? { x: localFootContact.x + origins[spec.part].x, y: localFootContact.y + origins[spec.part].y }
        : undefined,
    };
  }

  const limbPairs: Partial<Record<LimbPart, LimbPairGeometry>> = {};
  for (const part of ["frontLegs", "backLegs"] as const) {
    const pair = LIMB_PAIR_SPECS[part];
    const near = masks[pair.near.id]; const far = masks[pair.far.id];
    const nearFoot = physicalLegs[pair.near.id]?.localFootContact;
    const farFoot = physicalLegs[pair.far.id]?.localFootContact;
    const complete = Boolean(near?.pixels.size && far?.pixels.size && nearFoot && farFoot);
    const nearLower = near ? lowerMask(near) : new Set<number>();
    const farLower = far ? lowerMask(far) : new Set<number>();
    const lowerOverlapPixels = intersection(nearLower, farLower);
    const lowerOverlapRatio = lowerOverlapPixels / Math.max(1, Math.min(nearLower.size, farLower.size));
    const footGap = nearFoot && farFoot ? farFoot.x - nearFoot.x : Number.NEGATIVE_INFINITY;
    limbPairs[part] = {
      part,
      complete,
      lowerOverlapPixels,
      lowerOverlapRatio,
      silhouetteSimilarity: near && far ? silhouetteSimilarity(near, far) : 0,
      footGap,
      ordered: complete && footGap >= MIN_PHYSICAL_FOOT_GAP,
    };
  }

  const contacts = Object.fromEntries(
    PHYSICAL_LEGS.flatMap((spec) => {
      const point = physicalLegs[spec.id]?.assembledFootContact;
      return point ? [[spec.id, point]] : [];
    }),
  ) as DraftGeometryReport["legOrder"]["contacts"];
  const orderedContacts = PHYSICAL_LEGS.map((spec) => contacts[spec.id]).filter((point): point is { x: number; y: number } => Boolean(point));
  const gaps = orderedContacts.slice(1).map((point, index) => point.x - orderedContacts[index].x);
  const complete = orderedContacts.length === PHYSICAL_LEGS.length;
  return {
    physicalLegs,
    limbPairs,
    masks,
    legOrder: {
      complete,
      valid: complete && gaps.every((gap) => gap >= MIN_PHYSICAL_FOOT_GAP),
      minimumGap: complete ? Math.min(...gaps) : Number.NEGATIVE_INFINITY,
      contacts,
    },
  };
}

/**
 * Stamp the strict four-leg contract and replace unlabelled model contacts with contacts
 * inferred from the four physical SVG groups. New generation calls this before validation.
 */
export function synchronizeLimbContract(input: AnimalDraft): AnimalDraft {
  const animal = structuredClone(input);
  if (!animal.layoutMetadata) return animal;
  const rootOrigin = { x: 150, y: 150 };
  const targets = {
    frontLegs: { x: rootOrigin.x + animal.bodyConnections.frontLegs.x, y: rootOrigin.y + animal.bodyConnections.frontLegs.y },
    backLegs: { x: rootOrigin.x + animal.bodyConnections.backLegs.x, y: rootOrigin.y + animal.bodyConnections.backLegs.y },
  };
  const origins: Record<AnimalPartType, { x: number; y: number }> = {
    head: { x: 0, y: 0 },
    body: rootOrigin,
    tail: { x: 0, y: 0 },
    frontLegs: { x: targets.frontLegs.x - VIEW.frontLegs.anchor.x, y: targets.frontLegs.y - VIEW.frontLegs.anchor.y },
    backLegs: { x: targets.backLegs.x - VIEW.backLegs.anchor.x, y: targets.backLegs.y - VIEW.backLegs.anchor.y },
  };
  const analysis = analyzePhysicalLegs(animal, origins);
  animal.layoutMetadata.limbContractVersion = LIMB_CONTRACT_VERSION;
  animal.layoutMetadata.limbInstances = {};
  for (const spec of PHYSICAL_LEGS) {
    const footContact = analysis.physicalLegs[spec.id]?.localFootContact;
    if (!footContact) continue;
    animal.layoutMetadata.limbInstances[spec.id] = {
      groupId: spec.groupId,
      depthGroupId: spec.depthGroupId,
      depth: spec.depth,
      footContact,
    };
  }
  for (const part of ["frontLegs", "backLegs"] as const) {
    const pair = LIMB_PAIR_SPECS[part];
    const near = analysis.physicalLegs[pair.near.id]?.localFootContact;
    const far = analysis.physicalLegs[pair.far.id]?.localFootContact;
    if (near && far) animal.layoutMetadata.groundContacts[part] = [near, far];
  }
  return animal;
}

export function analyzeDraftGeometry(draft: AnimalDraft): DraftGeometryReport {
  const rootOrigin = { x: 150, y: 150 };
  const targets = {
    head: { x: rootOrigin.x + draft.bodyConnections.neck.x, y: rootOrigin.y + draft.bodyConnections.neck.y },
    frontLegs: { x: rootOrigin.x + draft.bodyConnections.frontLegs.x, y: rootOrigin.y + draft.bodyConnections.frontLegs.y },
    backLegs: { x: rootOrigin.x + draft.bodyConnections.backLegs.x, y: rootOrigin.y + draft.bodyConnections.backLegs.y },
    tail: { x: rootOrigin.x + draft.bodyConnections.tail.x, y: rootOrigin.y + draft.bodyConnections.tail.y },
  };
  const origins: Record<AnimalPartType, { x: number; y: number }> = { body: rootOrigin, ...Object.fromEntries(ATTACHED.map((part) => [part, { x: targets[part].x - VIEW[part].anchor.x, y: targets[part].y - VIEW[part].anchor.y }])) } as any;
  const masks = Object.fromEntries(PARTS.map((part) => [part, translated(shapePixels(draft[FIELD[part]], VIEW[part].width, VIEW[part].height), origins[part].x, origins[part].y)])) as Record<AnimalPartType, PixelMask>;
  const limbAnalysis = analyzePhysicalLegs(draft, origins);
  const declared = draft.layoutMetadata?.groundContacts;
  const contacts = {
    frontLegs: declared?.frontLegs?.map((point) => ({ ...point, x: point.x + origins.frontLegs.x, y: point.y + origins.frontLegs.y })) ?? inferredContacts(masks.frontLegs),
    backLegs: declared?.backLegs?.map((point) => ({ ...point, x: point.x + origins.backLegs.x, y: point.y + origins.backLegs.y })) ?? inferredContacts(masks.backLegs),
  };
  const grounded = [...contacts.frontLegs, ...contacts.backLegs].filter((point) => !point.raised).map((point) => point.y).sort((a, b) => a - b);
  const groundY = grounded.length ? (grounded.length % 2 ? grounded[(grounded.length - 1) / 2] : (grounded[grounded.length / 2 - 1] + grounded[grounded.length / 2]) / 2) : Math.max(...PARTS.map((part) => masks[part].bounds ? masks[part].bounds!.y + masks[part].bounds!.height - 1 : 0));
  const issues: ValidationIssue[] = [];
  if (draft.layoutMetadata?.limbContractVersion === LIMB_CONTRACT_VERSION) {
    for (const spec of PHYSICAL_LEGS) {
      const physical = limbAnalysis.physicalLegs[spec.id];
      if (!physical?.occupiedPixels || !physical.bounds || !physical.localFootContact) {
        issues.push({
          code: "geometry.leg.missing",
          severity: "error",
          part: spec.part,
          message: `${spec.label} must contain its own visible ${spec.groupId} silhouette and foot.`,
        });
      }
      if (physical?.occupiedPixels && !physical.collarNatural) {
        issues.push({
          code: "geometry.leg.collar",
          severity: "warning",
          part: spec.part,
          message: `${spec.label} needs a smooth rounded upper collar at least ${MIN_LIMB_COLLAR_WIDTH}px wide and ${MIN_LIMB_COLLAR_TO_SHAFT_RATIO.toFixed(1)}x its shaft; found ${Math.round(physical.collarWidth)}px and ${physical.collarToShaftRatio.toFixed(2)}x.`,
        });
      }
    }
    for (const part of ["frontLegs", "backLegs"] as const) {
      const pair = limbAnalysis.limbPairs[part];
      if (!pair?.complete) continue;
      if (pair.lowerOverlapRatio > MAX_LOWER_LEG_OVERLAP_RATIO) {
        issues.push({
          code: "geometry.leg.overlap",
          severity: "warning",
          part,
          message: `${part} near/far silhouettes overlap across ${Math.round(pair.lowerOverlapRatio * 100)}% of the smaller leg below the body collar; keep this at or below ${Math.round(MAX_LOWER_LEG_OVERLAP_RATIO * 100)}%.`,
        });
      }
      if (!pair.ordered) {
        issues.push({
          code: "geometry.leg.order",
          severity: "warning",
          part,
          message: `${part} foreground-left foot must be at least ${MIN_PHYSICAL_FOOT_GAP}px left of its background-right foot (gap ${Math.round(pair.footGap)}px).`,
        });
      }
      if (pair.silhouetteSimilarity < MIN_PAIRED_SILHOUETTE_SIMILARITY) {
        issues.push({
          code: "geometry.leg.silhouette",
          severity: "warning",
          part,
          message: `${part} paired silhouettes are only ${Math.round(pair.silhouetteSimilarity * 100)}% similar after alignment; keep the same anatomical silhouette and vary pose/shading modestly.`,
        });
      }
    }
    if (limbAnalysis.legOrder.complete && !limbAnalysis.legOrder.valid) {
      const order = PHYSICAL_LEGS.map((spec) => `${spec.label} x=${Math.round(limbAnalysis.legOrder.contacts[spec.id]!.x)}`).join(", ");
      issues.push({
        code: "geometry.leg.globalOrder",
        severity: "warning",
        part: "animal",
        message: `Feet must read left-to-right as front-left, front-right, back-left, back-right with ${MIN_PHYSICAL_FOOT_GAP}px gaps; found ${order}.`,
      });
    }
  }
  const seams = ATTACHED.map((part) => {
    const zone = { ...targets[part], radius: 9 };
    const bodyInJointZone = [...masks.body.pixels].some((item) => { const point = decodeKey(item); return Math.abs(point.x - zone.x) <= zone.radius && Math.abs(point.y - zone.y) <= zone.radius; });
    const partInJointZone = [...masks[part].pixels].some((item) => { const point = decodeKey(item); return Math.abs(point.x - zone.x) <= zone.radius && Math.abs(point.y - zone.y) <= zone.radius; });
    const overlapPixels = intersection(masks.body.pixels, masks[part].pixels);
    const jointZoneOverlapPixels = intersection(masks.body.pixels, masks[part].pixels, zone);
    const overlapRatio = overlapPixels / Math.max(1, Math.min(masks.body.pixels.size, masks[part].pixels.size));
    if (!bodyInJointZone || !partInJointZone || jointZoneOverlapPixels < 40) issues.push({ code: "geometry.seam.gap", severity: "error", part, message: `${part}/body seam must contain both opaque masks and at least 40 overlapping pixels inside the 18px joint zone (found ${jointZoneOverlapPixels}).` });
    if (overlapRatio > .25) issues.push({ code: "geometry.seam.excessive-overlap", severity: "warning", part, message: `${part}/body intended overlap covers ${Math.round(overlapRatio * 100)}% of the smaller part; keep it at or below 25%.` });
    return { part, overlapPixels, jointZoneOverlapPixels, bodyInJointZone, partInJointZone, overlapRatio };
  });
  const intended = new Set(ATTACHED.map((part) => ["body", part].sort().join("|")));
  const unintendedIntersections: DraftGeometryReport["unintendedIntersections"] = [];
  for (let i = 0; i < PARTS.length; i++) for (let j = i + 1; j < PARTS.length; j++) {
    const first = PARTS[i]; const second = PARTS[j];
    if (intended.has([first, second].sort().join("|"))) continue;
    const overlapPixels = intersection(masks[first].pixels, masks[second].pixels);
    const overlapRatio = overlapPixels / Math.max(1, Math.min(masks[first].pixels.size, masks[second].pixels.size));
    if (overlapPixels) unintendedIntersections.push({ first, second, overlapPixels, overlapRatio });
    if (overlapRatio > .05) issues.push({ code: "geometry.overlap.unrelated", severity: "warning", part: second, message: `${first}/${second} unrelated overlap covers ${Math.round(overlapRatio * 100)}% of the smaller part; keep it at or below 5%.` });
  }
  for (const part of ["frontLegs", "backLegs"] as const) for (const point of contacts[part]) if (!point.raised && Math.abs(point.y - groundY) > 10) issues.push({ code: "geometry.ground.mismatch", severity: "error", part, message: `Grounded foot at y=${Math.round(point.y)} is ${Math.round(Math.abs(point.y - groundY))}px from the median ground line y=${Math.round(groundY)}.` });
  return {
    groundY,
    parts: Object.fromEntries(PARTS.map((part) => [part, { occupiedPixels: masks[part].pixels.size, bounds: masks[part].bounds, groundContacts: part === "frontLegs" || part === "backLegs" ? contacts[part] : [] }])) as DraftGeometryReport["parts"],
    seams,
    unintendedIntersections,
    physicalLegs: limbAnalysis.physicalLegs,
    limbPairs: limbAnalysis.limbPairs,
    legOrder: limbAnalysis.legOrder,
    issues,
  };
}
