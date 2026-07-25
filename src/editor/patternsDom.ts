import { flattenPathToPolygon } from "./pathWarp";
import { generatePattern, type PatternOptions } from "./patterns";
import type { RampToken } from "../generation/palette";
import type { Point } from "./transform";

/**
 * The DOM half of `patterns.ts`: finds the host shape, reads its outline, and inserts or
 * replaces the generated pattern group. Split out so the geometry stays testable under
 * `node --test`, which has no DOM.
 */

function parseFragment(svg: string) {
  const parser = new DOMParser();
  const document = parser.parseFromString(`<g id="pattern-fragment-root">${svg}</g>`, "image/svg+xml");
  if (document.querySelector("parsererror")) throw new Error("SVG fragment is not valid XML.");
  return document;
}

const innerSvg = (document: Document) =>
  [...document.documentElement.childNodes].map((node) => new XMLSerializer().serializeToString(node)).join("");

const num = (element: Element, name: string, fallback = 0) => {
  const value = parseFloat(element.getAttribute(name) ?? "");
  return Number.isFinite(value) ? value : fallback;
};

const ellipseOutline = (cx: number, cy: number, rx: number, ry: number): Point[] =>
  Array.from({ length: 24 }, (_, i) => {
    const angle = (i / 24) * Math.PI * 2;
    return { x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry };
  });

/** The host's silhouette as a polygon, whatever primitive drew it. */
export function outlineOfElement(element: Element): Point[] {
  const tag = element.tagName.toLowerCase();
  if (tag === "path") return flattenPathToPolygon(element.getAttribute("d") ?? "");
  if (tag === "circle") return ellipseOutline(num(element, "cx"), num(element, "cy"), num(element, "r"), num(element, "r"));
  if (tag === "ellipse") return ellipseOutline(num(element, "cx"), num(element, "cy"), num(element, "rx"), num(element, "ry"));
  if (tag === "rect") {
    const x = num(element, "x");
    const y = num(element, "y");
    const w = num(element, "width");
    const h = num(element, "height");
    return [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
  }
  if (tag === "polygon" || tag === "polyline") {
    const numbers = (element.getAttribute("points") ?? "").match(/-?\d*\.?\d+/g)?.map(Number) ?? [];
    const points: Point[] = [];
    for (let i = 0; i + 1 < numbers.length; i += 2) points.push({ x: numbers[i], y: numbers[i + 1] });
    return points;
  }
  return [];
}

const findById = (document: Document, id: string) =>
  [...document.querySelectorAll("[id]")].find((candidate) => candidate.id === id);

/**
 * Apply a coat pattern clipped to one shape.
 *
 * The group is inserted as the host's next sibling, so it paints over the host but under
 * anything drawn later — eyes and other detail stay on top. Re-applying replaces the
 * previous group for the same host rather than stacking, so dragging the sliders does not
 * accumulate layers.
 */
export function applyPatternToShape(
  svg: string,
  hostId: string,
  options: PatternOptions,
): { svg: string; markCount: number } {
  if (!svg.trim() || typeof DOMParser === "undefined") return { svg, markCount: 0 };
  const document = parseFragment(svg);
  const host = findById(document, hostId);
  if (!host) return { svg, markCount: 0 };

  const existing = host.parentElement?.querySelector(`[data-pattern-for="${CSS?.escape ? CSS.escape(hostId) : hostId}"]`);
  existing?.remove();

  const outline = outlineOfElement(host);
  const markup = generatePattern(outline, options);
  if (!markup) return { svg: innerSvg(document), markCount: 0 };

  const holder = parseFragment(markup).documentElement.firstElementChild;
  if (!holder) return { svg: innerSvg(document), markCount: 0 };
  holder.setAttribute("data-pattern-for", hostId);
  holder.setAttribute("data-name", `${options.kind} on ${host.getAttribute("data-name") || hostId}`);
  host.parentElement?.insertBefore(holder, host.nextSibling);

  return { svg: innerSvg(document), markCount: holder.children.length };
}

/** Remove the pattern attached to a shape, if any. */
export function removePatternFromShape(svg: string, hostId: string): string {
  if (!svg.trim() || typeof DOMParser === "undefined") return svg;
  const document = parseFragment(svg);
  [...document.querySelectorAll("[data-pattern-for]")]
    .filter((node) => node.getAttribute("data-pattern-for") === hostId)
    .forEach((node) => node.remove());
  return innerSvg(document);
}

/**
 * Repaint a shape with a ramp token.
 *
 * Tokens rather than hex on purpose: a literal colour makes the part permanently
 * un-recolourable once it is combined into a hybrid, and raises `palette.rawHex` in the
 * validator. Writing the token keeps the part tintable by whatever primary/accent the
 * creature ends up with.
 */
export function setShapeToken(
  svg: string,
  id: string,
  token: RampToken,
  channel: "fill" | "stroke" = "fill",
): string {
  if (!svg.trim() || typeof DOMParser === "undefined") return svg;
  const document = parseFragment(svg);
  const element = findById(document, id);
  if (!element) return svg;
  element.setAttribute(channel, token);
  return innerSvg(document);
}
