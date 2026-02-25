import type maplibregl from 'maplibre-gl'
import type { MapInstance, OnCompleteCallback, OnCancelCallback, PrimitiveTool } from './types'

const PREVIEW_SOURCE = 'drawing-preview'
const PREVIEW_POINTS_SOURCE = 'drawing-preview-points'

/**
 * Abstract base class for all primitive drawing tools.
 * Manages MapLibre event binding and a shared preview GeoJSON source.
 */
export abstract class BasePrimitiveTool {
  protected map: MapInstance
  protected onComplete: OnCompleteCallback
  protected onCancel: OnCancelCallback
  private boundHandlers: Array<{
    type: string
    handler: (...args: unknown[]) => void
  }> = []

  abstract readonly toolType: PrimitiveTool

  constructor(map: MapInstance, onComplete: OnCompleteCallback, onCancel: OnCancelCallback) {
    this.map = map
    this.onComplete = onComplete
    this.onCancel = onCancel
  }

  /** Activate the tool: bind event handlers, set cursor, init preview */
  abstract activate(): void

  /** Deactivate: unbind all event handlers, clear preview, reset cursor */
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

  /** Bind a map event handler that will be auto-unbound on deactivate */
  protected bindMap<T extends keyof maplibregl.MapEventType>(
    type: T,
    handler: (e: maplibregl.MapEventType[T]) => void
  ): void {
    this.map.on(type, handler as never)
    this.boundHandlers.push({ type, handler: handler as (...args: unknown[]) => void })
  }

  /** Bind a keyboard event on the map canvas, auto-unbound on deactivate */
  protected bindKey(handler: (e: KeyboardEvent) => void): void {
    const canvas = this.map.getCanvas()
    canvas.addEventListener('keydown', handler)
    const cleanup = () => canvas.removeEventListener('keydown', handler)
    this.boundHandlers.push({
      type: '__key__',
      handler: cleanup as (...args: unknown[]) => void,
    })
  }

  /** Update the preview layers with new geometry */
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

  /** Clear all preview geometry */
  protected clearPreview(): void {
    this.updatePreview([], [])
  }

  /** Set the map cursor style */
  protected setCursor(cursor: string): void {
    this.map.getCanvas().style.cursor = cursor
  }
}

/**
 * Ensure the preview sources and layers exist on the map.
 * Call once during MapEditor initialization (inside map 'load' handler).
 */
export function addDrawingPreviewLayers(map: MapInstance): void {
  if (!map.getSource(PREVIEW_SOURCE)) {
    map.addSource(PREVIEW_SOURCE, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    })
  }

  if (!map.getSource(PREVIEW_POINTS_SOURCE)) {
    map.addSource(PREVIEW_POINTS_SOURCE, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    })
  }

  if (!map.getLayer('drawing-preview-line')) {
    map.addLayer({
      id: 'drawing-preview-line',
      type: 'line',
      source: PREVIEW_SOURCE,
      filter: ['any', ['==', '$type', 'LineString'], ['==', '$type', 'Polygon']],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#3b82f6',
        'line-dasharray': [
          'case',
          ['boolean', ['get', 'dashed'], false],
          ['literal', [4, 4]],
          ['literal', [1, 0]],
        ],
        'line-width': 2,
      },
    })
  }

  if (!map.getLayer('drawing-preview-fill')) {
    map.addLayer(
      {
        id: 'drawing-preview-fill',
        type: 'fill',
        source: PREVIEW_SOURCE,
        filter: ['==', '$type', 'Polygon'],
        paint: { 'fill-color': '#3b82f6', 'fill-opacity': 0.1 },
      },
      'drawing-preview-line'
    )
  }

  if (!map.getLayer('drawing-preview-points')) {
    map.addLayer({
      id: 'drawing-preview-points',
      type: 'circle',
      source: PREVIEW_POINTS_SOURCE,
      paint: {
        'circle-radius': ['case', ['boolean', ['get', 'isHandle'], false], 5, 4],
        'circle-color': ['case', ['boolean', ['get', 'isHandle'], false], '#fff', '#3b82f6'],
        'circle-stroke-color': '#3b82f6',
        'circle-stroke-width': 2,
      },
    })
  }
}
