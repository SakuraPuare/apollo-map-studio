import { create } from 'zustand';
import type { MapEntity } from '@/types/entities';

// ─── Entity type visibility / lock state ────────────────────

const ENTITY_TYPES = [
  'lane', 'junction', 'parkingSpace', 'signal', 'crosswalk',
  'stopSign', 'speedBump', 'polyline', 'catmullRom', 'bezier',
  'arc', 'rect', 'polygon',
] as const;

type EntityType = (typeof ENTITY_TYPES)[number];

interface LayerState {
  visible: boolean;
  locked: boolean;
}

// ─── UI State ───────────────────────────────────────────────

export type AppMode = 'drawing' | 'scene';

interface UIState {
  // App mode — drawing (绘图模式) vs scene (场景模式)
  appMode: AppMode;

  // Grid & Snap
  gridEnabled: boolean;
  snapEnabled: boolean;

  // Layer visibility/lock
  layerStates: Record<string, LayerState>;

  // Viewport info (from MapLibre)
  cursorLngLat: [number, number] | null;
  currentZoom: number;

  // Sidebar
  sidebarVisible: boolean;
}

interface UIActions {
  setAppMode(mode: AppMode): void;
  toggleAppMode(): void;

  toggleGrid(): void;
  toggleSnap(): void;

  setLayerVisible(type: string, visible: boolean): void;
  setLayerLocked(type: string, locked: boolean): void;
  toggleLayerVisible(type: string): void;
  toggleLayerLocked(type: string): void;
  isLayerVisible(type: string): boolean;
  isLayerLocked(type: string): boolean;

  setCursorLngLat(pos: [number, number] | null): void;
  setCurrentZoom(zoom: number): void;

  toggleSidebar(): void;
}

type UIStore = UIState & UIActions;

// Initialize all entity types as visible and unlocked
const defaultLayerStates: Record<string, LayerState> = {};
for (const type of ENTITY_TYPES) {
  defaultLayerStates[type] = { visible: true, locked: false };
}

export const useUIStore = create<UIStore>()((set, get) => ({
  appMode: 'drawing',
  gridEnabled: false,
  snapEnabled: false,
  layerStates: defaultLayerStates,
  cursorLngLat: null,
  currentZoom: 18,
  sidebarVisible: true,

  setAppMode(mode) {
    set({ appMode: mode });
  },
  toggleAppMode() {
    set((s) => ({ appMode: s.appMode === 'drawing' ? 'scene' : 'drawing' }));
  },

  toggleGrid() {
    set((s) => ({ gridEnabled: !s.gridEnabled }));
  },
  toggleSnap() {
    set((s) => ({ snapEnabled: !s.snapEnabled }));
  },

  setLayerVisible(type, visible) {
    set((s) => ({
      layerStates: {
        ...s.layerStates,
        [type]: { ...s.layerStates[type] || { visible: true, locked: false }, visible },
      },
    }));
  },
  setLayerLocked(type, locked) {
    set((s) => ({
      layerStates: {
        ...s.layerStates,
        [type]: { ...s.layerStates[type] || { visible: true, locked: false }, locked },
      },
    }));
  },
  toggleLayerVisible(type) {
    const current = get().layerStates[type];
    set((s) => ({
      layerStates: {
        ...s.layerStates,
        [type]: { ...current || { visible: true, locked: false }, visible: !(current?.visible ?? true) },
      },
    }));
  },
  toggleLayerLocked(type) {
    const current = get().layerStates[type];
    set((s) => ({
      layerStates: {
        ...s.layerStates,
        [type]: { ...current || { visible: true, locked: false }, locked: !(current?.locked ?? false) },
      },
    }));
  },
  isLayerVisible(type) {
    return get().layerStates[type]?.visible ?? true;
  },
  isLayerLocked(type) {
    return get().layerStates[type]?.locked ?? false;
  },

  setCursorLngLat(pos) {
    set({ cursorLngLat: pos });
  },
  setCurrentZoom(zoom) {
    set({ currentZoom: zoom });
  },

  toggleSidebar() {
    set((s) => ({ sidebarVisible: !s.sidebarVisible }));
  },
}));
