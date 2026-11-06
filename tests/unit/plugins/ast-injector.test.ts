import { describe, expect, it } from 'vitest';
import { AST_INJECTOR_NAME, astInjector } from '../../../src/plugins/ast-injector';

interface RawPlugin {
  name: string;
  enforce?: string;
  transform: {
    filter: { id: { include: RegExp } };
    handler: (code: string, id: string) => { code: string } | null;
  };
  vite?: { apply?: unknown };
}

const SOURCE = '<template><div /></template>';

function plugin(overrides: { exclude?: readonly string[]; root?: string } = {}): RawPlugin {
  const raw = astInjector.raw(
    { attribute: 'data-nhd-loc', exclude: ['/node_modules/'], root: '/project', ...overrides },
    { framework: 'vite', versions: {} },
  );
  return raw as unknown as RawPlugin;
}

describe('astInjector (unplugin)', () => {
  it('runs before the Vue plugin and only while serving', () => {
    const p = plugin();
    expect(p.name).toBe(AST_INJECTOR_NAME);
    expect(p.enforce).toBe('pre');
    expect(p.vite?.apply).toBe('serve');
  });

  it('filters on .vue module ids and never on sub-requests', () => {
    const { include } = plugin().transform.filter.id;
    expect(include.test('/project/components/A.vue')).toBe(true);
    expect(include.test('/project/utils/a.ts')).toBe(false);
    // `?vue&type=style…` and `?macro=true` end in a query, not in ".vue".
    expect(include.test('/project/components/A.vue?vue&type=style&index=0')).toBe(false);
    expect(include.test('/project/pages/index.vue?macro=true')).toBe(false);
  });

  it('honours the exclude list, including Windows separators', () => {
    const { handler } = plugin().transform;
    expect(handler(SOURCE, '/project/node_modules/lib/A.vue')).toBeNull();
    expect(handler(SOURCE, 'C:\\project\\node_modules\\lib\\A.vue')).toBeNull();
    expect(handler(SOURCE, '/project/components/A.vue')).not.toBeNull();
    expect(
      plugin({ exclude: [] }).transform.handler(SOURCE, '/project/node_modules/lib/A.vue'),
    ).not.toBeNull();
  });

  it('records the path relative to the project root with forward slashes', () => {
    const result = plugin().transform.handler(SOURCE, '/project/components/Header.vue');
    expect(result?.code).toContain('data-nhd-loc="components/Header.vue:1:11"');
  });

  it('returns null instead of throwing when the transform cannot run', () => {
    const { handler } = plugin().transform;
    expect(handler('<template><div></template>', '/project/A.vue')).toBeNull();
    expect(handler(undefined as unknown as string, '/project/A.vue')).toBeNull();
  });
});
