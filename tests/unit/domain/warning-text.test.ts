import { describe, expect, it } from 'vitest';
import {
  extractRenderedExpected,
  MAX_WARNING_CHARS,
  splitAttribute,
} from '../../../src/runtime/domain/warning-text';
import { parseHydrationWarning } from '../../../src/runtime/interceptor/parse-warning';

/** Wall-clock time of `run`, in ms. */
function time(run: () => void): number {
  const start = performance.now();
  run();
  return performance.now() - start;
}

describe('extractRenderedExpected', () => {
  it('reads the two quoted lines', () => {
    expect(
      extractRenderedExpected(
        'Hydration text content mismatch on<p>x</p>\n  - rendered on server: old\n  - expected on client: new',
      ),
    ).toEqual({ server: 'old', client: 'new' });
  });

  it('drops the note Vue appends after attribute-like mismatches', () => {
    const message =
      'Hydration class mismatch on<div class="a">x</div>\n  - rendered on server: class="a"\n  - expected on client: class="b"\n  Note: this mismatch is check-only. The DOM will not be rectified in production due to performance overhead.\n  You should fix the source of the mismatch.';
    expect(extractRenderedExpected(message)).toEqual({ server: 'class="a"', client: 'class="b"' });
  });

  it('returns null when either line is missing or they are in the wrong order', () => {
    expect(extractRenderedExpected('Hydration children mismatch')).toBeNull();
    expect(extractRenderedExpected('- rendered on server: a')).toBeNull();
    expect(extractRenderedExpected('- expected on client: b\n- rendered on server: a')).toBeNull();
  });

  it('only looks at the start of an enormous message', () => {
    const huge = `- rendered on server: a\n- expected on client: b${'x'.repeat(MAX_WARNING_CHARS * 5)}`;
    const found = extractRenderedExpected(huge);
    expect(found?.server).toBe('a');
    expect((found?.client.length ?? 0) <= MAX_WARNING_CHARS).toBe(true);
  });

  it.each([
    ['newlines', '\n'],
    ['spaces', ' '],
    ['"- rendered" fragments', '- rendered '],
  ])('takes time proportional to the message, not its square, for runs of %s', (_label, unit) => {
    // This message made the old regular expression take over a second on the main thread.
    const hostile = `Hydration text content mismatch\n- rendered on server:${unit.repeat(60_000)}`;
    expect(time(() => extractRenderedExpected(hostile))).toBeLessThan(150);
    expect(time(() => parseHydrationWarning(hostile))).toBeLessThan(150);
  });
});

describe('splitAttribute', () => {
  it('splits name="value"', () => {
    expect(splitAttribute('class="a b"')).toEqual({ name: 'class', value: 'a b' });
    expect(splitAttribute('data-x="1"')).toEqual({ name: 'data-x', value: '1' });
    expect(splitAttribute('title=""')).toEqual({ name: 'title', value: '' });
  });

  it('keeps quotes that are part of the value', () => {
    expect(splitAttribute('title="say "hi""')).toEqual({ name: 'title', value: 'say "hi"' });
  });

  it.each(['', 'class', 'class=a', '="x"', 'bad name="x"', 'class="unterminated', '<div>'])(
    'returns null for %j',
    (value) => {
      expect(splitAttribute(value)).toBeNull();
    },
  );
});
