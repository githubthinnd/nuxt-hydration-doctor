<script setup lang="ts">
// Every page below is a deliberate hydration mismatch (except /ok, the control). Load one with a
// full page load, not a client-side navigation: hydration only happens on the first render.
import { scenarioGroups } from '../utils/scenarios';

const groups = scenarioGroups();
</script>

<template>
  <main>
    <header class="hero">
      <h1>Find the line behind the mismatch.</h1>
      <p>
        Each scenario below breaks hydration on purpose. Open one and watch Hydration Doctor
        pinpoint the file, diff the two renderings and explain the likely cause.
      </p>
    </header>

    <ol class="steps">
      <li>
        <strong>Open a scenario</strong>It loads as a full page, so the server HTML is hydrated.
      </li>
      <li>
        <strong>Read the HUD</strong>The badge in the corner opens the diff and the diagnosis.
      </li>
      <li><strong>Jump to the source</strong>Open in editor lands on the exact line and column.</li>
    </ol>

    <template v-for="group in groups" :key="group.name">
      <h2 class="group-label">{{ group.name }}</h2>
      <div class="cards">
        <a v-for="scenario in group.items" :key="scenario.to" class="card" :href="scenario.to">
          <span class="pill" :class="scenario.kind === 'control' ? 'pill--ok' : 'pill--bug'">
            {{ scenario.kind === 'control' ? 'Control' : 'Deliberate mismatch' }}
          </span>
          <h3>{{ scenario.title }}</h3>
          <p>{{ scenario.summary }}</p>
          <span class="expect-line">{{ scenario.expect }}</span>
        </a>
      </div>
    </template>
  </main>
</template>
