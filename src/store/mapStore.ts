import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { temporal } from 'zundo';
import { enableMapSet } from 'immer';
import type { MapEntity } from '@/types/entities';
import { assertEditable } from '@/lib/editable-guard';
import {
  reparent,
  cascadeDeleteRefsFull,
  type ParentTarget,
  type ReparentResult,
} from '@/lib/entityOps';
import {
  reconcileLaneTopology,
  reconcileLaneTopologyIncremental,
} from '@/core/geometry/laneTopology';
import {
  reconcileOverlaps,
  invalidateLaneCaches,
  resetSharedSpatialIndex,
  bboxForEntity,
  getSharedSpatialIndex,
} from '@/core/elements/overlap';
import { OverlapWorkerBridge } from '@/core/workers/overlapBridge';
import { readHistoryLimit } from './settingsStore';

enableMapSet();

interface MapState {
  entities: Map<string, MapEntity>;
}

interface MapActions {
  addEntity(entity: MapEntity): void;
  updateEntity(id: string, entity: MapEntity): void;
  /**
   * Batch update existing entities in a single store transaction. Intended for
   * toolbox-style operations that touch many lanes/roads at once.
   */
  updateEntities(changes: Iterable<readonly [string, MapEntity]>): number;
  removeEntity(id: string): void;
  /**
   * Move a child entity under a new parent by updating the appropriate
   * foreign-key field(s). Returns the reparent result (rejected message
   * or empty changes) so callers can surface UX feedback.
   */
  reparentEntity(childId: string, target: ParentTarget): ReparentResult;
  /**
   * 批量导入：一次性写入所有实体 → 一次拓扑重算 → 一次 full overlap reconcile，
   * 全部收口到单个 zundo 事务，避免逐实体 addEntity 把 history 打爆 + 每步
   * incremental reconcile 的累积漂移。导入路径专用。
   */
  batchImport(entities: MapEntity[]): void;
  replaceImportedEntities(entities: MapEntity[]): void;
  replaceImportedEntityMap(entities: Map<string, MapEntity>): void;
  /**
   * Full overlap recompute via Web Worker —— 主线程不被阻塞。
   * 用法：导入完成 / 用户手动 "Recompute overlaps" / 导出前。
   * Returns stats for telemetry; resolves after patch applied.
   */
  recomputeOverlapsAsync(): Promise<{
    pairsTested: number;
    pairsMatched: number;
    overlapsCreated: number;
    overlapsRemoved: number;
    durationMs: number;
  } | null>;
}

type MapStore = MapState & MapActions;
type MapSet = (
  nextStateOrUpdater: MapStore | Partial<MapStore> | ((state: MapStore) => void),
  replace?: false,
) => void;
type MapGet = () => MapStore;

/** lane / junction 几何变化才需要触发拓扑重算（pred/succ/junctionId） */
function topologyAffectingType(t: MapEntity['entityType']): boolean {
  return t === 'lane' || t === 'junction';
}

/**
 * Apply overlap changes to the cloned entity map before the store publishes
 * it, so topology, cascade delete, and overlap patches still land in one
 * zundo transaction.
 */
function applyOverlapPatch(entities: Map<string, MapEntity>, dirtyIds: Set<string>): void {
  if (dirtyIds.size === 0) return;
  const patch = reconcileOverlaps(entities, { mode: 'incremental', dirtyIds });
  for (const id of patch.removedOverlapIds) entities.delete(id);
  for (const [id, e] of patch.changes) entities.set(id, e);
}

function reconcileTopologyPatch(
  entities: Map<string, MapEntity>,
  dirty: Set<string>,
  previousEntities?: ReadonlyMap<string, MapEntity>,
): void {
  const { changes } = reconcileLaneTopologyIncremental(entities, {
    dirtyIds: dirty,
    previousEntities,
  });
  for (const [cid, c] of changes) {
    entities.set(cid, c);
    dirty.add(cid);
  }
}

