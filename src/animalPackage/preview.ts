import type { AnimalPackageV1, PackagePoint } from "./schema";
import { assertPublishableAnimalPackageV1 } from "./validation";

const escapeAttribute = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

function colourize(svg: string, primary: string, accent: string) {
  return svg
    .replace(/(["'])primary\1/gi, `"${escapeAttribute(primary)}"`)
    .replace(/(["'])accent\1/gi, `"${escapeAttribute(accent)}"`);
}

export function buildNeutralPackagePreview(pkg: AnimalPackageV1): string {
  assertPublishableAnimalPackageV1(pkg);
  const root = pkg.parts.find((part) => part.id === pkg.centralSkeleton.rootPartId)!;
  const rootOrigin = { x: 150 - root.viewBox.x, y: 120 - root.viewBox.y };
  const origins = new Map<string, PackagePoint>([[root.id, rootOrigin]]);
  const resolving = new Set<string>();
  const originFor = (partId: string): PackagePoint => {
    const cached = origins.get(partId);
    if (cached) return cached;
    if (resolving.has(partId)) throw new Error(`Attachment cycle detected at '${partId}'.`);
    resolving.add(partId);
    const part = pkg.parts.find((item) => item.id === partId)!;
    const socket = pkg.sockets.find((item) => item.id === part.attachment?.socketId)!;
    const owner = originFor(socket.ownerPartId);
    const origin = { x: owner.x + socket.anchor.x - part.attachment!.anchor.x, y: owner.y + socket.anchor.y - part.attachment!.anchor.y };
    origins.set(partId, origin);
    resolving.delete(partId);
    return origin;
  };
  const layers = [...pkg.parts].sort((left, right) => left.layerOrder - right.layerOrder || left.id.localeCompare(right.id));
  const contactYs = pkg.parts.flatMap((part) => {
    if (!["forelimbs", "hindlimbs", "legs", "walkingLegs"].includes(part.category)) return [];
    const origin = originFor(part.id);
    if (part.groundContacts?.some((contact) => !contact.raised)) return part.groundContacts.filter((contact) => !contact.raised).map((contact) => origin.y + contact.y);
    const values = [...part.svg.matchAll(/<(?:path|polygon|polyline)\b[^>]*(?:d|points)\s*=\s*["']([^"']+)["']|<(?:circle|ellipse|rect|line)\b([^>]*)>/gi)].flatMap((match) => {
      if (match[1]) { const numbers = match[1].match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)?.map(Number) ?? []; return numbers.filter((_, index) => index % 2 === 1); }
      const attributes = Object.fromEntries([...(match[2] ?? "").matchAll(/([\w:-]+)\s*=\s*["']([^"']+)["']/g)].map((item) => [item[1].toLowerCase(), Number(item[2])]));
      if (Number.isFinite(attributes.cy)) return [attributes.cy + (attributes.ry || attributes.r || 0)];
      if (Number.isFinite(attributes.y)) return [attributes.y + (attributes.height || 0)];
      if (Number.isFinite(attributes.y1)) return [attributes.y1, attributes.y2];
      return [];
    }).filter(Number.isFinite);
    return values.length ? [origin.y + Math.max(...values)] : [origin.y + part.viewBox.y + part.viewBox.height];
  }).sort((a, b) => a - b);
  const groundY = pkg.compatibility ? rootOrigin.y + pkg.compatibility.groundY : contactYs.length ? contactYs[Math.floor(contactYs.length / 2)] : rootOrigin.y + root.viewBox.y + root.viewBox.height;
  const content = layers.map((part) => {
    const origin = originFor(part.id);
    return `<g data-part-id="${escapeAttribute(part.id)}" transform="translate(${origin.x} ${origin.y})">${colourize(part.svg, pkg.palette.primary, pkg.palette.accent)}</g>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 500" width="600" height="500"><rect width="600" height="500" fill="#fafafa"/><line x1="0" y1="${groundY}" x2="600" y2="${groundY}" stroke="#d4d4d8" data-derived-ground="true"/>${content}</svg>`;
}
