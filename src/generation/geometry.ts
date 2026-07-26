import type { AnimalPartType } from "../types";
import type { AnimalDraft, ValidationIssue } from "./contracts";
import { mapPoint, readCoordinateNormalization } from "./normalize";

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
  issues: ValidationIssue[];
}

const number = (value: string | undefined, fallback = 0) => value === undefined ? fallback : Number(value);
const attrs = (source: string) => Object.fromEntries([...source.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)].map((item) => [item[1].toLowerCase(), item[2]]));
const key = (x: number, y: number) => y * 1000 + x;
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

function shapePixels(svg: string, width: number, height: number): PixelMask {
  const normalization = readCoordinateNormalization(svg);
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
  const decoded = [...pixels].map((item) => ({ x: item % 1000, y: Math.floor(item / 1000) }));
  const bounds = decoded.length ? { x: Math.min(...decoded.map((p) => p.x)), y: Math.min(...decoded.map((p) => p.y)), width: Math.max(...decoded.map((p) => p.x)) - Math.min(...decoded.map((p) => p.x)) + 1, height: Math.max(...decoded.map((p) => p.y)) - Math.min(...decoded.map((p) => p.y)) + 1 } : undefined;
  return { pixels, points: geometryPoints, bounds };
}

function extractGroupMarkup(svg: string, groupId: string): string | undefined {
  const escaped = groupId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const opening = new RegExp(`<g\\b(?=[^>]*\\bid\\s*=\\s*["']${escaped}["'])[^>]*>`, "i").exec(svg);
  if (!opening || opening.index === undefined) return undefined;
  const start = opening.index;
  const token = /<\/?g\b[^>]*>/gi;
  token.lastIndex = start;
  let depth = 0;
  let match: RegExpExecArray | null;
  while ((match = token.exec(svg))) {
    if (/^<\/g/i.test(match[0])) depth--;
    else depth++;
    if (depth === 0) return svg.slice(start, token.lastIndex);
  }
  return undefined;
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
export const pixelAt = (item: number) => {
  const wrapped = ((item % 1000) + 1000) % 1000;
  const x = wrapped >= 500 ? wrapped - 1000 : wrapped;
  return { x, y: (item - x) / 1000 };
};

export function analyzeSvgGroupGeometry(svg: string, part: AnimalPartType, groupId: string) {
  const markup = extractGroupMarkup(svg, groupId);
  if (!markup) return undefined;
  const view = VIEW[part];
  const mask = shapePixels(markup, view.width, view.height);
  return { occupiedPixels: mask.pixels.size, bounds: mask.bounds };
}

function intersection(a: Set<number>, b: Set<number>, zone?: { x: number; y: number; radius: number }) {
  let count = 0;
  const smaller = a.size <= b.size ? a : b; const larger = smaller === a ? b : a;
  for (const item of smaller) {
    if (!larger.has(item)) continue;
    if (zone) { const x = item % 1000; const y = Math.floor(item / 1000); if (Math.abs(x - zone.x) > zone.radius || Math.abs(y - zone.y) > zone.radius) continue; }
    count++;
  }
  return count;
}

function translated(mask: PixelMask, dx: number, dy: number): PixelMask {
  const rx = Math.round(dx); const ry = Math.round(dy);
  const points = [...mask.pixels].map((item) => ({ x: item % 1000 + rx, y: Math.floor(item / 1000) + ry }));
  const pixels = new Set(points.map((point) => key(point.x, point.y)));
  const bounds = mask.bounds ? { ...mask.bounds, x: mask.bounds.x + rx, y: mask.bounds.y + ry } : undefined;
  return { pixels, points, bounds };
}

function inferredContacts(mask: PixelMask): Array<{ x: number; y: number; raised?: boolean }> {
  if (!mask.bounds) return [];
  const bottom = mask.bounds.y + mask.bounds.height - 1;
  const xs = [...mask.pixels].filter((item) => Math.floor(item / 1000) >= bottom - 3).map((item) => item % 1000).sort((a, b) => a - b);
  const groups: number[][] = [];
  for (const x of xs) { const current = groups.at(-1); if (!current || x - current.at(-1)! > 4) groups.push([x]); else current.push(x); }
  return groups.map((group) => ({ x: Math.round(group.reduce((sum, x) => sum + x, 0) / group.length), y: bottom }));
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
  const declared = draft.layoutMetadata?.groundContacts;
  const contacts = {
    frontLegs: declared?.frontLegs?.map((point) => ({ ...point, x: point.x + origins.frontLegs.x, y: point.y + origins.frontLegs.y })) ?? inferredContacts(masks.frontLegs),
    backLegs: declared?.backLegs?.map((point) => ({ ...point, x: point.x + origins.backLegs.x, y: point.y + origins.backLegs.y })) ?? inferredContacts(masks.backLegs),
  };
  const grounded = [...contacts.frontLegs, ...contacts.backLegs].filter((point) => !point.raised).map((point) => point.y).sort((a, b) => a - b);
  const groundY = grounded.length ? (grounded.length % 2 ? grounded[(grounded.length - 1) / 2] : (grounded[grounded.length / 2 - 1] + grounded[grounded.length / 2]) / 2) : Math.max(...PARTS.map((part) => masks[part].bounds ? masks[part].bounds!.y + masks[part].bounds!.height - 1 : 0));
  const issues: ValidationIssue[] = [];
  const seams = ATTACHED.map((part) => {
    const zone = { ...targets[part], radius: 9 };
    const bodyInJointZone = [...masks.body.pixels].some((item) => Math.abs(item % 1000 - zone.x) <= zone.radius && Math.abs(Math.floor(item / 1000) - zone.y) <= zone.radius);
    const partInJointZone = [...masks[part].pixels].some((item) => Math.abs(item % 1000 - zone.x) <= zone.radius && Math.abs(Math.floor(item / 1000) - zone.y) <= zone.radius);
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
    seams, unintendedIntersections, issues,
  };
}
