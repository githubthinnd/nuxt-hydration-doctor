/** A pristine copy of the server-rendered markup, taken before Vue touches the DOM. */
export interface ServerSnapshot {
  /**
   * Outer HTML of the `index`-th element in the snapshot whose `attribute` equals `value`,
   * or null when there is no such element.
   */
  findHtml(attribute: string, value: string, index: number): string | null;
}

/**
 * Captures `rootSelector`'s inner HTML. Must run before hydration starts: once Vue patches a
 * mismatched node the original server markup is gone, which is the whole reason this exists.
 *
 * The markup is parsed lazily, and only when an issue needs it, into an inert `<template>`
 * fragment: scripts do not run and images do not load, so inspecting it has no side effects.
 * Returns null when the root is missing or the page is larger than `maxChars` (a dev-time guard
 * against copying a huge document).
 */
export function captureServerSnapshot(
  doc: Document,
  rootSelector: string,
  maxChars: number,
): ServerSnapshot | null {
  const root = doc.querySelector(rootSelector);
  if (root === null) return null;
  const html = root.innerHTML;
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
