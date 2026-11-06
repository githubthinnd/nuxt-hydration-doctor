import { describe, expect, it } from 'vitest';
import { injectLocations } from '../../../src/plugins/inject-locations';

const ATTR = 'data-nhd-loc';
const options = { attribute: ATTR, file: 'components/Header.vue' };

function run(source: string): string {
  const result = injectLocations(source, options);
  if (result === null) throw new Error('expected a transform result');
  return result.code;
}

/** Every `attribute="file:line:column"` value found in `code`. */
function stamps(code: string): string[] {
  return [...code.matchAll(new RegExp(`${ATTR}="([^"]+)"`, 'g'))].map((m) => m[1] ?? '');
}

describe('injectLocations', () => {
  it('stamps each plain element with file:line:column of its opening "<"', () => {
    const source = [
      '<script setup lang="ts">',
      'const a = 1;',
      '</script>',
      '',
      '<template>',
      '  <header class="top">',
      '    <h1>Title</h1>',
      '  </header>',
      '</template>',
      '',
    ].join('\n');
    const code = run(source);
    expect(stamps(code)).toEqual(['components/Header.vue:6:3', 'components/Header.vue:7:5']);
    expect(code).toContain('<header data-nhd-loc="components/Header.vue:6:3" class="top">');
    expect(code).toContain('<h1 data-nhd-loc="components/Header.vue:7:5">Title</h1>');
  });

  it('points each stamp at the real tag position in the original file', () => {
    const source = '<template>\n  <div>\n    <span>x</span>\n    <p>y</p>\n  </div>\n</template>\n';
    const lines = source.split('\n');
    for (const stamp of stamps(run(source))) {
      const [, line, column] = /:(\d+):(\d+)$/.exec(stamp) ?? [];
      const text = lines[Number(line) - 1] ?? '';
      expect(text.slice(Number(column) - 1).startsWith('<')).toBe(true);
    }
  });

  it('leaves script, style and every attribute or directive untouched', () => {
    const source = [
      '<script setup>',
      "const items = ['a'];",
      '</script>',
      '<template>',
      '  <ul :class="{ on: true }" @click="go">',
      '    <li v-for="i in items" :key="i">{{ i }}</li>',
      '  </ul>',
      '</template>',
      '<style scoped>',
      '.on { color: red; }',
      '</style>',
    ].join('\n');
    const code = run(source);
    const stripped = code.replace(new RegExp(` ${ATTR}="[^"]+"`, 'g'), '');
    expect(stripped).toBe(source);
  });

  it('handles self-closing and void elements', () => {
    const code = run(
      '<template>\n  <div>\n    <img src="a.png" />\n    <br>\n  </div>\n</template>',
    );
    expect(code).toContain('<img data-nhd-loc="components/Header.vue:3:5" src="a.png" />');
    expect(code).toContain('<br data-nhd-loc="components/Header.vue:4:5">');
  });

  it('stamps elements inside v-if / v-else / v-for branches', () => {
    const code = run(
      '<template>\n  <div>\n    <p v-if="a">A</p>\n    <p v-else>B</p>\n  </div>\n</template>',
    );
    expect(stamps(code)).toHaveLength(3);
  });

  it('does not stamp <template> wrappers or <slot>', () => {
    const code = run(
      '<template>\n  <Comp>\n    <template #head><b>h</b></template>\n    <slot name="x" />\n  </Comp>\n</template>',
    );
    expect(code).not.toMatch(/<template data-nhd-loc/);
    expect(code).not.toMatch(/<slot data-nhd-loc/);
    // `<template #head>` has no stampable plain element except <b>; <Comp> is a component.
    expect(stamps(code)).toEqual(['components/Header.vue:3:21']);
  });

  it('does not stamp components (their root element carries its own stamp)', () => {
    expect(injectLocations('<template>\n  <MyButton />\n</template>', options)).toBeNull();
    expect(injectLocations('<template>\n  <my-button />\n</template>', options)).toBeNull();
  });

  it('is idempotent: running twice adds no second attribute', () => {
    const once = run('<template><div><p>x</p></div></template>');
    expect(injectLocations(once, options)).toBeNull();
    expect(stamps(once)).toHaveLength(2);
  });

  it('uses the configured attribute name', () => {
    const result = injectLocations('<template><div /></template>', {
      attribute: 'data-where',
      file: 'a.vue',
    });
    expect(result?.code).toContain('data-where="a.vue:1:11"');
  });

  it.each([
    ['a file with no template', '<script setup>\nconst a = 1;\n</script>'],
    ['an empty file', ''],
    ['a Pug template', '<template lang="pug">\ndiv hello\n</template>'],
    ['an external template', '<template src="./x.html"></template>'],
    ['a template with only components and text', '<template>text only</template>'],
    ['a malformed template', '<template><div></template>'],
  ])('returns null for %s', (_label, source) => {
    expect(injectLocations(source, options)).toBeNull();
  });

  it('produces a source map that names the file', () => {
    const result = injectLocations('<template><div /></template>', options);
    expect(result?.map.sources).toEqual(['components/Header.vue']);
    expect(result?.map.mappings).not.toBe('');
  });
});
