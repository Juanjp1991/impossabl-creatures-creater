import assert from "node:assert/strict";
import test from "node:test";
import type { AnimalDraft, GeneratedLayoutMetadata } from "../generation/contracts";
import { assembleFromPartDrafts } from "../generation/sampleSelection";
import { PART_TYPES } from "../generation/contracts";
import type { AnimalPartType } from "../types";
import {
  composeFromEntries,
  entryToPartDraft,
  literalHexFills,
  namespaceEntry,
  namespaceSvgIds,
  partEntryFromDraft,
  usesRampTokens,
  type PartBankEntry,
} from "./contracts";
import {
  addPartEntry,
  deletePartEntry,
  filterEntries,
  loadPartBank,
  mergeImportedEntries,
  parsePartBank,
  savePartBank,
  serializePartBank,
  sortEntries,
  updatePartEntry,
  type StorageLike,
} from "./store";

function fakeStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

const layout = (tag: string): GeneratedLayoutMetadata => ({
  facing: "left",
  groundY: 178,
  connections: [
    { part: "head", socketAnchor: { x: 75, y: 90 }, attachmentAnchor: { x: 120, y: 110 }, outwardNormal: { x: -1, y: 0 }, opposingNormal: { x: 1, y: 0 }, seamWidth: 30, minimumOverlap: 60, neutralConnectionDepth: 14, allowedScale: { min: 0.8, max: 1.2 } },
    { part: "frontLegs", socketAnchor: { x: 115, y: 160 }, attachmentAnchor: { x: 75, y: 15 }, outwardNormal: { x: 0, y: 1 }, opposingNormal: { x: 0, y: -1 }, seamWidth: 30, minimumOverlap: 60, neutralConnectionDepth: 14, allowedScale: { min: 0.8, max: 1.2 } },
    { part: "backLegs", socketAnchor: { x: 235, y: 160 }, attachmentAnchor: { x: 195, y: 15 }, outwardNormal: { x: 0, y: 1 }, opposingNormal: { x: 0, y: -1 }, seamWidth: 30, minimumOverlap: 60, neutralConnectionDepth: 14, allowedScale: { min: 0.8, max: 1.2 } },
    { part: "tail", socketAnchor: { x: 260, y: 105 }, attachmentAnchor: { x: 15, y: 15 }, outwardNormal: { x: 1, y: 0 }, opposingNormal: { x: -1, y: 0 }, seamWidth: 30, minimumOverlap: 60, neutralConnectionDepth: 14, allowedScale: { min: 0.8, max: 1.2 } },
  ],
  groundContacts: { frontLegs: [{ x: 80, y: 178 }], backLegs: [{ x: 195, y: 178 }] },
  depthGroups: {
    frontLegs: { farGroupId: `${tag}-fl-far`, nearGroupId: `${tag}-fl-near` },
    backLegs: { farGroupId: `${tag}-bl-far`, nearGroupId: `${tag}-bl-near` },
  },
});

const draft = (tag: string): AnimalDraft => ({
  name: `${tag} beast`,
  color: "#334455",
  accentColor: "#ffcc00",
  description: `${tag} description`,
  bodyConnections: { neck: { x: 75, y: 90 }, tail: { x: 260, y: 105 }, frontLegs: { x: 115, y: 160 }, backLegs: { x: 235, y: 160 } },
  headSvg: `<g id="${tag}-head-root"><circle cx="80" cy="80" r="40" fill="primary"/></g>`,
  bodySvg: `<g id="${tag}-body-root"><ellipse cx="150" cy="110" rx="100" ry="50" fill="primary"/></g>`,
  frontLegsSvg: `<g id="${tag}-fl-root"><g id="${tag}-fl-far"><rect x="60" y="20" width="20" height="140" fill="primary"/></g><g id="${tag}-fl-near"><rect x="90" y="20" width="20" height="140" fill="primary"/></g></g>`,
  backLegsSvg: `<g id="${tag}-bl-root"><g id="${tag}-bl-far"><rect x="180" y="20" width="20" height="140" fill="primary"/></g><g id="${tag}-bl-near"><rect x="210" y="20" width="20" height="140" fill="primary"/></g></g>`,
  tailSvg: `<g id="${tag}-tail-root"><path d="M 15,15 C 60,20 90,60 120,110" stroke="accent" fill="none"/></g>`,
  layoutMetadata: layout(tag),
});

