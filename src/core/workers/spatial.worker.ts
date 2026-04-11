/**
 * Spatial Worker
 * 维护 RBush 空间索引 + GeoJSON 编译缓存，处理 hitTest
 */
import RBush from 'rbush';
import type { MapEntity } from '@/types/entities';
import type { WorkerRequest, WorkerResponse, HitResult } from './protocol';
import {
  compileColdFeatures,
  entityBBox,
  entityRenderCoords,
  isAreaEntity,
} from '@/core/geometry/compile';
import { applyLaneJunctions } from '@/core/geometry/laneJunctions';
import { pointToPolylineDist, pointToPolygonDist } from '@/core/geometry/hitTest';
import type { LngLat } from '@/core/geometry/interpolate';

interface SpatialItem {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  id: string;
  entityType: string;
}

// --- 状态 ---
const tree = new RBush<SpatialItem>();
const entityMap = new Map<string, MapEntity>();
const itemMap = new Map<string, SpatialItem>();
// Per-entity feature cache: compileColdFeatures output is memoized so that
// changing entity X doesn't re-compile entities Y and Z. Originally added
// before the Phase 7 audit discovered it — see docs below for the bits still
// unfinished.
const featureCache = new Map<string, GeoJSON.Feature[]>();
// Running count of lane entities so the hot path can short-circuit
// `applyLaneJunctions` when a scene has none. The stitching call is only
// useful when 2+ lanes share endpoints.
let laneCount = 0;

// --- 索引操作 ---

function insertEntity(entity: MapEntity) {
  entityMap.set(entity.id, entity);
  const [minX, minY, maxX, maxY] = entityBBox(entity);
  const item: SpatialItem = {
    minX,
    minY,
    maxX,
    maxY,
    id: entity.id,
    entityType: entity.entityType,
  };
  itemMap.set(entity.id, item);
  tree.insert(item);
  featureCache.set(entity.id, compileColdFeatures(entity));
  if (entity.entityType === 'lane') laneCount++;
}

function removeEntity(id: string) {
  const entity = entityMap.get(id);
  const item = itemMap.get(id);
  if (item) {
    tree.remove(item, (a, b) => a.id === b.id);
    itemMap.delete(id);
  }
  entityMap.delete(id);
  featureCache.delete(id);
  if (entity?.entityType === 'lane') laneCount = Math.max(0, laneCount - 1);
}

function buildFeatureCollection(excludeId?: string | null): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const [id, cached] of featureCache) {
    if (id === excludeId) continue;
    features.push(...cached);
  }
  // Fast path: no lanes → no junctions possible → skip the O(lanes) stitch.
  // This matches the 90% case for scenes made of polylines, polygons, and
  // signals (non-road-network editing). Future work: partial incremental
  // stitch when only a single lane changes — left for a follow-up sprint
  // because it requires tracking a per-lane endpoint dependency graph and
  // a consistency test against the full-rebuild oracle.
  if (laneCount < 2) {
    return { type: 'FeatureCollection', features };
  }
  return {
    type: 'FeatureCollection',
    features: applyLaneJunctions(features, entityMap.values(), excludeId),
  };
}

// --- hitTest ---

function hitTest(point: [number, number], radius: number): HitResult[] {
  const [px, py] = point;
  const r = Math.abs(radius);
  const candidates = tree.search({
    minX: px - r,
    minY: py - r,
    maxX: px + r,
    maxY: py + r,
  });

  const results: HitResult[] = [];
  const lngLat: LngLat = [px, py];

  for (const candidate of candidates) {
    const entity = entityMap.get(candidate.id);
    if (!entity) continue;

    const coords = entityRenderCoords(entity);
    let distance: number;

    if (isAreaEntity(entity)) {
      distance = pointToPolygonDist(lngLat, coords);
    } else {
      distance = pointToPolylineDist(lngLat, coords);
    }

    if (distance <= r) {
      results.push({ id: entity.id, entityType: entity.entityType, distance });
    }
  }

  results.sort((a, b) => a.distance - b.distance);
  return results;
}

// --- 消息处理 ---

function respond(msg: WorkerResponse) {
  postMessage(msg);
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;

  switch (req.type) {
    case 'SYNC': {
      // 全量同步：清空重建
      tree.clear();
      entityMap.clear();
      itemMap.clear();
      featureCache.clear();
      laneCount = 0;
      // Phase 8: two-pass SYNC. First pass collects bbox items + compiles
      // features without touching the RBush tree. Second pass uses
      // `tree.load(items)` which runs the STR bulk-loading algorithm
      // (O(n log n) with small constant) instead of n individual inserts
      // (which each trigger node splits / rebalancing).
      const items: SpatialItem[] = [];
      for (const entity of req.entities) {
        entityMap.set(entity.id, entity);
        const [minX, minY, maxX, maxY] = entityBBox(entity);
        const item: SpatialItem = {
          minX,
          minY,
          maxX,
          maxY,
          id: entity.id,
          entityType: entity.entityType,
        };
        itemMap.set(entity.id, item);
        items.push(item);
        featureCache.set(entity.id, compileColdFeatures(entity));
        if (entity.entityType === 'lane') laneCount++;
      }
      tree.load(items);
      respond({
        type: 'COLD_READY',
        requestId: req.requestId,
        featureCollection: buildFeatureCollection(req.excludeId),
      });
      break;
    }

    case 'INCREMENTAL': {
      for (const id of req.removed) {
        removeEntity(id);
      }
      for (const entity of req.updated) {
        removeEntity(entity.id);
        insertEntity(entity);
      }
      for (const entity of req.added) {
        insertEntity(entity);
      }
      respond({
        type: 'COLD_READY',
        requestId: req.requestId,
        featureCollection: buildFeatureCollection(req.excludeId),
      });
      break;
    }

    case 'HIT_TEST': {
      const hits = hitTest(req.point, req.radius);
      respond({
        type: 'HIT_RESULT',
        requestId: req.requestId,
        hits,
      });
      break;
    }
  }
};
