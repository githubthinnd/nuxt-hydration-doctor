<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  dockOf,
  nudgePosition,
  NUDGE_STEP,
  positionFromPointer,
  type BadgePosition,
} from '../domain/badge-position';
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
  /** Where the badge is: fractions of the free space, 0 = left/top edge, 1 = right/bottom. */
  position: BadgePosition;
  /** True once the badge has been moved away from its starting corner. */
  customPosition: boolean;
}>();

const emit = defineEmits<{
  select: [id: string];
  toggle: [];
  close: [];
  clear: [];
  copy: [text: string];
  open: [location: SourceLocation];
  /** The badge is being dragged or nudged to this position. */
  move: [position: BadgePosition];
  /** The drag or nudge is over: a good moment to remember the position. */
  moveEnd: [];
  resetPosition: [];
}>();

// --- Moving the badge ---------------------------------------------------------------------------
// The HUD can sit on top of other debug bars, so the badge is draggable (mouse, touch, pen) and
// movable with Alt + arrow keys. A press that moves less than the threshold is a click.
const DRAG_THRESHOLD_PX = 4;

const dockElement = ref<HTMLElement | null>(null);
const badgeElement = ref<HTMLElement | null>(null);
const dragging = ref(false);

interface Drag {
  readonly pointerId: number;
  readonly grab: { readonly x: number; readonly y: number };
  readonly start: { readonly x: number; readonly y: number };
  moved: boolean;
}
let drag: Drag | null = null;
/** Set when a drag ends, so the click that follows the release does not also toggle the panel. */
let suppressClick = false;

function onPointerDown(event: PointerEvent): void {
  const badge = badgeElement.value;
  // Only the main button (or a touch or pen contact, which also report 0) starts a drag.
  if (badge === null || event.button !== 0) return;
  const rect = badge.getBoundingClientRect();
  drag = {
    pointerId: event.pointerId,
    grab: { x: event.clientX - rect.left, y: event.clientY - rect.top },
    start: { x: event.clientX, y: event.clientY },
    moved: false,
  };
  suppressClick = false;
  try {
    // Keeps the move events coming even when the pointer outruns the badge.
    badge.setPointerCapture(event.pointerId);
  } catch {
    // Not every environment supports capture; dragging still works while the pointer is over it.
  }
}

function onPointerMove(event: PointerEvent): void {
  const badge = badgeElement.value;
  const dock = dockElement.value;
  if (drag === null || badge === null || dock === null) return;
  if (!drag.moved) {
    const distance = Math.hypot(event.clientX - drag.start.x, event.clientY - drag.start.y);
    if (distance < DRAG_THRESHOLD_PX) return;
    drag.moved = true;
    dragging.value = true;
  }
  const size = badge.getBoundingClientRect();
  emit(
    'move',
    positionFromPointer({
      pointer: { x: event.clientX, y: event.clientY },
      grab: drag.grab,
      area: dock.getBoundingClientRect(),
      size: { width: size.width, height: size.height },
    }),
  );
}

function onPointerEnd(): void {
  if (drag === null) return;
  const moved = drag.moved;
  try {
    badgeElement.value?.releasePointerCapture(drag.pointerId);
  } catch {
    // The pointer is already gone (a cancelled touch, say); there is nothing left to release.
  }
  drag = null;
  dragging.value = false;
  if (moved) {
    suppressClick = true;
    emit('moveEnd');
  }
}

function onBadgeClick(): void {
  if (suppressClick) {
    suppressClick = false;
    return;
  }
  emit('toggle');
}

const ARROW_STEPS: Record<string, readonly [number, number]> = {
  ArrowLeft: [-NUDGE_STEP, 0],
  ArrowRight: [NUDGE_STEP, 0],
  ArrowUp: [0, -NUDGE_STEP],
  ArrowDown: [0, NUDGE_STEP],
};

/**
 * The latest position this component knows of: the prop, or what it last asked for. A prop only
 * changes after Vue has re-rendered, so two keys pressed within one task would otherwise both
 * start from the old position and count as one.
 */
let latest = props.position;
watch(
  () => props.position,
  (position) => {
    latest = position;
  },
);

function onBadgeKeydown(event: KeyboardEvent): void {
  const step = event.altKey ? ARROW_STEPS[event.key] : undefined;
  if (step === undefined) return;
  event.preventDefault();
  latest = nudgePosition(latest, step[0], step[1]);
  emit('move', latest);
  emit('moveEnd');
}

const docking = computed(() => dockOf(props.position));
/**
 * Places the badge by the fractions alone: `left: X%` of the dock plus `translateX(-X%)` of the
 * badge's own width puts its left edge at X of the free space, whatever the sizes are.
 */
const badgeStyle = computed(() => {
  const x = `${String(props.position.fx * 100)}%`;
  const y = `${String(props.position.fy * 100)}%`;
  return { left: x, top: y, transform: `translate(-${x}, -${y})` };
});

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

    <div ref="dockElement" class="nhd-dock">
      <button
        ref="badgeElement"
        type="button"
        class="nhd-badge"
        :class="{ 'nhd-badge--alert': entries.length > 0, 'nhd-badge--dragging': dragging }"
        :style="badgeStyle"
        title="Hydration Doctor. Drag to move it, or press Alt and an arrow key."
        aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown"
        aria-controls="nhd-panel"
        :aria-expanded="open"
        @click="onBadgeClick"
        @keydown="onBadgeKeydown"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerEnd"
        @pointercancel="onPointerEnd"
      >
        Hydration Doctor
        <span class="nhd-count" aria-label="mismatches">{{ entries.length }}</span>
      </button>
    </div>

    <section
      v-if="open"
      id="nhd-panel"
      class="nhd-panel"
      :class="[`nhd-panel--${docking.horizontal}`, `nhd-panel--${docking.vertical}`]"
      role="dialog"
      aria-label="Hydration Doctor"
    >
      <header class="nhd-header">
        <h2 class="nhd-title">Hydration mismatches</h2>
        <button
          v-if="customPosition"
          type="button"
          class="nhd-action"
          @click="emit('resetPosition')"
        >
          Reset position
        </button>
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
