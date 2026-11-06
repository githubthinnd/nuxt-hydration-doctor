/** Never claim certainty: a heuristic can always be fooled by a coincidence. */
const MAX_CONFIDENCE = 0.97;

/**
 * Combines independent pieces of evidence, each with its own probability that the cause is real.
 * The result is the chance that at least one is right (`1 - Π(1 - p)`): two weak signals together
 * beat either alone, but a single signal never gets more than its own strength.
 */
export function combineConfidence(signals: readonly number[]): number {
  const none = signals.reduce((rest, p) => rest * (1 - Math.min(Math.max(p, 0), 1)), 1);
  return Math.min(MAX_CONFIDENCE, Math.round((1 - none) * 100) / 100);
}
