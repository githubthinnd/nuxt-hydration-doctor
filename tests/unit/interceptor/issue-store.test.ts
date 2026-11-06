import { describe, expect, it, vi } from 'vitest';
import type { HydrationIssue } from '../../../src/runtime/domain/issue';
import { createIssueStore } from '../../../src/runtime/interceptor/issue-store';

function issue(id: string): HydrationIssue {
  return {
    id,
    kind: 'text-mismatch',
    message: 'm',
    route: '/',
    componentName: null,
    location: null,
    serverHtml: null,
    clientHtml: null,
    breadcrumbs: [],
    metrics: { detectedAt: 0, msSinceNavigationStart: null },
  };
}

describe('createIssueStore', () => {
  it('keeps issues oldest first and drops the oldest beyond the limit', () => {
    const store = createIssueStore(2, () => undefined);
    for (const id of ['a', 'b', 'c']) store.add(issue(id));
    expect(store.issues().map((i) => i.id)).toEqual(['b', 'c']);
  });

  it('notifies subscribers and stops after unsubscribe', () => {
    const store = createIssueStore(5, () => undefined);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.add(issue('a'));
    unsubscribe();
    store.add(issue('b'));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
  });

  it('isolates a throwing subscriber: the issue is stored and others are notified', () => {
    const onError = vi.fn();
    const store = createIssueStore(5, onError);
    const survivor = vi.fn();
    store.subscribe(() => {
      throw new Error('boom');
    });
    store.subscribe(survivor);
    store.add(issue('a'));
    expect(store.issues()).toHaveLength(1);
    expect(survivor).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('clears the history', () => {
    const store = createIssueStore(5, () => undefined);
    store.add(issue('a'));
    store.clear();
    expect(store.issues()).toEqual([]);
  });
});
