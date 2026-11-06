<script setup lang="ts">
// The server renders this with the initial value, 0. On this page only, the client plugin
// `plugins/state-mutation.client.ts` changes the state before hydration finishes.
const counter = useState('demo-counter', () => 0);
</script>

<template>
  <main>
    <h1>Shared state</h1>
    <p data-testid="counter">Count: {{ counter }}</p>
  </main>
</template>
