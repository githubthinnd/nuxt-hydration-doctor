import type { HydrationMismatchKind } from '../domain/issue';
import { extractRenderedExpected, MAX_WARNING_CHARS } from '../domain/warning-text';

export interface ParsedHydrationWarning {
  readonly kind: HydrationMismatchKind;
  /** What Vue says the server rendered, when the warning carries it as plain text. */
  readonly serverText: string | null;
  /**
   * What Vue says the client expected: text for a text mismatch, the tag name for a node
   * mismatch, `name="value"` for class, style and attribute mismatches.
   */
  readonly clientText: string | null;
}

/**
 * Warning headings emitted by Vue's hydration code. Vue 3.5 words the text case "text content
 * mismatch", older releases "text mismatch"; both are accepted.
 */
const HEADINGS: readonly (readonly [RegExp, HydrationMismatchKind])[] = [
  [/^Hydration text (?:content )?mismatch/, 'text-mismatch'],
  [/^Hydration node mismatch/, 'node-mismatch'],
  [/^Hydration children mismatch/, 'children-mismatch'],
  [/^Hydration class mismatch/, 'class-mismatch'],
  [/^Hydration style mismatch/, 'style-mismatch'],
  [/^Hydration attribute mismatch/, 'attribute-mismatch'],
];

/**
 * Vue builds the message from its template plus `String(arg)` of every argument. DOM nodes
 * therefore come out as markup in some DOM implementations and as `[object HTMLParagraphElement]`
 * in real browsers, so a value like that is discarded instead of being treated as text.
 */
function cleanText(raw: string | undefined): string | null {
  if (raw === undefined || raw === '' || raw.startsWith('[object ')) return null;
  return raw;
}

/**
 * Recognises one of the hydration warnings and extracts what the message itself can tell us.
 * Everything that needs the DOM (markup, location) is resolved elsewhere, because the message
 * cannot be relied on for it. Returns null for any other message.
 */
export function parseHydrationWarning(message: string): ParsedHydrationWarning | null {
  const text = (
    message.length > MAX_WARNING_CHARS ? message.slice(0, MAX_WARNING_CHARS) : message
  ).trim();
  for (const [pattern, kind] of HEADINGS) {
    if (!pattern.test(text)) continue;
    const pair = extractRenderedExpected(text);
    return {
      kind,
      serverText: cleanText(pair?.server),
      clientText: cleanText(pair?.client),
    };
  }
  return null;
}
