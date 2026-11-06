import type { DiagnosticResult, FixSuggestion } from '../../domain/diagnostic';
import { tokenizeHtml } from '../html-tokens';
import { clip, type Rule, type RuleInput } from './rule';

interface Violation {
  readonly parent: string;
  readonly child: string;
  readonly kind: 'block-in-p' | 'nested' | 'table-row' | 'table-cell' | 'table-content';
  readonly description: string;
}

/** Elements an HTML parser will not leave inside an open <p>: it closes the <p> first. */
const CLOSES_P: ReadonlySet<string> = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'details',
  'div',
  'dl',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hgroup',
  'hr',
  'main',
  'menu',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'ul',
]);
/** Boundaries the parser's "has a p element in button scope" check stops at. */
const P_SCOPE_BOUNDARY: ReadonlySet<string> = new Set([
  'applet',
  'button',
  'caption',
  'html',
  'marquee',
  'object',
  'table',
  'td',
  'template',
  'th',
]);
const HEADINGS: ReadonlySet<string> = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const TABLE_PARENTS: ReadonlySet<string> = new Set(['table', 'tbody', 'thead', 'tfoot']);
const TABLE_CHILDREN: ReadonlySet<string> = new Set([
  'caption',
  'colgroup',
  'tbody',
  'thead',
  'tfoot',
  'tr',
  'td',
  'th',
  'script',
  'style',
  'template',
]);

/** Violations of the nesting rules a browser's HTML parser enforces, for one opening tag. */
function violationFor(name: string, stack: readonly string[]): Violation | null {
  const top = stack[stack.length - 1];

  for (let i = stack.length - 1; i >= 0; i -= 1) {
    const ancestor = stack[i] ?? '';
    if (P_SCOPE_BOUNDARY.has(ancestor)) break;
    if (ancestor === 'p' && CLOSES_P.has(name)) {
      return {
        parent: 'p',
        child: name,
        kind: 'block-in-p',
        description: `<${name}> inside <p>: browsers close the <p> before a <${name}>, so the server HTML is restructured.`,
      };
    }
  }

  for (const same of ['a', 'button', 'form']) {
    if (name === same && stack.includes(same)) {
      return {
        parent: same,
        child: name,
        kind: 'nested',
        description: `<${name}> inside <${same}>: browsers do not allow it and close or move the outer element.`,
      };
    }
  }
  if (HEADINGS.has(name) && top !== undefined && HEADINGS.has(top)) {
    return {
      parent: top,
      child: name,
      kind: 'nested',
      description: `<${name}> directly inside <${top}>: browsers close the outer heading first.`,
    };
  }

  if (top !== undefined) {
    if (name === 'tr' && top === 'table') {
      return {
        parent: 'table',
        child: 'tr',
        kind: 'table-row',
        description:
          '<tr> directly inside <table>: browsers insert a <tbody> that the client does not render.',
      };
    }
    if ((name === 'td' || name === 'th') && TABLE_PARENTS.has(top)) {
      return {
        parent: top,
        child: name,
        kind: 'table-cell',
        description: `<${name}> directly inside <${top}>: browsers insert a <tr> around it.`,
      };
    }
    if ((TABLE_PARENTS.has(top) || top === 'tr') && !TABLE_CHILDREN.has(name)) {
      return {
        parent: top,
        child: name,
        kind: 'table-content',
        description: `<${name}> inside <${top}>: browsers move it out of the table, so the server HTML has it in a different place.`,
      };
    }
  }
  return null;
}

/**
 * Walks the client markup with the element's ancestors as the already-open stack, so nesting that
 * is only wrong in combination with an element outside the subtree (a component whose root is a
 * `<div>` used inside a `<p>`) is found too. The client DOM is built with DOM APIs and keeps the
 * invalid nesting; the server's HTML went through the parser, which repaired it. That difference
 * is the mismatch.
 */
