import { describe, expect, it } from 'vitest';
import type { DiagnosticResult } from '../../../src/runtime/domain/diagnostic';
import { diagnoseIssue, MIN_CONFIDENCE } from '../../../src/runtime/engine/diagnostics';
import { required } from '../../support/required';
import { makeContext, makeIssue, textMismatch } from '../../support/issue';

/** Diagnoses a text mismatch between `server` and `client`. */
function diagnoseText(server: string, client: string, extra = {}): readonly DiagnosticResult[] {
  return diagnoseIssue(makeIssue({ ...textMismatch(server, client), ...extra }), makeContext());
}

function only(results: readonly DiagnosticResult[], category: DiagnosticResult['category']) {
  return required(
    results.find((result) => result.category === category),
    `a ${category} result`,
  );
}

describe('non-deterministic values', () => {
  it('recognises two timestamps a few seconds apart as the current time', () => {
    const result = only(
      diagnoseText('2026-11-06T10:00:00.000Z', '2026-11-06T10:00:03.000Z'),
      'non-deterministic-value',
    );
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
    expect(result.title).toContain('current time');
    expect(result.fix?.code).toContain("useState('now'");
    expect(result.evidence[0]).toContain('2026-11-06T10:00:03');
  });

  it('recognises epoch milliseconds', () => {
    const result = only(
      diagnoseText('Now: 1762423200000', 'Now: 1762423200450'),
      'non-deterministic-value',
    );
    expect(result.title).toContain('current time');
  });

  it('recognises local times that differ by whole hours as a time zone problem', () => {
    const result = only(
      diagnoseText('2026-11-06 10:00', '2026-11-06 17:00'),
      'non-deterministic-value',
    );
    expect(result.title).toContain('time zone');
    expect(result.fix?.code).toContain('timeZone');
  });

  it('recognises the same instant written with different UTC offsets', () => {
    const result = only(
      diagnoseText('2026-11-06T10:00:00+00:00', '2026-11-06T17:00:00+07:00'),
      'non-deterministic-value',
    );
    expect(result.title).toContain('time zone');
    expect(result.evidence[0]).toContain('different UTC offsets');
  });

  it('recognises a 12-hour clock against a 24-hour one as a locale problem', () => {
    const result = only(diagnoseText('3:04 PM', '15:04'), 'non-deterministic-value');
    expect(result.title).toContain('format');
    expect(result.fix?.code).toContain("'en-US'");
  });

  it('recognises day/month order differences as a locale problem', () => {
    const result = only(diagnoseText('11/6/2026', '06/11/2026'), 'non-deterministic-value');
    expect(result.title).toContain('format');
  });

  it('recognises two different UUIDs', () => {
    const result = only(
      diagnoseText(
        'id 3f2b8c1e-1a2b-4c3d-8e4f-0123456789ab',
        'id 9a8b7c6d-5e4f-4a3b-9c2d-ba9876543210',
      ),
      'non-deterministic-value',
    );
    expect(result.title).toContain('random');
    expect(result.fix?.code).toContain('useId');
  });

  it('recognises a long random-looking decimal', () => {
    const result = only(diagnoseText('0.482913', '0.117245'), 'non-deterministic-value');
    expect(result.title).toContain('random');
  });

  it('stays quiet for ordinary text and plain numbers that differ', () => {
    expect(diagnoseText('Hello', 'Hallo')).toEqual([]);
    expect(diagnoseText('Items: 3', 'Items: 4')).toEqual([]);
  });

  it('finds a random value in the component code, with less confidence than a visible symptom', () => {
    const source = 'setup() {\n  const id = Math.random();\n  return { id };\n}';
    const fromSource = only(
      diagnoseIssue(makeIssue({ componentSource: source }), makeContext()),
      'non-deterministic-value',
    );
    expect(fromSource.confidence).toBe(0.55);
    expect(fromSource.evidence[0]).toContain('const id = Math.random();');

    const both = only(
      diagnoseText('0.482913', '0.117245', { componentSource: source }),
      'non-deterministic-value',
    );
    expect(both.confidence).toBeGreaterThan(0.9);
  });

  it('ignores clock reads that only run in onMounted', () => {
    const source = 'setup() {\n  onMounted(() => {\n    now.value = Date.now();\n  });\n}';
    expect(diagnoseIssue(makeIssue({ componentSource: source }), makeContext())).toEqual([]);
  });

  it('flags toLocaleString without a time zone but not with one', () => {
    const risky = 'setup() { return () => date.toLocaleString("en-US"); }';
    const safe = "setup() { return () => date.toLocaleString('en-US', { timeZone: 'UTC' }); }";
    expect(
      only(
        diagnoseIssue(makeIssue({ componentSource: risky }), makeContext()),
        'non-deterministic-value',
      ).title,
    ).toContain('time zone');
    expect(diagnoseIssue(makeIssue({ componentSource: safe }), makeContext())).toEqual([]);
  });
});

