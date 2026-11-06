import type { DiffRow, DiffSegment, HtmlDiff } from '../domain/diff';

/** Beyond this many lines per side the diff is cut: the LCS table grows with the product. */
const MAX_LINES = 400;
const INDENT = '  ';

const VOID_TAGS: ReadonlySet<string> = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

export interface HtmlDiffOptions {
  /** Attribute names removed from every tag before comparing (noise such as `data-nhd-loc`). */
  readonly hideAttributes?: readonly string[];
}

/** Comments, tags (with quoted attribute values that may contain ">"), or runs of text. */
const TOKEN = /<!--[\s\S]*?-->|<\/?[a-zA-Z][^\s>/]*(?:"[^"]*"|'[^']*'|[^>"'])*>|[^<]+|</g;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripAttributes(tag: string, hidden: readonly string[]): string {
  let result = tag;
  for (const name of hidden) {
    const pattern = new RegExp(
      `\\s+${escapeRegExp(name)}(?:\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]+))?(?=[\\s/>])`,
      'gi',
    );
    result = result.replace(pattern, '');
  }
  return result;
}

/**
 * Turns markup into one trimmed token per line, indented by nesting depth, so that two renderings
 * of the same tree line up and a single differing tag or text is a single differing line.
 * Returns the lines and whether they were cut at {@link MAX_LINES}.
 */
function toLines(html: string, hidden: readonly string[]): { lines: string[]; truncated: boolean } {
  const lines: string[] = [];
  let depth = 0;

  for (const match of html.matchAll(TOKEN)) {
    const token = match[0];
    if (token.startsWith('<!--')) {
      lines.push(INDENT.repeat(depth) + token);
    } else if (token.startsWith('</')) {
      depth = Math.max(0, depth - 1);
      lines.push(INDENT.repeat(depth) + token.replace(/\s+/g, ' '));
    } else if (token.startsWith('<') && token.length > 1) {
      const tag = stripAttributes(token, hidden).replace(/\s+/g, ' ');
      lines.push(INDENT.repeat(depth) + tag);
      const name = /^<([a-zA-Z][^\s>/]*)/.exec(tag)?.[1]?.toLowerCase() ?? '';
      if (!tag.endsWith('/>') && !VOID_TAGS.has(name)) depth += 1;
    } else {
      const text = token.replace(/\s+/g, ' ').trim();
      if (text !== '') lines.push(INDENT.repeat(depth) + text);
    }
    if (lines.length > MAX_LINES) return { lines: lines.slice(0, MAX_LINES), truncated: true };
  }
  return { lines, truncated: false };
}

type Op =
  | { readonly type: 'same'; readonly a: string; readonly b: string }
  | {
      readonly type: 'del';
      readonly a: string;
    }
  | { readonly type: 'add'; readonly b: string };

/** Classic longest-common-subsequence alignment of two line lists. */
function align(a: readonly string[], b: readonly string[]): Op[] {
  const width = b.length + 1;
  const table = new Uint16Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i * width + j] =
        a[i] === b[j]
          ? (table[(i + 1) * width + j + 1] ?? 0) + 1
          : Math.max(table[(i + 1) * width + j] ?? 0, table[i * width + j + 1] ?? 0);
    }
  }

  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    const left = a[i];
    const right = b[j];
    if (left !== undefined && right !== undefined && left === right) {
      ops.push({ type: 'same', a: left, b: right });
      i += 1;
      j += 1;
    } else if (
      left !== undefined &&
      (right === undefined || (table[(i + 1) * width + j] ?? 0) >= (table[i * width + j + 1] ?? 0))
    ) {
      ops.push({ type: 'del', a: left });
      i += 1;
    } else if (right !== undefined) {
      ops.push({ type: 'add', b: right });
      j += 1;
    }
  }
  return ops;
}

/** Marks only the middle of two lines as different: the shared prefix and suffix match. */
function inlineSegments(a: string, b: string): [DiffSegment[], DiffSegment[]] {
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < a.length - prefix &&
    suffix < b.length - prefix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  const build = (text: string): DiffSegment[] =>
    [
      { text: text.slice(0, prefix), diverges: false },
      { text: text.slice(prefix, text.length - suffix), diverges: true },
      { text: text.slice(text.length - suffix), diverges: false },
    ].filter((segment) => segment.text !== '');
  return [build(a), build(b)];
}

/**
 * Side-by-side diff of the server-rendered markup against the client-rendered markup.
 *
 * Both sides are normalised to one tag or text node per line first, then aligned with an LCS so
 * insertions and deletions do not shift every following row. Runs of removed lines directly
 * followed by added lines are paired into `changed` rows, whose differing part is isolated.
 */
export function diffHtml(server: string, client: string, options: HtmlDiffOptions = {}): HtmlDiff {
  const hidden = options.hideAttributes ?? [];
  const left = toLines(server, hidden);
  const right = toLines(client, hidden);
  const ops = align(left.lines, right.lines);

  const rows: DiffRow[] = [];
  let index = 0;
  while (index < ops.length) {
    const op = ops[index];
    if (op === undefined) break;
    if (op.type === 'same') {
      const segment = [{ text: op.a, diverges: false }];
      rows.push({ status: 'same', server: segment, client: segment });
      index += 1;
      continue;
    }
    // Gather one contiguous run of deletions and additions and pair them off.
    const removed: string[] = [];
    const added: string[] = [];
    while (index < ops.length) {
      const next = ops[index];
      if (next === undefined || next.type === 'same') break;
      if (next.type === 'del') removed.push(next.a);
      else added.push(next.b);
      index += 1;
    }
    for (let k = 0; k < Math.max(removed.length, added.length); k += 1) {
      const a = removed[k];
      const b = added[k];
      if (a !== undefined && b !== undefined) {
        const [serverSegments, clientSegments] = inlineSegments(a, b);
        rows.push({ status: 'changed', server: serverSegments, client: clientSegments });
      } else if (a !== undefined) {
        rows.push({ status: 'removed', server: [{ text: a, diverges: true }], client: null });
      } else if (b !== undefined) {
        rows.push({ status: 'added', server: null, client: [{ text: b, diverges: true }] });
      }
    }
  }

  return {
    rows,
    identical: rows.every((row) => row.status === 'same'),
    truncated: left.truncated || right.truncated,
  };
}
