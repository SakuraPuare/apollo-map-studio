import { describe, it, expect } from 'vitest';
import {
  bboxOfPoints,
  bboxOverlap,
  segmentsIntersect,
  pointInPolygon,
  polylinesIntersect,
  polylineIntersectsPolygon,
  polylinePolygonCrossings,
  endpointsCoincide,
} from '../intersect';
import type { GeoPoint } from '@/types/entities';

const p = (x: number, y: number): GeoPoint => ({ x, y });

describe('bboxOfPoints', () => {
  it('returns expanded bbox over all points', () => {
    const b = bboxOfPoints([p(0, 0), p(2, 1), p(-1, 3)]);
    expect(b).toEqual({ minX: -1, minY: 0, maxX: 2, maxY: 3 });
  });

  it('handles padding', () => {
    const b = bboxOfPoints([p(0, 0), p(1, 1)], 0.5);
    expect(b).toEqual({ minX: -0.5, minY: -0.5, maxX: 1.5, maxY: 1.5 });
  });

  it('returns null on empty input (no spurious origin bbox)', () => {
    expect(bboxOfPoints([])).toBeNull();
  });
});

describe('bboxOverlap', () => {
  it('detects overlapping bboxes', () => {
    expect(
      bboxOverlap({ minX: 0, minY: 0, maxX: 2, maxY: 2 }, { minX: 1, minY: 1, maxX: 3, maxY: 3 }),
    ).toBe(true);
  });
  it('detects disjoint bboxes', () => {
    expect(
      bboxOverlap({ minX: 0, minY: 0, maxX: 1, maxY: 1 }, { minX: 2, minY: 2, maxX: 3, maxY: 3 }),
    ).toBe(false);
  });
});

describe('segmentsIntersect', () => {
  it('finds intersection of crossing segments', () => {
    const hit = segmentsIntersect(p(0, 0), p(2, 2), p(0, 2), p(2, 0));
    expect(hit).not.toBeNull();
    expect(hit!.x).toBeCloseTo(1);
    expect(hit!.y).toBeCloseTo(1);
  });
  it('returns null for parallel segments', () => {
    expect(segmentsIntersect(p(0, 0), p(1, 0), p(0, 1), p(1, 1))).toBeNull();
  });
  it('returns null when segments do not overlap on parameter range', () => {
    expect(segmentsIntersect(p(0, 0), p(1, 0), p(2, -1), p(2, 1))).toBeNull();
  });
});

describe('pointInPolygon', () => {
  const square: GeoPoint[] = [p(0, 0), p(4, 0), p(4, 4), p(0, 4)];
  it('inside point', () => {
    expect(pointInPolygon(p(2, 2), square)).toBe(true);
  });
  it('outside point', () => {
    expect(pointInPolygon(p(5, 2), square)).toBe(false);
  });
  it('degenerate polygon returns false', () => {
    expect(pointInPolygon(p(0, 0), [p(0, 0), p(1, 1)])).toBe(false);
  });
});

describe('polylinesIntersect', () => {
  it('detects crossing polylines', () => {
    const a: GeoPoint[] = [p(0, 0), p(2, 2)];
    const b: GeoPoint[] = [p(0, 2), p(2, 0)];
    expect(polylinesIntersect(a, b)).toBe(true);
  });
  it('returns false for non-crossing polylines', () => {
    const a: GeoPoint[] = [p(0, 0), p(2, 0)];
    const b: GeoPoint[] = [p(0, 1), p(2, 1)];
    expect(polylinesIntersect(a, b)).toBe(false);
  });
});

describe('polylineIntersectsPolygon', () => {
  const square: GeoPoint[] = [p(0, 0), p(4, 0), p(4, 4), p(0, 4)];
  it('detects polyline crossing polygon', () => {
    const line: GeoPoint[] = [p(-1, 2), p(5, 2)];
    expect(polylineIntersectsPolygon(line, square)).toBe(true);
  });
  it('detects polyline starting inside', () => {
    const line: GeoPoint[] = [p(2, 2), p(10, 10)];
    expect(polylineIntersectsPolygon(line, square)).toBe(true);
  });
  it('returns false when line is fully outside', () => {
    const line: GeoPoint[] = [p(-2, -2), p(-1, -1)];
    expect(polylineIntersectsPolygon(line, square)).toBe(false);
  });
});

describe('polylinePolygonCrossings', () => {
  it('returns no crossings for degenerate lines or polygons', () => {
    const square: GeoPoint[] = [p(0, 0), p(4, 0), p(4, 4), p(0, 4)];

    expect(polylinePolygonCrossings([p(0, 0)], square)).toEqual([]);
    expect(polylinePolygonCrossings([p(0, 0), p(1, 1)], [p(0, 0), p(1, 0)])).toEqual([]);
  });

  it('returns sorted crossings of horizontal cut', () => {
    const square: GeoPoint[] = [p(0, 0), p(4, 0), p(4, 4), p(0, 4)];
    const line: GeoPoint[] = [p(-1, 2), p(5, 2)];
    const crossings = polylinePolygonCrossings(line, square);
    expect(crossings.length).toBe(2);
    // The ordering by segmentIndex/t should be ascending
    for (let i = 1; i < crossings.length; i++) {
      expect(crossings[i]!.t).toBeGreaterThanOrEqual(crossings[i - 1]!.t);
    }
  });
});

describe('endpointsCoincide', () => {
  it('treats co-located points as coincident', () => {
    expect(endpointsCoincide(p(116.4, 39.9), p(116.4, 39.9), Math.cos(0.7), 0.5)).toBe(true);
  });
  it('treats distant points as non-coincident', () => {
    expect(endpointsCoincide(p(116.4, 39.9), p(116.41, 39.9), Math.cos(0.7), 0.5)).toBe(false);
  });
});
