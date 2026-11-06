// @vitest-environment happy-dom
import { createSSRApp, defineComponent, Fragment, h } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { diagnoseIssue } from '../../src/runtime/engine/diagnostics';
import { collectBrowserValues } from '../../src/runtime/interceptor/environment';
import { installWarnHandler, type WarnHandler } from '../../src/runtime/interceptor/install';
import { createInterceptor } from '../../src/runtime/interceptor/interceptor';
import { makeContext } from '../support/issue';
import { ATTR, hydrate, onlyIssue } from '../support/hydrate';
import { required } from '../support/required';

/**
 * Cases found while reviewing the finished system, each through a real Vue hydration:
 * Vue's class, style and attribute mismatch warnings, and components with several root elements.
 */
beforeEach(() => {
  document.body.innerHTML = '';
});

describe('class, style and attribute mismatches (real Vue warnings)', () => {
  it('captures a class mismatch, points at the element and diagnoses a browser global', () => {
    const Panel = defineComponent({
      name: 'Panel',
      setup() {
        const width = window.innerWidth;
        return () => h('div', { [ATTR]: 'Panel.vue:1:1', class: `w-${String(width)}` }, 'x');
      },
    });
    const issue = onlyIssue(
      hydrate('<div data-nhd-loc="Panel.vue:1:1" class="w-0">x</div>', Panel),
    );

    expect(issue.kind).toBe('class-mismatch');
    expect(issue.location).toEqual({ file: 'Panel.vue', line: 1, column: 1 });
    expect(issue.message).toContain('class="w-0"');

    const [top] = diagnoseIssue(
      issue,
      makeContext({ browserValues: collectBrowserValues(window) }),
    );
    expect(top?.category).toBe('browser-global-leak');
    expect(top?.evidence.some((line) => line.includes('window.innerWidth'))).toBe(true);
  });

  it('captures a style mismatch', () => {
    const Box = defineComponent({
      name: 'Box',
      render: () => h('div', { [ATTR]: 'Box.vue:1:1', style: { color: 'blue' } }, 'x'),
    });
    const issue = onlyIssue(
      hydrate('<div data-nhd-loc="Box.vue:1:1" style="color:red">x</div>', Box),
    );
    expect(issue.kind).toBe('style-mismatch');
    expect(issue.location?.file).toBe('Box.vue');
    expect(issue.message).toContain('style="color:red"');
  });

  it('captures an attribute mismatch and recognises a generated id', () => {
    const Field = defineComponent({
      name: 'Field',
      render: () => h('input', { [ATTR]: 'Field.vue:1:1', id: 'f7d2c9e1ab' }),
    });
    const issue = onlyIssue(hydrate('<input data-nhd-loc="Field.vue:1:1" id="a3b8e4d6c0">', Field));

    expect(issue.kind).toBe('attribute-mismatch');
    const [top] = diagnoseIssue(issue, makeContext());
    expect(top?.category).toBe('non-deterministic-value');
    expect(top?.title).toContain('random');
  });

  it('picks the right element when two siblings share a template tag and only one differs', () => {
    const Item = defineComponent({
      name: 'Item',
      props: { cls: { type: String, required: true } },
      render() {
        return h('li', { [ATTR]: 'Item.vue:1:1', class: this.cls }, 'x');
      },
    });
    const List = defineComponent({
      name: 'ItemList',
      render: () => h('ul', [h(Item, { cls: 'same' }), h(Item, { cls: 'client' })]),
    });
    const issue = onlyIssue(
      hydrate(
        '<ul><li data-nhd-loc="Item.vue:1:1" class="same">x</li><li data-nhd-loc="Item.vue:1:1" class="server">x</li></ul>',
        List,
      ),
    );
    expect(issue.kind).toBe('class-mismatch');
    expect(issue.occurrence).toBe(1);
  });
});

describe('components with several root elements', () => {
  const Multi = defineComponent({
    name: 'Multi',
    render: () =>
      h(Fragment, [
        h('p', { [ATTR]: 'Multi.vue:1:1' }, 'one'),
        h('p', { [ATTR]: 'Multi.vue:2:1' }, 'two-client'),
      ]),
  });
  const Parent = defineComponent({
    name: 'Parent',
    render: () => h('section', { [ATTR]: 'Parent.vue:1:1' }, [h(Multi)]),
  });
  const serverHtml =
    '<section data-nhd-loc="Parent.vue:1:1"><!--[--><p data-nhd-loc="Multi.vue:1:1">one</p><p data-nhd-loc="Multi.vue:2:1">two-server</p><!--]--></section>';

  it('points at the fragment component’s own element, not at the element that contains it', () => {
    const issue = onlyIssue(hydrate(serverHtml, Parent));

    expect(issue.componentName).toBe('Multi');
    // Before the fix the component's `$el` was a text anchor and its parent, the caller's
    // <section>, was reported instead.
    expect(issue.location).toEqual({ file: 'Multi.vue', line: 2, column: 1 });
    expect(issue.serverHtml).toBe('<p data-nhd-loc="Multi.vue:2:1">two-server</p>');
    expect(issue.clientHtml).toBe('<p data-nhd-loc="Multi.vue:2:1">two-client</p>');
  });

  it('finds the offending root even when it is not the first one', () => {
    const issue = required(hydrate(serverHtml, Parent).issues[0]);
    expect(issue.location?.line).toBe(2);
  });

  it('names the component’s own file for a mismatch that has no text to search for', () => {
    // A children mismatch carries nothing to match against, so the closest stamped element of the
    // component's root is used. With the caller's <section> as "the root" that was the wrong file.
    const Wrapped = defineComponent({
      name: 'Wrapped',
      render: () =>
        h(Fragment, [
          h('p', { [ATTR]: 'Wrapped.vue:1:1' }, 'one'),
          h('ul', { [ATTR]: 'Wrapped.vue:2:1' }, [h('li', 'a')]),
        ]),
    });
    const Outer = defineComponent({
      name: 'Outer',
      render: () => h('section', { [ATTR]: 'Outer.vue:1:1' }, [h(Wrapped)]),
    });
    const issue = onlyIssue(
      hydrate(
        '<section data-nhd-loc="Outer.vue:1:1"><!--[--><p data-nhd-loc="Wrapped.vue:1:1">one</p><ul data-nhd-loc="Wrapped.vue:2:1"><li>a</li><li>b</li></ul><!--]--></section>',
        Outer,
      ),
    );

    expect(issue.kind).toBe('children-mismatch');
    expect(issue.componentName).toBe('Wrapped');
    expect(issue.location?.file).toBe('Wrapped.vue');
  });
});

describe('another plugin that sets its own warn handler later', () => {
  it('does not stop the doctor from capturing, and still receives the warning itself', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p data-nhd-loc="A.vue:1:1">server</p>';
    document.body.append(root);
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
    const Page = defineComponent({
      name: 'Page',
      render: () => h('p', { [ATTR]: 'A.vue:1:1' }, 'client'),
    });
    const app = createSSRApp(Page);
    installWarnHandler(
      app,
      (message, instance, trace) => {
        interceptor.handleWarning(message, instance, trace);
      },
      () => undefined,
      () => undefined,
    );
    // What e.g. an error-reporting plugin does after ours has been installed:
    const theirs = vi.fn();
    app.config.warnHandler = theirs as WarnHandler;

    app.mount(root);
    interceptor.markMounted();

    expect(interceptor.api.issues()).toHaveLength(1);
    expect(theirs).toHaveBeenCalledTimes(1);
  });
});
