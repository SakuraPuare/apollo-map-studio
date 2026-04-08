import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { enableMapSet } from 'immer';
import type { MapEntity } from '@/types/entities';

enableMapSet();

interface MapStore {
  entities: Map<string, MapEntity>;
  addEntity(entity: MapEntity): void;
  updateEntity(id: string, entity: MapEntity): void;
  removeEntity(id: string): void;
}

export const useMapStore = create<MapStore>()(
  immer((set) => ({
    entities: new Map(),

    addEntity(entity) {
      set((state) => {
        state.entities.set(entity.id, entity);
      });
    },

    updateEntity(id, entity) {
      set((state) => {
        if (state.entities.has(id)) {
          state.entities.set(id, entity);
        }
      });
    },

    removeEntity(id) {
      set((state) => {
        state.entities.delete(id);
      });
    },
  })),
);
