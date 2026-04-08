import type { BezierAnchor, LngLat } from './interpolate';
import type { BezierAnchorData, PointENU } from '@/types/entities';

function pToLngLat(p: PointENU): LngLat {
  return [p.x, p.y];
}

function pFromLngLat(p: LngLat): PointENU {
  return { x: p[0], y: p[1] };
}

/** BezierAnchorData (store) → BezierAnchor (runtime LngLat) */
export function anchorToRuntime(a: BezierAnchorData): BezierAnchor {
  return {
    point: pToLngLat(a.point),
    handleIn: a.handleIn ? pToLngLat(a.handleIn) : null,
    handleOut: a.handleOut ? pToLngLat(a.handleOut) : null,
  };
}

/** BezierAnchor (runtime LngLat) → BezierAnchorData (store) */
export function anchorToData(a: BezierAnchor): BezierAnchorData {
  return {
    point: pFromLngLat(a.point),
    handleIn: a.handleIn ? pFromLngLat(a.handleIn) : null,
    handleOut: a.handleOut ? pFromLngLat(a.handleOut) : null,
  };
}
