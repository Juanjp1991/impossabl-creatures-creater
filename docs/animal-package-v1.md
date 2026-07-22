# Animal Package Version 1

Animal Package V1 is the stable data contract intended to be shared by the creature builder and the future game. Its implementation lives in `src/animalPackage` and does not change the current editor's runtime data model yet.

## Identity and immutability

- `animalId` is permanent across revisions.
- `assetVersion` is a SemVer revision. A published `(animalId, assetVersion)` package is immutable.
- Part, socket and named-group IDs are stable and cannot depend on array positions.
- `formatVersion` is currently `1.0.0`.

## Anatomy

The initial templates are quadruped, bird, serpentine and scorpion. Every template declares exact part and socket categories. V1 sockets accept one strict category only, so a wing cannot be placed in a forelimb socket.

The selected body is the central skeleton root and owns the attachment sockets. Every non-root part declares both its target socket and its local attachment anchor. Forelimbs and hindlimbs replace the old internal `frontLegs` and `backLegs` terminology; near and far remain visual-depth terms only.

V1 also permits backward-compatible geometry metadata. A package may declare left/right `facing` and a root-local `groundY`. Sockets may declare an outward normal, seam width, minimum overlap and allowed uniform scale range. Attachments may declare the opposing normal, seam width and neutral connection depth. Limb parts may declare local paw/foot contacts (including deliberately raised contacts) and semantic far/near group IDs. These fields are optional: their absence is valid and produces `legacy` compatibility rather than guessed migration data.

`assessPartCompatibility` reports `exact`, `adjusted`, `legacy` or `incompatible`, plus auto-scale, a bounded vertical ground correction and stable warnings. Wrong categories, absent target sockets and opposite facing fail closed. Same-category geometry that needs safe scaling or retains a residual ground mismatch remains selectable with warnings.

## Legacy migration

`migrateLegacyAnimalToV1` converts the existing five-part animal shape without mutating it. `migrateLegacyStorageSnapshot` converts a localStorage JSON snapshot and returns `canCommit: true` only when every record succeeds. Callers must retain the original `creature_builder_custom_animals` value until that point.

The migration wraps each legacy SVG fragment in one stable root group and preserves the existing visual layer order. Existing bear and cheetah fixtures are covered by automated migration tests.

## Validation boundary

`validateAnimalPackageV1` returns human-readable path-based issues. `assertPublishableAnimalPackageV1` is the required guard for future publish/export actions. It checks package identity, template part/socket counts, strict attachment compatibility, stable IDs and named groups, view boxes, SVG fragments, anchors, palette values, root skeleton and layer order. Optional profiles are checked for finite positive dimensions and ordered scale ranges. Declared limb depth groups must exist exactly once, and visible limb geometry must be nested under the far or near group.

## Phase 2 compiler

`compileLegacyAnimalPackage` converts existing builder animals, namespaces every SVG ID with animal, part and asset-version identity, validates the result and produces deterministic JSON through `serializeAnimalPackage`. Cross-part gradient, filter, mask and clip-path references are rewritten with their IDs.

`parseAnimalPackageJson` rejects malformed or incompatible packages before they enter the library. The current five-part editor can re-open validated quadrupeds through `animalPackageToLegacyEditorAnimal`; other valid anatomy templates remain representable in the package layer and will become editable when the dynamic editor is introduced.

`buildNeutralPackagePreview` renders packages without animation using declared sockets and local anchors. Its ground line comes from root-local compatibility metadata, declared ground contacts or occupied geometry rather than a fixed canvas coordinate. The builder's Animal Package panel exposes selected export, validated import and batch export of the built-in approved library.

The hybrid renderer transforms body-owned socket targets together with body scale/rotation, applies automatic uniform scale before the recipe's manual scale, and rotates/scales attached parts around their attachment anchor. New quadrupeds use template slots in this order: tail, far hindlimb, far forelimb, body, near hindlimb, near forelimb and head. Legacy unsplit limbs keep their whole-part layer.

Optional Phase 4 rig definitions, neutral bind rotations and named poses are serialized with the package. Validation confirms that every joint targets a real part and namespaced SVG group before publication.
