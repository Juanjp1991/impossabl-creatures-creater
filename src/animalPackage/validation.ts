import { ANATOMY_TEMPLATES } from "./templates";
import { ANIMAL_PACKAGE_FORMAT_VERSION, type AnatomicalCategory, type AnimalPackageV1 } from "./schema";
import { validateRigDefinition } from "../rig/engine";
import { mapPoint, readCoordinateNormalization } from "../generation/normalize";

export interface PackageValidationIssue {
  code: string;
  path: string;
  message: string;
}

export interface PackageValidationResult {
  valid: boolean;
  issues: PackageValidationIssue[];
}

const ID_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const HEX_PATTERN = /^#[0-9a-f]{6}$/i;
const ALLOWED_SVG_TAGS = new Set(["g", "path", "circle", "rect", "ellipse", "polygon", "polyline", "line", "defs", "lineargradient", "radialgradient", "stop", "filter", "fedropshadow", "fegaussianblur", "mask", "clippath"]);
const ALLOWED_SVG_ATTRIBUTES = new Set(["id", "d", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "width", "height", "points", "fill", "fill-opacity", "fillopacity", "fill-rule", "fillrule", "stroke", "stroke-width", "strokewidth", "stroke-linecap", "strokelinecap", "stroke-linejoin", "strokelinejoin", "stroke-dasharray", "strokedasharray", "stroke-opacity", "strokeopacity", "opacity", "display", "transform", "offset", "stop-color", "stopcolor", "stop-opacity", "stopopacity", "gradientunits", "gradienttransform", "fx", "fy", "stddeviation", "dx", "dy", "flood-color", "floodcolor", "flood-opacity", "floodopacity", "filter", "mask", "clip-path", "clippath", "href", "xlink:href", "class", "style", "data-name", "data-locked", "data-base-transform", "data-base-fill", "data-editor-transform", "data-coordinate-normalization", "data-normalization-scale", "data-normalization-x", "data-normalization-y"]);

function countByCategory(items: Array<{ category: AnatomicalCategory }>, category: AnatomicalCategory) {
  return items.filter((item) => item.category === category).length;
}

function add(issues: PackageValidationIssue[], code: string, path: string, message: string) {
  issues.push({ code, path, message });
}

function finitePoint(value: unknown): value is { x: number; y: number } {
  const point = value as { x?: unknown; y?: unknown } | undefined;
  return Boolean(point && Number.isFinite(point.x) && Number.isFinite(point.y));
}

function validatePositive(issues: PackageValidationIssue[], value: unknown, code: string, path: string, label: string) {
  if (!Number.isFinite(value) || Number(value) <= 0) add(issues, code, path, `${label} must be a finite positive number.`);
}

function geometryPoints(svg: string) {
  const points: Array<{ x: number; y: number }> = [];
  for (const match of svg.matchAll(/<(?:path|polygon|polyline)\b[^>]*(?:d|points)\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    const numbers = match[1].match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)?.map(Number) ?? [];
    for (let index = 0; index + 1 < numbers.length; index += 2) points.push({ x: numbers[index], y: numbers[index + 1] });
  }
  for (const match of svg.matchAll(/<(?:circle|ellipse|rect|line)\b([^>]*)>/gi)) {
    const attrs = Object.fromEntries([...match[1].matchAll(/([\w:-]+)\s*=\s*["']([^"']+)["']/g)].map((item) => [item[1].toLowerCase(), Number(item[2])]));
    if (Number.isFinite(attrs.cx) && Number.isFinite(attrs.cy)) points.push({ x: attrs.cx, y: attrs.cy });
    if (Number.isFinite(attrs.x) && Number.isFinite(attrs.y)) points.push({ x: attrs.x, y: attrs.y }, { x: attrs.x + (attrs.width || 0), y: attrs.y + (attrs.height || 0) });
    if (Number.isFinite(attrs.x1) && Number.isFinite(attrs.y1)) points.push({ x: attrs.x1, y: attrs.y1 }, { x: attrs.x2, y: attrs.y2 });
  }
  const normalization = readCoordinateNormalization(svg);
  return normalization ? points.map((point) => mapPoint(point, normalization)) : points;
}

