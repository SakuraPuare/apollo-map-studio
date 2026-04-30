import type { LngLat } from '@/core/geometry/interpolate';
import { entityRenderCoords, isAreaEntity } from '@/core/geometry/compile';
import { pointToPolylineDistGeo, pointToPolygonDistGeo } from '@/core/geometry/hitTest';
import type { HitResult } from './protocol';
import type { SpatialState } from './spatialState';

/**
 * Pick priority: lower tier wins ties when multiple entity types fall inside
 * hit radius. Mirrors the cold-layer render stack (small symbols on top, big
 * areas on the bottom) so a click on a signal icon never gets stolen by the
 * junction polygon underneath.
 */
const PICK_TIER: Record<string, number> = {
  signal: 0,
  stopSign: 0,
  yieldSign: 0,
  rsu: 0,
  barrierGate: 0,
  speedControl: 0,
  crosswalk: 1,
  speedBump: 1,
  parkingSpace: 1,
  lane: 2,
  road: 2,
  overlap: 2,
  clearArea: 3,
  junction: 3,
  pncJunction: 3,
  parkingLot: 3,
  area: 3,
};

const DEFAULT_TIER = 9;

function pickTier(entityType: string): number {
  return PICK_TIER[entityType] ?? DEFAULT_TIER;
}

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

  results.sort((a, b) => {
    const ta = pickTier(a.entityType);
    const tb = pickTier(b.entityType);
    if (ta !== tb) return ta - tb;
    return a.distance - b.distance;
  });
  return results;
}
