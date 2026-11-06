import { describe, expect, it } from 'vitest';
import {
  clampRatio,
  cornerPosition,
  dockOf,
  HUD_CORNERS,
  nudgePosition,
  parseStoredPosition,
  positionFromPointer,
  samePosition,
  serializePosition,
} from '../../../src/runtime/domain/badge-position';

describe('cornerPosition', () => {
  it.each([
    ['bottom-right', { fx: 1, fy: 1 }],
    ['bottom-left', { fx: 0, fy: 1 }],
    ['top-right', { fx: 1, fy: 0 }],
    ['top-left', { fx: 0, fy: 0 }],
  ] as const)('puts %s at %j', (corner, expected) => {
    expect(cornerPosition(corner)).toEqual(expected);
  });

  it('knows exactly four corners', () => {
    expect([...HUD_CORNERS].sort()).toEqual([
      'bottom-left',
      'bottom-right',
      'top-left',
      'top-right',
    ]);
  });
});

describe('clampRatio', () => {
  it.each([
    [0.4, 0.4],
    [-3, 0],
    [7, 1],
    [Number.NaN, 0],
    [Number.POSITIVE_INFINITY, 0],
    [Number.NEGATIVE_INFINITY, 0],
  ])('turns %s into %s', (input, expected) => {
    expect(clampRatio(input)).toBe(expected);
  });
});

describe('positionFromPointer', () => {
  const area = { left: 16, top: 16, width: 968, height: 668 };
  const size = { width: 160, height: 40 };
  // Free space is 808 x 628: the viewport minus the margin minus the badge.

  it('puts the grabbed point of the badge under the pointer', () => {
    const position = positionFromPointer({
      pointer: { x: 16 + 20 + 404, y: 16 + 10 + 314 },
      grab: { x: 20, y: 10 },
      area,
      size,
    });
    expect(position).toEqual({ fx: 0.5, fy: 0.5 });
  });

  it('reaches both ends exactly', () => {
    const topLeft = positionFromPointer({
      pointer: { x: 36, y: 26 },
      grab: { x: 20, y: 10 },
      area,
      size,
    });
    const bottomRight = positionFromPointer({
      pointer: { x: 16 + 20 + 808, y: 16 + 10 + 628 },
      grab: { x: 20, y: 10 },
      area,
      size,
    });
    expect(topLeft).toEqual({ fx: 0, fy: 0 });
    expect(bottomRight).toEqual({ fx: 1, fy: 1 });
  });

  it('keeps the badge inside the area when the pointer leaves it', () => {
    const outside = positionFromPointer({
      pointer: { x: -500, y: 9000 },
      grab: { x: 20, y: 10 },
      area,
      size,
    });
    expect(outside).toEqual({ fx: 0, fy: 1 });
  });

  it('does not divide by zero when the badge fills the area', () => {
    const position = positionFromPointer({
      pointer: { x: 100, y: 100 },
      grab: { x: 0, y: 0 },
      area: { left: 0, top: 0, width: 100, height: 30 },
      size: { width: 160, height: 40 },
    });
    expect(position).toEqual({ fx: 0, fy: 0 });
  });
});

describe('nudgePosition', () => {
  it('moves by a fraction and stays inside', () => {
    expect(nudgePosition({ fx: 0.5, fy: 0.5 }, 0.05, -0.05)).toEqual({ fx: 0.55, fy: 0.45 });
    expect(nudgePosition({ fx: 1, fy: 0 }, 0.05, -0.05)).toEqual({ fx: 1, fy: 0 });
    expect(nudgePosition({ fx: 0.02, fy: 0.98 }, -0.05, 0.05)).toEqual({ fx: 0, fy: 1 });
  });
});

describe('dockOf', () => {
  it.each([
    [{ fx: 1, fy: 1 }, 'right', 'bottom'],
    [{ fx: 0, fy: 0 }, 'left', 'top'],
    [{ fx: 0.49, fy: 0.51 }, 'left', 'bottom'],
    [{ fx: 0.51, fy: 0.49 }, 'right', 'top'],
    [{ fx: 0.5, fy: 0.5 }, 'right', 'bottom'],
  ] as const)('docks %j to %s / %s', (position, horizontal, vertical) => {
    expect(dockOf(position)).toEqual({ horizontal, vertical });
  });
});

describe('stored positions', () => {
  it('round-trips', () => {
    const position = { fx: 0.25, fy: 0.75 };
    expect(parseStoredPosition(serializePosition(position))).toEqual(position);
    expect(samePosition(position, { fx: 0.25, fy: 0.75 })).toBe(true);
    expect(samePosition(position, { fx: 0.25, fy: 0.5 })).toBe(false);
  });

  it.each([
    null,
    '',
    'nonsense',
    '{}',
    '[]',
    'null',
    '42',
    '{"fx":0.5}',
    '{"fx":"0.5","fy":0.5}',
    '{"fx":5,"fy":0.5}',
    '{"fx":0.5,"fy":-1}',
    '{"fx":1e999,"fy":0}',
    `{"fx":0.5,"fy":0.5,"pad":"${'x'.repeat(300)}"}`,
  ])('ignores %j: storage may hold anything', (text) => {
    expect(parseStoredPosition(text)).toBeNull();
  });

  it('accepts the exact edges', () => {
    expect(parseStoredPosition('{"fx":0,"fy":1}')).toEqual({ fx: 0, fy: 1 });
  });
});