export function validateAnimalPackageV1(candidate: unknown): PackageValidationResult {
  const issues: PackageValidationIssue[] = [];
  if (!candidate || typeof candidate !== "object") {
    return { valid: false, issues: [{ code: "package.object", path: "$", message: "Animal package must be an object." }] };
  }

  const value = candidate as Partial<AnimalPackageV1>;
  if (value.formatVersion !== ANIMAL_PACKAGE_FORMAT_VERSION) add(issues, "package.version", "formatVersion", `Expected package format ${ANIMAL_PACKAGE_FORMAT_VERSION}.`);
  if (typeof value.animalId !== "string" || !ID_PATTERN.test(value.animalId)) add(issues, "animal.id", "animalId", "Animal ID must be a permanent lowercase stable ID.");
  if (typeof value.assetVersion !== "string" || !SEMVER_PATTERN.test(value.assetVersion)) add(issues, "asset.version", "assetVersion", "Asset version must be valid SemVer.");
  if (typeof value.name !== "string" || !value.name.trim()) add(issues, "animal.name", "name", "Animal name is required.");
  if (!value.palette || !HEX_PATTERN.test(value.palette.primary) || !HEX_PATTERN.test(value.palette.accent)) add(issues, "palette.colour", "palette", "Primary and accent colours must be six-digit hex values.");
  if (value.compatibility) {
    if (value.compatibility.facing !== "left" && value.compatibility.facing !== "right") add(issues, "compatibility.facing", "compatibility.facing", "Facing must be 'left' or 'right'.");
    if (!Number.isFinite(value.compatibility.groundY)) add(issues, "compatibility.ground", "compatibility.groundY", "Root-local groundY must be finite.");
  }

  const template = value.anatomyTemplateId ? ANATOMY_TEMPLATES[value.anatomyTemplateId] : undefined;
  if (!template) add(issues, "anatomy.template", "anatomyTemplateId", "Unknown anatomy template.");
  const parts = Array.isArray(value.parts) ? value.parts : [];
  const sockets = Array.isArray(value.sockets) ? value.sockets : [];
  if (!Array.isArray(value.parts)) add(issues, "parts.array", "parts", "Parts must be an array.");
  if (!Array.isArray(value.sockets)) add(issues, "sockets.array", "sockets", "Sockets must be an array.");

  const partIds = new Set<string>();
  const groupIds = new Set<string>();
  const svgIds = new Map<string, string>();
  const svgReferences: Array<{ id: string; path: string }> = [];
  for (const [index, part] of parts.entries()) {
    const path = `parts[${index}]`;
    if (!ID_PATTERN.test(part.id)) add(issues, "part.id", `${path}.id`, "Part ID must be a stable lowercase ID.");
    if (partIds.has(part.id)) add(issues, "part.id.duplicate", `${path}.id`, `Duplicate part ID '${part.id}'.`);
    partIds.add(part.id);
    if (!part.viewBox || ![part.viewBox.x, part.viewBox.y, part.viewBox.width, part.viewBox.height].every(Number.isFinite) || part.viewBox.width <= 0 || part.viewBox.height <= 0) add(issues, "part.viewBox", `${path}.viewBox`, "Part viewBox must have finite coordinates and positive dimensions.");
    if (typeof part.svg !== "string" || !part.svg.trim() || /<\s*svg\b/i.test(part.svg)) add(issues, "part.svg", `${path}.svg`, "Part SVG must be a non-empty inner SVG fragment.");
    const stack: string[] = [];
    for (const token of part.svg.matchAll(/<\s*(\/?)\s*([A-Za-z][\w:-]*)([^>]*)>/g)) {
      const closing = Boolean(token[1]);
      const tag = token[2].toLowerCase();
      const selfClosing = /\/\s*$/.test(token[3]);
      if (!ALLOWED_SVG_TAGS.has(tag)) add(issues, "svg.tag", `${path}.svg`, `Disallowed SVG element <${tag}>.`);
      if (closing) {
        if (stack.pop() !== tag) add(issues, "svg.xml", `${path}.svg`, `Mismatched closing element </${tag}>.`);
        continue;
      }
      for (const attribute of token[3].matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)) {
        const name = attribute[1].toLowerCase();
        const attributeValue = attribute[2];
        if (name.startsWith("on") || !ALLOWED_SVG_ATTRIBUTES.has(name)) add(issues, "svg.attribute", `${path}.svg`, `Disallowed SVG attribute '${name}'.`);
        if (/(?:javascript:|data:text\/html)/i.test(attributeValue)) add(issues, "svg.url", `${path}.svg`, "Unsafe SVG URL value.");
        if (name === "id") {
          if (svgIds.has(attributeValue)) add(issues, "svg.id.duplicate", `${path}.svg`, `SVG ID '${attributeValue}' is already used by ${svgIds.get(attributeValue)}.`);
          else svgIds.set(attributeValue, part.id);
        }
      }
      for (const reference of token[3].matchAll(/url\(\s*#([^\s)]+)\s*\)|(?:href|xlink:href)\s*=\s*["']#([^"']+)["']/gi)) svgReferences.push({ id: reference[1] || reference[2], path: `${path}.svg` });
      if (!selfClosing) stack.push(tag);
    }
    if (stack.length) add(issues, "svg.xml", `${path}.svg`, `Unclosed SVG element <${stack.at(-1)}>.`);
    if (!Array.isArray(part.namedGroups) || !part.namedGroups.length) add(issues, "part.groups", `${path}.namedGroups`, "At least one stable named SVG group is required.");
    for (const group of part.namedGroups || []) {
      if (!ID_PATTERN.test(group)) add(issues, "group.id", `${path}.namedGroups`, `Group ID '${group}' is not stable.`);
      if (groupIds.has(group)) add(issues, "group.id.duplicate", `${path}.namedGroups`, `Group ID '${group}' is duplicated in the package.`);
      groupIds.add(group);
      const escaped = group.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (!new RegExp(`<g\\b[^>]*\\bid=["']${escaped}["']`, "i").test(part.svg)) add(issues, "group.missing", `${path}.svg`, `SVG does not contain named group '${group}'.`);
    }
    if (!Number.isFinite(part.layerOrder)) add(issues, "part.layer", `${path}.layerOrder`, "Layer order must be a finite number.");
    const points = geometryPoints(part.svg);
    if (!points.length) add(issues, "geometry.empty", `${path}.svg`, "Part has no detectable visible geometry.");
    if (points.some((point) => point.x < part.viewBox.x - part.viewBox.width * .25 || point.x > part.viewBox.x + part.viewBox.width * 1.25 || point.y < part.viewBox.y - part.viewBox.height * .25 || point.y > part.viewBox.y + part.viewBox.height * 1.25)) add(issues, "geometry.bounds", `${path}.svg`, "Part geometry extends far outside its viewBox.");
    if (part.attachment && !points.some((point) => Math.hypot(point.x - part.attachment!.anchor.x, point.y - part.attachment!.anchor.y) <= 32)) add(issues, "attachment.geometry", `${path}.attachment.anchor`, "No visible geometry exists within 32px of the part attachment anchor.");
    if (part.groundContacts) {
      if (!Array.isArray(part.groundContacts) || !part.groundContacts.length) add(issues, "ground.contacts", `${path}.groundContacts`, "Ground contacts must contain at least one local paw/foot point.");
      else for (const [contactIndex, contact] of part.groundContacts.entries()) if (!finitePoint(contact)) add(issues, "ground.contact", `${path}.groundContacts[${contactIndex}]`, "Ground contact coordinates must be finite.");
    }
    if (part.attachment?.profile) {
      const profile = part.attachment.profile;
      if (!finitePoint(profile.opposingNormal) || Math.hypot(profile.opposingNormal.x, profile.opposingNormal.y) < .001) add(issues, "attachment.profile.normal", `${path}.attachment.profile.opposingNormal`, "Attachment opposing normal must be a finite non-zero vector.");
      validatePositive(issues, profile.seamWidth, "attachment.profile.width", `${path}.attachment.profile.seamWidth`, "Attachment seam width");
      validatePositive(issues, profile.neutralConnectionDepth, "attachment.profile.overlap", `${path}.attachment.profile.neutralConnectionDepth`, "Neutral connection depth");
    }
    if (part.depthGroups) {
      const { farGroupId, nearGroupId } = part.depthGroups;
      if (part.category !== "forelimbs" && part.category !== "hindlimbs") add(issues, "depth.category", `${path}.depthGroups`, "Depth groups are only valid on forelimb or hindlimb parts.");
      if (farGroupId === nearGroupId) add(issues, "depth.distinct", `${path}.depthGroups`, "Far and near depth group IDs must be distinct.");
      for (const [key, id] of [["farGroupId", farGroupId], ["nearGroupId", nearGroupId]] as const) {
        const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const count = [...part.svg.matchAll(new RegExp(`<g\\b[^>]*\\bid=["']${escaped}["']`, "gi"))].length;
        if (count !== 1) add(issues, "depth.group", `${path}.depthGroups.${key}`, `Depth group '${id}' must exist exactly once in the part SVG.`);
        if (!part.namedGroups.includes(id)) add(issues, "depth.named", `${path}.namedGroups`, `Depth group '${id}' must be declared as a named group.`);
      }
      const stack: string[] = [];
      let defsDepth = 0;
      for (const token of part.svg.matchAll(/<\s*(\/?)\s*([A-Za-z][\w:-]*)([^>]*)>/g)) {
        const closing = Boolean(token[1]); const tag = token[2].toLowerCase(); const selfClosing = /\/\s*$/.test(token[3]);
        if (closing) { if (tag === "g") stack.pop(); if (tag === "defs") defsDepth = Math.max(0, defsDepth - 1); continue; }
        const id = token[3].match(/\bid\s*=\s*["']([^"']+)["']/i)?.[1];
        if (tag === "g") stack.push(id || "");
        if (tag === "defs") defsDepth++;
        if (["path", "circle", "rect", "ellipse", "polygon", "polyline", "line"].includes(tag) && defsDepth === 0 && !stack.includes(farGroupId) && !stack.includes(nearGroupId)) add(issues, "depth.geometry", `${path}.svg`, "Visible limb geometry must be nested under the declared far or near group.");
        if (selfClosing && tag === "g") stack.pop();
        if (selfClosing && tag === "defs") defsDepth = Math.max(0, defsDepth - 1);
      }
    }
  }
  for (const reference of svgReferences) if (!svgIds.has(reference.id)) add(issues, "svg.reference", reference.path, `SVG reference '#${reference.id}' does not resolve inside this package.`);
  if (value.rig) {
    const rigValidation = validateRigDefinition(value.rig, svgIds.keys());
    for (const rigIssue of rigValidation.issues) add(issues, rigIssue.code, rigIssue.path, rigIssue.message);
    for (const [index, joint] of value.rig.joints.entries()) if (!partIds.has(joint.partId)) add(issues, "joint.part", `rig.joints[${index}].partId`, `Joint part '${joint.partId}' does not exist in this package.`);
  }

  const socketIds = new Set<string>();
  for (const [index, socket] of sockets.entries()) {
    const path = `sockets[${index}]`;
    if (!ID_PATTERN.test(socket.id)) add(issues, "socket.id", `${path}.id`, "Socket ID must be a stable lowercase ID.");
    if (socketIds.has(socket.id)) add(issues, "socket.id.duplicate", `${path}.id`, `Duplicate socket ID '${socket.id}'.`);
    socketIds.add(socket.id);
    if (!partIds.has(socket.ownerPartId)) add(issues, "socket.owner", `${path}.ownerPartId`, `Socket owner '${socket.ownerPartId}' does not exist.`);
    if (!Array.isArray(socket.accepts) || socket.accepts.length !== 1 || socket.accepts[0] !== socket.category) add(issues, "socket.strict", `${path}.accepts`, "A Version 1 socket must accept only its strict anatomical category.");
    if (!socket.anchor || !Number.isFinite(socket.anchor.x) || !Number.isFinite(socket.anchor.y)) add(issues, "socket.anchor", `${path}.anchor`, "Socket anchor must contain finite x and y coordinates.");
    if (socket.profile) {
      const profile = socket.profile;
      if (!finitePoint(profile.outwardNormal) || Math.hypot(profile.outwardNormal.x, profile.outwardNormal.y) < .001) add(issues, "socket.profile.normal", `${path}.profile.outwardNormal`, "Socket outward normal must be a finite non-zero vector.");
      validatePositive(issues, profile.seamWidth, "socket.profile.width", `${path}.profile.seamWidth`, "Socket seam width");
      validatePositive(issues, profile.minimumOverlap, "socket.profile.overlap", `${path}.profile.minimumOverlap`, "Minimum overlap");
      validatePositive(issues, profile.allowedScale?.min, "socket.profile.scale", `${path}.profile.allowedScale.min`, "Minimum allowed scale");
      validatePositive(issues, profile.allowedScale?.max, "socket.profile.scale", `${path}.profile.allowedScale.max`, "Maximum allowed scale");
      if (Number.isFinite(profile.allowedScale?.min) && Number.isFinite(profile.allowedScale?.max) && profile.allowedScale.min > profile.allowedScale.max) add(issues, "socket.profile.scale.order", `${path}.profile.allowedScale`, "Allowed scale minimum cannot exceed maximum.");
    }
  }

  for (const [index, part] of parts.entries()) {
    if (part.id === value.centralSkeleton?.rootPartId) continue;
    const path = `parts[${index}].attachment`;
    if (!part.attachment) { add(issues, "attachment.missing", path, `Part '${part.id}' must attach to a socket.`); continue; }
    const socket = sockets.find((item) => item.id === part.attachment!.socketId);
    if (!socket) add(issues, "attachment.socket", `${path}.socketId`, `Socket '${part.attachment.socketId}' does not exist.`);
    else if (socket.category !== part.category || !socket.accepts.includes(part.category)) add(issues, "attachment.category", path, `A ${part.category} part cannot attach to a ${socket.category} socket.`);
    if (!Number.isFinite(part.attachment.anchor.x) || !Number.isFinite(part.attachment.anchor.y)) add(issues, "attachment.anchor", `${path}.anchor`, "Part attachment anchor must contain finite x and y coordinates.");
  }

  const root = parts.find((part) => part.id === value.centralSkeleton?.rootPartId);
  if (!root) add(issues, "skeleton.root", "centralSkeleton.rootPartId", "Central skeleton root part does not exist.");
  else if (template && root.category !== template.rootCategory) add(issues, "skeleton.category", "centralSkeleton.rootPartId", `The ${template.id} root must be ${template.rootCategory}.`);
  if (root) {
    const rootPoints = geometryPoints(root.svg);
    for (const [index, socket] of sockets.entries()) {
      if (socket.ownerPartId === root.id && !rootPoints.some((point) => Math.hypot(point.x - socket.anchor.x, point.y - socket.anchor.y) <= 32)) add(issues, "socket.geometry", `sockets[${index}].anchor`, `No visible ${root.name} geometry exists within 32px of the ${socket.name} socket.`);
    }
  }

  if (template) {
    const allowedParts = new Set(template.parts.map((rule) => rule.category));
    const allowedSockets = new Set(template.sockets.map((rule) => rule.category));
    for (const part of parts) if (!allowedParts.has(part.category)) add(issues, "template.part.unexpected", "parts", `${part.category} is not valid for the ${template.id} template.`);
    for (const socket of sockets) if (!allowedSockets.has(socket.category)) add(issues, "template.socket.unexpected", "sockets", `${socket.category} is not valid for the ${template.id} template.`);
    for (const rule of template.parts) {
      const count = countByCategory(parts, rule.category);
      if (count < rule.min || count > rule.max) add(issues, "template.part.count", "parts", `${template.label} requires ${rule.min === rule.max ? rule.min : `${rule.min}-${rule.max}`} ${rule.category} part(s); found ${count}.`);
    }
    for (const rule of template.sockets) {
      const count = countByCategory(sockets, rule.category);
      if (count < rule.min || count > rule.max) add(issues, "template.socket.count", "sockets", `${template.label} requires ${rule.min === rule.max ? rule.min : `${rule.min}-${rule.max}`} ${rule.category} socket(s); found ${count}.`);
    }
  }

  return { valid: issues.length === 0, issues };
}

export function assertPublishableAnimalPackageV1(candidate: unknown): asserts candidate is AnimalPackageV1 {
  const result = validateAnimalPackageV1(candidate);
  if (!result.valid) throw new Error(`Animal package cannot be published:\n${result.issues.map((item) => `${item.path}: ${item.message}`).join("\n")}`);
}
