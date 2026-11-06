import { createSSRApp, type Component } from 'vue';
import { vi } from 'vitest';
import type { HydrationIssue } from '../../src/runtime/domain/issue';
import { installWarnHandler, type WarnHandler } from '../../src/runtime/interceptor/install';
import { createInterceptor, type Interceptor } from '../../src/runtime/interceptor/interceptor';
import { captureServerSnapshot } from '../../src/runtime/interceptor/snapshot';

export const ATTR = 'data-nhd-loc';

export interface Run {
  readonly issues: readonly HydrationIssue[];
  readonly interceptor: Interceptor;
  readonly previous: ReturnType<typeof vi.fn>;
}

/**
 * Hydrates `serverHtml` with `component` in a real Vue app (no simulated warnings): the same
 * order of events as Nuxt, i.e. snapshot first, warn handler installed, mount, then mounted.
 * Needs a DOM (`// @vitest-environment happy-dom`).
 */
export function hydrate(serverHtml: string, component: Component): Run {
  const root = document.createElement('div');
  root.id = 'app';
  root.innerHTML = serverHtml;
  document.body.append(root);

  const interceptor = createInterceptor({
    document,
    attribute: ATTR,
    historyLimit: 50,
    snapshot: captureServerSnapshot(document, '#app', 1_000_000),
    getRoute: () => '/test',
    now: () => 1000,
    sinceNavigationStart: () => 12,
    schedule: (task) => {
      task();
    },
    reportInternal: (message, error) => {
      throw new Error(`internal failure: ${message}: ${String(error)}`);
    },
  });

  const app = createSSRApp(component);
  const previous = vi.fn();
  app.config.warnHandler = previous as WarnHandler;
  installWarnHandler(
    app,
    (message, instance, trace) => {
      interceptor.handleWarning(message, instance, trace);
    },
    (error) => {
      throw error;
    },
    () => undefined,
  );
  app.mount(root);
  interceptor.markMounted();
  return { issues: interceptor.api.issues(), interceptor, previous };
}

/** The single issue of a run, failing the test if there is not exactly one. */
export function onlyIssue(run: Run): HydrationIssue {
  const [issue, ...rest] = run.issues;
  if (issue === undefined || rest.length > 0) {
    throw new Error(`expected exactly one issue, got ${String(run.issues.length)}`);
  }
  return issue;
}
