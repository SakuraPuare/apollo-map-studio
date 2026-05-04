import { create, type StateCreator } from 'zustand';
import type { SnapTarget } from '@/core/geometry/snap';
import type { BoundaryLineType } from '@/types/apollo';

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
  focusEntityRequest: { entityId: string; requestId: number } | null;

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

  // Boundary brush — Word-like border pencil for lane boundary type segments.
  boundaryBrush: {
    active: boolean;
    type: BoundaryLineType;
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
  requestFocusEntity(entityId: string): void;
  clearFocusEntityRequest(requestId: number): void;

  toggleSidebar(): void;

  setSnapTarget(target: SnapTarget | null): void;

  /** Toggle connect-mode on/off. Auto-resets `firstLaneId` on disable. */
  toggleConnectMode(): void;
  /** Force-disable connect mode (e.g. on ESC, after second click commits). */
  exitConnectMode(): void;
  /** Record the first picked lane while in connect mode. */
  setConnectFirstLane(id: string | null): void;

  toggleBoundaryBrush(): void;
  setBoundaryBrushType(type: BoundaryLineType): void;
  exitBoundaryBrush(): void;
}

type UIStore = UIState & UIActions;
type UISet = Parameters<StateCreator<UIStore>>[0];
type UIGet = Parameters<StateCreator<UIStore>>[1];

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

const initialUIState: UIState = {
  appMode: 'drawing',
  gridEnabled: true,
  snapEnabled: false,
  layerStates: defaultLayerStates,
  cursorLngLat: null,
  currentZoom: 18,
  focusEntityRequest: null,
  sidebarVisible: true,
  currentSnapTarget: null,
  connectMode: { active: false, firstLaneId: null },
  boundaryBrush: { active: false, type: 'SOLID_WHITE' },
};

function sameSnapTarget(prev: SnapTarget | null, target: SnapTarget | null): boolean {
  return (
    prev === target ||
    Boolean(
      prev &&
      target &&
      prev.kind === target.kind &&
      prev.entityId === target.entityId &&
      prev.point.x === target.point.x &&
      prev.point.y === target.point.y,
    )
  );
}

type CoreUIActions = Omit<
  UIActions,
  'toggleBoundaryBrush' | 'setBoundaryBrushType' | 'exitBoundaryBrush'
>;

function createUIActions(set: UISet, get: UIGet): CoreUIActions {
  const viewportActions = createViewportActions(set);

  return {
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
      const prev = get().currentSnapTarget;
      if (sameSnapTarget(prev, target)) return;
      set({ currentSnapTarget: target });
    },

    toggleConnectMode() {
      set((s) => ({
        connectMode: s.connectMode.active
          ? { active: false, firstLaneId: null }
          : { active: true, firstLaneId: null },
        boundaryBrush: { ...s.boundaryBrush, active: false },
      }));
    },
    exitConnectMode() {
      set({ connectMode: { active: false, firstLaneId: null } });
    },
    setConnectFirstLane(id) {
      set((s) => ({ connectMode: { ...s.connectMode, firstLaneId: id } }));
    },
    ...viewportActions,
  };
}

function createViewportActions(
  set: UISet,
): Pick<UIActions, 'requestFocusEntity' | 'clearFocusEntityRequest'> {
  return {
    requestFocusEntity(entityId) {
      set((s) => ({
        focusEntityRequest: {
          entityId,
          requestId: (s.focusEntityRequest?.requestId ?? 0) + 1,
        },
      }));
    },
    clearFocusEntityRequest(requestId) {
      set((s) =>
        s.focusEntityRequest?.requestId === requestId ? { focusEntityRequest: null } : {},
      );
    },
  };
}

function createBoundaryBrushActions(
  set: UISet,
): Pick<UIActions, 'toggleBoundaryBrush' | 'setBoundaryBrushType' | 'exitBoundaryBrush'> {
  return {
    toggleBoundaryBrush() {
      set((s) => ({
        boundaryBrush: { ...s.boundaryBrush, active: !s.boundaryBrush.active },
        connectMode: { active: false, firstLaneId: null },
      }));
    },
    setBoundaryBrushType(type) {
      set({ boundaryBrush: { active: true, type } });
    },
    exitBoundaryBrush() {
      set((s) => ({ boundaryBrush: { ...s.boundaryBrush, active: false } }));
    },
  };
}

export const useUIStore = create<UIStore>()((set, get) => ({
  ...initialUIState,
  ...createUIActions(set, get),
  ...createBoundaryBrushActions(set),
}));
