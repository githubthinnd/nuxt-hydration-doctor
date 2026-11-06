<script setup lang="ts">
import ScenarioHeader from '../components/ScenarioHeader.vue';
import ScenarioNote from '../components/ScenarioNote.vue';
</script>

<template>
  <main>
    <ScenarioHeader path="/nesting" />
    <!-- DELIBERATE BUG: a <div> is not allowed inside a <p>. The browser's HTML parser closes the
         <p> before the <div> when it reads the server HTML; Vue builds the nested DOM directly. -->
    <p>
      <div data-testid="inner">A block element inside a paragraph</div>
    </p>
    <ScenarioNote path="/nesting" />
  </main>
</template>