describe('browser globals', () => {
  const widthContext = makeContext({
    browserValues: [{ source: 'window.innerWidth', value: '1280' }],
  });

  it('recognises client text that contains the live value of a browser global', () => {
    const issue = makeIssue(textMismatch('Width: 0', 'Width: 1280'));
    const result = only(diagnoseIssue(issue, widthContext), 'browser-global-leak');
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    expect(result.evidence[0]).toContain('window.innerWidth');
    expect(result.fix?.code).toContain('onMounted');
  });

  it('is more certain about a long distinctive value than a short number', () => {
    const agent = 'Mozilla/5.0 (X11; Linux x86_64) Test/1.0';
    const long = only(
      diagnoseIssue(
        makeIssue(textMismatch('UA: unknown', `UA: ${agent}`)),
        makeContext({ browserValues: [{ source: 'navigator.userAgent', value: agent }] }),
      ),
      'browser-global-leak',
    );
    const short = only(
      diagnoseIssue(makeIssue(textMismatch('Width: 0', 'Width: 1280')), widthContext),
      'browser-global-leak',
    );
    expect(long.confidence).toBeGreaterThan(short.confidence);
    expect(long.fix?.code).toContain('useRequestHeaders');
  });

  it('picks the fix that matches the kind of global', () => {
    const storage = only(
      diagnoseIssue(
        makeIssue(textMismatch('Theme: light', 'Theme: solarized-dark')),
        makeContext({
          browserValues: [{ source: 'localStorage["theme"]', value: 'solarized-dark' }],
        }),
      ),
      'browser-global-leak',
    );
    expect(storage.fix?.code).toContain("useCookie('theme'");
    expect(storage.evidence[0]).toContain('localStorage["theme"]');

    const location = only(
      diagnoseIssue(
        makeIssue(textMismatch('Page: /', 'Page: https://example.test/a?b=1#frag')),
        makeContext({
          browserValues: [
            { source: 'window.location.href', value: 'https://example.test/a?b=1#frag' },
          ],
        }),
      ),
      'browser-global-leak',
    );
    expect(location.fix?.code).toContain('useRoute');
  });

  it('ignores values too short to be meaningful and values the server also rendered', () => {
    const tiny = makeContext({ browserValues: [{ source: 'window.scrollY', value: '0' }] });
    expect(diagnoseIssue(makeIssue(textMismatch('Count 0', 'Count 10')), tiny)).toEqual([]);
    expect(
      diagnoseIssue(makeIssue(textMismatch('Width: 1280 (guess)', 'Width: 1280')), widthContext),
    ).toEqual([]);
  });

  it('matches whole tokens only', () => {
    expect(diagnoseIssue(makeIssue(textMismatch('Id: 0', 'Id: 912805')), widthContext)).toEqual([]);
  });

  it('finds an unguarded browser global in the component code', () => {
    const source = 'setup() {\n  const width = ref(window.innerWidth);\n  return { width };\n}';
    const result = only(
      diagnoseIssue(makeIssue({ componentSource: source }), makeContext()),
      'browser-global-leak',
    );
    expect(result.confidence).toBe(0.65);
    expect(result.evidence[0]).toContain('window');
    expect(result.evidence[0]).toContain('const width = ref(window.innerWidth);');
  });

  it('does not flag globals used inside onMounted, inside strings or after typeof', () => {
    const source = [
      'setup() {',
      '  const note = "uses window.innerWidth";',
      "  if (typeof window !== 'undefined') { /* guarded */ }",
      '  onMounted(() => { width.value = window.innerWidth; });',
      '}',
    ].join('\n');
    expect(diagnoseIssue(makeIssue({ componentSource: source }), makeContext())).toEqual([]);
  });
});

