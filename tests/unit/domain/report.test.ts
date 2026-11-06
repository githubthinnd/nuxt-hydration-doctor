import { describe, expect, it } from 'vitest';
import { fitReport, parseHydrationReport } from '../../../src/runtime/domain/report';
import { makeIssue } from '../../support/issue';
import { makeDiagnosis, makeReport } from '../../support/report';
import { required } from '../../support/required';

/** A deep copy that the test may damage without touching the original. */
function plain(report = makeReport()): Record<string, unknown> {
  return JSON.parse(JSON.stringify(report)) as Record<string, unknown>;
}

function withIssue(change: Record<string, unknown>): Record<string, unknown> {
  const body = plain();
  body['issue'] = { ...(body['issue'] as Record<string, unknown>), ...change };
  return body;
}

describe('parseHydrationReport', () => {
  it('accepts a valid report and returns an equal copy', () => {
    const report = makeReport();
    const parsed = parseHydrationReport(plain(report));
    expect(parsed).toEqual({ ...report, issue: { ...report.issue, componentSource: null } });
  });

  it('survives a JSON round trip, which is how it arrives', () => {
    expect(
      parseHydrationReport(JSON.parse(JSON.stringify(makeReport())) as unknown),
    ).not.toBeNull();
  });

  it('accepts nulls where the issue has no location, markup or timing', () => {
    const body = withIssue({
      location: null,
      occurrence: null,
      serverHtml: null,
      clientHtml: null,
      componentName: null,
      metrics: { detectedAt: 5, msSinceNavigationStart: null },
    });
    expect(parseHydrationReport(body)).not.toBeNull();
  });

  it('never accepts the component source, whatever the sender claims', () => {
    const parsed = parseHydrationReport(withIssue({ componentSource: 'setup() { secret() }' }));
    expect(required(parsed).issue.componentSource).toBeNull();
  });

  it('drops unknown fields and returns a fresh object, never the parsed input', () => {
    const body = plain();
    body['__proto__'] = { polluted: true };
    body['extra'] = 'x';
    (body['issue'] as Record<string, unknown>)['extra'] = 'y';
    const parsed = required(parseHydrationReport(body));
    expect(parsed).not.toHaveProperty('extra');
    expect(parsed.issue).not.toHaveProperty('extra');
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });

  it.each([
    ['null', null],
    ['a string', 'report'],
    ['an array', []],
    ['an empty object', {}],
  ])('rejects %s', (_label, value) => {
    expect(parseHydrationReport(value)).toBeNull();
  });

  it.each([
    ['a missing page load id', { pageLoadId: undefined }],
    ['an id with a slash', { pageLoadId: '../x' }],
    ['an id with markup', { pageLoadId: '<script>' }],
    ['an over-long id', { pageLoadId: 'a'.repeat(65) }],
    ['no issue', { issue: undefined }],
    ['diagnostics that are not an array', { diagnostics: 'none' }],
    ['more than 8 diagnostics', { diagnostics: Array.from({ length: 9 }, () => makeDiagnosis()) }],
  ])('rejects %s', (_label, change) => {
    expect(parseHydrationReport({ ...plain(), ...change })).toBeNull();
  });

  it.each([
    ['an unknown kind', { kind: 'cosmic-ray-mismatch' }],
    ['a non-string message', { message: 5 }],
    ['an over-long message', { message: 'x'.repeat(5001) }],
    ['over-long markup', { clientHtml: 'x'.repeat(25_001) }],
    ['a zero line number', { location: { file: 'a.vue', line: 0, column: 1 } }],
    ['a fractional column', { location: { file: 'a.vue', line: 1, column: 1.5 } }],
    ['a location that is not an object', { location: 'a.vue:1:1' }],
    ['a negative occurrence', { occurrence: -1 }],
    ['ancestry with a non-string', { ancestry: ['html', 5] }],
    ['too many breadcrumbs', { breadcrumbs: Array.from({ length: 65 }, () => 'x') }],
    ['non-finite metrics', { metrics: { detectedAt: null, msSinceNavigationStart: null } }],
    ['metrics that are not an object', { metrics: 5 }],
  ])('rejects an issue with %s', (_label, change) => {
    expect(parseHydrationReport(withIssue(change))).toBeNull();
  });

  it.each([
    ['an unknown category', { category: 'cosmic-rays' }],
    ['a confidence above 1', { confidence: 1.5 }],
    ['a NaN-like confidence', { confidence: 'high' }],
    ['non-string evidence', { evidence: [1] }],
    ['a fix with an unknown language', { fix: { language: 'sh', description: 'd', code: 'c' } }],
    ['over-long fix code', { fix: { language: 'ts', description: 'd', code: 'x'.repeat(8001) } }],
  ])('rejects a diagnosis with %s', (_label, change) => {
    const body = plain();
    body['diagnostics'] = [{ ...makeDiagnosis(), ...change }];
    expect(parseHydrationReport(body)).toBeNull();
  });

  it('accepts a diagnosis without a fix', () => {
    const body = plain();
    body['diagnostics'] = [{ ...makeDiagnosis(), fix: null }];
    expect(required(parseHydrationReport(body)).diagnostics[0]?.fix).toBeNull();
  });
});

