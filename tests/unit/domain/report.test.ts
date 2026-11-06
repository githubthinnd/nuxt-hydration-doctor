import { describe, expect, it } from 'vitest';
import { parseHydrationReport } from '../../../src/runtime/domain/report';
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
    ['an unknown kind', { kind: 'attribute-mismatch' }],
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
