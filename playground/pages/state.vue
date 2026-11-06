<script setup lang="ts">
import ScenarioHeader from '../components/ScenarioHeader.vue';
import ScenarioNote from '../components/ScenarioNote.vue';
// The server renders this with the initial value, 0. On this page only, the client plugin
// `plugins/state-mutation.client.ts` changes the state before hydration finishes.
const counter = useState('demo-counter', () => 0);
</script>

<template>
  <main>
    <ScenarioHeader path="/state" />
    <p data-testid="counter">Count: {{ counter }}</p>
    <ScenarioNote path="/state" />
  </main>
</template>