test("partEntryFromDraft lifts only the requested slot's art and metadata", () => {
  const entry = partEntryFromDraft(draft("wolf"), "frontLegs", { source: "generated" });
  assert.equal(entry.slot, "frontLegs");
  assert.ok(entry.svg.includes("wolf-fl-root"));
  assert.ok(!entry.svg.includes("wolf-head-root"), "must not carry other slots' art");
  assert.deepEqual(entry.connection?.part, "frontLegs");
  assert.deepEqual(entry.depthGroups, { farGroupId: "wolf-fl-far", nearGroupId: "wolf-fl-near" });
  assert.deepEqual(entry.groundContacts, [{ x: 80, y: 178 }]);
  assert.equal(entry.facing, "left");
  assert.equal(entry.groundY, 178);
  assert.equal(entry.revision, 1);
  assert.equal(entry.lineageId, entry.id);
});

test("a banked body carries the socket layout, a banked limb does not", () => {
  const body = partEntryFromDraft(draft("bear"), "body");
  const tail = partEntryFromDraft(draft("bear"), "tail");
  assert.deepEqual(body.bodyConnections, draft("bear").bodyConnections);
  assert.equal(body.connection, undefined, "the body owns sockets, it has no attachment profile");
  assert.equal(tail.bodyConnections, undefined);
  assert.equal(tail.connection?.part, "tail");
});

test("entryToPartDraft round-trips through assembleFromPartDrafts", () => {
  const sources = { head: "a", body: "b", frontLegs: "c", backLegs: "d", tail: "e" };
  const entries = Object.fromEntries(
    PART_TYPES.map((slot) => [slot, partEntryFromDraft(draft(sources[slot as keyof typeof sources]), slot)])
  ) as Record<AnimalPartType, PartBankEntry>;

  const bySlot = Object.fromEntries(
    PART_TYPES.map((slot) => [slot, entryToPartDraft(entries[slot])])
  ) as Record<AnimalPartType, AnimalDraft>;

  const composed = assembleFromPartDrafts(bySlot);

  assert.ok(composed.headSvg.includes("a-head-root"));
  assert.ok(composed.bodySvg.includes("b-body-root"));
  assert.ok(composed.frontLegsSvg.includes("c-fl-root"));
  assert.ok(composed.backLegsSvg.includes("d-bl-root"));
  assert.ok(composed.tailSvg.includes("e-tail-root"));
  // Each slot's metadata must follow its own art, not the body's.
  assert.deepEqual(composed.layoutMetadata?.depthGroups.frontLegs, { farGroupId: "c-fl-far", nearGroupId: "c-fl-near" });
  assert.deepEqual(composed.layoutMetadata?.depthGroups.backLegs, { farGroupId: "d-bl-far", nearGroupId: "d-bl-near" });
  assert.equal(composed.layoutMetadata?.connections.length, 4);
  assert.deepEqual(composed.bodyConnections, draft("b").bodyConnections);
});

test("composeFromEntries namespaces ids so unrelated parts cannot collide", () => {
  const collide = (tag: string) => ({ ...draft(tag), tailSvg: `<g><linearGradient id="fur"/><path fill="url(#fur)"/></g>`, headSvg: `<g><linearGradient id="fur"/><path fill="url(#fur)"/></g>` });
  const entries = {
    head: partEntryFromDraft(collide("a"), "head"),
    body: partEntryFromDraft(draft("b"), "body"),
    frontLegs: partEntryFromDraft(draft("c"), "frontLegs"),
    backLegs: partEntryFromDraft(draft("d"), "backLegs"),
    tail: partEntryFromDraft(collide("e"), "tail"),
  } as Record<AnimalPartType, PartBankEntry>;
  const composed = composeFromEntries(entries);
  const headId = /id="([^"]+)"/.exec(composed.headSvg)?.[1];
  const tailId = /id="([^"]+)"/.exec(composed.tailSvg)?.[1];
  assert.ok(headId && tailId);
  assert.notEqual(headId, tailId, "two parts shipping #fur must not share the id after composing");
  assert.ok(composed.headSvg.includes(`url(#${headId})`), "the reference follows its own id");
});

test("composing parts that never had layout metadata leaves it absent", () => {
  // Legacy/hand-authored art has no ground contacts or depth groups. `assembleFromPartDrafts`
  // still emits a layout block, and the validator gates its whole layout section on that
  // block merely being present — so fabricating one would report errors for metadata the
  // part never claimed.
  const bare = (tag: string): AnimalDraft => ({ ...draft(tag), layoutMetadata: undefined });
  const entries = Object.fromEntries(
    PART_TYPES.map((slot) => [slot, partEntryFromDraft(bare(slot), slot, { source: "manual" })])
  ) as Record<AnimalPartType, PartBankEntry>;
  const composed = composeFromEntries(entries);
  assert.equal(composed.layoutMetadata, undefined);
});

