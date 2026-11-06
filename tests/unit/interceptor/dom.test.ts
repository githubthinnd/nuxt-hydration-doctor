// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  asElement,
  closestStamped,
  occurrenceIndex,
  pickOffendingElement,
} from '../../../src/runtime/interceptor/locate';
import { captureServerSnapshot } from '../../../src/runtime/interceptor/snapshot';

const ATTR = 'data-nhd-loc';

function mount(html: string): HTMLElement {
  const root = document.createElement('div');
  root.id = 'app';
  root.innerHTML = html;
  document.body.append(root);
  return root;
}

function firstChild(parent: Element): Element {
  const child = parent.firstElementChild;
  if (child === null) throw new Error('expected a child element');
  return child;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('captureServerSnapshot', () => {
  it('returns null when the root is missing or the page is too large', () => {
    expect(captureServerSnapshot(document, '#app', 1000)).toBeNull();
    mount('<p data-nhd-loc="a.vue:1:1">x</p>');
    expect(captureServerSnapshot(document, '#app', 5)).toBeNull();
  });

  it('keeps the original markup after the live DOM changes', () => {
    const root = mount('<p data-nhd-loc="a.vue:1:1">server</p>');
    const snapshot = captureServerSnapshot(document, '#app', 1000);
    root.innerHTML = '<p data-nhd-loc="a.vue:1:1">client</p>';
    expect(snapshot?.findHtml(ATTR, 'a.vue:1:1', 0)).toBe('<p data-nhd-loc="a.vue:1:1">server</p>');
  });

  it('finds repeated locations by occurrence index and returns null past the end', () => {
    mount('<li data-nhd-loc="a.vue:1:1">a</li><li data-nhd-loc="a.vue:1:1">b</li>');
    const snapshot = captureServerSnapshot(document, '#app', 1000);
    expect(snapshot?.findHtml(ATTR, 'a.vue:1:1', 1)).toContain('>b<');
    expect(snapshot?.findHtml(ATTR, 'a.vue:1:1', 2)).toBeNull();
    expect(snapshot?.findHtml(ATTR, 'other.vue:1:1', 0)).toBeNull();
  });

  it('does not execute scripts in the markup', () => {
    mount('<p data-nhd-loc="a.vue:1:1">x</p><script>window.__nhd_ran = true</script>');
    const snapshot = captureServerSnapshot(document, '#app', 1000);
    snapshot?.findHtml(ATTR, 'a.vue:1:1', 0);
    expect((window as unknown as Record<string, unknown>)['__nhd_ran']).toBeUndefined();
  });
});

describe('asElement / closestStamped', () => {
  it('maps text nodes to their parent and rejects non-nodes', () => {
    const root = mount('<p>hi</p>');
    const text = root.querySelector('p')?.firstChild;
    expect(asElement(text)).toBe(root.querySelector('p'));
    expect(asElement(null)).toBeNull();
    expect(asElement({})).toBeNull();
    expect(asElement('p')).toBeNull();
  });

  it('walks up to the closest stamped ancestor', () => {
    const root = mount('<section data-nhd-loc="a.vue:1:1"><div><b>x</b></div></section>');
    expect(closestStamped(root.querySelector('b'), ATTR)).toBe(root.querySelector('section'));
    expect(closestStamped(root.querySelector('section'), ATTR)).toBe(root.querySelector('section'));
    expect(closestStamped(root, ATTR)).toBeNull();
    expect(closestStamped(null, ATTR)).toBeNull();
  });
});

describe('pickOffendingElement', () => {
  const html =
    '<div data-nhd-loc="a.vue:1:1"><h2 data-nhd-loc="a.vue:2:3">Title</h2><p data-nhd-loc="a.vue:3:3">body</p></div>';

  it('narrows a text mismatch to the element whose own text is the expected one', () => {
    const root = firstChild(mount(html));
    const picked = pickOffendingElement(root, ATTR, {
      kind: 'text-mismatch',
      serverText: 'old',
      clientText: 'body',
    });
    expect(picked?.getAttribute(ATTR)).toBe('a.vue:3:3');
  });

  it('narrows a node mismatch to the element with the expected tag', () => {
    const root = firstChild(mount(html));
    const picked = pickOffendingElement(root, ATTR, {
      kind: 'node-mismatch',
      serverText: null,
      clientText: 'h2',
    });
    expect(picked?.getAttribute(ATTR)).toBe('a.vue:2:3');
  });

  it('falls back to the closest stamped element of the root', () => {
    const root = firstChild(mount(html));
    for (const warning of [
      { kind: 'children-mismatch', serverText: null, clientText: null },
      { kind: 'text-mismatch', serverText: 'a', clientText: 'no such text' },
      { kind: 'node-mismatch', serverText: null, clientText: 'table' },
    ] as const) {
      expect(pickOffendingElement(root, ATTR, warning)?.getAttribute(ATTR)).toBe('a.vue:1:1');
    }
  });

  it('returns null when nothing is stamped', () => {
    const root = firstChild(mount('<div><p>x</p></div>'));
    expect(
      pickOffendingElement(root, ATTR, {
        kind: 'children-mismatch',
        serverText: null,
        clientText: null,
      }),
    ).toBeNull();
  });
});

describe('occurrenceIndex', () => {
  it('numbers elements sharing one location in document order', () => {
    const root = mount(
      '<li data-nhd-loc="a.vue:1:1">a</li><li data-nhd-loc="b.vue:1:1">x</li><li data-nhd-loc="a.vue:1:1">b</li>',
    );
    const items = root.querySelectorAll('li');
    expect(occurrenceIndex(document, items[0] as Element, ATTR, 'a.vue:1:1')).toBe(0);
    expect(occurrenceIndex(document, items[2] as Element, ATTR, 'a.vue:1:1')).toBe(1);
    expect(occurrenceIndex(document, items[1] as Element, ATTR, 'a.vue:1:1')).toBe(-1);
  });
});
