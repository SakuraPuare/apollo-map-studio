import { create } from 'zustand'
import type { DrawIntent, ToolState } from '../types/editor'
import { ShapeType, ElementType, getDefaultElementForShape } from '../types/shapes'

/** Map ToolState → MapboxDraw mode string */
export function toolStateToDrawMode(ts: ToolState): string {
  if (ts.kind === 'select') return 'simple_select'
  if (ts.kind === 'connect_lanes') return 'simple_select'
  if (ts.kind === 'edit_bezier') return 'edit_bezier'
  const shapeToMode: Record<ShapeType, string> = {
    [ShapeType.Point]: 'draw_point',
    [ShapeType.Polyline]: 'draw_line_string',
    [ShapeType.RotatableRect]: 'draw_rotatable_rect',
    [ShapeType.Polygon]: 'draw_polygon',
    [ShapeType.Curve]: 'draw_bezier',
  }
  return shapeToMode[ts.intent.shape]
}

interface UIState {
  toolState: ToolState
  lastElementPerShape: Partial<Record<ShapeType, ElementType>>
  selectedIds: string[]
  hoveredId: string | null
  showNewProjectDialog: boolean
  showExportDialog: boolean
  showImportDialog: boolean
  showValidationDialog: boolean
  showElementListPanel: boolean
  showPropertiesPanel: boolean
  connectFromId: string | null
  layerVisibility: Record<string, boolean>
  statusMessage: string
  fitBoundsCounter: number
  flyToTarget: { lng: number; lat: number } | null
  flyToCounter: number
  pendingImportFile: File | null
  /** 0-1 while async render is in progress; null when idle. */
  renderProgress: number | null

  setToolState: (state: ToolState) => void
  startDrawing: (intent: DrawIntent) => void
  selectShape: (shape: ShapeType) => void
  setSelected: (ids: string[]) => void
  addSelected: (id: string) => void
  clearSelected: () => void
  setHovered: (id: string | null) => void
  setShowNewProjectDialog: (show: boolean) => void
  setShowExportDialog: (show: boolean) => void
  setShowImportDialog: (show: boolean) => void
  setPendingImportFile: (file: File | null) => void
  setShowValidationDialog: (show: boolean) => void
  setShowElementListPanel: (show: boolean) => void
  setShowPropertiesPanel: (show: boolean) => void
  setConnectFromId: (id: string | null) => void
  toggleLayer: (layerId: string) => void
  setLayerVisible: (layerId: string, visible: boolean) => void
  setStatus: (msg: string) => void
  requestFitBounds: () => void
  requestFlyTo: (lng: number, lat: number) => void
  setRenderProgress: (progress: number | null) => void
}

export const useUIStore = create<UIState>((set) => ({
  toolState: { kind: 'select' },
  lastElementPerShape: {
    [ShapeType.Polyline]: ElementType.Lane,
    [ShapeType.RotatableRect]: ElementType.Crosswalk,
    [ShapeType.Polygon]: ElementType.Junction,
    [ShapeType.Curve]: ElementType.Lane,
  },
  selectedIds: [],
  hoveredId: null,
  showNewProjectDialog: true,
  showExportDialog: false,
  showImportDialog: false,
  showValidationDialog: false,
  showElementListPanel: true,
  showPropertiesPanel: true,
  connectFromId: null,
  layerVisibility: {
    lanes: true,
    boundaries: true,
    junctions: true,
    signals: true,
    crosswalks: true,
    stopSigns: true,
    clearAreas: true,
    speedBumps: true,
    parkingSpaces: true,
    connections: true,
  },
  statusMessage: '',
  fitBoundsCounter: 0,
  flyToTarget: null,
  flyToCounter: 0,
  pendingImportFile: null,
  renderProgress: null,

  setToolState: (state) => set({ toolState: state, connectFromId: null }),

  startDrawing: (intent) =>
    set((s) => ({
      toolState: { kind: 'draw', intent },
      connectFromId: null,
      lastElementPerShape: {
        ...s.lastElementPerShape,
        [intent.shape]: intent.elementType,
      },
    })),

  selectShape: (shape) =>
    set((s) => {
      const elementType = s.lastElementPerShape[shape] ?? getDefaultElementForShape(shape)
      return {
        toolState: { kind: 'draw', intent: { shape, elementType } },
        connectFromId: null,
      }
    }),

  setSelected: (ids) => set({ selectedIds: ids }),
  addSelected: (id) => set((s) => ({ selectedIds: [...s.selectedIds, id] })),
  clearSelected: () => set({ selectedIds: [] }),
  setHovered: (id) => set({ hoveredId: id }),
  setShowNewProjectDialog: (show) => set({ showNewProjectDialog: show }),
  setShowExportDialog: (show) => set({ showExportDialog: show }),
  setShowImportDialog: (show) =>
    set({ showImportDialog: show, ...(!show && { pendingImportFile: null }) }),
  setPendingImportFile: (file) => set({ pendingImportFile: file }),
  setShowValidationDialog: (show) => set({ showValidationDialog: show }),
  setShowElementListPanel: (show) => set({ showElementListPanel: show }),
  setShowPropertiesPanel: (show) => set({ showPropertiesPanel: show }),
  setConnectFromId: (id) => set({ connectFromId: id }),
  toggleLayer: (layerId) =>
    set((s) => ({
      layerVisibility: {
        ...s.layerVisibility,
        [layerId]: !s.layerVisibility[layerId],
      },
    })),
  setLayerVisible: (layerId, visible) =>
    set((s) => ({
      layerVisibility: { ...s.layerVisibility, [layerId]: visible },
    })),
  setStatus: (msg) => set({ statusMessage: msg }),
  requestFitBounds: () => set((s) => ({ fitBoundsCounter: s.fitBoundsCounter + 1 })),
  requestFlyTo: (lng, lat) =>
    set((s) => ({ flyToTarget: { lng, lat }, flyToCounter: s.flyToCounter + 1 })),
  setRenderProgress: (progress) => set({ renderProgress: progress }),
}))
