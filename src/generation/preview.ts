import type { AnimalDraft } from "./contracts";

const escapeAttr = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
const colourize = (svg: string, draft: AnimalDraft) => svg.replace(/(["'])primary\1/gi, `"${escapeAttr(draft.color)}"`).replace(/(["'])accent\1/gi, `"${escapeAttr(draft.accentColor)}"`);

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
  const bounds = diagnostic ? `<g fill="none" stroke="#00d4ff" stroke-width="1" stroke-dasharray="5 4" opacity=".8"><rect x="${targets.neck.x - 120}" y="${targets.neck.y - 110}" width="160" height="160"/><rect x="150" y="150" width="300" height="220"/><rect x="${targets.frontLegs.x - 75}" y="${targets.frontLegs.y - 15}" width="260" height="180"/><rect x="${targets.backLegs.x - 195}" y="${targets.backLegs.y - 15}" width="260" height="180"/><rect x="${targets.tail.x - 15}" y="${targets.tail.y - 15}" width="160" height="160"/></g>` : "";
  const anchors = diagnostic ? `<g font-family="monospace" font-size="9" stroke="#111" stroke-width="1">${Object.entries(targets).map(([name, point]) => `<circle cx="${point.x}" cy="${point.y}" r="6" fill="#ff3d9a"/><text x="${point.x + 8}" y="${point.y - 6}" fill="#ff3d9a" stroke="none">${name}</text>`).join("")}</g>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 600 500" width="600" height="500"><rect width="600" height="500" fill="#fafafa"/><line x1="0" y1="350" x2="600" y2="350" stroke="#bbb" stroke-dasharray="4 4"/><g id="preview-tail" transform="${transforms.tail}">${colourize(draft.tailSvg, draft)}</g><g id="preview-backLegs" transform="${transforms.backLegs}">${colourize(draft.backLegsSvg, draft)}</g><g id="preview-body" transform="${transforms.body}">${colourize(draft.bodySvg, draft)}</g><g id="preview-frontLegs" transform="${transforms.frontLegs}">${colourize(draft.frontLegsSvg, draft)}</g><g id="preview-head" transform="${transforms.head}">${colourize(draft.headSvg, draft)}</g>${bounds}${anchors}</svg>`;
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

export async function renderSvgToPngDataUrl(svg: string): Promise<string> {
  const normalized = normalizeSvgForImage(svg);
  const blobUrl = URL.createObjectURL(new Blob([normalized], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = await loadSvgImage([blobUrl, svgDataUrl(normalized)]);
    const canvas = document.createElement("canvas"); canvas.width = 600; canvas.height = 500;
    const context = canvas.getContext("2d"); if (!context) throw new Error("Canvas preview rendering is unavailable.");
    context.drawImage(image, 0, 0, 600, 500);
    return canvas.toDataURL("image/png");
  } finally { URL.revokeObjectURL(blobUrl); }
}
