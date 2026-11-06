/**
 * Where the HUD badge sits, and the arithmetic of moving it. Pure: no DOM, so it is tested alone.
 *
 * A position is a pair of fractions of the *free space* (the viewport minus a margin minus the
 * badge itself): 0 is the left/top edge, 1 the right/bottom edge. Fractions, not pixels, because
 * they stay valid when the window is resized, the page is zoomed or the badge grows (its counter
 * gets wider): the layout maps them to pixels with CSS alone and no measuring.
 */
export interface BadgePosition {
  readonly fx: number;
  readonly fy: number;
}

/** The corners the badge can start in (`hud.position`). */
export const HUD_CORNERS = ['bottom-right', 'bottom-left', 'top-right', 'top-left'] as const;

export type HudCorner = (typeof HUD_CORNERS)[number];

/** Where the position the user chose is remembered between page loads. */
export const BADGE_POSITION_STORAGE_KEY = 'nuxt-hydration-doctor:badge-position';

/** How far one keyboard nudge moves the badge, as a fraction of the free space. */
export const NUDGE_STEP = 0.05;

/** Positions are kept to this many steps per unit: finer than a pixel, free of float noise. */
const RATIO_STEPS = 10_000;

/**
 * A fraction forced into 0..1 and rounded to 4 decimals (so `0.1 + 0.2`-style noise never reaches
 * storage or CSS); anything that is not a finite number becomes 0.
 */
export function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.min(1, Math.max(0, value)) * RATIO_STEPS) / RATIO_STEPS;
}

export function cornerPosition(corner: HudCorner): BadgePosition {
  return {
    fx: corner.endsWith('right') ? 1 : 0,
    fy: corner.startsWith('bottom') ? 1 : 0,
  };
}

export interface Rect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface DragInput {
  /** Current pointer position in viewport coordinates. */
  readonly pointer: { readonly x: number; readonly y: number };
  /** Where inside the badge it was grabbed, so the badge does not jump to the pointer. */
  readonly grab: { readonly x: number; readonly y: number };
  /** The box the badge moves in (the viewport minus its margin). */
  readonly area: Rect;
  /** The badge's own size. */
  readonly size: { readonly width: number; readonly height: number };
}

/** The position that puts the grabbed point of the badge under the pointer, kept inside the area. */
export function positionFromPointer({ pointer, grab, area, size }: DragInput): BadgePosition {
  const freeX = area.width - size.width;
  const freeY = area.height - size.height;
  return {
    fx: freeX > 0 ? clampRatio((pointer.x - grab.x - area.left) / freeX) : 0,
    fy: freeY > 0 ? clampRatio((pointer.y - grab.y - area.top) / freeY) : 0,
  };
}

/** Moves a position by a fraction of the free space, staying inside it. */
export function nudgePosition(position: BadgePosition, dx: number, dy: number): BadgePosition {
  return { fx: clampRatio(position.fx + dx), fy: clampRatio(position.fy + dy) };
}

export interface Dock {
  readonly horizontal: 'left' | 'right';
  readonly vertical: 'top' | 'bottom';
}

/**
 * The edges the panel docks to: those nearest the badge, so it opens on the badge's side of the
 * screen and next to it, and never off screen. A badge exactly in the middle docks bottom right.
 */
export function dockOf(position: BadgePosition): Dock {
  return {
    horizontal: position.fx >= 0.5 ? 'right' : 'left',
    vertical: position.fy >= 0.5 ? 'bottom' : 'top',
  };
}

export function samePosition(a: BadgePosition, b: BadgePosition): boolean {
  return a.fx === b.fx && a.fy === b.fy;
}

export function serializePosition(position: BadgePosition): string {
  return JSON.stringify({ fx: position.fx, fy: position.fy });
}

/**
 * Reads a position back from storage. The text is whatever is in the browser's storage, which the
 * page or the user may have changed, so anything that is not `{fx, fy}` with two finite numbers in
 * 0..1 is ignored (null) and the default corner is used instead.
 */
export function parseStoredPosition(text: string | null): BadgePosition | null {
  if (text === null || text.length > 200) return null;
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== 'object' || value === null) return null;
    const { fx, fy } = value as Record<string, unknown>;
    if (typeof fx !== 'number' || typeof fy !== 'number') return null;
    if (!Number.isFinite(fx) || !Number.isFinite(fy)) return null;
    if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return null;
    return { fx, fy };
  } catch {
    return null;
  }
}
