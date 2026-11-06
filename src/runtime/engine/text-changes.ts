import type { HydrationIssue } from '../domain/issue';
import { extractRenderedExpected, splitAttribute } from '../domain/warning-text';
import { diffHtml } from './html-diff';

/** One piece of text that is not the same on the server and on the client. */
export interface TextChange {
  /** Text the server rendered, or null when the client added text the server did not have. */
  readonly server: string | null;
  /** Text the client rendered, or null when the server rendered text the client did not. */
  readonly client: string | null;
}

const isText = (line: string): boolean => line !== '' && !line.startsWith('<');
const flatten = (segments: readonly { readonly text: string }[] | null): string =>
  (segments ?? [])
    .map((segment) => segment.text)
    .join('')
    .trim();

/**
 * Collects the text that differs between the two renderings, from the markup diff and from the
 * two values Vue quotes in its own warning: the texts of a text mismatch, the values of a class,
 * style or attribute mismatch (the markup may be unavailable when the element has no source
 * location, and after an attribute mismatch the DOM still holds the server's value). Tag
 * differences are not text and are left to the rules that look at structure.
 */
export function extractTextChanges(issue: HydrationIssue): readonly TextChange[] {
  const changes: TextChange[] = [];
  const add = (server: string | null, client: string | null): void => {
    if (changes.some((known) => known.server === server && known.client === client)) return;
    changes.push({ server, client });
  };

  if (issue.serverHtml !== null && issue.clientHtml !== null) {
    for (const row of diffHtml(issue.serverHtml, issue.clientHtml).rows) {
      const server = flatten(row.server);
      const client = flatten(row.client);
      if (row.status === 'changed' && isText(server) && isText(client)) add(server, client);
      else if (row.status === 'removed' && isText(server)) add(server, null);
      else if (row.status === 'added' && isText(client)) add(null, client);
    }
  }

  const quoted = extractRenderedExpected(issue.message);
  if (quoted !== null) {
    if (issue.kind === 'text-mismatch') {
      if (isText(quoted.server) && isText(quoted.client) && !quoted.server.startsWith('[object ')) {
        add(quoted.server, quoted.client);
      }
    } else if (
      issue.kind === 'class-mismatch' ||
      issue.kind === 'style-mismatch' ||
      issue.kind === 'attribute-mismatch'
    ) {
      // `class="a"` against `class="b"`: compare the values, so the rules see a width, a
      // timestamp or an id exactly as they would in text.
      const server = splitAttribute(quoted.server);
      const client = splitAttribute(quoted.client);
      if (server !== null && client !== null) add(server.value, client.value);
    }
  }
  return changes;
}
