import { parse } from '@vue/compiler-sfc';
import MagicString, { type SourceMap } from 'magic-string';

/** Numeric values of `NodeTypes.ELEMENT` / `ElementTypes.ELEMENT` in @vue/compiler-core. */
const NODE_TYPE_ELEMENT = 1;
const ELEMENT_TYPE_PLAIN = 0;

/**
 * Tags that must never receive the attribute:
 * - `template` renders nothing (or is a native <template>) and an unknown attribute on a
 *   `v-if`/`v-for`/`v-slot` wrapper is meaningless;
 * - `slot` would forward the attribute to the slot content as a slot prop.
 */
const SKIPPED_TAGS: ReadonlySet<string> = new Set(['template', 'slot']);

/**
 * Makes `value` safe inside a double-quoted HTML attribute. A file name may legally contain `"`,
 * `&`, `<` or `>` (on POSIX, even a layer's `a"b.vue`); written as it is, the quote would end the
 * attribute early and the rest of the name would become attributes of the element (or break the
 * template). Vue decodes the entities when it compiles the template, so the DOM attribute ends up
 * holding the original text.
 */
export function escapeAttributeValue(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export interface InjectLocationsOptions {
  /** Attribute written into each tag, e.g. `data-nhd-loc`. */
  readonly attribute: string;
  /** Path stored in the attribute value; usually the file path relative to the project root. */
  readonly file: string;
}

export interface InjectLocationsResult {
  readonly code: string;
  readonly map: SourceMap;
}

/** The subset of a compiler-core template node this transform reads. */
interface TemplateNodeLike {
  readonly type: number;
  readonly tag?: string;
  readonly tagType?: number;
  readonly props?: readonly { readonly name: string }[];
  readonly children?: readonly TemplateNodeLike[];
  readonly loc: {
    readonly start: { readonly offset: number; readonly line: number; readonly column: number };
  };
}

/**
 * Stamps every plain element of a Vue SFC `<template>` with `attribute="file:line:column"`,
 * where line and column are the 1-based position of the tag's opening `<`.
 *
 * Returns null when nothing should change: no template, a non-HTML template language (Pug…),
 * an external `src` template, a parse error, or no eligible element. The caller then leaves the
 * module untouched, so this transform can never turn a valid file into a broken one.
 *
 * Mechanism: `@vue/compiler-sfc` parses the file into a template AST whose node offsets are
 * relative to the *whole* SFC source. Each insertion point is the offset just after the tag name
 * (`<div` | `class="a">`), so existing attributes, directives and whitespace are untouched and
 * `magic-string` can produce an accurate source map.
 */
export function injectLocations(
  source: string,
  options: InjectLocationsOptions,
): InjectLocationsResult | null {
  const { descriptor, errors } = parse(source, { sourceMap: false, ignoreEmpty: false });
  if (errors.length > 0) return null;

  const template = descriptor.template;
  if (template === null) return null;
  if (template.src !== undefined) return null;
  if (template.lang !== undefined && template.lang !== 'html') return null;
  if (template.ast === undefined) return null;

  const magic = new MagicString(source);
  let injected = 0;

  const visit = (nodes: readonly TemplateNodeLike[]): void => {
    for (const node of nodes) {
      if (node.type === NODE_TYPE_ELEMENT && node.tag !== undefined) {
        const alreadyStamped = node.props?.some((prop) => prop.name === options.attribute) === true;
        if (node.tagType === ELEMENT_TYPE_PLAIN && !SKIPPED_TAGS.has(node.tag) && !alreadyStamped) {
          const { offset, line, column } = node.loc.start;
          // `+ 1` skips the opening "<"; the tag name follows immediately.
          const insertAt = offset + 1 + node.tag.length;
          const location = `${options.file}:${String(line)}:${String(column)}`;
          magic.appendLeft(insertAt, ` ${options.attribute}="${escapeAttributeValue(location)}"`);
          injected += 1;
        }
      }
      if (node.children !== undefined) visit(node.children);
    }
  };
  visit(template.ast.children as readonly unknown[] as readonly TemplateNodeLike[]);

  if (injected === 0) return null;
  return {
    code: magic.toString(),
    map: magic.generateMap({ hires: 'boundary', source: options.file, includeContent: true }),
  };
}
