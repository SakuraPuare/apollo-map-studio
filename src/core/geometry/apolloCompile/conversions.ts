import type { Curve, CurveSegment, LineSegment, ApolloPolygon } from '@/types/apollo';
import type { GeoPoint } from '@/types/entities';

export function pointsToCurve(points: GeoPoint[]): Curve {
  const seg: CurveSegment = {
    lineSegment: { points } as LineSegment,
    s: 0,
    startPosition: points[0] ?? { x: 0, y: 0 },
    heading: 0,
    length: 0,
  };
  return { segments: [seg] };
}

export function pointsToPolygon(points: GeoPoint[]): ApolloPolygon {
  return { points };
}
