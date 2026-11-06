<script setup lang="ts">
import { scenarioGroups } from './utils/scenarios';

const route = useRoute();
const groups = scenarioGroups();
</script>

<template>
  <div class="shell">
    <aside class="sidebar">
      <!-- Plain anchors, not NuxtLink: hydration only happens on a full page load. -->
      <a class="brand" href="/">
        <svg
          class="brand-mark"
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M3 12h4l2.5-6 4 12 2.5-6H21" />
        </svg>
        <span class="brand-text">
          <strong>Hydration Doctor</strong>
          <small>Playground</small>
        </span>
      </a>

      <nav class="nav" aria-label="Scenarios">
        <div v-for="group in groups" :key="group.name" class="nav-group">
          <p class="nav-label">{{ group.name }}</p>
          <a
            v-for="scenario in group.items"
            :key="scenario.to"
            class="nav-link"
            :class="{ 'nav-link--active': route.path === scenario.to }"
            :href="scenario.to"
            :aria-current="route.path === scenario.to ? 'page' : undefined"
          >
            <span class="dot" :class="scenario.kind === 'control' ? 'dot--ok' : 'dot--bug'" />
            {{ scenario.title }}
          </a>
        </div>
      </nav>

      <p class="sidebar-note">
        Every scenario loads as a full page so the server HTML is hydrated. The badge at the corner
        is the module.
      </p>
    </aside>

    <div class="content">
      <NuxtPage />
    </div>
  </div>
</template>
