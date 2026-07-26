import test from "node:test";
import assert from "node:assert/strict";

import { createDefaultBrief } from "./brief";
import { PART_TYPES } from "./contracts";
import { DENSITY_BANDS } from "./metrics";
import { buildPartSystemInstruction, sharedHouseStyle, slotSection, SLOT_DENSITY_TARGET } from "./partPrompt";
import { namespacePartSvg, partDraft } from "./partPipeline";

const brief = createDefaultBrief("red fox");
const instruction = (slot: Parameters<typeof slotSection>[0], over: Partial<Parameters<typeof buildPartSystemInstruction>[0]> = {}) =>
  buildPartSystemInstruction({ slot, brief, referenceRules: "No reference image is supplied.", styleGuide: "STYLE GUIDE.", ...over });

test("each slot is told about its own view and nothing else's", () => {
  assert.match(slotSection("head"), /0\.\.160 across by 0\.\.160 down/);
  assert.match(slotSection("body"), /0\.\.300 across by 0\.\.220 down/);
  assert.match(slotSection("frontLegs"), /0\.\.260 across by 0\.\.180 down/);
});

test("a head call is never told about hind-leg hock continuity", () => {
  const head = instruction("head");
  assert.ok(!/hock/.test(head), "the head prompt must not mention hocks");
  assert.ok(!/bodyConnections/.test(head), "the head prompt must not carry body-local connection ranges");
  assert.match(instruction("backLegs"), /hock/);
});

test("only the body is asked for connections and only legs for depth groups", () => {
  assert.match(slotSection("body"), /Return bodyConnections in BODY-LOCAL coordinates/);
  for (const slot of ["head", "tail"] as const) {
    assert.ok(!/depth group/i.test(slotSection(slot)), `${slot} should not be asked for depth groups`);
  }
  assert.match(slotSection("frontLegs"), /frontLegs-far and frontLegs-near/);
  assert.match(slotSection("backLegs"), /backLegs-far and backLegs-near/);
});

test("every slot is aimed at the middle of its own density band", () => {
  for (const slot of PART_TYPES) {
    const section = slotSection(slot);
    const band = DENSITY_BANDS[slot];
    assert.match(section, new RegExp(`about ${SLOT_DENSITY_TARGET[slot]} visible shapes`));
    assert.match(section, new RegExp(`range ${band[0]}-${band[1]}`));
    assert.ok(SLOT_DENSITY_TARGET[slot] > band[0] && SLOT_DENSITY_TARGET[slot] < band[1], `${slot} target should sit inside its band`);
  }
});

test("the house-style block is byte-identical across every slot", () => {
  const shared = sharedHouseStyle();
  for (const slot of PART_TYPES) assert.ok(instruction(slot).includes(shared), `${slot} must carry the shared block verbatim`);
});

