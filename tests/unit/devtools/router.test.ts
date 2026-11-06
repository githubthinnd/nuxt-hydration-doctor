import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createReportRegistry } from '../../../src/devtools/registry';
import {
  CLIENT_HEADER,
  handleDevtoolsRequest,
  resolveEditorFile,
  type DevtoolsRequest,
  type RequestBody,
  type RouterDeps,
} from '../../../src/devtools/router';
import { makeIssue } from '../../support/issue';
import { makeReport } from '../../support/report';

const ROOT = resolve('/project');

function setup(extra: Partial<RouterDeps> = {}) {
  const registry = createReportRegistry(50, () => 5000, 'test-epoch');
  const call = (request: Partial<DevtoolsRequest> & Pick<DevtoolsRequest, 'path'>) =>
    handleDevtoolsRequest(
      { method: 'GET', query: {}, headers: {}, body: { kind: 'none' }, ...request },
      { registry, rootDir: ROOT, ...extra },
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

describe('Host and Origin checks (DNS rebinding, exposed dev servers)', () => {
  const hostile = { host: 'evil.example:3000', ...CLIENT };

  it.each([
    ['page', { path: '/' }],
    ['list', { path: '/issues' }],
    ['write', { path: '/issues', method: 'POST', body: json(makeReport()) }],
    ['clear', { path: '/issues', method: 'DELETE' }],
    ['open', { path: '/open', query: { file: 'a.vue' } }],
  ] as const)(
    'refuses a foreign domain name on %s, even with every other header right',
    (_label, request) => {
      const { call, registry } = setup();
      registry.add(makeReport());
      const response = call({ ...request, headers: hostile });
      expect(response.status).toBe(403);
      expect(response.body).toContain('Host not allowed');
      expect(registry.since(0)).toHaveLength(1);
    },
  );

  it('does not leak stored reports to a rebound domain', () => {
    const { call, registry } = setup();
    registry.add(makeReport());
    const response = call({ path: '/issues', headers: { host: 'attacker.com' } });
    expect(response.status).toBe(403);
    expect(response.body).not.toContain('Widget');
  });

  it.each(['localhost:3000', '127.0.0.1:3000', '[::1]:3000', '192.168.1.20:3000', 'x.localhost'])(
    'serves %s',
    (host) => {
      const { call } = setup();
      expect(call({ path: '/issues', headers: { host } }).status).toBe(200);
    },
  );

  it('serves a configured host name and nothing else', () => {
    const { call } = setup({ allowedHosts: { all: false, names: ['myapp.test'] } });
    expect(call({ path: '/issues', headers: { host: 'myapp.test:3000' } }).status).toBe(200);
    expect(call({ path: '/issues', headers: { host: 'other.test:3000' } }).status).toBe(403);
  });

  it('refuses a cross-origin Origin even from a loopback host, and accepts the same origin', () => {
    const { call } = setup();
    const headers = { host: 'localhost:3000', ...CLIENT };
    expect(
      call({
        path: '/issues',
        method: 'POST',
        headers: { ...headers, origin: 'http://localhost:3000' },
        body: json(makeReport()),
      }).status,
    ).toBe(201);
    for (const origin of ['http://evil.example', 'http://localhost:4000', 'null']) {
      expect(
        call({
          path: '/issues',
          method: 'POST',
          headers: { ...headers, origin },
          body: json(makeReport()),
        }).status,
      ).toBe(403);
    }
  });
});

describe('GET /issues epoch', () => {
  it('names the registry instance so a restarted dev server is noticed', () => {
    const { call } = setup();
    expect(parse(call({ path: '/issues' }).body)['epoch']).toBe('test-epoch');
  });
});

describe('GET /open', () => {
  const open = (query: Record<string, string>, headers: Record<string, string> = CLIENT) =>
    setup().call({ path: '/open', query, headers });

  it('redirects to Nuxt’s open-in-editor with the absolute path, line and column', () => {
    const response = open({ file: 'components/Widget.vue', line: '7', column: '3' });
    expect(response.status).toBe(302);
    const location = new URL(response.headers['location'] ?? '', 'http://x');
    expect(location.pathname).toBe('/__open-in-editor');
    expect(location.searchParams.get('file')).toBe(`${join(ROOT, 'components/Widget.vue')}:7:3`);
  });

  it('defaults a missing or nonsensical line and column to 1', () => {
    for (const query of [{ file: 'a.vue' }, { file: 'a.vue', line: '0', column: 'x' }]) {
      const file = new URL(open(query).headers['location'] ?? '', 'http://x').searchParams.get(
        'file',
      );
      expect(file).toBe(`${join(ROOT, 'a.vue')}:1:1`);
    }
  });

  it('needs the client header, because opening an editor is a side effect', () => {
    expect(open({ file: 'a.vue' }, {}).status).toBe(403);
  });

  it.each([
    [{}],
    [{ file: '' }],
    [{ file: '../../etc/passwd' }],
    [{ file: '/etc/passwd' }],
    [{ file: `${'a/'.repeat(300)}x.vue` }],
  ])('refuses %j, which does not name a file inside the project', (query) => {
    expect(open(query).status).toBe(400);
  });

  it('only answers GET', () => {
    expect(setup().call({ path: '/open', method: 'POST', headers: CLIENT }).status).toBe(405);
  });
});

describe('Nuxt layers', () => {
  const LAYER = resolve('/base-layer');

  it('lets "Open in editor" reach a file of a layer, and still nothing else', () => {
    const layered = resolveEditorFile(ROOT, '../base-layer/components/A.vue', [LAYER]);
    expect(layered).toBe(join(LAYER, 'components/A.vue'));
    expect(resolveEditorFile(ROOT, '../elsewhere/A.vue', [LAYER])).toBeNull();
    expect(resolveEditorFile(ROOT, '../base-layer-evil/A.vue', [LAYER])).toBeNull();
    expect(resolveEditorFile(ROOT, '../../etc/passwd', [LAYER])).toBeNull();
  });

  it('is reflected in the report list and in /open', () => {
    const { call, registry } = setup({ allowedRoots: [LAYER] });
    registry.add(
      makeReport({
        issue: makeIssue({
          location: { file: '../base-layer/components/A.vue', line: 2, column: 4 },
        }),
      }),
    );
    const [report] = parse(call({ path: '/issues' }).body)['reports'] as { editorFile: string }[];
    expect(report?.editorFile).toBe(join(LAYER, 'components/A.vue'));
    expect(
      call({ path: '/open', query: { file: '../base-layer/components/A.vue' }, headers: CLIENT })
        .status,
    ).toBe(302);
  });

  it('without the layer configured, the same file is refused', () => {
    const { call } = setup();
    expect(
      call({ path: '/open', query: { file: '../base-layer/components/A.vue' }, headers: CLIENT })
        .status,
    ).toBe(400);
  });
});
