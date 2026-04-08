import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { temporal } from 'zundo';
import { enableMapSet } from 'immer';
import type { MapEntity } from '@/types/entities';

enableMapSet();

interface MapState {
  entities: Map<string, MapEntity>;
}

interface MapActions {
  addEntity(entity: MapEntity): void;
  updateEntity(id: string, entity: MapEntity): void;
  removeEntity(id: string): void;
}

type MapStore = MapState & MapActions;

export const useMapStore = create<MapStore>()(
  temporal(
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
    {
      // 只追踪 entities 数据，不追踪 action 函数
      partialize: (state) => ({ entities: state.entities }),
      limit: 100,
    },
  ),
);
