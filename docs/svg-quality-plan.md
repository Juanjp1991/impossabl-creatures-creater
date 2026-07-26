# SVG Quality Plan

Plan for raising the visual quality of generated parts. Written after the part bank and "more like this" work, and grounded in what those loops exposed: generated parts are already *technically* clean — the fox run came back with 0 validation errors, seam 361, fill 91%, 19 elements — while still reading flat and under-drawn inside the silhouette. The failure is richness, not correctness, so this plan targets the structural causes of thin output rather than adding more rules to the validator.

Shape control from a reference image **is** in this plan, scoped to conformance measurement rather than tracing — see Phase S. Deterministic tracing and automatic segmentation remain out; see "Deferred" at the end.

Revised after tracing the reference-image path, which turned out to be effectively inert in normal use. That finding invalidated part of the original reasoning here: the first version of this plan argued shape control was unnecessary because observed failures were under-drawn interiors rather than wrong shapes. That conclusion was drawn while the shape-guidance mechanism was broken, so it could not have been tested. Phase R and Phase S exist to correct it.

## The two structural causes

**One call draws everything.** `/api/generate-animal` produces all five parts plus `layoutMetadata` in a single structured response, capped at `maxOutputTokens: 16384`. The prompt asks for roughly 59 shapes (head 18, body 17, each leg set 9, tail 6). Quality decays across a long structured output, and the fields generated last — tail is last, and is also asked for least — are the ones that come back thinnest. The same system instruction simultaneously carries per-slot coordinate spaces, attachment anchors, body-local connection ranges, limb collars, seam pixel minimums, ground contacts, layer order, depth group IDs, layout metadata, the colour ramp, stroke weights, density bands and the style guide. Every rule competes with the drawing task for the same attention.

**The style is described, never shown.** `approvedStyleGuidePrompt()` emits six prose principles and a version string. Its `examples` field is the literal strings `["built-in bear", "built-in cheetah"]` — no actual SVG reaches the model. Prose is the weakest way to move style, and the nominal exemplars are poor: the built-in bear fails `validateAnimalDraft` with 16 errors (raw hex fills, missing `*-root` stable groups, off-standard stroke widths).

## Phase R — Make the reference work

The reference image is sent to auto-fill, whole-animal generation, re-roll and variations. In practice it is usually `null` by the time any of them run.

`uploadedImage` is React state inside the open dialog and is persisted nowhere — not on the animal, not in `GenerationMetadata` (which stores only `referenceMode`), not in storage. The dialog unmounts on close, so opening a saved animal later to refine its legs runs with no reference at all while the mode still reads "close match". Nothing in the UI near the re-roll and vary buttons indicates whether a reference is active, so the feature is invisible whether or not it is working.

**R1 — Persist, downscale, and show it.** Store the reference with the animal, resized to roughly 512px on the long edge. Downscaling is not only about storage: the full data URL, up to 5MB, is currently re-sent on every call in a round, so a six-variation round uploads the same photo six times. Add a "reference active: match / inspire" indicator beside the vary and re-roll controls.

### R1 storage design — hybrid, not a migration

Measured on a real roster (11 animals, 8 bank entries): **256 KB total**, about 5% of a ~5 MB origin budget. The roster averages ~21 KB per animal and bank entries ~2.9 KB each, which leaves room for roughly 230 more animals or 1,700 more parts. Neither is close to forcing a storage change.

Reference images are what force it. A 512px JPEG is ~40–80 KB, and base64 inflates it by a third — so **one reference costs about what four whole animals cost**. At 50 animals that is ~4 MB of references against ~1 MB of everything else.

So: **reference images go to IndexedDB from the start; the roster and part bank stay on localStorage.**

The point is that references are new code, so there is nothing to migrate — just a small async blob store keyed by animal id, read once in an effect when the dialog opens, with a placeholder while it loads. No conversion, no dual-read fallback, no risk to existing data.

Migrating the two existing keys is deliberately *not* part of this. The cost is not the store, it is that IndexedDB is asynchronous and localStorage is not: `getInitialAnimals()` in `App.tsx` and `loadPartBank()` in `usePartBank` are both synchronous `useState` initializers. Converting them means loading states, a changed boot sequence, and a `StorageLike` interface that can no longer be synchronous — which would also break the part-bank tests, which inject a synchronous fake. That is real work for no user-visible benefit at 5% utilisation.

Revisit the full migration when either trigger fires:

1. Roster plus bank passes ~2 MB, leaving time to do it unhurried.
2. A `PartBankQuotaError` surfaces — that path already exists, so a genuine quota failure appears as a readable message rather than a silently lost save.