describe('invalid HTML nesting', () => {
  it('finds a block element inside a <p> within the markup', () => {
    const result = only(
      diagnoseIssue(
        makeIssue({
          kind: 'children-mismatch',
          serverHtml: '<p></p><div>x</div><p></p>',
          clientHtml: '<p><div>x</div></p>',
        }),
        makeContext(),
      ),
      'invalid-html-nesting',
    );
    expect(result.confidence).toBe(0.95);
    expect(result.evidence[0]).toContain('<div> inside <p>');
    expect(result.fix?.code).toContain('<div>');
  });

  it('uses the ancestors: a component whose root <div> sits inside a <p>', () => {
    const result = only(
      diagnoseIssue(
        makeIssue({
          kind: 'node-mismatch',
          ancestry: ['html', 'body', 'main', 'p'],
          clientHtml: '<div>x</div>',
          serverHtml: null,
        }),
        makeContext(),
      ),
      'invalid-html-nesting',
    );
    expect(result.confidence).toBe(0.9);
    expect(result.evidence[0]).toContain('<div> inside <p>');
  });

  it('finds a <tr> placed directly in a <table> and suggests <tbody>', () => {
    const result = only(
      diagnoseIssue(
        makeIssue({ kind: 'children-mismatch', clientHtml: '<table><tr><td>x</td></tr></table>' }),
        makeContext(),
      ),
      'invalid-html-nesting',
    );
    expect(result.evidence[0]).toContain('<tbody>');
    expect(result.fix?.code).toContain('<tbody>');
  });

  it('finds cells without a row, stray content in a table, and text in a table', () => {
    const cell = diagnoseIssue(
      makeIssue({
        kind: 'children-mismatch',
        clientHtml: '<table><tbody><td>x</td></tbody></table>',
      }),
      makeContext(),
    );
    expect(only(cell, 'invalid-html-nesting').evidence[0]).toContain('<tr>');

    const stray = diagnoseIssue(
      makeIssue({
        kind: 'children-mismatch',
        clientHtml: '<table><tbody><div>x</div></tbody></table>',
      }),
      makeContext(),
    );
    expect(only(stray, 'invalid-html-nesting').evidence[0]).toContain('move it out of the table');

    const text = diagnoseIssue(
      makeIssue({ kind: 'children-mismatch', clientHtml: '<table><tbody>loose</tbody></table>' }),
      makeContext(),
    );
    expect(only(text, 'invalid-html-nesting').evidence[0]).toContain('Text directly inside');
  });

  it('finds a link inside a link and a form inside a form', () => {
    for (const html of ['<a href="/a"><a href="/b">x</a></a>', '<form><form></form></form>']) {
      const result = only(
        diagnoseIssue(makeIssue({ kind: 'children-mismatch', clientHtml: html }), makeContext()),
        'invalid-html-nesting',
      );
      expect(result.evidence[0]).toContain('not allow');
    }
  });

  it('is less sure when the mismatch is not structural', () => {
    const result = only(
      diagnoseIssue(
        makeIssue({ kind: 'text-mismatch', clientHtml: '<p><div>x</div></p>' }),
        makeContext(),
      ),
      'invalid-html-nesting',
    );
    expect(result.confidence).toBe(0.7);
  });

  it.each([
    ['inline content in a paragraph', ['p'], '<span>x</span><a href="/">y</a><strong>z</strong>'],
    ['a list', [], '<ul><li>a</li><li>b</li></ul>'],
    [
      'a well-formed table',
      [],
      '<table><thead><tr><th>h</th></tr></thead><tbody><tr><td>x</td></tr></tbody></table>',
    ],
    [
      'a block inside a table cell inside a paragraph',
      ['p', 'table', 'tbody', 'tr', 'td'],
      '<div>x</div>',
    ],
    ['void elements', ['p'], 'a<br>b<img src="x.png">'],
    ['siblings after a closed paragraph', [], '<p>a</p><div>b</div>'],
  ])('reports nothing for %s', (_label, ancestry, html) => {
    expect(
      diagnoseIssue(
        makeIssue({ kind: 'children-mismatch', ancestry, clientHtml: html }),
        makeContext(),
      ),
    ).toEqual([]);
  });
});

