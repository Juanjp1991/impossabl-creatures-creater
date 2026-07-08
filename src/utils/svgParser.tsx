import React from "react";

const ALLOWED_TAGS = new Set([
  "svg",
  "g",
  "path",
  "circle",
  "rect",
  "ellipse",
  "polygon",
  "polyline",
  "line",
  "defs",
  "lineargradient",
  "stop",
  "filter",
  "fedropshadow"
]);

const ATTRIBUTE_MAP: Record<string, string> = {
  class: "className",
  "stroke-width": "strokeWidth",
  "stroke-linecap": "strokeLinecap",
  "stroke-linejoin": "strokeLinejoin",
  "stroke-dasharray": "strokeDasharray",
  "stop-color": "stopColor",
  "stop-opacity": "stopOpacity",
  "flood-color": "floodColor",
  "flood-opacity": "floodOpacity",
  stddeviation: "stdDeviation",
  floodopacity: "floodOpacity",
  dx: "dx",
  dy: "dy",
  cx: "cx",
  cy: "cy",
  rx: "rx",
  ry: "ry",
  r: "r",
  x1: "x1",
  y1: "y1",
  x2: "x2",
  y2: "y2",
  offset: "offset",
  fill: "fill",
  stroke: "stroke"
};

function camelCaseAttribute(attr: string): string {
  const lower = attr.toLowerCase();
  if (ATTRIBUTE_MAP[lower]) return ATTRIBUTE_MAP[lower];
  return attr.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
}

/**
 * Interface representing a transformed shape inside an SVG part.
 */
export interface ShapeTransform {
  translateX: number;
  translateY: number;
  rotate: number;
  scale: number;
  fill?: string;
}

export interface SvgShapeInfo {
  index: number;
  tagName: string;
  fill?: string;
  stroke?: string;
  id?: string;
  d?: string;
}

/**
 * Extract a list of all adjustable shapes inside an SVG string
 */
export function getSvgShapes(svgString: string): SvgShapeInfo[] {
  if (!svgString) return [];
  try {
    const parser = new DOMParser();
    const wrappedString = `<g>${svgString}</g>`;
    const doc = parser.parseFromString(wrappedString, "image/svg+xml");
    
    const shapes: SvgShapeInfo[] = [];
    let shapeCounter = 0;

    function traverse(node: Element) {
      const tagName = node.tagName.toLowerCase();
      // Only include tags that can be selected/adjusted by user
      const isAdjustableShape = ["path", "circle", "rect", "ellipse", "polygon", "polyline", "line", "g"].includes(tagName);
      
      if (ALLOWED_TAGS.has(tagName) && isAdjustableShape) {
        shapes.push({
          index: shapeCounter++,
          tagName: node.tagName,
          fill: node.getAttribute("fill") || undefined,
          stroke: node.getAttribute("stroke") || undefined,
          id: node.getAttribute("id") || undefined,
          d: node.getAttribute("d") || undefined
        });
      }
      
      node.childNodes.forEach((child) => {
        if (child.nodeType === Node.ELEMENT_NODE) {
          traverse(child as Element);
        }
      });
    }

    const rootElement = doc.documentElement;
    traverse(rootElement);
    return shapes;
  } catch (err) {
    console.error("Failed to extract SVG shapes:", err);
    return [];
  }
}

function parseStyleString(styleStr: string): Record<string, string> {
  const styles: Record<string, string> = {};
  if (!styleStr) return styles;
  const declarations = styleStr.split(";");
  for (const declaration of declarations) {
    const trimmed = declaration.trim();
    if (!trimmed) continue;
    const colonIndex = trimmed.indexOf(":");
    if (colonIndex === -1) continue;
    const property = trimmed.substring(0, colonIndex).trim();
    const value = trimmed.substring(colonIndex + 1).trim();
    
    let camelProperty = property;
    if (!property.startsWith("--")) {
      camelProperty = property.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
    }
    styles[camelProperty] = value;
  }
  return styles;
}

/**
 * Safely parses an SVG string into React Elements.
 * Replaces primary/accent placeholders with dynamic user colors.
 * Applies individual shape transforms and custom highlight styles if specified.
 */
