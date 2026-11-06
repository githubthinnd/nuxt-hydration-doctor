import {
  defineEventHandler,
  getHeaders,
  getQuery,
  getRequestURL,
  readRawBody,
  setResponseHeader,
  setResponseStatus,
  type EventHandler,
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

async function readJsonBody(
  declaredLength: string | undefined,
  read: () => Promise<string | undefined>,
): Promise<RequestBody> {
  // Refuse on the declared size before reading anything, then check what was actually received.
  if (declaredLength !== undefined && Number(declaredLength) > MAX_REPORT_BYTES) {
    return { kind: 'too-large' };
  }
  const raw = await read();
  if (raw === undefined || raw === '') return { kind: 'none' };
  if (Buffer.byteLength(raw) > MAX_REPORT_BYTES) return { kind: 'too-large' };
  try {
    return { kind: 'json', value: JSON.parse(raw) as unknown };
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
      method === 'POST'
        ? await readJsonBody(headers['content-length'], () => readRawBody(event, 'utf8'))
        : { kind: 'none' };

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
