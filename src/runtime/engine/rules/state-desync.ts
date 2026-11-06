import type { DiagnosticResult, StateChange } from '../../domain/diagnostic';
import { combineConfidence } from '../confidence';
import type { TextChange } from '../text-changes';
import type { Rule, RuleInput } from './rule';

/** A serialised value as it would be written on the page: JSON strings lose their quotes. */
function plain(serialised: string): string {
  try {
    const value: unknown = JSON.parse(serialised);
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  } catch {
    // Not JSON: use the text as it is.
  }
  return serialised;
}

/** True when the server rendered the old value and the client the new one for this change. */
function explainsText(change: StateChange, texts: readonly TextChange[]): boolean {
  const before = plain(change.before);
  const after = plain(change.after);
  if (before === '' || after === '' || before === after) return false;
  return texts.some(
    (text) =>
      text.server !== null &&
      text.client !== null &&
      text.server.includes(before) &&
      text.client.includes(after),
  );
}

function label(change: StateChange): string {
  return change.store === 'pinia' ? `Pinia store “${change.key}”` : `useState("${change.key}")`;
}

export const stateDesyncRule: Rule = {
  category: 'state-desynchronization',
  run({ context, changes }: RuleInput): DiagnosticResult | null {
    if (context.stateChanges.length === 0) return null;

    const linked = context.stateChanges.filter((change) => explainsText(change, changes));
    const unlinked = context.stateChanges.filter((change) => !linked.includes(change));
    const evidence = [
      ...linked.map(
        (change) =>
          `${label(change)} changed after the server rendered it: the server text shows its old value, the client text its new one.`,
      ),
      ...unlinked
        .slice(0, 3)
        .map(
          (change) =>
            `${label(change)} has a different value than in the server payload, so anything rendered from it differs.`,
        ),
    ];
    const first = linked[0] ?? unlinked[0];
    if (first === undefined) return null;
    const key = first.key;

    // Pinia entries are listed per property as "<storeId>.<property>".
    const [storeId = key, ...rest] = key.split('.');
    const property = rest.join('.') || key;
    const variable = key.replace(/\W/g, '_');

    const fix =
      first.store === 'pinia'
        ? `<script setup lang="ts">
const store = useMyStore() // the store with id "${storeId}"

// Not at setup time: this runs on the client before hydration and changes what is rendered.
//   store.${property} = readFromBrowser()
// Wait until the app is mounted, so the first client render equals the server render.
onMounted(() => {
  store.${property} = readFromBrowser()
})
</script>`
        : `<script setup lang="ts">
const ${variable} = useState('${key}', () => /* the same initial value on both sides */ 0)

// Not at setup time: changing it here makes the client render differ from the server's.
//   ${variable}.value = readFromBrowser()
// Change it once the app is mounted instead.
onMounted(() => {
  ${variable}.value = readFromBrowser()
})
</script>`;

    return {
      category: 'state-desynchronization',
      // A change that demonstrably explains the differing text is strong; one that merely
      // exists next to a mismatch is a lead, not a conclusion.
      confidence: combineConfidence([
        ...linked.map(() => 0.9),
        ...unlinked.slice(0, 3).map(() => 0.35),
      ]),
      title: 'Shared state was changed before the app finished hydrating',
      explanation:
        'The server rendered the page from the state it serialised into the payload. On the client, that state was modified (by a plugin, a store action or the component itself) before hydration finished, so the first client render used different data than the server did.',
      evidence,
      fix: {
        language: 'vue',
        description:
          'Keep the first client render identical to the server render: initialise state the same way on both sides and apply browser-only changes in onMounted.',
        code: fix,
      },
    };
  },
};
