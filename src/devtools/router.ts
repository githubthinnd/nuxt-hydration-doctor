import { resolve, sep } from 'node:path';
import { DEVTOOLS_CLIENT_HEADER } from '../runtime/domain/constants';
import { parseHydrationReport } from '../runtime/domain/report';
import { isHostAllowed, isOriginAllowed, LOOPBACK_ONLY, type AllowedHosts } from './host';
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
  /** Project root: reported paths are relative to it. */
  readonly rootDir: string;
  /**
   * Directories "Open in Editor" may point into. Defaults to the project root; Nuxt layers add
   * theirs, since a file of a layer is stamped with a path like `../base/components/A.vue`.
   */
  readonly allowedRoots?: readonly string[];
  /** Host names the endpoint answers to besides loopback names and IP addresses. */
  readonly allowedHosts?: AllowedHosts;
}

/** The marker header the dev endpoint requires on anything that is not a plain page load. */
export { DEVTOOLS_CLIENT_HEADER as CLIENT_HEADER } from '../runtime/domain/constants';

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
 * Reported paths come from the browser, so they are resolved against `rootDir` and confined to it
 * and to `extraRoots` (the directories of Nuxt layers): the response never names a file anywhere
 * else, whatever the report claimed. Symbolic links are not followed.
 */
export function resolveEditorFile(
  rootDir: string,
  file: string,
  extraRoots: readonly string[] = [],
): string | null {
  const base = resolve(rootDir);
  const absolute = resolve(base, file);
  const roots = [base, ...extraRoots.map((root) => resolve(root))];
  return roots.some((root) => absolute.startsWith(root + sep)) ? absolute : null;
}

function isSameSite(request: DevtoolsRequest): boolean {
  // Browsers label every request; cross-site ones are refused. Non-browser clients send none.
  const site = request.headers['sec-fetch-site'];
  return site === undefined || site === 'same-origin' || site === 'none';
}

function withEditorFile(
  deps: RouterDeps,
  report: StoredReport,
): StoredReport & { editorFile: string | null } {
  const { location } = report.issue;
  return {
    ...report,
    editorFile:
      location === null ? null : resolveEditorFile(deps.rootDir, location.file, deps.allowedRoots),
  };
}

/** A positive integer from a query value, or `fallback`. */
function positiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 1 ? n : fallback;
}

const HOST_REFUSED =
  'Host not allowed. Reach the dev server through localhost or an IP address, or add the host name to devServer.host or vite.server.allowedHosts.';

/**
 * The whole dev API as a pure function from request to response, so it can be tested without a
 * server. The transport (see `handler.ts`) only translates to and from it.
 *
 *   GET    /            the DevTools tab page          GET /app.js, /style.css   its assets
 *   GET    /issues      reports since `?since=<seq>`   POST   /issues            a new report
 *   DELETE /issues      forget the history             GET    /open?file&line&column
 *                                                      redirect to Nuxt's open-in-editor
 *
 * Defences, because this endpoint is reachable by anything that can reach the dev server:
 * requests whose `Host` is a foreign domain name are refused (DNS rebinding), as are cross-site
 * and cross-origin ones; writes also need the `x-nhd-client` header, which a cross-origin
 * page cannot add without a preflight that this server never answers; bodies are size-capped by
 * the transport and strictly validated here; the page is served with a strict CSP.
 */
export function handleDevtoolsRequest(
  request: DevtoolsRequest,
  deps: RouterDeps,
): DevtoolsResponse {
  const { method, path } = request;
  const known = ['/', '/app.js', '/style.css', '/issues', '/open'].includes(path);
  if (!known) return respond(404, 'Not found', { 'content-type': 'text/plain; charset=utf-8' });
  // Name checks first: a rebound domain looks same-origin to the browser, so only `Host` gives it
  // away (see host.ts). Then the cross-site and cross-origin checks.
  if (!isHostAllowed(request.headers['host'], deps.allowedHosts ?? LOOPBACK_ONLY)) {
    return respond(403, HOST_REFUSED);
  }
  if (
    !isSameSite(request) ||
    !isOriginAllowed(request.headers['origin'], request.headers['host'])
  ) {
    return respond(403, 'Cross-site requests are not allowed');
  }

  if (path === '/open') {
    if (method !== 'GET') return respond(405, 'Method not allowed', { allow: 'GET' });
    // Opening an editor is a side effect, so it needs the marker header like any write.
    if (request.headers[DEVTOOLS_CLIENT_HEADER] !== '1')
      return respond(403, 'Missing client header');
    const file = request.query['file'];
    const absolute =
      file === undefined || file === '' || file.length > 500
        ? null
        : resolveEditorFile(deps.rootDir, file, deps.allowedRoots);
    if (absolute === null) return respond(400, 'The file is not inside the project');
    const line = positiveInt(request.query['line'], 1);
    const column = positiveInt(request.query['column'], 1);
    const target = `/__open-in-editor?file=${encodeURIComponent(`${absolute}:${String(line)}:${String(column)}`)}`;
    return respond(302, '', { location: target });
  }

  if (path === '/issues') {
    if (method === 'GET') {
      const since = Number(request.query['since'] ?? 0);
      const after = Number.isSafeInteger(since) && since >= 0 ? since : 0;
      return json(200, {
        epoch: deps.registry.epoch(),
        generation: deps.registry.generation(),
        latest: deps.registry.latest(),
        reports: deps.registry.since(after).map((report) => withEditorFile(deps, report)),
      });
    }
    if (method === 'POST' || method === 'DELETE') {
      if (request.headers[DEVTOOLS_CLIENT_HEADER] !== '1')
        return respond(403, 'Missing client header');
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
