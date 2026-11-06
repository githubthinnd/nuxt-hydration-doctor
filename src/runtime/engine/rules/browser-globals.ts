import type { DiagnosticResult, FixSuggestion } from '../../domain/diagnostic';
import { combineConfidence } from '../confidence';
import { findInServerCode } from '../source-scan';
import { clip, type Rule, type RuleInput } from './rule';

type Family = 'storage' | 'navigator' | 'location' | 'viewport' | 'document';

/** Values this short appear in text by coincidence too, so a match proves less. */
const SHORT_VALUE = 5;

function familyOf(name: string): Family {
  if (/^(?:localStorage|sessionStorage)/.test(name)) return 'storage';
  if (/^(?:window\.)?navigator/.test(name)) return 'navigator';
  if (/^(?:window\.)?location|^document\.(?:referrer|URL)/.test(name)) return 'location';
  if (name.startsWith('document')) return 'document';
  return 'viewport';
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const FIX: Record<Family, FixSuggestion> = {
  storage: {
    language: 'vue',
    description:
      'The server has no localStorage. Start from a value both sides know, read the browser value after hydration, or keep it in a cookie, which the server can read.',
    code: `<script setup lang="ts">
// Option A: a cookie is available during server rendering, so both sides agree.
const theme = useCookie('theme', { default: () => 'light' })

// Option B: render a neutral value first, then read the browser-only value once mounted.
const stored = ref('light')
onMounted(() => {
  stored.value = localStorage.getItem('theme') ?? 'light'
})
</script>`,
  },
  navigator: {
    language: 'vue',
    description:
      'Read the user agent and language from the request on the server instead of from navigator.',
    code: `<script setup lang="ts">
// Same value on the server and in the browser.
const headers = useRequestHeaders(['user-agent', 'accept-language'])
const userAgent = headers['user-agent'] ?? ''
</script>

<!-- or, for something only the browser knows, render it after mount: -->
<!-- const online = ref(true); onMounted(() => { online.value = navigator.onLine }) -->`,
  },
  location: {
    language: 'vue',
    description:
      'window.location does not exist on the server. Use the router or the request URL, which are available on both sides.',
    code: `<script setup lang="ts">
const route = useRoute()          // route.fullPath, route.query, route.hash
const url = useRequestURL()       // absolute URL, also during server rendering
</script>`,
  },
  viewport: {
    language: 'vue',
    description:
      'Window size and similar values exist only in the browser. Render a default first and update it after the app is mounted (or use CSS media queries instead).',
    code: `<script setup lang="ts">
const width = ref(0) // same initial value on the server and the client

onMounted(() => {
  const update = () => { width.value = window.innerWidth }
  update()
  window.addEventListener('resize', update)
  onBeforeUnmount(() => window.removeEventListener('resize', update))
})
</script>`,
  },
  document: {
    language: 'vue',
    description:
      'Do not read the document while rendering. Use Nuxt’s head management for the title, or read the DOM after mount.',
    code: `<script setup lang="ts">
useHead({ title: 'My page' }) // instead of reading or writing document.title

onMounted(() => {
  // DOM access is safe here: this only runs in the browser, after hydration.
})
</script>

<!-- Or keep browser-only UI out of server rendering entirely: -->
<ClientOnly>
  <BrowserOnlyWidget />
  <template #fallback><span>Loading…</span></template>
</ClientOnly>`,
  },
};

const TITLE = 'A browser-only value is used while rendering';

const EXPLANATION =
  'The component reads something only a browser has (window, document, localStorage, navigator…) while it renders. On the server that value does not exist or is different, so the HTML the server sent cannot match what the browser renders. Browser-only reads belong in onMounted, or the part of the page that needs them in <ClientOnly>.';

export const browserGlobalsRule: Rule = {
  category: 'browser-global-leak',
  run({ issue, context, changes }: RuleInput): DiagnosticResult | null {
    const probabilities: number[] = [];
    const evidence: string[] = [];
    const families: Family[] = [];

    // Strongest evidence: the client text contains the live value of a browser global that the
    // server could not have known.
    for (const change of changes) {
      if (change.client === null) continue;
      for (const known of context.browserValues) {
        if (known.value.length < 3) continue;
        const pattern = new RegExp(`(?<![\\w.])${escapeRegExp(known.value)}(?![\\w.])`);
        if (!pattern.test(change.client)) continue;
        if (change.server !== null && pattern.test(change.server)) continue;
        probabilities.push(known.value.length < SHORT_VALUE ? 0.7 : 0.92);
        families.push(familyOf(known.source));
        evidence.push(
          `The client rendered “${clip(change.client)}”, which contains the current value of \`${known.source}\`; the server cannot know it.`,
        );
      }
    }

    // Supporting evidence: the compiled component reads a browser global outside client-only hooks.
    if (issue.componentSource !== null) {
      const uses = findInServerCode(
        issue.componentSource,
        /(?<![.\w$])(window|document|localStorage|sessionStorage|navigator|location)(?=\s*[.[])/g,
      );
      for (const use of uses.slice(0, 3)) {
        probabilities.push(use.topLevel ? 0.65 : 0.4);
        families.push(familyOf(use.text));
        evidence.push(
          `\`${use.text}\` is used in code that also runs during server rendering, outside onMounted: \`${use.line}\``,
        );
      }
    }

    if (probabilities.length === 0) return null;
    const family = families[0] ?? 'viewport';
    return {
      category: 'browser-global-leak',
      confidence: combineConfidence(probabilities),
      title: TITLE,
      explanation: EXPLANATION,
      evidence,
      fix: FIX[family],
    };
  },
};
