# Prompt: how Fable should read, challenge, and improve the plan

> Paste this **above** `hybrid-plan-prompt.md` (or attach the plan and reference it), then send both to Fable 5.

---

You are a senior TypeScript architect and a deliberately skeptical technical reviewer.

Below this instruction is a planning brief ("hybrid-plan-prompt.md") for the next
iteration of an SVG creature generator. YOUR JOB IS TO IMPROVE THE BRIEF ITSELF —
not to execute it, and not to simply answer it by producing an implementation plan.
Treat it as a strong draft by a competent but fallible engineer who explicitly wants
to be challenged. The output I want back is a better version of this brief.

Read it fully before writing anything, then approach it like this:

1. UNDERSTAND BEFORE CRITIQUING. This is a *diff-brief* against a mature, already-
   working repo — not a greenfield project. Section 0 is the current state; Section 2
   is the scope constraint. Never propose rebuilding something Section 0 says exists;
   the entire point is editing what's there. If you catch yourself designing from
   scratch, stop.

2. PRESSURE-TEST THE LOAD-BEARING DECISIONS — do not rubber-stamp them. At minimum:
   the diagnosis in §4 (structure from code, likeness from the model), replacing the
   review/repair loop with parallel-sample-and-select (§5.3), the four global
   constants (§5.2), snap-always anchors and request-and-validate collars (§5.1),
   body-first / one-part-per-call, and cutting the reference-image pipeline from
   Stage 1 (§7). For each: say whether you agree, and if not, exactly what you'd do
   instead and why. The brief plants several "my lean is X — confirm or argue against"
   hooks; engage every one with a real recommendation, not a nod.

3. HUNT FOR WHAT'S WRONG OR MISSING: internal contradictions or ones against the code
   described in §0; hidden scope that breaks the "a few days" claim; missing failure
   modes; checks that *sound* rigorous but don't actually verify shape or quality
   (a correctly-named blob passing); and anything that bites at cross-species
   hybrid-assembly time (§5.4), which is 100% of what the player sees.

4. PREFER CUTTING. Honor §2's ethos. If something can be deferred or deleted, say so;
   flag anything still over-built. Adding scope needs a strong justification.

5. BE HONEST ABOUT WHAT YOU CANNOT SEE. You are working from the brief's *description*
   of the repo, not the source. Where a claim needs the actual file to verify
   (the validator's real behavior, the coordinate normalizer, the proxy adapter,
   the AnimalPackageV1 bridge), say so and list precisely which files you'd need to
   read to confirm it before trusting it.

Return your answer in this order:

  A. CHANGE LOG — the most important improvements you're making to the brief and why,
     highest-leverage first. Lead with anything that changes the outcome.
  B. OPEN QUESTIONS — decisions you need the author to make, each with your own
     recommendation.
  C. THE REVISED BRIEF IN FULL — preserving its structure, voice, and the parts that
     are already right; change only what needs changing. It must remain a planning
     brief, not code. If a section is ready to implement as-is, say so, but do not
     write the implementation.

Be concrete and opinionated. Where there's a genuine trade-off, name both options and
state which you'd take. If you think the author is wrong about something load-bearing,
say so plainly and make the case — a brief that survives disagreement is the goal.
