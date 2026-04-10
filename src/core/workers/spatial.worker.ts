/**
 * Spatial Worker
 * 维护 RBush 空间索引 + GeoJSON 编译缓存，处理 hitTest
 */
import RBush from 'rbush';
import type { MapEntity } from '@/types/entities';
import type { WorkerRequest, WorkerResponse, HitResult } from './protocol';
import { compileColdFeatures, entityBBox, entityRenderCoords, isAreaEntity } from '@/core/geometry/compile';
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
const featureCache = new Map<string, GeoJSON.Feature[]>();

// --- 索引操作 ---

function insertEntity(entity: MapEntity) {
  entityMap.set(entity.id, entity);
  const [minX, minY, maxX, maxY] = entityBBox(entity);
  const item: SpatialItem = { minX, minY, maxX, maxY, id: entity.id, entityType: entity.entityType };
  itemMap.set(entity.id, item);
  tree.insert(item);
  featureCache.set(entity.id, compileColdFeatures(entity));
}

function removeEntity(id: string) {
  const item = itemMap.get(id);
  if (item) {
    tree.remove(item, (a, b) => a.id === b.id);
    itemMap.delete(id);
  }
  entityMap.delete(id);
  featureCache.delete(id);
}

function buildFeatureCollection(excludeId?: string | null): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const [id, cached] of featureCache) {
    if (id === excludeId) continue;
    features.push(...cached);
  }
  return { type: 'FeatureCollection', features: applyLaneJunctions(features, entityMap.values(), excludeId) };
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
      for (const entity of req.entities) {
        insertEntity(entity);
      }
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
