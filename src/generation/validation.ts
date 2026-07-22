import { PART_TYPES, type AnimalDraft, type AnatomyStylePlan, type ValidationIssue, type ValidationResult } from "./contracts";
import type { AnimalPartType } from "../types";
import { analyzeDraftGeometry } from "./geometry";
import { mapPoint, readCoordinateNormalization } from "./normalize";

export const VALIDATOR_VERSION = "p1-svg-validator-2.1.0";

const PART_CONFIG: Record<AnimalPartType, { width: number; height: number; anchors: Array<{ name: string; x: number; y: number }> }> = {
  head: { width: 160, height: 160, anchors: [{ name: "neck", x: 120, y: 110 }] },
  body: { width: 300, height: 220, anchors: [] },
  frontLegs: { width: 260, height: 180, anchors: [{ name: "body", x: 75, y: 15 }] },
  backLegs: { width: 260, height: 180, anchors: [{ name: "body", x: 195, y: 15 }] },
  tail: { width: 160, height: 160, anchors: [{ name: "body", x: 15, y: 15 }] },
};

const SVG_FIELD: Record<AnimalPartType, keyof AnimalDraft> = { head: "headSvg", body: "bodySvg", frontLegs: "frontLegsSvg", backLegs: "backLegsSvg", tail: "tailSvg" };
const CONNECTION_BOUNDS = {
  neck: { minX: 40, maxX: 120, minY: 50, maxY: 130 },
  tail: { minX: 200, maxX: 280, minY: 80, maxY: 160 },
  frontLegs: { minX: 70, maxX: 140, minY: 130, maxY: 190 },
  backLegs: { minX: 180, maxX: 250, minY: 130, maxY: 190 },
} as const;
const ALLOWED_TAGS = new Set(["g", "path", "circle", "rect", "ellipse", "polygon", "polyline", "line", "defs", "lineargradient", "radialgradient", "stop", "filter", "fedropshadow", "fegaussianblur", "mask", "clippath"]);
const ALLOWED_ATTRS = new Set(["id", "d", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "width", "height", "points", "fill", "fill-opacity", "fill-rule", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "stroke-opacity", "opacity", "transform", "offset", "stop-color", "stop-opacity", "gradientunits", "gradienttransform", "fx", "fy", "stddeviation", "dx", "dy", "flood-color", "flood-opacity", "filter", "mask", "clip-path", "href", "xlink:href", "class", "style", "data-name", "data-coordinate-normalization", "data-normalization-scale", "data-normalization-x", "data-normalization-y"]);

function issue(code: string, severity: "error" | "warning", part: AnimalPartType | "animal", message: string): ValidationIssue {
  return { code, severity, part, message };
}

function tagTokens(svg: string): Array<{ closing: boolean; selfClosing: boolean; tag: string; attrs: string }> {
  const clean = svg.replace(/<!--([\s\S]*?)-->/g, "");
  return [...clean.matchAll(/<\s*(\/?)\s*([A-Za-z][\w:-]*)([^>]*)>/g)].map((match) => ({
    closing: Boolean(match[1]), selfClosing: /\/\s*$/.test(match[3]), tag: match[2].toLowerCase(), attrs: match[3],
  }));
}

function geometryPoints(svg: string): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  for (const match of svg.matchAll(/<(path|polygon|polyline)\b[^>]*(?:d|points)\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    const nums = match[2].match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)?.map(Number) ?? [];
    for (let index = 0; index + 1 < nums.length; index += 2) points.push({ x: nums[index], y: nums[index + 1] });
  }
  for (const match of svg.matchAll(/<(circle|ellipse|rect|line)\b([^>]*)>/gi)) {
    const attrs = Object.fromEntries([...match[2].matchAll(/([\w:-]+)\s*=\s*["']([^"']+)["']/g)].map((item) => [item[1].toLowerCase(), Number(item[2])]));
    if (Number.isFinite(attrs.cx) && Number.isFinite(attrs.cy)) points.push({ x: attrs.cx, y: attrs.cy });
    if (Number.isFinite(attrs.x) && Number.isFinite(attrs.y)) points.push({ x: attrs.x, y: attrs.y }, { x: attrs.x + (attrs.width || 0), y: attrs.y + (attrs.height || 0) });
    if (Number.isFinite(attrs.x1) && Number.isFinite(attrs.y1)) points.push({ x: attrs.x1, y: attrs.y1 }, { x: attrs.x2, y: attrs.y2 });
  }
  const finite = points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  const normalization = readCoordinateNormalization(svg);
  return normalization ? finite.map((point) => mapPoint(point, normalization)) : finite;
}

