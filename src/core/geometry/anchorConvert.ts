import type { BezierAnchor } from './interpolate';
import type { BezierAnchorData } from '@/types/entities';
import { toLngLat, toGeoPoint } from './coords';

/** BezierAnchorData (store) → BezierAnchor (runtime LngLat) */
export function anchorToRuntime(a: BezierAnchorData): BezierAnchor {
  return {
    point: toLngLat(a.point),
    handleIn: a.handleIn ? toLngLat(a.handleIn) : null,
    handleOut: a.handleOut ? toLngLat(a.handleOut) : null,
  };
}

/** BezierAnchor (runtime LngLat) → BezierAnchorData (store) */
export function anchorToData(a: BezierAnchor): BezierAnchorData {
  return {
    point: toGeoPoint(a.point),
    handleIn: a.handleIn ? toGeoPoint(a.handleIn) : null,
    handleOut: a.handleOut ? toGeoPoint(a.handleOut) : null,
  };
}