test("a fixed palette replaces the invent-your-own instruction", () => {
  const free = sharedHouseStyle();
  const fixed = sharedHouseStyle({ color: "#8B5A2B", accentColor: "#F5E6C8" });
  assert.match(free, /Choose the creature's two concrete 6-digit hex colours/);
  assert.match(fixed, /primary is #8B5A2B and accent is #F5E6C8/);
  assert.ok(!/Choose the creature's two/.test(fixed), "a fixed palette must not also ask the model to invent one");
});

test("the body SVG is passed to attached parts as context, and not to the body itself", () => {
  const withBody = instruction("head", { bodyContext: "<g id=\"body-root\"/>" });
  assert.match(withBody, /The body this part must fit has already been drawn/);
  assert.match(withBody, /body-root/);
  assert.ok(!/has already been drawn/.test(instruction("body")));
});

test("partDraft puts the art in its own slot and leaves the others empty", () => {
  const base = {
    name: "Fox", color: "#B85C2E", accentColor: "#F5E6C8", description: "A fox.",
    bodyConnections: { neck: { x: 75, y: 90 }, tail: { x: 260, y: 105 }, frontLegs: { x: 115, y: 160 }, backLegs: { x: 235, y: 160 } },
    groundY: 178,
  };
  const draft = partDraft("tail", { slot: "tail", svg: "<g id=\"tail-root\"/>", connection: { part: "tail", socketAnchor: { x: 260, y: 105 }, attachmentAnchor: { x: 15, y: 15 }, outwardNormal: { x: 1, y: 0 }, opposingNormal: { x: -1, y: 0 }, seamWidth: 30, minimumOverlap: 16, neutralConnectionDepth: 16, allowedScale: { min: 0.8, max: 1.2 } } }, base);
  assert.equal(draft.tailSvg, "<g id=\"tail-root\"/>");
  assert.equal(draft.headSvg, "");
  assert.equal(draft.bodySvg, "");
  assert.equal(draft.layoutMetadata?.connections[0].part, "tail");
  assert.equal(draft.layoutMetadata?.groundY, 178);
});

test("ground contacts and depth groups are only carried for the slot that owns them", () => {
  const base = {
    name: "Fox", color: "#B85C2E", accentColor: "#F5E6C8", description: "A fox.",
    bodyConnections: { neck: { x: 75, y: 90 }, tail: { x: 260, y: 105 }, frontLegs: { x: 115, y: 160 }, backLegs: { x: 235, y: 160 } },
    groundY: 178,
  };
  const legs = partDraft("frontLegs", {
    slot: "frontLegs", svg: "<g id=\"frontLegs-root\"/>",
    groundContacts: [{ x: 80, y: 178 }],
    depthGroups: { farGroupId: "frontLegs-far", nearGroupId: "frontLegs-near" },
  }, base);
  assert.deepEqual(legs.layoutMetadata?.groundContacts.frontLegs, [{ x: 80, y: 178 }]);
  assert.equal(legs.layoutMetadata?.groundContacts.backLegs, undefined);

  // A head that hallucinated ground contacts must not smuggle them into the layout.
  const head = partDraft("head", { slot: "head", svg: "<g id=\"head-root\"/>", groundContacts: [{ x: 10, y: 10 }] }, base);
  assert.deepEqual(head.layoutMetadata?.groundContacts, {});
});

test("part ids are namespaced by slot, so two independent calls cannot collide", () => {
  // Both leg calls came back using the same internal ids in a real run, which the assembled
  // draft then failed on as svg.id.duplicate.
  const front = namespacePartSvg(`<g id="frontLegs-root"><g id="frontLegs-far"><path id="leg-upper"/></g><g id="frontLegs-near"><path id="leg-upper-2"/></g></g>`, "frontLegs");
  const back = namespacePartSvg(`<g id="backLegs-root"><g id="backLegs-far"><path id="leg-upper"/></g></g>`, "backLegs");
  const ids = (svg: string) => [...svg.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set([...ids(front), ...ids(back)]).size, ids(front).length + ids(back).length);
});

test("namespacing preserves the ids the validator matches by name", () => {
  const svg = namespacePartSvg(`<g id="frontLegs-root"><g id="frontLegs-far"/><g id="frontLegs-near"/><path id="paw"/></g>`, "frontLegs");
  assert.match(svg, /id="frontLegs-root"/);
  assert.match(svg, /id="frontLegs-far"/);
  assert.match(svg, /id="frontLegs-near"/);
  assert.match(svg, /id="frontlegs-paw"/);
});

test("namespacing rewrites internal references along with the ids", () => {
  const svg = namespacePartSvg(`<g id="head-root"><path id="muzzle"/><use href="#muzzle"/><path fill="url(#muzzle)"/></g>`, "head");
  assert.ok(!/#muzzle["')]/.test(svg), `dangling reference in ${svg}`);
  assert.match(svg, /href="#head-muzzle"/);
  assert.match(svg, /url\(#head-muzzle\)/);
});
