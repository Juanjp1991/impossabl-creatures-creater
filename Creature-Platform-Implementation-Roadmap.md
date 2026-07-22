# Creature Platform Implementation Roadmap

## 1. Product goal

Build two connected applications:

1. **Creature Asset Builder** — the existing React application used privately to create, edit, validate and export official vanilla animals.
2. **Creature Game** — an offline-first PWA for Android and desktop where players combine official animal parts into hybrids and use them in gameplay.

The asset builder exports approved animal packages. The game imports those packages and creates hybrids at runtime. Completed hybrids are never exported as official source animals.

## 2. Guiding decisions

- Keep the asset builder and game as separate applications.
- Share one versioned animal-package specification and, where practical, one rendering library.
- Use strict anatomical compatibility. Forelimb sockets accept forelimbs, wing sockets accept wings, and so on.
- Use **forelimb** and **hindlimb** for anatomical position. Use **near** and **far** only for visual depth.
- Let the selected body define the valid sockets and their attachment positions.
- Support several anatomy templates instead of forcing every animal into five mammal parts.
- Store official animals as immutable, versioned packages.
- Store player hybrids as small recipes referencing official part IDs and versions.
- Start offline with bundled animals and IndexedDB. Add Convex later for accounts, backup, sharing and synchronization.
- Prefer named groups and stable IDs over numbered SVG shapes.
- Build direct joint posing before inverse kinematics.

## 3. What to build first

The first useful milestone is improving the quality and reliability of generated vanilla animals. Before changing the package schema or building the game, the existing generator should become a controlled generation, validation, visual-review and repair pipeline.

The first workflow is:

**User request → expanded design brief → SVG generation → technical validation → assembled visual review → targeted repair → user approval.**

After Priority 0 works, the next foundational milestone is the animal-package pipeline:

**Create animal → validate animal → export package → import package → render the same animal correctly.**

Until both workflows work, advanced editor and game improvements risk being built on unreliable assets or an unstable data model.

## Priority 0 — Improve Gemini animal generation quality

### Objective

Make Gemini 3.6 Flash produce more recognizable, visually coherent and technically compatible animals while keeping generation approachable for a user who enters only a short request such as “cow.”

### P0.1 — Add a guided animal brief

Keep one required animal-name field, then add optional selectors with sensible defaults:

- Sex or variant, such as cow, bull or neutral.
- Age.
- Body build.
- Natural, cartoon, semi-realistic or fantasy style.
- Detail level.
- Pose and expression.
- Main colour and markings.
- Defining anatomy such as horns, tusks, mane or shell.
- Optional reference image.
- Advanced free-text instructions.

Provide presets such as Friendly Cartoon, Natural Semi-Realistic, Detailed Game Asset, Strong Combat Animal and Young and Cute.

When the user enters only “cow,” create an internal expanded brief using the selected preset and defaults. Show a concise editable summary before generation.

### P0.2 — Create an anatomy and style plan before SVG generation

Add a first structured Gemini step that returns:

- Recognizable species features.
- Anatomy template and required parts.
- Proportions and silhouette.
- Pose.
- Palette and marking placement.
- Layer plan.
- Attachment strategy.
- Required named SVG groups.
- Suggested joints or pivots.

The SVG-generation request must follow this plan. Keep the prompt precise and use the established coordinate and anchor contract.

### P0.3 — Add deterministic technical validation

Validate generated output in application code before visual review:

- Structured response matches the schema.
- Every required part exists.
- SVG fragments are valid XML.
- Only allowed SVG elements and attributes are used.
- Coordinates and view bounds are reasonable.
- Every required attachment anchor exists.
- Visible geometry is present within a configurable radius of each anchor.
- Feet or other ground-contact geometry are near the expected baseline.
- Primary and accent placeholders are valid.
- SVG element, gradient and filter IDs are unique or safely namespaced.
- Required groups have stable IDs.
- Layer definitions are valid.
- Part categories match their strict anatomical sockets.
- The requested orientation is respected where it can be checked reliably.

Return human-readable errors associated with the affected part. Do not use Gemini vision for exact coordinate checks.

### P0.4 — Add visual review

After technical validation, assemble the complete animal and render:

1. A clean preview.
2. A diagnostic preview showing part boundaries and attachment anchors.

Send the previews, original request and expanded design plan to a separate Gemini visual-review call. Require a structured report that scores:

