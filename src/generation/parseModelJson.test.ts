import test from "node:test";
import assert from "node:assert/strict";

import { parseModelJson } from "./parseModelJson";

// These are the shapes that actually came back on the json_object fallback path and turned
// good art into failed samples — a markdown fence, and prose wrapped around the object.

test("a plain JSON object parses", () => {
  assert.deepEqual(parseModelJson<{ a: number }>('{"a":1}', "test"), { a: 1 });
});

test("a ```json fence is stripped", () => {
  assert.deepEqual(parseModelJson<{ svg: string }>('```json\n{"svg":"<g/>"}\n```', "test"), { svg: "<g/>" });
  assert.deepEqual(parseModelJson<{ svg: string }>('```\n{"svg":"<g/>"}\n```', "test"), { svg: "<g/>" });
});

test("prose before and after the object is discarded", () => {
  const answer = 'Here is the creature you asked for:\n{"svg":"<g id=\'head-root\'/>"}\nLet me know if you want changes.';
  assert.deepEqual(parseModelJson<{ svg: string }>(answer, "test"), { svg: "<g id='head-root'/>" });
});

test("an empty answer names what was being generated", () => {
  assert.throws(() => parseModelJson("", "tail"), /empty tail response/);
  assert.throws(() => parseModelJson("   ", "tail"), /empty tail response/);
});

test("genuinely malformed JSON still throws rather than being guessed at", () => {
  // A truncated string is not rescuable: the art is incomplete, and the sample should fail
  // so the pipeline drops it instead of shipping half a creature.
  assert.throws(() => parseModelJson('{"svg":"<g id=', "test"), /JSON/i);
  assert.throws(() => parseModelJson('not json at all', "test"), /JSON/i);
});

test("braces inside string values do not confuse the salvage path", () => {
  const answer = 'Sure!\n{"svg":"<g style=\'fill:{primary}\'/>","name":"Fox"}';
  const parsed = parseModelJson<{ svg: string; name: string }>(answer, "test");
  assert.equal(parsed.name, "Fox");
  assert.match(parsed.svg, /\{primary\}/);
});
