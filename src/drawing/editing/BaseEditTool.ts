import type maplibregl from 'maplibre-gl'
import type { MapInstance } from '../primitives/types'

const PREVIEW_SOURCE = 'drawing-preview'
const PREVIEW_POINTS_SOURCE = 'drawing-preview-points'

/**
 * Abstract base class for element editing tools.
 * Mirrors BasePrimitiveTool's event-binding and preview-layer patterns
 * but has a different lifecycle (activate/deactivate are driven by selection).
 */
export abstract class BaseEditTool {
  protected map: MapInstance
  private boundHandlers: Array<{
    type: string
    handler: (...args: unknown[]) => void
  }> = []

  constructor(map: MapInstance) {
    this.map = map
  }

  abstract activate(): void

  deactivate(): void {
    for (const { type, handler } of this.boundHandlers) {
      if (type === '__key__') {
        ;(handler as () => void)()
      } else {
        this.map.off(type as keyof maplibregl.MapEventType, handler as never)
      }
    }
    this.boundHandlers = []
    this.clearPreview()
    this.map.getCanvas().style.cursor = ''
  }

  /**
   * Hit-test handles at the given screen point.
   * Returns the handle index (>= 0) if hit, or -1 if no handle is near.
   */
  abstract hitTestHandle(screenPoint: { x: number; y: number }): number

  protected bindMap<T extends keyof maplibregl.MapEventType>(
    type: T,
    handler: (e: maplibregl.MapEventType[T]) => void
  ): void {
    this.map.on(type, handler as never)
    this.boundHandlers.push({ type, handler: handler as (...args: unknown[]) => void })
  }

  protected bindKey(handler: (e: KeyboardEvent) => void): void {
    const canvas = this.map.getCanvas()
    canvas.addEventListener('keydown', handler)
    const cleanup = () => canvas.removeEventListener('keydown', handler)
    this.boundHandlers.push({
      type: '__key__',
      handler: cleanup as (...args: unknown[]) => void,
    })
  }

  protected updatePreview(features: GeoJSON.Feature[], pointFeatures?: GeoJSON.Feature[]): void {
    const source = this.map.getSource(PREVIEW_SOURCE) as maplibregl.GeoJSONSource | undefined
    if (source) {
      source.setData({ type: 'FeatureCollection', features })
    }
    const pointSource = this.map.getSource(PREVIEW_POINTS_SOURCE) as
      | maplibregl.GeoJSONSource
      | undefined
    if (pointSource) {
      pointSource.setData({
        type: 'FeatureCollection',
        features: pointFeatures ?? [],
      })
    }
  }

  protected clearPreview(): void {
    this.updatePreview([], [])
  }

  protected setCursor(cursor: string): void {
    this.map.getCanvas().style.cursor = cursor
  }

  /**
   * Helper: test if a screen point is within `threshold` pixels of a geo coordinate.
   */
  protected isNearScreenPoint(
    screenPoint: { x: number; y: number },
    lngLat: [number, number],
    threshold = 10
  ): boolean {
    const projected = this.map.project(lngLat)
    const dx = screenPoint.x - projected.x
    const dy = screenPoint.y - projected.y
    return dx * dx + dy * dy <= threshold * threshold
  }
}
