// @vitest-environment happy-dom
import { defineComponent, h } from 'vue';
import { beforeEach, describe, expect, it } from 'vitest';
import type { HydrationIssue } from '../../src/runtime/domain/issue';
import { createInterceptor, type Interceptor } from '../../src/runtime/interceptor/interceptor';
import { ATTR, hydrate, onlyIssue, type Run } from '../support/hydrate';

const only = (run: Run): HydrationIssue => onlyIssue(run);

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('hydration capture (real Vue hydration)', () => {
  it('captures nothing when server and client agree', () => {
    const Page = defineComponent({
      name: 'Page',
      render: () => h('p', { [ATTR]: 'a.vue:1:1' }, 'same'),
    });
    const run = hydrate('<p data-nhd-loc="a.vue:1:1">same</p>', Page);
    expect(run.issues).toEqual([]);
    expect(run.previous).not.toHaveBeenCalled();
  });

  it('pins a text mismatch to the offending element, with both sides of the diff', () => {
    const Card = defineComponent({
      name: 'Card',
      render: () =>
        h('div', { [ATTR]: 'Card.vue:1:1' }, [
          h('h2', { [ATTR]: 'Card.vue:2:3' }, 'Title'),
          h('p', { [ATTR]: 'Card.vue:3:3' }, 'client text'),
        ]),
    });
    const issue = only(
      hydrate(
        '<div data-nhd-loc="Card.vue:1:1"><h2 data-nhd-loc="Card.vue:2:3">Title</h2><p data-nhd-loc="Card.vue:3:3">server text</p></div>',
        Card,
      ),
    );

    expect(issue.kind).toBe('text-mismatch');
    expect(issue.componentName).toBe('Card');
    expect(issue.location).toEqual({ file: 'Card.vue', line: 3, column: 3 });
    expect(issue.occurrence).toBe(0);
    expect(issue.serverHtml).toBe('<p data-nhd-loc="Card.vue:3:3">server text</p>');
    expect(issue.clientHtml).toBe('<p data-nhd-loc="Card.vue:3:3">client text</p>');
    expect(issue.route).toBe('/test');
    expect(issue.metrics).toEqual({ detectedAt: 1000, msSinceNavigationStart: 12 });
  });

  it('captures a node mismatch using the element Vue created after patching', () => {
    const Box = defineComponent({
      name: 'Box',
      render: () => h('div', { [ATTR]: 'Box.vue:1:1' }, 'x'),
    });
    const issue = only(hydrate('<span data-nhd-loc="Box.vue:1:1">x</span>', Box));

    expect(issue.kind).toBe('node-mismatch');
    expect(issue.location).toEqual({ file: 'Box.vue', line: 1, column: 1 });
    expect(issue.serverHtml).toBe('<span data-nhd-loc="Box.vue:1:1">x</span>');
    expect(issue.clientHtml).toBe('<div data-nhd-loc="Box.vue:1:1">x</div>');
  });

  it('captures a children mismatch on the container', () => {
    const List = defineComponent({
      name: 'List',
      render: () => h('ul', { [ATTR]: 'List.vue:1:1' }, [h('li', 'a')]),
    });
    const issue = only(hydrate('<ul data-nhd-loc="List.vue:1:1"><li>a</li><li>b</li></ul>', List));

    expect(issue.kind).toBe('children-mismatch');
    expect(issue.location).toEqual({ file: 'List.vue', line: 1, column: 1 });
    expect(issue.serverHtml).toContain('<li>b</li>');
    expect(issue.clientHtml).not.toContain('<li>b</li>');
  });

  it('tells apart repeated instances of one template tag (v-for) by occurrence', () => {
    const Item = defineComponent({
      name: 'Item',
      props: { label: { type: String, required: true } },
      render() {
        return h('li', { [ATTR]: 'Item.vue:1:1' }, this.label);
      },
    });
    const List = defineComponent({
      name: 'ItemList',
      render: () => h('ul', [h(Item, { label: 'a' }), h(Item, { label: 'CLIENT' })]),
    });
    const issue = only(
      hydrate(
        '<ul><li data-nhd-loc="Item.vue:1:1">a</li><li data-nhd-loc="Item.vue:1:1">SERVER</li></ul>',
        List,
      ),
    );

    expect(issue.componentName).toBe('Item');
    expect(issue.occurrence).toBe(1);
    expect(issue.serverHtml).toBe('<li data-nhd-loc="Item.vue:1:1">SERVER</li>');
    expect(issue.clientHtml).toBe('<li data-nhd-loc="Item.vue:1:1">CLIENT</li>');
  });

  it('records the component chain and phase as breadcrumbs, outermost first', () => {
    const Child = defineComponent({
      name: 'Child',
      render: () => h('p', { [ATTR]: 'Child.vue:1:1' }, 'client'),
    });
    const Parent = defineComponent({ name: 'Parent', render: () => h(Child) });
    const issue = only(hydrate('<p data-nhd-loc="Child.vue:1:1">server</p>', Parent));

    expect(issue.breadcrumbs).toEqual([
      'route /test',
      'during initial hydration',
      'Parent',
      'Child',
    ]);
  });

  it('still reports to the app’s previous warn handler', () => {
    const Page = defineComponent({
      name: 'Page',
      render: () => h('p', { [ATTR]: 'a.vue:1:1' }, 'client'),
    });
    const run = hydrate('<p data-nhd-loc="a.vue:1:1">server</p>', Page);
    expect(run.previous).toHaveBeenCalledTimes(1);
  });

  it('reports a location of null, but still the markup, when nothing is stamped', () => {
    const Plain = defineComponent({ name: 'Plain', render: () => h('p', 'client') });
    const issue = only(hydrate('<p>server</p>', Plain));

    expect(issue.location).toBeNull();
    expect(issue.occurrence).toBeNull();
    expect(issue.serverHtml).toBeNull();
    expect(issue.clientHtml).toBe('<p>client</p>');
  });

  it('turns a hydration error from vue:error into an issue and ignores other errors', () => {
    const Page = defineComponent({ name: 'Page', render: () => h('p', 'x') });
    const { interceptor } = hydrate('<p>x</p>', Page);

    expect(interceptor.handleError(new Error('something else'), null, 'render')).toBe(false);
    expect(
      interceptor.handleError(
        new Error('Hydration node mismatch:\n- rendered on server:a\n- expected on client:div'),
        null,
        'hydrate',
      ),
    ).toBe(true);
    interceptor.flush();

    const [issue] = interceptor.api.issues();
    expect(issue).toMatchObject({ kind: 'node-mismatch', location: null });
  });

  it('keeps one issue when Vue reports the same mismatch twice in one tick', () => {
    // Production completes captures in a microtask, so both warnings share a batch; model that
    // with a queue instead of the synchronous scheduler the other tests use.
    const queued: (() => void)[] = [];
    const interceptor = createInterceptor({
      document,
      attribute: ATTR,
      historyLimit: 5,
      snapshot: null,
      getRoute: () => '/',
      now: () => 0,
      sinceNavigationStart: () => null,
      schedule: (task) => queued.push(task),
      reportInternal: () => undefined,
    });
    interceptor.markMounted();
    const message =
      'Hydration children mismatch on<p>x</p>\nServer rendered element contains fewer child nodes than client vdom.';
    interceptor.handleWarning(message, null, '');
    interceptor.handleWarning(message, null, '');
    for (const task of queued) task();

    expect(interceptor.api.issues()).toHaveLength(1);
  });

  it('keeps an issue, without a location, when its component instance throws while being read', () => {
    const interceptor = createInterceptor({
      document,
      attribute: ATTR,
      historyLimit: 5,
      snapshot: null,
      getRoute: () => '/',
      now: () => 0,
      sinceNavigationStart: () => null,
      schedule: (task) => {
        task();
      },
      reportInternal: () => undefined,
    });
    const hostile = {
      get $el(): never {
        throw new Error('exploding $el');
      },
      $options: {},
    };
    const hostileInstance = hostile as unknown as Parameters<Interceptor['handleWarning']>[1];
    interceptor.handleWarning(
      'Hydration node mismatch:\n- rendered on server:a\n- expected on client:b',
      hostileInstance,
      '',
    );
    interceptor.handleWarning(
      'Hydration children mismatch on<p></p>\nServer rendered element contains more child nodes than client vdom.',
      null,
      '',
    );
    interceptor.markMounted();

    const issues = interceptor.api.issues();
    expect(issues.map((issue) => issue.kind)).toEqual(['node-mismatch', 'children-mismatch']);
    expect(issues[0]?.location).toBeNull();
    expect(issues[0]?.clientHtml).toBeNull();
  });
});
