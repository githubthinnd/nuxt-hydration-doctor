import type { StateChange } from '../domain/diagnostic';

export interface StateEntry {
  readonly store: StateChange['store'];
  readonly key: string;
  readonly value: unknown;
}

export interface StateWatcher {
  /** Remembers the current value of every entry. Call before hydration can change anything. */
  capture(): void;
  /** Entries whose value is not what `capture` saw. */
  changes(): StateChange[];
}

/** Values larger than this are compared by their start; a state blob is not rendered whole. */
const MAX_SERIALISED = 2000;

function serialise(value: unknown): string {
  try {
    // JSON.stringify returns undefined at runtime for undefined and functions despite its typing.
    const json = JSON.stringify(value) as string | undefined;
    return (json ?? 'undefined').slice(0, MAX_SERIALISED);
  } catch {
    // Circular or otherwise unserialisable: it cannot be compared, so treat it as unchanged.
    return '';
  }
}

/**
 * Detects state that was modified between the server payload and now.
 *
 * Nuxt hydrates `useState` and Pinia from the payload the server serialised, so a value that is
 * different from the one captured at startup was changed on the client, before or during
 * hydration. That is one of the ways a client render ends up different from the server's.
 */
export function createStateWatcher(read: () => readonly StateEntry[]): StateWatcher {
  const initial = new Map<string, string>();
  const id = (entry: StateEntry): string => `${entry.store}:${entry.key}`;

  return {
    capture() {
      initial.clear();
      for (const entry of read()) initial.set(id(entry), serialise(entry.value));
    },
    changes() {
      const changed: StateChange[] = [];
      for (const entry of read()) {
        const before = initial.get(id(entry));
        const after = serialise(entry.value);
        if (before === undefined || before === '' || after === '' || before === after) continue;
        changed.push({ store: entry.store, key: entry.key, before, after });
      }
      return changed;
    },
  };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Lists the entries of a Nuxt payload: `payload.state` holds `useState` values under `$s<key>`,
 * and `payload.pinia` holds one state object per Pinia store (listed per property).
 */
export function entriesFromPayload(payload: unknown): StateEntry[] {
  if (!isRecord(payload)) return [];
  const entries: StateEntry[] = [];

  const state = payload['state'];
  if (isRecord(state)) {
    for (const [name, value] of Object.entries(state)) {
      entries.push({
        store: 'useState',
        key: name.startsWith('$s') ? name.slice(2) : name,
        value,
      });
    }
  }

  const pinia = payload['pinia'];
  if (isRecord(pinia)) {
    for (const [storeId, storeState] of Object.entries(pinia)) {
      if (!isRecord(storeState)) continue;
      for (const [property, value] of Object.entries(storeState)) {
        entries.push({ store: 'pinia', key: `${storeId}.${property}`, value });
      }
    }
  }
  return entries;
}
