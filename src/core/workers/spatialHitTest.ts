import type { LngLat } from '@/core/geometry/interpolate';
import { entityRenderCoords, isAreaEntity } from '@/core/geometry/compile';
import { pointToPolylineDistGeo, pointToPolygonDistGeo } from '@/core/geometry/hitTest';
import type { HitResult } from './protocol';
import type { SpatialState } from './spatialState';

/**
 * High-latitude hit testing works in equivalent lng-degree space:
 * lng deltas are left as-is and lat deltas are scaled by 1 / cos(lat).
 */
export function hitTest(state: SpatialState, point: [number, number], radius: number): HitResult[] {
  const [px, py] = point;
  const r = Math.abs(radius);
  const cosLat = Math.max(Math.cos((py * Math.PI) / 180), 1e-6);
  const rLat = r * cosLat;

  const candidates = state.tree.search({
    minX: px - r,
    minY: py - rLat,
    maxX: px + r,
    maxY: py + rLat,
  });

  const results: HitResult[] = [];
  const lngLat: LngLat = [px, py];

  for (const candidate of candidates) {
    const entity = state.entityMap.get(candidate.id);
    if (!entity) continue;

    const coords = entityRenderCoords(entity);
    const distance = isAreaEntity(entity)
      ? pointToPolygonDistGeo(lngLat, coords, cosLat)
      : pointToPolylineDistGeo(lngLat, coords, cosLat);

    if (distance <= r) {
      results.push({ id: entity.id, entityType: entity.entityType, distance });
    }
  }

  results.sort((a, b) => a.distance - b.distance);
  return results;
}
