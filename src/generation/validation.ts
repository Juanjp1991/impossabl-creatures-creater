import { PART_TYPES, type AnimalDraft, type AnatomyStylePlan, type ValidationIssue, type ValidationResult } from "./contracts";
import type { AnimalPartType } from "../types";
import { analyzeDraftGeometry } from "./geometry";
import { detailDensityProfile } from "./detailDensity";
import {
  LIMB_CONTRACT_VERSION,
  LIMB_PAIR_SPECS,
  extractSvgGroupMarkup,
  farLegUsesDarkPalette,
  physicalLegsForPart,
} from "./limbContract";
import { mapPoint, readCoordinateNormalization } from "./normalize";
import { RAMP_TOKENS } from "./palette";
import { DENSITY_BANDS, FILL_BAND, STROKE, classifyStrokeWidths, firstRawColour, localFillRatio, visibleElementCount } from "./metrics";

export const VALIDATOR_VERSION = "p1-svg-validator-3.1.0";

const PART_CONFIG: Record<AnimalPartType, { width: number; height: number }> = {
  head: { width: 160, height: 160 },
  body: { width: 300, height: 220 },
  frontLegs: { width: 260, height: 180 },
  backLegs: { width: 260, height: 180 },
  tail: { width: 160, height: 160 },
};

