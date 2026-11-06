import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createReportRegistry } from '../../../src/devtools/registry';
import {
  CLIENT_HEADER,
  handleDevtoolsRequest,
  resolveEditorFile,
  type DevtoolsRequest,
  type RequestBody,
} from '../../../src/devtools/router';
import { makeIssue } from '../../support/issue';
import { makeReport } from '../../support/report';

const ROOT = resolve('/project');

function setup() {
  const registry = createReportRegistry(50, () => 5000);
  const call = (request: Partial<DevtoolsRequest> & Pick<DevtoolsRequest, 'path'>) =>
    handleDevtoolsRequest(
      { method: 'GET', query: {}, headers: {}, body: { kind: 'none' }, ...request },
      { registry, rootDir: ROOT },
    );
  return { registry, call };
}

const CLIENT = { [CLIENT_HEADER]: '1' };
const json = (value: unknown): RequestBody => ({ kind: 'json', value });
const parse = (body: string): Record<string, unknown> =>
  JSON.parse(body) as Record<string, unknown>;

describe('page and assets', () => {
  it('serves the page with a strict content security policy', () => {
    const { call } = setup();
    const page = call({ path: '/' });
    expect(page.status).toBe(200);
    expect(page.headers['content-type']).toContain('text/html');
    const csp = page.headers['content-security-policy'] ?? '';
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).toContain("frame-ancestors 'self'");
    expect(page.headers['x-content-type-options']).toBe('nosniff');
    expect(page.headers['cache-control']).toBe('no-store');
  });

  it('serves script and stylesheet with their own content types', () => {
    const { call } = setup();
    expect(call({ path: '/app.js' }).headers['content-type']).toContain('text/javascript');
    expect(call({ path: '/style.css' }).headers['content-type']).toContain('text/css');
  });

  it('answers 404 for unknown paths and 405 for the wrong method on a known one', () => {
    const { call } = setup();
    expect(call({ path: '/nope' }).status).toBe(404);
    expect(call({ path: '/../etc/passwd' }).status).toBe(404);
    expect(call({ path: '/app.js', method: 'POST' }).status).toBe(405);
    expect(call({ path: '/issues', method: 'PUT', headers: CLIENT }).status).toBe(405);
  });
});

describe('POST /issues', () => {
  it('stores a valid report from the browser', () => {
    const { call, registry } = setup();
    const response = call({
      path: '/issues',
      method: 'POST',
      headers: CLIENT,
      body: json(makeReport()),
    });
    expect(response.status).toBe(201);
    expect(parse(response.body)).toEqual({ seq: 1 });
    expect(registry.since(0)).toHaveLength(1);
  });

  it('refuses a write without the client header, which a cross-origin page cannot add', () => {
    const { call, registry } = setup();
    const response = call({ path: '/issues', method: 'POST', body: json(makeReport()) });
    expect(response.status).toBe(403);
    expect(registry.since(0)).toEqual([]);
  });

  it.each(['cross-site', 'same-site'])('refuses a %s request', (site) => {
    const { call, registry } = setup();
    const response = call({
      path: '/issues',
      method: 'POST',
      headers: { ...CLIENT, 'sec-fetch-site': site },
      body: json(makeReport()),
    });
    expect(response.status).toBe(403);
    expect(registry.since(0)).toEqual([]);
  });

  it.each(['same-origin', 'none'])('allows a browser request marked %s', (site) => {
    const { call } = setup();
    const response = call({
      path: '/issues',
      method: 'POST',
      headers: { ...CLIENT, 'sec-fetch-site': site },
      body: json(makeReport()),
    });
    expect(response.status).toBe(201);
  });

  it('rejects an oversize body, an invalid body, no body and an invalid report', () => {
    const { call, registry } = setup();
    const post = (body: RequestBody) =>
      call({ path: '/issues', method: 'POST', headers: CLIENT, body }).status;
    expect(post({ kind: 'too-large' })).toBe(413);
    expect(post({ kind: 'invalid' })).toBe(400);
    expect(post({ kind: 'none' })).toBe(400);
    expect(post(json({ pageLoadId: 'x' }))).toBe(400);
    expect(post(json(makeReport({ pageLoadId: '../bad' })))).toBe(400);
    expect(registry.since(0)).toEqual([]);
  });
});

describe('GET /issues', () => {
  it('lists reports with the editor path resolved inside the project', () => {
    const { call, registry } = setup();
    registry.add(makeReport());
    const data = parse(call({ path: '/issues' }).body);
    const [report] = data['reports'] as { editorFile: string; seq: number; receivedAt: number }[];
    expect(data['latest']).toBe(1);
    expect(report?.seq).toBe(1);
    expect(report?.receivedAt).toBe(5000);
    expect(report?.editorFile).toBe(join(ROOT, 'components/Widget.vue'));
  });

  it('returns only reports newer than ?since and ignores a nonsense value', () => {
    const { call, registry } = setup();
    registry.add(makeReport());
    registry.add(makeReport());
    const reports = (query: string): unknown[] =>
      parse(call({ path: '/issues', query: { since: query } }).body)['reports'] as unknown[];
    expect(reports('1')).toHaveLength(1);
    expect(reports('2')).toHaveLength(0);
    expect(reports('abc')).toHaveLength(2);
    expect(reports('-4')).toHaveLength(2);
  });

  it('gives no editor path for a report outside the project or without a location', () => {
    const { call, registry } = setup();
    registry.add(
      makeReport({
        issue: makeIssue({ location: { file: '../../etc/passwd', line: 1, column: 1 } }),
      }),
    );
    registry.add(makeReport({ issue: makeIssue({ location: null, occurrence: null }) }));
    const reports = parse(call({ path: '/issues' }).body)['reports'] as { editorFile: unknown }[];
    expect(reports.map((r) => r.editorFile)).toEqual([null, null]);
  });

  it('refuses cross-site reads', () => {
    const { call } = setup();
    expect(call({ path: '/issues', headers: { 'sec-fetch-site': 'cross-site' } }).status).toBe(403);
  });

  it('sends no CORS headers, so other origins cannot read the response', () => {
    const { call } = setup();
    const headers = Object.keys(call({ path: '/issues' }).headers);
    expect(headers.some((name) => name.startsWith('access-control-'))).toBe(false);
  });
});

describe('DELETE /issues', () => {
  it('clears the history, changes the generation, and needs the client header', () => {
    const { call, registry } = setup();
    registry.add(makeReport());
    const generation = registry.generation();

    expect(call({ path: '/issues', method: 'DELETE' }).status).toBe(403);
    expect(registry.since(0)).toHaveLength(1);

    expect(call({ path: '/issues', method: 'DELETE', headers: CLIENT }).status).toBe(200);
    expect(registry.since(0)).toEqual([]);
    expect(registry.generation()).toBe(generation + 1);
  });
});

describe('resolveEditorFile', () => {
  it('resolves a project-relative path to an absolute one', () => {
    expect(resolveEditorFile(ROOT, 'app/pages/index.vue')).toBe(join(ROOT, 'app/pages/index.vue'));
  });

  it.each(['../outside.vue', 'a/../../outside.vue', '/etc/passwd', '..', '.', ''])(
    'refuses %j, which is not strictly inside the project',
    (file) => {
      expect(resolveEditorFile(ROOT, file)).toBeNull();
    },
  );

  it('refuses a sibling directory that merely shares the prefix', () => {
    expect(resolveEditorFile(ROOT, '../project-evil/x.vue')).toBeNull();
  });
});