- Species recognizability.
- Anatomical plausibility.
- Overall silhouette.
- Proportion consistency.
- Joint continuity and visible gaps.
- Near/far limb layering.
- Style and palette consistency.
- Ground alignment.
- Clipping and unintended overlaps.
- Readability at mobile-game size.

Every issue should include the affected part, severity, description, suggested correction and whether regeneration is required.

### P0.5 — Add targeted repair

- Regenerate only failing parts rather than the whole animal.
- Give Gemini the original brief, anatomy plan, current part SVG, clean preview, diagnostic preview, validation errors and visual-review report.
- Preserve accepted parts exactly.
- Re-run technical validation and visual review after repair.
- Limit automatic repair to two rounds by default.
- If problems remain, show the warnings and offer manual editing or part-only regeneration.

### P0.6 — Add style references and feedback data

- Create a compact visual style guide from a small number of approved animals.
- Reuse approved examples without flooding the prompt with the entire library.
- Store the original request, expanded brief, preset selections, model ID, prompt version, validation results, review scores, repairs and final user rating.
- Provide draft and high-quality modes.
- Support regenerate-selected-part from the start.

### P0 acceptance criteria

- Entering only “cow” produces a complete editable brief with useful defaults.
- Generated parts pass schema, SVG and anchor-proximity validation before acceptance.
- The app renders clean and diagnostic previews automatically.
- Gemini returns a structured visual-review report.
- A failing head or limb can be repaired without changing accepted parts.
- The process stops after the configured repair limit and clearly reports remaining problems.
- Existing image-reference generation and manual SVG editing continue to work.
- Model and prompt versions are recorded so output quality can be compared over time.

### P0 scope limits

Do not combine this work with the new dynamic anatomy schema, bone editor, game PWA, cloud database or full path editor. Use the existing animal schema during P0 unless a very small backward-compatible extension is required for validation metadata.

## 4. Phase 0 — Protect and document the current application

### Objective

Create a safe baseline before changing the data model.

### Work

- Create a feature branch.
- Confirm the application installs, type-checks, builds and runs.
- Record the current built-in and custom-animal schemas.
- Add a small set of fixture animals for regression testing.
- Add tests around attachment-point calculations and SVG parsing.
- Document the current localStorage migration behaviour.
- Do not redesign the interface in this phase.

### Acceptance criteria

- The current app builds without new errors.
- Bear and cheetah render as before.
- Existing saved custom animals can still load.
- Attachment calculations have automated tests.

## 5. Phase 1 — Create Animal Package Version 1

### Objective

Define the stable format shared by the builder and game.

### Animal package contents

- Package format version.
- Permanent animal ID and asset version.
- Name, description and palette.
- Anatomy template ID.
- Body or central skeleton definition.
- Dynamic list of strict anatomical sockets.
- Dynamic list of parts.
- SVG fragment for every part.
- Local attachment anchor for every attachable part.
- Named SVG groups with stable IDs.
- Layer order.
- Optional pivot and joint metadata.
- Optional gameplay traits and statistics.
- Creation and update metadata.

### Initial anatomy templates

Support only four templates initially because together they expose the important edge cases:

1. **Quadruped:** head, body, forelimbs, hindlimbs and tail.
2. **Bird:** head, body, wings, paired legs and tail.
3. **Serpentine:** head, body and tail, with no legs.
4. **Scorpion:** head or front body, central body, walking legs, claws and segmented tail.

Templates define which categories exist. They do not allow arbitrary replacement between unrelated categories.

### Migration

- Convert the current head, body, frontLegs, backLegs and tail fields into dynamic parts and sockets.
- Rename anatomical concepts to forelimbs and hindlimbs internally.
- Preserve a migration reader for old localStorage animals.
- Do not delete the old data until conversion succeeds.

### Acceptance criteria

- Existing bear and cheetah data migrate automatically.
- A bird, snake and scorpion package can be represented without fake empty leg parts.
- Invalid combinations, such as a wing in a forelimb socket, are rejected.
- The package is validated before it can be published or exported.

## 6. Phase 2 — Add import, export and validation

### Objective

Turn the builder into a dependable asset compiler for the game.

### Work

