import type { AnimalPartType } from "../types";
import type { AnimalDraft, AnatomyStylePlan, BlueprintConnectionProfile } from "./contracts";
import { isNearBlack, isNearWhite } from "./palette";

export interface CoordinateMap { scale: number; x: number; y: number; }
export interface SvgBounds { x: number; y: number; width: number; height: number; }

const VIEW: Record<AnimalPartType, { width: number; height: number; anchor?: { x: number; y: number } }> = {
  head: { width: 160, height: 160, anchor: { x: 120, y: 110 } },
  body: { width: 300, height: 220 },
  frontLegs: { width: 260, height: 180, anchor: { x: 75, y: 15 } },
  backLegs: { width: 260, height: 180, anchor: { x: 195, y: 15 } },
  tail: { width: 160, height: 160, anchor: { x: 15, y: 15 } },
};
const FIELD = { head: "headSvg", body: "bodySvg", frontLegs: "frontLegsSvg", backLegs: "backLegsSvg", tail: "tailSvg" } as const;
const PARTS: AnimalPartType[] = ["head", "body", "frontLegs", "backLegs", "tail"];
const ATTACHED = ["head", "frontLegs", "backLegs", "tail"] as const;
const CONNECTION = { head: "neck", frontLegs: "frontLegs", backLegs: "backLegs", tail: "tail" } as const;
const IDENTITY: CoordinateMap = { scale: 1, x: 0, y: 0 };
const SVG_ATTRIBUTE_REPLACEMENTS: Record<string, string> = {
  strokeWidth: "stroke-width", strokeLinecap: "stroke-linecap", strokeLinejoin: "stroke-linejoin", strokeDasharray: "stroke-dasharray", strokeOpacity: "stroke-opacity",
  fillOpacity: "fill-opacity", fillRule: "fill-rule", stopColor: "stop-color", stopOpacity: "stop-opacity", gradientUnits: "gradientUnits", gradientTransform: "gradientTransform",
  floodColor: "flood-color", floodOpacity: "flood-opacity", clipPath: "clip-path", xlinkHref: "xlink:href",
};