function collectSpatialNeighborLanes(
  removed: MapEntity | undefined,
  all: Map<string, MapEntity>,
  removedId: string,
): Set<string> {
  const lanes = new Set<string>();
  if (!removed) return lanes;
  const bbox = bboxForEntity(removed);
  if (!bbox) return lanes;

  const idx = getSharedSpatialIndex();
  if (idx.size() === 0) idx.syncFromEntities(all);
  for (const n of idx.queryBBox(bbox)) {
    if (n.id !== removedId && n.entityType === 'lane') lanes.add(n.id);
  }
  return lanes;
}

function applyFullImport(
  base: ReadonlyMap<string, MapEntity>,
  entities: MapEntity[],
): Map<string, MapEntity> {
  const next = new Map(base);
  for (const e of entities) next.set(e.id, e);
  const { changes: topoChanges } = reconcileLaneTopology(next);
  for (const [cid, c] of topoChanges) next.set(cid, c);
  const patch = reconcileOverlaps(next, { mode: 'full' });
  for (const oid of patch.removedOverlapIds) next.delete(oid);
  for (const [oid, e] of patch.changes) next.set(oid, e);
  return next;
}

function updateEntitiesBatch(
  set: MapSet,
  get: MapGet,
  changes: Iterable<readonly [string, MapEntity]>,
): number {
  if (!assertEditable('updateEntities')) return 0;
  const current = get().entities;
  const entities = new Map(current);
  const dirty = new Set<string>();
  const previousEntities = new Map<string, MapEntity>();
  const changedLaneIds = new Set<string>();
  let topologyDirty = false;
  let changedCount = 0;

  for (const [id, entity] of changes) {
    const previous = current.get(id);
    if (!previous || previous === entity) continue;
    entities.set(id, entity);
    dirty.add(id);
    changedCount++;

    if (previous.entityType === 'lane' || entity.entityType === 'lane') {
      changedLaneIds.add(id);
    }
    if (topologyAffectingType(previous.entityType) || topologyAffectingType(entity.entityType)) {
      previousEntities.set(id, previous);
      topologyDirty = true;
    }
  }

  if (changedCount === 0) return 0;
  if (topologyDirty) reconcileTopologyPatch(entities, dirty, previousEntities);
  applyOverlapPatch(entities, dirty);
  set({ entities });
  if (changedLaneIds.size > 0) invalidateLaneCaches(changedLaneIds);
  return changedCount;
}

function createEntityActions(
  set: MapSet,
  get: MapGet,
): Pick<MapActions, 'addEntity' | 'updateEntity' | 'updateEntities' | 'removeEntity'> {
  return {
    addEntity(entity) {
      if (!assertEditable('addEntity')) return;
      const entities = new Map(get().entities);
      entities.set(entity.id, entity);
      const dirty = new Set<string>([entity.id]);
      if (topologyAffectingType(entity.entityType)) {
        reconcileTopologyPatch(entities, dirty);
      }
      applyOverlapPatch(entities, dirty);
      set({ entities });
    },

    updateEntity(id, entity) {
      if (!assertEditable('updateEntity')) return;
      const current = get().entities;
      const previous = current.get(id);
      if (!previous) return;
      const entities = new Map(current);
      entities.set(id, entity);
      const dirty = new Set<string>([id]);
      if (topologyAffectingType(entity.entityType)) {
        const previousEntities = previous !== entity ? new Map([[id, previous]]) : undefined;
        reconcileTopologyPatch(entities, dirty, previousEntities);
      }
      applyOverlapPatch(entities, dirty);
      set({ entities });
    },

    updateEntities(changes) {
      return updateEntitiesBatch(set, get, changes);
    },

    removeEntity(id) {
      if (!assertEditable('removeEntity')) return;
      const all = get().entities;
      if (!all.has(id)) return;
      const removed = all.get(id);
      const spatialNeighborLanes = collectSpatialNeighborLanes(removed, all, id);
      const { changes: cleanups, cascadeRemoved } = cascadeDeleteRefsFull(new Set([id]), all);

      const entities = new Map(all);
      for (const [cid, entity] of cleanups) entities.set(cid, entity);
      for (const cid of cascadeRemoved) entities.delete(cid);
      entities.delete(id);
      const dirty = new Set<string>([...cleanups.keys(), ...spatialNeighborLanes]);
      if (removed && topologyAffectingType(removed.entityType)) {
        dirty.add(removed.id);
        reconcileTopologyPatch(entities, dirty, new Map([[removed.id, removed]]));
      }
      applyOverlapPatch(entities, dirty);
      set({ entities });
      if (removed?.entityType === 'lane') invalidateLaneCaches([removed.id]);
    },
  };
}

