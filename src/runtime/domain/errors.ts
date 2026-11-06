/**
 * Error model for the build-time side of the module.
 *
 * Rules:
 * - Errors are typed and carry a stable `code`.
 * - The underlying failure is preserved in `cause`.
 * - Messages and `details` name *what* went wrong (option paths, kinds), never page content:
 *   server HTML and DOM snapshots can contain user data.
 *
 * The browser runtime never throws these into the host application; it swallows failures and
 * logs them with `INTERNAL_LOG_PREFIX` instead.
 */

/** Stable, machine-readable error codes. New codes are a semver-minor change. */
export type ErrorCode = 'INVALID_CONFIGURATION' | 'INTERNAL_FAILURE';

/** Primitive-only diagnostic context. Never put page content in here. */
export type ErrorDetails = Readonly<Record<string, string | number | boolean | null>>;

export interface HydrationDoctorErrorOptions {
  readonly cause?: unknown;
  readonly details?: ErrorDetails;
}

/** Base class of every error thrown by nuxt-hydration-doctor. */
export class HydrationDoctorError extends Error {
  readonly code: ErrorCode;
  readonly details: ErrorDetails;

  constructor(code: ErrorCode, message: string, options: HydrationDoctorErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'HydrationDoctorError';
    this.code = code;
    this.details = Object.freeze({ ...options.details });
  }
}
