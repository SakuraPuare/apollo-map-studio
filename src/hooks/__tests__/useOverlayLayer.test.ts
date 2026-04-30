/**
 * Unit tests for useOverlayLayer pure helpers.
 *
 * Private pure functions under test (replicated inline):
 *   samePoint                — LngLat | null equality (same as in useHotLayer)
 *   sameOverlayRenderState   — memoization equality for overlay render state
 *   buildOverlayFeatures     — constructs GeoJSON features for the active draw state
 *
 * buildOverlayFeatures is the largest testable chunk — it maps draw state +
 * drawPoints + previewPoint + bezierAnchors to a features array. Testing it
 * validates the overlay preview geometry for every draw tool without needing
 * MapLibre or React.
 */

import { describe, it, expect } from 'vitest';
import type { LngLat, BezierAnchor } from '@/core/geometry/interpolate';
import {
  samePoint,
  sameOverlayRenderState,
  buildOverlayFeatures,
  type OverlayRenderState,
} from '../useOverlayLayer';

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

const P = (x: number, y: number): LngLat => [x, y];
const A = (x: number, y: number): BezierAnchor => ({
  point: [x, y],
  handleIn: null,
  handleOut: null,
});

// ---------------------------------------------------------------------------
// samePoint (same logic as in useHotLayer — tests here are for overlay copy)
// ---------------------------------------------------------------------------

describe('samePoint (useOverlayLayer)', () => {
  it('null, null → true', () => expect(samePoint(null, null)).toBe(true));
  it('same reference → true', () => {
    const p: LngLat = [1, 2];
    expect(samePoint(p, p)).toBe(true);
  });
  it('equal coords different ref → true', () => expect(samePoint([1, 2], [1, 2])).toBe(true));
  it('null vs point → false', () => expect(samePoint(null, [0, 0])).toBe(false));
  it('different coords → false', () => expect(samePoint([1, 2], [1, 3])).toBe(false));
});

// ---------------------------------------------------------------------------
// sameOverlayRenderState
// ---------------------------------------------------------------------------

const makeOverlayState = (overrides: Partial<OverlayRenderState> = {}): OverlayRenderState => ({
  currentState: 'drawPolyline',
  drawPoints: [],
  previewPoint: null,
  bezierAnchors: [],
  ...overrides,
});

