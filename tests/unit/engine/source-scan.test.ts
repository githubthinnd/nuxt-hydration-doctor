import { describe, expect, it } from 'vitest';
import {
  blankStringsAndComments,
  findInServerCode,
  serverRunCode,
} from '../../../src/runtime/engine/source-scan';

describe('blankStringsAndComments', () => {
  it('blanks strings and comments but keeps every offset and line break', () => {
    const source = `const a = "window.x"; // window.y\n/* window.z */ const b = 'document.q'`;
    const blanked = blankStringsAndComments(source);
    expect(blanked).toHaveLength(source.length);
    expect(blanked).not.toContain('window');
    expect(blanked).not.toContain('document');
    expect(blanked.split('\n')).toHaveLength(2);
    expect(blanked).toContain('const a =');
  });

  it('keeps the code inside ${} of a template literal and blanks its text', () => {
    const blanked = blankStringsAndComments('const s = `window text ${Date.now()} more`');
    expect(blanked).toContain('Date.now()');
    expect(blanked).not.toContain('window');
  });

  it('copes with escaped quotes and an unterminated string', () => {
    expect(blankStringsAndComments(String.raw`const a = "x\"window"; const b = window`)).toContain(
      'const b = window',
    );
    expect(() => blankStringsAndComments('const a = "never closed\nwindow.x')).not.toThrow();
  });
});

describe('serverRunCode', () => {
  it('hides the callback of onMounted but keeps the code around it', () => {
    const code = serverRunCode(
      `setup() {\n  const a = Math.random();\n  onMounted(() => {\n    window.x = Math.random();\n  });\n}`,
    );
    expect(code.match(/Math\.random/g)).toHaveLength(1);
    expect(code).not.toContain('window');
  });

  it('recognises the compiled import form and nested parentheses', () => {
    const code = serverRunCode(
      `(0, vue.onMounted)(() => { foo(bar(window.a), (1 + 2)); });\nconst keep = document.title;`,
    );
    expect(code).not.toContain('window');
    expect(code).toContain('document.title');
  });

  it('treats the other client-only hooks the same way', () => {
    for (const hook of ['onUpdated', 'onBeforeUnmount', 'onUnmounted', 'nextTick']) {
      expect(serverRunCode(`${hook}(() => { window.x })`)).not.toContain('window');
    }
  });

  it('does not hide code in hooks that also run during setup', () => {
    expect(serverRunCode('onBeforeMount(() => { window.x })')).toContain('window');
    expect(serverRunCode('watchEffect(() => { window.x })')).toContain('window');
  });
});

describe('findInServerCode', () => {
  it('reports the original source line and whether it is top level', () => {
    const source = `setup() {\n  const w = window.innerWidth;\n  const f = () => {\n    return window.innerHeight;\n  };\n}`;
    const matches = findInServerCode(source, /(window)\.\w+/g);
    expect(matches.map((m) => [m.text, m.line, m.topLevel])).toEqual([
      ['window', 'const w = window.innerWidth;', true],
      ['window', 'return window.innerHeight;', false],
    ]);
  });

  it('ignores matches in strings, comments and client-only callbacks', () => {
    const source = `// window.a\nconst s = "window.b";\nonMounted(() => { window.c })`;
    expect(findInServerCode(source, /window/g)).toEqual([]);
  });

  it('shortens very long lines', () => {
    const long = `const x = Math.random(${'1,'.repeat(200)})`;
    expect(findInServerCode(long, /Math\.random/g)[0]?.line.length).toBeLessThanOrEqual(141);
  });
});
