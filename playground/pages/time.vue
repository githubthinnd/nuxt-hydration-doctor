<script setup lang="ts">
import ScenarioHeader from '../components/ScenarioHeader.vue';
import ScenarioNote from '../components/ScenarioNote.vue';
// DELIBERATE BUG: the clock is read while rendering, once on the server and again in the browser.
const now = new Date().toISOString();
</script>

<template>
  <main>
    <ScenarioHeader path="/time" />
    <time data-testid="time">{{ now }}</time>
    <ScenarioNote path="/time" />
  </main>
</template>
