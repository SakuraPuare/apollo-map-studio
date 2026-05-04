/**
 * Overlap pipeline — reconcile 主流程.
 *
 * 纯函数：(entities, mode) → patch.
 *   mode = 'incremental': 只处理 dirtyIds 影响的 lane × neighbors 配对
 *   mode = 'full':        全图重建（导入完成 / 用户手动重算 / 导出前校验）
 *
 * 单一 id 体系（B.3 重构后）：
 *   - 所有 overlap 都用语义化派生 id：`overlap_<sortedParticipants...>`
 *   - 导入的 Apollo 数据上来后，第一次 reconcile 会把原 id 顺序统一到本地
 *     sorted 形式（破坏性，不保留 Apollo 的原 id 顺序），之后 set-diff 一致
 *   - 没有「imported preserve」分支；overlap = 几何派生事实，由 reconcile
 *     全权管理。手工修改 isMerge / region polygon 通过 `_userOverrides` 钉位
 *     保护（mergeWithOverrides 处理）
 *
 * region_overlap：lane × crosswalk 自动派生 RegionOverlapInfo（精确相交区域）；
 * 用户可通过 inspector 「pin」按钮锁住 polygon 不被几何重算覆盖
 * （`_userOverrides: ['regionOverlaps']`）.
 */
import type { MapEntity } from '@/types/entities';
import type {
  LaneEntity,
  ObjectOverlapInfo,
  OverlapEntity,
  RegionOverlapInfo,
} from '@/types/apollo';
import { getCenterline, isOverlapParticipant } from './geometryAdapters';
import { bboxOfPoints } from './intersect';
import { type SpatialIndex, bboxForEntity, getSharedSpatialIndex } from './spatialIndex';
import { detectPair, detectLaneLanePair, emitLaneLaneObjects, findPairRule } from './pairTable';
import { makeOverlapId, isDerivedOverlapId } from './overlapId';
import { makeRegionId } from './regionId';
import { REGION_OVERLAPS_OVERRIDE_PATH, parseLaneIsMergeOverride } from './overridePaths';
import { invalidateLaneArcLength } from './computeLaneS';
import type { BBox, ReconcileMode, ReconcilePatch } from './types';

type EntityWithOverlap = MapEntity & { overlapIds?: string[] };

interface DerivedOverlap {
  id: string;
  participantIds: string[];
  objects: ObjectOverlapInfo[];
  /** GAP-5 Sprint 2: 自动派生的 region 多边形集合（lane corridor × secondary） */
  regions: RegionOverlapInfo[];
}

function buildDerivedOverlap(
  participantIds: string[],
  objects: ObjectOverlapInfo[],
  regions: RegionOverlapInfo[] = [],
): DerivedOverlap {
  const id = makeOverlapId(participantIds);
  return { id, participantIds, objects, regions };
}

interface DerivedScanResult {
  derived: Map<string, DerivedOverlap>;
  pairsTested: number;
  pairsMatched: number;
}

function syncSpatialIndex(
  entities: ReadonlyMap<string, MapEntity>,
  mode: ReconcileMode,
  index?: SpatialIndex,
): SpatialIndex {
  const idx = index ?? getSharedSpatialIndex();
  if (index) return idx;
  if (mode.mode === 'full') idx.syncFromEntities(entities);
  else idx.syncDirty(entities, mode.dirtyIds);
  return idx;
}

function addLanePairOverlap(
  lane: LaneEntity,
  other: LaneEntity,
  derived: Map<string, DerivedOverlap>,
): boolean {
  const dedupId = makeOverlapId([lane.id, other.id]);
  if (derived.has(dedupId)) return false;
  const hitA = detectLaneLanePair(lane, other);
  if (!hitA.intersects) return false;
  const hitB = detectLaneLanePair(other, lane);
  const objects = emitLaneLaneObjects(lane, other, hitA, hitB);
  const ov = buildDerivedOverlap([lane.id, other.id], objects);
  derived.set(ov.id, ov);
  return true;
}

