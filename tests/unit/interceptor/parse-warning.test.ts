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
    [
      'class',
      'Hydration class mismatch on<div class="a">x</div>\n  - rendered on server: class="a"\n  - expected on client: class="b"\n  Note: this mismatch is check-only. The DOM will not be rectified in production due to performance overhead.\n  You should fix the source of the mismatch.',
      'class-mismatch',
      'class="a"',
      'class="b"',
    ],
    [
      'style',
      'Hydration style mismatch on<div style="color:red">x</div>\n  - rendered on server: style="color:red"\n  - expected on client: style="color:blue;"\n  Note: this mismatch is check-only.',
      'style-mismatch',
      'style="color:red"',
      'style="color:blue;"',
    ],
    [
      'attribute',
      'Hydration attribute mismatch on<div title="one">x</div>\n  - rendered on server: title="one"\n  - expected on client: title="two"\n  Note: this mismatch is check-only.',
      'attribute-mismatch',
      'title="one"',
      'title="two"',
    ],
  ])(
    'recognises a %s mismatch (Vue 3.5 wording) and drops the trailing note',
    (_n, message, kind, server, client) => {
      expect(parseHydrationWarning(message)).toEqual({
        kind,
        serverText: server,
        clientText: client,
      });
    },
  );

  it.each([
    'Hydration completed but contains mismatches.',
    'Hydration completed but contains mismatches (summary, not a mismatch itself).',
    'Property "x" was accessed during render but is not defined',
    '',
  ])('returns null for %j', (message) => {
    expect(parseHydrationWarning(message)).toBeNull();
  });
});
