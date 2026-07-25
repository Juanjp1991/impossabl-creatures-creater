import assert from "node:assert/strict";
import test from "node:test";
import { EDITOR_ONLY_ATTRIBUTES, sanitizeForSave, stripEditorAttributes } from "./sanitize";

test("every editor-only attribute is removed", () => {
  const svg = EDITOR_ONLY_ATTRIBUTES.map((name) => `<path ${name}="x" d="M0 0"/>`).join("");
  const cleaned = stripEditorAttributes(svg);
  for (const name of EDITOR_ONLY_ATTRIBUTES) assert.ok(!cleaned.includes(name), name);
  assert.equal(cleaned.match(/d="M0 0"/g)?.length, EDITOR_ONLY_ATTRIBUTES.length);
});

test("drawing attributes and element structure survive untouched", () => {
  const svg =
    '<g id="head-root" data-name="Head"><path d="M0 0L10 10" fill="primary" stroke="outline" stroke-width="3" data-locked="true"/></g>';
  assert.equal(
    stripEditorAttributes(svg),
    '<g id="head-root" data-name="Head"><path d="M0 0L10 10" fill="primary" stroke="outline" stroke-width="3"/></g>',
  );
});

test("the JSON-valued transform attribute is removed whole", () => {
  // XMLSerializer escapes inner quotes as &quot;, so the value never contains a bare quote.
  const svg =
    '<path data-editor-transform="{&quot;translateX&quot;:4,&quot;scale&quot;:1}" fill="accent"/>';
  assert.equal(stripEditorAttributes(svg), '<path fill="accent"/>');
});

test("single-quoted values are handled too", () => {
  assert.equal(stripEditorAttributes("<path data-locked='true' fill='primary'/>"), "<path fill='primary'/>");
});

test("gizmo chrome markers are stripped if overlay markup ever reaches a saved string", () => {
  assert.equal(
    stripEditorAttributes('<g data-editor-chrome="true"><rect/></g>'),
    "<g><rect/></g>",
  );
});

test("stripping is idempotent and safe on empty input", () => {
  const svg = '<path data-base-fill="primary" d="M0 0"/>';
  const once = stripEditorAttributes(svg);
  assert.equal(stripEditorAttributes(once), once);
  assert.equal(stripEditorAttributes(""), "");
});

test("an attribute merely prefixed by an editor attribute name is kept", () => {
  const svg = '<path data-locked-by-user="no" d="M0 0"/>';
  assert.equal(stripEditorAttributes(svg), svg);
});

test("sanitizeForSave is the save-path entry point", () => {
  assert.equal(sanitizeForSave('<path data-base-transform="" d="M0 0"/>'), '<path d="M0 0"/>');
});
