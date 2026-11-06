import type { BrowserValue } from '../domain/diagnostic';

/** The parts of the browser the diagnostics ask about; structural so tests can supply doubles. */
export interface BrowserView {
  readonly innerWidth: number;
  readonly innerHeight: number;
  readonly outerWidth: number;
  readonly outerHeight: number;
  readonly devicePixelRatio: number;
  readonly screen: { readonly width: number; readonly height: number };
  readonly location: {
    readonly href: string;
    readonly pathname: string;
    readonly search: string;
    readonly hash: string;
    readonly host: string;
    readonly origin: string;
  };
  readonly navigator: {
    readonly userAgent: string;
    readonly language: string;
    readonly languages: readonly string[];
    readonly platform: string;
  };
  readonly document: { readonly title: string; readonly referrer: string };
  readonly localStorage: Storage;
  readonly sessionStorage: Storage;
}

/** Storage values longer than this are ignored: a long blob is not what ends up in a label. */
const MAX_STORED_VALUE = 500;
const MAX_STORAGE_KEYS = 50;

function storageValues(name: 'localStorage' | 'sessionStorage', storage: Storage): BrowserValue[] {
  const values: BrowserValue[] = [];
  // Access can throw (blocked storage, privacy modes); that just means "no values".
  try {
    for (let index = 0; index < Math.min(storage.length, MAX_STORAGE_KEYS); index += 1) {
      const key = storage.key(index);
      const value = key === null ? null : storage.getItem(key);
      if (key !== null && value !== null && value.length <= MAX_STORED_VALUE) {
        values.push({ source: `${name}["${key}"]`, value });
      }
    }
  } catch {
    return [];
  }
  return values;
}

/**
 * Reads the browser values that a component might have rendered but a server cannot know.
 *
 * The values are only ever compared with the text of a mismatch: they are not stored and not
 * shown (storage values in particular may be tokens), and only their *names* appear in the
 * explanation. Empty and very short values are dropped by the rule that uses them.
 */
export function collectBrowserValues(view: BrowserView): BrowserValue[] {
  const text = (source: string, value: number | string): BrowserValue => ({
    source,
    value: String(value),
  });
  return [
    text('window.innerWidth', view.innerWidth),
    text('window.innerHeight', view.innerHeight),
    text('window.outerWidth', view.outerWidth),
    text('window.outerHeight', view.outerHeight),
    text('window.devicePixelRatio', view.devicePixelRatio),
    text('window.screen.width', view.screen.width),
    text('window.screen.height', view.screen.height),
    text('window.location.href', view.location.href),
    text('window.location.search', view.location.search),
    text('window.location.hash', view.location.hash),
    text('window.location.host', view.location.host),
    text('window.location.origin', view.location.origin),
    text('navigator.userAgent', view.navigator.userAgent),
    text('navigator.language', view.navigator.language),
    text('navigator.languages', view.navigator.languages.join(',')),
    text('navigator.platform', view.navigator.platform),
    text('document.title', view.document.title),
    text('document.referrer', view.document.referrer),
    ...storageValues('localStorage', view.localStorage),
    ...storageValues('sessionStorage', view.sessionStorage),
  ].filter((entry) => entry.value !== '');
}
