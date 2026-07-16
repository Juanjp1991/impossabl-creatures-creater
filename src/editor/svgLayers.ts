import type { ShapeTransform } from "../utils/svgParser";

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

export function setSvgLayerTransform(svg: string, id: string, transform: ShapeTransform) {
  return updateLayer(svg, id, (element) => {
    const original = element.getAttribute("data-base-transform") ?? element.getAttribute("transform") ?? "";
    if (!element.hasAttribute("data-base-transform")) element.setAttribute("data-base-transform", original);
    if (!element.hasAttribute("data-base-fill")) element.setAttribute("data-base-fill", element.getAttribute("fill") ?? "");
    const px = transform.pivotX ?? 0;
    const py = transform.pivotY ?? 0;
    const scaleX = transform.scaleX ?? transform.scale;
    const scaleY = transform.scaleY ?? transform.scale;
    const editorTransform = [
      transform.translateX || transform.translateY ? `translate(${transform.translateX} ${transform.translateY})` : "",
      transform.rotate ? `rotate(${transform.rotate} ${px} ${py})` : "",
      scaleX !== 1 || scaleY !== 1 ? `translate(${px} ${py}) scale(${scaleX} ${scaleY}) translate(${-px} ${-py})` : "",
    ].filter(Boolean).join(" ");
    const combined = [original, editorTransform].filter(Boolean).join(" ");
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
  if (!svg.trim() || typeof DOMParser === "undefined") return { translateX: 0, translateY: 0, rotate: 0, scale: 1 };
  const document = parseFragment(svg);
  const element = [...document.querySelectorAll("[id]")].find((candidate) => candidate.id === id);
  try { return element?.getAttribute("data-editor-transform") ? JSON.parse(element.getAttribute("data-editor-transform")!) : { translateX: 0, translateY: 0, rotate: 0, scale: 1 }; }
  catch { return { translateX: 0, translateY: 0, rotate: 0, scale: 1 }; }
}
