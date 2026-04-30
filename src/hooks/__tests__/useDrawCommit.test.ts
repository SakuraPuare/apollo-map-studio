/**
 * Unit tests for useDrawCommit geometry-validation logic.
 *
 * The hook fires `commitEntity` when the FSM transitions from any draw state
 * to 'idle'. The entity is only committed when the geometry meets a minimum
 * point/anchor count. We test the `hasGeometry` decision matrix — the exact
 * conditions inside `commitEntity` — in isolation without needing a real
 * React renderer, MapStore, or MapLibre instance.
 *
 * Minimum-count table (from commitEntity source):
 *   drawBezier      anchors.length >= 2
 *   drawArc         points.length  >= 3
 *   drawRotatedRect points.length  >= 3
 *   drawPolygon     points.length  >= 3
 *   drawPolyline    points.length  >= 2
 *   drawCatmullRom  points.length  >= 2
 */

import { describe, it, expect } from 'vitest';
import type { LngLat, BezierAnchor } from '@/core/geometry/interpolate';
import { isDrawingState } from '@/core/fsm/editorMachine';
import { hasGeometryForState as hasGeometry } from '../useDrawCommit';

const P: LngLat = [0, 0]; // placeholder point
const A: BezierAnchor = { point: P, handleIn: null, handleOut: null }; // placeholder anchor

// ---------------------------------------------------------------------------
// Tests per draw state
// ---------------------------------------------------------------------------

describe('hasGeometry — drawPolyline', () => {
  it('false with 0 points', () => expect(hasGeometry('drawPolyline', [], [])).toBe(false));
  it('false with 1 point', () => expect(hasGeometry('drawPolyline', [P], [])).toBe(false));
  it('true with 2 points (minimum)', () =>
    expect(hasGeometry('drawPolyline', [P, P], [])).toBe(true));
  it('true with 5 points', () =>
    expect(hasGeometry('drawPolyline', [P, P, P, P, P], [])).toBe(true));
});

describe('hasGeometry — drawCatmullRom', () => {
  it('false with 0 points', () => expect(hasGeometry('drawCatmullRom', [], [])).toBe(false));
  it('false with 1 point', () => expect(hasGeometry('drawCatmullRom', [P], [])).toBe(false));
  it('true with 2 points (minimum)', () =>
    expect(hasGeometry('drawCatmullRom', [P, P], [])).toBe(true));
  it('true with 3 points', () => expect(hasGeometry('drawCatmullRom', [P, P, P], [])).toBe(true));
});

describe('hasGeometry — drawBezier', () => {
  it('false with 0 anchors', () => expect(hasGeometry('drawBezier', [], [])).toBe(false));
  it('false with 1 anchor', () => expect(hasGeometry('drawBezier', [], [A])).toBe(false));
  it('true with 2 anchors (minimum)', () =>
    expect(hasGeometry('drawBezier', [], [A, A])).toBe(true));
  it('true with 4 anchors', () => expect(hasGeometry('drawBezier', [], [A, A, A, A])).toBe(true));
  it('points count is irrelevant for bezier', () => {
    // Even with 10 points, bezier needs anchors.
    expect(hasGeometry('drawBezier', [P, P, P, P, P, P, P, P, P, P], [])).toBe(false);
    expect(hasGeometry('drawBezier', [P, P, P, P, P, P, P, P, P, P], [A, A])).toBe(true);
  });
});

describe('hasGeometry — drawArc', () => {
  it('false with 0 points', () => expect(hasGeometry('drawArc', [], [])).toBe(false));
  it('false with 1 point', () => expect(hasGeometry('drawArc', [P], [])).toBe(false));
  it('false with 2 points', () => expect(hasGeometry('drawArc', [P, P], [])).toBe(false));
  it('true with 3 points (minimum)', () =>
    expect(hasGeometry('drawArc', [P, P, P], [])).toBe(true));
  it('true with 4 points', () => expect(hasGeometry('drawArc', [P, P, P, P], [])).toBe(true));
});

describe('hasGeometry — drawRotatedRect', () => {
  it('false with 2 points', () => expect(hasGeometry('drawRotatedRect', [P, P], [])).toBe(false));
  it('true with 3 points (minimum)', () =>
    expect(hasGeometry('drawRotatedRect', [P, P, P], [])).toBe(true));
});

describe('hasGeometry — drawPolygon', () => {
  it('false with 2 points', () => expect(hasGeometry('drawPolygon', [P, P], [])).toBe(false));
  it('true with 3 points (minimum)', () =>
    expect(hasGeometry('drawPolygon', [P, P, P], [])).toBe(true));
  it('true with 6 points', () =>
    expect(hasGeometry('drawPolygon', [P, P, P, P, P, P], [])).toBe(true));
});

describe('hasGeometry — non-draw states always return false', () => {
  it('idle with many points returns false', () =>
    expect(hasGeometry('idle', [P, P, P], [A, A])).toBe(false));
  it('selected with many points returns false', () =>
    expect(hasGeometry('selected', [P, P, P], [A, A])).toBe(false));
  it('editingPoint returns false', () =>
    expect(hasGeometry('editingPoint', [P, P, P], [A, A])).toBe(false));
});

// ---------------------------------------------------------------------------
// Transition contract: commit fires only on draw→idle, not idle→idle
// ---------------------------------------------------------------------------

describe('commit transition guard (idle←drawX)', () => {
  it('only triggers when prevState was a draw state and nextState is idle', () => {
    const transitions: Array<{ prev: string; next: string; shouldCommit: boolean }> = [
      { prev: 'drawPolyline', next: 'idle', shouldCommit: true },
      { prev: 'drawBezier', next: 'idle', shouldCommit: true },
      { prev: 'idle', next: 'idle', shouldCommit: false },
      { prev: 'selected', next: 'idle', shouldCommit: false },
      { prev: 'drawPolyline', next: 'selected', shouldCommit: false },
      { prev: 'editingPoint', next: 'idle', shouldCommit: false },
    ];

    for (const { prev, next, shouldCommit } of transitions) {
      const result = next === 'idle' && isDrawingState(prev);
      expect(result).toBe(shouldCommit);
    }
  });
});
