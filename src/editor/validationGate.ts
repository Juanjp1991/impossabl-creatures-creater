import type { ValidationIssue } from "../generation/contracts";

/**
 * Decides which validation errors should block a save.
 *
 * The gate is "your edit must not make it worse", not "the part must be perfect". The two
 * legacy built-ins fail the modern §5.2 standard badly — the Grizzly Bear opens with 16
 * errors from gradients and missing root groups — so an absolute gate would lock the editor
 * out of exactly the parts that most need repairing. Comparing against a baseline taken when
 * the dialog opened lets a user improve a broken part incrementally while still catching
 * anything their own edit introduced.
 *
 * Pure: no DOM, no React.
 */

const keyOf = (issue: ValidationIssue) => `${issue.part}|${issue.code}`;

/**
 * Errors tallied by part and code.
 *
 * Counted rather than collected into a set, so introducing a *second* occurrence of a fault
 * the part already had is still treated as new — otherwise one pre-existing raw hex would
 * excuse painting every remaining shape with literal colours.
 */
export function errorSignature(issues: ValidationIssue[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const issue of issues) {
    if (issue.severity !== "error") continue;
    counts.set(keyOf(issue), (counts.get(keyOf(issue)) ?? 0) + 1);
  }
  return counts;
}

/** Errors present now beyond what the baseline already had. */
export function newErrorsSince(
  baseline: Map<string, number>,
  issues: ValidationIssue[],
): ValidationIssue[] {
  const seen = new Map<string, number>();
  return issues.filter((issue) => {
    if (issue.severity !== "error") return false;
    const index = (seen.get(keyOf(issue)) ?? 0) + 1;
    seen.set(keyOf(issue), index);
    return index > (baseline.get(keyOf(issue)) ?? 0);
  });
}
