/**
 * Helpers for the text of Vue's hydration warnings. Pure and linear: the text comes from the page
 * under test, so nothing here may take time that grows faster than the length of the message.
 */

/** Longer messages are cut before they are examined; the useful part is at the start. */
export const MAX_WARNING_CHARS = 20_000;

const SERVER_MARKER = '- rendered on server:';
const CLIENT_MARKER = '- expected on client:';
/** Vue closes attribute-like warnings with a note that is not part of the client value. */
const NOTE_MARKER = '\n  Note:';

export interface RenderedExpected {
  /** What Vue says the server rendered. */
  readonly server: string;
  /** What Vue says the client expected. */
  readonly client: string;
}

/**
 * Reads the two lines Vue puts in most hydration warnings:
 *
 *     - rendered on server: <value>
 *     - expected on client: <value>
 *
 * Found with `indexOf`, not a regular expression with lazy quantifiers, so a message with long
 * runs of newlines or spaces costs no more than its length. Returns null when either line is
 * missing.
 */
export function extractRenderedExpected(message: string): RenderedExpected | null {
  const text = message.length > MAX_WARNING_CHARS ? message.slice(0, MAX_WARNING_CHARS) : message;
  const serverAt = text.indexOf(SERVER_MARKER);
  if (serverAt === -1) return null;
  const clientAt = text.indexOf(CLIENT_MARKER, serverAt + SERVER_MARKER.length);
  if (clientAt === -1) return null;

  const server = text.slice(serverAt + SERVER_MARKER.length, clientAt).trim();
  let client = text.slice(clientAt + CLIENT_MARKER.length);
  const noteAt = client.indexOf(NOTE_MARKER);
  if (noteAt !== -1) client = client.slice(0, noteAt);
  return { server, client: client.trim() };
}

/**
 * Splits an attribute rendering such as `class="a b"` into its name and value. Vue prints
 * attribute-like mismatches this way. Returns null for anything else.
 */
export function splitAttribute(rendering: string): { name: string; value: string } | null {
  const equals = rendering.indexOf('="');
  if (equals < 1 || !rendering.endsWith('"') || rendering.length < equals + 3) return null;
  const name = rendering.slice(0, equals);
  if (!/^[A-Za-z_:][\w:.-]*$/.test(name)) return null;
  return { name, value: rendering.slice(equals + 2, -1) };
}
