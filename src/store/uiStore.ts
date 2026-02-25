import { create } from 'zustand'
import type { DrawMode } from '../types/editor'

interface UIState {
  drawMode: DrawMode
  selectedIds: string[]
  hoveredId: string | null
  showNewProjectDialog: boolean
  showExportDialog: boolean
  showImportDialog: boolean
  showValidationDialog: boolean
  showElementListPanel: boolean
  connectFromId: string | null // first lane selected for connection
  layerVisibility: Record<string, boolean>
  statusMessage: string
  fitBoundsCounter: number
  flyToTarget: { lng: number; lat: number } | null
  flyToCounter: number

  setDrawMode: (mode: DrawMode) => void
  setSelected: (ids: string[]) => void
  addSelected: (id: string) => void
  clearSelected: () => void
  setHovered: (id: string | null) => void
  setShowNewProjectDialog: (show: boolean) => void
  setShowExportDialog: (show: boolean) => void
  setShowImportDialog: (show: boolean) => void
  setShowValidationDialog: (show: boolean) => void
  setShowElementListPanel: (show: boolean) => void
  setConnectFromId: (id: string | null) => void
  toggleLayer: (layerId: string) => void
  setLayerVisible: (layerId: string, visible: boolean) => void
  setStatus: (msg: string) => void
  requestFitBounds: () => void
  requestFlyTo: (lng: number, lat: number) => void
}

export const useUIStore = create<UIState>((set) => ({
  drawMode: 'select',
  selectedIds: [],
  hoveredId: null,
  showNewProjectDialog: true,
  showExportDialog: false,
  showImportDialog: false,
  showValidationDialog: false,
  showElementListPanel: true,
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
  statusMessage: 'Ready',
  fitBoundsCounter: 0,
  flyToTarget: null,
  flyToCounter: 0,

  setDrawMode: (mode) => set({ drawMode: mode, connectFromId: null }),
  setSelected: (ids) => set({ selectedIds: ids }),
  addSelected: (id) => set((s) => ({ selectedIds: [...s.selectedIds, id] })),
  clearSelected: () => set({ selectedIds: [] }),
  setHovered: (id) => set({ hoveredId: id }),
  setShowNewProjectDialog: (show) => set({ showNewProjectDialog: show }),
  setShowExportDialog: (show) => set({ showExportDialog: show }),
  setShowImportDialog: (show) => set({ showImportDialog: show }),
  setShowValidationDialog: (show) => set({ showValidationDialog: show }),
  setShowElementListPanel: (show) => set({ showElementListPanel: show }),
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
}))
