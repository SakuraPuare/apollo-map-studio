import type { Curve, LaneEntity } from '@/types/apollo';
import type { GeoPoint } from '@/types/entities';

export interface LaneBoundaryEdges {
  left: GeoPoint[];
  right: GeoPoint[];
}

export function curvePoints(curve: Curve | undefined): GeoPoint[] {
  const out: GeoPoint[] = [];
  for (const segment of curve?.segments ?? []) {
    for (const point of segment.lineSegment.points) {
      const prev = out[out.length - 1];
      if (prev && prev.x === point.x && prev.y === point.y) continue;
      out.push(point);
    }
  }
  return out;
}

function distanceSqDeg(a: GeoPoint, b: GeoPoint): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function orientToCenterline(points: GeoPoint[], centerline: GeoPoint[]): GeoPoint[] {
  if (points.length < 2 || centerline.length < 2) return points;
  const centerStart = centerline[0]!;
  const centerEnd = centerline[centerline.length - 1]!;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const forwardCost = distanceSqDeg(first, centerStart) + distanceSqDeg(last, centerEnd);
  const reverseCost = distanceSqDeg(first, centerEnd) + distanceSqDeg(last, centerStart);
  return reverseCost < forwardCost ? [...points].reverse() : points;
}

function boundaryArea2Deg(left: GeoPoint[], right: GeoPoint[]): number {
  const ring = [...left, ...[...right].reverse()];
  const origin = ring[0];
  if (!origin) return 0;
  let area2 = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    area2 += (a.x - origin.x) * (b.y - origin.y) - (b.x - origin.x) * (a.y - origin.y);
  }
  return area2;
}

/**
 * Imported Apollo maps often carry real lane boundary polylines whose point
 * counts differ from central_curve. Prefer those over synthetic center offsets
 * whenever both sides are present and form a non-degenerate corridor;
 * editor-created lanes leave them empty, and some tests/legacy fixtures store
 * centerline placeholders in boundary.curve.
 */
export function explicitLaneBoundaryEdges(lane: LaneEntity): LaneBoundaryEdges | null {
  const left = curvePoints(lane.leftBoundary.curve);
  const right = curvePoints(lane.rightBoundary.curve);
  if (left.length < 2 || right.length < 2) return null;

  const centerline = curvePoints(lane.centralCurve);
  const orientedLeft = orientToCenterline(left, centerline);
  const orientedRight = orientToCenterline(right, centerline);
  if (Math.abs(boundaryArea2Deg(orientedLeft, orientedRight)) <= 1e-18) return null;

  return {
    left: orientedLeft,
    right: orientedRight,
  };
}