function regionInfoForHit(
  lane: LaneEntity,
  other: MapEntity,
  hit: ReturnType<typeof detectPair>,
): { regionId?: string; regions: RegionOverlapInfo[] } {
  if (!hit.regionPolygon || hit.regionPolygon.length < 3) return { regions: [] };
  const regionId = makeRegionId([lane.id, other.id], 0);
  return {
    regionId,
    regions: [{ id: regionId, polygons: [{ points: hit.regionPolygon }] }],
  };
}

function addRulePairOverlap(
  lane: LaneEntity,
  other: MapEntity,
  derived: Map<string, DerivedOverlap>,
): boolean {
  const rule = findPairRule(other.entityType);
  if (!rule) return false;
  const dedupId = makeOverlapId([lane.id, other.id]);
  if (derived.has(dedupId)) return false;
  const hit = detectPair(lane, other, rule);
  if (!hit.intersects) return false;
  const { regionId, regions } = regionInfoForHit(lane, other, hit);
  const objects = rule.emitObjects(lane, other, hit, regionId ? { regionId } : undefined);
  const ov = buildDerivedOverlap([lane.id, other.id], objects, regions);
  derived.set(ov.id, ov);
  return true;
}

function scanDerivedOverlaps(
  entities: ReadonlyMap<string, MapEntity>,
  dirtyLanes: readonly LaneEntity[],
  idx: SpatialIndex,
): DerivedScanResult {
  const derived = new Map<string, DerivedOverlap>();
  let pairsTested = 0;
  let pairsMatched = 0;

  for (const lane of dirtyLanes) {
    const centerline = getCenterline(lane);
    if (centerline.length < 2) continue;
    const bbox = bboxOfPoints(centerline);
    if (!bbox) continue;

    const neighbors = idx.queryBBox(bbox).filter((n) => n.id !== lane.id);
    for (const n of neighbors) {
      const other = entities.get(n.id);
      if (!other) continue;
      pairsTested++;
      const matched =
        other.entityType === 'lane'
          ? addLanePairOverlap(lane, other, derived)
          : addRulePairOverlap(lane, other, derived);
      if (matched) pairsMatched++;
    }
  }

  return { derived, pairsTested, pairsMatched };
}

/** 主入口 */
export function reconcileOverlaps(
  entities: ReadonlyMap<string, MapEntity>,
  mode: ReconcileMode,
  index?: SpatialIndex,
): ReconcilePatch {
  const startTime = performance.now();

  // 优先使用 caller 注入的索引；否则用模块级 singleton：
  //   - full mode：syncFromEntities 全量 ref 比对（cold start / undo / 大改）
  //   - incremental：syncDirty 仅刷 dirtyIds，O(dirty) 不是 O(N)。这是
  //     编辑期 < 16ms 帧预算的关键抓手。
  const idx = syncSpatialIndex(entities, mode, index);

  // GAP-8: cosLat 改为 detectLaneLanePair 内部按 laneA 起点纬度局部计算，
  // 不再走全图均值（跨纬度多度地图全局均值会产生米空间偏差）。

  const dirtyLanes = collectDirtyLanes(entities, mode, idx);
  const { derived, pairsTested, pairsMatched } = scanDerivedOverlaps(entities, dirtyLanes, idx);

  const result = diffWithExisting(entities, derived, mode);
  const durationMs = performance.now() - startTime;

  return {
    changes: result.changes,
    removedOverlapIds: result.removedOverlapIds,
    stats: {
      pairsTested,
      pairsMatched,
      overlapsCreated: result.overlapsCreated,
      overlapsRemoved: result.removedOverlapIds.size,
      durationMs,
    },
  };
}

/**
 * 用 R-tree O(log N + k) 邻居查询代替全表 O(N) 扫描.
 *
 * 假设：`idx` 在调用前已经被 reconcile 主流程 syncDirty / syncFromEntities
 * 同步过 —— 所以 query 命中的 bbox 反映的是当前几何（modulo 刚 mutate 但
 * 不在 dirtyIds 里的违约场景，那是 caller 的合同问题，不该索引兜底）.
 */