export function parseSvgToReact(
  svgString: string,
  colors?: { color?: string; accentColor?: string },
  originalColor?: string,
  originalAccentColor?: string,
  shapeTransforms?: Record<number, ShapeTransform>,
  highlightedShapeIndex?: number
): React.ReactNode {
  if (!svgString) return null;

  let shapeCounter = 0;

  try {
    const parser = new DOMParser();
    // Wrap in a group to make sure it's valid XML even if it's a bare fragment
    const wrappedString = `<g>${svgString}</g>`;
    const doc = parser.parseFromString(wrappedString, "image/svg+xml");
    const errorNode = doc.querySelector("parsererror");
    if (errorNode) {
      console.warn("SVG Parsing warning (trying fallback parsing):", errorNode.textContent);
    }
    
    const rootElement = doc.documentElement;
    return renderElement(rootElement, 0);
  } catch (err) {
    console.error("Failed to parse SVG string:", err);
    return null;
  }

  function renderElement(node: Element, index: number): React.ReactNode {
    const tagName = node.tagName.toLowerCase();
    
    // Check if tag is allowed for security
    if (!ALLOWED_TAGS.has(tagName) && tagName !== "parsererror") {
      return null;
    }

    const isAdjustableShape = ["path", "circle", "rect", "ellipse", "polygon", "polyline", "line", "g"].includes(tagName);
    const currentShapeIndex = isAdjustableShape ? shapeCounter++ : -1;

    const props: any = { key: `svg-node-${index}` };
    
    // Copy and adapt attributes
    for (let i = 0; i < node.attributes.length; i++) {
      const attr = node.attributes[i];
      let value = attr.value;
      
      // Dynamic color replacement
      if (colors) {
        // Case-insensitive checks for keywords or exact hex match
        const valLower = value.toLowerCase();
        
        if (valLower === "primary" || valLower === "var(--primary)") {
          value = colors.color || "#cccccc";
        } else if (valLower === "accent" || valLower === "var(--accent)") {
          value = colors.accentColor || "#ffaa00";
        } else {
          // Replace matching hex colors with dynamic colors
          if (originalColor && valLower === originalColor.toLowerCase()) {
            value = colors.color || "#cccccc";
          }
          if (originalAccentColor && valLower === originalAccentColor.toLowerCase()) {
            value = colors.accentColor || "#ffaa00";
          }
        }
      }

      const reactAttrName = camelCaseAttribute(attr.name);
      if (reactAttrName === "style") {
        props.style = parseStyleString(value);
      } else {
        props[reactAttrName] = value;
      }
    }

    // Apply shape-specific adjustment transforms if configured
    if (currentShapeIndex !== -1 && shapeTransforms && shapeTransforms[currentShapeIndex]) {
      const transform = shapeTransforms[currentShapeIndex];
      let tString = "";
      if (transform.translateX !== 0 || transform.translateY !== 0) {
        tString += `translate(${transform.translateX}, ${transform.translateY}) `;
      }
      if (transform.rotate !== 0) {
        tString += `rotate(${transform.rotate}) `;
      }
      if (transform.scale !== 1) {
        tString += `scale(${transform.scale}) `;
      }

      if (tString) {
        const existingTransform = props.transform || "";
        props.transform = existingTransform ? `${existingTransform} ${tString}`.trim() : tString.trim();
      }

      if (transform.fill) {
        props.fill = transform.fill;
      }
    }

    // Apply selective highlight styles if this shape is active
    if (currentShapeIndex !== -1 && currentShapeIndex === highlightedShapeIndex) {
      props.style = {
        ...(props.style || {}),
        filter: "drop-shadow(0 0 3px #f59e0b) drop-shadow(0 0 6px #f59e0b)",
        stroke: "#f59e0b",
        strokeWidth: props.strokeWidth ? parseFloat(props.strokeWidth) + 1.5 : 2,
        transition: "all 0.15s ease",
      };
    }

    // Recursively render children
    const children: React.ReactNode[] = [];
    node.childNodes.forEach((child, idx) => {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const rendered = renderElement(child as Element, idx);
        if (rendered) children.push(rendered);
      }
    });

    return React.createElement(tagName, props, children.length > 0 ? children : null);
  }
}
