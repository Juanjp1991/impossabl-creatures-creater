import { ANATOMY_TEMPLATES } from "./templates";
import type { AnatomicalCategory, AnimalPackageV1, AnimalPartV1, AnimalSocketV1, AnatomyTemplateId, PackagePoint } from "./schema";
import { assertPublishableAnimalPackageV1 } from "./validation";

export const HYBRID_RECIPE_FORMAT_VERSION = "1.0.0" as const;

export interface HybridPartSelectionV1 { animalId: string; assetVersion: string; partId: string; }
export interface HybridPartAdjustmentV1 { scale: number; offsetX: number; offsetY: number; rotation: number; }
export interface HybridRecipeV1 {
  formatVersion: typeof HYBRID_RECIPE_FORMAT_VERSION; id: string; name: string; anatomyTemplateId: AnatomyTemplateId;
  bodySource: { animalId: string; assetVersion: string }; parts: Partial<Record<AnatomicalCategory, HybridPartSelectionV1>>;
  colours: { primary: string; accent: string }; adjustments: Partial<Record<AnatomicalCategory, HybridPartAdjustmentV1>>; createdAt: string; updatedAt: string;
}
export interface HybridRecipeIssue { path: string; message: string; }
export interface CompatibilityWarning { code: string; message: string; }
export interface PartCompatibilityAssessment {
  status: "exact" | "adjusted" | "legacy" | "incompatible";
  autoScale: number;
  verticalOffset: number;
  warnings: CompatibilityWarning[];
}
export interface ResolvedHybridPart {
  category: AnatomicalCategory; source: AnimalPackageV1; part: AnimalPartV1; origin: PackagePoint; target: PackagePoint;
  adjustment: HybridPartAdjustmentV1; autoScale: number; verticalOffset: number; compatibility: PartCompatibilityAssessment;
}

const DEFAULT_ADJUSTMENT: HybridPartAdjustmentV1 = { scale: 1, offsetX: 0, offsetY: 0, rotation: 0 };
const HEX = /^#[0-9a-f]{6}$/i;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const warning = (code: string, message: string): CompatibilityWarning => ({ code, message });

export function packageKey(value: { animalId: string; assetVersion: string }) { return `${value.animalId}@${value.assetVersion}`; }
export function allowedHybridCategories(templateId: AnatomyTemplateId) { return ANATOMY_TEMPLATES[templateId].parts.map((rule) => rule.category); }

function socketFor(bodySource: AnimalPackageV1, category: AnatomicalCategory): AnimalSocketV1 | undefined {
  return bodySource.sockets.find((socket) => socket.ownerPartId === bodySource.centralSkeleton.rootPartId && socket.category === category);
}