// Fold the model's raw near-black outlines and near-white highlights onto the fixed
// `outline`/`highlight` ramp tokens before the validator's raw-hex gate sees them. This is
// resolving to the ramp (those tokens ARE a fixed near-black / off-white), not inventing a
// colour; genuine mid-tone off-palette hexes are left raw so the validator rejects them.
function foldNeutralHexToTokens(svg: string): string {
  const token = (hex: string) => isNearBlack(hex) ? "outline" : isNearWhite(hex) ? "highlight" : null;
  return svg
    .replace(/(\b(?:fill|stroke|stop-color)\s*=\s*)(["'])(#[0-9a-f]{3,8})\2/gi, (match, prefix: string, _quote: string, hex: string) => { const mapped = token(hex); return mapped ? `${prefix}"${mapped}"` : match; })
    .replace(/(\b(?:fill|stroke|stop-color)\s*:\s*)(#[0-9a-f]{3,8})/gi, (match, prefix: string, hex: string) => { const mapped = token(hex); return mapped ? `${prefix}${mapped}` : match; });
}

function promoteDominantFillToPrimary(svg: string): string {
  if (/(?:fill|stroke)\s*=\s*["'](?:primary|accent|var\(\s*--(?:primary|accent)\s*\))/i.test(svg)) return svg;
  let promoted = false;
  const isUsableColour = (value: string) => {
    const normalized = value.trim().toLowerCase();
    return !["none", "transparent", "black", "white", "#000", "#000000", "#fff", "#ffffff"].includes(normalized) && !normalized.startsWith("url(");
  };
  const attributes = svg.replace(/\bfill\s*=\s*(["'])([^"']+)\1/gi, (match, _quote: string, value: string) => {
    if (promoted || !isUsableColour(value)) return match;
    promoted = true;
    return `fill="primary"`;
  });
  if (promoted) return attributes;
  return attributes.replace(/(\bfill\s*:\s*)([^;"']+)/gi, (match, prefix: string, value: string) => {
    if (promoted || !isUsableColour(value)) return match;
    promoted = true;
    return `${prefix}primary`;
  });
}

export function normalizeGeneratedSvgSyntax(input: AnimalDraft): { animal: AnimalDraft; changedParts: AnimalPartType[] } {
  const animal = structuredClone(input); const changedParts: AnimalPartType[] = [];
  const escaped = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const part of PARTS) {
    const field = FIELD[part]; let svg = animal[field];
    for (const [source, target] of Object.entries(SVG_ATTRIBUTE_REPLACEMENTS)) svg = svg.replace(new RegExp(`\\b${source}\\s*=`, "g"), `${target}=`);
    svg = svg
      .replace(new RegExp(`(["'])${escaped(animal.color)}\\1`, "gi"), '"primary"')
      .replace(new RegExp(`(["'])${escaped(animal.accentColor)}\\1`, "gi"), '"accent"');
    svg = foldNeutralHexToTokens(svg);
    svg = promoteDominantFillToPrimary(svg);
    if (part === "frontLegs" || part === "backLegs") {
      const expected = { farGroupId: `${part}-far`, nearGroupId: `${part}-near` };
      const declared = animal.layoutMetadata?.depthGroups?.[part];
      for (const depth of ["farGroupId", "nearGroupId"] as const) {
        const target = expected[depth];
        const fuzzy = [...svg.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1]).find((id) => new RegExp(`${depth === "farGroupId" ? "far" : "near"}`, "i").test(id));
        const source = declared?.[depth] || fuzzy;
        if (source && source !== target) {
          const token = escaped(source);
          svg = svg.replace(new RegExp(`(["'#])${token}(?=["'])`, "g"), `$1${target}`);
        }
      }
      if (animal.layoutMetadata?.depthGroups) animal.layoutMetadata.depthGroups[part] = expected;
    }
    if (svg !== animal[field]) { animal[field] = svg; changedParts.push(part); }
  }
  return { animal, changedParts };
}

export function normalizeAnatomyPlanContract(input: AnatomyStylePlan): AnatomyStylePlan {
  const plan = structuredClone(input);
  plan.anatomyTemplate = "quadruped-five-part";
  plan.requiredParts = [...PARTS];
  plan.orientation = "left-facing";
  plan.requiredNamedGroups = {
    ...plan.requiredNamedGroups,
    head: [...new Set(["head-root", ...(plan.requiredNamedGroups?.head ?? [])])],
    body: [...new Set(["body-root", ...(plan.requiredNamedGroups?.body ?? [])])],
    frontLegs: [...new Set(["frontLegs-root", "frontLegs-far", "frontLegs-near", ...(plan.requiredNamedGroups?.frontLegs ?? []).filter((group) => !/(?:far|near)/i.test(group))])],
    backLegs: [...new Set(["backLegs-root", "backLegs-far", "backLegs-near", ...(plan.requiredNamedGroups?.backLegs ?? []).filter((group) => !/(?:far|near)/i.test(group))])],
    tail: [...new Set(["tail-root", ...(plan.requiredNamedGroups?.tail ?? [])])],
  };
  plan.layerPlan = [
    { part: "tail", layer: "back", purpose: "rear silhouette behind the body" },
    { part: "backLegs", layer: "back", purpose: "semantic far and near hind limbs" },
    { part: "body", layer: "middle", purpose: "central torso" },
    { part: "frontLegs", layer: "front", purpose: "semantic far and near forelimbs" },
    { part: "head", layer: "front", purpose: "recognizable face and head silhouette" },
  ];
  if (plan.referenceAnalysis) {
    const swatches = (plan.referenceAnalysis.paletteSwatches ?? []).filter((colour) => /^#[0-9a-f]{6}$/i.test(colour)).slice(0, 4);
    plan.referenceAnalysis.paletteSwatches = swatches.length >= 2 ? swatches : ["#6B7280", "#D1D5DB"];
    const seen = new Set<string>();
    plan.referenceAnalysis.referenceFeatures = (plan.referenceAnalysis.referenceFeatures ?? []).map((feature, index) => {
      const safeId = (feature.id || `feature-${index + 1}`).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || `feature-${index + 1}`;
      let requiredGroupId = `${feature.part}-feature-${safeId}`;
      while (seen.has(requiredGroupId)) requiredGroupId = `${feature.part}-feature-${safeId}-${index + 1}`;
      seen.add(requiredGroupId);
      plan.requiredNamedGroups[feature.part] = [...new Set([...(plan.requiredNamedGroups[feature.part] ?? []), requiredGroupId])];
      return { ...feature, id: safeId, requiredGroupId };
    });
  }
  return plan;
}

export function readCoordinateNormalization(svg: string): CoordinateMap | undefined {
  const tag = svg.match(/<g\b[^>]*\bdata-coordinate-normalization=["']true["'][^>]*>/i)?.[0];
  if (!tag) return undefined;
  const read = (name: string) => Number(tag.match(new RegExp(`\\b${name}=["']([^"']+)["']`, "i"))?.[1]);
  const result = { scale: read("data-normalization-scale"), x: read("data-normalization-x"), y: read("data-normalization-y") };
  return Object.values(result).every(Number.isFinite) && result.scale > 0 ? result : undefined;
}

export const mapPoint = (point: { x: number; y: number }, mapping: CoordinateMap) => ({ x: point.x * mapping.scale + mapping.x, y: point.y * mapping.scale + mapping.y });
const mapBounds = (bounds: SvgBounds, mapping: CoordinateMap): SvgBounds => ({ x: bounds.x * mapping.scale + mapping.x, y: bounds.y * mapping.scale + mapping.y, width: bounds.width * mapping.scale, height: bounds.height * mapping.scale });
const distanceToBounds = (point: { x: number; y: number }, bounds: SvgBounds) => Math.hypot(Math.max(bounds.x - point.x, 0, point.x - bounds.x - bounds.width), Math.max(bounds.y - point.y, 0, point.y - bounds.y - bounds.height));

export function extractSvgBounds(svg: string): SvgBounds | undefined {
  const points: Array<{ x: number; y: number }> = [];
  for (const match of svg.matchAll(/<(path|polygon|polyline)\b([^>]*)>/gi)) {
    const value = match[2].match(/\b(?:d|points)\s*=\s*["']([^"']+)["']/i)?.[1];
    const values = value?.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)?.map(Number) ?? [];
    for (let index = 0; index + 1 < values.length; index += 2) points.push({ x: values[index], y: values[index + 1] });
  }
  for (const match of svg.matchAll(/<(circle|ellipse|rect|line)\b([^>]*)>/gi)) {
    const attributes = Object.fromEntries([...match[2].matchAll(/([\w:-]+)\s*=\s*["']([^"']+)["']/g)].map((item) => [item[1].toLowerCase(), Number(item[2])]));
    if (match[1].toLowerCase() === "circle" || match[1].toLowerCase() === "ellipse") {
      const rx = attributes.rx || attributes.r || 0; const ry = attributes.ry || attributes.r || 0;
      if (Number.isFinite(attributes.cx) && Number.isFinite(attributes.cy)) points.push({ x: attributes.cx - rx, y: attributes.cy - ry }, { x: attributes.cx + rx, y: attributes.cy + ry });
    } else if (match[1].toLowerCase() === "rect" && Number.isFinite(attributes.x) && Number.isFinite(attributes.y)) points.push({ x: attributes.x, y: attributes.y }, { x: attributes.x + (attributes.width || 0), y: attributes.y + (attributes.height || 0) });
    else if (Number.isFinite(attributes.x1) && Number.isFinite(attributes.y1)) points.push({ x: attributes.x1, y: attributes.y1 }, { x: attributes.x2, y: attributes.y2 });
  }
  if (!points.length) return undefined;
  const normalization = readCoordinateNormalization(svg);
  const mapped = normalization ? points.map((point) => mapPoint(point, normalization)) : points;
  const minX = Math.min(...mapped.map((point) => point.x)); const maxX = Math.max(...mapped.map((point) => point.x));
  const minY = Math.min(...mapped.map((point) => point.y)); const maxY = Math.max(...mapped.map((point) => point.y));
  return { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}

function rawBounds(svg: string) {
  const marker = readCoordinateNormalization(svg);
  if (!marker) return extractSvgBounds(svg);
  // Already normalized fragments are never normalized a second time.
  return undefined;
}

function outsideView(bounds: SvgBounds | undefined, part: AnimalPartType) {
  if (!bounds) return false;
  const view = VIEW[part];
  return bounds.x < -view.width * .25 || bounds.y < -view.height * .25 || bounds.x + bounds.width > view.width * 1.25 || bounds.y + bounds.height > view.height * 1.25;
}

function fitMap(bounds: SvgBounds, width: number, height: number): CoordinateMap {
  const scale = Math.min(1, (width - 20) / Math.max(bounds.width, 1), (height - 20) / Math.max(bounds.height, 1));
  return { scale, x: (width - bounds.width * scale) / 2 - bounds.x * scale, y: (height - bounds.height * scale) / 2 - bounds.y * scale };
}

function bodyContractMap(bounds: SvgBounds, connections: AnimalDraft["bodyConnections"]): CoordinateMap {
  const fitted = fitMap(bounds, VIEW.body.width, VIEW.body.height);
  const span = connections.tail.x - connections.neck.x;
  if (!Number.isFinite(span) || span <= 0) return fitted;
  const scale = Math.min(fitted.scale, 240 / span);
  let x = 40 - connections.neck.x * scale;
  const legY = (connections.frontLegs.y + connections.backLegs.y) / 2;
  let y = 160 - legY * scale;
  const mapped = mapBounds(bounds, { scale, x, y });
  if (mapped.x < 4) x += 4 - mapped.x;
  if (mapped.x + mapped.width > VIEW.body.width - 4) x -= mapped.x + mapped.width - (VIEW.body.width - 4);
  if (mapped.y < 4) y += 4 - mapped.y;
  const bottom = bounds.y * scale + y + bounds.height * scale;
  if (bottom > VIEW.body.height - 4) y -= bottom - (VIEW.body.height - 4);
  return { scale, x, y };
}

function anchorScaleLimit(bounds: SvgBounds, source: { x: number; y: number }, target: { x: number; y: number }, view: { width: number; height: number }) {
  const limits = [
    source.x > bounds.x ? target.x / (source.x - bounds.x) : Infinity,
    bounds.x + bounds.width > source.x ? (view.width - target.x) / (bounds.x + bounds.width - source.x) : Infinity,
    source.y > bounds.y ? target.y / (source.y - bounds.y) : Infinity,
    bounds.y + bounds.height > source.y ? (view.height - target.y) / (bounds.y + bounds.height - source.y) : Infinity,
  ].filter((value) => Number.isFinite(value) && value > 0);
  return limits.length ? Math.min(...limits) * .96 : 1;
}

function fallbackSourceAnchor(part: typeof ATTACHED[number], bounds: SvgBounds) {
  if (part === "head") return { x: bounds.x + bounds.width, y: bounds.y + bounds.height * .72 };
  if (part === "tail") return { x: bounds.x, y: bounds.y + bounds.height * .22 };
  const ratio = part === "frontLegs" ? .29 : .75;
  return { x: bounds.x + bounds.width * ratio, y: bounds.y };
}

function wrapNormalization(svg: string, mapping: CoordinateMap) {
  if (Math.abs(mapping.scale - 1) < 1e-6 && Math.abs(mapping.x) < 1e-6 && Math.abs(mapping.y) < 1e-6) return svg;
  const value = (number: number) => Number(number.toFixed(6));
  return `<g data-coordinate-normalization="true" data-normalization-scale="${value(mapping.scale)}" data-normalization-x="${value(mapping.x)}" data-normalization-y="${value(mapping.y)}" transform="matrix(${value(mapping.scale)} 0 0 ${value(mapping.scale)} ${value(mapping.x)} ${value(mapping.y)})">${svg}</g>`;
}

function transformConnection(connection: BlueprintConnectionProfile, bodyMap: CoordinateMap, partMap: CoordinateMap): BlueprintConnectionProfile {
  return { ...connection, socketAnchor: mapPoint(connection.socketAnchor, bodyMap), attachmentAnchor: mapPoint(connection.attachmentAnchor, partMap), seamWidth: connection.seamWidth * partMap.scale, minimumOverlap: connection.minimumOverlap * bodyMap.scale, neutralConnectionDepth: connection.neutralConnectionDepth * partMap.scale };
}

/**
 * Converts the common model failure where every part is authored in one large
 * assembled canvas into the editor's fixed local part coordinate spaces.
 */
export function normalizeAnimalDraftCoordinates(input: AnimalDraft, inputPlan: AnatomyStylePlan): { animal: AnimalDraft; plan: AnatomyStylePlan; normalized: boolean; normalizedParts: AnimalPartType[] } {
  const animal = structuredClone(input);
  const plan = structuredClone(inputPlan);
  const originalConnections = structuredClone(input.bodyConnections);
  const raw = Object.fromEntries(PARTS.map((part) => [part, rawBounds(input[FIELD[part]])])) as Record<AnimalPartType, SvgBounds | undefined>;
  const connectionOutside = Object.values(originalConnections).some((point) => point.x < 0 || point.x > 300 || point.y < 0 || point.y > 220);
  const bodyGlobal = connectionOutside || outsideView(raw.body, "body");
  const bodyMap = bodyGlobal && raw.body ? (connectionOutside ? bodyContractMap(raw.body, originalConnections) : fitMap(raw.body, VIEW.body.width, VIEW.body.height)) : IDENTITY;
  const bodyConnectionMap = connectionOutside ? bodyMap : IDENTITY;
  const maps = Object.fromEntries(PARTS.map((part) => [part, IDENTITY])) as Record<AnimalPartType, CoordinateMap>;
  maps.body = bodyMap;
  const normalizedParts: AnimalPartType[] = [];

  if (bodyMap !== IDENTITY) {
    animal.bodySvg = wrapNormalization(animal.bodySvg, bodyMap);
    normalizedParts.push("body");
    for (const key of Object.keys(animal.bodyConnections) as Array<keyof AnimalDraft["bodyConnections"]>) animal.bodyConnections[key] = mapPoint(originalConnections[key], bodyConnectionMap);
  }

  for (const part of ATTACHED) {
    const bounds = raw[part];
    if (!bounds || (!bodyGlobal && !outsideView(bounds, part))) continue;
    const fixed = VIEW[part].anchor!;
    const layoutConnection = input.layoutMetadata?.connections.find((entry) => entry.part === part);
    const candidates = [layoutConnection?.attachmentAnchor, originalConnections[CONNECTION[part]], fixed].filter(Boolean) as Array<{ x: number; y: number }>;
    let source = candidates.sort((left, right) => distanceToBounds(left, bounds) - distanceToBounds(right, bounds))[0];
    if (!source || distanceToBounds(source, bounds) > Math.max(bounds.width, bounds.height) * .35) source = fallbackSourceAnchor(part, bounds);
    const scale = Math.min(bodyGlobal ? bodyMap.scale : 1, anchorScaleLimit(bounds, source, fixed, VIEW[part]), (VIEW[part].width - 12) / bounds.width, (VIEW[part].height - 12) / bounds.height);
    const mapping = { scale: Math.max(.05, scale), x: fixed.x - source.x * Math.max(.05, scale), y: fixed.y - source.y * Math.max(.05, scale) };
    maps[part] = mapping;
    animal[FIELD[part]] = wrapNormalization(animal[FIELD[part]], mapping);
    normalizedParts.push(part);
  }

  if (!normalizedParts.length) return { animal: input, plan: inputPlan, normalized: false, normalizedParts: [] };

  if (animal.layoutMetadata) {
    animal.layoutMetadata.groundY = mapPoint({ x: 0, y: animal.layoutMetadata.groundY }, bodyConnectionMap).y;
    animal.layoutMetadata.connections = animal.layoutMetadata.connections.map((connection) => ({ ...transformConnection(connection, bodyConnectionMap, maps[connection.part] ?? IDENTITY), socketAnchor: animal.bodyConnections[CONNECTION[connection.part]] }));
    for (const part of ["frontLegs", "backLegs"] as const) if (animal.layoutMetadata.groundContacts[part]) animal.layoutMetadata.groundContacts[part] = animal.layoutMetadata.groundContacts[part]!.map((point) => ({ ...mapPoint(point, maps[part]), ...(point.raised ? { raised: true } : {}) }));
  }
  plan.suggestedJoints = plan.suggestedJoints.map((joint) => ({ ...joint, ...mapPoint(joint, maps[joint.part]) }));
  return { animal, plan, normalized: true, normalizedParts };
}

function anchorOpeningTag(map: CoordinateMap): string {
  const value = (number: number) => Number(number.toFixed(6));
  return `<g data-coordinate-normalization="true" data-normalization-scale="${value(map.scale)}" data-normalization-x="${value(map.x)}" data-normalization-y="${value(map.y)}" transform="matrix(${value(map.scale)} 0 0 ${value(map.scale)} ${value(map.x)} ${value(map.y)})">`;
}

// A pure translation composes with any existing coordinate-normalization matrix, so we
// just add the delta to that part's map (or add a scale-1 map if none exists). Keeping a
// single normalization marker matters: readCoordinateNormalization reads exactly one.
function augmentNormalization(svg: string, dx: number, dy: number): string {
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return svg;
  const existing = readCoordinateNormalization(svg);
  if (existing) return svg.replace(/<g\b[^>]*\bdata-coordinate-normalization=["']true["'][^>]*>/i, anchorOpeningTag({ scale: existing.scale, x: existing.x + dx, y: existing.y + dy }));
  return wrapNormalization(svg, { scale: 1, x: dx, y: dy });
}

/**
 * Snap-always (§5.1 dec.1): after coordinate normalization, unconditionally translate
 * each attached part so its declared attachment anchor (from layoutMetadata.connections,
 * else the bounds-nearest heuristic) lands exactly on the fixed local anchor. This erases
 * the redundant anchor-hit failure class — the seam-pixel check remains the real gate —
 * and makes the assembled preview's fixed offsets reliable. Ground contacts and the
 * connection anchor for each part shift by the same delta so metadata stays consistent.
 */
export function snapAttachedPartsToAnchors(input: AnimalDraft): AnimalDraft {
  const animal = structuredClone(input);
  for (const part of ATTACHED) {
    const fixed = VIEW[part].anchor;
    if (!fixed) continue;
    const localBounds = extractSvgBounds(animal[FIELD[part]]);
    const declared = animal.layoutMetadata?.connections.find((entry) => entry.part === part)?.attachmentAnchor;
    const anchor = declared ?? (localBounds ? fallbackSourceAnchor(part, localBounds) : fixed);
    const dx = fixed.x - anchor.x;
    const dy = fixed.y - anchor.y;
    if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) continue;
    animal[FIELD[part]] = augmentNormalization(animal[FIELD[part]], dx, dy);
    if (animal.layoutMetadata) {
      const connection = animal.layoutMetadata.connections.find((entry) => entry.part === part);
      if (connection) connection.attachmentAnchor = { x: fixed.x, y: fixed.y };
      if ((part === "frontLegs" || part === "backLegs") && animal.layoutMetadata.groundContacts[part]) {
        animal.layoutMetadata.groundContacts[part] = animal.layoutMetadata.groundContacts[part]!.map((point) => ({ ...point, x: point.x + dx, y: point.y + dy }));
      }
    }
  }
  return animal;
}