export function findNestingViolations(ancestry: readonly string[], html: string): Violation[] {
  const stack = [...ancestry];
  const found: Violation[] = [];

  for (const token of tokenizeHtml(html)) {
    if (token.kind === 'open') {
      const violation = violationFor(token.name, stack);
      if (violation !== null) found.push(violation);
      if (!token.selfClosing) stack.push(token.name);
    } else if (token.kind === 'close') {
      const index = stack.lastIndexOf(token.name);
      if (index !== -1) stack.length = index;
    } else if (token.kind === 'text') {
      const top = stack[stack.length - 1];
      if (
        token.raw.trim() !== '' &&
        top !== undefined &&
        (TABLE_PARENTS.has(top) || top === 'tr')
      ) {
        found.push({
          parent: top,
          child: '#text',
          kind: 'table-content',
          description: `Text directly inside <${top}>: browsers move it out of the table.`,
        });
      }
    }
  }
  return found;
}

function fixFor(violation: Violation): FixSuggestion {
  switch (violation.kind) {
    case 'block-in-p':
      return {
        language: 'vue',
        description: `A <p> may only contain inline content. Make the outer element a <div>, or the inner one a <span>.`,
        code: `<!-- before -->
<p>
  <${violation.child}>…</${violation.child}>
</p>

<!-- after: pick the container that fits -->
<div>
  <${violation.child}>…</${violation.child}>
</div>`,
      };
    case 'table-row':
      return {
        language: 'vue',
        description: 'Write the <tbody> yourself, exactly as the browser would insert it.',
        code: `<table>
  <tbody>
    <tr>…</tr>
  </tbody>
</table>`,
      };
    case 'table-cell':
      return {
        language: 'vue',
        description: 'Cells belong in a row: wrap them in <tr>.',
        code: `<table>
  <tbody>
    <tr>
      <${violation.child}>…</${violation.child}>
    </tr>
  </tbody>
</table>`,
      };
    case 'table-content':
      return {
        language: 'vue',
        description: `Only table elements may sit directly inside a table. Put <${violation.child}> inside a <td>, or move it outside the table.`,
        code: `<table>
  <tbody>
    <tr>
      <td>
        <${violation.child === '#text' ? 'span' : violation.child}>…</${violation.child === '#text' ? 'span' : violation.child}>
      </td>
    </tr>
  </tbody>
</table>`,
      };
    case 'nested':
      return {
        language: 'vue',
        description: `Elements of this kind cannot be nested. Keep a single <${violation.parent}> and place the content next to it, or use a <span>/<div> for the outer wrapper.`,
        code: `<!-- before -->
<${violation.parent}>
  <${violation.child}>…</${violation.child}>
</${violation.parent}>

<!-- after -->
<div>
  <${violation.parent}>…</${violation.parent}>
  <${violation.child}>…</${violation.child}>
</div>`,
      };
  }
}

export const htmlNestingRule: Rule = {
  category: 'invalid-html-nesting',
  run({ issue }: RuleInput): DiagnosticResult | null {
    if (issue.clientHtml === null) return null;
    const violations = findNestingViolations(issue.ancestry, issue.clientHtml);
    const first = violations[0];
    if (first === undefined) return null;

    // The client DOM keeps the invalid structure; a structural mismatch on top of it is
    // exactly what a repaired server DOM produces.
    const structural = issue.kind === 'children-mismatch' || issue.kind === 'node-mismatch';
    const repaired = issue.serverHtml !== null && issue.serverHtml !== issue.clientHtml;
    return {
      category: 'invalid-html-nesting',
      confidence: structural ? (repaired ? 0.95 : 0.9) : 0.7,
      title: 'Invalid HTML nesting is repaired by the browser',
      explanation:
        'The HTML parser silently fixes certain illegal structures when it reads the server’s HTML (it closes a <p> before a <div>, inserts <tbody> and <tr>, moves stray content out of tables). Vue builds the same structure with DOM calls, which do not repair anything, so the two trees differ.',
      evidence: violations.slice(0, 3).map((violation) => clip(violation.description, 200)),
      fix: fixFor(first),
    };
  },
};