Cheaper lever first if space does get tight: `generationMetadata` is frequently larger than the artwork it describes (one stored animal carries 20.9 KB of metadata against 11.9 KB of SVG) because `validationHistory`, `reviewHistory` and `attemptHistory` accumulate and are never trimmed. Keeping only the final validation would roughly halve the roster without touching the storage engine.

**R2 — Part-scoped reference directive.** `referenceDirective` is written for whole animals: in match mode it asks the model to match side-view silhouette, pose, head/body ratio, limb folding, ground stance, visible digits, palette placement and external tail. When `targetPart` is `frontLegs`, most of that names things the model is explicitly forbidden to change. Swap in a per-part directive that speaks only about that part and says to ignore the rest of the image. Server-side prompt change only.

**R3 — Crop the reference to the part.** Drag a box on the uploaded image and send only that crop for a part-targeted call. The image becomes its own region hint, which is far stronger than asking the model to find the right region — and it is what makes Phase S cheap.

## Phase S — Shape control from a cropped reference

Enabled by R3. Once you supply the crop, the app never has to segment a whole-animal silhouette into five parts, which was the hardest problem in the original silhouette proposal.

**S1 — Conformance scoring.** Rasterise the cropped reference onto that slot's fixed grid and compute IoU against each candidate's `PixelMask`. `shapePixels` already produces those masks, and `intersection` already exists for seam measurement; the missing half is rasterising a bitmap, which needs `getImageData` and therefore belongs in a browser-side sibling module rather than inside the deliberately DOM-free `geometry.ts`.

Surface the score as a stat chip beside seam/fill/elements on every contact-sheet and variation candidate, and feed it into `candidateRank` so the picker orders candidates by how well they match your shape. This lands directly inside the re-roll and vary loop: generate six, and the closest to your silhouette sorts to the top.

**S2 — Silhouette underlay.** Draw the cropped reference ghosted behind the isolated part preview and the gizmo canvas, so the drift being measured is also visible and can be corrected by hand.

Known limitation: `shapePixels` approximates bezier paths by their control polygon rather than flattening them, so IoU is slightly soft on curve-heavy parts. Good enough to rank candidates; not good enough for a hard pass/fail gate. Treat the number as an ordering signal, never as a validation rule.

Independent of Phase 1, so it does not wait on the largest change.

## Phase 0 — Baseline harness

Nothing below is worth shipping unattributed. Before changing generation, capture what today produces.

- A script that runs one fixed brief N times against a fixed model and records, per slot: validation errors by code, element count, fill ratio, seam pixels, and whether the slot came back at all.
- Everything needed already exists: `validateAnimalDraft`, `analyzeDraftGeometry`, `partCandidateStats`, `DENSITY_BANDS`, `FILL_BAND`.
- Store runs as JSON under a gitignored scratch directory so before/after comparisons survive between sessions.

Deliverable: a table of per-slot medians. Every later phase reports against it.

Success signal: element counts sit mid-band rather than at the floor, fill ratio inside 65–95%, and error counts flat or lower.

## Phase 1 — Per-part generation

The largest lever. Replace the single mega-call with one focused call per slot.

**Endpoint.** A new `/api/generate-part` taking `{ slot, brief, palette, bodyContext, exemplars, image, referenceMode, modelId }` and returning `{ svg, layoutMetadata }` scoped to that slot alone. `/api/generate-animal` stays until the new path is proven, then becomes a thin orchestrator or is retired.

**Ordering.** Body first — it owns `bodyConnections`, and identity/palette are decided there. The four attached parts then generate in parallel against the chosen body.

**Consistency is the main risk.** Five independent calls can disagree on style, proportion and palette. Three mitigations, all of which the codebase already supports:

1. Fix `color`/`accentColor` as concrete hexes before the attached parts are drawn, and pass them in rather than letting each call invent them.
2. Pass the chosen body SVG as context to each attached-part call — the same trick `/api/modify-animal` already relies on, which is why its variations come back fitted to the animal around them.
3. Keep the shared house-style block identical across all five calls; vary only the slot-specific section.

**Prompt split.** Shared core: the colour ramp, stroke weights, the no-gradients/no-wrapper rule, and the root group ID convention. Slot section: only that slot's local view, its attachment anchor, its density target and band, and an anatomy checklist for that part. A head call should never be told about hind-leg hock continuity.

**Post-processing stays as it is.** Generate the five parts, assemble them with `assembleFromPartDrafts`, then run the existing `normalizeGeneratedSvgSyntax` → `normalizeAnimalDraftCoordinates` → `snapAttachedPartsToAnchors` → `validateAnimalDraft` chain on the assembled draft. This keeps the whole normalisation and validation surface untouched and is the lowest-risk integration point.

**Knock-on benefits.**

