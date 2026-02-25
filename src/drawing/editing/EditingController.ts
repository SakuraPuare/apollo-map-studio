import type { MapInstance, ToolMeta } from '../primitives/types'
import type { MapElement } from '../../types/editor'
import { useUIStore } from '../../store/uiStore'
import { useMapStore } from '../../store/mapStore'
import { BaseEditTool } from './BaseEditTool'
import { RotatableRectEditTool } from './RotatableRectEditTool'
import { BezierEditTool } from './BezierEditTool'
import { detectRotatableRect } from '../metadata/geometryDetector'
import type { Feature, Polygon } from 'geojson'

/**
 * Selection-driven editing controller.
 * Subscribes to useUIStore.selectedIds and activates the appropriate
 * editing tool when a single editable element is selected.
 */
export class EditingController {
  private map: MapInstance
  private activeTool: BaseEditTool | null = null
  private activeElementId: string | null = null
  private unsubscribe: (() => void) | null = null

  constructor(map: MapInstance) {
    this.map = map

    this.unsubscribe = useUIStore.subscribe((state, prevState) => {
      if (state.selectedIds !== prevState.selectedIds || state.drawMode !== prevState.drawMode) {
        this.onSelectionChanged(state.selectedIds, state.drawMode)
      }
    })

    // Check initial state
    const { selectedIds, drawMode } = useUIStore.getState()
    this.onSelectionChanged(selectedIds, drawMode)
  }

  destroy(): void {
    this.deactivateCurrentTool()
    this.unsubscribe?.()
    this.unsubscribe = null
  }

  isHandleHit(screenPoint: { x: number; y: number }): boolean {
    return (this.activeTool?.hitTestHandle(screenPoint) ?? -1) >= 0
  }

  private onSelectionChanged(selectedIds: string[], drawMode: string): void {
    // Only activate in select mode with exactly one element
    if (drawMode !== 'select' || selectedIds.length !== 1) {
      this.deactivateCurrentTool()
      return
    }

    const elementId = selectedIds[0]

    // Don't re-activate for the same element
    if (elementId === this.activeElementId && this.activeTool) return

    this.deactivateCurrentTool()

    const element = this.findElement(elementId)
    if (!element) return

    const meta = this.extractToolMeta(element)
    if (!meta) return

    if (meta.tool === 'rotatable_rect') {
      const tool = new RotatableRectEditTool(this.map)
      tool.init(element, meta)
      tool.activate()
      this.activeTool = tool
      this.activeElementId = elementId
    } else if (meta.tool === 'bezier') {
      const tool = new BezierEditTool(this.map)
      tool.init(element, meta)
      tool.activate()
      this.activeTool = tool
      this.activeElementId = elementId
    }
  }

  private deactivateCurrentTool(): void {
    if (this.activeTool) {
      this.activeTool.deactivate()
      this.activeTool = null
      this.activeElementId = null
    }
  }

  private findElement(id: string): MapElement | null {
    const state = useMapStore.getState()
    return (
      state.lanes[id] ??
      state.junctions[id] ??
      state.crosswalks[id] ??
      state.signals[id] ??
      state.stopSigns[id] ??
      state.clearAreas[id] ??
      state.speedBumps[id] ??
      state.parkingSpaces[id] ??
      null
    )
  }

  private extractToolMeta(element: MapElement): ToolMeta | null {
    // Try to get _toolMeta from the element's geometry feature
    const feature = this.getGeometryFeature(element)
    if (!feature) return null

    const meta = feature.properties?._toolMeta as ToolMeta | undefined
    if (meta) return meta

    // Fallback: heuristic detection for polygons
    if (feature.geometry.type === 'Polygon') {
      return detectRotatableRect(feature as Feature<Polygon>)
    }

    return null
  }

  private getGeometryFeature(element: MapElement): GeoJSON.Feature | null {
    switch (element.type) {
      case 'lane':
        return element.centerLine
      case 'junction':
      case 'crosswalk':
      case 'clear_area':
      case 'parking_space':
        return element.polygon
      case 'signal':
        return element.stopLine
      case 'stop_sign':
        return element.stopLine
      case 'speed_bump':
        return element.line
    }
  }
}
