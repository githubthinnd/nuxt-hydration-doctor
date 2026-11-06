import type { HydrationIssue } from '../domain/issue';
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
 * Collects the text that differs between the two renderings, from the markup diff and, for a text
 * mismatch, from the two texts Vue quotes in its own warning (the markup may be unavailable when
 * the element has no source location). Attribute and tag differences are not text and are left to
 * the rules that look at structure.
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

  const quoted = /-\s*rendered on server:([\s\S]*?)\n\s*-\s*expected on client:([\s\S]*)$/.exec(
    issue.message,
  );
  if (issue.kind === 'text-mismatch' && quoted !== null) {
    const server = (quoted[1] ?? '').trim();
    const client = (quoted[2] ?? '').trim();
    if (isText(server) && isText(client) && !server.startsWith('[object ')) add(server, client);
  }
  return changes;
}