describe('state desynchronisation', () => {
  const counter = { store: 'useState' as const, key: 'counter', before: '0', after: '5' };

  it('links a changed useState to the differing text', () => {
    const result = only(
      diagnoseIssue(
        makeIssue(textMismatch('Count: 0', 'Count: 5')),
        makeContext({ stateChanges: [counter] }),
      ),
      'state-desynchronization',
    );
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    expect(result.evidence[0]).toContain('useState("counter")');
    expect(result.fix?.code).toContain("useState('counter'");
    expect(result.fix?.code).toContain('onMounted');
  });

  it('never prints the state values', () => {
    const secret = {
      store: 'useState' as const,
      key: 'token',
      before: '"abc-old"',
      after: '"xyz-new"',
    };
    const result = only(
      diagnoseIssue(
        makeIssue(textMismatch('Token: abc-old', 'Token: xyz-new')),
        makeContext({ stateChanges: [secret] }),
      ),
      'state-desynchronization',
    );
    expect(JSON.stringify(result)).not.toContain('xyz-new');
    expect(JSON.stringify(result)).not.toContain('abc-old');
  });

  it('treats a change that does not explain the text as a weak lead', () => {
    const result = only(
      diagnoseIssue(
        makeIssue(textMismatch('Hello', 'Hallo')),
        makeContext({ stateChanges: [counter] }),
      ),
      'state-desynchronization',
    );
    expect(result.confidence).toBeLessThan(0.5);
    expect(result.confidence).toBeGreaterThanOrEqual(MIN_CONFIDENCE);
  });

  it('suggests a store fix for Pinia entries', () => {
    const result = only(
      diagnoseIssue(
        makeIssue(textMismatch('Items: 0', 'Items: 3')),
        makeContext({
          stateChanges: [{ store: 'pinia', key: 'cart.items', before: '0', after: '3' }],
        }),
      ),
      'state-desynchronization',
    );
    expect(result.evidence[0]).toContain('Pinia store “cart.items”');
    expect(result.fix?.code).toContain('store.items');
    expect(result.fix?.code).toContain('"cart"');
  });

  it('says nothing when no state changed', () => {
    expect(diagnoseText('a', 'b')).toEqual([]);
  });
});

describe('diagnoseIssue', () => {
  it('returns the most confident result first', () => {
    const issue = makeIssue({
      kind: 'children-mismatch',
      clientHtml: '<p><div>0.482913</div></p>',
      serverHtml: '<p></p><div>0.117245</div><p></p>',
    });
    const results = diagnoseIssue(issue, makeContext());
    const confidences = results.map((result) => result.confidence);
    expect(confidences).toEqual([...confidences].sort((a, b) => b - a));
    expect(results[0]?.category).toBe('invalid-html-nesting');
  });

  it('skips the categories the user disabled', () => {
    const issue = makeIssue(textMismatch('0.482913', '0.117245'));
    expect(diagnoseIssue(issue, makeContext())).toHaveLength(1);
    expect(
      diagnoseIssue(issue, makeContext({ disabledCategories: ['non-deterministic-value'] })),
    ).toEqual([]);
  });

  it('drops results below the minimum confidence', () => {
    const weak = makeContext({
      stateChanges: [{ store: 'useState', key: 'k', before: '1', after: '2' }],
    });
    for (const result of diagnoseIssue(makeIssue(textMismatch('x', 'y')), weak)) {
      expect(result.confidence).toBeGreaterThanOrEqual(MIN_CONFIDENCE);
    }
  });

  it('skips a failing rule without losing the others', () => {
    const hostile = makeIssue({
      kind: 'children-mismatch',
      clientHtml: '<p><div>x</div></p>',
    });
    Object.defineProperty(hostile, 'componentSource', {
      get() {
        throw new Error('exploding getter');
      },
    });
    const results = diagnoseIssue(hostile, makeContext());
    expect(results.map((result) => result.category)).toEqual(['invalid-html-nesting']);
  });

  it('gives every result an explanation, evidence and a copy-pasteable fix', () => {
    const results = [
      ...diagnoseText('0.482913', '0.117245'),
      ...diagnoseIssue(
        makeIssue({ kind: 'children-mismatch', clientHtml: '<p><div>x</div></p>' }),
        makeContext(),
      ),
    ];
    expect(results.length).toBeGreaterThan(1);
    for (const result of results) {
      expect(result.explanation.length).toBeGreaterThan(40);
      expect(result.evidence.length).toBeGreaterThan(0);
      expect(result.fix?.code.length).toBeGreaterThan(20);
      expect(result.confidence).toBeLessThanOrEqual(0.97);
    }
  });
});
