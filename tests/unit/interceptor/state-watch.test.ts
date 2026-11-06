import { describe, expect, it } from 'vitest';
import {
  createStateWatcher,
  entriesFromPayload,
  type StateEntry,
} from '../../../src/runtime/interceptor/state-watch';

describe('entriesFromPayload', () => {
  it('lists useState values with the $s prefix removed and Pinia stores per property', () => {
    const entries = entriesFromPayload({
      state: { $scounter: 3, plain: 'x' },
      pinia: { cart: { items: [1, 2], total: 9 } },
    });
    expect(entries).toEqual([
      { store: 'useState', key: 'counter', value: 3 },
      { store: 'useState', key: 'plain', value: 'x' },
      { store: 'pinia', key: 'cart.items', value: [1, 2] },
      { store: 'pinia', key: 'cart.total', value: 9 },
    ]);
  });

  it.each([undefined, null, 'x', 5, [], { state: 'nope', pinia: [] }, { pinia: { s: 3 } }])(
    'returns nothing for an unusable payload (%j)',
    (payload) => {
      expect(entriesFromPayload(payload)).toEqual([]);
    },
  );
});

describe('createStateWatcher', () => {
  function watched(initial: StateEntry[]) {
    let current = initial;
    const watcher = createStateWatcher(() => current);
    return {
      watcher,
      set: (next: StateEntry[]): void => {
        current = next;
      },
    };
  }
  const entry = (key: string, value: unknown): StateEntry => ({ store: 'useState', key, value });

  it('reports nothing until something changes', () => {
    const { watcher } = watched([entry('a', 1)]);
    watcher.capture();
    expect(watcher.changes()).toEqual([]);
  });

  it('reports the entries whose value changed, with serialised before and after', () => {
    const { watcher, set } = watched([entry('a', 1), entry('b', 'x')]);
    watcher.capture();
    set([entry('a', 2), entry('b', 'x')]);
    expect(watcher.changes()).toEqual([{ store: 'useState', key: 'a', before: '1', after: '2' }]);
  });

  it('sees nested changes made in place, since values are compared by content', () => {
    const shared = { n: 1 };
    const { watcher } = watched([entry('o', shared)]);
    watcher.capture();
    shared.n = 2;
    expect(watcher.changes()).toEqual([
      { store: 'useState', key: 'o', before: '{"n":1}', after: '{"n":2}' },
    ]);
  });

  it('ignores entries that appeared or disappeared after the capture', () => {
    const { watcher, set } = watched([entry('a', 1)]);
    watcher.capture();
    set([entry('b', 2)]);
    expect(watcher.changes()).toEqual([]);
  });

  it('skips values that cannot be serialised instead of throwing', () => {
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;
    const { watcher } = watched([entry('c', circular)]);
    watcher.capture();
    expect(() => watcher.changes()).not.toThrow();
    expect(watcher.changes()).toEqual([]);
  });

  it('handles undefined values', () => {
    const { watcher, set } = watched([entry('u', undefined)]);
    watcher.capture();
    set([entry('u', 'now defined')]);
    expect(watcher.changes()).toEqual([
      { store: 'useState', key: 'u', before: 'undefined', after: '"now defined"' },
    ]);
  });
});
