<script setup lang="ts">
// Every page below is a deliberate hydration mismatch (except /ok, the control). Load one with a
// full page load, not a client-side navigation: hydration only happens on the first render.
const scenarios = [
  { to: '/ok', title: 'Control', expect: 'no mismatch' },
  {
    to: '/time',
    title: 'Clock read during setup',
    expect: 'non-deterministic value (current time)',
  },
  { to: '/random', title: 'Math.random() in setup', expect: 'non-deterministic value (random)' },
  { to: '/browser-global', title: 'window.innerWidth in setup', expect: 'browser global leak' },
  { to: '/storage', title: 'localStorage in setup', expect: 'browser global leak (storage)' },
  { to: '/nesting', title: '<div> inside <p>', expect: 'invalid HTML nesting' },
  { to: '/table', title: '<tr> directly in <table>', expect: 'invalid HTML nesting (table)' },
  { to: '/state', title: 'useState changed before hydration', expect: 'state desynchronisation' },
];
</script>

<template>
  <main>
    <h1>nuxt-hydration-doctor playground</h1>
    <p>Open a scenario with a full page load and look for the Hydration Doctor badge.</p>
    <ul>
      <li v-for="scenario in scenarios" :key="scenario.to">
        <a :href="scenario.to">{{ scenario.title }}</a>
        — expect: {{ scenario.expect }}
      </li>
    </ul>
  </main>
</template>
