# Prompt: The diff from my current repo to a minimum viable asset pipeline

> Copy everything below the line into Fable 5.

---

You are a senior TypeScript architect. I need a **detailed implementation plan** — not code yet — for the next iteration of an SVG creature generator. **I already have a substantial, working repo in this exact stack.** Section 0 describes what it contains. Your plan must be a **diff against that repo — keep / modify / delete — not a greenfield design.** If you propose building something section 0 says already exists, you have misread the brief.

**Read section 0 and section 2 first.** Section 0 is what exists. Section 2 is scope discipline. Together they are more important than any single feature request below.

## 1. The product

A browser game inspired by *Impossible Creatures*. The player builds hybrid creatures from **five parts**: head, body, front legs, back legs, tail. Each part can come from a different animal, so one hybrid combines up to five species.

Two halves: a **dev-time asset generator** using LLMs to produce parts as SVG, and a **ship-time game** that is a pure static frontend consuming a pre-generated JSON asset pack. Both already exist in skeleton form (section 0).

## 0. Current state — the repo you are editing

This is not a fresh project. Treat every item below as already built and working unless I say otherwise. File paths are given so you can be concrete about what to change.

### 0.1 What the repo already is

The dev-time generator is **already "Version A (raw model SVG) wrapped in deterministic enforcement"** — which is the architecture I ask for in sections 4–5. It runs end to end today: a guided brief → an anatomy/style **planner** LLM call → a **generator** LLM call that emits raw `<path>` data for all five parts as structured JSON → deterministic normalization → a deterministic **validator** → a vision-based **reviewer** LLM call → an automatic **repair loop**. So the interesting parts of "Stage 1" mostly exist. Your job is to correct and prune them, not recreate them.

### 0.2 What already exists, by system

- **Deterministic structural enforcement (§5.1) — built and mature.** `src/generation/validation.ts` (`validateAnimalDraft`, `VALIDATOR_VERSION = "p1-svg-validator-3.0.0"`): a tag/attribute **whitelist that rejects** (not sanitises), node/coordinate bounds caps, required-group-id checks, per-part anchor checks, palette-placeholder checks. `src/generation/geometry.ts` (`analyzeDraftGeometry`) rasterises each part to a pixel mask and checks **seam overlap** inside an 18px joint zone, unrelated-part intersection, and **ground-line alignment** — the exact structural guarantees §5.1 wants, already computed numerically.
- **Coordinate/anchor normalization — built.** `src/generation/normalize.ts` (`normalizeAnimalDraftCoordinates`, `normalizeGeneratedSvgSyntax`) already **snaps** parts drawn on a global canvas back into fixed local part coordinate spaces, and rewrites raw hex fills to `primary`/`accent` placeholders. Note this is currently a *fallback* path (see §5.1 decisions).
- **Vision review + automatic repair loop — built, and it is the thing I want to reconsider.** `src/generation/clientPipeline.ts` runs a multi-attempt loop: render → `/api/review-animal` (multimodal QA scoring 13 categories) → `/api/repair-animal` / `/api/regenerate-animal`, keeping the best candidate via a tuple comparison in `src/generation/quality.ts` (`assessCandidate`, `QUALITY_POLICIES`). This is exactly the "validate → LLM-review → two-round-repair" loop that section 4 says *often made things worse.* It is still the whole pipeline. See §5.3 — I expect you to tell me to cut most of it.
- **Server + provider adapter — built.** `server.ts` exposes `/api/generate-animal`, `/api/review-animal`, `/api/repair-animal`, `/api/regenerate-animal`, `/api/modify-animal`. It talks to the Google GenAI SDK **or** an OpenAI-compatible proxy (`createOpenAiProxyClient`) selected by env. This already covers most of what section 7 calls "multi-provider abstraction," so do not scope that as new. My real runtime is the proxy path (see §5.3 provider reality).
- **Ship-time asset model + game — built.** `src/animalPackage/` defines `AnimalPackageV1` (`schema.ts`, `templates.ts`, `compiler.ts`, `hybrid.ts`, `validation.ts`) with anatomy templates **already including quadruped, bird, serpentine and scorpion**, socket/anchor points, hybrid recipes and save bundles. `game/` is a separate static Vite app that consumes it (`game/src/library.ts`, `recipes.ts`, `HybridPreview.tsx`). The generator's `AnimalDraft` reaches the game by being saved as the editor's `Animal` type and compiled to `AnimalPackageV1` via `compiler.ts`. **A second data model does not need inventing — reconcile with this one.**
- **Editor extras — built, out of scope for you.** A stable SVG-layer editor and a Phase-4 forward-kinematic rig (`src/editor/`, `src/rig/`, `docs/`). Ignore unless a change forces you to touch them.