export function assessPartCompatibility(bodySource: AnimalPackageV1, partSource: AnimalPackageV1, part: AnimalPartV1, requestedCategory: AnatomicalCategory = part.category): PartCompatibilityAssessment {
  const warnings: CompatibilityWarning[] = [];
  const incompatible = (code: string, message: string): PartCompatibilityAssessment => ({ status: "incompatible", autoScale: 1, verticalOffset: 0, warnings: [warning(code, message)] });
  const root = bodySource.parts.find((candidate) => candidate.id === bodySource.centralSkeleton.rootPartId);
  if (requestedCategory === "body") {
    if (!root || part.id !== root.id || packageKey(bodySource) !== packageKey(partSource)) return incompatible("compatibility.body-source", "The body slot must use the bodySource package root part.");
    return { status: bodySource.compatibility ? "exact" : "legacy", autoScale: 1, verticalOffset: 0, warnings: bodySource.compatibility ? [] : [warning("compatibility.legacy-metadata", "This Package V1 body has no optional compatibility profile; legacy placement is preserved.")] };
  }
  if (part.category !== requestedCategory) return incompatible("compatibility.category", `A ${part.category} part cannot fill the ${requestedCategory} socket.`);
  const socket = socketFor(bodySource, requestedCategory);
  if (!socket) return incompatible("compatibility.socket-missing", `The selected body has no ${requestedCategory} socket.`);
  if (!socket.accepts.includes(part.category)) return incompatible("compatibility.socket-category", `The ${requestedCategory} socket does not accept ${part.category}.`);
  if (!part.attachment || part.attachment.socketId.length === 0) return incompatible("compatibility.attachment-missing", `The selected ${part.category} has no attachment anchor.`);
  if (bodySource.compatibility?.facing && partSource.compatibility?.facing && bodySource.compatibility.facing !== partSource.compatibility.facing) return incompatible("compatibility.facing-opposite", `Body faces ${bodySource.compatibility.facing}, but the selected part faces ${partSource.compatibility.facing}. Automatic mirroring is not allowed.`);
  const socketProfile = socket.profile; const attachmentProfile = part.attachment.profile;
  if (!bodySource.compatibility || !partSource.compatibility || !socketProfile || !attachmentProfile) {
    return { status: "legacy", autoScale: 1, verticalOffset: 0, warnings: [warning("compatibility.legacy-metadata", "Optional socket/attachment metadata is missing; legacy anchor placement is preserved.")] };
  }
  const requestedScale = socketProfile.seamWidth / attachmentProfile.seamWidth;
  const minScale = Math.max(.7, socketProfile.allowedScale.min);
  const maxScale = Math.min(1.3, socketProfile.allowedScale.max);
  const autoScale = clamp(requestedScale, minScale, maxScale);
  if (Math.abs(autoScale - requestedScale) > .001) warnings.push(warning("compatibility.scale-clamped", `Ideal seam scale ${requestedScale.toFixed(2)} was clamped to ${autoScale.toFixed(2)}.`));
  else if (Math.abs(autoScale - 1) > .01) warnings.push(warning("compatibility.scale-adjusted", `Part was uniformly auto-scaled to ${autoScale.toFixed(2)} to match seam width.`));
  const outwardLength = Math.hypot(socketProfile.outwardNormal.x, socketProfile.outwardNormal.y) || 1;
  const opposingLength = Math.hypot(attachmentProfile.opposingNormal.x, attachmentProfile.opposingNormal.y) || 1;
  const dot = (socketProfile.outwardNormal.x * attachmentProfile.opposingNormal.x + socketProfile.outwardNormal.y * attachmentProfile.opposingNormal.y) / (outwardLength * opposingLength);
  if (dot > -.8) warnings.push(warning("compatibility.normal-weak", "Connection normals are not strongly opposed; inspect the seam after fitting."));
  let verticalOffset = 0;
  if ((part.category === "forelimbs" || part.category === "hindlimbs") && part.groundContacts?.some((contact) => !contact.raised)) {
    const grounded = part.groundContacts.filter((contact) => !contact.raised).map((contact) => contact.y).sort((a, b) => a - b);
    const median = grounded[Math.floor(grounded.length / 2)];
    const assembledFootY = socket.anchor.y + (median - part.attachment.anchor.y) * autoScale;
    const required = bodySource.compatibility.groundY - assembledFootY;
    const cap = Math.min(8, socketProfile.minimumOverlap / 2, attachmentProfile.neutralConnectionDepth / 2);
    verticalOffset = clamp(required, -cap, cap);
    if (Math.abs(verticalOffset) > .01) warnings.push(warning("compatibility.ground-adjusted", `Part received a ${verticalOffset.toFixed(1)}px vertical ground correction.`));
    if (Math.abs(required - verticalOffset) > 10) warnings.push(warning("compatibility.ground-residual", `${Math.abs(required - verticalOffset).toFixed(1)}px of ground mismatch remains after the safe correction cap.`));
  }
  return { status: warnings.length ? "adjusted" : "exact", autoScale, verticalOffset, warnings };
}

