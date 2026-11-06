import { DIAGNOSTIC_CATEGORIES, type DiagnosticResult, type FixSuggestion } from './diagnostic';
import { MISMATCH_KINDS, type HydrationIssue } from './issue';

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

/**
 * The size limits of a report. The server enforces them (`parseHydrationReport`) and the browser
 * trims to them (`fitReport`), so one table decides what a valid report is and a page with a long
 * URL or a long text can never produce a report the server would refuse.
 */
const LIMITS = {
  pageLoadId: 64,
  id: 64,
  message: 5000,
  route: 2000,
  componentName: 200,
  html: 25_000,
  file: 500,
  tag: 50,
  tags: 64,
  breadcrumb: 300,
  breadcrumbs: 64,
  title: 300,
  explanation: 2000,
  evidenceItem: 600,
  evidence: 12,
  diagnostics: 8,
  fixDescription: 600,
  fixCode: 8000,
} as const;

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
  const description = text(value['description'], LIMITS.fixDescription);
  const code = text(value['code'], LIMITS.fixCode);
  if ((language !== 'vue' && language !== 'ts') || description === null || code === null) {
    return undefined;
  }
  return { language, description, code };
}

function parseDiagnostic(value: unknown): DiagnosticResult | null {
  if (!isObject(value)) return null;
  const category = DIAGNOSTIC_CATEGORIES.find((known) => known === value['category']);
  const confidence = value['confidence'];
  const title = text(value['title'], LIMITS.title);
  const explanation = text(value['explanation'], LIMITS.explanation);
  const evidence = textList(value['evidence'], LIMITS.evidence, LIMITS.evidenceItem);
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
  const kind = MISMATCH_KINDS.find((known) => known === value['kind']);
  const id = text(value['id'], LIMITS.id);
  const message = text(value['message'], LIMITS.message);
  const route = text(value['route'], LIMITS.route);
  const componentName = nullableText(value['componentName'], LIMITS.componentName);
  const serverHtml = nullableText(value['serverHtml'], LIMITS.html);
  const clientHtml = nullableText(value['clientHtml'], LIMITS.html);
  const ancestry = textList(value['ancestry'], LIMITS.tags, LIMITS.tag);
  const breadcrumbs = textList(value['breadcrumbs'], LIMITS.breadcrumbs, LIMITS.breadcrumb);
  const metrics = value['metrics'];
  const rawLocation = value['location'];
  const rawOccurrence = value['occurrence'];

  let location: HydrationIssue['location'] = null;
  if (rawLocation !== null) {
    if (!isObject(rawLocation)) return null;
    const file = text(rawLocation['file'], LIMITS.file);
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
  const pageLoadId = text(value['pageLoadId'], LIMITS.pageLoadId);
  if (pageLoadId === null || !/^[\w-]+$/.test(pageLoadId)) return null;
  const issue = parseIssue(value['issue']);
  const rawDiagnostics = value['diagnostics'];
  if (
    issue === null ||
    !Array.isArray(rawDiagnostics) ||
    rawDiagnostics.length > LIMITS.diagnostics
  ) {
    return null;
  }
  const items: unknown[] = rawDiagnostics;
  const diagnostics = items.flatMap((item) => parseDiagnostic(item) ?? []);
  if (diagnostics.length !== items.length) return null;
  return { pageLoadId, issue, diagnostics };
}

const clip = (value: string, max: number): string =>
  value.length > max ? value.slice(0, max) : value;
const clipOrNull = (value: string | null, max: number): string | null =>
  value === null ? null : clip(value, max);

/**
 * Trims a report to the limits `parseHydrationReport` enforces, so that it is accepted however
 * long its URL, message or markup is. Strings are cut, lists keep their most relevant end (the
 * nearest ancestors, the first breadcrumbs), and nothing else about the report changes. The
 * structure is the caller's responsibility; this only deals with size.
 */
export function fitReport(report: HydrationReport): HydrationReport {
  const { issue } = report;
  return {
    pageLoadId: clip(report.pageLoadId, LIMITS.pageLoadId),
    issue: {
      ...issue,
      id: clip(issue.id, LIMITS.id),
      message: clip(issue.message, LIMITS.message),
      route: clip(issue.route, LIMITS.route),
      componentName: clipOrNull(issue.componentName, LIMITS.componentName),
      location:
        issue.location === null
          ? null
          : { ...issue.location, file: clip(issue.location.file, LIMITS.file) },
      serverHtml: clipOrNull(issue.serverHtml, LIMITS.html),
      clientHtml: clipOrNull(issue.clientHtml, LIMITS.html),
      // The nearest ancestors matter for nesting rules, so keep the end of the list.
      ancestry: issue.ancestry.slice(-LIMITS.tags).map((tag) => clip(tag, LIMITS.tag)),
      breadcrumbs: issue.breadcrumbs
        .slice(0, LIMITS.breadcrumbs)
        .map((crumb) => clip(crumb, LIMITS.breadcrumb)),
    },
    diagnostics: report.diagnostics.slice(0, LIMITS.diagnostics).map((diagnosis) => ({
      ...diagnosis,
      title: clip(diagnosis.title, LIMITS.title),
      explanation: clip(diagnosis.explanation, LIMITS.explanation),
      evidence: diagnosis.evidence
        .slice(0, LIMITS.evidence)
        .map((line) => clip(line, LIMITS.evidenceItem)),
      fix:
        diagnosis.fix === null
          ? null
          : {
              ...diagnosis.fix,
              description: clip(diagnosis.fix.description, LIMITS.fixDescription),
              code: clip(diagnosis.fix.code, LIMITS.fixCode),
            },
    })),
  };
}
