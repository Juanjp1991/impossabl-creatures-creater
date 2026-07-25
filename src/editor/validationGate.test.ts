import assert from "node:assert/strict";
import test from "node:test";
import type { ValidationIssue } from "../generation/contracts";
import { errorSignature, newErrorsSince } from "./validationGate";

const err = (part: ValidationIssue["part"], code: string): ValidationIssue =>
  ({ part, code, severity: "error", message: `${part} ${code}` });
const warn = (part: ValidationIssue["part"], code: string): ValidationIssue =>
  ({ part, code, severity: "warning", message: `${part} ${code}` });

test("only errors are counted; warnings never gate a save", () => {
  const signature = errorSignature([err("head", "svg.tag"), warn("body", "density.count")]);
  assert.equal(signature.get("head|svg.tag"), 1);
  assert.equal(signature.has("body|density.count"), false);
});

test("an unchanged part with pre-existing faults still saves", () => {
  const existing = [err("head", "svg.tag"), err("head", "group.required")];
  assert.deepEqual(newErrorsSince(errorSignature(existing), existing), []);
});

test("an error the edit introduced blocks the save", () => {
  const baseline = errorSignature([err("head", "svg.tag")]);
  const now = [err("head", "svg.tag"), err("body", "palette.rawHex")];
  const blocking = newErrorsSince(baseline, now);
  assert.equal(blocking.length, 1);
  assert.equal(blocking[0].code, "palette.rawHex");
});

test("a second copy of a pre-existing fault is still new", () => {
  // Otherwise one legacy raw hex would excuse painting every other shape with literal colour.
  const baseline = errorSignature([err("body", "palette.rawHex")]);
  const now = [err("body", "palette.rawHex"), err("body", "palette.rawHex")];
  assert.equal(newErrorsSince(baseline, now).length, 1);
});

test("the same code on a different part counts separately", () => {
  const baseline = errorSignature([err("head", "svg.tag")]);
  assert.equal(newErrorsSince(baseline, [err("tail", "svg.tag")]).length, 1);
});

test("fixing errors never blocks, and warnings pass through untouched", () => {
  const baseline = errorSignature([err("head", "svg.tag"), err("head", "group.required")]);
  assert.deepEqual(newErrorsSince(baseline, [warn("head", "density.count")]), []);
});

test("an empty baseline means every error is new — the correct default for a fresh draft", () => {
  const blocking = newErrorsSince(new Map(), [err("head", "svg.tag"), warn("body", "scale.fill")]);
  assert.equal(blocking.length, 1);
  assert.equal(blocking[0].code, "svg.tag");
});
