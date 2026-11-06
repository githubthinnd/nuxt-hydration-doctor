export default defineNuxtConfig({
  modules: ['../src/module'],
  // Explicit so the same playground works on Nuxt 3 and Nuxt 4 (Nuxt 4 defaults to `app/`).
  srcDir: '.',
  css: ['~/assets/main.css'],
  compatibilityDate: '2026-11-01',
  devtools: { enabled: true },
  hydrationDoctor: { debug: true },
});
