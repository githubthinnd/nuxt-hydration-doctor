import { relative } from 'node:path';
import { createUnplugin, type UnpluginInstance } from 'unplugin';
import { injectLocations } from './inject-locations';

export interface AstInjectorOptions {
  /** Attribute written into template tags. */
  readonly attribute: string;
  /** Path fragments (forward slashes) of files that must not be instrumented. */
  readonly exclude: readonly string[];
  /** Project root; attribute values are paths relative to it. */
  readonly root: string;
}

export const AST_INJECTOR_NAME = 'nuxt-hydration-doctor:ast-injector';

function toPosix(path: string): string {
  return path.replaceAll('\\', '/');
}

/**
 * Dev-only unplugin that runs {@link injectLocations} on every Vue SFC.
 *
 * It runs `pre`, before `@vitejs/plugin-vue`, so it sees the original source and the positions it
 * records match what the developer sees in the editor. Vite applies it to the client and SSR
 * builds alike, which is what makes the server-rendered HTML carry the attribute too. `apply:
 * 'serve'` is a second line of defence: even if the plugin were registered by mistake it would
 * not take part in `vite build`. The module additionally never registers it in production.
 */
export const astInjector: UnpluginInstance<AstInjectorOptions, false> = createUnplugin(
  (options) => ({
    name: AST_INJECTOR_NAME,
    enforce: 'pre',
    transform: {
      // Plain `.vue` requests only: a query means a sub-request (`?vue&type=style`,
      // `?macro=true`, `?raw`…) of a file whose main request is transformed anyway.
      filter: { id: { include: /\.vue$/ } },
      handler(code, id) {
        const posixId = toPosix(id);
        if (options.exclude.some((fragment) => posixId.includes(fragment))) return null;
        // A failure here must degrade to "no location", never to a broken build of the host app.
        try {
          const file = toPosix(relative(options.root, id));
          return injectLocations(code, { attribute: options.attribute, file });
        } catch {
          return null;
        }
      },
    },
    vite: { apply: 'serve' },
  }),
);
