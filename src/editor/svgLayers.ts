import { identityTransform, toSvgTransform, type PartTransform as ShapeTransform } from "./transform";
import { DENSITY_BANDS, visibleElementCount } from "../generation/metrics";
import { detailDensityProfile, type DetailLevel } from "../generation/detailDensity";
import type { AnimalPartType } from "../types";

export type LayerMove = "forward" | "backward" | "front" | "back";

export interface SvgLayerNode {
  id: string;
  name: string;
  tagName: string;
  visible: boolean;
  locked: boolean;
  children: SvgLayerNode[];
}

const EDITABLE_TAGS = new Set(["g", "path", "circle", "rect", "ellipse", "polygon", "polyline", "line"]);

export function stableSvgLayerId(partId: string, tagName: string, ordinal: number) {
  const clean = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "layer";
  return `${clean(partId)}-${clean(tagName)}-${ordinal + 1}`;
}

function parseFragment(svg: string) {
  const parser = new DOMParser();
  const document = parser.parseFromString(`<g id="editor-fragment-root">${svg}</g>`, "image/svg+xml");
  if (document.querySelector("parsererror")) throw new Error("SVG fragment is not valid XML.");
  return document;
}

function innerSvg(document: Document) {
  const root = document.documentElement;
  return [...root.childNodes].map((node) => new XMLSerializer().serializeToString(node)).join("");
}

export function ensureStableSvgLayerIds(svg: string, partId: string) {
  if (!svg.trim() || typeof DOMParser === "undefined") return svg;
  const document = parseFragment(svg);
  const used = new Set<string>();
  let ordinal = 0;
  const visit = (element: Element) => {
    const tag = element.tagName.toLowerCase();
    if (EDITABLE_TAGS.has(tag) && element.id !== "editor-fragment-root") {
      let id = element.getAttribute("id")?.trim() || stableSvgLayerId(partId, tag, ordinal);
      while (used.has(id)) id = `${stableSvgLayerId(partId, tag, ordinal)}-${used.size + 1}`;
      element.setAttribute("id", id);
      if (!element.hasAttribute("data-name")) element.setAttribute("data-name", element.getAttribute("aria-label") || `${tag} ${ordinal + 1}`);
      used.add(id);
      ordinal += 1;
    }
    [...element.children].forEach(visit);
  };
  visit(document.documentElement);
  return innerSvg(document);
}

export function getSvgLayerTree(svg: string): SvgLayerNode[] {
  if (!svg.trim() || typeof DOMParser === "undefined") return [];
  const document = parseFragment(svg);
  const read = (element: Element): SvgLayerNode[] => [...element.children].flatMap((child) => {
    const children = read(child);
    if (!EDITABLE_TAGS.has(child.tagName.toLowerCase())) return children;
    return [{
      id: child.id,
      name: child.getAttribute("data-name") || child.id,
      tagName: child.tagName.toLowerCase(),
      visible: child.getAttribute("display") !== "none",
      locked: child.getAttribute("data-locked") === "true",
      children,
    }];
  });
  return read(document.documentElement);
}

function updateLayer(svg: string, id: string, update: (element: Element) => void) {
  const document = parseFragment(svg);
  const element = [...document.querySelectorAll("[id]")].find((candidate) => candidate.id === id);
  if (!element) return svg;
  update(element);
  return innerSvg(document);
}

export function renameSvgLayer(svg: string, id: string, name: string) {
  return updateLayer(svg, id, (element) => element.setAttribute("data-name", name.trim() || id));
}

export function setSvgLayerVisibility(svg: string, id: string, visible: boolean) {
  return updateLayer(svg, id, (element) => visible ? element.removeAttribute("display") : element.setAttribute("display", "none"));
}

export function setSvgLayerLocked(svg: string, id: string, locked: boolean) {
  return updateLayer(svg, id, (element) => locked ? element.setAttribute("data-locked", "true") : element.removeAttribute("data-locked"));
}

