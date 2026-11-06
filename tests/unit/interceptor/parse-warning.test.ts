import { describe, expect, it } from 'vitest';
import { parseHydrationWarning } from '../../../src/runtime/interceptor/parse-warning';

// Messages below are what Vue 3.5 passes to warnHandler (captured from a real hydration).
describe('parseHydrationWarning', () => {
  it('recognises a text content mismatch and extracts both texts', () => {
    const message =
      'Hydration text content mismatch on<p>server</p>\n  - rendered on server: server\n  - expected on client: client';
    expect(parseHydrationWarning(message)).toEqual({
      kind: 'text-mismatch',
      serverText: 'server',
      clientText: 'client',
    });
  });

  it('accepts the older "text mismatch" wording', () => {
    expect(
      parseHydrationWarning(
        'Hydration text mismatch:\n- rendered on server: a\n- expected on client: b',
      ),
    ).toMatchObject({ kind: 'text-mismatch', serverText: 'a', clientText: 'b' });
  });

  it('recognises a node mismatch and keeps the expected tag', () => {
    const message =
      'Hydration node mismatch:\n- rendered on server:<span>x</span>\n- expected on client:div';
    expect(parseHydrationWarning(message)).toMatchObject({
      kind: 'node-mismatch',
      clientText: 'div',
    });
  });

  it('recognises a children mismatch', () => {
    const message =
      'Hydration children mismatch on<ul><li>a</li></ul>\nServer rendered element contains more child nodes than client vdom.';
    expect(parseHydrationWarning(message)).toEqual({
      kind: 'children-mismatch',
      serverText: null,
      clientText: null,
    });
  });

  it('discards DOM nodes that a real browser stringified as [object …]', () => {
    const message =
      'Hydration node mismatch:\n- rendered on server:[object HTMLSpanElement]\n- expected on client:div';
    expect(parseHydrationWarning(message)).toEqual({
      kind: 'node-mismatch',
      serverText: null,
      clientText: 'div',
    });
  });

  it.each([
    'Hydration completed but contains mismatches.',
    'Hydration attribute mismatch on <div>',
    'Property "x" was accessed during render but is not defined',
    '',
  ])('returns null for %j', (message) => {
    expect(parseHydrationWarning(message)).toBeNull();
  });
});
