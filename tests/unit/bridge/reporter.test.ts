import { describe, expect, it, vi } from 'vitest';
import { createReporter, type ReportRequest } from '../../../src/runtime/bridge/reporter';
import { MAX_REPORT_BYTES, parseHydrationReport } from '../../../src/runtime/domain/report';
import { makeIssue } from '../../support/issue';
import { makeDiagnosis } from '../../support/report';
import { required } from '../../support/required';

function setup(
  send: (url: string, request: ReportRequest) => Promise<unknown> = () => Promise.resolve(),
) {
  const sent: { url: string; request: ReportRequest }[] = [];
  const onFailure = vi.fn();
  const report = createReporter({
    endpoint: '/__nhd/issues',
    pageLoadId: 'load-abc',
    send: (url, request) => {
      sent.push({ url, request });
      return send(url, request);
    },
    onFailure,
  });
  return { report, sent, onFailure };
}

const entry = (overrides = {}) => ({
  issue: makeIssue({ serverHtml: '<p>a</p>', clientHtml: '<p>b</p>', ...overrides }),
  diagnostics: [makeDiagnosis()],
});

describe('createReporter', () => {
  it('posts the issue and its diagnosis to the dev endpoint with the client header', () => {
    const { report, sent } = setup();
    report(entry());

    const { url, request } = required(sent[0]);
    expect(url).toBe('/__nhd/issues');
    expect(request.method).toBe('POST');
    expect(request.keepalive).toBe(true);
    expect(request.headers).toEqual({
      'content-type': 'application/json',
      'x-nhd-client': '1',
    });
  });

  it('sends something the server accepts, and keeps the component code in the browser', () => {
    const { report, sent } = setup();
    report(entry({ componentSource: 'setup() { return privateCode() }' }));

    const body = required(sent[0]).request.body;
    expect(body).not.toContain('privateCode');
    const parsed = required(parseHydrationReport(JSON.parse(body) as unknown));
    expect(parsed.pageLoadId).toBe('load-abc');
    expect(parsed.issue.serverHtml).toBe('<p>a</p>');
    expect(parsed.diagnostics).toHaveLength(1);
  });

  it('drops the markup, not the report, when it would be too large', () => {
    const { report, sent } = setup();
    // Each side alone is under the limit; together they are over it.
    report(entry({ serverHtml: 'x'.repeat(150_000), clientHtml: 'y'.repeat(150_000) }));

    const body = required(sent[0]).request.body;
    expect(new TextEncoder().encode(body).length).toBeLessThanOrEqual(MAX_REPORT_BYTES);
    const issue = required(parseHydrationReport(JSON.parse(body) as unknown)).issue;
    expect(issue.serverHtml).toBeNull();
    expect(issue.clientHtml).toBeNull();
    expect(issue.message).toBe(entry().issue.message);
  });

  it('sends nothing when even the trimmed report is too large', () => {
    const { report, sent } = setup();
    // The message alone is over the limit, so dropping the markup cannot help.
    report(entry({ message: 'm'.repeat(MAX_REPORT_BYTES + 1) }));
    expect(sent).toHaveLength(0);
  });

  it('reports a failed delivery instead of throwing', async () => {
    const failure = new Error('offline');
    const { report, onFailure } = setup(() => Promise.reject(failure));
    expect(() => {
      report(entry());
    }).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
    expect(onFailure).toHaveBeenCalledWith(failure);
  });

  it('reports a transport that throws synchronously', () => {
    const boom = new Error('sync');
    const { report, onFailure } = setup(() => {
      throw boom;
    });
    expect(() => {
      report(entry());
    }).not.toThrow();
    expect(onFailure).toHaveBeenCalledWith(boom);
  });

  it('survives data that cannot be serialised', () => {
    const { report, onFailure, sent } = setup();
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;
    expect(() => {
      report({ issue: makeIssue({ route: circular as unknown as string }), diagnostics: [] });
    }).not.toThrow();
    expect(sent).toHaveLength(0);
    expect(onFailure).toHaveBeenCalledTimes(1);
  });
});