export function moveSvgLayer(svg: string, id: string, direction: LayerMove) {
  return updateLayer(svg, id, (element) => {
    const parent = element.parentElement;
    if (!parent) return;
    if (direction === "front") parent.append(element);
    else if (direction === "back") parent.prepend(element);
    else if (direction === "forward" && element.nextElementSibling) parent.insertBefore(element.nextElementSibling, element);
    else if (direction === "backward" && element.previousElementSibling) parent.insertBefore(element, element.previousElementSibling);
  });
}

/**
 * How a duplication would sit against the part's element budget (`DENSITY_BANDS`).
 *
 * Reported rather than enforced: the bands are warnings in the validator, not errors, and a
 * deliberate 12-segment tail is a legitimate thing to build. Surfacing the number before the
 * click is cheaper than discovering it at save time.
 */
export function densityAfterDuplication(svg: string, part: AnimalPartType, added = 1, detailLevel?: DetailLevel) {
  const [min, max] = detailLevel ? detailDensityProfile(detailLevel).bands[part] : DENSITY_BANDS[part];
  const next = visibleElementCount(svg) + added;
  return { count: next, min, max, withinBand: next >= min && next <= max };
}

/**
 * Groups the pipeline requires to exist. Deleting one fails `group.required` and, for the
 * depth groups, breaks the layering that makes legs sit correctly around the torso — so the
 * editor refuses rather than letting the part be silently degraded.
 */
const PROTECTED_GROUP_IDS = new Set([
  "head-root", "body-root", "frontLegs-root", "backLegs-root", "tail-root",
  "frontLegs-far", "frontLegs-near", "backLegs-far", "backLegs-near",
  "front-left-leg", "front-right-leg", "back-left-leg", "back-right-leg",
  "front-left-limb", "front-right-limb", "back-left-limb", "back-right-limb",
  "front-left-foot", "front-right-foot", "back-left-foot", "back-right-foot",
]);

export const isProtectedLayer = (id: string) => PROTECTED_GROUP_IDS.has(id);

/**
 * Remove one shape, along with any coat pattern stencilled onto it — an orphaned pattern
 * group would otherwise keep painting the outline of a shape that no longer exists.
 */
export function deleteSvgLayer(svg: string, id: string): string {
  if (!svg.trim() || typeof DOMParser === "undefined" || isProtectedLayer(id)) return svg;
  const document = parseFragment(svg);
  const element = [...document.querySelectorAll("[id]")].find((candidate) => candidate.id === id);
  if (!element) return svg;
  [...document.querySelectorAll("[data-pattern-for]")]
    .filter((node) => node.getAttribute("data-pattern-for") === id)
    .forEach((node) => node.remove());
  element.remove();
  return innerSvg(document);
}

/** Every id already present, so a clone can be given one that does not collide. */
function usedIds(document: Document) {
  return new Set([...document.querySelectorAll("[id]")].map((element) => element.id));
}

function uniqueId(base: string, taken: Set<string>) {
  let candidate = `${base}-copy`;
  let counter = 2;
  while (taken.has(candidate)) candidate = `${base}-copy-${counter++}`;
  taken.add(candidate);
  return candidate;
}

/** Re-id a cloned subtree, so nested children stay unique too. */
function reidSubtree(element: Element, taken: Set<string>) {
  const rename = (node: Element) => {
    if (node.id) node.setAttribute("id", uniqueId(node.id, taken));
    [...node.children].forEach(rename);
  };
  rename(element);
}

/**
 * Clone a layer in place, nudged clear of the original so the copy is visible rather than
 * hidden exactly behind it.
 */
export function duplicateSvgLayer(svg: string, id: string, offset = 6): { svg: string; newId: string } {
  if (!svg.trim() || typeof DOMParser === "undefined") return { svg, newId: id };
  const document = parseFragment(svg);
  const element = [...document.querySelectorAll("[id]")].find((candidate) => candidate.id === id);
  if (!element) return { svg, newId: id };

  const taken = usedIds(document);
  const clone = element.cloneNode(true) as Element;
  reidSubtree(clone, taken);
  clone.setAttribute("data-name", `${element.getAttribute("data-name") || id} copy`);

  const existing = clone.getAttribute("transform") || "";
  clone.setAttribute("transform", `${existing} translate(${offset} ${offset})`.trim());

  element.parentElement?.insertBefore(clone, element.nextSibling);
  return { svg: innerSvg(document), newId: clone.id };
}

