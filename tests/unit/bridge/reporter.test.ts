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

  it('cuts over-long fields to what the server accepts instead of losing the report', () => {
    const { report, sent } = setup();
    report(
      entry({
        message: 'm'.repeat(50_000),
        route: `/${'r'.repeat(5000)}`,
        serverHtml: 'x'.repeat(150_000),
        clientHtml: 'y'.repeat(150_000),
        ancestry: Array.from({ length: 200 }, (_, i) => `tag${String(i)}`),
        breadcrumbs: [`route /cb?${'q'.repeat(600)}`, 'during initial hydration'],
      }),
    );

    const body = required(sent[0]).request.body;
    const parsed = required(parseHydrationReport(JSON.parse(body) as unknown));
    expect(parsed.issue.message).toHaveLength(5000);
    expect(parsed.issue.serverHtml).toHaveLength(25_000);
    expect(parsed.issue.ancestry).toHaveLength(64);
    // The nearest ancestors are the ones that matter, so the end of the list survives.
    expect(parsed.issue.ancestry.at(-1)).toBe('tag199');
    expect(parsed.issue.breadcrumbs[0]).toHaveLength(300);
    expect(parsed.issue.breadcrumbs[1]).toBe('during initial hydration');
  });

  it('drops the markup, not the report, when multi-byte text would still be too large', () => {
    const { report, sent } = setup();
    // Under the character limits, but 3 bytes per character: the whole is over the byte limit.
    const wide = '€'.repeat(12_000);
    report({
      issue: makeIssue({ serverHtml: '€'.repeat(25_000), clientHtml: '€'.repeat(25_000) }),
      diagnostics: Array.from({ length: 4 }, () =>
        makeDiagnosis({ explanation: wide.slice(0, 2000), evidence: [wide.slice(0, 600)] }),
      ),
    });
    // Sanity: with the markup this would not fit.
    expect(new TextEncoder().encode('€'.repeat(50_000)).length).toBeGreaterThan(
      MAX_REPORT_BYTES / 2,
    );

    const body = required(sent[0]).request.body;
    expect(new TextEncoder().encode(body).length).toBeLessThanOrEqual(MAX_REPORT_BYTES);
    expect(required(parseHydrationReport(JSON.parse(body) as unknown)).diagnostics).toHaveLength(4);
  });

  it('sends nothing, and does not throw, when even the trimmed report cannot fit', () => {
    const { report, sent } = setup();
    // Eight diagnoses at the field limits, in 3-byte characters, exceed the byte limit alone.
    const diagnosis = makeDiagnosis({
      title: '€'.repeat(300),
      explanation: '€'.repeat(2000),
      evidence: Array.from({ length: 12 }, () => '€'.repeat(600)),
      fix: { language: 'ts', description: '€'.repeat(600), code: '€'.repeat(8000) },
    });
    expect(() => {
      report({ issue: makeIssue(), diagnostics: Array.from({ length: 8 }, () => diagnosis) });
    }).not.toThrow();
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
