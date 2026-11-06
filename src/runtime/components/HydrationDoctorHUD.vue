<script setup lang="ts">
import { computed } from 'vue';
import type { DiffRow, DiffSegment } from '../domain/diff';
import type { HudEntry, OverlayBox } from '../domain/hud';
import type { HydrationMismatchKind, SourceLocation } from '../domain/issue';
import { formatSourceLocation } from '../domain/location';
import { HUD_STYLES } from './hud-styles';

/**
 * Presentational HUD: everything it shows comes in as props and everything the user does goes
 * out as an event. It is mounted inside a Shadow DOM root by `hud/mount-hud.ts`.
 *
 * Page and server content is only ever rendered through text interpolation, never as HTML, so
 * hostile markup in the diff is displayed, not executed.
 */
const props = defineProps<{
  entries: readonly HudEntry[];
  overlays: readonly OverlayBox[];
  selectedId: string | null;
  open: boolean;
  /** Whether "Open in editor" can work (the dev endpoint it goes through exists). */
  canOpen: boolean;
}>();

const emit = defineEmits<{
  select: [id: string];
  toggle: [];
  close: [];
  clear: [];
  copy: [text: string];
  open: [location: SourceLocation];
}>();

const KIND_LABEL: Record<HydrationMismatchKind, string> = {
  'text-mismatch': 'Text mismatch',
  'node-mismatch': 'Node mismatch',
  'children-mismatch': 'Children mismatch',
  'class-mismatch': 'Class mismatch',
  'style-mismatch': 'Style mismatch',
  'attribute-mismatch': 'Attribute mismatch',
};
const STATUS_MARK: Record<DiffRow['status'], string> = {
  same: ' ',
  changed: '~',
  removed: '-',
  added: '+',
};

const selected = computed<HudEntry | null>(
  () =>
    props.entries.find((entry) => entry.issue.id === props.selectedId) ?? props.entries[0] ?? null,
);

const outlines = computed(() =>
  props.overlays.map((box) => ({
    box,
    entry: props.entries.find((candidate) => candidate.issue.id === box.issueId) ?? null,
    isSelected: box.issueId === selected.value?.issue.id,
  })),
);

/** A word for the confidence, so the meaning does not depend on a colour or a number alone. */
function confidenceLabel(confidence: number): string {
  if (confidence >= 0.8) return 'High confidence';
  if (confidence >= 0.55) return 'Medium confidence';
  return 'Low confidence';
}

function shortLabel(entry: HudEntry): string {
  const { issue } = entry;
  const where = issue.location === null ? '' : ` ${formatSourceLocation(issue.location)}`;
  return `${issue.componentName ?? 'Unknown component'}${where}`;
}

function locationText(entry: HudEntry): string | null {
  return entry.issue.location === null ? null : formatSourceLocation(entry.issue.location);
}

function boxStyle(box: OverlayBox): Record<string, string> {
  return {
    top: `${String(box.top)}px`,
    left: `${String(box.left)}px`,
    width: `${String(box.width)}px`,
    height: `${String(box.height)}px`,
  };
}

function side(row: DiffRow, which: 'server' | 'client'): readonly DiffSegment[] | null {
  return row[which];
}

function cellClass(row: DiffRow, which: 'server' | 'client'): string[] {
  const classes = ['nhd-cell', `nhd-cell--${which}`];
  if (side(row, which) === null) classes.push('nhd-cell--empty');
  else if (row.status !== 'same') classes.push(`nhd-cell--${row.status}`);
  return classes;
}
</script>