export function validateHybridRecipe(recipe: HybridRecipeV1, library: AnimalPackageV1[]): HybridRecipeIssue[] {
  const issues: HybridRecipeIssue[] = [];
  if (recipe.formatVersion !== HYBRID_RECIPE_FORMAT_VERSION) issues.push({ path: "formatVersion", message: "Unsupported hybrid recipe version." });
  if (!recipe.id.trim()) issues.push({ path: "id", message: "Recipe ID is required." });
  if (!recipe.name.trim()) issues.push({ path: "name", message: "Creature name is required." });
  if (!HEX.test(recipe.colours.primary) || !HEX.test(recipe.colours.accent)) issues.push({ path: "colours", message: "Recipe colours must be six-digit hex values." });
  const packages = new Map(library.map((pkg) => [packageKey(pkg), pkg]));
  const bodySource = packages.get(packageKey(recipe.bodySource));
  if (!bodySource) issues.push({ path: "bodySource", message: "The body source package is not installed." });
  else if (bodySource.anatomyTemplateId !== recipe.anatomyTemplateId) issues.push({ path: "anatomyTemplateId", message: "The recipe template must match its body source." });
  const allowed = new Set(allowedHybridCategories(recipe.anatomyTemplateId));
  for (const category of allowed) {
    const selection = recipe.parts[category];
    if (!selection) { issues.push({ path: `parts.${category}`, message: `A ${category} selection is required.` }); continue; }
    const source = packages.get(packageKey(selection)); const part = source?.parts.find((candidate) => candidate.id === selection.partId);
    if (!source) issues.push({ path: `parts.${category}`, message: "The selected source package is not installed." });
    else if (!part) issues.push({ path: `parts.${category}.partId`, message: "The selected part does not exist." });
    else if (bodySource) {
      const assessment = assessPartCompatibility(bodySource, source, part, category);
      if (assessment.status === "incompatible") issues.push({ path: `parts.${category}`, message: assessment.warnings[0].message });
    }
  }
  for (const category of Object.keys(recipe.parts) as AnatomicalCategory[]) if (!allowed.has(category)) issues.push({ path: `parts.${category}`, message: `${category} is not valid for the ${recipe.anatomyTemplateId} body.` });
  return issues;
}

function transformPoint(point: PackagePoint, origin: PackagePoint, pivot: PackagePoint, adjustment: HybridPartAdjustmentV1) {
  const radians = adjustment.rotation * Math.PI / 180;
  const sx = (point.x - pivot.x) * adjustment.scale; const sy = (point.y - pivot.y) * adjustment.scale;
  return { x: origin.x + adjustment.offsetX + pivot.x + sx * Math.cos(radians) - sy * Math.sin(radians), y: origin.y + adjustment.offsetY + pivot.y + sx * Math.sin(radians) + sy * Math.cos(radians) };
}

export function resolveHybridRecipe(recipe: HybridRecipeV1, library: AnimalPackageV1[]): ResolvedHybridPart[] {
  const issues = validateHybridRecipe(recipe, library);
  if (issues.length) throw new Error(issues.map((entry) => `${entry.path}: ${entry.message}`).join("\n"));
  const packages = new Map(library.map((pkg) => [packageKey(pkg), pkg])); const bodySource = packages.get(packageKey(recipe.bodySource))!;
  const root = bodySource.parts.find((part) => part.id === bodySource.centralSkeleton.rootPartId)!;
  const rootOrigin = { x: 300 - (root.viewBox.x + root.viewBox.width / 2), y: 250 - (root.viewBox.y + root.viewBox.height / 2) };
  const rootAdjustment = { ...DEFAULT_ADJUSTMENT, ...recipe.adjustments.body };
  const rootPivot = root.pivot ?? { x: root.viewBox.x + root.viewBox.width / 2, y: root.viewBox.y + root.viewBox.height / 2 };
  return allowedHybridCategories(recipe.anatomyTemplateId).map((category) => {
    if (category === "body") {
      const compatibility = assessPartCompatibility(bodySource, bodySource, root, "body");
      return { category, source: bodySource, part: root, origin: rootOrigin, target: transformPoint(rootPivot, rootOrigin, rootPivot, rootAdjustment), adjustment: rootAdjustment, autoScale: 1, verticalOffset: 0, compatibility };
    }
    const selection = recipe.parts[category]!; const source = packages.get(packageKey(selection))!; const part = source.parts.find((candidate) => candidate.id === selection.partId)!;
    const socket = socketFor(bodySource, category)!; const anchor = part.attachment!.anchor;
    const target = transformPoint(socket.anchor, rootOrigin, rootPivot, rootAdjustment);
    const compatibility = assessPartCompatibility(bodySource, source, part, category);
    const adjustment = { ...DEFAULT_ADJUSTMENT, ...recipe.adjustments[category] };
    const origin = { x: target.x - anchor.x, y: target.y - anchor.y + compatibility.verticalOffset };
    return { category, source, part, origin, target, adjustment, autoScale: compatibility.autoScale, verticalOffset: compatibility.verticalOffset, compatibility };
  });
}

