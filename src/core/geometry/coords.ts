/**
 * 统一坐标转换：GeoPoint ↔ LngLat
 * 消除散落各处的 .map(p => [p.x, p.y]) 样板代码
 */
import type { GeoPoint } from '@/types/entities';
import type { LngLat } from './interpolate';

/** GeoPoint → LngLat */
export function toLngLat(p: GeoPoint): LngLat {
  return [p.x, p.y];
}

/** LngLat → GeoPoint */
export function toGeoPoint(p: LngLat): GeoPoint {
  return { x: p[0], y: p[1] };
}

/** GeoPoint[] → LngLat[] */
export function pointsToCoords(points: GeoPoint[]): LngLat[] {
  return points.map(toLngLat);
}

/** LngLat[] → GeoPoint[] */
export function coordsToPoints(coords: LngLat[]): GeoPoint[] {
  return coords.map(toGeoPoint);
}
