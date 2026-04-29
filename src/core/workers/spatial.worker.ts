/**
 * Spatial Worker
 * 维护 RBush 空间索引 + GeoJSON 编译缓存，处理 hitTest，
 * 增量重算 lane junction stitching + 缓存 boundary decoration。
 */
import RBush from 'rbush';
import type { MapEntity } from '@/types/entities';
import type { LaneEntity } from '@/types/apollo';
import type { WorkerRequest, WorkerResponse, HitResult, EntityFeatureGroup } from './protocol';
import {
  compileColdFeatures,
  entityBBox,
  entityRenderCoords,
  isAreaEntity,
} from '@/core/geometry/compile';
import { applyLaneJunctions } from '@/core/geometry/laneJunctions';
import { LaneJunctionGraph, laneEndpointKeys } from './laneJunctionGraph';
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
/**
 * Encapsulates all worker-local mutable state. Previously these were 7
 * free-floating module-level singletons (`tree`, `entityMap`, `itemMap`,
 * `featureCache`, `decorationCache`, `junctionGraph`, `laneCount`) with
 * implicit cross-invariants and no test isolation outside `vi.resetModules()`.
 *
 * Wrapping them in a single object keeps the diff minimal while making the
 * shared invariants explicit (e.g. `laneCount === number of lane entities in
 * `entityMap`) and lets functions take `state` as a parameter — useful for
 * future test injection without re-importing the whole module.
 *
 * `decorationCache` (Phase E) is per-lane: decorateBoundary is the dominant
 * cost of buildFeatureCollection (~3ms × N), so caching unaffected lanes'
 * decoration turns a 100-lane edit from ~300ms into ~9ms (3 affected × 3ms).
 * Invalidated per-lane in insert/removeEntity, refreshed only for affected
 * lanes in buildFeatureCollection's INCREMENTAL path.
 */
interface SpatialState {
  tree: RBush<SpatialItem>;
  entityMap: Map<string, MapEntity>;
  itemMap: Map<string, SpatialItem>;
  // Per-entity feature cache: compileColdFeatures output is memoized per ID
  // so editing entity X doesn't recompile Y/Z.
  featureCache: Map<string, GeoJSON.Feature[]>;
  decorationCache: Map<string, GeoJSON.Feature[]>;
  // Endpoint dependency graph for affected-set computation. See laneJunctionGraph.ts.
  junctionGraph: LaneJunctionGraph;
  // Running count of lane entities for the no-stitching fast path.
  laneCount: number;
}

function createSpatialState(): SpatialState {
  return {
    tree: new RBush<SpatialItem>(),
    entityMap: new Map(),
    itemMap: new Map(),
    featureCache: new Map(),
    decorationCache: new Map(),
    junctionGraph: new LaneJunctionGraph(),
    laneCount: 0,
  };
}

const state = createSpatialState();

// --- 索引操作 ---

function insertEntity(state: SpatialState, entity: MapEntity) {
  state.entityMap.set(entity.id, entity);
  const [minX, minY, maxX, maxY] = entityBBox(entity);
  const item: SpatialItem = {
    minX,
    minY,
    maxX,
    maxY,
    id: entity.id,
    entityType: entity.entityType,
  };
  state.itemMap.set(entity.id, item);
  state.tree.insert(item);
  state.featureCache.set(entity.id, compileColdFeatures(entity));
  if (entity.entityType === 'lane') {
    state.laneCount++;
    const keys = laneEndpointKeys(entity as LaneEntity);
    if (keys) state.junctionGraph.addLane(entity.id, keys);
    // Invalidate cached decoration; will be re-computed on next stitch.
    state.decorationCache.delete(entity.id);
  }
}

function removeEntity(state: SpatialState, id: string) {
  const entity = state.entityMap.get(id);
  const item = state.itemMap.get(id);
  if (item) {
    state.tree.remove(item, (a, b) => a.id === b.id);
    state.itemMap.delete(id);
  }
  state.entityMap.delete(id);
  state.featureCache.delete(id);
  if (entity?.entityType === 'lane') {
    state.laneCount = Math.max(0, state.laneCount - 1);
    state.junctionGraph.removeLane(id);
    state.decorationCache.delete(id);
  }
}

/**
 * Group features by `properties.id` for the delta encoding path.
 * Features without a string id are bucketed into `__unkeyed` so they still
 * make it to the main thread (no entity to attribute them to).
 */