test("composing parts that do carry layout metadata keeps it", () => {
  const entries = Object.fromEntries(
    PART_TYPES.map((slot) => [slot, partEntryFromDraft(draft(slot), slot)])
  ) as Record<AnimalPartType, PartBankEntry>;
  const composed = composeFromEntries(entries);
  assert.equal(composed.layoutMetadata?.connections.length, 4);
  assert.ok(composed.layoutMetadata?.depthGroups.frontLegs);
  assert.ok(composed.layoutMetadata?.groundContacts.backLegs);
});

test("one part with real metadata is enough to keep the layout block", () => {
  const entries = Object.fromEntries(
    PART_TYPES.map((slot) => [
      slot,
      partEntryFromDraft(slot === "tail" ? draft("t") : { ...draft(slot), layoutMetadata: undefined }, slot),
    ])
  ) as Record<AnimalPartType, PartBankEntry>;
  const composed = composeFromEntries(entries);
  assert.equal(composed.layoutMetadata?.connections.length, 1);
  assert.equal(composed.layoutMetadata?.connections[0].part, "tail");
});

test("namespaceSvgIds rewrites ids and every reference to them", () => {
  const svg = `<defs><linearGradient id="fur"><stop offset="0"/></linearGradient><clipPath id="crop"><rect/></clipPath></defs><g clip-path="url(#crop)"><path fill="url( #fur )" d="M0,0"/><use xlink:href="#fur"/></g>`;
  const { svg: out, mapping } = namespaceSvgIds(svg, "pb-tail-42");
  assert.equal(mapping.get("fur"), "pb-tail-42-fur");
  assert.ok(out.includes(`id="pb-tail-42-fur"`));
  assert.ok(out.includes(`url(#pb-tail-42-fur)`), "url() references follow the id");
  assert.ok(out.includes(`url(#pb-tail-42-crop)`));
  assert.ok(out.includes(`xlink:href="#pb-tail-42-fur"`));
  assert.ok(!/["']fur["']/.test(out), "no bare original id survives");
});

test("two parts sharing a gradient id stop colliding once namespaced", () => {
  const a = partEntryFromDraft({ ...draft("x"), tailSvg: `<g><linearGradient id="fur"/><path fill="url(#fur)"/></g>` }, "tail");
  const b = partEntryFromDraft({ ...draft("y"), tailSvg: `<g><linearGradient id="fur"/><path fill="url(#fur)"/></g>` }, "tail");
  const na = namespaceEntry(a, a.id);
  const nb = namespaceEntry(b, b.id);
  const idOf = (svg: string) => /id="([^"]+)"/.exec(svg)?.[1];
  assert.notEqual(idOf(na.svg), idOf(nb.svg));
});

test("namespaceEntry remaps depth group ids so they still resolve", () => {
  const entry = partEntryFromDraft(draft("wolf"), "frontLegs");
  const namespaced = namespaceEntry(entry, "pb-1");
  assert.equal(namespaced.depthGroups?.farGroupId, "pb-1-wolf-fl-far");
  assert.ok(namespaced.svg.includes(`id="pb-1-wolf-fl-far"`));
  assert.ok(namespaced.svg.includes(`id="pb-1-wolf-fl-near"`));
});

test("palette helpers separate recolouring parts from bolted-on ones", () => {
  assert.equal(usesRampTokens(`<path fill="primary"/>`), true);
  assert.equal(usesRampTokens(`<path fill="var(--accent)"/>`), true);
  assert.equal(usesRampTokens(`<path fill="#ff0000"/>`), false);
  assert.deepEqual(literalHexFills(`<path fill="#FF0000" stroke="#0f0"/>`), ["#ff0000", "#0f0"]);
  assert.deepEqual(literalHexFills(`<path fill="primary"/>`), []);
});

test("bank survives a save/load round trip", () => {
  const storage = fakeStorage();
  const entry = partEntryFromDraft(draft("wolf"), "tail", { name: "Wolf brush tail" });
  addPartEntry([], entry, storage);
  const loaded = loadPartBank(storage);
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].name, "Wolf brush tail");
  assert.deepEqual(loaded[0].connection, entry.connection);
});

