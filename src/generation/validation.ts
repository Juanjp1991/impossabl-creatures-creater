import { PART_TYPES, type AnimalDraft, type AnatomyStylePlan, type ValidationIssue, type ValidationResult } from "./contracts";
import type { AnimalPartType } from "../types";

export const VALIDATOR_VERSION = "p0-svg-validator-1.0.0";

const PART_CONFIG: Record<AnimalPartType, { width: number; height: number; anchors: Array<{ name: string; x: number; y: number }> }> = {
  head: { width: 160, height: 160, anchors: [{ name: "neck", x: 120, y: 110 }] },
  body: { width: 300, height: 220, anchors: [] },
  frontLegs: { width: 260, height: 180, anchors: [{ name: "body", x: 75, y: 15 }] },
  backLegs: { width: 260, height: 180, anchors: [{ name: "body", x: 195, y: 15 }] },
  tail: { width: 160, height: 160, anchors: [{ name: "body", x: 15, y: 15 }] },
};

const SVG_FIELD: Record<AnimalPartType, keyof AnimalDraft> = { head: "headSvg", body: "bodySvg", frontLegs: "frontLegsSvg", backLegs: "backLegsSvg", tail: "tailSvg" };
const ALLOWED_TAGS = new Set(["g", "path", "circle", "rect", "ellipse", "polygon", "polyline", "line", "defs", "lineargradient", "radialgradient", "stop", "filter", "fedropshadow", "fegaussianblur", "mask", "clippath"]);
const ALLOWED_ATTRS = new Set(["id", "d", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "width", "height", "points", "fill", "fill-opacity", "fill-rule", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "stroke-opacity", "opacity", "transform", "offset", "stop-color", "stop-opacity", "gradientunits", "gradienttransform", "fx", "fy", "stddeviation", "dx", "dy", "flood-color", "flood-opacity", "filter", "mask", "clip-path", "href", "xlink:href", "class", "style"]);

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
  return points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
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
  }
  return { valid: !issues.some((entry) => entry.severity === "error"), checkedAt: new Date().toISOString(), validatorVersion: VALIDATOR_VERSION, issues };
}
