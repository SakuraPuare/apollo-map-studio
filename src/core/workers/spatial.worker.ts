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
import { pointToPolylineDistGeo, pointToPolygonDistGeo } from '@/core/geometry/hitTest';
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

/**
 * R4 fix: 高纬度 + 高 zoom 下 hitTest 选中错误元素的修复。
 *
 * 量纲事实（Web Mercator, 方形像素）：
 *   - 每像素 lng 度数 r_lng = px * 360 / (512 * 2^z)  —— 与 lat 无关
 *   - 每像素 lat 度数 r_lat = r_lng * cos(lat)        —— 高纬度方向变小
 *   - 两者对应的物理长度（米）相等 = r_lng * 111320 * cos(lat)
 *
 * 根因：旧实现把 (lng,lat) 当同量纲欧氏：
 *   - RBush bbox 的 minY/maxY 用 r（= lng 度数）当作 lat 方向半径，
 *     结果 bbox 在 lat 方向被撑得过大 cos(lat) 倍的倒数，误捞候选（不致命）
 *   - pointToPolylineDist 直接用度数欧氏：一条纯东西向 lane 的 lat 法向
 *     Δlat 和一条纯南北向 lane 的 lng 法向 Δlng 被当同量纲 —— 同一物理距离下
 *     Δlat 比 Δlng 小 cos(lat) 倍，导致 EW 被算得比真实 "度数距离" 偏小，
 *     在高 zoom 局部尺度下 1/cos(lat) 的 ~30% 误差足以翻转排序或让 radius
 *     阈值过滤失效（点不中）。
 *
 * 修复：worker 自己从 point[1] 读 midLat，算 cosLat，做两件事：
 *   1. RBush bbox 用真实椭圆外接矩形：
 *        minX/maxX ± r  （lng 方向不变）
 *        minY/maxY ± r*cosLat  （lat 方向按每像素实际度数收紧）
 *      这 **收紧** 了旧实现的过宽 bbox，同时在 lng 方向保持全召回
 *      （半径圆在 Mercator 下的 lat-范围最大值 = r*cosLat）
 *   2. 距离判定调用 pointToPolyline/PolygonDistGeo，把 Δlat 乘 (1/cosLat)
 *      转到 "等效 lng 度空间"，返回值量纲 = lng 度数，可直接与 r 比较
 *
 * 协议未改动：point[1] 已带 lat，worker 自算 cosLat 比 caller 加字段更干净。
 */
function hitTest(point: [number, number], radius: number): HitResult[] {
  const [px, py] = point;
  const r = Math.abs(radius);

  // 纬度补偿因子：在赤道为 1，在 ±90° 为 0。
  // clamp 到 [1e-6, 1] 避免极地除零。
  const cosLat = Math.max(Math.cos((py * Math.PI) / 180), 1e-6);
  const rLat = r * cosLat;

  const candidates = tree.search({
    minX: px - r,
    minY: py - rLat,
    maxX: px + r,
    maxY: py + rLat,
  });

  const results: HitResult[] = [];
  const lngLat: LngLat = [px, py];

  for (const candidate of candidates) {
    const entity = entityMap.get(candidate.id);
    if (!entity) continue;

    const coords = entityRenderCoords(entity);
    let distance: number;

    if (isAreaEntity(entity)) {
      distance = pointToPolygonDistGeo(lngLat, coords, cosLat);
    } else {
      distance = pointToPolylineDistGeo(lngLat, coords, cosLat);
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
