import type {
  DiagnosticCategory,
  DiagnosticContext,
  DiagnosticResult,
} from '../../domain/diagnostic';
import type { HydrationIssue } from '../../domain/issue';
import type { TextChange } from '../text-changes';

/** Everything a rule may look at. */
export interface RuleInput {
  readonly issue: HydrationIssue;
  readonly context: DiagnosticContext;
  /** Text that differs between server and client, extracted once for all rules. */
  readonly changes: readonly TextChange[];
}

/** A heuristic: returns a result when its evidence is there, null when it is not. */
export interface Rule {
  readonly category: DiagnosticCategory;
  run(input: RuleInput): DiagnosticResult | null;
}

/** Shortens page text before it goes into an explanation. */
export function clip(text: string, max = 60): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