export function failingParts(result: ValidationResult): AnimalPartType[] {
  return PART_TYPES.filter((part) => result.issues.some((entry) => entry.severity === "error" && entry.part === part));
}

export function validateAnimalDraft(candidate: unknown, plan?: AnatomyStylePlan, anchorRadius = 32): ValidationResult {
  const issues: ValidationIssue[] = [];
  const draft = candidate as Partial<AnimalDraft> | null;
  if (!draft || typeof draft !== "object") {
    return { valid: false, checkedAt: new Date().toISOString(), validatorVersion: VALIDATOR_VERSION, issues: [issue("schema.object", "error", "animal", "Generated response is not an animal object.")] };
  }
  for (const field of ["name", "description", "color", "accentColor"] as const) {
    if (typeof draft[field] !== "string" || !draft[field]?.trim()) issues.push(issue(`schema.${field}`, "error", "animal", `${field} must be a non-empty string.`));
  }
  for (const field of ["color", "accentColor"] as const) {
    if (typeof draft[field] === "string" && !/^#[0-9a-f]{6}$/i.test(draft[field]!)) issues.push(issue(`palette.${field}`, "error", "animal", `${field} must be a six-digit hex colour.`));
  }
  const connections = draft.bodyConnections;
  for (const part of ["neck", "tail", "frontLegs", "backLegs"] as const) {
    const point = connections?.[part];
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) issues.push(issue("anchor.missing", "error", "body", `Body attachment anchor '${part}' is missing.`));
    else if (point.x < 0 || point.x > 300 || point.y < 0 || point.y > 220) issues.push(issue("anchor.bounds", "error", "body", `Body attachment anchor '${part}' is outside the 300x220 body view.`));
    else {
      const bounds = CONNECTION_BOUNDS[part];
      if (point.x < bounds.minX || point.x > bounds.maxX || point.y < bounds.minY || point.y > bounds.maxY) issues.push(issue("anchor.contract", "error", "body", `Body attachment anchor '${part}' must stay in its body-local range x=${bounds.minX}-${bounds.maxX}, y=${bounds.minY}-${bounds.maxY}.`));
    }
  }
  if (connections?.neck && connections?.tail && connections.neck.x >= connections.tail.x) issues.push(issue("orientation.left", "error", "body", "Left-facing orientation requires the neck anchor to be left of the tail anchor."));

  const allIds = new Map<string, AnimalPartType>();
  for (const part of PART_TYPES) {
    const svg = draft[SVG_FIELD[part]];
    const config = PART_CONFIG[part];
    if (typeof svg !== "string" || !svg.trim()) { issues.push(issue("part.missing", "error", part, `${part} SVG is required.`)); continue; }
    if (/<\s*svg\b/i.test(svg)) issues.push(issue("svg.wrapper", "error", part, `${part} must contain inner SVG markup, not an <svg> wrapper.`));
    if (/<!doctype|<!entity|<\?xml/i.test(svg)) issues.push(issue("svg.declaration", "error", part, `${part} contains a forbidden XML declaration or entity.`));
    const tokens = tagTokens(svg);
    const stack: string[] = [];
    for (const token of tokens) {
      if (!ALLOWED_TAGS.has(token.tag)) issues.push(issue("svg.tag", "error", part, `${part} uses disallowed <${token.tag}> markup.`));
      if (token.closing) {
        if (stack.pop() !== token.tag) issues.push(issue("svg.xml", "error", part, `${part} contains mismatched XML tags near </${token.tag}>.`));
        continue;
      }
      for (const attr of token.attrs.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)) {
        const name = attr[1].toLowerCase(); const value = attr[2];
        if (name.startsWith("on") || !ALLOWED_ATTRS.has(name)) issues.push(issue("svg.attribute", "error", part, `${part} uses disallowed attribute '${name}'.`));
        if (/(?:javascript:|data:text\/html)/i.test(value)) issues.push(issue("svg.url", "error", part, `${part} contains an unsafe URL value.`));
        if (name === "id") {
          if (allIds.has(value)) issues.push(issue("svg.id.duplicate", "error", part, `SVG id '${value}' is also used by ${allIds.get(value)}.`)); else allIds.set(value, part);
        }
      }
      if (!token.selfClosing) stack.push(token.tag);
    }
    if (stack.length) issues.push(issue("svg.xml", "error", part, `${part} contains unclosed <${stack[stack.length - 1]}> markup.`));
    const points = geometryPoints(svg);
    if (!points.length) issues.push(issue("geometry.empty", "error", part, `${part} has no detectable visible geometry.`));
    if (points.some((point) => point.x < -config.width * .25 || point.x > config.width * 1.25 || point.y < -config.height * .25 || point.y > config.height * 1.25)) issues.push(issue("geometry.bounds", "error", part, `${part} contains coordinates far outside its ${config.width}x${config.height} view.`));
    const anchors = part === "body" && connections ? Object.entries(connections).map(([name, point]) => ({ name, ...point })) : config.anchors;
    for (const anchor of anchors) {
      const near = points.some((point) => Math.hypot(point.x - anchor.x, point.y - anchor.y) <= anchorRadius);
      if (!near) issues.push(issue("anchor.geometry", "error", part, `${part} has no visible geometry within ${anchorRadius}px of '${anchor.name}' anchor (${anchor.x}, ${anchor.y}).`));
    }
    if ((part === "frontLegs" || part === "backLegs") && !points.some((point) => point.y >= config.height - 25)) issues.push(issue("ground.baseline", "error", part, `${part} has no foot geometry near the expected baseline.`));
    if (!/(?:fill|stroke)\s*=\s*["'](?:primary|accent|var\(--(?:primary|accent)\))/i.test(svg)) issues.push(issue("palette.placeholder", "warning", part, `${part} does not use a primary or accent colour placeholder.`));
    const requiredGroups = plan?.requiredNamedGroups?.[part] ?? [`${part}-root`];
    for (const group of requiredGroups) if (!new RegExp(`<g\\b[^>]*\\bid=["']${group.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`, "i").test(svg)) issues.push(issue("group.required", "error", part, `${part} is missing required stable group id '${group}'.`));
  }
  if (plan) {
    if (plan.anatomyTemplate !== "quadruped-five-part" || PART_TYPES.some((part) => !plan.requiredParts.includes(part))) issues.push(issue("plan.anatomy", "error", "animal", "Anatomy plan must use the existing five-part quadruped schema."));
    const layerParts = new Set(plan.layerPlan?.map((layer) => layer.part));
    for (const part of PART_TYPES) if (!layerParts.has(part)) issues.push(issue("plan.layers", "error", part, `Layer plan does not define ${part}.`));
    if (plan.blueprint) {
      const blueprint = plan.blueprint;
      for (const part of PART_TYPES) {
        const bounds = blueprint.occupiedBounds?.[part];
        if (!bounds || ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) || bounds.width <= 0 || bounds.height <= 0) issues.push(issue("blueprint.bounds", "error", part, `Blueprint occupied bounds for ${part} must be finite with positive dimensions.`));
      }
      if (!Number.isFinite(blueprint.groundY)) issues.push(issue("blueprint.ground", "error", "frontLegs", "Blueprint groundY must be finite."));
      const landmarks = blueprint.landmarks;
      if (!landmarks || ![landmarks.noseTip, landmarks.eye, landmarks.neckBase, landmarks.shoulder, landmarks.hip].every((point) => point && Number.isFinite(point.x) && Number.isFinite(point.y))) issues.push(issue("blueprint.landmarks", "error", "head", "Blueprint must define finite nose, eye, neck, shoulder and hip landmarks."));
      else {
        if (!(landmarks.noseTip.x < landmarks.eye.x && landmarks.eye.x < landmarks.neckBase.x)) issues.push(issue("blueprint.facing.head", "error", "head", "Left-facing blueprint requires nose.x < eye.x < neckBase.x."));
        if (!(landmarks.shoulder.x < landmarks.hip.x)) issues.push(issue("blueprint.facing.body", "error", "body", "Left-facing blueprint requires shoulder.x < hip.x."));
        if (landmarks.toeTips?.some((toe, index) => !landmarks.heels?.[index] || toe.x >= landmarks.heels[index].x)) issues.push(issue("blueprint.facing.feet", "error", "frontLegs", "Left-facing toe tips must point ahead of their corresponding heels."));
      }
      const byPart = new Map(blueprint.connections?.map((connection) => [connection.part, connection]));
      for (const part of ["head", "frontLegs", "backLegs", "tail"] as const) {
        const connection = byPart.get(part);
        if (!connection) { issues.push(issue("blueprint.connection", "error", part, `Blueprint connection profile for ${part} is required.`)); continue; }
        const values = [connection.socketAnchor.x, connection.socketAnchor.y, connection.attachmentAnchor.x, connection.attachmentAnchor.y, connection.outwardNormal.x, connection.outwardNormal.y, connection.opposingNormal.x, connection.opposingNormal.y, connection.seamWidth, connection.minimumOverlap, connection.neutralConnectionDepth, connection.allowedScale.min, connection.allowedScale.max];
        if (!values.every(Number.isFinite) || connection.seamWidth <= 0 || connection.minimumOverlap <= 0 || connection.neutralConnectionDepth <= 0 || connection.allowedScale.min <= 0 || connection.allowedScale.max < connection.allowedScale.min) issues.push(issue("blueprint.connection.profile", "error", part, `${part} connection profile must contain finite positive widths, overlap, depth and an ordered scale range.`));
        const a = connection.outwardNormal; const b = connection.opposingNormal; const lengths = Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y);
        if (!lengths || (a.x * b.x + a.y * b.y) / lengths > -.8) issues.push(issue("blueprint.connection.normal", "error", part, `${part} socket and attachment normals must oppose each other.`));
      }
      const fore = byPart.get("frontLegs"); const hind = byPart.get("backLegs");
      if (fore && hind && fore.socketAnchor.x >= hind.socketAnchor.x) issues.push(issue("blueprint.facing.attachments", "error", "body", "Left-facing blueprint requires the front attachment before the hind attachment."));
    }
  }
  if (draft.layoutMetadata) {
    if (draft.layoutMetadata.facing !== "left") issues.push(issue("layout.facing", "error", "animal", "Generated quadruped layout metadata must be left-facing."));
    if (!Number.isFinite(draft.layoutMetadata.groundY)) issues.push(issue("layout.ground", "error", "frontLegs", "Generated layout groundY must be finite."));
    for (const part of ["frontLegs", "backLegs"] as const) {
      const contacts = draft.layoutMetadata.groundContacts?.[part]; const depth = draft.layoutMetadata.depthGroups?.[part]; const svg = draft[SVG_FIELD[part]] as string;
      if (!contacts?.length || contacts.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) issues.push(issue("layout.groundContacts", "error", part, `${part} must emit finite local ground contacts.`));
      if (!depth) issues.push(issue("layout.depthGroups", "error", part, `${part} must emit semantic far and near group IDs.`));
      else for (const [name, id] of Object.entries(depth)) {
        const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        if ([...svg.matchAll(new RegExp(`<g\\b[^>]*\\bid=["']${escaped}["']`, "gi"))].length !== 1) issues.push(issue("layout.depthGroup", "error", part, `${part} ${name} '${id}' must exist exactly once in its SVG.`));
      }
    }
  } else if (plan?.blueprint) issues.push(issue("layout.metadata", "error", "animal", "Generated quadruped must emit compatibility, ground-contact and depth-group metadata."));
  // Legacy plans predate geometry masks. New blueprints opt into the stricter
  // seam/ground contract without invalidating stored V1 generation records.
  if ((plan?.blueprint || draft.layoutMetadata) && PART_TYPES.every((part) => typeof draft[SVG_FIELD[part]] === "string") && connections && [connections.neck, connections.tail, connections.frontLegs, connections.backLegs].every(Boolean)) {
    const geometry = analyzeDraftGeometry(draft as AnimalDraft);
    const tailless = plan?.referenceAnalysis?.externalTail === "absent";
    if (tailless) {
      const tail = geometry.parts.tail;
      if (!tail.bounds || tail.occupiedPixels > 1600 || tail.bounds.width > 48 || tail.bounds.height > 48) {
        issues.push(issue("reference.tail.protruding", "error", "tail", "This species is tailless; tail must be a compact rump seam-cap no larger than 48x48 and hidden behind the body."));
      }
    }
    issues.push(...geometry.issues.filter((entry) => !tailless || !(
      (entry.code === "geometry.seam.excessive-overlap" && entry.part === "tail") ||
      (entry.code === "geometry.overlap.unrelated" && entry.part === "tail")
    )));
  }
  return { valid: !issues.some((entry) => entry.severity === "error"), checkedAt: new Date().toISOString(), validatorVersion: VALIDATOR_VERSION, issues };
}
