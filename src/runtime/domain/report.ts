import { DIAGNOSTIC_CATEGORIES, type DiagnosticResult, type FixSuggestion } from './diagnostic';
import type { HydrationIssue, HydrationMismatchKind } from './issue';

/**
 * What the browser sends to the dev server for the DevTools tab: one captured issue, the
 * diagnosis computed for it, and an id of the page load it came from (issue ids restart at every
 * page load, so on their own they would collide across reloads).
 */
export interface HydrationReport {
  readonly pageLoadId: string;
  readonly issue: HydrationIssue;
  readonly diagnostics: readonly DiagnosticResult[];
}

/** Longest request body the dev endpoint reads. A report is a few kilobytes of text. */
export const MAX_REPORT_BYTES: number = 256 * 1024;

const KINDS: readonly HydrationMismatchKind[] = [
  'text-mismatch',
  'node-mismatch',
  'children-mismatch',
];

type Json = Readonly<Record<string, unknown>>;

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.length <= max ? value : null;
}

/** An optional string: undefined means "invalid", null means "absent". */
function nullableText(value: unknown, max: number): string | null | undefined {
  if (value === null) return null;
  return text(value, max) ?? undefined;
}

function textList(value: unknown, maxItems: number, maxLength: number): string[] | null {
  if (!Array.isArray(value) || value.length > maxItems) return null;
  const items: unknown[] = value;
  const strings = items.flatMap((item) => text(item, maxLength) ?? []);
  return strings.length === items.length ? strings : null;
}

function integer(value: unknown, min: number): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min ? value : null;
}

function parseFix(value: unknown): FixSuggestion | null | undefined {
  if (value === null) return null;
  if (!isObject(value)) return undefined;
  const language = value['language'];
  const description = text(value['description'], 600);
  const code = text(value['code'], 8000);
  if ((language !== 'vue' && language !== 'ts') || description === null || code === null) {
    return undefined;
  }
  return { language, description, code };
}

function parseDiagnostic(value: unknown): DiagnosticResult | null {
  if (!isObject(value)) return null;
  const category = DIAGNOSTIC_CATEGORIES.find((known) => known === value['category']);
  const confidence = value['confidence'];
  const title = text(value['title'], 300);
  const explanation = text(value['explanation'], 2000);
  const evidence = textList(value['evidence'], 12, 600);
  const fix = parseFix(value['fix']);
  if (
    category === undefined ||
    typeof confidence !== 'number' ||
    !(confidence >= 0 && confidence <= 1) ||
    title === null ||
    explanation === null ||
    evidence === null ||
    fix === undefined
  ) {
    return null;
  }
  return { category, confidence, title, explanation, evidence, fix };
}

function parseIssue(value: unknown): HydrationIssue | null {
  if (!isObject(value)) return null;
  const kind = KINDS.find((known) => known === value['kind']);
  const id = text(value['id'], 64);
  const message = text(value['message'], 5000);
  const route = text(value['route'], 2000);
  const componentName = nullableText(value['componentName'], 200);
  const serverHtml = nullableText(value['serverHtml'], 25_000);
  const clientHtml = nullableText(value['clientHtml'], 25_000);
  const ancestry = textList(value['ancestry'], 64, 50);
  const breadcrumbs = textList(value['breadcrumbs'], 64, 300);
  const metrics = value['metrics'];
  const rawLocation = value['location'];
  const rawOccurrence = value['occurrence'];

  let location: HydrationIssue['location'] = null;
  if (rawLocation !== null) {
    if (!isObject(rawLocation)) return null;
    const file = text(rawLocation['file'], 500);
    const line = integer(rawLocation['line'], 1);
    const column = integer(rawLocation['column'], 1);
    if (file === null || line === null || column === null) return null;
    location = { file, line, column };
  }
  const occurrence = rawOccurrence === null ? null : integer(rawOccurrence, 0);

  if (
    kind === undefined ||
    id === null ||
    message === null ||
    route === null ||
    componentName === undefined ||
    serverHtml === undefined ||
    clientHtml === undefined ||
    ancestry === null ||
    breadcrumbs === null ||
    (rawOccurrence !== null && occurrence === null) ||
    !isObject(metrics) ||
    typeof metrics['detectedAt'] !== 'number' ||
    !Number.isFinite(metrics['detectedAt'])
  ) {
    return null;
  }
  const since = metrics['msSinceNavigationStart'];
  if (since !== null && (typeof since !== 'number' || !Number.isFinite(since))) return null;

  return {
    id,
    kind,
    message,
    route,
    componentName,
    location,
    occurrence,
    serverHtml,
    clientHtml,
    ancestry,
    // The component's code is large and is not needed outside the browser: never accepted.
    componentSource: null,
    breadcrumbs,
    metrics: { detectedAt: metrics['detectedAt'], msSinceNavigationStart: since },
  };
}

/**
 * Validates a report received over HTTP and rebuilds it from known fields only.
 *
 * The dev endpoint is reachable by anything that can reach the dev server, so the body is treated
 * as hostile: every field is type-checked and length-capped, unknown fields are dropped (the result
 * is a fresh object, never the parsed input), and nothing is trusted to be well-formed. Returns
 * null when anything is off.
 */
export function parseHydrationReport(value: unknown): HydrationReport | null {
  if (!isObject(value)) return null;
  const pageLoadId = text(value['pageLoadId'], 64);
  if (pageLoadId === null || !/^[\w-]+$/.test(pageLoadId)) return null;
  const issue = parseIssue(value['issue']);
  const rawDiagnostics = value['diagnostics'];
  if (issue === null || !Array.isArray(rawDiagnostics) || rawDiagnostics.length > 8) return null;
  const items: unknown[] = rawDiagnostics;
  const diagnostics = items.flatMap((item) => parseDiagnostic(item) ?? []);
  if (diagnostics.length !== items.length) return null;
  return { pageLoadId, issue, diagnostics };
}