test("corrupt records are dropped without taking the bank with them", () => {
  const good = partEntryFromDraft(draft("wolf"), "tail");
  const state = JSON.stringify({
    formatVersion: 1,
    entries: [good, null, { id: "x" }, { id: "y", slot: "wing", svg: "<g/>" }, { id: "z", slot: "head", svg: "  " }],
  });
  assert.equal(parsePartBank(state).entries.length, 1);
  assert.equal(parsePartBank("not json").entries.length, 0);
  assert.equal(parsePartBank(null).entries.length, 0);
});

test("a bare entry array imports as well as a wrapped state", () => {
  const entry = partEntryFromDraft(draft("wolf"), "head");
  assert.equal(parsePartBank(JSON.stringify([entry])).entries.length, 1);
});

test("update and delete rewrite storage", () => {
  const storage = fakeStorage();
  const entry = partEntryFromDraft(draft("wolf"), "head");
  let entries = addPartEntry([], entry, storage);
  entries = updatePartEntry(entries, entry.id, { name: "Renamed", favorite: true }, storage);
  assert.equal(loadPartBank(storage)[0].name, "Renamed");
  assert.equal(loadPartBank(storage)[0].favorite, true);
  assert.equal(loadPartBank(storage)[0].id, entry.id, "the id is never patched away");
  entries = deletePartEntry(entries, entry.id, storage);
  assert.equal(loadPartBank(storage).length, 0);
});

test("filterEntries narrows by slot, search, favourite and tag", () => {
  const head = { ...partEntryFromDraft(draft("wolf"), "head", { name: "Wolf head" }), tags: ["canine"] };
  const tail = { ...partEntryFromDraft(draft("fox"), "tail", { name: "Fox brush" }), tags: ["canine", "fluffy"], favorite: true };
  const entries = [head, tail];
  assert.deepEqual(filterEntries(entries, { slot: "head" }).map((e) => e.name), ["Wolf head"]);
  assert.deepEqual(filterEntries(entries, { search: "brush" }).map((e) => e.name), ["Fox brush"]);
  assert.deepEqual(filterEntries(entries, { favoritesOnly: true }).map((e) => e.name), ["Fox brush"]);
  assert.equal(filterEntries(entries, { tag: "canine" }).length, 2);
  assert.equal(filterEntries(entries, { tag: "fluffy" }).length, 1);
  assert.equal(filterEntries(entries, { slot: "head", search: "fox" }).length, 0);
});

test("search also matches the provenance the contact sheet recorded", () => {
  const entry = partEntryFromDraft(draft("wolf"), "tail", {
    name: "Tail 3",
    provenance: { animalName: "Arctic fox", emphasis: "stylised-bold", sampleIndex: 2 },
  });
  assert.equal(filterEntries([entry], { search: "arctic" }).length, 1);
  assert.equal(filterEntries([entry], { search: "stylised" }).length, 1);
});

test("favourites sort above the rest, newest first within each group", () => {
  const base = partEntryFromDraft(draft("wolf"), "head");
  const entries = [
    { ...base, id: "old", updatedAt: "2020-01-01T00:00:00.000Z", favorite: false },
    { ...base, id: "new", updatedAt: "2026-01-01T00:00:00.000Z", favorite: false },
    { ...base, id: "fav", updatedAt: "2019-01-01T00:00:00.000Z", favorite: true },
  ];
  assert.deepEqual(sortEntries(entries).map((entry) => entry.id), ["fav", "new", "old"]);
});

test("importing the same file twice re-issues ids instead of clobbering", () => {
  const entry = partEntryFromDraft(draft("wolf"), "head");
  const first = mergeImportedEntries([], [entry]);
  assert.equal(first.added, 1);
  const second = mergeImportedEntries(first.entries, [entry]);
  assert.equal(second.entries.length, 2);
  assert.equal(new Set(second.entries.map((e) => e.id)).size, 2);
});

test("serializePartBank output parses back into the same entries", () => {
  const entry = partEntryFromDraft(draft("wolf"), "tail");
  const parsed = parsePartBank(serializePartBank([entry]));
  assert.deepEqual(parsed.entries[0].svg, entry.svg);
  assert.equal(parsed.formatVersion, 1);
});

test("a quota failure surfaces rather than silently losing the write", () => {
  const storage: StorageLike = {
    getItem: () => null,
    setItem: () => {
      const error = new Error("full");
      error.name = "QuotaExceededError";
      throw error;
    },
    removeItem: () => {},
  };
  assert.throws(() => savePartBank([partEntryFromDraft(draft("wolf"), "head")], storage), /part bank is full/);
});
