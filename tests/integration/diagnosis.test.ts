// @vitest-environment happy-dom
import { defineComponent, h } from 'vue';
import { beforeEach, describe, expect, it } from 'vitest';
import type { HydrationIssue } from '../../src/runtime/domain/issue';
import { diagnoseIssue } from '../../src/runtime/engine/diagnostics';
import { collectBrowserValues } from '../../src/runtime/interceptor/environment';
import { makeContext } from '../support/issue';
import { ATTR, hydrate, onlyIssue } from '../support/hydrate';
import { required } from '../support/required';

/**
 * Whole pipeline: a real Vue hydration produces a real warning, the interceptor builds the issue
 * from the real DOM, and the engine explains it. Only the browser facts are supplied by the test.
 */
beforeEach(() => {
  document.body.innerHTML = '';
});

function diagnose(issue: HydrationIssue, context = makeContext()) {
  return diagnoseIssue(issue, context);
}

describe('interceptor evidence for the heuristics', () => {
  it('captures the ancestors of the offending element and the component’s code', () => {
    const Child = defineComponent({
      name: 'Child',
      setup() {
        const token = Math.random();
        return () => h('p', { [ATTR]: 'Child.vue:1:1' }, `client ${String(token)}`);
      },
    });
    const Parent = defineComponent({
      name: 'Parent',
      render: () => h('section', { [ATTR]: 'Parent.vue:1:1' }, [h(Child)]),
    });
    const issue = onlyIssue(
      hydrate(
        '<section data-nhd-loc="Parent.vue:1:1"><p data-nhd-loc="Child.vue:1:1">server</p></section>',
        Parent,
      ),
    );

    expect(issue.ancestry).toEqual(['html', 'body', 'div', 'section']);
    expect(issue.componentSource).toContain('// setup');
    expect(issue.componentSource).toContain('Math.random()');
  });
});

describe('diagnosis of real hydration mismatches', () => {
  it('explains a clock read during setup, from the visible text and the code together', () => {
    const Clock = defineComponent({
      name: 'Clock',
      setup() {
        const now = new Date();
        return () => h('time', { [ATTR]: 'Clock.vue:1:1' }, now.toISOString());
      },
    });
    const earlier = new Date(Date.now() - 5000).toISOString();
    const issue = onlyIssue(hydrate(`<time data-nhd-loc="Clock.vue:1:1">${earlier}</time>`, Clock));

    const [top] = diagnose(issue);
    expect(top?.category).toBe('non-deterministic-value');
    expect(top?.title).toContain('current time');
    expect(top?.confidence).toBeGreaterThan(0.9);
    expect(top?.evidence.some((line) => line.includes('new Date()'))).toBe(true);
    expect(top?.fix?.code).toContain('useState');
  });

  it('explains a browser global read during setup, from its live value and the code', () => {
    const Width = defineComponent({
      name: 'Width',
      setup() {
        const width = window.innerWidth;
        return () => h('p', { [ATTR]: 'Width.vue:1:1' }, `Width: ${String(width)}`);
      },
    });
    const issue = onlyIssue(hydrate('<p data-nhd-loc="Width.vue:1:1">Width: 0</p>', Width));

    const [top] = diagnose(issue, makeContext({ browserValues: collectBrowserValues(window) }));
    expect(top?.category).toBe('browser-global-leak');
    expect(top?.confidence).toBeGreaterThan(0.85);
    expect(top?.evidence.some((line) => line.includes('window.innerWidth'))).toBe(true);
    expect(top?.fix?.code).toContain('onMounted');
  });

  it('explains nesting the browser repaired: the client keeps <div> inside <p>', () => {
    const Box = defineComponent({
      name: 'Box',
      render: () =>
        h('p', { [ATTR]: 'Box.vue:1:1' }, [h('div', { [ATTR]: 'Box.vue:2:3' }, 'content')]),
    });
    // What a browser's parser produces from `<p><div>content</div></p>`.
    const run = hydrate(
      '<p data-nhd-loc="Box.vue:1:1"></p><div data-nhd-loc="Box.vue:2:3">content</div><p></p>',
      Box,
    );

    const issue = run.issues.find((candidate) => candidate.kind === 'children-mismatch');
    expect(issue).toBeDefined();
    const [top] = diagnose(required(issue, 'a children-mismatch issue'));
    expect(top?.category).toBe('invalid-html-nesting');
    expect(top?.confidence).toBeGreaterThanOrEqual(0.9);
    expect(top?.evidence[0]).toContain('<div> inside <p>');
  });

  it('explains state changed before hydration finished', () => {
    const Counter = defineComponent({
      name: 'Counter',
      render: () => h('p', { [ATTR]: 'Counter.vue:1:1' }, 'Count: 5'),
    });
    const issue = onlyIssue(hydrate('<p data-nhd-loc="Counter.vue:1:1">Count: 0</p>', Counter));

    const [top] = diagnose(
      issue,
      makeContext({
        stateChanges: [{ store: 'useState', key: 'counter', before: '0', after: '5' }],
      }),
    );
    expect(top?.category).toBe('state-desynchronization');
    expect(top?.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('has nothing confident to say about an ordinary content difference', () => {
    const Plain = defineComponent({
      name: 'Plain',
      render: () => h('p', { [ATTR]: 'Plain.vue:1:1' }, 'Hello'),
    });
    const issue = onlyIssue(hydrate('<p data-nhd-loc="Plain.vue:1:1">Hallo</p>', Plain));
    expect(diagnose(issue)).toEqual([]);
  });
});