- Export one official vanilla animal as a JSON package containing SVG fragments and metadata.
- Import a package back into the builder.
- Add schema validation with useful human-readable errors.
- Add a compatibility report that checks required parts, sockets, anchors and IDs.
- Detect duplicate SVG IDs used by gradients, filters and masks.
- Namespace SVG IDs using the animal ID, part ID and asset version.
- Confirm that visible geometry exists near each declared anchor.
- Add a neutral, animation-free export preview.
- Add batch export for an approved animal library.
- Never use this export action for assembled hybrids.

### Acceptance criteria

- Exporting and re-importing an animal produces the same visual result.
- Invalid packages cannot enter the official library.
- Duplicate SVG IDs cannot cause one part to use another part's gradient or filter.
- The exported package is deterministic: unchanged input produces equivalent output.

## 7. Phase 3 — Improve the editor without adding bones yet

### Objective

Replace fragile shape-number editing with a practical object and layer editor.

### Work

- Give every editable SVG group and shape a stable ID and display name.
- Add a hierarchical Layers panel.
- Support parent and child groups, such as head → jaw → teeth.
- Add visibility, lock, rename and reorder controls.
- Add bring forward, send backward, bring to front and send to back.
- Add selection boxes with drag, rotation and corner/side resize handles.
- Add proportional-scaling lock.
- Allow the user to reposition a group's pivot.
- Allow scaling while keeping a selected attachment anchor fixed.
- Add undo and redo before expanding the number of editing operations.
- Keep direct Bézier node editing out of this phase.

### Acceptance criteria

- Moving a nose group moves the nose, nostril, outline and highlight together.
- Moving a jaw moves its teeth and lip.
- Resizing a leg can keep its shoulder anchor fixed.
- Reordering layers changes front-to-back rendering and persists after export/import.
- Adding a new SVG element does not redirect saved edits to a different shape.

## 8. Phase 4 — Add a simple two-dimensional rig

### Objective

Pose articulated parts while preserving their SVG artwork.

### Work

- Add parent-child joints with named pivots.
- Add forward-kinematic posing: rotating a parent moves all descendants.
- Add configurable rotation limits.
- Build three reference rigs:
  - A lower jaw with teeth as children.
  - A three-joint leg.
  - A nine-segment scorpion tail with a stinger.
- Save a neutral bind pose.
- Save optional named poses such as idle, attack and walk-contact.
- Add inverse kinematics only after direct joint posing is stable.

### Acceptance criteria

- Rotating the jaw keeps all lower teeth attached.
- Rotating one tail segment carries every later segment with it.
- Poses survive export and re-import.
- The neutral bind pose always reconstructs the original animal.

## 9. Phase 5 — Create the offline Creature Game PWA

**Implementation status: complete (2026-07-17).** The separate `game/` React and TypeScript PWA includes an eight-animal Package V1 library spanning all four initial anatomy templates, body-driven compatible part selection, shared recipe assembly/rendering, animation, IndexedDB saves, offline shell and asset caching, and manual save export/import.

### Objective

Build the smallest game application that proves exported animals can become playable hybrids.

### Work

- Create a separate React and TypeScript PWA project.
- Extract or recreate the shared renderer from the builder.
- Bundle a small approved animal library with the game.
- Import Animal Package Version 1.
- Use IndexedDB for local player data.
- Cache the application shell and official asset library for offline use.
- Build a hybrid recipe format containing source animal IDs, source versions, selected parts, colours and adjustments.
- Build a simple creature creator driven by the selected body's anatomy template.
- Show only valid anatomical categories.
- Render and animate the assembled hybrid.
- Add manual export/import of local save data.

### Initial content target

Use eight to twelve polished animals, covering at least quadruped, bird, snake and scorpion templates. Quality and compatibility matter more than library size.

### Acceptance criteria

- The PWA installs and starts offline on Android.
- A player can build, name, save, reload and delete a hybrid.
- Saved hybrids remain small recipes rather than duplicated SVG files.
- The same animal renders consistently in the builder and game.

## 10. Phase 6 — Add one complete gameplay loop

**Implementation status: complete (2026-07-17).** Every official part now contributes health, power, armor, speed and traits; anatomy determines locomotion; the result card explains each contribution; a compact deterministic arena resolves in at most twelve rounds; and persistent gene credits unlock additional animals to complete the create → test → reward → unlock → improve loop.

### Objective

Prove that creature construction creates interesting decisions.

### Work

- Assign statistics and traits to individual parts.
- Calculate final creature statistics from selected parts and body rules.
- Support different locomotion sources: legs, wings, fins or serpentine body.
- Build one short game mode only, such as a lane battle, compact turn-based fight or small tactical arena.
- Add a create → test → reward → unlock → improve loop.
- Add a creature result card showing the contribution of every part.
- Balance a small roster before adding more content.

