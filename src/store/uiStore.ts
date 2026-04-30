import { create } from 'zustand';
import type { SnapTarget } from '@/core/geometry/snap';

// ─── Entity type visibility / lock state ────────────────────

const ENTITY_TYPES = [
  'lane',
  'junction',
  'parkingSpace',
  'signal',
  'crosswalk',
  'stopSign',
  'speedBump',
  'polyline',
  'catmullRom',
  'bezier',
  'arc',
  'rect',
  'polygon',
] as const;

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

  // Active snap indicator (live during drawing/dragging — null = no snap)
  currentSnapTarget: SnapTarget | null;

  // Connect mode — wait for two lane clicks then join their endpoints.
  connectMode: {
    active: boolean;
    /** First lane id, or null when waiting for the first click. */
    firstLaneId: string | null;
  };
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

  setSnapTarget(target: SnapTarget | null): void;

  /** Toggle connect-mode on/off. Auto-resets `firstLaneId` on disable. */
  toggleConnectMode(): void;
  /** Force-disable connect mode (e.g. on ESC, after second click commits). */
  exitConnectMode(): void;
  /** Record the first picked lane while in connect mode. */
  setConnectFirstLane(id: string | null): void;
}

type UIStore = UIState & UIActions;

const DEFAULT_LAYER_STATE: LayerState = { visible: true, locked: false };

// Initialize all entity types as visible and unlocked
const defaultLayerStates: Record<string, LayerState> = {};
for (const type of ENTITY_TYPES) {
  defaultLayerStates[type] = { ...DEFAULT_LAYER_STATE };
}

function patchLayer(
  layerStates: Record<string, LayerState>,
  type: string,
  patch: Partial<LayerState>,
): Record<string, LayerState> {
  const cur = layerStates[type] ?? DEFAULT_LAYER_STATE;
  return { ...layerStates, [type]: { ...cur, ...patch } };
}

export const useUIStore = create<UIStore>()((set, get) => ({
  appMode: 'drawing',
  gridEnabled: true,
  snapEnabled: false,
  layerStates: defaultLayerStates,
  cursorLngLat: null,
  currentZoom: 18,
  sidebarVisible: true,
  currentSnapTarget: null,
  connectMode: { active: false, firstLaneId: null },

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
    set((s) => ({ layerStates: patchLayer(s.layerStates, type, { visible }) }));
  },
  setLayerLocked(type, locked) {
    set((s) => ({ layerStates: patchLayer(s.layerStates, type, { locked }) }));
  },
  toggleLayerVisible(type) {
    set((s) => ({
      layerStates: patchLayer(s.layerStates, type, {
        visible: !(s.layerStates[type]?.visible ?? true),
      }),
    }));
  },
  toggleLayerLocked(type) {
    set((s) => ({
      layerStates: patchLayer(s.layerStates, type, {
        locked: !(s.layerStates[type]?.locked ?? false),
      }),
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

  setSnapTarget(target) {
    // Avoid identity churn when nothing is changing — overlay layer
    // subscribes to this and we don't want a render every mousemove.
    const prev = get().currentSnapTarget;
    if (prev === target) return;
    if (
      prev &&
      target &&
      prev.kind === target.kind &&
      prev.entityId === target.entityId &&
      prev.point.x === target.point.x &&
      prev.point.y === target.point.y
    ) {
      return;
    }
    set({ currentSnapTarget: target });
  },

  toggleConnectMode() {
    set((s) => ({
      connectMode: s.connectMode.active
        ? { active: false, firstLaneId: null }
        : { active: true, firstLaneId: null },
    }));
  },
  exitConnectMode() {
    set({ connectMode: { active: false, firstLaneId: null } });
  },
  setConnectFirstLane(id) {
    set((s) => ({ connectMode: { ...s.connectMode, firstLaneId: id } }));
  },
}));
