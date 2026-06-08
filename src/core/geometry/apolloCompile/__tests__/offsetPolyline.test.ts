import { describe, expect, it } from 'vitest';
import type { GeoPoint } from '@/types/entities';
import { __offsetPolylineInternals, offsetPolylineDeg } from '../offsetPolyline';

const DEG_TO_M = 111320;

function point(x: number, y: number, z?: number): GeoPoint {
  return z === undefined ? { x, y } : { x, y, z };
}

function midLat(points: GeoPoint[]): number {
  return points.reduce((sum, p) => sum + p.y, 0) / points.length;
}

function cosLat(points: GeoPoint[]): number {
  return Math.cos((midLat(points) * Math.PI) / 180);
}

function metersPerLngAt(lat: number): number {
  return Math.cos((lat * Math.PI) / 180) * DEG_TO_M;
}

function toMeters(p: GeoPoint, reference: GeoPoint[]): [number, number] {
  return [p.x * cosLat(reference) * DEG_TO_M, p.y * DEG_TO_M];
}

function signedDistanceMeters(
  q: GeoPoint,
  a: GeoPoint,
  b: GeoPoint,
  reference: GeoPoint[],
): number {
  const [qx, qy] = toMeters(q, reference);
  const [ax, ay] = toMeters(a, reference);
  const [bx, by] = toMeters(b, reference);
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);

  return (dx * (qy - ay) - dy * (qx - ax)) / len;
}

