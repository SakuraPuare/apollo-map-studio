/**
 * Overlap pipeline — reconcile 主流程.
 *
 * 纯函数：(entities, mode) → patch.
 *   mode = 'incremental': 只处理 dirtyIds 影响的 lane × neighbors 配对
 *   mode = 'full':        全图重建（导入完成 / 用户手动重算 / 导出前校验）
 *
 * 三档语义保留（决策见 v1 doc）：
 *   - 自动派生（id 形如 Overlap_<hex16>）：每次 reconcile 全量替换
 *   - 导入或手工新建（id 形如 overlap_N / Overlap_N 等数字后缀）：保留对象集合，
 *     仅在参与实体被删除时清理；reconcile 不主动添加/删除这些 overlap
 *
 * region_overlap（GAP-5 显式延后）：Apollo proto 的 RegionOverlapInfo 用来
 * 表达 crosswalk×lane 等场景下的精确多边形相交区域。此处**不**自动生成 ——
 * 自动派生需要 polygon clipping（仓库未引入对应库），且产品定义里 region
 * 是给用户「钉」语义信息的扩展点（参见 _userPinned 设计），自动覆盖会和这
 * 个交互模型打架。需要时单独走 region 维护抓手，不进 reconcile 主循环。
 */
import type { MapEntity } from '@/types/entities';
import type { LaneEntity, ObjectOverlapInfo, OverlapEntity } from '@/types/apollo';
import { getCenterline, isOverlapParticipant } from './geometryAdapters';
import { bboxOfPoints } from './intersect';
import { type SpatialIndex, bboxForEntity, getSharedSpatialIndex } from './spatialIndex';
import {
  PAIR_RULES,
  detectPair,
  detectLaneLanePair,
  emitLaneLaneObjects,
  findPairRule,
} from './pairTable';
import { makeOverlapId, isDerivedOverlapId } from './overlapId';
import { invalidateLaneArcLength } from './computeLaneS';
import type { BBox, ReconcileMode, ReconcilePatch } from './types';

type EntityWithOverlap = MapEntity & { overlapIds?: string[] };

interface DerivedOverlap {
  id: string;
  participantIds: string[];
  objects: ObjectOverlapInfo[];
}

