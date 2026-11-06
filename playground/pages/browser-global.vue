<script setup lang="ts">
import ScenarioHeader from '../components/ScenarioHeader.vue';
import ScenarioNote from '../components/ScenarioNote.vue';
// DELIBERATE BUG: the typeof guard keeps the server from crashing, but the first browser render
// uses the real window width while the server rendered 0.
const width = ref(typeof window === 'undefined' ? 0 : window.innerWidth);
</script>

<template>
  <main>
    <ScenarioHeader path="/browser-global" />
    <p data-testid="width">Width: {{ width }}</p>
    <ScenarioNote path="/browser-global" />
  </main>
</template>
