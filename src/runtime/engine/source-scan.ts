/**
 * A small, forgiving scanner for the compiled `setup`/`render` text of a component.
 *
 * It is not a JavaScript parser. It only needs to answer "does this call appear in code that
 * runs while the component is set up and rendered, as opposed to in a string, a comment or a
 * callback that only runs after mount?", so it blanks strings and comments, then blanks the
 * argument lists of calls that run on the client only (`onMounted(...)`), and lets plain regular
 * expressions look at what is left. Blanking keeps every offset and line break, so a match can be
 * mapped back to the original text.
 */

/** Calls whose callbacks never run during server rendering or initial hydration. */
const CLIENT_ONLY_CALLS =
  /\b(?:onMounted|onUpdated|onBeforeUpdate|onBeforeUnmount|onUnmounted|onActivated|onDeactivated|nextTick)\b\)?\s*\(/g;

export interface SourceMatch {
  /** What matched (the regex's first group, or the whole match). */
  readonly text: string;
  /** The original source line, trimmed and shortened, for showing as evidence. */
  readonly line: string;
  /** True for code at the top level of the function body, which always runs while setting up. */
  readonly topLevel: boolean;
}

function blank(text: string): string {
  return text.replace(/[^\n]/g, ' ');
}

/** Replaces string contents and comments with spaces; `${...}` code inside templates is kept. */
export function blankStringsAndComments(source: string): string {
  let out = '';
  // Each open template literal remembers the brace depth at which its `${` started.
  const templates: number[] = [];
  let braces = 0;
  let index = 0;

  while (index < source.length) {
    const char = source.charAt(index);
    const next = source.charAt(index + 1);
    const inTemplateText = templates.length > 0 && braces === templates[templates.length - 1];

    if (!inTemplateText && char === '/' && next === '/') {
      const end = source.indexOf('\n', index);
      const stop = end === -1 ? source.length : end;
      out += blank(source.slice(index, stop));
      index = stop;
    } else if (!inTemplateText && char === '/' && next === '*') {
      const end = source.indexOf('*/', index + 2);
      const stop = end === -1 ? source.length : end + 2;
      out += blank(source.slice(index, stop));
      index = stop;
    } else if (!inTemplateText && (char === '"' || char === "'")) {
      let end = index + 1;
      while (end < source.length && source.charAt(end) !== char && source.charAt(end) !== '\n') {
        end += source.charAt(end) === '\\' ? 2 : 1;
      }
      out += char + blank(source.slice(index + 1, end)) + char;
      index = end + 1;
    } else if (char === '`' && !inTemplateText) {
      templates.push(braces);
      out += '`';
      index += 1;
    } else if (inTemplateText) {
      if (char === '`') {
        templates.pop();
        out += '`';
        index += 1;
      } else if (char === '$' && next === '{') {
        braces += 1;
        out += '${';
        index += 2;
      } else {
        out += char === '\n' ? '\n' : char === '\\' ? '  ' : ' ';
        index += char === '\\' ? 2 : 1;
      }
    } else {
      if (char === '{') braces += 1;
      else if (char === '}') braces -= 1;
      out += char;
      index += 1;
    }
  }
  return out;
}

/** Index of the `)` that closes the `(` at `open`, or the end of the text. */
function closingParen(code: string, open: number): number {
  let depth = 0;
  for (let index = open; index < code.length; index += 1) {
    const char = code.charAt(index);
    if (char === '(') depth += 1;
    else if (char === ')') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return code.length;
}

/** Blanks the argument list of every client-only call, so what remains is code that runs on SSR. */
function blankClientOnlyCalls(code: string): string {
  let result = code;
  for (const match of code.matchAll(CLIENT_ONLY_CALLS)) {
    const open = match.index + match[0].length - 1;
    const close = closingParen(code, open);
    result = result.slice(0, open + 1) + blank(result.slice(open + 1, close)) + result.slice(close);
  }
  return result;
}

/** The text a rule should search: no strings, no comments, no client-only callbacks. */
export function serverRunCode(source: string): string {
  return blankClientOnlyCalls(blankStringsAndComments(source));
}

function lineAt(source: string, index: number): string {
  const start = source.lastIndexOf('\n', index) + 1;
  const end = source.indexOf('\n', index);
  const line = source.slice(start, end === -1 ? undefined : end).trim();
  return line.length > 140 ? `${line.slice(0, 140)}…` : line;
}

/** Brace depth just before `index` (1 means directly in the body of the outer function). */
function braceDepthAt(code: string, index: number): number {
  let depth = 0;
  for (let i = 0; i < index; i += 1) {
    const char = code.charAt(i);
    if (char === '{') depth += 1;
    else if (char === '}') depth -= 1;
  }
  return depth;
}

/**
 * Finds `pattern` in the part of `source` that runs on the server. `pattern` should have the `g`
 * flag; its first capture group, when present, becomes `text`.
 */
export function findInServerCode(source: string, pattern: RegExp): SourceMatch[] {
  const code = serverRunCode(source);
  return [...code.matchAll(pattern)].map((match) => ({
    text: match[1] ?? match[0],
    line: lineAt(source, match.index),
    topLevel: braceDepthAt(code, match.index) <= 1,
  }));
}
