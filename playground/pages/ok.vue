<script setup lang="ts">
import ScenarioHeader from '../components/ScenarioHeader.vue';
import ScenarioNote from '../components/ScenarioNote.vue';
</script>

<template>
  <main>
    <ScenarioHeader path="/ok" />
    <p data-testid="ok">Server and client render exactly the same thing here.</p>
    <ScenarioNote path="/ok" />
  </main>
</template>