- Re-roll and "vary" stop generating whole animals to keep one slot — the compromise recorded in `docs/part-bank-v1.md`. A four-candidate head re-roll becomes four head calls instead of four whole animals.
- The part bank becomes the natural unit of generation rather than a harvesting layer.
- Each call gets the full token budget for one part, so the 16k cap stops being a ceiling on total detail.

**Cost.** Five calls instead of one, but each emits roughly a fifth of the SVG, so total output tokens are comparable. Latency becomes two waves (body, then four in parallel) rather than one long call. Per-slot re-rolls get substantially cheaper.

## Phase 2 — Exemplars from the part bank

Show the style instead of describing it, using art the user has already judged.

- Add an `exemplar` flag to `PartBankEntry`, distinct from `favorite` so bookmarking stays personal and exemplar selection stays deliberate.
- `buildExemplarBlock(slot, entries)` selects up to two exemplars for the target slot and formats them as few-shot examples.
- The client sends them with the generate-part call, since the server cannot read localStorage.
- Budget-aware selection: part SVGs are large. Cap each exemplar by character length and prefer clean, in-band, low-error entries — the bank already stores `stats` per entry, so this can be ranked rather than guessed.
- Fall back to today's prose principles when no exemplar exists for that slot.
- Retire the misleading `examples: ["built-in bear", "built-in cheetah"]` and bump `APPROVED_STYLE_GUIDE_VERSION`; the bear is not art worth copying.

This is where the bank compounds: every part kept makes the next generation better, and the loop closes on the user's own taste rather than on a fixed house style.

## Phase 3 — Multi-model contact sheet

Today `sampleCount` samples means one model with four emphasis paragraphs. Model choice is a far larger source of variance than prompt nudging.

- `runSampleGeneration` accepts `modelIds[]`; sample *i* uses `modelIds[i % n]`.
- Show the model on each contact-sheet candidate alongside the emphasis label.
- Bank provenance already records `models.generator`, so after enough saves the bank answers "which model draws the best tails" from real data.

Small change — the model list is already fetched and the sample runner already exists — with a potentially large payoff, and it produces evidence that informs every later choice.

## Phase 4 — Two-pass detail

Split drawing from enriching, which is the strongest part of the original two-pass idea and needs no new endpoint.

- Pass A generates base masses, targeting the lower half of each density band.
- Pass B is a detail/shading pass over the result: `/api/modify-animal` with a `targetPart`, the `tight` variation strength ("preserve silhouette, change only what is named") and a fixed detail directive covering volume shading, secondary contours and species markings.
- Implemented as a preset instruction on the existing `runPartVariations` plumbing rather than new transport.
- Measurable: element count should move from the low band into mid-band between passes, and `analyzeDraftGeometry` will confirm the silhouette did not drift.

Sequenced last because Phase 1 may already close most of the gap — a part drawn with the model's full attention may not need a second pass. Re-measure before building it.

## Deferred — Tracing and automatic segmentation

Two specific pieces stay out. These objections are independent of the reference-path finding above and still hold:

- **Trace-to-geometry.** Marching squares on a bitmap produces hundreds of points and stair-stepped edges, against the `DENSITY_BANDS` element caps and the stroke-width rules the validator enforces. A raw trace would fail the project's own standards and read as traced rather than drawn. If tracing ever returns it should be a constraint layer the model draws against, not the geometry that ships — and only after Phase S shows the shapes are genuinely off.
- **Automatic five-part segmentation** of a whole-animal silhouette. Unnecessary while R3 lets the user supply the crop. The `referenceFeatures` normalized bounds the planner already emits would be the starting point if this is ever wanted.

Also noted: a flat silhouette carries no depth information, so limb far/near groups always have to come from the model or the user regardless of which shape work is built.

## Order and rationale

1. **R1 + R2** — make the reference survive and aim it at the part. Small, self-contained, and until the reference outlives a dialog close every other reference improvement is invisible.
2. **R3** — crop-to-part. Promoted from optional to foundational: it is what makes Phase S cheap.
3. **P0** — baseline harness. Turns every later phase from an opinion into a measurement.
4. **S1 + S2** — conformance scoring and underlay. Independent of P1, and delivers shape control inside the loop that already works.
5. **P3** — multi-model sampling. Cheap, independent, and produces evidence that informs P1.
6. **P1** — per-part generation. The largest change and the only structural fix for thin output; sequenced after P0 so its effect is provable.
7. **P2**, then re-measure before **P4**. Exemplars land best once generation is per-slot, and Phase 1 plus exemplars may close the gap without a second pass.

R1–R3 and S1–S2 do not touch the generation pipeline and leave the re-roll/vary loop unchanged. P1 is the only item that carries real structural risk; the plan keeps `/api/generate-animal` alive alongside the new path so it can be proven before anything is retired.
