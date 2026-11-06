<script setup lang="ts">
import ScenarioHeader from '../components/ScenarioHeader.vue';
import ScenarioNote from '../components/ScenarioNote.vue';
// DELIBERATE BUG: the server has no localStorage and renders "light"; a browser that has stored a
// theme renders that one on its first pass. Set it before loading the page:
//   localStorage.setItem('nhd-demo-theme', 'solarized-dark')
const theme =
  typeof localStorage === 'undefined'
    ? 'light'
    : (localStorage.getItem('nhd-demo-theme') ?? 'light');
</script>

<template>
  <main>
    <ScenarioHeader path="/storage" />
    <p data-testid="theme">Theme: {{ theme }}</p>
    <ScenarioNote path="/storage" />
  </main>
</template>
