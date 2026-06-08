import { describe, expect, it } from 'vitest';
import {
  bboxOverlap,
  bboxUnion,
  pointInPolygon,
  polylineIntersectsPolygon,
  polylinePolygonCrossings,
  polylinePolylineCrossings,
  polylinesIntersect,
  segmentsIntersect,
} from '../intersect';
import { pt } from './testHelpers';

describe('intersect edge cases', () => {
  it('unions bboxes and treats empty bbox groups as absent', () => {
    expect(bboxUnion([])).toBeNull();
    expect(
      bboxUnion([
        { minX: 1, minY: 2, maxX: 3, maxY: 4 },
        { minX: -1, minY: 3, maxX: 2, maxY: 8 },
      ]),
    ).toEqual({ minX: -1, minY: 2, maxX: 3, maxY: 8 });
  });

  it('counts touching bbox edges as overlap', () => {
    expect(
      bboxOverlap({ minX: 0, minY: 0, maxX: 1, maxY: 1 }, { minX: 1, minY: 1, maxX: 2, maxY: 2 }),
    ).toBe(true);
  });

  it('handles endpoint intersections, collinear overlaps, and zero-length segments', () => {
    expect(segmentsIntersect(pt(0, 0), pt(1, 0), pt(1, 0), pt(1, 1))).toEqual(pt(1, 0));
    expect(segmentsIntersect(pt(0, 0), pt(2, 0), pt(1, 0), pt(3, 0))).toBeNull();
    expect(segmentsIntersect(pt(0, 0), pt(0, 0), pt(-1, -1), pt(1, 1))).toBeNull();
  });

  it('returns false for degenerate polylines and polygons', () => {
    expect(polylinesIntersect([pt(0, 0)], [pt(0, 0), pt(1, 1)])).toBe(false);
    expect(polylineIntersectsPolygon([pt(0, 0), pt(1, 1)], [pt(0, 0), pt(1, 0)])).toBe(false);
    expect(pointInPolygon(pt(0, 0), [])).toBe(false);
  });

  it('detects a polyline ending inside a polygon', () => {
    const square = [pt(0, 0), pt(2, 0), pt(2, 2), pt(0, 2)];
    expect(polylineIntersectsPolygon([pt(-1, 1), pt(1, 1)], square)).toBe(true);
  });

  it('returns sorted polygon crossings across multiple line segments', () => {
    const square = [pt(0, 0), pt(4, 0), pt(4, 4), pt(0, 4)];
    const crossings = polylinePolygonCrossings([pt(-1, 2), pt(2, 2), pt(5, 2)], square);

    expect(crossings).toHaveLength(2);
    expect(crossings[0]?.segmentIndex).toBe(0);
    expect(crossings[0]?.t).toBeCloseTo(1 / 3);
    expect(crossings[1]?.segmentIndex).toBe(1);
    expect(crossings[1]?.t).toBeCloseTo(2 / 3);
  });

  it('reports line-line crossing params and ignores degenerate inputs', () => {
    expect(polylinePolylineCrossings([pt(0, 0)], [pt(0, 0), pt(1, 0)])).toEqual([]);

    const crossings = polylinePolylineCrossings(
      [pt(0, 0), pt(1, 0), pt(2, 0)],
      [pt(0.5, -1), pt(0.5, 1), pt(1.5, 1), pt(1.5, -1)],
    );

    expect(crossings).toEqual([
      { segmentIndex: 0, t: 0.5 },
      { segmentIndex: 1, t: 0.5 },
    ]);
  });
});
