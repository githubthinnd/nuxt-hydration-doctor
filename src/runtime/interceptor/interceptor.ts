import type { ComponentPublicInstance } from 'vue';
import type { HydrationDoctorApi } from '../domain/api';
import type { HydrationIssue } from '../domain/issue';
import { parseSourceLocation } from '../domain/location';
import { createIssueStore } from './issue-store';
import { asElement, closestStamped, occurrenceIndex, pickOffendingElement } from './locate';
import { parseHydrationWarning, type ParsedHydrationWarning } from './parse-warning';
import type { ServerSnapshot } from './snapshot';

/** Longest markup stored per side of a diff; anything beyond is cut so a huge subtree stays cheap. */
const MAX_HTML_CHARS = 20_000;

export interface InterceptorDeps {
  readonly document: Document;
  /** Attribute written by the AST injector. */
  readonly attribute: string;
  readonly historyLimit: number;
  /** Pristine server markup captured before hydration; null when unavailable. */
  readonly snapshot: ServerSnapshot | null;
  readonly getRoute: () => string;
  readonly now: () => number;
  readonly sinceNavigationStart: () => number | null;
  /** Runs `task` once Vue has finished patching the current update. */
  readonly schedule: (task: () => void) => void;
  /** Receives the module's own failures; must never throw. */
  readonly reportInternal: (message: string, error: unknown) => void;
}

export interface Interceptor {
  /** Feed Vue's `warnHandler` arguments in. Returns true when the warning was a hydration one. */
  handleWarning(message: string, instance: ComponentPublicInstance | null, trace: string): boolean;
  /** Feed `vue:error` in. Returns true when the error was a hydration one. */
  handleError(error: unknown, instance: ComponentPublicInstance | null, info: string): boolean;
  /** The initial mount finished: Vue has patched every mismatch, so captures can be completed. */
  markMounted(): void;
  /** Completes every pending capture now. */
  flush(): void;
  readonly api: HydrationDoctorApi;
}

interface PendingCapture {
  readonly warning: ParsedHydrationWarning;
  readonly message: string;
  readonly route: string;
  readonly componentName: string | null;
  readonly breadcrumbs: readonly string[];
  readonly detectedAt: number;
  readonly msSinceNavigationStart: number | null;
  /**
   * Reads the component's root elements lazily. During a node mismatch Vue has not created the
   * client element yet when it warns, so they are only resolved at flush time, after patching.
   */
  readonly resolveRoots: () => readonly Element[];
  /** Compiled component code, read when the warning arrives (before anything is patched). */
  readonly componentSource: string | null;
}

function truncate(html: string): string {
  return html.length > MAX_HTML_CHARS ? `${html.slice(0, MAX_HTML_CHARS)}…` : html;
}

function componentNameOf(instance: ComponentPublicInstance | null): string | null {
  if (instance === null) return null;
  const options = instance.$options as unknown as Readonly<Record<string, unknown>>;
  const name = options['name'] ?? options['__name'];
  return typeof name === 'string' && name !== '' ? name : null;
}

/** Longest component source kept; more than this is not going to help a heuristic. */
const MAX_SOURCE_CHARS = 30_000;
/** Options of a component whose function bodies hold the code that runs while rendering. */
const SOURCE_OPTIONS = ['setup', 'data', 'created', 'beforeMount', 'render'] as const;

/**
 * The code of the component being hydrated, as the browser holds it: Vue compiled the
 * `<script setup>` into a `setup` function and the template into a `render` function, and
 * `Function#toString` returns their text. This is how the source heuristics see the component
 * without any server round trip.
 */
function componentSourceOf(instance: ComponentPublicInstance | null): string | null {
  if (instance === null) return null;
  const parts: string[] = [];
  try {
    const type = instance.$.type as unknown as Readonly<Record<string, unknown>>;
    for (const option of SOURCE_OPTIONS) {
      const member = type[option];
      if (typeof member === 'function') parts.push(`// ${option}\n${member.toString()}`);
    }
  } catch {
    // An unusual instance (a proxy that throws, say) must not cost us the warning itself.
    return null;
  }
  if (parts.length === 0) return null;
  const source = parts.join('\n\n');
  return source.length > MAX_SOURCE_CHARS ? source.slice(0, MAX_SOURCE_CHARS) : source;
}

/** Deepest vnode tree walked looking for root elements; real component trees are far shallower. */
const MAX_ROOT_DEPTH = 8;
const MAX_ROOTS = 20;

/** Adds the elements that make up `vnode` (a component, a fragment or an element) to `out`. */
function collectRootElements(vnode: unknown, out: Element[], depth: number): void {
  if (depth > MAX_ROOT_DEPTH || out.length >= MAX_ROOTS) return;
  if (typeof vnode !== 'object' || vnode === null) return;
  const node = vnode as Readonly<Record<string, unknown>>;
  const el = node['el'];
  if (typeof el === 'object' && el !== null && (el as Partial<Node>).nodeType === 1) {
    out.push(el as Element);
    return;
  }
  // A component vnode owns a subtree; a fragment vnode owns an array of child vnodes.
  const component = node['component'];
  if (typeof component === 'object' && component !== null) {
    collectRootElements(
      (component as Readonly<Record<string, unknown>>)['subTree'],
      out,
      depth + 1,
    );
  }
  const children = node['children'];
  if (Array.isArray(children)) {
    for (const child of children as unknown[]) collectRootElements(child, out, depth + 1);
  }
}

