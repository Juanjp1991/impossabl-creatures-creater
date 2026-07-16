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
  const content = layers.map((part) => {
    const origin = originFor(part.id);
    return `<g data-part-id="${escapeAttribute(part.id)}" transform="translate(${origin.x} ${origin.y})">${colourize(part.svg, pkg.palette.primary, pkg.palette.accent)}</g>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 500" width="600" height="500"><rect width="600" height="500" fill="#fafafa"/><line x1="0" y1="400" x2="600" y2="400" stroke="#d4d4d8"/>${content}</svg>`;
}

