<script setup lang="ts">
import ScenarioHeader from '../components/ScenarioHeader.vue';
import ScenarioNote from '../components/ScenarioNote.vue';
// DELIBERATE BUG: a new random value on the server and another one in the browser.
const value = Math.random().toFixed(6);
</script>

<template>
  <main>
    <ScenarioHeader path="/random" />
    <p data-testid="random">{{ value }}</p>
    <ScenarioNote path="/random" />
  </main>
</template>