/**
 * The elements a component renders at its top level. A component with one root element has it in
 * `$el`. A component with several roots (a fragment) has a text anchor there, and the anchor's
 * parent belongs to whoever uses the component, so the roots are found in its vnode tree instead.
 * Without that the report would name the caller's element, file and markup.
 */
function rootElementsOf(instance: ComponentPublicInstance | null): readonly Element[] {
  if (instance === null) return [];
  try {
    // `$el` is typed `any` by Vue; it is narrowed here.
    const el: unknown = instance.$el;
    if (typeof el === 'object' && el !== null && (el as Partial<Node>).nodeType === 1) {
      return [el as Element];
    }
    const roots: Element[] = [];
    collectRootElements(instance.$.subTree, roots, 0);
    if (roots.length > 0) return roots;
    // Nothing found (an empty render, say): the old behaviour, the anchor's parent.
    const fallback = asElement(el);
    return fallback === null ? [] : [fallback];
  } catch {
    return [];
  }
}

/** Tag names from the root down to (not including) `element`. */
function ancestryOf(element: Element | null): string[] {
  const tags: string[] = [];
  for (
    let current = element?.parentElement ?? null;
    current !== null;
    current = current.parentElement
  ) {
    tags.unshift(current.localName);
  }
  return tags;
}

/** Component names from Vue's trace (`at <Inner>\n at <Outer>`), outermost first. */
function componentChain(trace: string): string[] {
  return [...trace.matchAll(/at <([^\s>]+)/g)].flatMap((match) => match[1] ?? []).reverse();
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : '';
}

/**
 * Turns Vue's hydration warnings into {@link HydrationIssue}s.
 *
 * Capture is two-step on purpose. When the warning arrives the DOM is mid-hydration: the message
 * and the component are known, but the client element may not exist yet. The interceptor records
 * those facts immediately and finishes the issue (element, location, markup) after Vue has
 * patched, so `clientHtml` shows what the client really rendered and the stamp it reads is the
 * client's own. The server side comes from the pre-hydration snapshot, because the warning text
 * cannot be trusted to contain markup (real browsers stringify DOM nodes as `[object …]`).
 *
 * Nothing here throws into Vue: callers wrap it, and each capture is completed in isolation.
 */
export function createInterceptor(deps: InterceptorDeps): Interceptor {
  const store = createIssueStore(deps.historyLimit, (error) => {
    deps.reportInternal('an issue subscriber threw', error);
  });
  let pending: PendingCapture[] = [];
  let mounted = false;
  let counter = 0;

  function complete(capture: PendingCapture): HydrationIssue {
    const roots = capture.resolveRoots();
    const root = roots[0] ?? null;
    const offending =
      root === null ? null : pickOffendingElement(roots, deps.attribute, capture.warning);
    const stamped = offending ?? closestStamped(root, deps.attribute);
    const stamp = stamped?.getAttribute(deps.attribute) ?? null;

    let serverHtml: string | null = null;
    let occurrence: number | null = null;
    if (stamped !== null && stamp !== null) {
      occurrence = Math.max(occurrenceIndex(deps.document, stamped, deps.attribute, stamp), 0);
      if (deps.snapshot !== null) {
        serverHtml = deps.snapshot.findHtml(deps.attribute, stamp, occurrence);
      }
    }
    const clientElement = stamped ?? root;

    counter += 1;
    return {
      id: `nhd-${String(counter)}`,
      kind: capture.warning.kind,
      message: capture.message,
      route: capture.route,
      componentName: capture.componentName,
      location: stamp === null ? null : parseSourceLocation(stamp),
      occurrence: stamp === null ? null : occurrence,
      serverHtml: serverHtml === null ? null : truncate(serverHtml),
      clientHtml: clientElement === null ? null : truncate(clientElement.outerHTML),
      ancestry: ancestryOf(clientElement),
      componentSource: capture.componentSource,
      breadcrumbs: capture.breadcrumbs,
      metrics: {
        detectedAt: capture.detectedAt,
        msSinceNavigationStart: capture.msSinceNavigationStart,
      },
    };
  }

  function flush(): void {
    const batch = pending;
    pending = [];
    const seen = new Set<string>();
    for (const capture of batch) {
      // Vue can report one mismatch twice (as a warning and as an error): keep the first.
      const key = `${capture.warning.kind}|${capture.message}|${capture.componentName ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      try {
        store.add(complete(capture));
      } catch (error) {
        deps.reportInternal('could not complete a hydration capture', error);
      }
    }
  }

  function record(
    message: string,
    instance: ComponentPublicInstance | null,
    chain: readonly string[],
  ): boolean {
    const warning = parseHydrationWarning(message);
    if (warning === null) return false;

    pending.push({
      warning,
      message,
      route: deps.getRoute(),
      componentName: componentNameOf(instance),
      breadcrumbs: [
        `route ${deps.getRoute()}`,
        mounted ? 'after app:mounted' : 'during initial hydration',
        ...chain,
      ],
      componentSource: componentSourceOf(instance),
      detectedAt: deps.now(),
      msSinceNavigationStart: deps.sinceNavigationStart(),
      resolveRoots: () => rootElementsOf(instance),
    });
    if (mounted) deps.schedule(flush);
    return true;
  }

  return {
    handleWarning: (message, instance, trace) => record(message, instance, componentChain(trace)),
    handleError: (error, instance, info) => record(messageOf(error), instance, info ? [info] : []),
    markMounted() {
      mounted = true;
      deps.schedule(flush);
    },
    flush,
    api: store,
  };
}
