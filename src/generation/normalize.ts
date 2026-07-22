import type { AnimalPartType } from "../types";
import type { AnimalDraft, AnatomyStylePlan, BlueprintConnectionProfile } from "./contracts";

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
  if (plan.blueprint) {
    const { landmarks } = plan.blueprint;
    landmarks.toeTips = landmarks.toeTips.map((toe, index) => {
      const heel = landmarks.heels[index];
      return heel && toe.x >= heel.x ? { ...toe, x: heel.x - 4 } : toe;
    });
    plan.blueprint.connections = plan.blueprint.connections.map((connection) => {
      const length = Math.hypot(connection.outwardNormal.x, connection.outwardNormal.y);
      if (!Number.isFinite(length) || length <= 0) return connection;
      const outwardNormal = { x: connection.outwardNormal.x / length, y: connection.outwardNormal.y / length };
      return { ...connection, outwardNormal, opposingNormal: { x: -outwardNormal.x, y: -outwardNormal.y } };
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
  if (plan.blueprint) {
    plan.blueprint.groundY = mapPoint({ x: 0, y: plan.blueprint.groundY }, bodyConnectionMap).y;
    for (const part of PARTS) plan.blueprint.occupiedBounds[part] = mapBounds(plan.blueprint.occupiedBounds[part], maps[part]);
    plan.blueprint.connections = plan.blueprint.connections.map((connection) => ({ ...transformConnection(connection, bodyConnectionMap, maps[connection.part] ?? IDENTITY), socketAnchor: animal.bodyConnections[CONNECTION[connection.part]] }));
    const landmarkMap = bodyMap;
    for (const key of ["noseTip", "eye", "neckBase", "shoulder", "hip"] as const) plan.blueprint.landmarks[key] = mapPoint(plan.blueprint.landmarks[key], landmarkMap);
    for (const key of ["pawBottoms", "heels", "toeTips"] as const) plan.blueprint.landmarks[key] = plan.blueprint.landmarks[key].map((point) => ({ ...point, ...mapPoint(point, landmarkMap) }));
  }
  plan.suggestedJoints = plan.suggestedJoints.map((joint) => ({ ...joint, ...mapPoint(joint, maps[joint.part]) }));
  return { animal, plan, normalized: true, normalizedParts };
}