function buildDerivedOverlap(
  participantIds: string[],
  objects: ObjectOverlapInfo[],
): DerivedOverlap {
  const id = makeOverlapId(participantIds);
  return { id, participantIds, objects };
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
  const idx = index ?? getSharedSpatialIndex();
  if (!index) {
    if (mode.mode === 'full') idx.syncFromEntities(entities);
    else idx.syncDirty(entities, mode.dirtyIds);
  }

  // GAP-8: cosLat 改为 detectLaneLanePair 内部按 laneA 起点纬度局部计算，
  // 不再走全图均值（跨纬度多度地图全局均值会产生米空间偏差）。

  const dirtyLanes = collectDirtyLanes(entities, mode);
  const derived = new Map<string, DerivedOverlap>();
  // Set-based dedup keyed on the derived overlap id (sorted-participant FNV
  // hash) — symmetric in (A,B), so it does not depend on which side of an
  // incremental edit happened to land in dirtyLanes. Replaces the old
  // `lane.id < lo.id` ordering gate, which silently dropped pairs whose
  // dirty side had the lexicographically larger id (GAP-3).
  let pairsTested = 0;
  let pairsMatched = 0;

  for (const lane of dirtyLanes) {
    const centerline = getCenterline(lane);
    if (centerline.length < 2) continue;
    const bbox = bboxOfPoints(centerline);

    const neighbors = idx.queryBBox(bbox).filter((n) => n.id !== lane.id);

    for (const n of neighbors) {
      const other = entities.get(n.id);
      if (!other) continue;
      pairsTested++;

      if (other.entityType === 'lane') {
        const lo = other as LaneEntity;
        const dedupId = makeOverlapId([lane.id, lo.id]);
        if (derived.has(dedupId)) continue;
        const hitA = detectLaneLanePair(lane, lo);
        if (!hitA.intersects) continue;
        const hitB = detectLaneLanePair(lo, lane);
        const objects = emitLaneLaneObjects(lane, lo, hitA, hitB);
        const ov = buildDerivedOverlap([lane.id, lo.id], objects);
        derived.set(ov.id, ov);
        pairsMatched++;
        continue;
      }

      const rule = findPairRule(other.entityType);
      if (!rule) continue;
      const dedupId = makeOverlapId([lane.id, other.id]);
      if (derived.has(dedupId)) continue;
      const hit = detectPair(lane, other, rule);
      if (!hit.intersects) continue;
      const objects = rule.emitObjects(lane, other, hit);
      const ov = buildDerivedOverlap([lane.id, other.id], objects);
      derived.set(ov.id, ov);
      pairsMatched++;
    }
  }
  void PAIR_RULES;

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

function bboxOverlap2(a: BBox, b: BBox): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

function expandLanesNearBBox(
  entities: ReadonlyMap<string, MapEntity>,
  bbox: BBox,
  acc: Map<string, LaneEntity>,
): void {
  for (const other of entities.values()) {
    if (other.entityType !== 'lane') continue;
    if (acc.has(other.id)) continue;
    const lb = bboxForEntity(other);
    if (lb && bboxOverlap2(lb, bbox)) acc.set(other.id, other);
  }
}

function collectDirtyLanes(
  entities: ReadonlyMap<string, MapEntity>,
  mode: ReconcileMode,
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
    if (bbox) expandLanesNearBBox(entities, bbox, lanes);
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

  const inScope = (entityId: string): boolean => {
    if (mode.mode === 'full') return true;
    return mode.dirtyIds.has(entityId);
  };

  const overlapIdToParticipants = new Map<string, string[]>();
  for (const [id, ov] of derived) overlapIdToParticipants.set(id, [...ov.participantIds]);

  for (const e of entities.values()) {
    if (e.entityType !== 'overlap') continue;
    const ov = e as OverlapEntity;
    if (!isDerivedOverlapId(ov.id)) {
      // 保留导入/手工新建的 overlap，仅在参与实体不存在时清理
      const stillValid = ov.objects.every((o) => entities.has(o.objectId));
      if (!stillValid) removedOverlapIds.add(ov.id);
      continue;
    }
    if (!derived.has(ov.id)) {
      // 自动派生但本轮没命中 → 删除
      removedOverlapIds.add(ov.id);
    }
  }

  for (const [id, ov] of derived) {
    const existing = entities.get(id);
    if (existing && existing.entityType === 'overlap') {
      const e = existing as OverlapEntity;
      const merged = mergeWithOverrides(e, ov.objects);
      if (objectsExactlyEqual(e.objects, merged)) continue;
      changes.set(id, { ...e, objects: merged });
      continue;
    }
    const next: OverlapEntity = {
      id,
      entityType: 'overlap',
      objects: ov.objects,
      regionOverlaps: [],
    };
    changes.set(id, next);
    overlapsCreated++;
  }

  // 同步回写每个参与实体的 overlapIds
  applyOverlapIdsBack(entities, derived, removedOverlapIds, changes, inScope);

  return { changes, removedOverlapIds, overlapsCreated };
}

/**
 * 把派生出的 objects 与 existing._userOverrides 合并：
 *   - `objects.<i>.laneOverlapInfo.isMerge` 路径在 overrides 里 → 保留旧值
 * 其它字段（startS/endS/regionOverlapId）跟随几何派生。
 */
function mergeWithOverrides(
  existing: OverlapEntity,
  derivedObjects: ObjectOverlapInfo[],
): ObjectOverlapInfo[] {
  const overrides = existing._userOverrides;
  if (!overrides || overrides.length === 0) return derivedObjects;
  const overrideSet = new Set(overrides);
  return derivedObjects.map((newObj, i) => {
    if (newObj.objectType !== 'lane') return newObj;
    const path = `objects.${i}.laneOverlapInfo.isMerge`;
    if (!overrideSet.has(path)) return newObj;
    const oldObj = existing.objects[i];
    if (!oldObj || oldObj.objectType !== 'lane') return newObj;
    return {
      ...newObj,
      laneOverlapInfo: {
        ...newObj.laneOverlapInfo,
        isMerge: oldObj.laneOverlapInfo.isMerge,
      },
    };
  });
}

function objectsEqual(a: ObjectOverlapInfo[], b: ObjectOverlapInfo[]): boolean {
  if (a.length !== b.length) return false;
  const key = (o: ObjectOverlapInfo) => `${o.objectType}:${o.objectId}`;
  const sa = a.map(key).sort().join('|');
  const sb = b.map(key).sort().join('|');
  return sa === sb;
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
  inScope: (id: string) => boolean,
): void {
  const targetSets = new Map<string, Set<string>>();

  for (const e of entities.values()) {
    const cur = (e as EntityWithOverlap).overlapIds;
    if (!Array.isArray(cur)) continue;
    if (!inScope(e.id)) {
      const filtered = cur.filter((id) => !removedOverlapIds.has(id));
      if (filtered.length !== cur.length) {
        changes.set(e.id, { ...e, overlapIds: filtered } as MapEntity);
      }
      continue;
    }
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

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function invalidateLaneCaches(removedLaneIds: Iterable<string>): void {
  for (const id of removedLaneIds) invalidateLaneArcLength(id);
}