describe('sameOverlayRenderState', () => {
  it('returns false when a is null', () => {
    expect(sameOverlayRenderState(null, makeOverlayState())).toBe(false);
  });

  it('returns true for identical state', () => {
    const s = makeOverlayState();
    expect(sameOverlayRenderState(s, s)).toBe(true);
  });

  it('returns false when currentState differs', () => {
    expect(
      sameOverlayRenderState(
        makeOverlayState({ currentState: 'drawPolyline' }),
        makeOverlayState({ currentState: 'drawBezier' }),
      ),
    ).toBe(false);
  });

  it('returns false when drawPoints reference differs', () => {
    expect(
      sameOverlayRenderState(
        makeOverlayState({ drawPoints: [] }),
        makeOverlayState({ drawPoints: [] }), // different array instances
      ),
    ).toBe(false);
  });

  it('returns true when drawPoints and bezierAnchors are the same references', () => {
    // sameOverlayRenderState checks reference equality for both drawPoints and bezierAnchors.
    const pts: LngLat[] = [];
    const anchors: BezierAnchor[] = [];
    const a = makeOverlayState({ drawPoints: pts, bezierAnchors: anchors });
    const b = makeOverlayState({ drawPoints: pts, bezierAnchors: anchors });
    expect(sameOverlayRenderState(a, b)).toBe(true);
  });

  it('returns false when previewPoint coords differ', () => {
    const pts: LngLat[] = [];
    expect(
      sameOverlayRenderState(
        makeOverlayState({ drawPoints: pts, previewPoint: [1, 2] }),
        makeOverlayState({ drawPoints: pts, previewPoint: [1, 3] }),
      ),
    ).toBe(false);
  });

  it('returns true when previewPoint coords are equal', () => {
    const pts: LngLat[] = [];
    const anchors: BezierAnchor[] = [];
    expect(
      sameOverlayRenderState(
        makeOverlayState({ drawPoints: pts, bezierAnchors: anchors, previewPoint: [5, 6] }),
        makeOverlayState({ drawPoints: pts, bezierAnchors: anchors, previewPoint: [5, 6] }),
      ),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildOverlayFeatures — per draw state
// ---------------------------------------------------------------------------

describe('buildOverlayFeatures — idle/selected/unknown', () => {
  it('returns empty array for idle state', () => {
    expect(buildOverlayFeatures(makeOverlayState({ currentState: 'idle' }))).toHaveLength(0);
  });

  it('returns empty array for selected state', () => {
    expect(buildOverlayFeatures(makeOverlayState({ currentState: 'selected' }))).toHaveLength(0);
  });

  it('returns empty array for unknown state', () => {
    expect(buildOverlayFeatures(makeOverlayState({ currentState: 'editingPoint' }))).toHaveLength(
      0,
    );
  });
});

describe('buildOverlayFeatures — drawPolyline', () => {
  it('0 points → no features', () => {
    const f = buildOverlayFeatures(
      makeOverlayState({ currentState: 'drawPolyline', drawPoints: [] }),
    );
    expect(f).toHaveLength(0);
  });

  it('1 point + no preview → 1 vertex point, no line', () => {
    const f = buildOverlayFeatures(
      makeOverlayState({
        currentState: 'drawPolyline',
        drawPoints: [P(0, 0)],
      }),
    );
    // Only vertex point features, no line (need >=2 total)
    expect(f).toHaveLength(1);
    expect(f[0]!.geometry.type).toBe('Point');
  });

  it('2 points → 1 line + 2 vertex points', () => {
    const pts = [P(0, 0), P(1, 1)];
    const f = buildOverlayFeatures(
      makeOverlayState({ currentState: 'drawPolyline', drawPoints: pts }),
    );
    const lines = f.filter((x) => x.geometry.type === 'LineString');
    const points = f.filter((x) => x.geometry.type === 'Point');
    expect(lines).toHaveLength(1);
    expect(points).toHaveLength(2);
  });

  it('1 point + previewPoint → line + vertex point', () => {
    const f = buildOverlayFeatures(
      makeOverlayState({
        currentState: 'drawPolyline',
        drawPoints: [P(0, 0)],
        previewPoint: P(5, 5),
      }),
    );
    const lines = f.filter((x) => x.geometry.type === 'LineString');
    expect(lines).toHaveLength(1);
  });
});

describe('buildOverlayFeatures — drawCatmullRom', () => {
  it('2 points → 1 (interpolated) line + 2 vertex points', () => {
    const pts = [P(0, 0), P(1, 1)];
    const f = buildOverlayFeatures(
      makeOverlayState({ currentState: 'drawCatmullRom', drawPoints: pts }),
    );
    const lines = f.filter((x) => x.geometry.type === 'LineString');
    expect(lines).toHaveLength(1);
  });
});

describe('buildOverlayFeatures — drawBezier', () => {
  it('0 anchors → empty', () => {
    const f = buildOverlayFeatures(
      makeOverlayState({ currentState: 'drawBezier', bezierAnchors: [] }),
    );
    expect(f).toHaveLength(0);
  });

  it('1 anchor + no preview → only vertex point (1 anchor insufficient for line)', () => {
    const f = buildOverlayFeatures(
      makeOverlayState({
        currentState: 'drawBezier',
        bezierAnchors: [A(0, 0)],
      }),
    );
    // 1 anchor = 1 vertex point, no line
    expect(f.filter((x) => x.geometry.type === 'LineString')).toHaveLength(0);
    expect(f.filter((x) => x.geometry.type === 'Point')).toHaveLength(1);
  });

  it('2 anchors → 1 bezier line + 2 vertex points', () => {
    const f = buildOverlayFeatures(
      makeOverlayState({
        currentState: 'drawBezier',
        bezierAnchors: [A(0, 0), A(1, 1)],
      }),
    );
    const lines = f.filter((x) => x.geometry.type === 'LineString');
    const points = f.filter((x) => x.geometry.type === 'Point');
    expect(lines).toHaveLength(1);
    expect(points).toHaveLength(2);
  });

  it('1 anchor + preview → bezier line preview', () => {
    const f = buildOverlayFeatures(
      makeOverlayState({
        currentState: 'drawBezier',
        bezierAnchors: [A(0, 0)],
        previewPoint: P(1, 1),
      }),
    );
    const lines = f.filter((x) => x.geometry.type === 'LineString');
    expect(lines).toHaveLength(1);
  });

  it('anchor with handles emits handle lines and handle points', () => {
    const anchorWithHandles: BezierAnchor = {
      point: P(0, 0),
      handleIn: P(-0.5, 0),
      handleOut: P(0.5, 0),
    };
    const f = buildOverlayFeatures(
      makeOverlayState({
        currentState: 'drawBezier',
        bezierAnchors: [anchorWithHandles, A(1, 0)],
      }),
    );
    // Should include handle lines and handle points
    const handlePoints = f.filter(
      (x) =>
        x.geometry.type === 'Point' && (x.properties as Record<string, unknown>)?.role === 'handle',
    );
    expect(handlePoints.length).toBeGreaterThanOrEqual(2);
  });
});

describe('buildOverlayFeatures — drawArc', () => {
  it('1 point → 1 vertex, no line', () => {
    const f = buildOverlayFeatures(
      makeOverlayState({
        currentState: 'drawArc',
        drawPoints: [P(0, 0)],
      }),
    );
    expect(f.filter((x) => x.geometry.type === 'LineString')).toHaveLength(0);
    expect(f.filter((x) => x.geometry.type === 'Point')).toHaveLength(1);
  });

  it('2 points → straight line + 2 vertices', () => {
    const f = buildOverlayFeatures(
      makeOverlayState({
        currentState: 'drawArc',
        drawPoints: [P(0, 0), P(1, 0)],
      }),
    );
    expect(f.filter((x) => x.geometry.type === 'LineString')).toHaveLength(1);
  });

  it('3 points → arc line + 3 vertices', () => {
    const f = buildOverlayFeatures(
      makeOverlayState({
        currentState: 'drawArc',
        drawPoints: [P(0, 0), P(0.005, 0.005), P(0.01, 0)],
      }),
    );
    const lines = f.filter((x) => x.geometry.type === 'LineString');
    expect(lines).toHaveLength(1);
    expect(f.filter((x) => x.geometry.type === 'Point')).toHaveLength(3);
  });

  it('2 points + preview → 3-point arc', () => {
    const f = buildOverlayFeatures(
      makeOverlayState({
        currentState: 'drawArc',
        drawPoints: [P(0, 0), P(0.005, 0.005)],
        previewPoint: P(0.01, 0),
      }),
    );
    const lines = f.filter((x) => x.geometry.type === 'LineString');
    expect(lines).toHaveLength(1);
  });
});

describe('buildOverlayFeatures — drawRotatedRect', () => {
  it('0 points → empty', () => {
    expect(
      buildOverlayFeatures(makeOverlayState({ currentState: 'drawRotatedRect' })),
    ).toHaveLength(0);
  });

  it('1 point + preview → line preview (axis)', () => {
    const f = buildOverlayFeatures(
      makeOverlayState({
        currentState: 'drawRotatedRect',
        drawPoints: [P(0, 0)],
        previewPoint: P(1, 0),
      }),
    );
    // 1 point drawn + preview: show axis line. No vertex point for the point yet
    // (the point vertex is pushed only for drawPoints, not preview)
    expect(f.filter((x) => x.geometry.type === 'LineString')).toHaveLength(1);
  });

  it('2 points → axis line + 2 vertices', () => {
    const f = buildOverlayFeatures(
      makeOverlayState({
        currentState: 'drawRotatedRect',
        drawPoints: [P(0, 0), P(1, 0)],
      }),
    );
    const lines = f.filter((x) => x.geometry.type === 'LineString');
    expect(lines).toHaveLength(1);
    expect(f.filter((x) => x.geometry.type === 'Point')).toHaveLength(2);
  });

  it('3 points → polygon + 3 vertices', () => {
    const f = buildOverlayFeatures(
      makeOverlayState({
        currentState: 'drawRotatedRect',
        drawPoints: [P(0, 0), P(0.01, 0), P(0.01, 0.005)],
      }),
    );
    const polygons = f.filter((x) => x.geometry.type === 'Polygon');
    expect(polygons).toHaveLength(1);
    expect(f.filter((x) => x.geometry.type === 'Point')).toHaveLength(3);
  });
});

describe('buildOverlayFeatures — drawPolygon', () => {
  it('1 point → 1 vertex, no line, no polygon', () => {
    const f = buildOverlayFeatures(
      makeOverlayState({
        currentState: 'drawPolygon',
        drawPoints: [P(0, 0)],
      }),
    );
    expect(f.filter((x) => x.geometry.type === 'Polygon')).toHaveLength(0);
    expect(f.filter((x) => x.geometry.type === 'LineString')).toHaveLength(0);
    expect(f.filter((x) => x.geometry.type === 'Point')).toHaveLength(1);
  });

  it('2 points → line + 2 vertices', () => {
    const f = buildOverlayFeatures(
      makeOverlayState({
        currentState: 'drawPolygon',
        drawPoints: [P(0, 0), P(1, 0)],
      }),
    );
    expect(f.filter((x) => x.geometry.type === 'LineString')).toHaveLength(1);
    expect(f.filter((x) => x.geometry.type === 'Point')).toHaveLength(2);
  });

  it('3 points → polygon + 3 vertices', () => {
    const f = buildOverlayFeatures(
      makeOverlayState({
        currentState: 'drawPolygon',
        drawPoints: [P(0, 0), P(1, 0), P(0.5, 1)],
      }),
    );
    expect(f.filter((x) => x.geometry.type === 'Polygon')).toHaveLength(1);
    expect(f.filter((x) => x.geometry.type === 'Point')).toHaveLength(3);
  });

  it('2 points + preview → polygon (3 total)', () => {
    const f = buildOverlayFeatures(
      makeOverlayState({
        currentState: 'drawPolygon',
        drawPoints: [P(0, 0), P(1, 0)],
        previewPoint: P(0.5, 1),
      }),
    );
    expect(f.filter((x) => x.geometry.type === 'Polygon')).toHaveLength(1);
  });
});