function createImportActions(
  set: MapSet,
  get: MapGet,
): Pick<MapActions, 'batchImport' | 'replaceImportedEntities' | 'replaceImportedEntityMap'> {
  return {
    batchImport(entities) {
      if (entities.length === 0) return;
      set({ entities: applyFullImport(get().entities, entities) });
    },

    replaceImportedEntities(entities) {
      const next = new Map<string, MapEntity>();
      for (const e of entities) next.set(e.id, e);
      get().replaceImportedEntityMap(next);
    },

    replaceImportedEntityMap(entities) {
      const temporal = useMapStore.temporal.getState();
      temporal.pause();
      try {
        set({ entities });
        temporal.clear();
      } finally {
        temporal.resume();
      }
      resetSharedSpatialIndex();
    },
  };
}

function createReparentAction(set: MapSet, get: MapGet): Pick<MapActions, 'reparentEntity'> {
  return {
    reparentEntity(childId, target) {
      if (!assertEditable('reparentEntity')) {
        return { changes: new Map(), rejected: 'editing is disabled in read-only mode' };
      }
      const child = get().entities.get(childId);
      if (!child) return { changes: new Map(), rejected: `entity ${childId} not found` };
      const result = reparent(child, target, get().entities);
      if (result.rejected || result.changes.size === 0) return result;
      const entities = new Map(get().entities);
      const dirty = new Set<string>();
      for (const [id, entity] of result.changes) {
        entities.set(id, entity);
        dirty.add(id);
      }
      applyOverlapPatch(entities, dirty);
      set({ entities });
      return result;
    },
  };
}

function createWorkerActions(set: MapSet, get: MapGet): Pick<MapActions, 'recomputeOverlapsAsync'> {
  return {
    async recomputeOverlapsAsync() {
      if (!assertEditable('recomputeOverlapsAsync')) return null;
      const entities = get().entities;
      if (entities.size === 0) return null;
      const bridge = new OverlapWorkerBridge();
      return bridge
        .reconcileFull(entities)
        .then((patch) => {
          if (get().entities !== entities) return null;
          const next = new Map(entities);
          for (const id of patch.removedOverlapIds) next.delete(id);
          for (const [id, e] of patch.changes) next.set(id, e);
          set({ entities: next });
          resetSharedSpatialIndex();
          return patch.stats;
        })
        .finally(() => {
          bridge.dispose();
        });
    },
  };
}

function createMapActions(set: MapSet, get: MapGet): MapActions {
  return {
    ...createEntityActions(set, get),
    ...createImportActions(set, get),
    ...createReparentAction(set, get),
    ...createWorkerActions(set, get),
  };
}

export const useMapStore = create<MapStore>()(
  temporal(
    immer((set, get) => ({
      entities: new Map(),
      ...createMapActions(set, get),
    })),
    {
      partialize: (state) => ({ entities: state.entities }),
      limit: readHistoryLimit(),
    },
  ),
);

type TemporalHistoryOp = (steps?: number) => void;

function withSpatialIndexReset(op: TemporalHistoryOp): TemporalHistoryOp {
  return (steps) => {
    const before = useMapStore.getState().entities;
    op(steps);
    if (useMapStore.getState().entities !== before) resetSharedSpatialIndex();
  };
}

const temporalState = useMapStore.temporal.getState();
useMapStore.temporal.setState({
  undo: withSpatialIndexReset(temporalState.undo),
  redo: withSpatialIndexReset(temporalState.redo),
});
