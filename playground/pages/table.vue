<template>
  <main>
    <h1>Table</h1>
    <!-- DELIBERATE BUG: a <tr> directly inside <table>. The browser's parser inserts a <tbody>
         when it reads the server HTML; Vue does not. -->
    <table>
      <tr>
        <td data-testid="cell">A cell without a tbody</td>
      </tr>
    </table>
  </main>
</template>
