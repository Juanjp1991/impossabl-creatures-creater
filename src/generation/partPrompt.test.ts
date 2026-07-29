import test from "node:test";
import assert from "node:assert/strict";

import { createDefaultBrief } from "./brief";
import { PART_TYPES } from "./contracts";
import { DETAIL_LEVELS, detailDensityBandTotals, detailDensityProfile, detailDensityTotal, wholeAnimalDensityInstruction } from "./detailDensity";
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

test("a head call is never told about back-leg construction", () => {
  const head = instruction("head");
  assert.ok(!/BACK-LEG SET IDENTITY/.test(head), "the head prompt must not carry back-leg construction rules");
  assert.ok(!/bodyConnections/.test(head), "the head prompt must not carry body-local connection ranges");
  assert.match(instruction("backLegs"), /BACK-LEG SET IDENTITY/);
});

test("head calls strongly request the preferred tilted three-quarter expression", () => {
  const head = instruction("head");
  assert.match(head, /three-quarter head turned partly toward the viewer/i);
  assert.match(head, /two distinct, fully visible eyes/i);
  assert.match(head, /two distinct, fully visible ears/i);
  assert.match(head, /muzzle or beak below and between the eyes/i);
  assert.match(head, /complete readable mouth/i);
  assert.match(head, /rear neck connection solid at local \(120,110\)/i);
});

test("only the body is asked for connections and only legs for depth groups", () => {
  assert.match(slotSection("body"), /Return bodyConnections in BODY-LOCAL coordinates/);
  for (const slot of ["head", "tail"] as const) {
    assert.ok(!/depth group/i.test(slotSection(slot)), `${slot} should not be asked for depth groups`);
  }
  assert.match(slotSection("frontLegs"), /frontLegs-near[\s\S]*frontLegs-far/);
  assert.match(slotSection("backLegs"), /backLegs-near[\s\S]*backLegs-far/);
});

test("leg calls receive the strict physical identity, separation, order and shading contract", () => {
  const front = instruction("frontLegs");
  assert.match(front, /front-left-leg/);
  assert.match(front, /front-right-leg/);
  assert.match(front, /front-left-limb/);
  assert.match(front, /front-left-foot/);
  assert.match(front, /smooth rounded shoulder or hip collar/i);
  assert.match(front, /Reserve about 3 meaningful drawable shapes for EACH foot subgroup/i);
  assert.match(front, /frontLegs body attachment as their own species-correct construction/i);
  assert.match(front, /never copy, mirror, translate, rename or reuse the main back-leg limb subgroup geometry/i);
  assert.match(front, /Foot silhouette and construction may be reused when appropriate/i);
  assert.match(front, /front-left leg and its foot are left of the front-right leg and its foot/i);
  assert.match(front, /primary-dark and accent-dark/);
  assert.match(front, /never stack one complete leg silhouette/i);
  const back = instruction("backLegs");
  assert.match(back, /back-left-leg/);
  assert.match(back, /back-right-leg/);
  assert.match(back, /backLegs body attachment as their own species-correct construction/i);
  assert.match(back, /never copy, mirror, translate, rename or reuse the main front-leg limb subgroup geometry/i);
});

test("every slot is aimed at the middle of its own density band", () => {
  for (const slot of PART_TYPES) {
    const section = slotSection(slot);
    const band = DENSITY_BANDS[slot];
    assert.match(section, new RegExp(`about ${SLOT_DENSITY_TARGET[slot]} visible SVG shapes`));
    assert.match(section, new RegExp(`range ${band[0]}-${band[1]}`));
    assert.ok(SLOT_DENSITY_TARGET[slot] > band[0] && SLOT_DENSITY_TARGET[slot] < band[1], `${slot} target should sit inside its band`);
  }
});

