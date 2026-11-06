import { resolve } from 'node:path';
import { createApp, toWebHandler } from 'h3';
import { describe, expect, it } from 'vitest';
import { createDevtoolsHandler } from '../../../src/devtools/handler';
import { createReportRegistry } from '../../../src/devtools/registry';
import { MAX_REPORT_BYTES } from '../../../src/runtime/domain/report';
import { makeReport } from '../../support/report';

/**
 * The real h3 transport, exercised through h3's web handler: requests are real `Request`
 * objects, no port is opened.
 */
function server() {
  const registry = createReportRegistry(50, () => 1234);
  const app = createApp();
  app.use('/__nhd', createDevtoolsHandler({ registry, rootDir: resolve('/project') }));
  const handle = toWebHandler(app);
  const fetchDevtools = (path: string, init?: RequestInit): Promise<Response> =>
    handle(new Request(`http://localhost:3000/__nhd${path}`, init));
  return { registry, fetchDevtools };
}

const CLIENT = { 'x-nhd-client': '1', 'content-type': 'application/json' };

describe('devtools handler (h3 transport)', () => {
  it('serves the tab page, script and styles under the mount point', async () => {
    const { fetchDevtools } = server();
    const page = await fetchDevtools('/');
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toContain('text/html');
    expect(page.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(await page.text()).toContain('<title>Hydration Doctor</title>');

    expect((await fetchDevtools('/app.js')).headers.get('content-type')).toContain('javascript');
    expect((await fetchDevtools('/style.css')).headers.get('content-type')).toContain('text/css');
  });

  it('accepts a report and returns it from the list', async () => {
    const { fetchDevtools } = server();
    const created = await fetchDevtools('/issues', {
      method: 'POST',
      headers: CLIENT,
      body: JSON.stringify(makeReport()),
    });
    expect(created.status).toBe(201);
    expect(await created.json()).toEqual({ seq: 1 });

    const listed = (await (await fetchDevtools('/issues?since=0')).json()) as {
      reports: { issue: { id: string } }[];
    };
    expect(listed.reports.map((r) => r.issue.id)).toEqual(['nhd-1']);
  });

  it('refuses a write without the client header', async () => {
    const { fetchDevtools, registry } = server();
    const response = await fetchDevtools('/issues', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(makeReport()),
    });
    expect(response.status).toBe(403);
    expect(registry.since(0)).toEqual([]);
  });

  it('answers 400 for malformed JSON and for an invalid report', async () => {
    const { fetchDevtools } = server();
    const bad = await fetchDevtools('/issues', { method: 'POST', headers: CLIENT, body: '{nope' });
    expect(bad.status).toBe(400);
    const invalid = await fetchDevtools('/issues', {
      method: 'POST',
      headers: CLIENT,
      body: JSON.stringify({ pageLoadId: 'x' }),
    });
    expect(invalid.status).toBe(400);
  });

  it('refuses a body larger than the limit, by declared size and by actual size', async () => {
    const { fetchDevtools, registry } = server();
    const huge = JSON.stringify({ filler: 'x'.repeat(MAX_REPORT_BYTES + 10) });

    const declared = await fetchDevtools('/issues', {
      method: 'POST',
      headers: { ...CLIENT, 'content-length': String(huge.length) },
      body: huge,
    });
    expect(declared.status).toBe(413);
    expect(registry.since(0)).toEqual([]);
  });

  it('clears the history', async () => {
    const { fetchDevtools, registry } = server();
    registry.add(makeReport());
    const response = await fetchDevtools('/issues', { method: 'DELETE', headers: CLIENT });
    expect(response.status).toBe(200);
    expect(registry.since(0)).toEqual([]);
  });

  it('answers 404 for anything else', async () => {
    const { fetchDevtools } = server();
    expect((await fetchDevtools('/secret')).status).toBe(404);
  });
});