<template>
  <component :is="'style'">{{ HUD_STYLES }}</component>
  <div class="nhd-root">
    <div class="nhd-overlays">
      <div
        v-for="outline in outlines"
        :key="outline.box.issueId"
        class="nhd-box"
        :class="{ 'nhd-box--selected': outline.isSelected }"
        :style="boxStyle(outline.box)"
      >
        <button
          v-if="outline.entry !== null"
          type="button"
          class="nhd-chip"
          :class="{ 'nhd-chip--inside': outline.box.top < 28 }"
          :aria-label="`Show hydration mismatch in ${shortLabel(outline.entry)}`"
          @click="emit('select', outline.box.issueId)"
        >
          {{ shortLabel(outline.entry) }}
        </button>
      </div>
    </div>

    <button
      type="button"
      class="nhd-badge"
      :class="{ 'nhd-badge--alert': entries.length > 0 }"
      aria-controls="nhd-panel"
      :aria-expanded="open"
      @click="emit('toggle')"
    >
      Hydration Doctor
      <span class="nhd-count" aria-label="mismatches">{{ entries.length }}</span>
    </button>

    <section
      v-if="open"
      id="nhd-panel"
      class="nhd-panel"
      role="dialog"
      aria-label="Hydration Doctor"
    >
      <header class="nhd-header">
        <h2 class="nhd-title">Hydration mismatches</h2>
        <button v-if="entries.length > 0" type="button" class="nhd-action" @click="emit('clear')">
          Clear
        </button>
        <button type="button" class="nhd-action" @click="emit('close')">Close</button>
      </header>

      <div class="nhd-body">
        <p v-if="selected === null" class="nhd-empty">
          No hydration mismatches detected in this session.
        </p>

        <template v-else>
          <ul class="nhd-issues">
            <li v-for="(entry, index) in entries" :key="entry.issue.id">
              <button
                type="button"
                class="nhd-issue-tab"
                :aria-current="entry.issue.id === selected.issue.id"
                @click="emit('select', entry.issue.id)"
              >
                #{{ index + 1 }} {{ KIND_LABEL[entry.issue.kind] }} · {{ shortLabel(entry) }}
              </button>
            </li>
          </ul>

          <dl class="nhd-meta">
            <dt>Kind</dt>
            <dd>{{ KIND_LABEL[selected.issue.kind] }}</dd>
            <dt>Component</dt>
            <dd>{{ selected.issue.componentName ?? 'Unknown' }}</dd>
            <dt>Source</dt>
            <dd>
              <span v-if="locationText(selected) !== null" class="nhd-loc">
                <code>{{ locationText(selected) }}</code>
                <button
                  v-if="canOpen && selected.issue.location !== null"
                  type="button"
                  class="nhd-action"
                  @click="selected.issue.location !== null && emit('open', selected.issue.location)"
                >
                  Open in editor
                </button>
                <button
                  type="button"
                  class="nhd-action"
                  @click="emit('copy', locationText(selected) ?? '')"
                >
                  Copy
                </button>
              </span>
              <span v-else>Unknown (no source location on this element)</span>
            </dd>
            <dt>Route</dt>
            <dd>{{ selected.issue.route }}</dd>
            <dt>Detected</dt>
            <dd>
              {{
                selected.issue.metrics.msSinceNavigationStart === null
                  ? 'time unavailable'
                  : `${String(Math.round(selected.issue.metrics.msSinceNavigationStart))} ms after navigation start`
              }}
            </dd>
          </dl>

          <pre class="nhd-message">{{ selected.issue.message }}</pre>

          <ol
            v-if="selected.issue.breadcrumbs.length > 0"
            class="nhd-crumbs"
            aria-label="Breadcrumbs"
          >
            <li v-for="(crumb, index) in selected.issue.breadcrumbs" :key="index">{{ crumb }}</li>
          </ol>

          <section class="nhd-diagnoses" aria-label="Likely causes">
            <h3 class="nhd-section-title">Likely cause</h3>
            <p v-if="selected.diagnostics.length === 0" class="nhd-note">
              No known pattern matched. Compare the two columns below: the difference between them
              is the lead.
            </p>
            <article
              v-for="diagnosis in selected.diagnostics"
              :key="diagnosis.category"
              class="nhd-diagnosis"
            >
              <h4 class="nhd-diagnosis-title">
                {{ diagnosis.title }}
                <span class="nhd-confidence">
                  {{ confidenceLabel(diagnosis.confidence) }} ·
                  {{ String(Math.round(diagnosis.confidence * 100)) }}%
                </span>
              </h4>
              <p class="nhd-explanation">{{ diagnosis.explanation }}</p>
              <ul v-if="diagnosis.evidence.length > 0" class="nhd-evidence" aria-label="Evidence">
                <li v-for="(item, index) in diagnosis.evidence" :key="index">{{ item }}</li>
              </ul>
              <div v-if="diagnosis.fix !== null" class="nhd-fix">
                <p class="nhd-fix-description">{{ diagnosis.fix.description }}</p>
                <pre class="nhd-code" :data-language="diagnosis.fix.language">{{
                  diagnosis.fix.code
                }}</pre>
                <button
                  type="button"
                  class="nhd-action"
                  @click="emit('copy', diagnosis.fix?.code ?? '')"
                >
                  Copy fix
                </button>
              </div>
            </article>
          </section>

          <template v-if="selected.diff !== null">
            <p v-if="selected.diff.identical" class="nhd-note">
              Both renderings are identical once normalised: Vue repaired the DOM, so the difference
              it reported was in text or attributes the markup comparison cannot show.
            </p>
            <p v-if="selected.diff.truncated" class="nhd-note">
              The markup is long: only the first lines of each side are compared.
            </p>
            <div class="nhd-diff" role="group" aria-label="Server versus client markup">
              <h3 class="nhd-diff-head">Server Rendered HTML</h3>
              <h3 class="nhd-diff-head">Client Rendered DOM</h3>
              <template v-for="(row, rowIndex) in selected.diff.rows" :key="rowIndex">
                <pre :class="cellClass(row, 'server')"><span class="nhd-gutter">{{
                  side(row, 'server') === null ? ' ' : STATUS_MARK[row.status]
                }}</span><template v-for="(segment, i) in side(row, 'server') ?? []" :key="i"><mark v-if="segment.diverges">{{ segment.text }}</mark><template v-else>{{ segment.text }}</template></template></pre>
                <pre :class="cellClass(row, 'client')"><span class="nhd-gutter">{{
                  side(row, 'client') === null ? ' ' : STATUS_MARK[row.status]
                }}</span><template v-for="(segment, i) in side(row, 'client') ?? []" :key="i"><mark v-if="segment.diverges">{{ segment.text }}</mark><template v-else>{{ segment.text }}</template></template></pre>
              </template>
            </div>
          </template>

          <template v-else>
            <p class="nhd-note">
              A side-by-side diff needs both renderings, and this issue has no source location to
              recover the server markup from. What is available is shown below.
            </p>
            <pre v-if="selected.issue.serverHtml !== null" class="nhd-single">{{
              selected.issue.serverHtml
            }}</pre>
            <pre v-if="selected.issue.clientHtml !== null" class="nhd-single">{{
              selected.issue.clientHtml
            }}</pre>
          </template>
        </template>
      </div>
    </section>
  </div>
</template>