const escapeAttribute = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
const colourize = (svg: string, primary: string, accent: string) => svg.replace(/(["'])primary\1/gi, `"${escapeAttribute(primary)}"`).replace(/(["'])accent\1/gi, `"${escapeAttribute(accent)}"`);

function groupFragment(svg: string, id: string, includeDefs = false) {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); const start = new RegExp(`<g\\b[^>]*\\bid=["']${escaped}["'][^>]*>`, "i").exec(svg);
  if (!start || start.index === undefined) return "";
  const tokens = [...svg.slice(start.index).matchAll(/<\s*(\/?)\s*g\b[^>]*>/gi)]; let depth = 0; let end = svg.length;
  for (const token of tokens) { if (token[1]) depth--; else if (!/\/\s*>$/.test(token[0])) depth++; if (depth === 0) { end = start.index + token.index! + token[0].length; break; } }
  const defs = includeDefs ? [...svg.matchAll(/<defs\b[^>]*>[\s\S]*?<\/defs>/gi)].map((match) => match[0]).join("") : "";
  return defs + svg.slice(start.index, end);
}

export function buildHybridSvg(recipe: HybridRecipeV1, library: AnimalPackageV1[]) {
  for (const pkg of library) assertPublishableAnimalPackageV1(pkg);
  const resolved = resolveHybridRecipe(recipe, library);
  const modernQuadruped = recipe.anatomyTemplateId === "quadruped" && Boolean(resolved.find((item) => item.category === "body")?.source.compatibility);
  const entries: Array<{ slot: number; id: string; markup: string }> = [];
  for (const item of resolved) {
    const { category, part, origin, adjustment, autoScale } = item; const anchor = part.attachment?.anchor ?? part.pivot ?? { x: part.viewBox.x + part.viewBox.width / 2, y: part.viewBox.y + part.viewBox.height / 2 };
    const transform = `translate(${origin.x + adjustment.offsetX} ${origin.y + adjustment.offsetY}) translate(${anchor.x} ${anchor.y}) rotate(${adjustment.rotation}) scale(${autoScale * adjustment.scale}) translate(${-anchor.x} ${-anchor.y})`;
    const wrap = (svg: string, depth?: "far" | "near") => `<g data-category="${category}" data-part-id="${escapeAttribute(part.id)}"${depth ? ` data-depth="${depth}"` : ""} transform="${transform}">${colourize(svg, recipe.colours.primary, recipe.colours.accent)}</g>`;
    if (modernQuadruped && part.depthGroups && (category === "forelimbs" || category === "hindlimbs")) {
      entries.push({ slot: category === "hindlimbs" ? 20 : 25, id: `${part.id}-far`, markup: wrap(groupFragment(part.svg, part.depthGroups.farGroupId, true), "far") });
      entries.push({ slot: category === "hindlimbs" ? 40 : 45, id: `${part.id}-near`, markup: wrap(groupFragment(part.svg, part.depthGroups.nearGroupId), "near") });
    } else {
      const canonical = modernQuadruped ? ({ tail: 10, body: 30, head: 50 } as Partial<Record<AnatomicalCategory, number>>)[category] : undefined;
      entries.push({ slot: canonical ?? part.layerOrder, id: part.id, markup: wrap(part.svg) });
    }
  }
  entries.sort((a, b) => a.slot - b.slot || a.id.localeCompare(b.id));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 500" role="img" aria-label="${escapeAttribute(recipe.name)}">${entries.map((entry) => entry.markup).join("")}</svg>`;
}
