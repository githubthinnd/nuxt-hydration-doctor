export interface Scenario {
  readonly to: string;
  readonly title: string;
  /** `control` is the page that must stay clean; `bug` pages are deliberate mismatches. */
  readonly kind: 'control' | 'bug';
  readonly group: string;
  readonly summary: string;
  /** What Hydration Doctor is expected to say. */
  readonly expect: string;
  /** The correct way to write it. */
  readonly fix: string;
  /** Something to do before loading the page, when the scenario needs it. */
  readonly setup?: string;
}

export const scenarios: readonly Scenario[] = [
  {
    to: '/ok',
    title: 'Control',
    kind: 'control',
    group: 'Baseline',
    summary: 'A page with nothing to report, to check the module stays quiet when it should.',
    expect:
      'Nothing: the badge stays at 0. If it ever reports here, the module has a false positive.',
    fix: 'Nothing to fix.',
  },
  {
    to: '/time',
    title: 'Clock in setup',
    kind: 'bug',
    group: 'Non-deterministic values',
    summary: 'new Date() runs once on the server and again in the browser.',
    expect: 'A text mismatch in pages/time.vue, diagnosed as the current time.',
    fix: 'Compute it once with useState and reuse it on the client.',
  },
  {
    to: '/random',
    title: 'Math.random() in setup',
    kind: 'bug',
    group: 'Non-deterministic values',
    summary: 'A random number is drawn on each side of the wire.',
    expect: 'A text mismatch, diagnosed as a random value read on both sides.',
    fix: 'Generate it once with useState, or only after the component is mounted.',
  },
  {
    to: '/browser-global',
    title: 'window.innerWidth',
    kind: 'bug',
    group: 'Browser-only APIs',
    summary: 'The server has no window and renders 0; the browser renders its real width.',
    expect: 'A text mismatch, diagnosed as a browser-only value (window.innerWidth).',
    fix: 'Read it in onMounted, so the first render matches the server.',
  },
  {
    to: '/storage',
    title: 'localStorage in setup',
    kind: 'bug',
    group: 'Browser-only APIs',
    summary: 'The server renders the default theme; a stored theme wins in the browser.',
    expect: 'A text mismatch, diagnosed with the storage key named (never its value).',
    fix: 'Read storage in onMounted, or render the stored value only on the client.',
    setup:
      "In the console run localStorage.setItem('nhd-demo-theme', 'solarized-dark'), then reload.",
  },
  {
    to: '/nesting',
    title: '<div> inside <p>',
    kind: 'bug',
    group: 'Invalid HTML',
    summary: 'The HTML parser closes the <p> early; Vue builds the nested DOM directly.',
    expect: 'A mismatch diagnosed as invalid HTML nesting (<div> inside <p>).',
    fix: 'Use a <div> or a <span> as the wrapper.',
  },
  {
    to: '/table',
    title: '<tr> without <tbody>',
    kind: 'bug',
    group: 'Invalid HTML',
    summary: 'The parser inserts a <tbody> that Vue never creates.',
    expect: 'A node mismatch, diagnosed as invalid HTML nesting involving <tbody>.',
    fix: 'Wrap the rows in <tbody>.',
  },
  {
    to: '/state',
    title: 'useState changed early',
    kind: 'bug',
    group: 'Shared state',
    summary: 'A client plugin changes state before hydration finishes.',
    expect: 'A text mismatch, diagnosed as state that differs from the server payload.',
    fix: 'Change shared state after hydration, not before.',
  },
];

/** The scenario of a route, or a placeholder when the route is not in the list. */
export function scenarioFor(path: string): Scenario {
  return (
    scenarios.find((scenario) => scenario.to === path) ?? {
      to: path,
      title: path,
      kind: 'bug',
      group: '',
      summary: '',
      expect: '',
      fix: '',
    }
  );
}

/** The scenarios grouped for the sidebar, in order of first appearance. */
export function scenarioGroups(): { readonly name: string; readonly items: readonly Scenario[] }[] {
  const groups = new Map<string, Scenario[]>();
  for (const scenario of scenarios) {
    const items = groups.get(scenario.group) ?? [];
    items.push(scenario);
    groups.set(scenario.group, items);
  }
  return Array.from(groups, ([name, items]) => ({ name, items }));
}
