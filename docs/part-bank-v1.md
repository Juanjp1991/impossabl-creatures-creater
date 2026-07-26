# Part Bank Version 1

The part bank stores individual reusable parts, decoupled from the animal that produced them. Its implementation lives in `src/partBank`; the editor UI lives in `PartBankPanel`, `PartBankComposer` and `SlotCandidatePicker`.

## Why it exists

The generation pipeline was already part-level. One `runSampleGeneration` call produces `sampleCount × 5` part candidates, `partCandidateStats` scores each one individually, and the contact sheet lets a human pick a winner per slot. A four-sample run therefore generates 20 parts and keeps 5. The other 15 were discarded on "Use this creature". The bank's primary job is to stop that loss.

## Entry contract

A `PartBankEntry` stores the part art plus the per-slot layout metadata the generator emitted for it: the `BlueprintConnectionProfile` for its slot, limb ground contacts, semantic far/near depth group ids, facing and root-local ground line. Saving a part as a bare SVG string — the copy-paste-into-the-textarea route — keeps only the art, so such entries are marked `source: "manual"` and carry no seam profile.

A banked body is categorically different from a banked limb: the body owns `bodyConnections` (the socket layout) and has no attachment profile of its own. Non-body slots are the reverse.

Entries also carry provenance (source animal, contact-sheet emphasis label, sample index, generator model) and the deterministic stats shown on the contact sheet, which is what makes "which emphasis gives the best tails" answerable after fifty saves.

`revision` and `lineageId` are recorded from the first version even though nothing reads them yet, so pinned revisions can be added later without migrating existing banks.

## Editing model

Copy-on-apply. Inserting an entry deep-copies it into the draft; later edits never propagate back to the bank, and no saved creature can be changed by editing a part. Insertions go through the per-part undo history, so inserting the wrong leg is recoverable.

## Id namespacing

Every insert and every composition runs `namespaceEntry`, which rewrites each `id` in the fragment plus the `url(#…)` and `href="#…"` references to it, and remaps the entry's depth group ids to match. Unlike samples from one generation run, bank entries have unrelated origins: two parts that both ship `<linearGradient id="fur">` do not error, they silently repaint each other. This mirrors `namespacePartSvg` in the package compiler, generalised to a bare prefix.

## Composition

`composeFromEntries` wraps `assembleFromPartDrafts` — the same function the contact sheet and the cross-species evaluator use, so a bank composition is valid by construction: every part shares the fixed local views and the fixed anchors. It adds two things:

- id namespacing, as above;
- dropping a layout block that carries no information. `assembleFromPartDrafts` always emits one, and `validateAnimalDraft` gates its whole layout section on that block merely being present. Composing hand-authored or legacy parts, which never had ground contacts or depth groups, would otherwise report errors for metadata that was never claimed. Absence is valid and reads as legacy, exactly as the package layer treats it.

Measured on the built-in Grizzly Bear parts: composing through the bank reports 16 errors and 7 warnings, identical to validating the same art directly. Before the layout fix it reported 20 and 13.

## Per-slot re-roll

There is no per-part generation endpoint, so "re-roll" generates whole animals and keeps one slot from the pick. The other slots of each sample stay bookmarkable in `SlotCandidatePicker`, so the spend is not wasted.

## "More like this"

`runPartVariations` (`src/generation/partVariations.ts`) is the exploit half of the loop, where re-roll and the contact sheet are the explore half. It asks `/api/modify-animal` for N nudged versions of a part you already chose, seeded with that exact art. The endpoint already enforces the important half of the contract: with a specific `targetPart` it returns only that part's SVG, treats every other part, colour and connection as immutable, and 422s when the part comes back unchanged.

Diversity within a round comes from prompt variation, not temperature — the proxy runtime never sends one. Each call gets a different `VARIATION_ANGLE` (proportion, features, markings, attitude, simplify, enrich, line, asymmetry), and all calls in a round share a `VariationStrength` directive: `tight` (same part, refined), `moderate` (same design language, visibly different) or `loose` (the part as inspiration rather than constraint). Free-text steer is layered on top of both rather than replacing them.

Results are shaped as `GeneratedSample[]`, so `SlotCandidatePicker` renders a variation round with no changes — same stats, same bookmark-to-bank on every candidate. Each candidate also carries its own "more like this", so a round can be re-seeded from any result: pick the best of four, ask for six around it, pick again. The `label` field on `GeneratedSample` exists for this: variation angles do not line up with `SAMPLE_EMPHASIS_LABELS`, and a round can exceed four candidates.

Two details worth keeping:

- The seed is the whole current creature with the chosen art substituted into the target slot, not the part alone. The endpoint is prompted with every part's SVG, so variations come back fitted to the body and limbs they will sit on.
- `variationSample` keeps the *seed's* `layoutMetadata`. A targeted edit does not restate it, so taking it from the response would drop the seam profile, ground contacts and depth groups the seed already had.

Entry points: each candidate on the contact sheet ("keep this one and generate more like it", which adopts the composition first), each candidate in the variation picker, and a `vary` button on every SVG editor row. The strength/count/steer controls appear both in the picker and above the SVG editors, because otherwise the first round of a `vary` would be stuck on the defaults.

## Storage

`creature_builder_part_bank`, separate from `creature_builder_custom_animals`: different lifetime, different size profile. A corrupt record is filtered out rather than throwing, so one bad entry cannot take the bank with it. `QuotaExceededError` is surfaced as `PartBankQuotaError` rather than swallowed — localStorage is ~5MB and part SVGs are not small, so a full bank is a question of when. Import re-issues ids that already exist, so importing the same file twice never clobbers local edits.
