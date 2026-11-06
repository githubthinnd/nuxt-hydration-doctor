// Lets `tsc` (which does not understand single-file components) type the import of a .vue file.
// `vue-tsc` ignores this and checks the real component (see tsconfig.vue.json).
declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<object, object, unknown>;
  export default component;
}
