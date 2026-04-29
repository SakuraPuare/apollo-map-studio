import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { temporal } from 'zundo';
import { enableMapSet } from 'immer';
import type { MapEntity } from '@/types/entities';
import {
  reparent,
  cascadeDeleteRefs,
  type ParentTarget,
  type ReparentResult,
} from '@/lib/entityOps';
import { reconcileLaneTopology } from '@/core/geometry/laneTopology';
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

export const useMapStore = create<MapStore>()(
  temporal(
    immer((set, get) => ({
      entities: new Map(),

      addEntity(entity) {
        set((state) => {
          state.entities.set(entity.id, entity);
          if (entity.entityType === 'lane') {
            // Reconcile predecessor/successor across all lanes — coordinate
            // matching at the new lane's endpoints may have created or
            // dissolved connections elsewhere too.
            const { changes } = reconcileLaneTopology(state.entities);
            for (const [cid, c] of changes) state.entities.set(cid, c);
          }
        });
      },

      updateEntity(id, entity) {
        set((state) => {
          if (!state.entities.has(id)) return;
          state.entities.set(id, entity);
          if (entity.entityType === 'lane') {
            const { changes } = reconcileLaneTopology(state.entities);
            for (const [cid, c] of changes) state.entities.set(cid, c);
          }
        });
      },

      removeEntity(id) {
        const all = get().entities;
        if (!all.has(id)) return;
        const removed = all.get(id);
        const cleanups = cascadeDeleteRefs(new Set([id]), all);
        set((state) => {
          for (const [cid, entity] of cleanups) {
            state.entities.set(cid, entity);
          }
          state.entities.delete(id);
          if (removed && removed.entityType === 'lane') {
            // Pred/succ on the deleted lane's neighbors must drop now that
            // the geometry is gone (cascadeDeleteRefs already strips by id,
            // but reconcile is the single source of truth for derivations).
            const { changes } = reconcileLaneTopology(state.entities);
            for (const [cid, c] of changes) state.entities.set(cid, c);
          }
        });
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
