<script setup lang="ts">
import ScenarioHeader from '../components/ScenarioHeader.vue';
import ScenarioNote from '../components/ScenarioNote.vue';
</script>

<template>
  <main>
    <ScenarioHeader path="/table" />
    <!-- DELIBERATE BUG: a <tr> directly inside <table>. The browser's parser inserts a <tbody>
         when it reads the server HTML; Vue does not. -->
    <table>
      <tr>
        <td data-testid="cell">A cell without a tbody</td>
      </tr>
    </table>
    <ScenarioNote path="/table" />
  </main>
</template>