function expandLanesNearBBox(
  entities: ReadonlyMap<string, MapEntity>,
  idx: SpatialIndex,
  bbox: BBox,
  acc: Map<string, LaneEntity>,
): void {
  for (const n of idx.queryBBox(bbox)) {
    if (n.entityType !== 'lane' || acc.has(n.id)) continue;
    const lane = entities.get(n.id);
    if (lane && lane.entityType === 'lane') acc.set(n.id, lane);
  }
}

function collectDirtyLanes(
  entities: ReadonlyMap<string, MapEntity>,
  mode: ReconcileMode,
  idx: SpatialIndex,
): LaneEntity[] {
  if (mode.mode === 'full') {
    const out: LaneEntity[] = [];
    for (const e of entities.values()) if (e.entityType === 'lane') out.push(e);
    return out;
  }

  const lanes = new Map<string, LaneEntity>();
  for (const id of mode.dirtyIds) {
    const e = entities.get(id);
    if (!e) continue;
    if (e.entityType === 'lane') {
      lanes.set(e.id, e);
      continue;
    }
    if (!isOverlapParticipant(e)) continue;
    const bbox = bboxForEntity(e);
    if (bbox) expandLanesNearBBox(entities, idx, bbox, lanes);
  }
  return Array.from(lanes.values());
}

interface DiffResult {
  changes: Map<string, MapEntity>;
  removedOverlapIds: Set<string>;
  overlapsCreated: number;
}

/**
 * 把派生集合 vs 现有 OverlapEntities 做 set diff，并同步回写
 * 受影响实体的 overlapIds 数组。
 */
function diffWithExisting(
  entities: ReadonlyMap<string, MapEntity>,
  derived: ReadonlyMap<string, DerivedOverlap>,
  mode: ReconcileMode,
): DiffResult {
  const changes = new Map<string, MapEntity>();
  const removedOverlapIds = new Set<string>();
  let overlapsCreated = 0;

  const scope = buildDiffScope(entities, derived, mode);

  for (const ov of scope.existingOverlaps.values()) {
    if (!derived.has(ov.id)) removedOverlapIds.add(ov.id);
  }

  for (const [id, ov] of derived) {
    const existing = entities.get(id);
    if (existing && existing.entityType === 'overlap') {
      const e = existing as OverlapEntity;
      const merged = mergeWithOverrides(e, ov.objects);
      // GAP-5 Sprint 2: regionOverlaps 钉位（_userOverrides 含 'regionOverlaps'）
      // → 保留 existing.regionOverlaps；否则用 derived.regions 替换。
      const pinned = isRegionOverlapsPinned(e);
      const nextRegions = pinned ? e.regionOverlaps : ov.regions;
      const objectsSame = objectsExactlyEqual(e.objects, merged);
      const regionsSame = regionOverlapsEqual(e.regionOverlaps, nextRegions);
      if (objectsSame && regionsSame) continue;
      changes.set(id, { ...e, objects: merged, regionOverlaps: nextRegions });
      continue;
    }
    const next: OverlapEntity = {
      id,
      entityType: 'overlap',
      objects: ov.objects,
      regionOverlaps: ov.regions,
    };
    changes.set(id, next);
    overlapsCreated++;
  }

  // 同步回写每个参与实体的 overlapIds
  applyOverlapIdsBack(entities, derived, removedOverlapIds, changes, scope.participantIds);

  return { changes, removedOverlapIds, overlapsCreated };
}

interface DiffScope {
  existingOverlaps: Map<string, OverlapEntity>;
  participantIds: Set<string> | null;
}

function buildDiffScope(
  entities: ReadonlyMap<string, MapEntity>,
  derived: ReadonlyMap<string, DerivedOverlap>,
  mode: ReconcileMode,
): DiffScope {
  if (mode.mode === 'full') {
    const existingOverlaps = new Map<string, OverlapEntity>();
    for (const e of entities.values()) {
      if (e.entityType === 'overlap') existingOverlaps.set(e.id, e as OverlapEntity);
    }
    return { existingOverlaps, participantIds: null };
  }

  const existingOverlaps = new Map<string, OverlapEntity>();
  const participantIds = new Set<string>(mode.dirtyIds);

  for (const id of mode.dirtyIds) {
    const e = entities.get(id);
    addExistingOverlapsForEntity(entities, e, existingOverlaps, participantIds);
  }

  for (const [id, ov] of derived) {
    for (const participantId of ov.participantIds) participantIds.add(participantId);
    const existing = entities.get(id);
    if (existing?.entityType === 'overlap') {
      existingOverlaps.set(id, existing as OverlapEntity);
      addOverlapParticipants(existing as OverlapEntity, participantIds);
    }
  }

  return { existingOverlaps, participantIds };
}

