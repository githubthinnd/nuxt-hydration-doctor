<script setup lang="ts">
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
    <h1>Theme</h1>
    <p data-testid="theme">Theme: {{ theme }}</p>
  </main>
</template>
