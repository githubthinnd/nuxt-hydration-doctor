import {
  addPlugin,
  addTypeTemplate,
  addVitePlugin,
  createResolver,
  defineNuxtModule,
  useLogger,
} from '@nuxt/kit';
import type { NuxtModule } from '@nuxt/schema';
import { registerDevtools } from './devtools';
import { resolveAllowedHosts } from './devtools/host';
import { astInjector } from './plugins/ast-injector';
import { CONFIG_KEY, MODULE_NAME, RUNTIME_CONFIG_KEY } from './runtime/domain/constants';
import {
  DEFAULT_OPTIONS,
  resolveModuleOptions,
  shouldActivate,
  toRuntimeOptions,
  type ModuleOptions,
} from './runtime/domain/options';

/**
 * Composition root of the build-time side.
 *
 * Zero-production-footprint contract: the very first decision is `shouldActivate`. When it is
 * false (any production build, or `enabled: false`) setup returns before touching `nuxt.options`,
 * so no plugin, component, Vite transform, runtime config or DevTools tab is ever registered.
 * Every integration added in later phases must be registered below that guard.
 */
const hydrationDoctorModule: NuxtModule<ModuleOptions, ModuleOptions> =
  defineNuxtModule<ModuleOptions>({
    meta: {
      name: MODULE_NAME,
      configKey: CONFIG_KEY,
      compatibility: { nuxt: '^3.15.0 || ^4.0.0' },
    },
    defaults: DEFAULT_OPTIONS,
    setup(userOptions, nuxt) {
      const options = resolveModuleOptions(userOptions);
      const resolver = createResolver(import.meta.url);

      if (!shouldActivate(options, nuxt.options.dev)) {
        // Inactive (`nuxt prepare`, a production build, `enabled: false`): nothing is registered at
        // run time. Only a type declaration is written, so that editors still know the
        // `$hydrationDoctor` that exists while developing; it is optional for that reason. It writes a
        // .d.ts into `.nuxt/types` and nothing into any bundle. While the module is active Nuxt
        // infers the property, non-optional, from the plugin itself, and a second declaration of
        // the same property would only conflict with it.
        addTypeTemplate({
          filename: 'types/nuxt-hydration-doctor.d.ts',
          getContents: () =>
            [
              `import type { HydrationDoctorApi } from '${resolver.resolve('./runtime/domain/api')}';`,
              '',
              "declare module '#app' {",
              '  interface NuxtApp {',
              '    $hydrationDoctor?: HydrationDoctorApi;',
              '  }',
              '}',
              '',
              "declare module 'vue' {",
              '  interface ComponentCustomProperties {',
              '    $hydrationDoctor?: HydrationDoctorApi;',
              '  }',
              '}',
              '',
              'export {};',
              '',
            ].join('\n'),
        });
        return;
      }

      // The DevTools integration needs both our option and Nuxt DevTools itself to be on.
      const nuxtDevtools: unknown = nuxt.options.devtools;
      const nuxtDevtoolsOn =
        nuxtDevtools !== false &&
        !(
          typeof nuxtDevtools === 'object' &&
          nuxtDevtools !== null &&
          (nuxtDevtools as { enabled?: unknown }).enabled === false
        );
      const devtoolsActive = options.devtools.enabled && nuxtDevtoolsOn;

      // Browser-safe options travel through runtimeConfig. This assignment only happens in
      // dev, so production payloads never contain it.
      nuxt.options.runtimeConfig.public[RUNTIME_CONFIG_KEY] = toRuntimeOptions({
        ...options,
        devtools: { enabled: devtoolsActive },
      });

      addPlugin({ src: resolver.resolve('./runtime/plugin.client'), mode: 'client' });

      // Phase 2: stamp template tags with their source position. `prepend` makes the plugin run
      // before the Vue plugin; the default scope (client + SSR) puts the attribute in the server
      // HTML as well.
      addVitePlugin(
        () =>
          astInjector.vite({
            attribute: options.sourceMap.attribute,
            exclude: options.sourceMap.exclude,
            root: nuxt.options.rootDir,
          }),
        { prepend: true },
      );

      // Phase 6: the DevTools tab and the dev-only endpoint behind it.
      if (devtoolsActive) {
        registerDevtools({
          rootDir: nuxt.options.rootDir,
          // A layer's files are stamped with paths such as `../base/components/A.vue`.
          layerDirs: nuxt.options._layers.map((layer) => layer.cwd),
          allowedHosts: resolveAllowedHosts(
            nuxt.options.devServer.host,
            nuxt.options.vite.server?.allowedHosts,
          ),
        });
      }

      if (options.debug) {
        useLogger(MODULE_NAME).info('Hydration Doctor is active (development only).');
      }
    },
  });

export default hydrationDoctorModule;

/*
 * Public type surface. @nuxt/module-builder derives `dist/types.d.mts` from the exports of this
 * file (a standalone src/types.ts is ignored), so everything consumers may import from
 * "nuxt-hydration-doctor" is listed here, and nowhere else.
 */
export type { HydrationDoctorApi } from './runtime/domain/api';
export type {
  DiagnosticCategory,
  DiagnosticResult,
  FixSuggestion,
} from './runtime/domain/diagnostic';
export type {
  HydrationIssue,
  HydrationMetrics,
  HydrationMismatchKind,
  SourceLocation,
} from './runtime/domain/issue';
export type { ModuleOptions } from './runtime/domain/options';
