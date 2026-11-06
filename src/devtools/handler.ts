import {
  defineEventHandler,
  getHeaders,
  getQuery,
  getRequestURL,
  getRequestWebStream,
  setResponseHeader,
  setResponseStatus,
  type EventHandler,
  type H3Event,
} from 'h3';
import { MAX_REPORT_BYTES } from '../runtime/domain/report';
import { DEVTOOLS_BASE } from './page';
import { handleDevtoolsRequest, type RequestBody, type RouterDeps } from './router';

function stringQuery(query: Readonly<Record<string, unknown>>): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(query).map(([key, value]) => [
      key,
      typeof value === 'string' ? value : undefined,
    ]),
  );
}

/**
 * Reads the request body, stopping as soon as it passes `limit` bytes.
 *
 * The body is consumed chunk by chunk and counted, so a request without a `Content-Length` (a
 * chunked upload) cannot make the dev process buffer more than `limit` bytes before it is refused.
 * Returns the text (null when there is no body) or that it was too large.
 */
type BoundedRead =
  { readonly kind: 'text'; readonly text: string | null } | { readonly kind: 'too-large' };

async function readBounded(event: H3Event, limit: number): Promise<BoundedRead> {
  const stream = getRequestWebStream(event);
  if (stream === undefined) return { kind: 'text', text: null };
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = (await reader.read()) as { done: boolean; value?: Uint8Array };
    if (done) break;
    if (value === undefined) continue;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => undefined);
      return { kind: 'too-large' };
    }
    chunks.push(value);
  }
  return { kind: 'text', text: total === 0 ? null : Buffer.concat(chunks).toString('utf8') };
}

async function readJsonBody(
  event: H3Event,
  declaredLength: string | undefined,
): Promise<RequestBody> {
  // Refuse on the declared size before reading anything; the counted read covers the rest.
  if (declaredLength !== undefined && Number(declaredLength) > MAX_REPORT_BYTES) {
    return { kind: 'too-large' };
  }
  const read = await readBounded(event, MAX_REPORT_BYTES);
  if (read.kind === 'too-large') return { kind: 'too-large' };
  if (read.text === null) return { kind: 'none' };
  try {
    return { kind: 'json', value: JSON.parse(read.text) as unknown };
  } catch {
    return { kind: 'invalid' };
  }
}

/**
 * The transport: turns an h3 event into a {@link handleDevtoolsRequest} call and writes its
 * response back. It holds no logic of its own beyond reading a bounded body, so everything that
 * matters is tested through the pure router.
 */
export function createDevtoolsHandler(deps: RouterDeps): EventHandler {
  return defineEventHandler(async (event) => {
    const { pathname } = getRequestURL(event);
    // Mounted under a prefix, h3 may or may not have stripped it already.
    const path = pathname.startsWith(DEVTOOLS_BASE)
      ? pathname.slice(DEVTOOLS_BASE.length)
      : pathname;
    const headers = getHeaders(event);
    const method = event.method;

    const body: RequestBody =
      method === 'POST' ? await readJsonBody(event, headers['content-length']) : { kind: 'none' };

    const response = handleDevtoolsRequest(
      {
        method,
        path: path === '' ? '/' : path,
        query: stringQuery(getQuery(event)),
        headers,
        body,
      },
      deps,
    );
    setResponseStatus(event, response.status);
    for (const [name, value] of Object.entries(response.headers)) {
      setResponseHeader(event, name, value);
    }
    return response.body;
  });
}
