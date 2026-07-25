import { bendPathData, bendPoint, hasBend, type BendOptions, type Bounds } from "./pathWarp";

/**
 * Applies a spine bend across every shape in a part.
 *
 * The DOM half of `pathWarp.ts`. Kept separate so the maths stays unit-testable under
 * `node --test`, which has no DOM — the same split `svgLayers.ts` uses.
 *
 * Non-path shapes are displaced rather than converted to paths: turning a circle into a
 * cubic to bend it would inflate the markup and cost the element-count headroom the whole
 * design is trying to protect. A displaced eye or nostril reads correctly; only a shape
 * spanning most of the bend would show the approximation, and those are drawn as paths.
 */

const POINT_LIST_TAGS = new Set(["polygon", "polyline"]);

function parseFragment(svg: string) {
  const parser = new DOMParser();
  const document = parser.parseFromString(`<g id="deform-fragment-root">${svg}</g>`, "image/svg+xml");
  if (document.querySelector("parsererror")) throw new Error("SVG fragment is not valid XML.");
  return document;
}

function innerSvg(document: Document) {
  return [...document.documentElement.childNodes]
    .map((node) => new XMLSerializer().serializeToString(node))
    .join("");
}

const num = (element: Element, name: string, fallback = 0) => {
  const value = parseFloat(element.getAttribute(name) ?? "");
  return Number.isFinite(value) ? value : fallback;
};

function bendElement(element: Element, bounds: Bounds, options: BendOptions) {
  const tag = element.tagName.toLowerCase();

  if (tag === "path") {
    const d = element.getAttribute("d");
    if (d) element.setAttribute("d", bendPathData(d, bounds, options));
    return;
  }

  if (tag === "circle" || tag === "ellipse") {
    const moved = bendPoint({ x: num(element, "cx"), y: num(element, "cy") }, bounds, options);
    element.setAttribute("cx", String(Math.round(moved.x * 1000) / 1000));
    element.setAttribute("cy", String(Math.round(moved.y * 1000) / 1000));
    return;
  }

  if (tag === "rect") {
    // Displaced by its own centre, so a wide rect rides the curve rather than its corner.
    const x = num(element, "x");
    const y = num(element, "y");
    const centre = { x: x + num(element, "width") / 2, y: y + num(element, "height") / 2 };
    const moved = bendPoint(centre, bounds, options);
    element.setAttribute("x", String(Math.round((x + moved.x - centre.x) * 1000) / 1000));
    element.setAttribute("y", String(Math.round((y + moved.y - centre.y) * 1000) / 1000));
    return;
  }

  if (tag === "line") {
    for (const [xName, yName] of [["x1", "y1"], ["x2", "y2"]] as const) {
      const moved = bendPoint({ x: num(element, xName), y: num(element, yName) }, bounds, options);
      element.setAttribute(xName, String(Math.round(moved.x * 1000) / 1000));
      element.setAttribute(yName, String(Math.round(moved.y * 1000) / 1000));
    }
    return;
  }

  if (POINT_LIST_TAGS.has(tag)) {
    const raw = element.getAttribute("points") ?? "";
    const numbers = raw.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)?.map(Number) ?? [];
    const moved: string[] = [];
    for (let i = 0; i + 1 < numbers.length; i += 2) {
      const point = bendPoint({ x: numbers[i], y: numbers[i + 1] }, bounds, options);
      moved.push(`${Math.round(point.x * 1000) / 1000},${Math.round(point.y * 1000) / 1000}`);
    }
    if (moved.length) element.setAttribute("points", moved.join(" "));
  }
}

/**
 * Bend every drawable in a part's markup.
 *
 * `bounds` is the part's local view box (head 160x160, body 300x220, and so on), not a
 * measured bounding box — the fixed local views are what every part is authored against, so
 * the same slider setting bends any species' torso identically.
 */
export function bendPartSvg(svg: string, bounds: Bounds, options: BendOptions): string {
  if (!svg.trim() || typeof DOMParser === "undefined" || !hasBend(options)) return svg;
  const document = parseFragment(svg);
  const visit = (element: Element) => {
    bendElement(element, bounds, options);
    [...element.children].forEach(visit);
  };
  [...document.documentElement.children].forEach(visit);
  return innerSvg(document);
}
