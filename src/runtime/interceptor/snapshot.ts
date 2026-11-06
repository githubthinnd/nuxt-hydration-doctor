/** A pristine copy of the server-rendered markup, taken before Vue touches the DOM. */
export interface ServerSnapshot {
  /**
   * Outer HTML of the `index`-th element in the snapshot whose `attribute` equals `value`,
   * or null when there is no such element.
   */
  findHtml(attribute: string, value: string, index: number): string | null;
}

/**
 * Captures the inner HTML of the elements `rootSelectors` match (the application root, and the
 * place `<Teleport>` content is rendered to), in document order so that "the n-th element with
 * this location" means the same thing in the snapshot and in the live page. Must run before
 * hydration starts: once Vue patches a mismatched node the original server markup is gone, which
 * is the whole reason this exists.
 *
 * The markup is parsed lazily, and only when an issue needs it, into an inert `<template>`
 * fragment: scripts do not run and images do not load, so inspecting it has no side effects.
 * Returns null when no root is found or the page is larger than `maxChars` (a dev-time guard
 * against copying a huge document).
 */
export function captureServerSnapshot(
  doc: Document,
  rootSelectors: string | readonly string[],
  maxChars: number,
): ServerSnapshot | null {
  const selectors = typeof rootSelectors === 'string' ? [rootSelectors] : rootSelectors;
  const roots = [
    ...new Set(selectors.flatMap((selector) => Array.from(doc.querySelectorAll(selector)))),
  ].sort((a, b) => (a.compareDocumentPosition(b) & 4 /* b follows a */ ? -1 : 1));
  if (roots.length === 0) return null;
  const html = roots.map((root) => root.innerHTML).join('');
  if (html.length > maxChars) return null;

  let content: DocumentFragment | null = null;
  const parsed = (): DocumentFragment => {
    if (content === null) {
      const template = doc.createElement('template');
      template.innerHTML = html;
      content = template.content;
    }
    return content;
  };

  return {
    findHtml(attribute, value, index) {
      const same = Array.from(parsed().querySelectorAll(`[${attribute}]`)).filter(
        (candidate) => candidate.getAttribute(attribute) === value,
      );
      return same[index]?.outerHTML ?? null;
    },
  };
}