### 0.3 What this means for your deliverables

For every system in 0.2, your plan states **keep as-is / modify (how) / delete**. The most valuable output is an honest list of what to *remove*, because the repo is now over-built for a 10-animal fun-test. Prefer deletion. When you recommend modifying a file, name it.

### 0.4 Reference examples — real output in `examples/`, all from my actual model (gpt-5.6-sol via proxy)

Three exhibits are committed so you can calibrate against real output, not my description of it. Read the `.svg` (it's text — the constants are literally in it) and the `generation info` / `readme` sidecar next to each.

- **`examples/llm-svg/almost acceptable example/` (tiger) — the good case, and the bar to clear.** Clearly a tiger: correct stripes, face, palette, four legs. This is the "likeness is good" claim, proven. But note the failures the enforcement *didn't* stop: the sidecar shows it still finished with **warnings** (head geometry misses its neck anchor; fore/hind legs overlap the torso 30–35%, over the 25% cap), the reviewer scored it *mascot-like* (referenceFidelity 4, anatomicalPlausibility 4, proportionConsistency 4) despite speciesRecognizability 8, and it took **256 s with 2 automatic repairs**. Mine this file for §5.2's constants (see there).
- **`examples/llm-svg/failed example/` (hippo) — the failure mode, with receipts for cutting the repair loop.** The render is two disconnected islands: a head floating left of an isolated torso, legs reduced to detached stubs, no real tail. The sidecar is the important part: **~537 s (9 minutes), stop = `technical-failure`, rescue used, and both repair attempts made it strictly worse — technical errors went 19 → 20 → 38, so the best attempt was the original (attempt 0).** This is direct evidence for §5.3: the review/repair loop burned nine minutes to *degrade* a bad result. It also shows the per-part scale divergence §5.2 must fix — the five parts were authored at normalization scales of 0.19–0.62, a ~3.2× spread inside one animal.
- **`examples/parametric/failure/` (hippo hybrid) — the Version B ceiling.** Assembles perfectly, seams clean, cross-species (hippo head/body, crocodile forelegs, beaver tail) — and reads as a generic smooth blob. The sidecar note: *"generation gives too simple an animal, not recognisable."* This is exactly the trade-off in section 4, made visual: predictable and interchangeable, but no species likeness.

Together these bound the target: Stage 1 must reach the tiger's *likeness* while guaranteeing the parametric example's *structural cleanliness*, without the hippo's nine-minute failing loop. When you cite these in your plan, point to them by folder.

## 2. Scope discipline — read this before anything else

I am **not** at production stage. I need enough asset quality to test whether the game concept is fun. My real risk is not bad animals — it is a pipeline so elaborate I never ship a game. The repo already shows that failure mode starting (0.2's repair loop, reference-image machinery, rig).

So structure your plan in two clearly separated stages:

- **Stage 1 — Essential.** The smallest change to the *current repo* that reliably produces roughly 10 usable animals. Target: **a few days of work.** Because enforcement already exists, "a few days" is realistic *only if you cut aggressively.*
- **Stage 2 — Later.** Everything else, scoped but explicitly deferred until the game concept is validated.

For every feature you place in Stage 1, justify why it can't wait. **Prefer removing things.** If something already in the repo should be cut or deferred, say so — I would rather delete than add. No new provider abstraction layers, plugin architectures, or configuration systems; the ones that exist are already more than enough.

## 3. Hard constraints

- **SVG only.** No raster assets, no image hosting.
- **Frontend-only game.** Static hosting, no API calls at play time.
- **Must run on old phones** (old Android WebViews). Limits node counts, bans expensive SVG features. **Note:** the current whitelist in `validation.ts` (`ALLOWED_TAGS`) actually *permits* `lineargradient`, `radialgradient`, `filter`, `feDropShadow`, `feGaussianBlur`, `mask` and `clipPath` — i.e. it allows exactly the features this constraint should ban. Closing that is part of §5.2.
- **Every part must be interchangeable with every other part of the same slot**, across all species.
- TypeScript + React + Vite, few dependencies. Build on the existing repo; do not restart it.

## 4. The two versions I've built, and the trade-off

### Version A — LLM writes raw SVG path data (this is what the repo runs today)

The model receives a style guide and anatomy plan, then emits raw `<path>` data for all five parts, targeting fixed anchors in five local coordinate systems.

- **Worked: species likeness was good.** Animals were recognizable — the trunk, the beak, the mane.
- **Failed:** unpredictable. Seams didn't close, limbs floated, anchors were missed, style drifted, quality decayed across long output. It needed a validate → LLM-review → repair loop, and that loop often made things worse. **The repo is the current answer to those failures via deterministic enforcement (0.2). The enforcement worked; the review/repair loop bolted on top is the part still hurting me.**

### Version B — fully parametric

Geometry in TypeScript; the model output only JSON parameters plus a palette. Predictable, tiny, error-free — but the animals were generic quadrupeds, unrecognizable. (Vestiges of this survive as the hardcoded placeholder art in `game/src/library.ts`.)

### Diagnosis — challenge this if you disagree

Species recognizability lives in idiosyncratic features that don't fit a shared parameter space — a trunk, antlers, a hump, a beak. **Structural correctness from code, likeness from the model.** Version A's generation approach was right; its lack of enforcement was wrong, and enforcement now exists. Do not propose replacing raw-SVG generation. Alternative architectures belong in Stage 2 (section 7).

## 5. Stage 1 — the essential work (mostly editing what exists)

Design these four things. For each, start from what the repo already does (§0.2).

### 5.1 Deterministic structural enforcement — mostly built; resolve three contradictions

The enforcement exists. But three of my original principles are **contradicted by the shipped code**, and the plan I wrote before never noticed. Give me a decision on each, with a recommendation:

- **Anchor snapping.** *Principle:* never ask the model to hit an anchor — let it draw, then translate in code. *Reality:* the generator prompt in `server.ts` explicitly asks the model to hit fixed local anchors (`head (120,110)`, etc.), and `validation.ts` **errors** (`anchor.geometry`) when geometry isn't within 32px of the anchor. Snapping (`normalizeAnimalDraftCoordinates`) only runs as a fallback when the model draws on a global canvas. **My lean: adopt snap-always** — drop the anchor-hit demand from the prompt and the `anchor.geometry` error, and translate every part in code. Confirm or argue against, and specify the exact prompt/validator edits.
- **Collar generation (the overlap into the torso).** *Principle:* generate it deterministically; don't request it. *Reality:* the prompt *requests* a "24–40px upper-limb collar" in prose and the validator only *checks* the resulting overlap — precisely the anti-pattern I warned against. **My lean: for Stage 1, keep request-and-validate and stop pretending it's deterministic; move real deterministic collar generation to Stage 2** (it's genuine geometry work). Agree or push back.
- **One part per call.** *Principle:* one part per call — long five-part outputs decayed. *Reality:* `/api/generate-animal` emits all five parts in one structured response, and the prompt literally says *"do not use body-first generation."* This contradicts both the principle and §5.3 below. **Reconcile all three into one position.** If you adopt §5.3's parallel sampling, per-slot calls fall out naturally.

Keep the whitelist, node caps and geometry/seam/ground checks that already exist. Tighten the whitelist per §3 (ban gradients/filters/masks/clipPath).

### 5.2 A single global canonical standard — the biggest genuine gap

This is the thing I most want, and the current repo does **not** have it. `src/generation/styleGuide.ts` is *prose* ("approved-bear-cheetah-2.0.0"), and the validator never checks a global stroke weight or detail density. My earlier draft scored each part relative to its own animal — wrong, because the whole game is cross-species mixing. Fifty internally-consistent animals combine worse than fifty conforming to one shared standard.

Define **one canonical reference for the whole roster** as **hard constants checked in `validateAnimalDraft`**, not prose:

- **one fixed stroke-weight constant.** The good tiger example already converges on this: every one of its five root groups uses `stroke-width="3"` for the silhouette outline, with `1.2–1.5` reserved for fine internal marks (whiskers, folds). Make it a constant (silhouette outline = 3, internal detail ≤ 1.5) and reject any `stroke-width` off it beyond a small tolerance.
- **one shared silhouette scale.** The failed hippo proves this is unenforced: its five parts were authored at normalization scales of **0.19–0.62 — a 3.2× spread within a single animal**, which the normalizer silently rescaled. Partly implicit already in the fixed per-part view dimensions (`PART_CONFIG`) and the blueprint scale range; promote it to one explicit global constant and reject (don't silently rescale) parts whose authored scale falls outside a tight band, so cross-species parts share one true "unit of shoulder height."
- **one palette system used by every animal.** This is the most clearly broken constant today: the tiger SVG uses **~20 distinct raw hex fills** (`#C96B27`, `#D47A30`, `#CE7028`, `#E0A04E`, `#F0DDB5`, `#E7A44F`, …) and only *intermittently* uses the `var(--primary)` / `var(--accent)` placeholders — so no two animals will share a palette and hybrids will clash. It's half-built (`primary`/`accent` placeholders + `promoteDominantFillToPrimary`); finish it by **rejecting raw hex outside a small declared ramp** (primary, accent, and a fixed handful of shared shade steps) rather than letting each animal invent its own 20 colours.
- **one detail-density target.** The tiger is at the *over*-detailed end — its body group alone has ~34 child paths and its head ~44 (hundreds of nodes), which both blows the old-phone budget and drives the long-output quality decay from section 4. Check node-count-per-part sits in a band: too few reads as a generic Version-B blob, too many is the tiger's problem.

Specify each constant's value and the exact check to add — the tiger and hippo files give you real numbers to set them from. This is four small additions to an existing validator, not a new subsystem.

### 5.3 Parallel generation with part-level selection — the main new architecture; say what to delete

Generate every animal **N times in parallel** (default 5) and select the best individual part per slot, assembling one final animal from the winners. Selecting per slot turns one multiplicative gamble into five independent ones:

| Per-part quality | Best whole animal of 5 | Best part per slot |
|---|---|---|
| 50% good | 15% | **85%** |
| 30% good | 1% | **40%** |

**This replaces the automatic review/repair loop — say so explicitly.** The repo's `clientPipeline.ts` attempt loop, the `assessCandidate` tuple in `quality.ts`, and the `/api/repair-animal` + `/api/regenerate-animal` "full rescue" machinery are the loop section 4 says makes things worse — and the failed-hippo example in `examples/` proves it with numbers: **9 minutes of wall-clock, two repair attempts that drove technical errors 19 → 20 → 38, and a final result worse than the un-repaired original** (best attempt = 0, stop = `technical-failure`). N parallel independent samples would have spent the same budget producing N shots at a *good* body instead of iteratively wrecking one bad one. Your plan must state plainly: **parallel-sample-and-select supersedes it; demote repair to a manual "touch up one part" action; delete the multi-round loop, the rescue path and the tuple comparison.** This is the plan's most important cut.

Consequences to address, corrected for my actual runtime:

- **Provider reality — this changes your temperature advice.** I do not run Gemini directly. I route through a local OpenAI-compatible proxy (CLIProxyAPI) to **gpt-5.6-sol on a ChatGPT subscription** (`server.ts` proxy adapter; `GEMINI_MODEL` is just the routed id). Therefore: (a) it's a **reasoning model — sampling temperature is typically ignored**, so "raise temperature for diversity" is largely a no-op; the real diversity levers are **prompt variation** and **`reasoning_effort`**. Lead with those. (b) A personal subscription has **concurrency/rate limits**, so "5× in parallel" will serialise or 429 — treat N× as a cost in **wall-clock time, not money**, and specify a concurrency cap. Recommend concrete settings for this model, not for Gemini.
- **Vary the prompt across the N, not the seed.** Different detail emphasis per candidate produces genuinely distinct drawings. Propose a concrete scheme (this is the primary diversity lever now).
- **Body first.** Select the body before generating the other four slots, passing the chosen body SVG as context — parts still conform to the **global** standard from §5.2, not to that body. (This finally contradicts the current prompt's "do not use body-first generation," which you should remove.)
- **Selection at 10 animals is manual.** Render each slot's N candidates into a labelled contact sheet and let me pick by eye. Automate only if you can argue it saves time at this scale. Make N configurable, default 5.

### 5.4 Cross-species evaluation — genuinely missing, but nearly free

Every quality gate in the repo measures the pure animal. **Nothing measures cross-species combination, which is 100% of what the player sees.** Design a small evaluation that runs on assembled hybrids: assemble N random cross-species creatures and check seam integrity, scale mismatch, stroke-weight mismatch and detail-density mismatch.

**Point at the reuse:** `analyzeDraftGeometry` already computes seam overlap, unrelated-part intersection and ground mismatch. Run it across N random cross-species *assemblies* and flag numeric outliers before I eyeball a grid of 10 random hybrids. Tell me what to look for by eye and which of those checks the existing analyzer already gives me for free.

## 6. Stage 1 deliverables

1. **The keep / modify / delete table** for every system in §0.2. This is the core deliverable now.
2. **The four §5 systems**, as edits to named files, with the §5.1 and §5.3 decisions made.
3. **Asset data model** — reconcile the generator's `AnimalDraft` with the existing `AnimalPackageV1` (§0.2); do not invent a third schema. State how interchangeability is guaranteed and whether the game keeps its four anatomy templates or trims to quadruped for the slice.
4. **Build order**, where step 1 is a thin end-to-end slice producing one animal through the new select-per-slot path, and every step leaves both apps working.
5. **Old-phone performance budget** — concrete node, size and feature limits, including the whitelist tightening from §3.
6. **An honest time estimate.** Because enforcement exists, the real Stage-1 work is: the §5.1 edits, the four §5.2 checks, the §5.3 parallel-select refactor + deleting the repair loop, and a contact-sheet selection UI. If that exceeds a few days, tell me what to cut.

## 7. Stage 2 — scope but do not build

Describe each briefly: what it adds, what it costs, and **what signal should trigger building it.** Some are already partly built — note that.

- **Deterministic collar generation** — promoted here from §5.1; real geometry work.
- **Reference-image fidelity path** — the repo already has a large `referenceAnalysis` / `referenceFeatures` / `paletteSwatches` / match-vs-inspire system across `server.ts`, `validation.ts` and `normalize.ts`. **My lean is to cut it from Stage 1** (text prompts like "a bear" are enough to test whether the game is fun, and this machinery is a major source of validator complexity). Confirm, and say what signal justifies turning it back on.
- **Multi-provider abstraction** — **largely already built** (`createOpenAiProxyClient`). Scope only the gaps: side-by-side model comparison and per-run logging.
- **Automated vision-based selection** — contact sheets ranked by a multimodal call instead of by me.
- **Blind identification test** — render to PNG, ask a context-free model "what animal is this?" Note my concern: vision models are generous guessers and pass generic output while failing good stylised art. Say how you'd calibrate it before trusting it as a gate.
- **Distinctive-features contract** — the repo already has a version of this (`referenceFeatures` + required-group geometry checks in `validation.ts`). It verifies presence and labelling, not shape. Say whether it's worth keeping at all and what would strengthen it.
- **Additional anatomy templates** — bird, serpentine, amphibian. Note the package layer **already ships bird/serpentine/scorpion**; Stage-1 *generation* can still target quadruped only. Reconcile.
- **Alternative architectures** — armature-guided freehand with the guide passed as an image; or whole-animal silhouette generation then deterministic cutting into five parts. Say which you'd explore first if Stage 1 quality proves insufficient.
- **Re-enabling automatic repair** — only if select-per-slot proves insufficient. What metric would tell me that?

## 8. Finally

State plainly: **given what already exists (§0), will Stage 1 as scoped produce animals good enough to test the game concept?** My own read: enforcement already guarantees clean assembly, so the two high-leverage adds are the §5.2 hard constants and §5.3 select-per-slot, and the biggest win is *deleting* the repair loop and the reference-image path. If you think I'm still over-building, say what else to cut. If you think I'm cutting something I'll regret, say which.

Be concrete and opinionated. Where there's a genuine trade-off, name both options and state which you'd take.
