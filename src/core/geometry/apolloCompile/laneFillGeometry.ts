import { toLngLat } from '@/core/geometry/coords';
import type { LngLat } from '@/core/geometry/interpolate';
import {
  polygonGeometry,
  polylineSelfIntersects,
  unionPolygonGeometry,
} from '@/core/geometry/polygonGeometry';
import type { GeoPoint } from '@/types/entities';
import { offsetPolylineDeg } from './offsetPolyline';

export interface LaneFillGeometryInput {
  centerPts: readonly GeoPoint[];
  leftEdge: readonly GeoPoint[];
  rightEdge: readonly GeoPoint[];
  leftWidthMeters: number;
  rightWidthMeters: number;
  syntheticEdges: boolean;
}

export function laneFillGeometry({
  centerPts,
  leftEdge,
  rightEdge,
  leftWidthMeters,
  rightWidthMeters,
  syntheticEdges,
}: LaneFillGeometryInput): GeoJSON.Polygon | GeoJSON.MultiPolygon | null {
  if (leftEdge.length < 2 || rightEdge.length < 2) return null;
  const leftCoords = leftEdge.map(toLngLat);
  const rightCoords = rightEdge.map(toLngLat);
  const wholeRing = [...leftCoords, ...[...rightCoords].reverse()];
  if (!syntheticEdges) return polygonGeometry(wholeRing);

  const centerCoords = centerPts.map(toLngLat);
  if (!shouldSegmentSyntheticLaneFill(centerCoords)) return polygonGeometry(wholeRing);

  const rings =
    leftEdge.length === rightEdge.length
      ? laneSegmentRingsFromEdges(leftCoords, rightCoords)
      : laneSegmentRingsFromCenterline(centerPts, leftWidthMeters, rightWidthMeters);
  if (rings.length === 0) return polygonGeometry(wholeRing);
  return unionPolygonGeometry(rings) ?? polygonGeometry(wholeRing);
}

function shouldSegmentSyntheticLaneFill(centerCoords: readonly LngLat[]): boolean {
  return polylineSelfIntersects(centerCoords) || polylineNearlyCloses(centerCoords);
}

function polylineNearlyCloses(coords: readonly LngLat[]): boolean {
  if (coords.length < 4) return false;
  const first = coords[0]!;
  const last = coords[coords.length - 1]!;
  const length = polylineLength(coords);
  if (length <= 1e-12) return false;
  return pointDistance(first, last) / length <= 0.08;
}

function polylineLength(coords: readonly LngLat[]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) total += pointDistance(coords[i - 1]!, coords[i]!);
  return total;
}

function pointDistance(a: LngLat, b: LngLat): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function laneSegmentRingsFromEdges(
  leftEdge: readonly LngLat[],
  rightEdge: readonly LngLat[],
): LngLat[][] {
  const rings: LngLat[][] = [];
  const segmentCount = Math.min(leftEdge.length, rightEdge.length) - 1;
  for (let i = 0; i < segmentCount; i++) {
    pushRingIfValid(rings, [leftEdge[i]!, leftEdge[i + 1]!, rightEdge[i + 1]!, rightEdge[i]!]);
  }
  return rings;
}

function laneSegmentRingsFromCenterline(
  centerPts: readonly GeoPoint[],
  leftWidthMeters: number,
  rightWidthMeters: number,
): LngLat[][] {
  const rings: LngLat[][] = [];
  for (let i = 0; i < centerPts.length - 1; i++) {
    const segment = [centerPts[i]!, centerPts[i + 1]!];
    const left = offsetPolylineDeg(segment, leftWidthMeters, 'left');
    const right = offsetPolylineDeg(segment, rightWidthMeters, 'right');
    if (left.length < 2 || right.length < 2) continue;
    pushRingIfValid(rings, [
      toLngLat(left[0]!),
      toLngLat(left[1]!),
      toLngLat(right[1]!),
      toLngLat(right[0]!),
    ]);
  }
  return rings;
}

function pushRingIfValid(rings: LngLat[][], ring: LngLat[]): void {
  if (ringAreaAbs(ring) > 1e-18) rings.push(ring);
}

function ringAreaAbs(ring: readonly LngLat[]): number {
  let area2 = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j]!;
    const b = ring[i]!;
    area2 += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(area2 / 2);
}
