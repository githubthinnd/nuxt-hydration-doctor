import { describe, expect, it } from 'vitest';
import type { DiffRow } from '../../../src/runtime/domain/diff';
import { required } from '../../support/required';
import { diffHtml } from '../../../src/runtime/engine/html-diff';

const text = (row: DiffRow, side: 'server' | 'client'): string | null =>
  row[side]?.map((segment) => segment.text).join('') ?? null;

describe('diffHtml', () => {
  it('reports identical markup as all-same rows', () => {
    const diff = diffHtml('<div><p>hi</p></div>', '<div><p>hi</p></div>');
    expect(diff.identical).toBe(true);
    expect(diff.truncated).toBe(false);
    expect(diff.rows.map((row) => row.status)).toEqual(['same', 'same', 'same', 'same', 'same']);
  });

  it('treats two empty inputs as identical with no rows', () => {
    expect(diffHtml('', '')).toEqual({ rows: [], identical: true, truncated: false });
  });

  it('puts one tag or text node per line, indented by depth', () => {
    const diff = diffHtml('<ul><li>a</li></ul>', '<ul><li>a</li></ul>');
    expect(diff.rows.map((row) => text(row, 'server'))).toEqual([
      '<ul>',
      '  <li>',
      '    a',
      '  </li>',
      '</ul>',
    ]);
  });

  it('isolates the differing text inside a changed row', () => {
    const diff = diffHtml('<p>server</p>', '<p>client</p>');
    const changed = diff.rows.filter((row) => row.status === 'changed');
    expect(changed).toHaveLength(1);
    expect(changed[0]?.server).toEqual([
      { text: '  ', diverges: false },
      { text: 'server', diverges: true },
    ]);
    expect(changed[0]?.client).toEqual([
      { text: '  ', diverges: false },
      { text: 'client', diverges: true },
    ]);
    expect(diff.identical).toBe(false);
  });

  it('marks only the tag name when a tag changes, on both the opening and closing tag', () => {
    const diff = diffHtml('<span>x</span>', '<div>x</div>');
    const changed = diff.rows.filter((row) => row.status === 'changed');
    expect(changed.map((row) => row.server?.find((s) => s.diverges)?.text)).toEqual([
      'span',
      'span',
    ]);
    expect(changed.map((row) => row.client?.find((s) => s.diverges)?.text)).toEqual(['div', 'div']);
  });

  it('shows a node only the server rendered as a removed row with an empty client side', () => {
    const diff = diffHtml('<ul><li>a</li><li>b</li></ul>', '<ul><li>a</li></ul>');
    const removed = diff.rows.filter((row) => row.status === 'removed');
    expect(removed.map((row) => text(row, 'server'))).toEqual(['  <li>', '    b', '  </li>']);
    expect(removed.every((row) => row.client === null)).toBe(true);
  });

  it('shows a node only the client rendered as an added row with an empty server side', () => {
    const diff = diffHtml('<ul></ul>', '<ul><li>a</li></ul>');
    const added = diff.rows.filter((row) => row.status === 'added');
    expect(added.map((row) => text(row, 'client'))).toEqual(['  <li>', '    a', '  </li>']);
    expect(added.every((row) => row.server === null)).toBe(true);
  });

  it('keeps later rows aligned after an insertion in the middle', () => {
    const diff = diffHtml('<div><p>a</p><p>c</p></div>', '<div><p>a</p><p>b</p><p>c</p></div>');
    const statuses = diff.rows.map((row) => row.status);
    expect(statuses.filter((s) => s === 'added')).toHaveLength(3);
    expect(statuses.filter((s) => s === 'changed')).toHaveLength(0);
    // The final </div> still lines up with its counterpart instead of being reported as changed.
    expect(statuses.at(-1)).toBe('same');
  });

  it('removes hidden attributes before comparing', () => {
    const diff = diffHtml(
      '<p data-nhd-loc="a.vue:1:1" class="x">hi</p>',
      '<p class="x" data-nhd-loc="b.vue:9:9">hi</p>',
      { hideAttributes: ['data-nhd-loc'] },
    );
    expect(diff.identical).toBe(true);
    expect(text(required(diff.rows[0]), 'server')).toBe('<p class="x">');
  });

  it('still shows real attribute differences', () => {
    const diff = diffHtml('<p class="a">x</p>', '<p class="b">x</p>');
    const changed = diff.rows.find((row) => row.status === 'changed');
    expect(changed?.server?.find((s) => s.diverges)?.text).toBe('a');
  });

  it('does not indent after void and self-closing tags', () => {
    const diff = diffHtml('<div><br><img src="a.png" /><span>x</span></div>', '');
    const lines = diff.rows.map((row) => text(row, 'server'));
    expect(lines).toEqual([
      '<div>',
      '  <br>',
      '  <img src="a.png" />',
      '  <span>',
      '    x',
      '  </span>',
      '</div>',
    ]);
  });

  it('keeps a ">" inside a quoted attribute value within its tag', () => {
    const diff = diffHtml('<a title="a>b">x</a>', '<a title="a>b">x</a>');
    expect(text(required(diff.rows[0]), 'server')).toBe('<a title="a>b">');
  });

  it('collapses whitespace and drops whitespace-only text', () => {
    const diff = diffHtml('<div>\n   <p>a    b</p>\n</div>', '<div><p>a b</p></div>');
    expect(diff.identical).toBe(true);
  });

  it('keeps comment nodes, since a v-if placeholder is a real node', () => {
    const diff = diffHtml('<div><!----></div>', '<div></div>');
    const removed = diff.rows.filter((row) => row.status === 'removed');
    expect(removed.map((row) => text(row, 'server'))).toEqual(['  <!---->']);
  });

  it('marks a diff truncated instead of growing without bound', () => {
    const many = `<ul>${'<li>x</li>'.repeat(300)}</ul>`;
    const diff = diffHtml(many, many);
    expect(diff.truncated).toBe(true);
    expect(diff.rows.length).toBeLessThanOrEqual(400);
  });

  it('treats user content as plain text, never as markup to execute', () => {
    const diff = diffHtml('<p>&lt;img src=x onerror=alert(1)&gt;</p>', '<p>ok</p>');
    expect(diff.rows.some((row) => text(row, 'server')?.includes('onerror'))).toBe(true);
  });

  it('takes time proportional to the markup for a tag padded with a huge run of spaces', () => {
    // Stripping an attribute from a tag like this was quadratic in the run.
    const padded = `<div${' '.repeat(50_000)}class="x"${' '.repeat(50_000)}data-nhd-loc="a.vue:1:1">hi</div>`;
    const start = performance.now();
    const diff = diffHtml(padded, padded, { hideAttributes: ['data-nhd-loc'] });
    expect(performance.now() - start).toBeLessThan(200);
    expect(diff.identical).toBe(true);
    expect(text(required(diff.rows[0]), 'server')).toBe('<div class="x">');
  });
});
