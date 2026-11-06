<template>
  <main>
    <h1>Nesting</h1>
    <!-- DELIBERATE BUG: a <div> is not allowed inside a <p>. The browser's HTML parser closes the
         <p> before the <div> when it reads the server HTML; Vue builds the nested DOM directly. -->
    <p>
      <div data-testid="inner">A block element inside a paragraph</div>
    </p>
  </main>
</template>