test("every guided detail level produces its own numerical part targets", () => {
  for (const detailLevel of DETAIL_LEVELS) {
    const profile = detailDensityProfile(detailLevel);
    const levelBrief = { ...brief, detailLevel };
    for (const slot of PART_TYPES) {
      const section = buildPartSystemInstruction({
        slot,
        brief: levelBrief,
        referenceRules: "No reference image is supplied.",
        styleGuide: "STYLE GUIDE.",
      });
      assert.match(section, new RegExp(`${profile.label.toUpperCase()}: target about ${profile.targets[slot]} visible SVG shapes`));
      assert.match(section, new RegExp(`range ${profile.bands[slot][0]}-${profile.bands[slot][1]}`));
    }
  }
});

test("guided detail tiers increase targets and keep every target inside its allowed band", () => {
  for (const [index, detailLevel] of DETAIL_LEVELS.entries()) {
    const profile = detailDensityProfile(detailLevel);
    for (const slot of PART_TYPES) {
      const [minimum, maximum] = profile.bands[slot];
      assert.ok(profile.targets[slot] > minimum && profile.targets[slot] < maximum, `${detailLevel} ${slot} target should sit inside its band`);
      if (index > 0) {
        const previous = detailDensityProfile(DETAIL_LEVELS[index - 1]);
        assert.ok(profile.targets[slot] > previous.targets[slot], `${detailLevel} ${slot} should exceed the previous tier`);
        assert.ok(maximum > previous.bands[slot][1], `${detailLevel} ${slot} ceiling should exceed the previous tier`);
      }
    }
  }
  assert.equal(detailDensityTotal("medium"), 102);
  assert.equal(detailDensityTotal("high"), 254);
  assert.equal(detailDensityTotal("ultra"), 450);
  assert.deepEqual(detailDensityBandTotals("ultra"), [338, 602]);
  assert.match(wholeAnimalDensityInstruction("ultra"), /head 100 shapes/);
  assert.match(wholeAnimalDensityInstruction("ultra"), /about 450 visible SVG shapes total/);
  assert.match(wholeAnimalDensityInstruction("ultra"), /about 14 meaningful shapes for EACH front foot/);
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

test("a focused leg call uses the opposite set only as a negative comparison", () => {
  const back = instruction("backLegs", {
    oppositeLegContext: `<g id="frontLegs-root"><path id="front-shape" d="M0 0L20 20"/></g>`,
  });
  assert.match(back, /OPPOSITE LEG SET — NEGATIVE COMPARISON ONLY/);
  assert.match(back, /do not copy, mirror, translate, rename or lightly edit its main limb silhouettes/i);
  assert.match(back, /difference must be visible in the broad upper attachment, main limb contour and bend/i);
  assert.match(back, /feet are the one exception/i);
  assert.match(back, /silhouette and construction MAY match or be reused/i);
  assert.match(back, /front-shape/);
  assert.ok(!instruction("head", { oppositeLegContext: "<path/>" }).includes("OPPOSITE LEG SET"), "non-leg parts must ignore opposite-leg context");
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
  const svg = namespacePartSvg(`<g id="frontLegs-root"><g id="frontLegs-far"><g id="front-right-leg"><g id="front-right-limb"/><g id="front-right-foot"/></g></g><g id="frontLegs-near"><g id="front-left-leg"><g id="front-left-limb"/><g id="front-left-foot"/></g></g><path id="paw"/></g>`, "frontLegs");
  assert.match(svg, /id="frontLegs-root"/);
  assert.match(svg, /id="frontLegs-far"/);
  assert.match(svg, /id="frontLegs-near"/);
  assert.match(svg, /id="front-left-leg"/);
  assert.match(svg, /id="front-right-leg"/);
  assert.match(svg, /id="front-left-limb"/);
  assert.match(svg, /id="front-left-foot"/);
  assert.match(svg, /id="front-right-limb"/);
  assert.match(svg, /id="front-right-foot"/);
  assert.match(svg, /id="frontlegs-paw"/);
});

test("namespacing rewrites internal references along with the ids", () => {
  const svg = namespacePartSvg(`<g id="head-root"><path id="muzzle"/><use href="#muzzle"/><path fill="url(#muzzle)"/></g>`, "head");
  assert.ok(!/#muzzle["')]/.test(svg), `dangling reference in ${svg}`);
  assert.match(svg, /href="#head-muzzle"/);
  assert.match(svg, /url\(#head-muzzle\)/);
});
