<script setup lang="ts">
// DELIBERATE BUG: the typeof guard keeps the server from crashing, but the first browser render
// uses the real window width while the server rendered 0.
const width = ref(typeof window === 'undefined' ? 0 : window.innerWidth);
</script>

<template>
  <main>
    <h1>Viewport</h1>
    <p data-testid="width">Width: {{ width }}</p>
  </main>
</template>
