import { haversineMeters } from '@/lib/geo';
import type { LngLat } from './interpolate';

export const NEAR_DUPLICATE_DRAW_POINT_METERS = 0.5;
export const DRAW_FINISH_CLUSTER_METERS = 3;

const POLYLINE_POINT_DRAW_STATES = new Set(['drawPolyline', 'drawCatmullRom']);

export function isPolylinePointDrawState(state: string): boolean {
  return POLYLINE_POINT_DRAW_STATES.has(state);
}

export function areDrawPointsNear(
  a: LngLat,
  b: LngLat,
  toleranceMeters = NEAR_DUPLICATE_DRAW_POINT_METERS,
): boolean {
  return haversineMeters({ x: a[0], y: a[1] }, { x: b[0], y: b[1] }) < toleranceMeters;
}

export function appendDistinctPolylineDrawPoint(points: LngLat[], point: LngLat): LngLat[] {
  const previous = points[points.length - 1];
  if (previous && areDrawPointsNear(previous, point)) return points;
  return [...points, point];
}

export interface NormalizePolylineDrawPointsOptions {
  finishClusterMeters?: number;
}

function collapseTrailingFinishCluster(points: LngLat[], finishClusterMeters: number): LngLat[] {
  if (points.length < 3 || finishClusterMeters <= 0) return points;

  const last = points[points.length - 1]!;
  let clusterStart = points.length - 1;
  while (
    clusterStart > 0 &&
    areDrawPointsNear(points[clusterStart - 1]!, last, finishClusterMeters)
  ) {
    clusterStart--;
  }

  if (clusterStart === points.length - 1 || clusterStart === 0) return points;
  if (areDrawPointsNear(points[clusterStart - 1]!, points[clusterStart]!, finishClusterMeters)) {
    return points;
  }

  return points.slice(0, clusterStart + 1);
}

export function normalizePolylineDrawPoints(
  state: string,
  points: LngLat[],
  options: NormalizePolylineDrawPointsOptions = {},
): LngLat[] {
  if (!isPolylinePointDrawState(state) || points.length < 2) return points;

  let changed = false;
  const normalized: LngLat[] = [];
  for (const point of points) {
    const previous = normalized[normalized.length - 1];
    if (previous && areDrawPointsNear(previous, point)) {
      changed = true;
      continue;
    }
    normalized.push(point);
  }

  const clustered = collapseTrailingFinishCluster(
    normalized,
    options.finishClusterMeters ?? DRAW_FINISH_CLUSTER_METERS,
  );
  if (clustered !== normalized) return clustered;
  return changed ? normalized : points;
}
