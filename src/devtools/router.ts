import { resolve, sep } from 'node:path';
import { parseHydrationReport } from '../runtime/domain/report';
import { ASSET_CSS, ASSET_HTML, ASSET_JS, DEVTOOLS_BASE } from './page';
import type { ReportRegistry, StoredReport } from './registry';

/** The result of reading a request body, decided by the transport before the router runs. */
export type RequestBody =
  | { readonly kind: 'none' }
  | { readonly kind: 'json'; readonly value: unknown }
  | { readonly kind: 'too-large' }
  | { readonly kind: 'invalid' };

export interface DevtoolsRequest {
  readonly method: string;
  /** Path below the mount point: `/`, `/issues`, `/app.js`… */
  readonly path: string;
  readonly query: Readonly<Record<string, string | undefined>>;
  /** Header names in lower case. */
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly body: RequestBody;
}

export interface DevtoolsResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

export interface RouterDeps {
  readonly registry: ReportRegistry;
  /** Project root: the only place "Open in Editor" may point into. */
  readonly rootDir: string;
}

/** The marker header the dev endpoint requires on anything that is not a plain page load. */
export const CLIENT_HEADER = 'x-nhd-client';

const COMMON_HEADERS = {
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
} as const;

/**
 * Same-origin only, no inline script, nothing loaded from elsewhere, and not embeddable by other
 * sites: the page renders text that came from the application under test.
 */
const PAGE_CSP =
  "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'";

function respond(
  status: number,
  body: string,
  headers: Readonly<Record<string, string>> = {},
): DevtoolsResponse {
  return { status, headers: { ...COMMON_HEADERS, ...headers }, body };
}

function json(status: number, value: unknown): DevtoolsResponse {
  return respond(status, JSON.stringify(value), {
    'content-type': 'application/json; charset=utf-8',
  });
}

function asset(
  body: string,
  type: string,
  extra: Readonly<Record<string, string>> = {},
): DevtoolsResponse {
  return respond(200, body, { 'content-type': `${type}; charset=utf-8`, ...extra });
}

/**
 * Absolute path of a reported file for the editor, or null when it would leave the project.
 * Reported paths come from the browser, so they are resolved and confined to `rootDir`: the
 * response never names a file outside the project, whatever the report claimed.
 */
export function resolveEditorFile(rootDir: string, file: string): string | null {
  const root = resolve(rootDir);
  const absolute = resolve(root, file);
  return absolute.startsWith(root + sep) ? absolute : null;
}

function isSameSite(request: DevtoolsRequest): boolean {
  // Browsers label every request; cross-site ones are refused. Non-browser clients send none.
  const site = request.headers['sec-fetch-site'];
  return site === undefined || site === 'same-origin' || site === 'none';
}

function withEditorFile(
  rootDir: string,
  report: StoredReport,
): StoredReport & { editorFile: string | null } {
  const { location } = report.issue;
  return {
    ...report,
    editorFile: location === null ? null : resolveEditorFile(rootDir, location.file),
  };
}

/**
 * The whole dev API as a pure function from request to response, so it can be tested without a
 * server. The transport (see `handler.ts`) only translates to and from it.
 *
 *   GET    /            the DevTools tab page          GET /app.js, /style.css   its assets
 *   GET    /issues      reports since `?since=<seq>`   POST   /issues            a new report
 *   DELETE /issues      forget the history
 *
 * Defences, because this endpoint is reachable by anything that can reach the dev server:
 * cross-site requests are refused; writes also need the `x-nhd-client` header, which a cross-origin
 * page cannot add without a preflight that this server never answers; bodies are size-capped by
 * the transport and strictly validated here; the page is served with a strict CSP.
 */
export function handleDevtoolsRequest(
  request: DevtoolsRequest,
  deps: RouterDeps,
): DevtoolsResponse {
  const { method, path } = request;
  const known = ['/', '/app.js', '/style.css', '/issues'].includes(path);
  if (!known) return respond(404, 'Not found', { 'content-type': 'text/plain; charset=utf-8' });
  if (!isSameSite(request)) return respond(403, 'Cross-site requests are not allowed');

  if (path === '/issues') {
    if (method === 'GET') {
      const since = Number(request.query['since'] ?? 0);
      const after = Number.isSafeInteger(since) && since >= 0 ? since : 0;
      return json(200, {
        generation: deps.registry.generation(),
        latest: deps.registry.latest(),
        reports: deps.registry.since(after).map((report) => withEditorFile(deps.rootDir, report)),
      });
    }
    if (method === 'POST' || method === 'DELETE') {
      if (request.headers[CLIENT_HEADER] !== '1') return respond(403, 'Missing client header');
      if (method === 'DELETE') {
        deps.registry.clear();
        return json(200, { ok: true });
      }
      if (request.body.kind === 'too-large') return respond(413, 'Report too large');
      if (request.body.kind !== 'json') return respond(400, 'Expected a JSON body');
      const report = parseHydrationReport(request.body.value);
      if (report === null) return respond(400, 'Invalid report');
      return json(201, { seq: deps.registry.add(report).seq });
    }
    return respond(405, 'Method not allowed', { allow: 'GET, POST, DELETE' });
  }

  if (method !== 'GET') return respond(405, 'Method not allowed', { allow: 'GET' });
  if (path === '/app.js') return asset(ASSET_JS, 'text/javascript');
  if (path === '/style.css') return asset(ASSET_CSS, 'text/css');
  return asset(ASSET_HTML, 'text/html', { 'content-security-policy': PAGE_CSP });
}

export { DEVTOOLS_BASE };
