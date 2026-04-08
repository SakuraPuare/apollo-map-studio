import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { temporal } from 'zundo';
import { enableMapSet } from 'immer';
import type { MapEntity } from '@/types/entities';

enableMapSet();

// --- Settings ---

const HISTORY_LIMIT_KEY = 'apollo-map-studio:historyLimit';
const DEFAULT_HISTORY_LIMIT = 100;
const MIN_HISTORY_LIMIT = 10;
const MAX_HISTORY_LIMIT = 1000;

function readHistoryLimit(): number {
  try {
    const raw = localStorage.getItem(HISTORY_LIMIT_KEY);
    if (raw !== null) {
      const n = Number(raw);
      if (Number.isFinite(n)) return Math.max(MIN_HISTORY_LIMIT, Math.min(MAX_HISTORY_LIMIT, Math.round(n)));
    }
  } catch { /* SSR / 隐私模式 */ }
  return DEFAULT_HISTORY_LIMIT;
}

export interface SettingsState {
  historyLimit: number;
}

export interface SettingsActions {
  setHistoryLimit(value: number): void;
}

export { MIN_HISTORY_LIMIT, MAX_HISTORY_LIMIT, DEFAULT_HISTORY_LIMIT };

export const useSettingsStore = create<SettingsState & SettingsActions>()((set) => ({
  historyLimit: readHistoryLimit(),
  setHistoryLimit(value) {
    const clamped = Math.max(MIN_HISTORY_LIMIT, Math.min(MAX_HISTORY_LIMIT, Math.round(value)));
    set({ historyLimit: clamped });
    try { localStorage.setItem(HISTORY_LIMIT_KEY, String(clamped)); } catch { /* ignore */ }
  },
}));

// --- Map Store ---

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
      limit: readHistoryLimit(),
    },
  ),
);
