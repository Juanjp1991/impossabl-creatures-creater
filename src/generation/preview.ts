import type { AnimalDraft } from "./contracts";
import type { AnimalPartType } from "../types";
import { analyzeDraftGeometry } from "./geometry";
import { applyRamp, resolveRamp } from "./palette";

const escapeAttr = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
// Resolve the whole shared ramp (primary/accent plus the derived steps and fixed neutrals),
// so a part painted in primary-dark or the outline token renders identically for every species.
const colourize = (svg: string, draft: AnimalDraft) => applyRamp(svg, resolveRamp(draft.color, draft.accentColor));

export interface SvgDepthLayers {
  far: string;
  near: string;
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function hideSvgGroup(svg: string, groupId: string): string | undefined {
  const group = new RegExp(`<g\\b(?=[^>]*\\bid\\s*=\\s*["']${escapeRegExp(groupId)}["'])[^>]*>`, "i");
  if (!group.test(svg)) return undefined;
  return svg.replace(group, (tag) => {
    if (/\bdisplay\s*=\s*["'][^"']*["']/i.test(tag)) return tag.replace(/\bdisplay\s*=\s*["'][^"']*["']/i, `display="none"`);
    return tag.replace(/>$/, ` display="none">`);
  });
}

/**
 * Produces two complete copies of a limb SVG while hiding the opposite semantic
 * depth group in each copy. Keeping the complete wrapper preserves transforms,
 * masks, gradients and coordinate-normalization inherited from ancestor groups.
 */
export function splitSvgDepthLayers(svg: string, depthGroups?: { farGroupId: string; nearGroupId: string }): SvgDepthLayers | undefined {
  if (!depthGroups) return undefined;
  const far = hideSvgGroup(svg, depthGroups.nearGroupId);
  const near = hideSvgGroup(svg, depthGroups.farGroupId);
  return far && near ? { far, near } : undefined;
}

export function buildAssembledPreviewSvg(draft: AnimalDraft, diagnostic = false): string {
  const origin = { x: 150, y: 150 };
  const targets = {
    neck: { x: origin.x + draft.bodyConnections.neck.x, y: origin.y + draft.bodyConnections.neck.y },
    tail: { x: origin.x + draft.bodyConnections.tail.x, y: origin.y + draft.bodyConnections.tail.y },
    frontLegs: { x: origin.x + draft.bodyConnections.frontLegs.x, y: origin.y + draft.bodyConnections.frontLegs.y },
    backLegs: { x: origin.x + draft.bodyConnections.backLegs.x, y: origin.y + draft.bodyConnections.backLegs.y },
  };
  const transforms = {
    body: `translate(${origin.x} ${origin.y})`,
    head: `translate(${targets.neck.x - 120} ${targets.neck.y - 110})`,
    tail: `translate(${targets.tail.x - 15} ${targets.tail.y - 15})`,
    frontLegs: `translate(${targets.frontLegs.x - 75} ${targets.frontLegs.y - 15})`,
    backLegs: `translate(${targets.backLegs.x - 195} ${targets.backLegs.y - 15})`,
  };
  const geometry = analyzeDraftGeometry(draft);
  const groundLine = geometry.groundY;
  const bounds = diagnostic ? `<g fill="none" stroke="#00d4ff" stroke-width="1" stroke-dasharray="5 4" opacity=".8">${Object.values(geometry.parts).filter((part) => part.bounds).map((part) => `<rect x="${part.bounds!.x}" y="${part.bounds!.y}" width="${part.bounds!.width}" height="${part.bounds!.height}"/>`).join("")}${geometry.seams.map((seam) => { const target = targets[seam.part === "head" ? "neck" : seam.part]; return `<rect x="${target.x - 9}" y="${target.y - 9}" width="18" height="18" stroke="${seam.jointZoneOverlapPixels >= 40 ? "#22c55e" : "#ef4444"}"/>`; }).join("")}</g>` : "";
  const anchors = diagnostic ? `<g font-family="monospace" font-size="9" stroke="#111" stroke-width="1">${Object.entries(targets).map(([name, point]) => `<circle cx="${point.x}" cy="${point.y}" r="6" fill="#ff3d9a"/><text x="${point.x + 8}" y="${point.y - 6}" fill="#ff3d9a" stroke="none">${name}</text>`).join("")}</g>` : "";
  const frontLayers = splitSvgDepthLayers(draft.frontLegsSvg, draft.layoutMetadata?.depthGroups.frontLegs);
  const backLayers = splitSvgDepthLayers(draft.backLegsSvg, draft.layoutMetadata?.depthGroups.backLegs);
  const layer = (id: string, transform: string, svg: string) => `<g id="${id}" transform="${transform}">${colourize(svg, draft)}</g>`;
  const behindBody = [
    layer("preview-tail", transforms.tail, draft.tailSvg),
    layer(backLayers ? "preview-backLegs-far" : "preview-backLegs", transforms.backLegs, backLayers?.far ?? draft.backLegsSvg),
    ...(frontLayers ? [layer("preview-frontLegs-far", transforms.frontLegs, frontLayers.far)] : []),
  ].join("");
  const inFrontOfBody = [
    ...(backLayers ? [layer("preview-backLegs-near", transforms.backLegs, backLayers.near)] : []),
    layer(frontLayers ? "preview-frontLegs-near" : "preview-frontLegs", transforms.frontLegs, frontLayers?.near ?? draft.frontLegsSvg),
    layer("preview-head", transforms.head, draft.headSvg),
  ].join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 600 500" width="600" height="500" style="--primary:${escapeAttr(draft.color)};--accent:${escapeAttr(draft.accentColor)}"><rect width="600" height="500" fill="#fafafa"/><line x1="0" y1="${groundLine}" x2="600" y2="${groundLine}" stroke="#bbb" stroke-dasharray="4 4" data-derived-ground="true"/>${behindBody}${layer("preview-body", transforms.body, draft.bodySvg)}${inFrontOfBody}${bounds}${anchors}</svg>`;
}

export function buildJointCropSvg(draft: AnimalDraft, part: Exclude<keyof AnimalDraft["bodyConnections"], never>): string {
  const connection = draft.bodyConnections[part];
  const target = { x: 150 + connection.x, y: 150 + connection.y };
  return buildAssembledPreviewSvg(draft, true).replace(/viewBox="0 0 600 500"/, `viewBox="${target.x - 55} ${target.y - 55} 110 110"`);
}

export function buildIsolatedPartPreviewSvg(draft: AnimalDraft, part: AnimalPartType): string {
  const views = { head: [160, 160], body: [300, 220], frontLegs: [260, 180], backLegs: [260, 180], tail: [160, 160] } as const;
  const fields = { head: "headSvg", body: "bodySvg", frontLegs: "frontLegsSvg", backLegs: "backLegsSvg", tail: "tailSvg" } as const;
  const [width, height] = views[part];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" style="--primary:${escapeAttr(draft.color)};--accent:${escapeAttr(draft.accentColor)}"><rect width="${width}" height="${height}" fill="#fafafa"/>${colourize(draft[fields[part]], draft)}</svg>`;
}

function normalizeSvgForImage(svg: string): string {
  const parser = new DOMParser();
  const parsed = parser.parseFromString(svg, "image/svg+xml");
  let root: Element = parsed.documentElement;
  if (parsed.querySelector("parsererror") || root.tagName.toLowerCase() !== "svg") {
    // The HTML parser safely recovers common model mistakes such as an unescaped
    // text entity while the technical validator/repair loop still owns acceptance.
    const template = document.createElement("template");
    template.innerHTML = svg;
    const recovered = template.content.querySelector("svg");
    if (!recovered) throw new Error("Generated preview is not valid SVG XML.");
    root = recovered;
  }
  root.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  root.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  return new XMLSerializer().serializeToString(root);
}

function svgDataUrl(svg: string): string {
  const bytes = new TextEncoder().encode(svg);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}

async function loadSvgImage(sources: string[]): Promise<HTMLImageElement> {
  let lastError: unknown;
  for (const source of sources) {
    const image = new Image();
    try {
      await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("Chrome rejected the SVG image source.")); image.src = source; });
      return image;
    } catch (error) { lastError = error; }
  }
  throw lastError instanceof Error ? lastError : new Error("Could not render SVG preview.");
}

export async function renderSvgToPngDataUrl(svg: string, width = 600, height = 500): Promise<string> {
  const normalized = normalizeSvgForImage(svg);
  const blobUrl = URL.createObjectURL(new Blob([normalized], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = await loadSvgImage([blobUrl, svgDataUrl(normalized)]);
    const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d"); if (!context) throw new Error("Canvas preview rendering is unavailable.");
    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL("image/png");
  } finally { URL.revokeObjectURL(blobUrl); }
}
