<script setup lang="ts">
import { scenarioFor } from '../utils/scenarios';

// A component of its own on purpose: Vue compiles a long run of static elements into one static
// chunk and hydrates it by counting nodes, so a scenario's own markup must not share a run with
// this decoration, or Vue itself would stop seeing the mismatch.
const props = defineProps<{ path: string }>();
const scenario = scenarioFor(props.path);
</script>

<template>
  <header class="page-head">
    <span class="pill" :class="scenario.kind === 'control' ? 'pill--ok' : 'pill--bug'">
      {{ scenario.kind === 'control' ? 'Control' : 'Deliberate mismatch' }}
    </span>
    <h1>{{ scenario.title }}</h1>
    <p class="lead">{{ scenario.summary }}</p>
  </header>
</template>
