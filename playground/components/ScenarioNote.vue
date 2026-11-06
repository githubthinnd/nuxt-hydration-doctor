<script setup lang="ts">
import { scenarioFor } from '../utils/scenarios';

const props = defineProps<{ path: string }>();
const scenario = scenarioFor(props.path);
</script>

<template>
  <aside class="expect">
    <h2>What to look for</h2>
    <p v-if="scenario.setup">{{ scenario.setup }}</p>
    <p>{{ scenario.expect }}</p>
    <p>Fix: {{ scenario.fix }}</p>
  </aside>
</template>
