import type { DiagnosticResult } from '../domain/diagnostic';
import type { HydrationIssue } from '../domain/issue';
import { DEVTOOLS_CLIENT_HEADER } from '../domain/constants';
import { fitReport, MAX_REPORT_BYTES } from '../domain/report';

export interface ReportRequest {
  readonly method: 'POST';
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
  /** Lets the request finish even if the page is being left. */
  readonly keepalive: boolean;
}

export interface ReporterDeps {
  /** Dev endpoint that accepts reports, e.g. `/__nhd/issues`. */
  readonly endpoint: string;
  /** Identifies this page load; issue ids restart at every load. */
  readonly pageLoadId: string;
  readonly send: (url: string, request: ReportRequest) => Promise<unknown>;
  /** Receives failures; the reporter itself never throws. */
  readonly onFailure: (error: unknown) => void;
}

export interface ReportedEntry {
  readonly issue: HydrationIssue;
  readonly diagnostics: readonly DiagnosticResult[];
}

function sizeOf(text: string): number {
  return new TextEncoder().encode(text).length;
}

/**
 * Returns a function that sends each captured issue, with its diagnosis, to the dev server for
 * the DevTools tab.
 *
 * What is sent is trimmed first: the component's compiled code stays in the browser, every field
 * is cut to the limits the server enforces (`fitReport`; a page with a long URL, a long text or a
 * deeply nested element must still produce a report the server accepts), and if the result is
 * still larger than the endpoint accepts, the two markup strings are dropped (the report is still
 * useful without them) rather than the whole report. Delivery is best effort and must never
 * affect the page: no failure, synchronous or not, escapes.
 */
export function createReporter(deps: ReporterDeps): (entry: ReportedEntry) => void {
  const encode = (entry: ReportedEntry, withMarkup: boolean): string =>
    JSON.stringify(
      fitReport({
        pageLoadId: deps.pageLoadId,
        issue: {
          ...entry.issue,
          componentSource: null,
          ...(withMarkup ? {} : { serverHtml: null, clientHtml: null }),
        },
        diagnostics: entry.diagnostics,
      }),
    );

  return (entry) => {
    try {
      let body = encode(entry, true);
      if (sizeOf(body) > MAX_REPORT_BYTES) body = encode(entry, false);
      if (sizeOf(body) > MAX_REPORT_BYTES) return;
      deps
        .send(deps.endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json', [DEVTOOLS_CLIENT_HEADER]: '1' },
          body,
          keepalive: true,
        })
        .catch(deps.onFailure);
    } catch (error) {
      deps.onFailure(error);
    }
  };
}
