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

/** lane / junction 几何变化才需要触发拓扑重算（pred/succ/junctionId） */
function topologyAffectingType(t: MapEntity['entityType']): boolean {
  return t === 'lane' || t === 'junction';
}

/**
 * 在 immer producer 内调用 reconcileOverlaps；patch 直接落到 draft，
 * 与 laneTopology / cascadeDelete 共享同一个 zundo 事务（R1 闭环不破）。
 */
function applyOverlapPatch(
  draft: { entities: Map<string, MapEntity> },
  dirtyIds: Set<string>,
): void {
  if (dirtyIds.size === 0) return;
  const patch = reconcileOverlaps(draft.entities, { mode: 'incremental', dirtyIds });
  for (const id of patch.removedOverlapIds) draft.entities.delete(id);
  for (const [id, e] of patch.changes) draft.entities.set(id, e);
}

export const useMapStore = create<MapStore>()(
  temporal(
    immer((set, get) => ({
      entities: new Map(),

      addEntity(entity) {
        if (!assertEditable('addEntity')) return;
        set((state) => {
          state.entities.set(entity.id, entity);
          // dirty 集要包含所有引用变化的实体 id —— 仅放新加 entity 会让
          // topology 改写过 junctionId 的 lane 漏进 spatialIndex 同步与
          // overlap reconcile 闭包，下一次 mutation 才能纠回，期间 overlap
          // 一致性裂缝.
          const dirty = new Set<string>([entity.id]);
          if (topologyAffectingType(entity.entityType)) {
            const { changes } = reconcileLaneTopologyIncremental(state.entities, {
              dirtyIds: dirty,
            });
            for (const [cid, c] of changes) {
              state.entities.set(cid, c);
              dirty.add(cid);
            }
          }
          applyOverlapPatch(state, dirty);
        });
      },

      updateEntity(id, entity) {
        if (!assertEditable('updateEntity')) return;
        const previous = get().entities.get(id);
        set((state) => {
          if (!state.entities.has(id)) return;
          state.entities.set(id, entity);
          const dirty = new Set<string>([id]);
          if (topologyAffectingType(entity.entityType)) {
            const previousEntities =
              previous && previous !== entity ? new Map([[id, previous]]) : undefined;
            const { changes } = reconcileLaneTopologyIncremental(state.entities, {
              dirtyIds: dirty,
              previousEntities,
            });
            for (const [cid, c] of changes) {
              state.entities.set(cid, c);
              dirty.add(cid);
            }
          }
          applyOverlapPatch(state, dirty);
        });
      },

      removeEntity(id) {
        if (!assertEditable('removeEntity')) return;
        const all = get().entities;
        if (!all.has(id)) return;
        const removed = all.get(id);

        // 删除前先用 spatialIndex 收一遍空间邻居 lane —— delete 之后
        // bboxForEntity 拿不到 removed 的几何，cleanups（cascade-by-ref）
        // 也只覆盖直接持有 overlapIds 的实体，不覆盖纯几何邻居（例如删
        // crosswalk 时和它共享一段 lane corridor 但本身没引用它的其它
        // crosswalk / signal 周围的 lane）.
        const spatialNeighborLanes = new Set<string>();
        if (removed) {
          const bbox = bboxForEntity(removed);
          if (bbox) {
            const idx = getSharedSpatialIndex();
            // 冷启状态（worker 跑完 reset / 测试 reset 之后）先暖一次
            if (idx.size() === 0) idx.syncFromEntities(all);
            for (const n of idx.queryBBox(bbox)) {
              if (n.id !== id && n.entityType === 'lane') spatialNeighborLanes.add(n.id);
            }
          }
        }

        const { changes: cleanups, cascadeRemoved } = cascadeDeleteRefsFull(new Set([id]), all);
        set((state) => {
          for (const [cid, entity] of cleanups) {
            state.entities.set(cid, entity);
          }
          for (const cid of cascadeRemoved) state.entities.delete(cid);
          state.entities.delete(id);
          const dirty = new Set<string>([...cleanups.keys(), ...spatialNeighborLanes]);
          if (removed && topologyAffectingType(removed.entityType)) {
            dirty.add(removed.id);
            const { changes } = reconcileLaneTopologyIncremental(state.entities, {
              dirtyIds: dirty,
              previousEntities: new Map([[removed.id, removed]]),
            });
            for (const [cid, c] of changes) {
              state.entities.set(cid, c);
              dirty.add(cid);
            }
          }
          applyOverlapPatch(state, dirty);
        });
        if (removed && removed.entityType === 'lane') invalidateLaneCaches([removed.id]);
      },

      batchImport(entities) {
        if (entities.length === 0) return;
        set((state) => {
          for (const e of entities) state.entities.set(e.id, e);
          // 一次拓扑重算 → 写回 lane.junctionId / pred / succ
          const { changes: topoChanges } = reconcileLaneTopology(state.entities);
          for (const [cid, c] of topoChanges) state.entities.set(cid, c);
          // 一次 full reconcile —— 替代 N 次 incremental 累加，主线程同步跑.
          // 5w 量纲下 ~450ms，导入路径用户体验 acceptable；超大图建议 caller
          // 走 worker 路径（recomputeOverlapsAsync）.
          const patch = reconcileOverlaps(state.entities, { mode: 'full' });
          for (const oid of patch.removedOverlapIds) state.entities.delete(oid);
          for (const [oid, e] of patch.changes) state.entities.set(oid, e);
        });
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

      reparentEntity(childId, target) {
        if (!assertEditable('reparentEntity')) {
          return { changes: new Map(), rejected: 'editing is disabled in read-only mode' };
        }
        const child = get().entities.get(childId);
        if (!child) {
          return { changes: new Map(), rejected: `entity ${childId} not found` };
        }
        const result = reparent(child, target, get().entities);
        if (result.rejected || result.changes.size === 0) return result;
        set((state) => {
          for (const [id, entity] of result.changes) {
            state.entities.set(id, entity);
          }
        });
        return result;
      },

      async recomputeOverlapsAsync() {
        const entities = get().entities;
        if (entities.size === 0) return null;
        const bridge = new OverlapWorkerBridge();
        try {
          const patch = await bridge.reconcileFull(entities);
          // 主线程一次性 apply（zundo 单事务），与 incremental 路径走同一通道。
          // worker 持有的是 entities snapshot，apply 期间主线程可能已经接受了
          // 别的 mutation；此处仅写入 worker patch 计算出的 changes，依赖
          // syncDirty 在下一次增量编辑时纠正任何 drift。
          set((state) => {
            for (const id of patch.removedOverlapIds) state.entities.delete(id);
            for (const [id, e] of patch.changes) state.entities.set(id, e);
          });
          // worker 在自己的 V8 isolate 里跑过 reconcile，主线程 singleton
          // 现在落后了；下次增量编辑前重置一次，让 stale-guard 走全量重建。
          resetSharedSpatialIndex();
          return patch.stats;
        } finally {
          bridge.dispose();
        }
      },
    })),
    {
      partialize: (state) => ({ entities: state.entities }),
      limit: readHistoryLimit(),
    },
  ),
);
