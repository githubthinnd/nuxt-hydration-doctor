<script setup lang="ts">
// DELIBERATE BUG: a new random value on the server and another one in the browser.
const value = Math.random().toFixed(6);
</script>

<template>
  <main>
    <h1>Random</h1>
    <p data-testid="random">{{ value }}</p>
  </main>
</template>
