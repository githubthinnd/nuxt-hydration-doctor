import type { HydrationDoctorApi } from '../domain/api';
import type { HydrationIssue } from '../domain/issue';

export interface IssueStore extends HydrationDoctorApi {
  /** Records an issue, dropping the oldest ones beyond the limit, and notifies subscribers. */
  add(issue: HydrationIssue): void;
}

/**
 * Bounded, in-memory history of the session. A throwing subscriber never prevents the issue
 * from being stored or the other subscribers from being notified.
 */
export function createIssueStore(
  limit: number,
  onListenerError: (error: unknown) => void,
): IssueStore {
  let issues: readonly HydrationIssue[] = [];
  const listeners = new Set<(issue: HydrationIssue) => void>();

  return {
    add(issue) {
      issues = [...issues, issue].slice(-limit);
      for (const listener of [...listeners]) {
        try {
          listener(issue);
        } catch (error) {
          onListenerError(error);
        }
      }
    },
    issues() {
      return issues;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    clear() {
      issues = [];
    },
  };
}
