/** Elements that never have children or a closing tag. */
export const VOID_TAGS: ReadonlySet<string> = new Set([
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

/** Comments, tags (with quoted attribute values that may contain ">"), or runs of text. */
const TOKEN = /<!--[\s\S]*?-->|<\/?[a-zA-Z][^\s>/]*(?:"[^"]*"|'[^']*'|[^>"'])*>|[^<]+|</g;

export type HtmlToken =
  | { readonly kind: 'comment'; readonly raw: string }
  | {
      readonly kind: 'open';
      readonly raw: string;
      readonly name: string;
      readonly selfClosing: boolean;
    }
  | { readonly kind: 'close'; readonly raw: string; readonly name: string }
  | { readonly kind: 'text'; readonly raw: string };

/** Splits markup into comment, opening tag, closing tag and text tokens. */
export function tokenizeHtml(html: string): HtmlToken[] {
  const tokens: HtmlToken[] = [];
  for (const match of html.matchAll(TOKEN)) {
    const raw = match[0];
    if (raw.startsWith('<!--')) {
      tokens.push({ kind: 'comment', raw });
    } else if (raw.startsWith('</')) {
      const name = /^<\/([a-zA-Z][^\s>/]*)/.exec(raw)?.[1]?.toLowerCase() ?? '';
      tokens.push({ kind: 'close', raw, name });
    } else if (raw.startsWith('<') && raw.length > 1) {
      const name = /^<([a-zA-Z][^\s>/]*)/.exec(raw)?.[1]?.toLowerCase() ?? '';
      tokens.push({
        kind: 'open',
        raw,
        name,
        selfClosing: raw.endsWith('/>') || VOID_TAGS.has(name),
      });
    } else {
      tokens.push({ kind: 'text', raw });
    }
  }
  return tokens;
}
