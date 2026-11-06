import { describe, expect, it } from 'vitest';
import { combineConfidence } from '../../../src/runtime/engine/confidence';

describe('combineConfidence', () => {
  it('returns 0 without evidence', () => {
    expect(combineConfidence([])).toBe(0);
  });

  it('never exceeds its strongest signal when there is just one', () => {
    expect(combineConfidence([0.55])).toBe(0.55);
  });

  it('makes two independent weak signals stronger than either', () => {
    expect(combineConfidence([0.55, 0.65])).toBe(0.84);
    expect(combineConfidence([0.55, 0.65])).toBeGreaterThan(0.65);
  });

  it('never claims certainty', () => {
    expect(combineConfidence([1])).toBe(0.97);
    expect(combineConfidence([0.9, 0.9, 0.9])).toBe(0.97);
  });

  it('clamps nonsense probabilities instead of producing nonsense', () => {
    expect(combineConfidence([-5])).toBe(0);
    expect(combineConfidence([7])).toBe(0.97);
  });
});
