// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vue from '@vitejs/plugin-vue';
import { createServer, type ViteDevServer } from 'vite';
import { createSSRApp, ref, type Component, type Ref } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { astInjector } from '../../src/plugins/ast-injector';
import type { DiagnosticResult } from '../../src/runtime/domain/diagnostic';
import type { HydrationIssue } from '../../src/runtime/domain/issue';
import { diagnoseIssue } from '../../src/runtime/engine/diagnostics';
import { collectBrowserValues } from '../../src/runtime/interceptor/environment';
import { createStateWatcher, entriesFromPayload } from '../../src/runtime/interceptor/state-watch';
import { playgroundAutoImports } from '../support/playground-plugins';
import { hydrate } from '../support/hydrate';
import { required } from '../support/required';

/**
 * Each page of the playground, end to end without a browser: the server HTML comes from a real
 * Vite SSR render of the page's own `.vue` file (with the module's source-location plugin), it is
 * parsed by an HTML parser that repairs invalid nesting as browsers do, and the client build of the
 * same file hydrates it through the interceptor and the diagnostic engine.
 *
 * The one thing this cannot show is a real browser, Nuxt's dev server and the HUD on screen; that
 * is what the Playwright suite in tests/e2e is for.
 */
const playground = resolve(import.meta.dirname, '../../playground');
const ATTR = 'data-nhd-loc';

let server: ViteDevServer;

beforeAll(async () => {
  server = await createServer({
    root: playground,
    configFile: false,
    logLevel: 'silent',
    appType: 'custom',
    server: { middlewareMode: true, hmr: false, watch: null },
    plugins: [
      playgroundAutoImports(),
      astInjector.vite({ attribute: ATTR, exclude: ['/node_modules/'], root: playground }),
      vue(),
    ],
  });
});
afterAll(async () => {
  await server.close();
});

type UseState = (key: string, init: () => unknown) => Ref<unknown>;

/** A stand-in for Nuxt's `useState`, backed by a plain map (the server payload, in effect). */
function stateStore(initial: Record<string, unknown> = {}): {
  useState: UseState;
  store: Map<string, Ref<unknown>>;
  payload: () => unknown;
} {
  const store = new Map<string, Ref<unknown>>(
    Object.entries(initial).map(([key, value]) => [key, ref(value)]),
  );
  return {
    store,
    useState: (key, init) => {
      let state = store.get(key);
      if (state === undefined) {
        state = ref(init());
        store.set(key, state);
      }
      return state;
    },
    payload: () => ({
      state: Object.fromEntries([...store].map(([key, state]) => [`$s${key}`, state.value])),
    }),
  };
}

interface Hooks {
  beforeServer?: () => void;
  beforeClient?: () => void | Promise<void>;
}

interface Outcome {
  readonly issues: readonly HydrationIssue[];
  readonly serverHtml: string;
  /** Diagnoses per issue, computed with the facts a browser would have. */
  readonly diagnoses: readonly (readonly DiagnosticResult[])[];
}

/** Server-renders `page`, then hydrates it in the client build, and diagnoses what Vue reported. */
async function scenario(page: string, hooks: Hooks = {}): Promise<Outcome> {
  // --- server: no window, no localStorage, like a Node process ---
  const serverState = stateStore();
  vi.stubGlobal('useState', serverState.useState);
  hooks.beforeServer?.();
  vi.stubGlobal('window', undefined);
  vi.stubGlobal('localStorage', undefined);
  let html: string;
  try {
    const mod = (await server.ssrLoadModule(`/pages/${page}.vue`)) as { default: Component };
    html = await renderToString(createSSRApp(mod.default));
  } finally {
    vi.unstubAllGlobals();
  }

  // --- client: the payload the server serialised, then whatever runs before hydration ---
  const clientState = stateStore(
    Object.fromEntries(
      Object.entries((serverState.payload() as { state: Record<string, unknown> }).state).map(
        ([key, value]) => [key.slice(2), value],
      ),
    ),
  );
  vi.stubGlobal('useState', clientState.useState);
  const watcher = createStateWatcher(() => entriesFromPayload(clientState.payload()));
  watcher.capture();
  await hooks.beforeClient?.();

  const file = resolve(playground, `pages/${page}.vue`);
  const component = ((await import(/* @vite-ignore */ file)) as { default: Component }).default;
  const run = hydrate(html, component);

  const context = {
    browserValues: collectBrowserValues(window),
    stateChanges: watcher.changes(),
    disabledCategories: [],
  };
  return {
    issues: run.issues,
    serverHtml: html,
    diagnoses: run.issues.map((issue) => diagnoseIssue(issue, context)),
  };
}

/** happy-dom's control surface on `window` (viewport, URL), which lib.dom does not describe. */
function happyDom(): {
  setViewport(size: { width: number; height: number }): void;
  setURL(url: string): void;
} {
  return (window as unknown as { happyDOM: ReturnType<typeof happyDom> }).happyDOM;
}

/** 1-based line of the first occurrence of `needle` in the page's source file. */
function lineOf(page: string, needle: string): number {
  const lines = readFileSync(resolve(playground, `pages/${page}.vue`), 'utf8').split('\n');
  return lines.findIndex((line) => line.includes(needle)) + 1;
}

function topOf(outcome: Outcome, category: DiagnosticResult['category']): DiagnosticResult {
  const found = outcome.diagnoses.flat().filter((diagnosis) => diagnosis.category === category);
  return required(
    found.sort((a, b) => b.confidence - a.confidence)[0],
    `a ${category} diagnosis (got ${JSON.stringify(outcome.diagnoses.flat().map((d) => d.category))})`,
  );
}

