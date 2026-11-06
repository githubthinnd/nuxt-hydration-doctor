// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  collectBrowserValues,
  type BrowserView,
} from '../../../src/runtime/interceptor/environment';

function storage(items: Record<string, string>): Storage {
  const keys = Object.keys(items);
  return {
    length: keys.length,
    key: (index: number) => keys[index] ?? null,
    getItem: (key: string) => items[key] ?? null,
    setItem: () => undefined,
    removeItem: () => undefined,
    clear: () => undefined,
  };
}

function view(overrides: Partial<BrowserView> = {}): BrowserView {
  return {
    innerWidth: 1280,
    innerHeight: 720,
    outerWidth: 1300,
    outerHeight: 800,
    devicePixelRatio: 2,
    screen: { width: 1920, height: 1080 },
    location: {
      href: 'https://example.test/a?b=1#c',
      pathname: '/a',
      search: '?b=1',
      hash: '#c',
      host: 'example.test',
      origin: 'https://example.test',
    },
    navigator: {
      userAgent: 'Test/1.0',
      language: 'en-US',
      languages: ['en-US', 'fr'],
      platform: 'Linux',
    },
    document: { title: 'Home', referrer: '' },
    localStorage: storage({ theme: 'dark' }),
    sessionStorage: storage({}),
    ...overrides,
  };
}

const bySource = (values: ReturnType<typeof collectBrowserValues>, source: string) =>
  values.find((entry) => entry.source === source)?.value;

describe('collectBrowserValues', () => {
  it('lists viewport, location, navigator and document values with their source names', () => {
    const values = collectBrowserValues(view());
    expect(bySource(values, 'window.innerWidth')).toBe('1280');
    expect(bySource(values, 'window.devicePixelRatio')).toBe('2');
    expect(bySource(values, 'window.location.href')).toBe('https://example.test/a?b=1#c');
    expect(bySource(values, 'navigator.userAgent')).toBe('Test/1.0');
    expect(bySource(values, 'navigator.languages')).toBe('en-US,fr');
    expect(bySource(values, 'document.title')).toBe('Home');
  });

  it('includes storage entries, named by key', () => {
    const values = collectBrowserValues(
      view({ localStorage: storage({ theme: 'dark' }), sessionStorage: storage({ step: '3' }) }),
    );
    expect(bySource(values, 'localStorage["theme"]')).toBe('dark');
    expect(bySource(values, 'sessionStorage["step"]')).toBe('3');
  });

  it('drops empty values and very long storage values', () => {
    const values = collectBrowserValues(
      view({
        document: { title: 'Home', referrer: '' },
        localStorage: storage({ blob: 'x'.repeat(501) }),
      }),
    );
    expect(bySource(values, 'document.referrer')).toBeUndefined();
    expect(bySource(values, 'localStorage["blob"]')).toBeUndefined();
  });

  it('survives storage that throws (blocked storage, privacy modes)', () => {
    const blocked = {
      get length(): number {
        throw new Error('SecurityError');
      },
    } as unknown as Storage;
    const values = collectBrowserValues(view({ localStorage: blocked, sessionStorage: blocked }));
    expect(bySource(values, 'window.innerWidth')).toBe('1280');
    expect(values.some((entry) => entry.source.startsWith('localStorage'))).toBe(false);
  });

  it('works against the real window object', () => {
    const values = collectBrowserValues(window);
    expect(values.length).toBeGreaterThan(5);
    expect(bySource(values, 'window.innerWidth')).toBe(String(window.innerWidth));
  });
});
