import { applyLaneJunctions } from '@/core/geometry/laneJunctions';
import type { EntityFeatureGroup } from './protocol';
import type { SpatialState } from './spatialState';

/**
 * Group features by `properties.id` for the delta encoding path.
 * Features without a string id are bucketed into `__unkeyed` so they still
 * make it to the main thread.
 */
export function groupFeaturesByEntity(features: GeoJSON.Feature[]): EntityFeatureGroup[] {
  const buckets = new Map<string, GeoJSON.Feature[]>();
  for (const f of features) {
    const id = typeof f.properties?.id === 'string' ? (f.properties.id as string) : '__unkeyed';
    let bucket = buckets.get(id);
    if (!bucket) {
      bucket = [];
      buckets.set(id, bucket);
    }
    bucket.push(f);
  }
  return Array.from(buckets, ([id, fts]) => ({ id, features: fts }));
}

/**
 * Build the worker-side cold feature collection.
 *
 * - SYNC: full rebuild, clears decorationCache and re-decorates every lane.
 * - INCREMENTAL: refreshes only affected lane decoration and merges cached
 *   decoration for unaffected lanes.
 */
export function buildFeatureCollection(
  state: SpatialState,
  excludeId?: string | null,
  affectedLaneIds?: Set<string> | null,
): GeoJSON.FeatureCollection {
  const inputFeatures: GeoJSON.Feature[] = [];
  for (const [id, cached] of state.featureCache) {
    if (id === excludeId) continue;
    inputFeatures.push(...cached);
  }

  if (state.laneCount < 1) {
    state.decorationCache.clear();
    return { type: 'FeatureCollection', features: inputFeatures };
  }

  const isIncremental = affectedLaneIds != null && affectedLaneIds.size > 0;
  const decorateOnly = isIncremental ? affectedLaneIds : null;

  const stitched = applyLaneJunctions(
    inputFeatures,
    state.entityMap.values(),
    excludeId,
    decorateOnly,
  );

  if (isIncremental) {
    for (const id of affectedLaneIds!) state.decorationCache.delete(id);
  } else {
    state.decorationCache.clear();
  }

  for (const f of stitched) {
    if (f.properties?.role !== 'laneBoundaryDecor') continue;
    const id = f.properties?.id;
    if (typeof id !== 'string') continue;
    if (isIncremental && !affectedLaneIds!.has(id)) continue;
    let bucket = state.decorationCache.get(id);
    if (!bucket) {
      bucket = [];
      state.decorationCache.set(id, bucket);
    }
    bucket.push(f);
  }

  if (isIncremental) {
    for (const [id, decoration] of state.decorationCache) {
      if (affectedLaneIds!.has(id)) continue;
      stitched.push(...decoration);
    }
  }

  return { type: 'FeatureCollection', features: stitched };
}