function groupFeaturesByEntity(features: GeoJSON.Feature[]): EntityFeatureGroup[] {
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
 * Build the feature collection.
 *
 * - SYNC path (affectedLaneIds = null): full rebuild — clears decorationCache,
 *   re-decorates every lane.
 * - INCREMENTAL path (affectedLaneIds = non-null): only re-decorates the
 *   affected lanes; cached decoration for the rest is merged into the result.
 *
 * Junction stitching itself always runs over all lanes — it's cheap and
 * idempotent (non-affected lanes get the same join values back). The savings
 * is on boundary decoration, which is the dominant cost.
 */
function buildFeatureCollection(
  state: SpatialState,
  excludeId?: string | null,
  affectedLaneIds?: Set<string> | null,
): GeoJSON.FeatureCollection {
  const inputFeatures: GeoJSON.Feature[] = [];
  for (const [id, cached] of state.featureCache) {
    if (id === excludeId) continue;
    inputFeatures.push(...cached);
  }

  // Fast path: zero lanes → no boundary decoration needed at all.
  // 注意 `< 2` 不行：单根车道也需要 decorateBoundary 生成 laneBoundaryDecor
  // 才能出可见边界（compileApolloFeatures 只发 noStroke 基线，被 cold-line 过滤）。
  // 之前的 `< 2` 让"第一根车道没有边界"成为已知 bug。junction stitching
  // 自身不需要这层守护——applyLaneJunctions 内部已经按 endpoints>=4 跳过。
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

  // Refresh decorationCache for the affected lanes.
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

  // For incremental builds, merge in cached decoration for non-affected lanes.
  // Their edges weren't modified (no junction at their endpoints was touched),
  // so the cached decoration is still valid.
  if (isIncremental) {
    for (const [id, decoration] of state.decorationCache) {
      if (affectedLaneIds!.has(id)) continue;
      stitched.push(...decoration);
    }
  }

  return { type: 'FeatureCollection', features: stitched };
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
function hitTest(state: SpatialState, point: [number, number], radius: number): HitResult[] {
  const [px, py] = point;
  const r = Math.abs(radius);

  // 纬度补偿因子：在赤道为 1，在 ±90° 为 0。
  // clamp 到 [1e-6, 1] 避免极地除零。
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

function handleRequest(state: SpatialState, req: WorkerRequest) {
  switch (req.type) {
    case 'SYNC': {
      // 全量同步：清空重建
      state.tree.clear();
      state.entityMap.clear();
      state.itemMap.clear();
      state.featureCache.clear();
      state.decorationCache.clear();
      state.junctionGraph.clear();
      state.laneCount = 0;
      // Phase 8: two-pass SYNC. First pass collects bbox items + compiles
      // features without touching the RBush tree. Second pass uses
      // `tree.load(items)` which runs the STR bulk-loading algorithm
      // (O(n log n) with small constant) instead of n individual inserts
      // (which each trigger node splits / rebalancing).
      const items: SpatialItem[] = [];
      for (const entity of req.entities) {
        state.entityMap.set(entity.id, entity);
        const [minX, minY, maxX, maxY] = entityBBox(entity);
        const item: SpatialItem = {
          minX,
          minY,
          maxX,
          maxY,
          id: entity.id,
          entityType: entity.entityType,
        };
        state.itemMap.set(entity.id, item);
        items.push(item);
        state.featureCache.set(entity.id, compileColdFeatures(entity));
        if (entity.entityType === 'lane') {
          state.laneCount++;
          const keys = laneEndpointKeys(entity as LaneEntity);
          if (keys) state.junctionGraph.addLane(entity.id, keys);
        }
      }
      state.tree.load(items);
      respond({
        type: 'COLD_READY',
        requestId: req.requestId,
        featureCollection: buildFeatureCollection(state, req.excludeId),
      });
      break;
    }

    case 'INCREMENTAL': {
      // Phase E: incremental decoration. Compute the affected lane set as
      //   pre-update dependents ∪ changed lanes ∪ post-update dependents
      // and pass it to buildFeatureCollection so only those lanes get their
      // decoration recomputed; non-affected lanes serve from decorationCache.

      const affected = new Set<string>();

      // Step 1: capture pre-update dependents (lanes that share an endpoint
      // with a removed/updated lane will see their join positions change).
      for (const id of req.removed) {
        const entity = state.entityMap.get(id);
        if (entity?.entityType === 'lane') {
          affected.add(id);
          for (const dep of state.junctionGraph.getDependents(id)) affected.add(dep);
        }
      }
      for (const entity of req.updated) {
        if (entity.entityType === 'lane') {
          affected.add(entity.id);
          for (const dep of state.junctionGraph.getDependents(entity.id)) affected.add(dep);
        }
      }

      // Step 2: apply mutations.
      for (const id of req.removed) removeEntity(state, id);
      for (const entity of req.updated) {
        removeEntity(state, entity.id);
        insertEntity(state, entity);
      }
      for (const entity of req.added) insertEntity(state, entity);

      // Step 3: capture post-update dependents (newly-formed junctions touch
      // existing lanes that we now share endpoints with).
      for (const entity of req.updated) {
        if (entity.entityType === 'lane') {
          for (const dep of state.junctionGraph.getDependents(entity.id)) affected.add(dep);
        }
      }
      for (const entity of req.added) {
        if (entity.entityType === 'lane') {
          affected.add(entity.id);
          for (const dep of state.junctionGraph.getDependents(entity.id)) affected.add(dep);
        }
      }

      // Non-lane updates/adds also need to land in the delta. The affected
      // set above only tracks lanes (the dep graph is lane-only).
      const deltaIds = new Set<string>(affected);
      for (const e of req.updated) deltaIds.add(e.id);
      for (const e of req.added) deltaIds.add(e.id);

      const fc = buildFeatureCollection(state, req.excludeId, affected.size > 0 ? affected : null);

      // Group by entity id and ship only the changed entities. The main thread
      // merges these into its cached entity → features map and rebuilds the FC.
      const allGroups = groupFeaturesByEntity(fc.features);
      const changed = allGroups.filter((g) => deltaIds.has(g.id));

      respond({
        type: 'COLD_DELTA',
        requestId: req.requestId,
        changed,
        removed: [...req.removed],
      });
      break;
    }

    case 'HIT_TEST': {
      const hits = hitTest(state, req.point, req.radius);
      respond({
        type: 'HIT_RESULT',
        requestId: req.requestId,
        hits,
      });
      break;
    }
  }
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  handleRequest(state, e.data);
};
