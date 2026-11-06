import type { Plugin } from 'vite';

/**
 * Nuxt auto-imports `ref` into pages; plain Vite does not. This gives the playground pages the
 * import they would have under Nuxt, on the same line as the opening `<script setup>` tag so
 * every line number below it (and so every injected source location) stays as in the file.
 */
export function playgroundAutoImports(): Plugin {
  return {
    name: 'nhd-test:playground-auto-imports',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('.vue') || !id.includes('/playground/')) return null;
      if (!/\bref\(/.test(code)) return null;
      return code.replace(/(<script setup[^>]*>)/, "$1 import { ref } from 'vue';");
    },
  };
}