function addExistingOverlapsForEntity(
  entities: ReadonlyMap<string, MapEntity>,
  entity: MapEntity | undefined,
  existingOverlaps: Map<string, OverlapEntity>,
  participantIds: Set<string>,
): void {
  const overlapIds = (entity as EntityWithOverlap | undefined)?.overlapIds;
  if (!Array.isArray(overlapIds)) return;
  for (const overlapId of overlapIds) {
    const overlap = entities.get(overlapId);
    if (overlap?.entityType !== 'overlap') continue;
    existingOverlaps.set(overlap.id, overlap as OverlapEntity);
    addOverlapParticipants(overlap as OverlapEntity, participantIds);
  }
}

function addOverlapParticipants(overlap: OverlapEntity, participantIds: Set<string>): void {
  for (const object of overlap.objects) participantIds.add(object.objectId);
}

/**
 * 把派生出的 objects 与 existing._userOverrides 合并：
 *   - `objects.<i>.laneOverlapInfo.isMerge` 路径在 overrides 里 → 保留旧值
 *   - `regionOverlaps` 路径在 overrides 里 → 同时把所有 ObjectOverlapInfo 的
 *     regionOverlapId 也保留（保证 lane/crosswalk 一侧的引用与钉住的 region
 *     id 一致），由 mergeRegionOverlapIds 处理。
 * 其它字段（startS/endS）跟随几何派生。
 */
function mergeWithOverrides(
  existing: OverlapEntity,
  derivedObjects: ObjectOverlapInfo[],
): ObjectOverlapInfo[] {
  const overrides = existing._userOverrides;
  if (!overrides || overrides.length === 0) return derivedObjects;
  const overrideSet = new Set(overrides);
  const regionPinned = overrideSet.has(REGION_OVERLAPS_OVERRIDE_PATH);
  // 把 isMerge 钉位 set 提前折叠成 indices —— 否则每个 object 都做一次正则解析
  const isMergePinnedIndices = new Set<number>();
  for (const path of overrides) {
    const idx = parseLaneIsMergeOverride(path);
    if (idx !== null) isMergePinnedIndices.add(idx);
  }
  return derivedObjects.map((newObj, i) =>
    mergeOneObject(newObj, i, existing, isMergePinnedIndices.has(i), regionPinned),
  );
}

/**
 * 单条 ObjectOverlapInfo 的 override 合并。拆出独立函数让每个 union 分支能
 * 各自做窄化（直接在 union 类型上 spread laneOverlapInfo 会触发 TS2322）.
 */
function mergeOneObject(
  newObj: ObjectOverlapInfo,
  i: number,
  existing: OverlapEntity,
  isMergePinned: boolean,
  regionPinned: boolean,
): ObjectOverlapInfo {
  if (newObj.objectType === 'lane') {
    let lane = newObj;
    if (isMergePinned) {
      const oldObj = existing.objects[i];
      if (oldObj?.objectType === 'lane') {
        lane = {
          ...lane,
          laneOverlapInfo: {
            ...lane.laneOverlapInfo,
            isMerge: oldObj.laneOverlapInfo.isMerge,
          },
        };
      }
    }
    if (regionPinned) {
      const oldObj = existing.objects[i];
      if (oldObj?.objectType === 'lane' && oldObj.objectId === lane.objectId) {
        lane = {
          ...lane,
          laneOverlapInfo: {
            ...lane.laneOverlapInfo,
            regionOverlapId: oldObj.laneOverlapInfo.regionOverlapId,
          },
        };
      }
    }
    return lane;
  }

  if (newObj.objectType === 'crosswalk' && regionPinned) {
    const oldObj = existing.objects[i];
    if (oldObj?.objectType === 'crosswalk' && oldObj.objectId === newObj.objectId) {
      const next: typeof newObj = { ...newObj };
      if (oldObj.regionOverlapId !== undefined) {
        next.regionOverlapId = oldObj.regionOverlapId;
      } else {
        delete next.regionOverlapId;
      }
      return next;
    }
  }

  return newObj;
}

