import type { SourceLocation } from './issue';

/** Formats a location the way the injected attribute stores it: `file:line:column`. */
export function formatSourceLocation(location: SourceLocation): string {
  return `${location.file}:${String(location.line)}:${String(location.column)}`;
}

/**
 * Parses an attribute value written by the AST injector.
 *
 * The file part may itself contain colons (a Windows drive letter, say), so line and column are
 * taken from the right. Returns null for anything that is not `file:line:column` with 1-based
 * positive integers: the attribute lives in the DOM, so it can be edited or forged.
 */
export function parseSourceLocation(value: string): SourceLocation | null {
  const match = /^(.+):(\d+):(\d+)$/.exec(value);
  if (match === null) return null;
  const [, file, line, column] = match;
  if (file === undefined || line === undefined || column === undefined) return null;
  const lineNumber = Number(line);
  const columnNumber = Number(column);
  if (!Number.isSafeInteger(lineNumber) || !Number.isSafeInteger(columnNumber)) return null;
  if (lineNumber < 1 || columnNumber < 1) return null;
  return { file, line: lineNumber, column: columnNumber };
}
