import type { HydrationMismatchKind } from '../domain/issue';

export interface ParsedHydrationWarning {
  readonly kind: HydrationMismatchKind;
  /** Text Vue says the server rendered, when the warning carries it as plain text. */
  readonly serverText: string | null;
  /** Text (or tag name, for node mismatches) Vue expected on the client. */
  readonly clientText: string | null;
}

/**
 * Warning headings emitted by Vue's hydration code. Vue 3.5 words the text case "text content
 * mismatch", older releases "text mismatch"; both are accepted. Other hydration diagnostics
 * (attribute, class, style) are intentionally not matched yet.
 */
const HEADINGS: readonly (readonly [RegExp, HydrationMismatchKind])[] = [
  [/^Hydration text (?:content )?mismatch/, 'text-mismatch'],
  [/^Hydration node mismatch/, 'node-mismatch'],
  [/^Hydration children mismatch/, 'children-mismatch'],
];

const SERVER_AND_CLIENT = /-\s*rendered on server:([\s\S]*?)\n\s*-\s*expected on client:([\s\S]*)$/;

/**
 * Vue builds the message from its template plus `String(arg)` of every argument. DOM nodes
 * therefore come out as markup in some DOM implementations and as `[object HTMLParagraphElement]`
 * in real browsers, so a value like that is discarded instead of being treated as text.
 */
function cleanText(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const text = raw.trim();
  if (text === '' || text.startsWith('[object ')) return null;
  return text;
}

/**
 * Recognises one of the three hydration warnings and extracts what the message itself can tell
 * us. Everything that needs the DOM (markup, location) is resolved elsewhere, because the message
 * cannot be relied on for it. Returns null for any other message.
 */
export function parseHydrationWarning(message: string): ParsedHydrationWarning | null {
  const text = message.trim();
  for (const [pattern, kind] of HEADINGS) {
    if (!pattern.test(text)) continue;
    const detail = SERVER_AND_CLIENT.exec(text);
    return {
      kind,
      serverText: cleanText(detail?.[1]),
      clientText: cleanText(detail?.[2]),
    };
  }
  return null;
}
