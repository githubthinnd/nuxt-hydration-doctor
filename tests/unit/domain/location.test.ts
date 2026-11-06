import { describe, expect, it } from 'vitest';
import { formatSourceLocation, parseSourceLocation } from '../../../src/runtime/domain/location';

describe('parseSourceLocation', () => {
  it('parses file:line:column', () => {
    expect(parseSourceLocation('components/Header.vue:42:5')).toEqual({
      file: 'components/Header.vue',
      line: 42,
      column: 5,
    });
  });

  it('takes line and column from the right when the file contains colons', () => {
    expect(parseSourceLocation('C:/proj/App.vue:3:9')).toEqual({
      file: 'C:/proj/App.vue',
      line: 3,
      column: 9,
    });
  });

  it('round-trips with formatSourceLocation', () => {
    const location = { file: 'pages/index.vue', line: 7, column: 3 };
    expect(parseSourceLocation(formatSourceLocation(location))).toEqual(location);
  });

  it.each([
    ['empty', ''],
    ['no position', 'App.vue'],
    ['one number', 'App.vue:3'],
    ['non-numeric', 'App.vue:a:b'],
    ['zero line', 'App.vue:0:1'],
    ['zero column', 'App.vue:1:0'],
    ['negative', 'App.vue:-1:2'],
    ['empty file', ':1:2'],
    ['unsafe integer', 'App.vue:99999999999999999999:1'],
  ])('returns null for %s', (_label, value) => {
    expect(parseSourceLocation(value)).toBeNull();
  });
});
