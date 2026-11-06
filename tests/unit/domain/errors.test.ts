import { describe, expect, it } from 'vitest';
import { HydrationDoctorError } from '../../../src/runtime/domain/errors';

describe('HydrationDoctorError', () => {
  it('carries a stable code, frozen details and the cause', () => {
    const cause = new Error('boom');
    const error = new HydrationDoctorError('INTERNAL_FAILURE', 'failed', {
      cause,
      details: { step: 'capture' },
    });
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('HydrationDoctorError');
    expect(error.code).toBe('INTERNAL_FAILURE');
    expect(error.cause).toBe(cause);
    expect(error.details).toEqual({ step: 'capture' });
    expect(Object.isFrozen(error.details)).toBe(true);
  });

  it('works without options', () => {
    const error = new HydrationDoctorError('INVALID_CONFIGURATION', 'bad');
    expect(error.details).toEqual({});
    expect(error.cause).toBeUndefined();
  });
});