/**
 * Append a copy of a segment at the tip of the original, tapering slightly — the
 * scorpion-tail / tentacle / neck case, where a chain is grown one link at a time.
 *
 * Direction comes from the segment's own bounding box: the clone is shifted by a full box
 * length along whichever axis the segment is longer, which is the axis a chain runs along.
 * `getBBox` needs a live layout engine, so the caller passes the measured box in; that also
 * keeps this function testable without a DOM.
 */
export function extendChain(
  svg: string,
  id: string,
  bbox: { x: number; y: number; width: number; height: number },
  taper = 0.9,
): { svg: string; newId: string } {
  if (!svg.trim() || typeof DOMParser === "undefined") return { svg, newId: id };
  const document = parseFragment(svg);
  const element = [...document.querySelectorAll("[id]")].find((candidate) => candidate.id === id);
  if (!element) return { svg, newId: id };

  const taken = usedIds(document);
  const clone = element.cloneNode(true) as Element;
  reidSubtree(clone, taken);
  clone.setAttribute("data-name", `${element.getAttribute("data-name") || id} link`);

  const horizontal = bbox.width >= bbox.height;
  const stepX = horizontal ? bbox.width : 0;
  const stepY = horizontal ? 0 : bbox.height;
  // Taper about the joint end, so links stay attached as they shrink.
  const pivotX = horizontal ? bbox.x : bbox.x + bbox.width / 2;
  const pivotY = horizontal ? bbox.y + bbox.height / 2 : bbox.y;

  const existing = element.getAttribute("transform") || "";
  const link = toSvgTransform({
    translateX: stepX,
    translateY: stepY,
    rotate: 0,
    scale: taper,
    pivotX,
    pivotY,
  });
  clone.setAttribute("transform", [existing, link].filter(Boolean).join(" "));

  element.parentElement?.insertBefore(clone, element.nextSibling);
  return { svg: innerSvg(document), newId: clone.id };
}

export function setSvgLayerTransform(svg: string, id: string, transform: ShapeTransform) {
  return updateLayer(svg, id, (element) => {
    const original = element.getAttribute("data-base-transform") ?? element.getAttribute("transform") ?? "";
    if (!element.hasAttribute("data-base-transform")) element.setAttribute("data-base-transform", original);
    if (!element.hasAttribute("data-base-fill")) element.setAttribute("data-base-fill", element.getAttribute("fill") ?? "");
    const combined = [original, toSvgTransform(transform)].filter(Boolean).join(" ");
    if (combined) element.setAttribute("transform", combined); else element.removeAttribute("transform");
    element.setAttribute("data-editor-transform", JSON.stringify(transform));
    if (transform.fill) element.setAttribute("fill", transform.fill);
    else {
      const baseFill = element.getAttribute("data-base-fill") || "";
      if (baseFill) element.setAttribute("fill", baseFill); else element.removeAttribute("fill");
    }
  });
}

export function resetSvgLayerTransform(svg: string, id: string) {
  return updateLayer(svg, id, (element) => {
    const baseTransform = element.getAttribute("data-base-transform") || "";
    const baseFill = element.getAttribute("data-base-fill") || "";
    if (baseTransform) element.setAttribute("transform", baseTransform); else element.removeAttribute("transform");
    if (baseFill) element.setAttribute("fill", baseFill); else element.removeAttribute("fill");
    element.removeAttribute("data-base-transform");
    element.removeAttribute("data-base-fill");
    element.removeAttribute("data-editor-transform");
  });
}

export function getSvgLayerTransform(svg: string, id: string): ShapeTransform {
  if (!svg.trim() || typeof DOMParser === "undefined") return identityTransform();
  const document = parseFragment(svg);
  const element = [...document.querySelectorAll("[id]")].find((candidate) => candidate.id === id);
  try { return element?.getAttribute("data-editor-transform") ? JSON.parse(element.getAttribute("data-editor-transform")!) : identityTransform(); }
  catch { return identityTransform(); }
}
