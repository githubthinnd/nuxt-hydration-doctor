import js from '@eslint/js';
import pluginVue from 'eslint-plugin-vue';
import tseslint from 'typescript-eslint';
import vueParser from 'vue-eslint-parser';

const BROWSER_GLOBALS = [
  'window',
  'document',
  'navigator',
  'self',
  'localStorage',
  'sessionStorage',
  'location',
  'HTMLElement',
  'Element',
  'Node',
  'MutationObserver',
];
const NODE_GLOBALS = ['Buffer', 'process', 'require', 'module', '__dirname', '__filename'];

function restrict(names, where) {
  return [
    'error',
    ...names.map((name) => ({
      name,
      message: `Use of "${name}" is not allowed ${where}.`,
    })),
  ];
}

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      '.nuxt/**',
      '.output/**',
      // The playground gets its own tsconfig and Vue-aware lint setup in Phase 6.
      'playground/**',
      'tests/architecture/fixtures/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['vitest.config.ts'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'error',
    },
  },
  {
    // Build-time code runs in Node: no browser globals.
    files: ['src/module.ts', 'src/devtools.ts', 'src/plugins/**/*.ts'],
    rules: { 'no-restricted-globals': restrict(BROWSER_GLOBALS, 'in build-time code (Node)') },
  },
  {
    // The shared kernel and the heuristics must run anywhere: no runtime-specific globals at all.
    files: ['src/runtime/domain/**/*.ts', 'src/runtime/engine/**/*.ts'],
    rules: {
      'no-restricted-globals': restrict(
        [...BROWSER_GLOBALS, ...NODE_GLOBALS, 'console'],
        'in runtime/domain and runtime/engine (they must stay environment-agnostic)',
      ),
    },
  },
  {
    // Boundary validation: values typed as literals are still checked at runtime because
    // nuxt.config.ts and runtimeConfig may come from plain JavaScript or be tampered with, so
    // "unnecessary" conditions are intentional here.
    files: ['src/runtime/domain/options.ts', 'src/module.ts'],
    rules: { '@typescript-eslint/no-unnecessary-condition': 'off' },
  },
  ...pluginVue.configs['flat/essential'],
  {
    // Single-file components: the script is parsed as TypeScript, but type-aware rules are left
    // to `vue-tsc` (see `npm run typecheck`); type-aware linting of .vue is not reliable.
    files: ['**/*.vue'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: ['.vue'],
        sourceType: 'module',
      },
    },
    rules: {
      ...tseslint.configs.disableTypeChecked.rules,
      // Server and page markup is untrusted: it must only ever be rendered as text.
      'vue/no-v-html': 'error',
    },
  },
  {
    // Test components are deliberately tiny and named like the scenario they model.
    files: ['tests/**/*.ts'],
    rules: { 'vue/multi-word-component-names': 'off' },
  },
  {
    files: ['**/*.js', '**/*.cjs', '**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly' } },
    // (verify-production.mjs spawns a real Nuxt build)
  },
  {
    files: ['**/*.cjs'],
    languageOptions: { globals: { module: 'writable', require: 'readonly' } },
  },
);
