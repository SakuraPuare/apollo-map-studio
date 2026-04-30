import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { temporal } from 'zundo';
import { enableMapSet } from 'immer';
import type { MapEntity } from '@/types/entities';
import {
  reparent,
  cascadeDeleteRefsFull,
  type ParentTarget,
  type ReparentResult,
} from '@/lib/entityOps';
import { reconcileLaneTopology } from '@/core/geometry/laneTopology';
import { reconcileOverlaps, invalidateLaneCaches } from '@/core/elements/overlap';
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
        set((state) => {
          state.entities.set(entity.id, entity);
          if (topologyAffectingType(entity.entityType)) {
            const { changes } = reconcileLaneTopology(state.entities);
            for (const [cid, c] of changes) state.entities.set(cid, c);
          }
          applyOverlapPatch(state, new Set([entity.id]));
        });
      },

      updateEntity(id, entity) {
        set((state) => {
          if (!state.entities.has(id)) return;
          state.entities.set(id, entity);
          if (topologyAffectingType(entity.entityType)) {
            const { changes } = reconcileLaneTopology(state.entities);
            for (const [cid, c] of changes) state.entities.set(cid, c);
          }
          applyOverlapPatch(state, new Set([id]));
        });
      },

      removeEntity(id) {
        const all = get().entities;
        if (!all.has(id)) return;
        const removed = all.get(id);
        const { changes: cleanups, cascadeRemoved } = cascadeDeleteRefsFull(new Set([id]), all);
        set((state) => {
          for (const [cid, entity] of cleanups) {
            state.entities.set(cid, entity);
          }
          for (const cid of cascadeRemoved) state.entities.delete(cid);
          state.entities.delete(id);
          if (removed && topologyAffectingType(removed.entityType)) {
            const { changes } = reconcileLaneTopology(state.entities);
            for (const [cid, c] of changes) state.entities.set(cid, c);
          }
          // 删除事件下，邻居都需要重算 overlap；用 cleanups 的 ids 作为 dirty 集
          const dirty = new Set<string>(cleanups.keys());
          applyOverlapPatch(state, dirty);
        });
        if (removed && removed.entityType === 'lane') invalidateLaneCaches([removed.id]);
      },

      reparentEntity(childId, target) {
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
    })),
    {
      partialize: (state) => ({ entities: state.entities }),
      limit: readHistoryLimit(),
    },
  ),
);