describe('fitReport', () => {
  it('leaves a report that already fits exactly as it was', () => {
    const report = makeReport();
    expect(fitReport(report)).toEqual(report);
  });

  it.each([
    ['a long URL in the first breadcrumb', { breadcrumbs: [`route /cb?${'q'.repeat(400)}`] }],
    ['more than 64 ancestors', { ancestry: Array.from({ length: 80 }, (_, i) => `t${String(i)}`) }],
    ['a very long message', { message: 'm'.repeat(30_000) }],
    ['a very long route', { route: `/${'r'.repeat(4000)}` }],
    ['over-long markup', { serverHtml: 'x'.repeat(60_000), clientHtml: 'y'.repeat(60_000) }],
    ['a long component name', { componentName: 'C'.repeat(500) }],
    ['a long file name', { location: { file: `${'d/'.repeat(400)}x.vue`, line: 1, column: 1 } }],
    ['too many breadcrumbs', { breadcrumbs: Array.from({ length: 100 }, () => 'step') }],
  ])('makes a report with %s acceptable to the server', (_label, change) => {
    const report = makeReport({ issue: makeIssue(change) });
    // The server refuses it as it is...
    expect(parseHydrationReport(JSON.parse(JSON.stringify(report)) as unknown)).toBeNull();
    // ...and accepts it once fitted.
    expect(
      parseHydrationReport(JSON.parse(JSON.stringify(fitReport(report))) as unknown),
    ).not.toBeNull();
  });

  it('makes over-long diagnoses acceptable too', () => {
    const report = makeReport({
      diagnostics: Array.from({ length: 12 }, () =>
        makeDiagnosis({
          title: 't'.repeat(900),
          explanation: 'e'.repeat(9000),
          evidence: Array.from({ length: 30 }, () => 'v'.repeat(2000)),
          fix: { language: 'ts', description: 'd'.repeat(2000), code: 'c'.repeat(30_000) },
        }),
      ),
    });
    expect(parseHydrationReport(JSON.parse(JSON.stringify(report)) as unknown)).toBeNull();
    const fitted = fitReport(report);
    expect(fitted.diagnostics).toHaveLength(8);
    expect(parseHydrationReport(JSON.parse(JSON.stringify(fitted)) as unknown)).not.toBeNull();
  });

  it('keeps the nearest ancestors and the first breadcrumbs when it has to drop some', () => {
    const fitted = fitReport(
      makeReport({
        issue: makeIssue({
          ancestry: Array.from({ length: 80 }, (_, i) => `t${String(i)}`),
          breadcrumbs: Array.from({ length: 80 }, (_, i) => `b${String(i)}`),
        }),
      }),
    ).issue;
    expect(fitted.ancestry[0]).toBe('t16');
    expect(fitted.ancestry.at(-1)).toBe('t79');
    expect(fitted.breadcrumbs[0]).toBe('b0');
    expect(fitted.breadcrumbs.at(-1)).toBe('b63');
  });

  it('is idempotent', () => {
    const once = fitReport(makeReport({ issue: makeIssue({ message: 'm'.repeat(30_000) }) }));
    expect(fitReport(once)).toEqual(once);
  });
});
