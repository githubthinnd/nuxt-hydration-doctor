import { splitAttribute } from '../domain/warning-text';
import type { ParsedHydrationWarning } from './parse-warning';

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

/** Narrows an unknown value (a vnode `el`, a proxy `$el`…) to a DOM Element. */
export function asElement(value: unknown): Element | null {
  if (typeof value !== 'object' || value === null) return null;
  const node = value as Partial<Node>;
  if (node.nodeType === ELEMENT_NODE) return value as Element;
  // Text and comment nodes belong to their parent element.
  if (node.nodeType === TEXT_NODE || node.nodeType === 8) return (value as Node).parentElement;
  return null;
}

/** The element itself or its closest ancestor that carries the location attribute. */
export function closestStamped(element: Element | null, attribute: string): Element | null {
  let current = element;
  while (current !== null) {
    if (current.hasAttribute(attribute)) return current;
    current = current.parentElement;
  }
  return null;
}

/** Text that belongs directly to `element` (not to its descendants), whitespace-collapsed. */
function ownText(element: Element): string {
  let text = '';
  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === TEXT_NODE) text += child.textContent ?? '';
  }
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Narrows a component's root element down to the element the warning is really about, so the
 * reported line points at the offending tag and not just at the component's first tag:
 * - text mismatch: a stamped element whose own text is what the client expected;
 * - node mismatch: a stamped element whose tag is the one the client expected;
 * - children mismatch (or no match): the closest stamped element of the root.
 */
export function pickOffendingElement(
  roots: readonly Element[],
  attribute: string,
  warning: ParsedHydrationWarning,
): Element | null {
  const first = roots[0] ?? null;
  const fallback = closestStamped(first, attribute);
  const candidates = [
    ...new Set(
      roots.flatMap((root) => [root, ...Array.from(root.querySelectorAll(`[${attribute}]`))]),
    ),
  ].filter((candidate) => candidate.hasAttribute(attribute));

  if (warning.kind === 'text-mismatch' && warning.clientText !== null) {
    const expected = warning.clientText.replace(/\s+/g, ' ').trim();
    const match = candidates.find((candidate) => ownText(candidate) === expected);
    if (match !== undefined) return match;
  }
  if (warning.kind === 'node-mismatch' && warning.clientText !== null) {
    const expectedTag = warning.clientText.toLowerCase();
    const match = candidates.find((candidate) => candidate.localName === expectedTag);
    if (match !== undefined) return match;
  }
  if (
    (warning.kind === 'class-mismatch' ||
      warning.kind === 'style-mismatch' ||
      warning.kind === 'attribute-mismatch') &&
    warning.serverText !== null
  ) {
    // Vue only checks these: the DOM still holds the server's value, so that is what to look for.
    const rendered = splitAttribute(warning.serverText);
    if (rendered !== null) {
      const wanted = normaliseAttribute(rendered.value);
      const match = candidates.find(
        (candidate) =>
          normaliseAttribute(candidate.getAttribute(rendered.name) ?? '\u0000') === wanted,
      );
      if (match !== undefined) return match;
    }
  }
  return fallback;
}

/** Whitespace and a trailing semicolon do not make two class or style values different. */
function normaliseAttribute(value: string): string {
  return value.replace(/\s+/g, ' ').trim().replace(/;$/, '');
}

/**
 * Position of `element` among all elements carrying the same attribute value, in document order.
 * One template tag rendered several times (v-for) shares a single location; this index tells the
 * instances apart so the matching server markup can be found.
 */
export function occurrenceIndex(
  scope: ParentNode,
  element: Element,
  attribute: string,
  value: string,
): number {
  const same = Array.from(scope.querySelectorAll(`[${attribute}]`)).filter(
    (candidate) => candidate.getAttribute(attribute) === value,
  );
  return same.indexOf(element);
}
