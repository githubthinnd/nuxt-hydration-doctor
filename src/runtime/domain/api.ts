import type { HydrationIssue } from './issue';

/**
 * What the runtime exposes to the rest of the dev tooling (HUD, DevTools bridge, tests) as
 * `useNuxtApp().$hydrationDoctor`. Read-only on purpose: consumers observe, they never inject.
 */
export interface HydrationDoctorApi {
  /** Issues captured this session, oldest first, capped by `history.limit`. */
  issues(): readonly HydrationIssue[];
  /** Calls `listener` for every issue captured from now on. Returns an unsubscribe function. */
  subscribe(listener: (issue: HydrationIssue) => void): () => void;
  /** Forgets the captured history. */
  clear(): void;
}
