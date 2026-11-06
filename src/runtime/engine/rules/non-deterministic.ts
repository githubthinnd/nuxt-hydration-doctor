import type { DiagnosticResult, FixSuggestion } from '../../domain/diagnostic';
import { combineConfidence } from '../confidence';
import { findInServerCode } from '../source-scan';
import { clip, type Rule, type RuleInput } from './rule';

type Kind = 'date-now' | 'random' | 'timezone' | 'locale';

interface Signal {
  readonly kind: Kind;
  readonly probability: number;
  readonly evidence: string;
}

const MINUTE = 60_000;
const ISO = /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?/;
const HAS_ZONE = /(?:Z|[+-]\d{2}:?\d{2})$/;
const EPOCH_MS = /\b1\d{12}\b/;
const CLOCK = /\b(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?/i;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const RANDOM_DECIMAL = /^-?(?:0?\.\d{4,}|\d+\.\d{6,})$/;
const SHORT_ID = /^(?=[a-z0-9_-]*\d)(?=[a-z0-9_-]*[a-z])[a-z0-9_-]{8,}$/i;
const NUMERIC_DATE = /\b\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}\b/;
const MONTH_NAME = /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i;

function minutesOfDay(clock: RegExpExecArray): number {
  let hours = Number(clock[1]);
  const meridiem = clock[3]?.toUpperCase();
  if (meridiem === 'PM' && hours < 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  return hours * 60 + Number(clock[2]);
}

function textSignals(server: string, client: string): Signal[] {
  const found: Signal[] = [];
  const both = `server “${clip(server)}”, client “${clip(client)}”`;

  const epochServer = EPOCH_MS.exec(server)?.[0];
  const epochClient = EPOCH_MS.exec(client)?.[0];
  if (epochServer !== undefined && epochClient !== undefined && epochServer !== epochClient) {
    const delta = Math.abs(Number(epochServer) - Number(epochClient));
    if (delta < 10 * MINUTE) {
      found.push({
        kind: 'date-now',
        probability: 0.9,
        evidence: `Two timestamps ${String(delta)} ms apart: the page rendered the current time twice (${both}).`,
      });
    }
  }

  const isoServer = ISO.exec(server)?.[0];
  const isoClient = ISO.exec(client)?.[0];
  if (isoServer !== undefined && isoClient !== undefined && isoServer !== isoClient) {
    const delta = Math.abs(Date.parse(isoServer) - Date.parse(isoClient));
    if (delta === 0) {
      found.push({
        kind: 'timezone',
        probability: 0.9,
        evidence: `The same instant is written with different UTC offsets (${both}).`,
      });
    } else if (delta < 10 * MINUTE) {
      found.push({
        kind: 'date-now',
        probability: 0.9,
        evidence: `Two ISO dates a few seconds apart: the current time was rendered twice (${both}).`,
      });
    } else if (
      delta % (15 * MINUTE) === 0 &&
      delta <= 26 * 60 * MINUTE &&
      !HAS_ZONE.test(isoServer) &&
      !HAS_ZONE.test(isoClient)
    ) {
      found.push({
        kind: 'timezone',
        probability: 0.85,
        evidence: `The two times differ by exactly ${String(delta / MINUTE / 60)} h: the server and the browser use different time zones (${both}).`,
      });
    }
  }

  const clockServer = CLOCK.exec(server);
  const clockClient = CLOCK.exec(client);
  if (clockServer !== null && clockClient !== null && server !== client) {
    const raw = Math.abs(minutesOfDay(clockServer) - minutesOfDay(clockClient));
    const delta = Math.min(raw, 1440 - raw);
    if (delta === 0) {
      found.push({
        kind: 'locale',
        probability: 0.7,
        evidence: `The same time of day is formatted differently, e.g. 12-hour vs 24-hour (${both}).`,
      });
    } else if (delta <= 10) {
      found.push({
        kind: 'date-now',
        probability: 0.8,
        evidence: `Two clock times ${String(delta)} min apart: the current time was rendered twice (${both}).`,
      });
    } else if (delta % 15 === 0) {
      found.push({
        kind: 'timezone',
        probability: 0.75,
        evidence: `The clock times differ by ${String(delta / 60)} h: different time zones (${both}).`,
      });
    }
  }

  if (
    isoServer === undefined &&
    server !== client &&
    ((NUMERIC_DATE.test(server) && NUMERIC_DATE.test(client)) ||
      (MONTH_NAME.test(server) && MONTH_NAME.test(client)))
  ) {
    found.push({
      kind: 'locale',
      probability: 0.7,
      evidence: `A date is formatted differently by the server and the browser (${both}).`,
    });
  }

  const uuidServer = UUID.exec(server)?.[0];
  const uuidClient = UUID.exec(client)?.[0];
  if (uuidServer !== undefined && uuidClient !== undefined && uuidServer !== uuidClient) {
    found.push({
      kind: 'random',
      probability: 0.9,
      evidence: `Two different UUIDs: the id is generated on each side (${both}).`,
    });
  }
  if (RANDOM_DECIMAL.test(server.trim()) || RANDOM_DECIMAL.test(client.trim())) {
    if (server !== client) {
      found.push({
        kind: 'random',
        probability: 0.8,
        evidence: `A long random-looking decimal differs between the two renders (${both}).`,
      });
    }
  }
  if (
    SHORT_ID.test(server.trim()) &&
    SHORT_ID.test(client.trim()) &&
    server.trim().length === client.trim().length &&
    server !== client
  ) {
    found.push({
      kind: 'random',
      probability: 0.6,
      evidence: `Two ids of the same shape but different value, typical of a generated id (${both}).`,
    });
  }
  return found;
}

function sourceSignals(source: string): Signal[] {
  const found: Signal[] = [];
  const add = (kind: Kind, matches: ReturnType<typeof findInServerCode>, what: string): void => {
    for (const match of matches.slice(0, 2)) {
      found.push({
        kind,
        probability: match.topLevel ? 0.55 : 0.4,
        evidence: `${what} in code that runs on both the server and the client: \`${match.line}\``,
      });
    }
  };
  add(
    'random',
    findInServerCode(
      source,
      /\b(?:Math\.random|crypto\.randomUUID|crypto\.getRandomValues|nanoid|uuidv4)\s*\(/g,
    ),
    'A random value is generated',
  );
  add(
    'date-now',
    findInServerCode(source, /\bnew\s+Date\s*\(\s*\)|\bDate\.now\s*\(|\bperformance\.now\s*\(/g),
    'The current time is read',
  );
  add(
    'timezone',
    findInServerCode(source, /\.toLocale(?:Date|Time)?String\s*\(([^)]*)\)/g).filter(
      (match) => !match.text.includes('timeZone'),
    ),
    'A date is formatted with the runtime’s own locale and time zone',
  );
  return found;
}

const KIND_ORDER: readonly Kind[] = ['date-now', 'random', 'timezone', 'locale'];

const TITLE: Record<Kind, string> = {
  'date-now': 'The current time or date is rendered on both sides',
  random: 'A random or generated value is rendered on both sides',
  timezone: 'The server and the browser disagree on the time zone',
  locale: 'The server and the browser format the date differently',
};

const EXPLANATION: Record<Kind, string> = {
  'date-now':
    'The component reads the clock while rendering. The server renders at one instant and the browser hydrates at a later one, so the two texts can never match. Vue compares them and reports a mismatch.',
  random:
    'A new random or generated value is created on the server and again in the browser, so the two are different by construction.',
  timezone:
    'The same moment is formatted in the server’s time zone on one side and the visitor’s on the other, so the text differs for every visitor whose zone is not the server’s.',
  locale:
    'Dates and times are formatted with the default locale, which differs between the server runtime and the visitor’s browser (for example 12-hour vs 24-hour clocks, or day/month order).',
};

const FIX: Record<Kind, FixSuggestion> = {
  'date-now': {
    language: 'vue',
    description:
      'Compute the value once on the server and reuse it on the client. If it must tick live, update it in onMounted.',
    code: `<script setup lang="ts">
// useState is serialised into the server payload, so the client starts from the server's value.
const now = useState('now', () => Date.now())

// Optional: keep it live after hydration, when a different value can no longer cause a mismatch.
onMounted(() => {
  const timer = setInterval(() => { now.value = Date.now() }, 1000)
  onBeforeUnmount(() => clearInterval(timer))
})
</script>

<template>
  <time>{{ new Date(now).toISOString() }}</time>
</template>`,
  },
  random: {
    language: 'vue',
    description:
      'Use useId() for element ids, or generate the value once with useState so the server and client share it.',
    code: `<script setup lang="ts">
const id = useId() // identical on the server and the client (Vue 3.5+)
const token = useState('token', () => crypto.randomUUID()) // one value, sent to the client
</script>

<template>
  <label :for="id">Name</label>
  <input :id="id" :data-token="token">
</template>`,
  },
  timezone: {
    language: 'ts',
    description:
      'Pin the time zone (and locale) so the server and every browser produce the same text.',
    code: `const format = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC', // or the zone your product is in
  dateStyle: 'medium',
  timeStyle: 'short',
})
const label = format.format(date)

// To show the visitor's own zone instead, render it after hydration:
//   const label = ref(format.format(date))
//   onMounted(() => { label.value = date.toLocaleString() })`,
  },
  locale: {
    language: 'ts',
    description: 'Name the locale explicitly instead of relying on the runtime’s default.',
    code: `// Not this: date.toLocaleDateString()  (default locale differs per runtime)
const label = date.toLocaleDateString('en-US', { timeZone: 'UTC' })

// or format it yourself:
const iso = date.toISOString().slice(0, 10)`,
  },
};

export const nonDeterministicRule: Rule = {
  category: 'non-deterministic-value',
  run({ issue, changes }: RuleInput): DiagnosticResult | null {
    const signals: Signal[] = [];
    for (const change of changes) {
      if (change.server !== null && change.client !== null) {
        signals.push(...textSignals(change.server, change.client));
      }
    }
    if (issue.componentSource !== null) signals.push(...sourceSignals(issue.componentSource));
    if (signals.length === 0) return null;

    // The strongest explanation wins; ties go to the more common cause.
    const scored = KIND_ORDER.map((kind) => {
      const own = signals.filter((signal) => signal.kind === kind);
      return { kind, own, confidence: combineConfidence(own.map((s) => s.probability)) };
    }).filter((entry) => entry.own.length > 0);
    const best = scored.reduce((a, b) => (b.confidence > a.confidence ? b : a));

    return {
      category: 'non-deterministic-value',
      confidence: best.confidence,
      title: TITLE[best.kind],
      explanation: EXPLANATION[best.kind],
      evidence: best.own.map((signal) => signal.evidence),
      fix: FIX[best.kind],
    };
  },
};
