import { BasePrimitiveTool } from './BasePrimitiveTool'
import type { PrimitiveTool } from './types'

/**
 * Multi-point polyline drawing tool.
 * Click to add vertices, double-click or Enter to finish.
 */
export class LineTool extends BasePrimitiveTool {
  readonly toolType: PrimitiveTool = 'line'
  private vertices: [number, number][] = []
  private cursorPos: [number, number] | null = null

  activate(): void {
    this.vertices = []
    this.cursorPos = null
    this.setCursor('crosshair')

    this.bindMap('click', (e) => {
      this.vertices.push([e.lngLat.lng, e.lngLat.lat])
      this.renderPreview()
    })

    this.bindMap('dblclick', (e) => {
      e.preventDefault()
      // Browsers fire two click events before dblclick; finish() will collapse duplicate tail points.
      this.finish()
    })

    this.bindMap('mousemove', (e) => {
      this.cursorPos = [e.lngLat.lng, e.lngLat.lat]
      this.renderPreview()
    })

    this.bindKey((e) => {
      if (e.key === 'Escape') {
        if (this.vertices.length === 0) {
          this.onCancel()
        } else {
          // Remove last vertex
          this.vertices.pop()
          this.renderPreview()
        }
      } else if (e.key === 'Enter') {
        this.finish()
      }
    })
  }

  private finish(): void {
    const cleaned: [number, number][] = []
    for (const v of this.vertices) {
      const prev = cleaned[cleaned.length - 1]
      if (!prev) {
        cleaned.push(v)
        continue
      }
      const a = this.map.project(prev)
      const b = this.map.project(v)
      // Drop zero/near-zero segments (e.g. duplicate point introduced by dblclick).
      if (Math.hypot(b.x - a.x, b.y - a.y) >= 1) cleaned.push(v)
    }

    if (cleaned.length < 2) return
    this.onComplete({
      tool: 'line',
      geometry: { type: 'LineString', coordinates: cleaned },
      meta: { tool: 'line' },
    })
  }

  private renderPreview(): void {
    const features: GeoJSON.Feature[] = []
    const pointFeatures: GeoJSON.Feature[] = []

    // Confirmed segments
    if (this.vertices.length >= 2) {
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: this.vertices },
        properties: {},
      })
    }

    // Rubber-band line from last vertex to cursor
    if (this.vertices.length >= 1 && this.cursorPos) {
      features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [this.vertices[this.vertices.length - 1], this.cursorPos],
        },
        properties: { dashed: true },
      })
    }

    // Vertex points
    for (const v of this.vertices) {
      pointFeatures.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: v },
        properties: {},
      })
    }

    // Cursor point
    if (this.cursorPos) {
      pointFeatures.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: this.cursorPos },
        properties: { isHandle: true },
      })
    }

    this.updatePreview(features, pointFeatures)
  }
}