/** 是否钉住了 regionOverlaps 这条路径（GAP-5 Sprint 2 / Sprint 3 钉位机制）. */
function isRegionOverlapsPinned(e: OverlapEntity): boolean {
  const overrides = e._userOverrides;
  if (!overrides || overrides.length === 0) return false;
  return overrides.includes(REGION_OVERLAPS_OVERRIDE_PATH);
}

/** RegionOverlapInfo[] 深比较（id + 多边形点序列）. */
function regionOverlapsEqual(
  a: readonly RegionOverlapInfo[],
  b: readonly RegionOverlapInfo[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (x.id !== y.id) return false;
    if (x.polygons.length !== y.polygons.length) return false;
    for (let j = 0; j < x.polygons.length; j++) {
      const px = x.polygons[j]!.points;
      const py = y.polygons[j]!.points;
      if (px.length !== py.length) return false;
      for (let k = 0; k < px.length; k++) {
        if (px[k]!.x !== py[k]!.x || px[k]!.y !== py[k]!.y) return false;
      }
    }
  }
  return true;
}

/**
 * Deep-equal for objects array — distinguishes is_merge / startS / endS so that
 * mergeWithOverrides preserving an old isMerge value can be detected as "no
 * change" and skip the rewrite.
 */
function objectsExactlyEqual(a: ObjectOverlapInfo[], b: ObjectOverlapInfo[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (x.objectType !== y.objectType) return false;
    if (x.objectId !== y.objectId) return false;
    if (x.objectType === 'lane' && y.objectType === 'lane') {
      const li = x.laneOverlapInfo;
      const lj = y.laneOverlapInfo;
      if (li.startS !== lj.startS) return false;
      if (li.endS !== lj.endS) return false;
      if ((li.isMerge ?? false) !== (lj.isMerge ?? false)) return false;
      if ((li.regionOverlapId ?? '') !== (lj.regionOverlapId ?? '')) return false;
    }
  }
  return true;
}

function applyOverlapIdsBack(
  entities: ReadonlyMap<string, MapEntity>,
  derived: ReadonlyMap<string, DerivedOverlap>,
  removedOverlapIds: ReadonlySet<string>,
  changes: Map<string, MapEntity>,
  participantScope: ReadonlySet<string> | null,
): void {
  const targetSets = new Map<string, Set<string>>();

  const participantEntities =
    participantScope === null ? entities.values() : scopedEntities(entities, participantScope);

  for (const e of participantEntities) {
    const cur = (e as EntityWithOverlap).overlapIds;
    if (!Array.isArray(cur)) continue;
    const keep = cur.filter((id) => !removedOverlapIds.has(id) && !isDerivedOverlapId(id));
    targetSets.set(e.id, new Set(keep));
  }

  for (const ov of derived.values()) {
    for (const pid of ov.participantIds) {
      const set = targetSets.get(pid);
      if (set) set.add(ov.id);
    }
  }

  for (const [id, set] of targetSets) {
    const e = entities.get(id);
    if (!e) continue;
    const cur = (e as EntityWithOverlap).overlapIds ?? [];
    const next = Array.from(set).sort();
    if (arraysEqual(cur, next)) continue;
    const draft = changes.get(id) ?? e;
    changes.set(id, { ...draft, overlapIds: next } as MapEntity);
  }
}

function* scopedEntities(
  entities: ReadonlyMap<string, MapEntity>,
  ids: ReadonlySet<string>,
): Iterable<MapEntity> {
  for (const id of ids) {
    const entity = entities.get(id);
    if (entity) yield entity;
  }
}

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function invalidateLaneCaches(removedLaneIds: Iterable<string>): void {
  for (const id of removedLaneIds) invalidateLaneArcLength(id);
}