beforeEach(() => {
  document.body.innerHTML = '';
  vi.useFakeTimers({ toFake: ['Date'] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('playground scenarios', () => {
  it('the control page hydrates cleanly and the server HTML carries source locations', async () => {
    const outcome = await scenario('ok');
    expect(outcome.issues).toEqual([]);
    expect(outcome.serverHtml).toContain(`${ATTR}="pages/ok.vue:`);
  });

  it('/time: the clock read during setup is diagnosed as the current time', async () => {
    const outcome = await scenario('time', {
      beforeServer: () => {
        vi.setSystemTime(new Date('2026-11-06T10:00:00.000Z'));
      },
      beforeClient: () => {
        vi.setSystemTime(new Date('2026-11-06T10:00:02.000Z'));
      },
    });
    const issue = required(outcome.issues[0]);
    expect(issue.kind).toBe('text-mismatch');
    expect(issue.location).toEqual({
      file: 'pages/time.vue',
      line: lineOf('time', '<time'),
      column: 5,
    });
    const diagnosis = topOf(outcome, 'non-deterministic-value');
    expect(diagnosis.title).toContain('current time');
    // The visible symptom and the code agree, so confidence is high.
    expect(diagnosis.confidence).toBeGreaterThan(0.9);
    expect(diagnosis.evidence.some((line) => line.includes('new Date()'))).toBe(true);
  });

  it('/random: Math.random() in setup is diagnosed as a random value', async () => {
    const random = vi.spyOn(Math, 'random');
    const outcome = await scenario('random', {
      beforeServer: () => {
        random.mockReturnValueOnce(0.111111);
      },
      beforeClient: () => {
        random.mockReturnValueOnce(0.777777);
      },
    });
    expect(required(outcome.issues[0]).location?.line).toBe(
      lineOf('random', '<p data-testid="random"'),
    );
    const diagnosis = topOf(outcome, 'non-deterministic-value');
    expect(diagnosis.title).toContain('random');
    expect(diagnosis.evidence.some((line) => line.includes('Math.random()'))).toBe(true);
  });

  it('/browser-global: window.innerWidth in setup is diagnosed as a browser global leak', async () => {
    const outcome = await scenario('browser-global', {
      beforeClient: () => {
        happyDom().setViewport({ width: 1280, height: 720 });
      },
    });
    const issue = required(outcome.issues[0]);
    expect(issue.message).toContain('Width: 0');
    expect(issue.location?.line).toBe(lineOf('browser-global', '<p data-testid="width"'));
    const diagnosis = topOf(outcome, 'browser-global-leak');
    expect(diagnosis.evidence.some((line) => line.includes('window.innerWidth'))).toBe(true);
    expect(diagnosis.fix?.code).toContain('onMounted');
  });

  it('/storage: localStorage in setup is diagnosed with the storage key named, not its value', async () => {
    const outcome = await scenario('storage', {
      beforeClient: () => {
        localStorage.setItem('nhd-demo-theme', 'solarized-dark');
      },
    });
    const diagnosis = topOf(outcome, 'browser-global-leak');
    expect(diagnosis.evidence.some((line) => line.includes('localStorage["nhd-demo-theme"]'))).toBe(
      true,
    );
    expect(diagnosis.fix?.code).toContain('useCookie');
    expect(JSON.stringify(diagnosis.fix)).not.toContain('solarized-dark');
  });

  it('/nesting: a <div> inside a <p> is diagnosed as invalid nesting repaired by the parser', async () => {
    const outcome = await scenario('nesting');
    // The server really sent the invalid markup; the parser repaired it, Vue did not.
    expect(outcome.serverHtml).toContain('<p');
    const diagnosis = topOf(outcome, 'invalid-html-nesting');
    expect(diagnosis.confidence).toBeGreaterThanOrEqual(0.9);
    expect(diagnosis.evidence.some((line) => line.includes('<div> inside <p>'))).toBe(true);
    expect(required(outcome.issues[0]).location?.file).toBe('pages/nesting.vue');
  });

  it('/table: a <tr> directly in a <table> is diagnosed with the <tbody> fix', async () => {
    const outcome = await scenario('table');
    const diagnosis = topOf(outcome, 'invalid-html-nesting');
    expect(diagnosis.evidence.some((line) => line.includes('<tbody>'))).toBe(true);
    expect(diagnosis.fix?.code).toContain('<tbody>');
  });

  it('/state: state changed before hydration is diagnosed from the server payload', async () => {
    happyDom().setURL('http://localhost:3000/state');
    const outcome = await scenario('state', {
      beforeClient: async () => {
        vi.stubGlobal('defineNuxtPlugin', (setup: () => void) => setup);
        const plugin = (
          (await import(
            /* @vite-ignore */ resolve(playground, 'plugins/state-mutation.client.ts')
          )) as { default: () => void }
        ).default;
        plugin();
      },
    });
    const issue = required(outcome.issues[0]);
    expect(issue.message).toContain('Count: 0');
    expect(issue.location?.line).toBe(lineOf('state', '<p data-testid="counter"'));
    const diagnosis = topOf(outcome, 'state-desynchronization');
    expect(diagnosis.confidence).toBeGreaterThanOrEqual(0.9);
    expect(diagnosis.evidence[0]).toContain('useState("demo-counter")');
  });

  it('/state without the plugin change would be fine: the plugin only acts on that route', async () => {
    happyDom().setURL('http://localhost:3000/ok');
    const outcome = await scenario('state', {
      beforeClient: async () => {
        vi.stubGlobal('defineNuxtPlugin', (setup: () => void) => setup);
        const plugin = (
          (await import(
            /* @vite-ignore */ resolve(playground, 'plugins/state-mutation.client.ts')
          )) as { default: () => void }
        ).default;
        plugin();
      },
    });
    expect(outcome.issues).toEqual([]);
  });
});