### Acceptance criteria

- Changing a part visibly changes both appearance and gameplay.
- At least several different builds are strategically useful.
- A complete play session is short enough for mobile use.
- Players receive a clear reason to create another hybrid.

## 11. Phase 7 — Polish, sharing and cloud features

Do these only after the offline game loop is enjoyable:

- Shareable creature cards and short animation clips.
- Daily or themed building challenges.
- Expanded animal library.
- Additional rigs and inverse kinematics.
- Accessibility and touch-interface refinement.
- Convex accounts and cloud backup.
- Cross-device synchronization.
- Shared hybrid gallery, leaderboards or multiplayer.
- Play Store packaging, potentially using a web-to-native wrapper.

## 12. Features deliberately postponed

Avoid these during the first milestones:

- Full Figma-style Bézier path editing.
- Flexible mesh deformation.
- Arbitrary parts attached to unrelated sockets.
- User-created new sockets in the game.
- Realtime multiplayer.
- Large open worlds.
- AI generation inside the player-facing game.
- Hundreds of animals before the gameplay loop is proven.

## 13. Suggested repository structure

Keep the builder and game separate, but share stable packages:

- **creature-schema:** types, validation, migrations and package versioning.
- **creature-renderer:** attachment calculations, SVG namespacing, layering, colour replacement and rig transforms.
- **creature-builder:** the existing private asset editor.
- **creature-game:** the offline-first PWA.
- **creature-library:** approved versioned animal packages and fixtures.

This may begin inside one repository as separate folders. Split repositories only when the shared contract is stable and independent releases become useful.

## 14. How to work with Codex or Claude Code

Do not ask an agent to implement this entire roadmap in one prompt. Give it one phase, and preferably one acceptance criterion, at a time.

For every task, require the agent to:

1. Inspect the current implementation before editing.
2. State the files and behaviour it plans to change.
3. Preserve existing custom-animal data through migration.
4. Keep the change narrow and reversible.
5. Add or update tests.
6. Run type checking and the production build.
7. Report remaining risks and follow-up tasks.

## 15. First prompt to give Codex or Claude Code

> Review the current creature-builder repository and implement Priority 0 of the Creature Platform Implementation Roadmap only. Begin by inspecting the existing Gemini generation and modification endpoints, Add Animal interface, SVG parser, attachment calculations and custom-animal storage. Before editing, report the relevant files and divide Priority 0 into small implementation slices. Start with the guided animal brief, structured anatomy/style planning and deterministic technical validation. Then add clean and diagnostic preview rendering, a separate structured Gemini visual-review call and targeted repair of only failing parts, with a maximum of two automatic repair rounds. Preserve the existing animal schema, image-reference workflow and manual SVG editing. Record prompt/model versions and validation results. Add focused tests, then run type checking, tests and the production build. Do not implement the new dynamic anatomy schema, bones, game PWA, IndexedDB or cloud storage in this task.

## 16. Second prompt, after Priority 0 passes

> Implement Phase 0 of the Creature Platform Implementation Roadmap as the baseline and regression-safety pass following the completed generation-quality work. Do not redesign the UI or introduce the new animal schema yet. Document the current animal and attachment data flow, add focused regression tests for attachment calculations, SVG parsing, existing generation, validation and repair behaviour, and confirm that built-in and localStorage custom animals continue to work. Run type checking, tests and the production build.

## 17. Third prompt, after the baseline passes

> Design Animal Package Version 1 according to Phase 1 of the Creature Platform Implementation Roadmap. First inspect the existing types, built-in animal data, custom-animal migration and renderer. Propose the TypeScript schema and migration approach before changing production behaviour. The schema must support strict anatomical categories, dynamic sockets, stable IDs, layer order, quadruped, bird, serpentine and scorpion templates, and the forelimb/hindlimb terminology rule. Preserve backward compatibility with existing custom animals. Implement this as a narrow, tested foundation; do not build the new editor UI, bones, game or cloud storage yet.

## 18. Immediate next action

Start with Priority 0 in the existing repository. Implement it in small slices rather than one uncontrolled rewrite. Do not create the game repository until generated animals are reliably validated and reviewed, and the versioned animal package can be exported, imported and rendered consistently.
