// DELIBERATE BUG, only on /state: shared state is modified on the client before hydration
// finishes, so the first client render differs from what the server rendered from the payload.
export default defineNuxtPlugin(() => {
  if (window.location.pathname === '/state') {
    useState('demo-counter', () => 0).value = 5;
  }
});