const SVG_FIELD: Record<AnimalPartType, keyof AnimalDraft> = { head: "headSvg", body: "bodySvg", frontLegs: "frontLegsSvg", backLegs: "backLegsSvg", tail: "tailSvg" };
// Required stable group ids, hardcoded (§5.1 dec.4 — no planner blueprint to derive them
// from). Far/near limb groups are enforced separately by the layout depth-group check
// whenever layoutMetadata is present.
const REQUIRED_GROUPS: Record<AnimalPartType, string[]> = {
  head: ["head-root"], body: ["body-root"], frontLegs: ["frontLegs-root"], backLegs: ["backLegs-root"], tail: ["tail-root"],
};
export const CONNECTION_BOUNDS = {
  neck: { minX: 40, maxX: 120, minY: 50, maxY: 130 },
  tail: { minX: 200, maxX: 280, minY: 80, maxY: 160 },
  frontLegs: { minX: 70, maxX: 140, minY: 130, maxY: 190 },
  backLegs: { minX: 180, maxX: 250, minY: 130, maxY: 190 },
} as const;
// Tightened per §3: gradients, filters, masks and clipPaths are banned outright (they are
// expensive on old Android WebViews), so their tags and supporting attributes are gone.
const ALLOWED_TAGS = new Set(["g", "path", "circle", "rect", "ellipse", "polygon", "polyline", "line"]);
const ALLOWED_ATTRS = new Set(["id", "d", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "width", "height", "points", "fill", "fill-opacity", "fill-rule", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "stroke-opacity", "opacity", "transform", "class", "style", "data-name", "data-coordinate-normalization", "data-normalization-scale", "data-normalization-x", "data-normalization-y"]);
// A fill/stroke/stop-color that references any shared ramp token (bare or via var(--…)).
const RAMP_TOKEN_REFERENCE = new RegExp(`(?:fill|stroke|stop-color)\\s*[=:]\\s*["']?\\s*(?:var\\(\\s*--)?(?:${RAMP_TOKENS.join("|")})\\b`, "i");

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
  // The attribute name must be preceded by whitespace and matched lazily: a greedy [^>]* would
  // otherwise prefer the LAST "d="-looking text in the tag, which is the `d` inside `id="…"`,
  // capturing the id value instead of the path data and reporting a fully-drawn part as empty.
  for (const match of svg.matchAll(/<(path|polygon|polyline)\b[^>]*?\s(?:d|points)\s*=\s*["']([^"']+)["']/gi)) {
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

/** Parts to treat as failing: any part named by an error, and every part when an animal-wide error fires. */
export function technicalFailingParts(result: ValidationResult): AnimalPartType[] {
  const animalWide = result.issues.some((entry) => entry.part === "animal" && entry.severity === "error");
  return PART_TYPES.filter((part) => animalWide || result.issues.some((entry) => entry.part === part && entry.severity === "error"));
}

/**
 * Deterministic structural validation with physical ground truth only. There is no
 * planner blueprint to conform to (§5.1 dec.4): checks that graded the art against
 * another model's invented numbers (blueprint.*, reference.*, anchor.geometry) are gone.
 * The `_plan` argument is accepted for call-site compatibility but no longer consulted.
 */
export function validateAnimalDraft(candidate: unknown, _plan?: AnatomyStylePlan): ValidationResult {
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
    if ((part === "frontLegs" || part === "backLegs") && !points.some((point) => point.y >= config.height - 25)) issues.push(issue("ground.baseline", "error", part, `${part} has no foot geometry near the expected baseline.`));
    for (const group of REQUIRED_GROUPS[part]) if (!new RegExp(`<g\\b[^>]*\\bid=["']${group.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`, "i").test(svg)) issues.push(issue("group.required", "error", part, `${part} is missing required stable group id '${group}'.`));

    // §5.2 canonical standard. Stroke weight and the palette ramp apply to every part:
    // sub-1px strokes vanish on cheap screens (hard error) and off-ramp raw colours defeat
    // the one-palette rule that makes a frankenstein read as one creature (hard error). An
    // off-standard-but-visible stroke is a soft signal.
    const strokes = classifyStrokeWidths(svg);
    for (const width of strokes.belowMinimum) issues.push(issue("stroke.tooThin", "error", part, `${part} uses stroke-width ${width}, below the ${STROKE.minVisible}px minimum; it disappears on a cheap 360px-wide screen.`));
    for (const width of strokes.offStandard) issues.push(issue("stroke.weight", "warning", part, `${part} uses off-standard stroke-width ${width}; use ${STROKE.silhouette} for silhouettes and ${STROKE.detailMin}-${STROKE.detailMax} for detail.`));
    const rawColour = firstRawColour(svg);
    if (rawColour) issues.push(issue("palette.rawHex", "error", part, `${part} uses raw colour '${rawColour}'; parts may only use the shared ramp tokens (${RAMP_TOKENS.join(", ")}).`));
    if (!RAMP_TOKEN_REFERENCE.test(svg)) issues.push(issue("palette.placeholder", "warning", part, `${part} does not reference any shared ramp token.`));

    // Fill ratio and detail density are consistency bands across the roster, not structural
    // failures; they are surfaced as warnings and gated (like the geometry checks) to real
    // pipeline output, which carries layoutMetadata.
    if (draft.layoutMetadata) {
      const fill = localFillRatio(svg, part);
      if (fill < FILL_BAND[0] || fill > FILL_BAND[1]) issues.push(issue("scale.fill", "warning", part, `${part} occupies ${Math.round(fill * 100)}% of its view height; the shared band is ${Math.round(FILL_BAND[0] * 100)}-${Math.round(FILL_BAND[1] * 100)}%.`));
      const elements = visibleElementCount(svg);
      const [minElements, maxElements] = draft.layoutMetadata.detailLevel
        ? detailDensityProfile(draft.layoutMetadata.detailLevel).bands[part]
        : DENSITY_BANDS[part];
      const densityName = draft.layoutMetadata.detailLevel ?? "shared";
      if (elements < minElements || elements > maxElements) issues.push(issue("density.count", "warning", part, `${part} has ${elements} visible elements; the ${densityName} band is ${minElements}-${maxElements}.`));
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
      if (draft.layoutMetadata.limbContractVersion === LIMB_CONTRACT_VERSION) {
        const pair = LIMB_PAIR_SPECS[part];
        if (depth && (depth.nearGroupId !== pair.near.depthGroupId || depth.farGroupId !== pair.far.depthGroupId)) {
          issues.push(issue("layout.leg.depthMapping", "error", part, `${part} must map left/foreground to '${pair.near.depthGroupId}' and right/background to '${pair.far.depthGroupId}'.`));
        }
        for (const spec of physicalLegsForPart(part)) {
          const wrapper = extractSvgGroupMarkup(svg, spec.depthGroupId);
          const physical = extractSvgGroupMarkup(svg, spec.groupId);
          if (!wrapper || !physical || !new RegExp(`\\bid\\s*=\\s*["']${spec.groupId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`, "i").test(wrapper)) {
            issues.push(issue("layout.leg.group", "error", part, `${spec.label} must exist once as '${spec.groupId}' inside '${spec.depthGroupId}'.`));
            continue;
          }
          const limb = extractSvgGroupMarkup(svg, spec.limbGroupId);
          const foot = extractSvgGroupMarkup(svg, spec.footGroupId);
          const physicalContains = (groupId: string) =>
            new RegExp(`\\bid\\s*=\\s*["']${groupId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`, "i").test(physical);
          if (!limb || !foot || !physicalContains(spec.limbGroupId) || !physicalContains(spec.footGroupId)) {
            issues.push(issue("layout.leg.subgroups", "error", part, `${spec.label} must contain separate '${spec.limbGroupId}' and '${spec.footGroupId}' groups for editable limb and foot artwork.`));
            continue;
          }
          const wrapperElements = visibleElementCount(wrapper);
          const physicalElements = visibleElementCount(physical);
          const limbElements = visibleElementCount(limb);
          const footElements = visibleElementCount(foot);
          if (!physicalElements || wrapperElements !== physicalElements) {
            issues.push(issue("layout.leg.ownership", "error", part, `Every visible shape in '${spec.depthGroupId}' must belong to its one physical leg group '${spec.groupId}'.`));
          }
          if (!limbElements || !footElements || physicalElements !== limbElements + footElements) {
            issues.push(issue("layout.leg.subgroupOwnership", "error", part, `Every visible shape in '${spec.groupId}' must belong to either '${spec.limbGroupId}' or '${spec.footGroupId}', and both must contain artwork.`));
          } else if (footElements < 2) {
            issues.push(issue("density.foot", "warning", part, `${spec.footGroupId} has only ${footElements} visible shape; use multiple meaningful shapes for the paw, hoof, talon, toes, claws or pads.`));
          }
          const instance = draft.layoutMetadata.limbInstances?.[spec.id];
          if (!instance || instance.groupId !== spec.groupId || instance.depthGroupId !== spec.depthGroupId || instance.depth !== spec.depth || !Number.isFinite(instance.footContact?.x) || !Number.isFinite(instance.footContact?.y)) {
            issues.push(issue("layout.leg.metadata", "error", part, `${spec.label} must carry labeled group, depth and finite foot-contact metadata.`));
          }
        }
        if (!farLegUsesDarkPalette(svg, part)) {
          issues.push(issue("palette.legDepth", "warning", part, `${pair.far.label} must use primary-dark or accent-dark so the background leg reads behind the foreground leg.`));
        }
      }
    }
  }
  // Physical geometry ground truth only — seam pixels, ground line, unrelated overlap.
  if (draft.layoutMetadata && PART_TYPES.every((part) => typeof draft[SVG_FIELD[part]] === "string") && connections && [connections.neck, connections.tail, connections.frontLegs, connections.backLegs].every(Boolean)) {
    const geometry = analyzeDraftGeometry(draft as AnimalDraft);
    issues.push(...geometry.issues);
  }
  return { valid: !issues.some((entry) => entry.severity === "error"), checkedAt: new Date().toISOString(), validatorVersion: VALIDATOR_VERSION, issues };
}
