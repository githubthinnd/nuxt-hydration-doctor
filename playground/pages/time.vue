<script setup lang="ts">
// DELIBERATE BUG: the clock is read while rendering, once on the server and again in the browser.
const now = new Date().toISOString();
</script>

<template>
  <main>
    <h1>Clock</h1>
    <time data-testid="time">{{ now }}</time>
  </main>
</template>
