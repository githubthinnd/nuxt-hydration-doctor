import type { DiagnosticContext, DiagnosticResult } from '../domain/diagnostic';
import type { HydrationIssue } from '../domain/issue';
import { browserGlobalsRule } from './rules/browser-globals';
import { htmlNestingRule } from './rules/html-nesting';
import { nonDeterministicRule } from './rules/non-deterministic';
import type { Rule } from './rules/rule';
import { stateDesyncRule } from './rules/state-desync';
import { extractTextChanges } from './text-changes';

/** Below this a result is noise: better to say nothing than to send the user on a wrong trail. */
export const MIN_CONFIDENCE = 0.3;

const RULES: readonly Rule[] = [
  htmlNestingRule,
  browserGlobalsRule,
  nonDeterministicRule,
  stateDesyncRule,
];

/**
 * Explains why a hydration mismatch most likely happened.
 *
 * Every rule looks for evidence that can be observed (what differs between the two renderings,
 * live browser values, the component's code, the element's ancestors, state that changed) and
 * returns a result only when it finds some, with the confidence the evidence justifies. Results
 * come back most confident first. A rule that fails is skipped: one faulty heuristic must not
 * hide the others.
 */
export function diagnoseIssue(
  issue: HydrationIssue,
  context: DiagnosticContext,
): readonly DiagnosticResult[] {
  const input = { issue, context, changes: extractTextChanges(issue) };
  const results: DiagnosticResult[] = [];

  for (const rule of RULES) {
    if (context.disabledCategories.includes(rule.category)) continue;
    try {
      const result = rule.run(input);
      if (result !== null && result.confidence >= MIN_CONFIDENCE) results.push(result);
    } catch {
      // Skip this rule only.
    }
  }
  return results.sort((a, b) => b.confidence - a.confidence);
}