describe('offsetPolylineDeg', () => {
  it('returns the original point array for short lines and non-positive widths', () => {
    const empty: GeoPoint[] = [];
    const single = [point(121, 31)];
    const line = [point(121, 31), point(121.001, 31)];

    expect(offsetPolylineDeg(empty, 3, 'left')).toBe(empty);
    expect(offsetPolylineDeg(single, 3, 'right')).toBe(single);
    expect(offsetPolylineDeg(line, 0, 'left')).toBe(line);
    expect(offsetPolylineDeg(line, -1, 'right')).toBe(line);
  });

  it('handles zero-length segments with finite offsets and preserved z values', () => {
    const source = [point(10, 20, 4), point(10, 20, 5)];
    const left = offsetPolylineDeg(source, 2, 'left');
    const right = offsetPolylineDeg(source, 2, 'right');

    expect(left.map((p) => p.z)).toEqual([4, 5]);
    expect(right.map((p) => p.z)).toEqual([4, 5]);
    expect(left[0]?.x).toBeCloseTo(10, 12);
    expect(left[1]?.x).toBeCloseTo(10, 12);
    expect(right[0]?.x).toBeCloseTo(10, 12);
    expect(right[1]?.x).toBeCloseTo(10, 12);
    expect(left[0]?.y).toBeCloseTo(20 + 2 / DEG_TO_M, 12);
    expect(left[1]?.y).toBeCloseTo(20 + 2 / DEG_TO_M, 12);
    expect(right[0]?.y).toBeCloseTo(20 - 2 / DEG_TO_M, 12);
    expect(right[1]?.y).toBeCloseTo(20 - 2 / DEG_TO_M, 12);
    expect([...left, ...right].every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(
      true,
    );
  });

  it('keeps straight eastbound offsets parallel and symmetric on left and right sides', () => {
    const width = 3.5;
    const lat = 30;
    const mPerLng = metersPerLngAt(lat);
    const source = [
      point(116, lat),
      point(116 + 50 / mPerLng, lat),
      point(116 + 125 / mPerLng, lat),
    ];

    const left = offsetPolylineDeg(source, width, 'left');
    const right = offsetPolylineDeg(source, width, 'right');

    expect(left).toHaveLength(source.length);
    expect(right).toHaveLength(source.length);
    for (let i = 0; i < source.length; i++) {
      expect(left[i]?.x).toBeCloseTo(source[i]!.x, 12);
      expect(right[i]?.x).toBeCloseTo(source[i]!.x, 12);
      expect(left[i]!.y - source[i]!.y).toBeCloseTo(width / DEG_TO_M, 12);
      expect(right[i]!.y - source[i]!.y).toBeCloseTo(-width / DEG_TO_M, 12);
      expect(signedDistanceMeters(left[i]!, source[0]!, source[2]!, source)).toBeCloseTo(width, 6);
      expect(signedDistanceMeters(right[i]!, source[0]!, source[2]!, source)).toBeCloseTo(
        -width,
        6,
      );
    }
  });

  it('uses exact miter joins for a 90 degree bend on both sides', () => {
    const width = 4;
    const lat = 30;
    const start = point(116, lat);
    const corner = point(116 + 100 / metersPerLngAt(lat), lat);
    const end = point(corner.x, lat + 100 / DEG_TO_M);
    const source = [start, corner, end];

    const left = offsetPolylineDeg(source, width, 'left');
    const right = offsetPolylineDeg(source, width, 'right');
    const [cornerMx, cornerMy] = toMeters(corner, source);
    const [leftMx, leftMy] = toMeters(left[1]!, source);
    const [rightMx, rightMy] = toMeters(right[1]!, source);

    expect(left).toHaveLength(3);
    expect(right).toHaveLength(3);
    expect(leftMx).toBeCloseTo(cornerMx - width, 6);
    expect(leftMy).toBeCloseTo(cornerMy + width, 6);
    expect(rightMx).toBeCloseTo(cornerMx + width, 6);
    expect(rightMy).toBeCloseTo(cornerMy - width, 6);
  });

  it('bevels only the outside of a sharp turn and keeps the inside as one join point', () => {
    const width = 3.5;
    const lat = 30;
    const segLen = 100;
    const turnRad = (150 * Math.PI) / 180;
    const p0 = point(116, lat);
    const p1 = point(116 + segLen / metersPerLngAt(lat), lat);
    const p2 = point(
      p1.x + (segLen * Math.cos(turnRad)) / metersPerLngAt(lat),
      p1.y + (segLen * Math.sin(turnRad)) / DEG_TO_M,
    );
    const source = [p0, p1, p2];

    const left = offsetPolylineDeg(source, width, 'left');
    const right = offsetPolylineDeg(source, width, 'right');

    expect(left).toHaveLength(5);
    expect(right).toHaveLength(3);
    expect(signedDistanceMeters(right[1]!, p0, p1, source)).toBeLessThan(0);
    expect(left.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  });

  it('uses the source mid-latitude cosine for northbound offsets near the pole', () => {
    const width = 6;
    const source = [point(12, 84.8), point(12, 85.2)];
    const expectedLngDelta = width / metersPerLngAt(85);

    const left = offsetPolylineDeg(source, width, 'left');
    const right = offsetPolylineDeg(source, width, 'right');

    expect(expectedLngDelta).toBeGreaterThan((width / DEG_TO_M) * 10);
    expect(left[0]?.x).toBeCloseTo(12 - expectedLngDelta, 10);
    expect(left[1]?.x).toBeCloseTo(12 - expectedLngDelta, 10);
    expect(right[0]?.x).toBeCloseTo(12 + expectedLngDelta, 10);
    expect(right[1]?.x).toBeCloseTo(12 + expectedLngDelta, 10);
    expect(left[0]?.y).toBeCloseTo(source[0]!.y, 12);
    expect(right[1]?.y).toBeCloseTo(source[1]!.y, 12);
  });

  it('handles near-180-degree inner joins without producing infinite miter coordinates', () => {
    const lat = 30;
    const source = [
      point(116, lat),
      point(116 + 30 / metersPerLngAt(lat), lat),
      point(116 - 0.1 / metersPerLngAt(lat), lat + 0.01 / DEG_TO_M),
    ];

    const right = offsetPolylineDeg(source, 4, 'right');

    expect(right).toHaveLength(3);
    expect(right.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
    expect(Math.abs(signedDistanceMeters(right[1]!, source[0]!, source[1]!, source))).toBeLessThan(
      5,
    );
  });

  it('collapses self-intersecting offset loops at the segment crossing', () => {
    const loop = [
      point(0, 0),
      point(10 / DEG_TO_M, 10 / DEG_TO_M),
      point(0, 10 / DEG_TO_M),
      point(10 / DEG_TO_M, 0),
    ];

    const collapsed = __offsetPolylineInternals.collapseOffsetLoops(loop, 1);

    expect(collapsed.length).toBeLessThan(loop.length);
    expect(collapsed.some((p) => p.x > 0 && p.y > 0)).toBe(true);
  });

  it('dedupes projected points and ignores parallel or endpoint-only intersections', () => {
    const deduped = __offsetPolylineInternals.dedupeProjected([
      { x: 0, y: 0 },
      { x: 1e-7, y: 1e-7 },
      { x: 2, y: 0 },
    ]);

    expect(deduped).toEqual([
      { x: 0, y: 0 },
      { x: 2, y: 0 },
    ]);
    expect(
      __offsetPolylineInternals.segmentIntersection(
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 0, y: 1 },
        { x: 1, y: 1 },
      ),
    ).toBeNull();
    expect(
      __offsetPolylineInternals.segmentIntersection(
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
      ),
    ).toBeNull();
    expect(
      __offsetPolylineInternals.segmentIntersection(
        { x: 0, y: 0 },
        { x: 2, y: 2 },
        { x: 0, y: 2 },
        { x: 2, y: 0 },
      ),
    ).toEqual({ x: 1, y: 1 });
  });

  it('falls back to midpoint dense joins when offset lines are parallel', () => {
    const join = __offsetPolylineInternals.denseJoin(
      {
        start: [0, 0],
        end: [10, 0],
        dir: [1, 0],
        normal: [0, 1],
      },
      {
        start: [10, 0],
        end: [20, 0],
        dir: [1, 0],
        normal: [0, 1],
      },
      2,
    );

    expect(join).toEqual({ x: 10, y: 2 });
  });

  it('rebuilds dense offsets after removing collapsed interior segments', () => {
    const sourcePts: Array<[number, number]> = [
      [0, 0],
      [10, 0],
      [9, 0],
      [20, 0],
    ];
    const segN: Array<[number, number]> = [
      [0, 1],
      [0, 1],
      [0, 1],
    ];

    const rebuilt = __offsetPolylineInternals.rebuildDenseOffset(sourcePts, segN, 1, 1);

    expect(rebuilt.length).toBeGreaterThanOrEqual(2);
    expect(rebuilt.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
    expect(rebuilt[0]!.y).toBeCloseTo(1 / DEG_TO_M, 12);
    expect(rebuilt[rebuilt.length - 1]!.y).toBeCloseTo(1 / DEG_TO_M, 12);
  });
});
