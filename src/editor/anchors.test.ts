import assert from "node:assert/strict";
import test from "node:test";
import { ANCHOR_PARTS, anchorBounds, clampAnchor, enforceLeftFacing, resolveAnchorDrag } from "./anchors";
import { validateAnimalDraft } from "../generation/validation";

const at = (x: number, y: number) => ({ x, y });

test("a drag inside the legal box is left alone apart from rounding", () => {
  assert.deepEqual(clampAnchor("neck", at(80.4, 90.6)), at(80, 91));
});

test("each socket clamps to its own range", () => {
  for (const part of ANCHOR_PARTS) {
    const bounds = anchorBounds(part);
    assert.deepEqual(clampAnchor(part, at(-9999, -9999)), at(bounds.minX, bounds.minY), part);
    assert.deepEqual(clampAnchor(part, at(9999, 9999)), at(bounds.maxX, bounds.maxY), part);
  }
});

test("dragging the neck right of the tail stops it short instead of crossing", () => {
  const resolved = enforceLeftFacing("neck", at(119, 90), { neck: at(119, 90), tail: at(210, 120) });
  assert.ok(resolved.x < 210, "neck must stay left of the tail");
  assert.equal(resolved.y, 90, "the free axis is untouched");
});

test("dragging the tail left of the neck stops it short instead of crossing", () => {
  const resolved = enforceLeftFacing("tail", at(200, 120), { neck: at(210, 90), tail: at(200, 120) });
  assert.ok(resolved.x > 210, "tail must stay right of the neck");
});

test("only the dragged socket moves", () => {
  const current = { neck: at(119, 90), tail: at(210, 120) };
  const before = { ...current.tail };
  enforceLeftFacing("neck", at(300, 90), current);
  assert.deepEqual(current.tail, before, "the socket not being dragged must not be shoved");
});

test("legs are unaffected by the facing rule", () => {
  for (const part of ["frontLegs", "backLegs"] as const) {
    const point = at(100, 150);
    assert.deepEqual(enforceLeftFacing(part, point, { neck: at(75, 90), tail: at(260, 120) }), point);
  }
});

test("a resolved drag always satisfies the validator it is derived from", () => {
  const current = { neck: at(75, 90), tail: at(260, 110), frontLegs: at(115, 160), backLegs: at(235, 160) };
  const extremes = [at(-500, -500), at(500, 500), at(0, 0), at(260, 90), at(75, 160)];

  for (const part of ANCHOR_PARTS) {
    for (const attempt of extremes) {
      const next = { ...current, [part]: resolveAnchorDrag(part, attempt, current) };
      const result = validateAnimalDraft({
        name: "Anchor Probe",
        color: "#5C4033",
        accentColor: "#D2B48C",
        description: "anchor drag probe",
        bodyConnections: next,
        headSvg: "<g id=\"head-root\"><path d=\"M0 0L1 1\" stroke=\"outline\" stroke-width=\"3\"/></g>",
        bodySvg: "<g id=\"body-root\"><path d=\"M0 0L1 1\" stroke=\"outline\" stroke-width=\"3\"/></g>",
        frontLegsSvg: "<g id=\"frontLegs-root\"><path d=\"M0 0L1 1\" stroke=\"outline\" stroke-width=\"3\"/></g>",
        backLegsSvg: "<g id=\"backLegs-root\"><path d=\"M0 0L1 1\" stroke=\"outline\" stroke-width=\"3\"/></g>",
        tailSvg: "<g id=\"tail-root\"><path d=\"M0 0L1 1\" stroke=\"outline\" stroke-width=\"3\"/></g>",
      });

      const anchorIssues = result.issues.filter(
        (issue) => issue.code === "anchor.contract" || issue.code === "orientation.left",
      );
      assert.deepEqual(
        anchorIssues,
        [],
        `${part} dragged to (${attempt.x},${attempt.y}) produced ${anchorIssues.map((i) => i.code).join(", ")}`,
      );
    }
  }
});
